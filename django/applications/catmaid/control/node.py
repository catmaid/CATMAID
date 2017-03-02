import json

from collections import defaultdict

from django.core.serializers.json import DjangoJSONEncoder
from django.conf import settings
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view

from catmaid import state
from catmaid.models import UserRole, Treenode, \
        ClassInstanceClassInstance, Review
from catmaid.control.authentication import requires_user_role, \
        can_edit_all_or_fail
from catmaid.control.common import get_relation_to_id_map, get_request_list


def split_and_filter_id_rows(rows, part_2_start, total_len):
    # A list of tuples, each tuple containing the selected columns for each node
    # The id is the first element of each tuple
    nodes = []
    # A set of unique node IDs
    node_ids = set()

    for row in rows:
        t1id = row[0]
        if t1id not in node_ids:
            node_ids.add(t1id)
            nodes.append(row[0:part_2_start])
        t2id = row[part_2_start]
        if t2id and t2id not in node_ids:
            node_ids.add(t2id)
            nodes.append(row[part_2_start:total_len])

    return node_ids, nodes

class Postgis3dNodeProvider(object):

    # Fetch treenodes with the help of two PostGIS filters: The &&& operator
    # to exclude all edges that don't have a bounding box that intersect with
    # the query bounding box. This leads to false positives, because edge
    # bounding boxes can intersect without the edge actually intersecting. To
    # limit the result set, ST_3DDWithin is used. It allows to limit the result
    # set by a distance to another geometry. Here it only allows edges that are
    # no farther away than half the height of the query bounding box from a
    # plane that cuts the query bounding box in half in Z. There are still false
    # positives, but much fewer. Even though ST_3DDWithin is used, it seems to
    # be enough to have a n-d index available (the query plan says ST_3DDWithin
    # wouldn't use a 2-d index in this query, even if present).
    treenode_query = '''
        SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id,
            t2.id,
            t2.parent_id,
            t2.location_x,
            t2.location_y,
            t2.location_z,
            t2.confidence,
            t2.radius,
            t2.skeleton_id,
            EXTRACT(EPOCH FROM t2.edition_time),
            t2.user_id
        FROM
          (SELECT te.id
             FROM treenode_edge te
             WHERE te.edge &&& ST_MakeLine(ARRAY[
                 ST_MakePoint({left}, {bottom}, {z2}),
                 ST_MakePoint({right}, {top}, {z1})] ::geometry[])
             AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                 ST_MakePoint({left},  {top},    {halfz}),
                 ST_MakePoint({right}, {top},    {halfz}),
                 ST_MakePoint({right}, {bottom}, {halfz}),
                 ST_MakePoint({left},  {bottom}, {halfz}),
                 ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                 {halfzdiff})
             AND te.project_id = {project_id}
          ) edges(edge_child_id)
        JOIN treenode t1 ON edge_child_id = t1.id
        LEFT JOIN treenode t2 ON t2.id = t1.parent_id
        LIMIT {limit}
    '''

    connector_query = '''
      SELECT
          c.id,
          c.location_x,
          c.location_y,
          c.location_z,
          c.confidence,
          EXTRACT(EPOCH FROM c.edition_time),
          c.user_id,
          tc.treenode_id,
          tc.relation_id,
          tc.confidence,
          EXTRACT(EPOCH FROM tc.edition_time),
          tc.id
      FROM (SELECT tce.id AS tce_id
            FROM treenode_connector_edge tce
            WHERE tce.edge &&& ST_MakeLine(ARRAY[
                ST_MakePoint({left}, {bottom}, {z2}),
                ST_MakePoint({right}, {top}, {z1})] ::geometry[])
            AND ST_3DDWithin(tce.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                ST_MakePoint({left},  {top},    {halfz}),
                ST_MakePoint({right}, {top},    {halfz}),
                ST_MakePoint({right}, {bottom}, {halfz}),
                ST_MakePoint({left},  {bottom}, {halfz}),
                ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                {halfzdiff})
            AND tce.project_id = {project_id}
        ) edges(edge_tc_id)
      JOIN treenode_connector tc
        ON (tc.id = edge_tc_id)
      JOIN connector c
        ON (c.id = tc.connector_id)

      UNION

      SELECT
          c.id,
          c.location_x,
          c.location_y,
          c.location_z,
          c.confidence,
          EXTRACT(EPOCH FROM c.edition_time),
          c.user_id,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
      FROM (SELECT cg.id AS cg_id
           FROM connector_geom cg
           WHERE cg.geom &&& ST_MakeLine(ARRAY[
               ST_MakePoint({left}, {bottom}, {z2}),
               ST_MakePoint({right}, {top}, {z1})] ::geometry[])
           AND ST_3DDWithin(cg.geom, ST_MakePolygon(ST_MakeLine(ARRAY[
               ST_MakePoint({left},  {top},    {halfz}),
               ST_MakePoint({right}, {top},    {halfz}),
               ST_MakePoint({right}, {bottom}, {halfz}),
               ST_MakePoint({left},  {bottom}, {halfz}),
               ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
               {halfzdiff})
           AND cg.project_id = {project_id}
          UNION SELECT UNNEST({sanitized_connector_ids}::bigint[])
        ) geoms(geom_connector_id)
      JOIN connector c
        ON (geom_connector_id = c.id)
      LIMIT {limit}
    '''

    # To execute the queries directly through PsycoPg (i.e. not prepared) a
    # different parameter formatt is used: {left} -> %(left)s.
    treenode_query_params = ['project_id', 'left', 'top', 'z1', 'right',
        'bottom', 'z2', 'halfz', 'halfzdiff', 'limit']
    treenode_query_psycopg = treenode_query.format(
        **{k:'%({})s'.format(k) for k in treenode_query_params})

    connector_query_params = ['project_id', 'left', 'top', 'z1', 'right',
        'bottom', 'z2', 'halfz', 'halfzdiff', 'limit', 'sanitized_connector_ids']
    connector_query_psycopg = connector_query.format(
        **{k:'%({})s'.format(k) for k in connector_query_params})

    # Create prepared statement version
    prepare_var_names = {
        'project_id': '$1',
        'left': '$2',
        'top': '$3',
        'z1': '$4',
        'right': '$5',
        'bottom': '$6',
        'z2': '$7',
        'halfz': '$8',
        'halfzdiff': '$9',
        'limit': '$10',
        'sanitized_connector_ids': '$11'
    }
    treenode_query_prepare = treenode_query.format(**prepare_var_names)
    connector_query_prepare = connector_query.format(**prepare_var_names)

    def prepare_db_statements(self, connection):
        cursor = connection.cursor()
        cursor.execute("""
            -- 1 project id, 2 left, 3 top, 4 z1, 5 right, 6 bottom, 7 z2,
            -- 8 halfz, 9 halfzdiff, 10 limit
            PREPARE get_treenodes_postgis_3d (int, real, real, real,
                    real, real, real, real, real, int) AS
            {}
        """.format(self.treenode_query_prepare))
        cursor.execute("""
            -- 1 project id, 2 left, 3 top, 4 z1, 5 right, 6 bottom, 7 z2,
            -- 8 halfz, 9 halfzdiff, 10 limit, 11 sanitized connector ids
            PREPARE get_connectors_postgis_3d (int, real, real, real,
                    real, real, real, real, real, int, bigint[]) AS
            {}
        """.format(self.connector_query_prepare))

    def get_treenode_data(self, cursor, params):
        """ Selects all treenodes of which links to other treenodes intersect
        with the request bounding box.
        """

        params['halfzdiff'] = abs(params['z2'] - params['z1']) * 0.5
        params['halfz'] = params['z1'] + (params['z2'] - params['z1']) * 0.5

        if settings.PREPARED_STATEMENTS:
            # Use a prepared statement to get the treenodes
            cursor.execute('''
                EXECUTE get_treenodes_postgis_3d(%(project_id)s,
                    %(left)s, %(top)s, %(z1)s, %(right)s, %(bottom)s, %(z2)s,
                    %(halfz)s, %(halfzdiff)s, %(limit)s)
            ''', params)
        else:
            cursor.execute(self.treenode_query_psycopg, params)

        treenode_ids, treenodes = split_and_filter_id_rows(cursor.fetchall(), 10, 20)

        return treenode_ids, treenodes

    def get_connector_data(self, cursor, params, missing_connector_ids):
        """Selects all connectors that are in or have links that intersect the
        bounding box, or that are in missing_connector_ids.
        """
        params['sanitized_connector_ids'] = map(int, missing_connector_ids)

        if settings.PREPARED_STATEMENTS:
            # Use a prepared statement to get connectors
            cursor.execute('''
                EXECUTE get_connectors_postgis_3d(%(project_id)s,
                    %(left)s, %(top)s, %(z1)s, %(right)s, %(bottom)s, %(z2)s,
                    %(halfz)s, %(halfzdiff)s, %(limit)s,
                    %(sanitized_connector_ids)s)
            ''', params)
        else:
            cursor.execute(self.connector_query_psycopg, params)

        return list(cursor.fetchall())


class Postgis2dNodeProvider(object):

    # Fetch treenodes with the help of two PostGIS filters: First, select all
    # edges with a bounding box overlapping the XY-box of the query bounding
    # box. This set is then constrained by a particular range in Z. Both filters
    # are backed by indices that make these operations very fast. This is
    # semantically equivalent with what the &&& does. This, however, leads to
    # false positives, because edge bounding boxes can intersect without the
    # edge actually intersecting. To limit the result set, ST_3DDWithin is used.
    # It allows to limit the result set by a distance to another geometry. Here
    # it only allows edges that are no farther away than half the height of the
    # query bounding box from a plane that cuts the query bounding box in half
    # in Z. There are still false positives, but much fewer. Even though
    # ST_3DDWithin is used, it seems to be enough to have a n-d index available
    # (the query plan says ST_3DDWithin wouldn't use a 2-d index in this query,
    # even if present).
    treenode_query = """
        WITH nodes AS (
          SELECT
            t1.id AS t1_id,
            t1.parent_id AS t1_parent_id,
            t1.location_x AS t1_location_x,
            t1.location_y AS t1_location_y,
            t1.location_z AS t1_location_z,
            t1.confidence AS t1_confidence,
            t1.radius AS t1_radius,
            t1.skeleton_id AS t1_skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time) AS t1_edition_time,
            t1.user_id AS t1_user_id,
            t2.id AS t2_id,
            t2.parent_id AS t2_parent_id,
            t2.location_x AS t2_location_x,
            t2.location_y AS t2_location_y,
            t2.location_z AS t2_location_z,
            t2.confidence AS t2_confidence,
            t2.radius AS t2_radius,
            t2.skeleton_id AS t2_skeleton_id,
            EXTRACT(EPOCH FROM t2.edition_time) AS t2_edition_time,
            t2.user_id AS t2_user_id
          FROM
            (SELECT te.id
               FROM treenode_edge te
               WHERE te.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
                 AND floatrange(ST_ZMin(te.edge),
                    ST_ZMax(te.edge), '[]') && floatrange({z1}, {z2}, '[)')
                 AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                     ST_MakePoint({left},  {top},    {halfz}),
                     ST_MakePoint({right}, {top},    {halfz}),
                     ST_MakePoint({right}, {bottom}, {halfz}),
                     ST_MakePoint({left},  {bottom}, {halfz}),
                     ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                     {halfzdiff})
                 AND te.project_id = {project_id}
            ) edges(edge_child_id)
          JOIN treenode t1 ON edge_child_id = t1.id
          LEFT JOIN treenode t2 ON t2.id = t1.parent_id
        )
        SELECT
          t1_id, t1_parent_id, t1_location_x, t1_location_y, t1_location_z,
          t1_confidence, t1_radius, t1_skeleton_id, t1_edition_time, t1_user_id
        FROM nodes
        UNION
        SELECT
          t2_id, t2_parent_id, t2_location_x, t2_location_y, t2_location_z,
          t2_confidence, t2_radius, t2_skeleton_id, t2_edition_time, t2_user_id
        FROM nodes
        WHERE t2_id IS NOT NULL
        LIMIT {limit};
    """

    connector_query = """
        SELECT
            c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            EXTRACT(EPOCH FROM c.edition_time),
            c.user_id,
            tc.treenode_id,
            tc.relation_id,
            tc.confidence,
            EXTRACT(EPOCH FROM tc.edition_time),
            tc.id
        FROM (SELECT tce.id AS tce_id
             FROM treenode_connector_edge tce
             WHERE tce.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
               AND floatrange(ST_ZMin(tce.edge), ST_ZMax(tce.edge), '[]') &&
                 floatrange({z1}, {z2}, '[)')
               AND ST_3DDWithin(tce.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                   ST_MakePoint({left},  {top},    {halfz}),
                   ST_MakePoint({right}, {top},    {halfz}),
                   ST_MakePoint({right}, {bottom}, {halfz}),
                   ST_MakePoint({left},  {bottom}, {halfz}),
                   ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                   {halfzdiff})
               AND tce.project_id = {project_id}
          ) edges(edge_tc_id)
        JOIN treenode_connector tc
          ON (tc.id = edge_tc_id)
        JOIN connector c
          ON (c.id = tc.connector_id)

        UNION

        SELECT
            c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            EXTRACT(EPOCH FROM c.edition_time),
            c.user_id,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        FROM (SELECT cg.id AS cg_id
             FROM connector_geom cg
             WHERE cg.geom && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
               AND floatrange(ST_ZMin(cg.geom), ST_ZMax(cg.geom), '[]') &&
                 floatrange({z1}, {z2}, '[)')
               AND ST_3DDWithin(cg.geom, ST_MakePolygon(ST_MakeLine(ARRAY[
                   ST_MakePoint({left},  {top},    {halfz}),
                   ST_MakePoint({right}, {top},    {halfz}),
                   ST_MakePoint({right}, {bottom}, {halfz}),
                   ST_MakePoint({left},  {bottom}, {halfz}),
                   ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                   {halfzdiff})
               AND cg.project_id = {project_id}
            UNION SELECT UNNEST({sanitized_connector_ids}::bigint[])
          ) geoms(geom_connector_id)
        JOIN connector c
          ON (geom_connector_id = c.id)
        LIMIT {limit}
    """

    # To execute the query directly with PsycoPg (i.e. not prepared) a different
    # parameter formatt is used: {left} -> %(left)s.
    treenode_query_params = ['project_id', 'left', 'top', 'z1', 'right',
        'bottom', 'z2', 'halfz', 'halfzdiff', 'limit']
    treenode_query_psycopg = treenode_query.format(
        **{k:'%({})s'.format(k) for k in treenode_query_params})


    connector_query_params = ['project_id', 'left', 'top', 'z1', 'right',
        'bottom', 'z2', 'halfz', 'halfzdiff', 'limit', 'sanitized_connector_ids']
    connector_query_psycopg = connector_query.format(
        **{k:'%({})s'.format(k) for k in connector_query_params})

    # Create prepared statement version
    prepare_var_names = {
        'project_id': '$1',
        'left': '$2',
        'top': '$3',
        'z1': '$4',
        'right': '$5',
        'bottom': '$6',
        'z2': '$7',
        'halfz': '$8',
        'halfzdiff': '$9',
        'limit': '$10',
        'sanitized_connector_ids': '$11'
    }
    treenode_query_prepare = treenode_query.format(**prepare_var_names)
    connector_query_prepare = connector_query.format(**prepare_var_names)


    def prepare_db_statements(self, connection):
        """Create prepared statements on a given connection. This is mainly useful
        for long lived connections.
        """
        cursor = connection.cursor()
        cursor.execute("""
            -- 1 project id, 2 left, 3 top, 4 z1, 5 right, 6 bottom, 7 z2,
            -- 8 halfz, 9 halfzdiff, 10 limit
            PREPARE get_treenodes_postgis_2d (int, real, real, real,
                    real, real, real, real, real, int) AS
            {}
        """.format(self.treenode_query_prepare))
        cursor.execute("""
            -- 1 project id, 2 left, 3 top, 4 z1, 5 right, 6 bottom, 7 z2,
            -- 8 halfz, 9 halfzdiff, 10 limit, 11 sanitized connector ids
            PREPARE get_connectors_postgis_2d (int, real, real, real,
                    real, real, real, real, real, int, bigint[]) AS
            {}
        """.format(self.connector_query_prepare))

    def get_treenode_data(self, cursor, params):
        """ Selects all treenodes of which links to other treenodes intersect with
        the request bounding box.
        """
        params['halfzdiff'] = abs(params['z2'] - params['z1']) * 0.5
        params['halfz'] = params['z1'] + (params['z2'] - params['z1']) * 0.5

        if settings.PREPARED_STATEMENTS:
            # Use a prepared statement to get the treenodes
            cursor.execute('''
                EXECUTE get_treenodes_postgis_2d(%(project_id)s,
                    %(left)s, %(top)s, %(z1)s, %(right)s, %(bottom)s, %(z2)s,
                    %(halfz)s, %(halfzdiff)s, %(limit)s)
            ''', params)
        else:
            cursor.execute(self.treenode_query_psycopg, params)

        treenodes = cursor.fetchall()
        treenode_ids = [t[0] for t in treenodes]

        return treenode_ids, treenodes

    def get_connector_data(self, cursor, params, missing_connector_ids):
        """Selects all connectors that are in or have links that intersect the
        bounding box, or that are in missing_connector_ids.
        """
        params['sanitized_connector_ids'] = map(int, missing_connector_ids)

        if settings.PREPARED_STATEMENTS:
            # Use a prepared statement to get connectors
            cursor.execute('''
                EXECUTE get_connectors_postgis_2d(%(project_id)s,
                    %(left)s, %(top)s, %(z1)s, %(right)s, %(bottom)s, %(z2)s,
                    %(halfz)s, %(halfzdiff)s, %(limit)s,
                    %(sanitized_connector_ids)s)
            ''', params)
        else:
            cursor.execute(self.connector_query_psycopg, params)

        return list(cursor.fetchall())


def get_provider():
    provider_key = settings.NODE_PROVIDER
    if 'postgis3d' == provider_key:
        return Postgis3dNodeProvider()
    elif 'postgis2d' == provider_key:
        return Postgis2dNodeProvider()
    else:
        raise ValueError('Unknown node provider: ' + provider_key)

def prepare_db_statements(connection):
    get_provider().prepare_db_statements(connection)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_list_tuples(request, project_id=None, provider=None):
    '''Retrieve all nodes intersecting a bounding box

    The intersection bounding box is defined in terms of its minimum and
    maximum project space coordinates. The number of returned nodes can be
    limited to constrain query execution time. Optionally, lists of treenodes
    and connector IDs can be provided to make sure they are included in the
    result set, regardless of intersection.

    Returned is an array with four entries:

    [[treenodes], [connectors], {labels}, node_limit_reached, {relation_map}]

    The list of treenodes has elements of this form:

    [id, parent_id, location_x, location_y, location_z, confidence, radius, skeleton_id, edition_time, user_id]

    The list connectors has elements of this form:

    [id, location_x, location_y, location_z, confidence, edition_time, user_id, [partners]]

    The partners arrary represents linked partner nodes, each one represented like this:

    [treenode_id, relation_id, link_confidence, link_edition_time, link_id]

    If labels are returned, they are represented as an object of the following
    form, with the labels just being simple strings:

    {treenode_id: [labels]}

    The fourth top level entry, node_limit_reached, is a boolean that
    represents if there are more nodes available than the ones returned.

    With the last top level element returned the present connector linked
    relations are mapped to their textural representations:

    {relation_id: relation_name}
    ---
    parameters:
    - name: treenode_ids
      description: |
        Whether linked connectors should be returned.
      required: false
      type: array
      items:
        type: integer
      paramType: form
    - name: connector_ids
      description: |
        Whether tags should be returned.
      required: false
      type: array
      items:
        type: integer
      paramType: form
    - name: limit
      description: |
        Limit the number of returned nodes.
      required: false
      type: integer
      defaultValue: 3500
      paramType: form
    - name: left
      description: |
        Minimum world space X coordinate
      required: true
      type: float
      paramType: form
    - name: top
      description: |
        Minimum world space Y coordinate
      required: true
      type: float
      paramType: form
    - name: z1
      description: |
        Minimum world space Z coordinate
      required: true
      type: float
      paramType: form
    - name: right
      description: |
        Maximum world space X coordinate
      required: true
      type: float
      paramType: form
    - name: bottom
      description: |
        Maximum world space Y coordinate
      required: true
      type: float
      paramType: form
    - name: z2
      description: |
        Maximum world space Z coordinate
      required: true
      type: float
      paramType: form
    type:
    - type: array
      items:
        type: string
      required: true
    '''
    project_id = int(project_id) # sanitize
    params = {}

    treenode_ids = get_request_list(request.POST, 'treenode_ids', map_fn=int)
    connector_ids = get_request_list(request.POST, 'connector_ids', map_fn=int)
    for p in ('top', 'left', 'bottom', 'right', 'z1', 'z2'):
        params[p] = float(request.POST.get(p, 0))
    # Limit the number of retrieved treenodes within the section
    params['limit'] = settings.NODE_LIST_MAXIMUM_COUNT
    params['project_id'] = project_id
    include_labels = (request.POST.get('labels', None) == 'true')

    return node_list_tuples_query(params, project_id, treenode_ids, connector_ids,
                                  include_labels, get_provider())


def node_list_tuples_query(params, project_id, explicit_treenode_ids, explicit_connector_ids, include_labels, node_provider):
    """The returned JSON data is sensitive to indices in the array, so care
    must be taken never to alter the order of the variables in the SQL
    statements without modifying the accesses to said data both in this
    function and in the client that consumes it.
    """
    try:
        cursor = connection.cursor()

        cursor.execute('''
        SELECT relation_name, id FROM relation WHERE project_id=%s
        ''' % project_id)
        relation_map = dict(cursor.fetchall())
        id_to_relation = {v: k for k, v in relation_map.items()}

        response_on_error = 'Failed to query treenodes'

        treenode_ids, treenodes = node_provider.get_treenode_data(cursor, params)
        n_retrieved_nodes = len(treenode_ids)

        # A set of missing treenode and connector IDs
        missing_treenode_ids = set()
        missing_connector_ids = set()

        # Add explicitly requested treenodes and connectors, if necessary.
        if explicit_treenode_ids:
            for treenode_id in explicit_treenode_ids:
                if -1 != treenode_id and treenode_id not in treenode_ids:
                    missing_treenode_ids.add(treenode_id)

        if explicit_connector_ids:
            for connector_id in explicit_connector_ids:
                if -1 != connector_id:
                    missing_connector_ids.add(connector_id)

        # Find connectors related to treenodes in the field of view
        # Connectors found attached to treenodes
        response_on_error = 'Failed to query connector locations.'
        crows = node_provider.get_connector_data(cursor, params,
            missing_connector_ids)

        connectors = []
        # A set of unique connector IDs
        connector_ids = set()

        # Collect links to connectors for each treenode. Each entry maps a
        # relation ID to a an object containing the relation name, and an object
        # mapping connector IDs to confidences.
        links = defaultdict(list)
        used_relations = set()
        seen_links = set()

        for row in crows:
            # Collect treeenode IDs related to connectors but not yet in treenode_ids
            # because they lay beyond adjacent sections
            cid = row[0] # connector ID
            tnid = row[7] # treenode ID
            tcid = row[11] # treenode connector ID

            if tnid is not None:
                if tcid in seen_links:
                    continue
                if tnid not in treenode_ids:
                    missing_treenode_ids.add(tnid)
                seen_links.add(tcid)
                # Collect relations between connectors and treenodes
                # row[7]: treenode_id (tnid above)
                # row[8]: treenode_relation_id
                # row[9]: tc_confidence
                # row[10]: tc_edition_time
                # row[11]: tc_id
                links[cid].append(row[7:12])
                used_relations.add(row[8])

            # Collect unique connectors
            if cid not in connector_ids:
                connectors.append(row[0:7] + (links[cid],))
                connector_ids.add(cid)


        # Fetch missing treenodes. These are related to connectors
        # but not in the bounding box of the field of view.
        # This is so that we can draw arrows from any displayed connector
        # to all of its connected treenodes, even if one is several slices
        # below.

        if missing_treenode_ids:
            response_on_error = 'Failed to query treenodes from connectors'
            cursor.execute('''
            SELECT id,
                parent_id,
                location_x,
                location_y,
                location_z,
                confidence,
                radius,
                skeleton_id,
                EXTRACT(EPOCH FROM edition_time),
                user_id
            FROM treenode,
                 UNNEST(%s::bigint[]) missingnodes(mnid)
            WHERE id = mnid''', (list(missing_treenode_ids),))

            treenodes.extend(cursor.fetchall())

        labels = defaultdict(list)
        if include_labels:
            # Avoid dict lookups in loop
            top, left, z1 = params['top'], params['left'], params['z1']
            bottom, right, z2 = params['bottom'], params['right'], params['z2']

            def is_visible(r):
                return left <= r[2] < right and \
                    top <= r[3] < bottom and \
                    z1 <= r[4] < z2

            # Collect treenodes visible in the current section
            visible = [row[0] for row in treenodes if is_visible(row)]
            if visible:
                cursor.execute('''
                SELECT treenode_class_instance.treenode_id,
                       class_instance.name
                FROM class_instance,
                     treenode_class_instance,
                     UNNEST(%s::bigint[]) treenodes(tnid)
                WHERE treenode_class_instance.relation_id = %s
                  AND class_instance.id = treenode_class_instance.class_instance_id
                  AND treenode_class_instance.treenode_id = tnid
                ''', (visible, relation_map['labeled_as']))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

            # Collect connectors visible in the current section
            visible = [row[0] for row in connectors if z1 <= row[3] < z2]
            if visible:
                cursor.execute('''
                SELECT connector_class_instance.connector_id,
                       class_instance.name
                FROM class_instance,
                     connector_class_instance,
                     UNNEST(%s::bigint[]) connectors(cnid)
                WHERE connector_class_instance.relation_id = %s
                  AND class_instance.id = connector_class_instance.class_instance_id
                  AND connector_class_instance.connector_id = cnid
                ''', (visible, relation_map['labeled_as']))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

        used_rel_map = {r:id_to_relation[r] for r in used_relations}
        return HttpResponse(json.dumps((
            treenodes, connectors, labels,
            n_retrieved_nodes == params['limit'],
            used_rel_map),
            separators=(',', ':')), # default separators have spaces in them like (', ', ': '). Must provide two: for list and for dictionary. The point of this: less space, more compact json
            content_type='application/json')

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
def update_location_reviewer(request, project_id=None, node_id=None):
    """ Updates the reviewer id and review time of a node """
    try:
        # Try to get the review object. If this fails we create a new one. Doing
        # it in a try/except instead of get_or_create allows us to retrieve the
        # skeleton ID only if needed.
        r = Review.objects.get(treenode_id=node_id, reviewer=request.user)
    except Review.DoesNotExist:
        node = get_object_or_404(Treenode, pk=node_id)
        r = Review(project_id=project_id, treenode_id=node_id,
                   skeleton_id=node.skeleton_id, reviewer=request.user)

    r.review_time = timezone.now()
    r.save()

    return JsonResponse({
        'reviewer_id': request.user.id,
        'review_time': r.review_time.isoformat(),
    })


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def most_recent_treenode(request, project_id=None):
    skeleton_id = int(request.POST.get('skeleton_id', -1))

    try:
        # Select the most recently edited node
        tn = Treenode.objects.filter(project=project_id, editor=request.user)
        if not skeleton_id == -1:
            tn = tn.filter(skeleton=skeleton_id)
        tn = tn.extra(select={'most_recent': 'greatest(treenode.creation_time, treenode.edition_time)'})\
             .extra(order_by=['-most_recent', '-treenode.id'])[0] # [0] generates a LIMIT 1
    except IndexError:
        # No treenode edited by the user exists in this skeleton.
        return JsonResponse({})

    return JsonResponse({
        'id': tn.id,
        #'skeleton_id': tn.skeleton.id,
        'x': int(tn.location_x),
        'y': int(tn.location_y),
        'z': int(tn.location_z),
        #'most_recent': str(tn.most_recent) + tn.most_recent.strftime('%z'),
        #'most_recent': tn.most_recent.strftime('%Y-%m-%d %H:%M:%S.%f'),
        #'type': 'treenode'
    })


def _update_location(table, nodes, now, user, cursor):
    if not nodes:
        return
    # 0: id
    # 1: X
    # 2: Y
    # 3: Z
    can_edit_all_or_fail(user, (node[0] for node in nodes), table)

    # Sanitize node details
    nodes = [(int(i), float(x), float(y), float(z)) for i,x,y,z in nodes]

    node_template = "(" + "),(".join(["%s, %s, %s, %s"] * len(nodes)) + ")"
    node_table = [v for k in nodes for v in k]

    cursor.execute("""
        UPDATE location n
        SET editor_id = %s, location_x = target.x,
            location_y = target.y, location_z = target.z
        FROM (SELECT x.id, x.location_x AS old_loc_x,
                     x.location_y AS old_loc_y, x.location_z AS old_loc_z,
                     y.new_loc_x AS x, y.new_loc_y AS y, y.new_loc_z AS z
              FROM location x
              INNER JOIN (VALUES {}) y(id, new_loc_x, new_loc_y, new_loc_z)
              ON x.id = y.id FOR NO KEY UPDATE) target
        WHERE n.id = target.id
        RETURNING n.id, n.edition_time, target.old_loc_x, target.old_loc_y,
                  target.old_loc_z
    """.format(node_template), [user.id] + node_table)

    updated_rows = cursor.fetchall()
    if len(nodes) != len(updated_rows):
        raise ValueError('Coudn\'t update node ' +
                         ','.join(frozenset([str(r[0]) for r in nodes]) -
                                  frozenset([str(r[0]) for r in updated_rows])))
    return updated_rows


@requires_user_role(UserRole.Annotate)
def node_update(request, project_id=None):
    treenodes = get_request_list(request.POST, "t") or []
    connectors = get_request_list(request.POST, "c") or []

    cursor = connection.cursor()
    nodes = treenodes + connectors
    if nodes:
        node_ids = [int(n[0]) for n in nodes]
        state.validate_state(node_ids, request.POST.get('state'),
                multinode=True, lock=True, cursor=cursor)

    now = timezone.now()
    old_treenodes = _update_location("treenode", treenodes, now, request.user, cursor)
    old_connectors = _update_location("connector", connectors, now, request.user, cursor)

    num_updated_nodes = len(treenodes) + len(connectors)
    return JsonResponse({
        'updated': num_updated_nodes,
        'old_treenodes': old_treenodes,
        'old_connectors': old_connectors
    })


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_nearest(request, project_id=None):
    params = {}
    param_float_defaults = {
        'x': 0,
        'y': 0,
        'z': 0}
    param_int_defaults = {
        'skeleton_id': -1,
        'neuron_id': -1}
    for p in param_float_defaults.keys():
        params[p] = float(request.POST.get(p, param_float_defaults[p]))
    for p in param_int_defaults.keys():
        params[p] = int(request.POST.get(p, param_int_defaults[p]))
    relation_map = get_relation_to_id_map(project_id)

    if params['skeleton_id'] < 0 and params['neuron_id'] < 0:
        raise Exception('You must specify either a skeleton or a neuron')

    for rel in ['part_of', 'model_of']:
        if rel not in relation_map:
            raise Exception('Could not find required relation %s for project %s.' % (rel, project_id))

    skeletons = []
    if params['skeleton_id'] > 0:
        skeletons.append(params['skeleton_id'])

    response_on_error = ''
    try:
        if params['neuron_id'] > 0:  # Add skeletons related to specified neuron
            # Assumes that a cici 'model_of' relationship always involves a
            # skeleton as ci_a and a neuron as ci_b.
            response_on_error = 'Finding the skeletons failed.'
            neuron_skeletons = ClassInstanceClassInstance.objects.filter(
                class_instance_b=params['neuron_id'],
                relation=relation_map['model_of'])
            for neur_skel_relation in neuron_skeletons:
                skeletons.append(neur_skel_relation.class_instance_a_id)

        # Get all treenodes connected to skeletons
        response_on_error = 'Finding the treenodes failed.'
        treenodes = Treenode.objects.filter(project=project_id, skeleton__in=skeletons)

        def getNearestTreenode(x, y, z, treenodes):
            minDistance = -1
            nearestTreenode = None
            for tn in treenodes:
                xdiff = x - tn.location_x
                ydiff = y - tn.location_y
                zdiff = z - tn.location_z
                distanceSquared = xdiff ** 2 + ydiff ** 2 + zdiff ** 2
                if distanceSquared < minDistance or minDistance < 0:
                    nearestTreenode = tn
                    minDistance = distanceSquared
            return nearestTreenode

        nearestTreenode = getNearestTreenode(
            params['x'],
            params['y'],
            params['z'],
            treenodes)
        if nearestTreenode is None:
            raise Exception('No treenodes were found for skeletons in %s' % skeletons)

        return JsonResponse({
            'treenode_id': nearestTreenode.id,
            'x': int(nearestTreenode.location_x),
            'y': int(nearestTreenode.location_y),
            'z': int(nearestTreenode.location_z),
            'skeleton_id': nearestTreenode.skeleton_id})

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _fetch_location(location_id):
    locations = _fetch_locations([location_id])
    if not locations:
        raise ValueError('Could not find location for node {}'.format(location_id))
    return locations[0]


def _fetch_locations(location_ids):
    cursor = connection.cursor()
    cursor.execute('''
        SELECT
          id,
          location_x AS x,
          location_y AS y,
          location_z AS z
        FROM location
        WHERE id IN (%s)''' % ','.join(map(str, location_ids)))
    return cursor.fetchall()

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_location(request, project_id=None):
    tnid = int(request.POST['tnid'])
    return JsonResponse(_fetch_location(tnid), safe=False)


@requires_user_role([UserRole.Browse])
def user_info(request, project_id=None):
    """Return information on a treenode or connector. This function is called
    pretty often (with every node activation) and should therefore be as fast
    as possible.
    """
    node_id = int(request.POST['node_id'])
    cursor = connection.cursor()
    cursor.execute('''
        SELECT n.id, n.user_id, n.editor_id, n.creation_time, n.edition_time,
               array_agg(r.reviewer_id), array_agg(r.review_time)
        FROM location n LEFT OUTER JOIN review r ON r.treenode_id = n.id
        WHERE n.id = %s
        GROUP BY n.id
                   ''', (node_id,))

    # We expect only one result node
    info = cursor.fetchone()
    if not info:
        return JsonResponse({
            'error': 'Object #%s is not a treenode or a connector' % node_id})

    # Build result
    return JsonResponse({
        'user': info[1],
        'editor': info[2],
        'creation_time': str(info[3].isoformat()),
        'edition_time': str(info[4].isoformat()),
        'reviewers': [r for r in info[5] if r],
        'review_times': [str(rt.isoformat()) for rt in info[6] if rt]
    })

@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def find_labels(request, project_id=None):
    """List nodes with labels matching a query, ordered by distance.

    Find nodes with labels (front-end node tags) matching a regular
    expression, sort them by ascending distance from a reference location, and
    return the result. Returns at most 50 nodes.
    ---
    parameters:
        - name: x
          description: X coordinate of the distance reference in project space.
          required: true
          type: number
          format: double
          paramType: form
        - name: y
          description: Y coordinate of the distance reference in project space.
          required: true
          type: number
          format: double
          paramType: form
        - name: z
          description: Z coordinate of the distance reference in project space.
          required: true
          type: number
          format: double
          paramType: form
        - name: label_regex
          description: Regular expression query to match labels
          required: true
          type: string
          paramType: form
    models:
      find_labels_node:
        id: find_labels_node
        properties:
        - description: ID of a node with a matching label
          type: integer
          required: true
        - description: Node location
          type: array
          items:
            type: number
            format: double
          required: true
        - description: |
            Euclidean distance from the reference location in project space
          type: number
          format: double
          required: true
        - description: Labels on this node matching the query
          type: array
          items:
            type: string
          required: true
    type:
    - type: array
      items:
        $ref: find_labels_node
      required: true
    """
    x = float(request.POST['x'])
    y = float(request.POST['y'])
    z = float(request.POST['z'])
    label_regex = str(request.POST['label_regex'])

    cursor = connection.cursor()
    cursor.execute("""
            (SELECT
                n.id,
                n.location_x,
                n.location_y,
                n.location_z,
                SQRT(POW(n.location_x - %s, 2)
                   + POW(n.location_y - %s, 2)
                   + POW(n.location_z - %s, 2)) AS dist,
                ARRAY_TO_JSON(ARRAY_AGG(l.name)) AS labels
            FROM treenode n, class_instance l, treenode_class_instance nl, relation r
            WHERE r.id = nl.relation_id
              AND r.relation_name = 'labeled_as'
              AND nl.treenode_id = n.id
              AND l.id = nl.class_instance_id
              AND n.project_id = %s
              AND l.name ~ %s
            GROUP BY n.id)

            UNION ALL

            (SELECT
                n.id,
                n.location_x,
                n.location_y,
                n.location_z,
                SQRT(POW(n.location_x - %s, 2)
                   + POW(n.location_y - %s, 2)
                   + POW(n.location_z - %s, 2)) AS dist,
                ARRAY_TO_JSON(ARRAY_AGG(l.name)) AS labels
            FROM connector n, class_instance l, connector_class_instance nl, relation r
            WHERE r.id = nl.relation_id
              AND r.relation_name = 'labeled_as'
              AND nl.connector_id = n.id
              AND l.id = nl.class_instance_id
              AND n.project_id = %s
              AND l.name ~ %s
            GROUP BY n.id)

            ORDER BY dist
            LIMIT 50
            """, (x, y, z, project_id, label_regex,
                  x, y, z, project_id, label_regex,))

    return JsonResponse([
            [row[0],
             [row[1], row[2], row[3]],
             row[4],
             row[5]] for row in cursor.fetchall()], safe=False)
