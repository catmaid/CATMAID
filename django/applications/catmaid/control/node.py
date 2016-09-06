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


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_list_tuples(request, project_id=None, provider=None):
    ''' Retrieve an JSON array with four entries:
    [0] an array of arrays, each array representing a treenode
    [1] an array of arrays, each array representing a connector and containing
    arrays inside that specify the relations between the connector and treenodes.
    In this function tuples are used as much as possible for immutable list,
    and uses directly the tuples returned by the database cursor.
    [2] the labels, if requested.
    [3] a boolean which is true when the node limit has been reached.
    The returned JSON data is therefore sensitive to indices in the array,
    so care must be taken never to alter the order of the variables in the SQL
    statements without modifying the accesses to said data both in this function
    and in the client that consumes it.
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

    provider = get_treenodes_postgis

    return node_list_tuples_query(params, project_id, treenode_ids, connector_ids,
                                  include_labels, provider)


def get_treenodes_classic(cursor, params):
    # Fetch treenodes which are in the bounding box,
    # which in z it includes the full thickess of the prior section
    # and of the next section (therefore the '<' and not '<=' for zhigh)
    cursor.execute('''
    SELECT
        t1.id,
        t1.parent_id,
        t1.location_x,
        t1.location_y,
        t1.location_z,
        t1.confidence,
        t1.radius,
        t1.skeleton_id,
        t1.edition_time,
        t1.user_id,
        t2.id,
        t2.parent_id,
        t2.location_x,
        t2.location_y,
        t2.location_z,
        t2.confidence,
        t2.radius,
        t2.skeleton_id,
        t2.edition_time,
        t2.user_id
    FROM treenode t1
            INNER JOIN treenode t2 ON
            (   (t1.id = t2.parent_id OR t1.parent_id = t2.id)
            OR (t1.parent_id IS NULL AND t1.id = t2.id))
    WHERE
            t1.location_z >= %(z1)s
        AND t1.location_z <  %(z2)s
        AND t1.location_x >= %(left)s
        AND t1.location_x <  %(right)s
        AND t1.location_y >= %(top)s
        AND t1.location_y <  %(bottom)s
        AND t1.project_id = %(project_id)s
    LIMIT %(limit)s
    ''', params)

    # Above, notice that the join is done for:
    # 1. A parent-child or child-parent pair (where the first one is in section z)
    # 2. A node with itself when the parent is null
    # This is by far the fastest way to retrieve all parents and children nodes
    # of the nodes in section z within the specified 2d bounds.

    return cursor.fetchall()


def get_connector_nodes_classic(cursor, params, treenode_ids, missing_connector_ids):
    """ Selects all connectors that have links to nodes in treenode_ids, are
    in the bounding box, or are in missing_connector_ids.
    """
    crows = []

    if treenode_ids:
        cursor.execute('''
        SELECT c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            c.edition_time,
            c.user_id,
            tc.treenode_id,
            tc.relation_id,
            tc.confidence,
            tc.edition_time,
            tc.id
        FROM treenode_connector tc
        INNER JOIN connector c ON (tc.connector_id = c.id)
        INNER JOIN UNNEST(%s) vals(v) ON tc.treenode_id = v
                       ''', (list(treenode_ids),))

        crows = list(cursor.fetchall())

    # Obtain connectors within the field of view that were not captured above.
    # Uses a LEFT OUTER JOIN to include disconnected connectors,
    # that is, connectors that aren't referenced from treenode_connector.

    connector_query = '''
        SELECT connector.id,
            connector.location_x,
            connector.location_y,
            connector.location_z,
            connector.confidence,
            connector.edition_time,
            connector.user_id,
            treenode_connector.treenode_id,
            treenode_connector.relation_id,
            treenode_connector.confidence,
            treenode_connector.edition_time,
            treenode_connector.id
        FROM connector LEFT OUTER JOIN treenode_connector
                       ON connector.id = treenode_connector.connector_id
        WHERE connector.project_id = %(project_id)s
          AND connector.location_z >= %(z1)s
          AND connector.location_z <  %(z2)s
          AND connector.location_x >= %(left)s
          AND connector.location_x <  %(right)s
          AND connector.location_y >= %(top)s
          AND connector.location_y <  %(bottom)s
    '''

    # Add additional connectors to the pool before links are collected
    if missing_connector_ids:
        sanetized_connector_ids = [int(cid) for cid in missing_connector_ids]
        connector_query += '''
            UNION
            SELECT connector.id,
                connector.location_x,
                connector.location_y,
                connector.location_z,
                connector.confidence,
                treenode_connector.relation_id,
                treenode_connector.treenode_id,
                treenode_connector.confidence,
                treenode_connector.edition_time,
                treenode_connector.id,
                connector.edition_time,
                connector.user_id
            FROM connector LEFT OUTER JOIN treenode_connector
                           ON connector.id = treenode_connector.connector_id
            WHERE connector.project_id = %(project_id)s
            AND connector.id IN ({})
        '''.format(','.join(str(cid) for cid in sanetized_connector_ids))

    cursor.execute(connector_query, params)
    crows.extend(cursor.fetchall())

    return crows


def get_treenodes_postgis(cursor, params):
    """ Selects all treenodes of which links to other treenodes intersect with
    the request bounding box.
    """
    params['halfzdiff'] = abs(params['z2'] - params['z1']) * 0.5
    params['halfz'] = params['z1'] + (params['z2'] - params['z1']) * 0.5

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
    cursor.execute('''
    SELECT
        t1.id,
        t1.parent_id,
        t1.location_x,
        t1.location_y,
        t1.location_z,
        t1.confidence,
        t1.radius,
        t1.skeleton_id,
        t1.edition_time,
        t1.user_id,
        t2.id,
        t2.parent_id,
        t2.location_x,
        t2.location_y,
        t2.location_z,
        t2.confidence,
        t2.radius,
        t2.skeleton_id,
        t2.edition_time,
        t2.user_id
    FROM
      (SELECT te.id
         FROM treenode_edge te
         WHERE te.edge &&& 'LINESTRINGZ(%(left)s %(bottom)s %(z2)s,
                                       %(right)s %(top)s %(z1)s)'
           AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_GeomFromText(
            'LINESTRING(%(left)s %(top)s %(halfz)s, %(right)s %(top)s %(halfz)s,
                        %(right)s %(bottom)s %(halfz)s, %(left)s %(bottom)s %(halfz)s,
                        %(left)s %(top)s %(halfz)s)')), %(halfzdiff)s)
           AND te.project_id = %(project_id)s
      ) edges(edge_child_id)
    JOIN treenode t1 ON edge_child_id = t1.id
    LEFT JOIN treenode t2 ON t2.id = t1.parent_id
    WHERE t1.project_id = %(project_id)s
    LIMIT %(limit)s
    ''', params)

    return cursor.fetchall()


def get_connector_nodes_postgis(cursor, params, treenode_ids, missing_connector_ids):
    """Selects all connectors that are in or have links that intersect the
    bounding box, or that are in missing_connector_ids.
    """
    params['sanitized_connector_ids'] = map(int, missing_connector_ids)
    cursor.execute('''
    SELECT
        c.id,
        c.location_x,
        c.location_y,
        c.location_z,
        c.confidence,
        c.edition_time,
        c.user_id,
        tc.treenode_id,
        tc.relation_id,
        tc.confidence,
        tc.edition_time,
        tc.id
    FROM (SELECT tce.id AS tce_id
         FROM treenode_connector_edge tce
         WHERE tce.edge &&& 'LINESTRINGZ(%(left)s %(bottom)s %(z2)s,
                                       %(right)s %(top)s %(z1)s)'
           AND ST_3DDWithin(tce.edge, ST_MakePolygon(ST_GeomFromText(
            'LINESTRING(%(left)s %(top)s %(halfz)s, %(right)s %(top)s %(halfz)s,
                        %(right)s %(bottom)s %(halfz)s, %(left)s %(bottom)s %(halfz)s,
                        %(left)s %(top)s %(halfz)s)')), %(halfzdiff)s)
           AND tce.project_id = %(project_id)s
      ) edges(edge_tc_id)
    JOIN treenode_connector tc
      ON (tc.id = edge_tc_id)
    JOIN connector c
      ON (c.id = tc.connector_id)
    WHERE c.project_id = %(project_id)s

    UNION

    SELECT
        c.id,
        c.location_x,
        c.location_y,
        c.location_z,
        c.confidence,
        c.edition_time,
        c.user_id,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
    FROM (SELECT cg.id AS cg_id
         FROM connector_geom cg
         WHERE cg.geom &&& 'LINESTRINGZ(%(left)s %(bottom)s %(z2)s,
                                       %(right)s %(top)s %(z1)s)'
           AND ST_3DDWithin(cg.geom, ST_MakePolygon(ST_GeomFromText(
            'LINESTRING(%(left)s %(top)s %(halfz)s, %(right)s %(top)s %(halfz)s,
                        %(right)s %(bottom)s %(halfz)s, %(left)s %(bottom)s %(halfz)s,
                        %(left)s %(top)s %(halfz)s)')), %(halfzdiff)s)
           AND cg.project_id = %(project_id)s
        UNION SELECT UNNEST(%(sanitized_connector_ids)s::bigint[])
      ) geoms(geom_connector_id)
    JOIN connector c
      ON (geom_connector_id = c.id)
    WHERE c.project_id = %(project_id)s
    LIMIT %(limit)s
    ''', params)

    return list(cursor.fetchall())


def node_list_tuples_query(params, project_id, explicit_treenode_ids, explicit_connector_ids, include_labels, tn_provider):
    try:
        cursor = connection.cursor()

        cursor.execute('''
        SELECT relation_name, id FROM relation WHERE project_id=%s
        ''' % project_id)
        relation_map = dict(cursor.fetchall())
        id_to_relation = {v: k for k, v in relation_map.items()}

        response_on_error = 'Failed to query treenodes'

        # A list of tuples, each tuple containing the selected columns for each treenode
        # The id is the first element of each tuple
        treenodes = []
        # A set of unique treenode IDs
        treenode_ids = set()

        n_retrieved_nodes = 0 # at one per row, only those within the section
        for row in tn_provider(cursor, params):
            n_retrieved_nodes += 1
            t1id = row[0]
            if t1id not in treenode_ids:
                treenode_ids.add(t1id)
                treenodes.append(row[0:10])
            t2id = row[10]
            if t2id and t2id not in treenode_ids:
                treenode_ids.add(t2id)
                treenodes.append(row[10:20])

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
        cn_provider = get_connector_nodes_classic if tn_provider == get_treenodes_classic else get_connector_nodes_postgis
        crows = cn_provider(cursor, params, treenode_ids, missing_connector_ids)

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
                edition_time,
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
            cls=DjangoJSONEncoder,
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

    return HttpResponse(json.dumps({
        'reviewer_id': request.user.id,
        'review_time': r.review_time.isoformat(),
    }), content_type='application/json')


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def most_recent_treenode(request, project_id=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    skeleton_id = Treenode.objects.get(pk=treenode_id).skeleton_id

    try:
        # Select the most recently edited node
        tn = Treenode.objects\
             .filter(project=project_id,
            skeleton=skeleton_id,
            editor=request.user)\
             .extra(select={'most_recent': 'greatest(treenode.creation_time, treenode.edition_time)'})\
             .extra(order_by=['-most_recent', '-treenode.id'])[0] # [0] generates a LIMIT 1
    except IndexError:
        # No treenode edited by the user exists in this skeleton.
        return HttpResponse(json.dumps({}), content_type='application/json')

    return HttpResponse(json.dumps({
        'id': tn.id,
        #'skeleton_id': tn.skeleton.id,
        'x': int(tn.location_x),
        'y': int(tn.location_y),
        'z': int(tn.location_z),
        #'most_recent': str(tn.most_recent) + tn.most_recent.strftime('%z'),
        #'most_recent': tn.most_recent.strftime('%Y-%m-%d %H:%M:%S.%f'),
        #'type': 'treenode'
    }), content_type='application/json')


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

        return HttpResponse(json.dumps({
            'treenode_id': nearestTreenode.id,
            'x': int(nearestTreenode.location_x),
            'y': int(nearestTreenode.location_y),
            'z': int(nearestTreenode.location_z),
            'skeleton_id': nearestTreenode.skeleton_id}))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _fetch_location(location_id):
    return _fetch_locations([location_id])[0]


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

    return HttpResponse(json.dumps([
            [row[0],
             [row[1], row[2], row[3]],
             row[4],
             row[5]] for row in cursor.fetchall()]))
