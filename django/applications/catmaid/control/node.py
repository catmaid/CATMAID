import json
import re

from collections import defaultdict
from datetime import datetime

from django.conf import settings
from django.db import connection
from django.http import HttpResponse

from rest_framework.decorators import api_view

from catmaid.models import UserRole, Treenode, Connector, \
        ClassInstanceClassInstance, Review
from catmaid.control.authentication import requires_user_role, \
        can_edit_all_or_fail, user_domain
from catmaid.control.common import get_relation_to_id_map


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
    # z: the section index in calibrated units.
    # width: the width of the field of view in calibrated units.
    # height: the height of the field of view in calibrated units.
    # zres: the resolution in the Z axis, used to determine the thickness of a section.
    # as: the ID of the active skeleton
    # top: the Y coordinate of the bounding box (field of view) in calibrated units
    # left: the X coordinate of the bounding box (field of view) in calibrated units
    atnid = int(request.POST.get('atnid', -1))
    for p in ('top', 'left', 'bottom', 'right', 'z1', 'z2'):
        params[p] = float(request.POST.get(p, 0))
    # Limit the number of retrieved treenodes within the section
    params['limit'] = settings.NODE_LIST_MAXIMUM_COUNT
    params['project_id'] = project_id
    includeLabels = (request.POST.get('labels', None) == 'true')

    provider = get_treenodes_postgis

    return node_list_tuples_query(request.user, params, project_id, atnid,
                                  includeLabels, provider)


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
        t1.user_id,
        t2.id,
        t2.parent_id,
        t2.location_x,
        t2.location_y,
        t2.location_z,
        t2.confidence,
        t2.radius,
        t2.skeleton_id,
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

    return cursor.fetchall()


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
        t1.user_id,
        t2.id,
        t2.parent_id,
        t2.location_x,
        t2.location_y,
        t2.location_z,
        t2.confidence,
        t2.radius,
        t2.skeleton_id,
        t2.user_id
    FROM
      treenode t1,
      treenode t2,
      (SELECT te.id
         FROM treenode_edge te
         WHERE te.edge &&& 'LINESTRINGZ(%(left)s %(bottom)s %(z2)s,
                                       %(right)s %(top)s %(z1)s)'
           AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_GeomFromText(
            'LINESTRING(%(left)s %(top)s %(halfz)s, %(right)s %(top)s %(halfz)s,
                        %(right)s %(bottom)s %(halfz)s, %(left)s %(bottom)s %(halfz)s,
                        %(left)s %(top)s %(halfz)s)')), %(halfzdiff)s)
      ) edges(edge_child_id)
    WHERE
          t1.project_id = %(project_id)s
      AND (   (t1.id = t2.parent_id OR t1.parent_id = t2.id)
           OR (t1.parent_id IS NULL AND t1.id = t2.id))
      AND edge_child_id = t1.id
    LIMIT %(limit)s
    ''', params)

    return cursor.fetchall()


def node_list_tuples_query(user, params, project_id, atnid, includeLabels, tn_provider):
    try:
        cursor = connection.cursor()

        cursor.execute('''
        SELECT relation_name, id FROM relation WHERE project_id=%s
        ''' % project_id)
        relation_map = dict(cursor.fetchall())

        response_on_error = 'Failed to query treenodes'

        is_superuser = user.is_superuser
        user_id = user.id

        # Set of other user_id for which the request user has editing rights on.
        # For a superuser, the domain is all users, and implicit.
        domain = None if is_superuser else user_domain(cursor, user_id)

        # Above, notice that the join is done for:
        # 1. A parent-child or child-parent pair (where the first one is in section z)
        # 2. A node with itself when the parent is null
        # This is by far the fastest way to retrieve all parents and children nodes
        # of the nodes in section z within the specified 2d bounds.

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
                treenodes.append(row[0:8] + (is_superuser or row[8] == user_id or row[8] in domain,))
            t2id = row[9]
            if t2id not in treenode_ids:
                treenode_ids.add(t2id)
                treenodes.append(row[9:17] + (is_superuser or row[17] == user_id or row[17] in domain,))


        # Find connectors related to treenodes in the field of view
        # Connectors found attached to treenodes
        crows = []

        if treenode_ids:
            treenode_list = ','.join('({0})'.format(t) for t in treenode_ids)
            response_on_error = 'Failed to query connector locations.'
            cursor.execute('''
            SELECT c.id,
                c.location_x,
                c.location_y,
                c.location_z,
                c.confidence,
                tc.relation_id,
                tc.treenode_id,
                tc.confidence,
                c.user_id
            FROM treenode_connector tc
            INNER JOIN connector c ON (tc.connector_id = c.id)
            INNER JOIN (VALUES %s) vals(v) ON tc.treenode_id = v
                           ''' % treenode_list)

            crows = list(cursor.fetchall())

        # Obtain connectors within the field of view that were not captured above.
        # Uses a LEFT OUTER JOIN to include disconnected connectors,
        # that is, connectors that aren't referenced from treenode_connector.

        cursor.execute('''
        SELECT connector.id,
            connector.location_x,
            connector.location_y,
            connector.location_z,
            connector.confidence,
            treenode_connector.relation_id,
            treenode_connector.treenode_id,
            treenode_connector.confidence,
            connector.user_id
        FROM connector LEFT OUTER JOIN treenode_connector
                       ON connector.id = treenode_connector.connector_id
        WHERE connector.project_id = %(project_id)s
          AND connector.location_z >= %(z1)s
          AND connector.location_z <  %(z2)s
          AND connector.location_x >= %(left)s
          AND connector.location_x <  %(right)s
          AND connector.location_y >= %(top)s
          AND connector.location_y <  %(bottom)s
        ''', params)

        crows.extend(cursor.fetchall())

        connectors = []
        # A set of missing treenode IDs
        missing_treenode_ids = set()
        # Check if the active treenode is present; if not, load it
        if -1 != atnid and atnid not in treenode_ids:
            # If atnid is a connector, it doesn't matter, won't be found in treenode table
            missing_treenode_ids.add(atnid)
        # A set of unique connector IDs
        connector_ids = set()
        # The relations between connectors and treenodes, stored
        # as connector ID keys vs a list of tuples, each with the treenode id,
        # the type of relation (presynaptic_to or postsynaptic_to), and the confidence.
        # The list of tuples is generated later from a dict,
        # so that repeated tnid entries are overwritten.
        pre = defaultdict(dict)
        post = defaultdict(dict)
        other = defaultdict(dict)

        # Process crows (rows with connectors) which could have repeated connectors
        # given the join with treenode_connector
        presynaptic_to = relation_map['presynaptic_to']
        postsynaptic_to = relation_map['postsynaptic_to']
        for row in crows:
            # Collect treeenode IDs related to connectors but not yet in treenode_ids
            # because they lay beyond adjacent sections
            tnid = row[6] # The tnid column is index 7 (see SQL statement above)
            cid = row[0] # connector ID
            if tnid is not None:
                if tnid not in treenode_ids:
                    missing_treenode_ids.add(tnid)
                # Collect relations between connectors and treenodes
                # row[5]: treenode_relation_id
                # row[6]: treenode_id (tnid above)
                # row[7]: tc_confidence
                if row[5] == presynaptic_to:
                    pre[cid][tnid] = row[7]
                elif row[5] == postsynaptic_to:
                    post[cid][tnid] = row[7]
                else:
                    other[cid][tnid] = row[7]

            # Collect unique connectors
            if cid not in connector_ids:
                connectors.append(row)
                connector_ids.add(cid)

        # Fix connectors to contain only the relevant entries, plus the relations
        for i in xrange(len(connectors)):
            c = connectors[i]
            cid = c[0]
            connectors[i] = (cid, c[1], c[2], c[3], c[4],
                    [kv for kv in  pre[cid].iteritems()],
                    [kv for kv in post[cid].iteritems()],
                    [kv for kv in other[cid].iteritems()],
                    is_superuser or c[8] == user_id or c[8] in domain)


        # Fetch missing treenodes. These are related to connectors
        # but not in the bounding box of the field of view.
        # This is so that we can draw arrows from any displayed connector
        # to all of its connected treenodes, even if one is several slices
        # below.

        if missing_treenode_ids:
            missing_id_list = ','.join('({0})'.format(mnid) for mnid in missing_treenode_ids)
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
                user_id
            FROM treenode, (VALUES %s) missingnodes(mnid)
            WHERE id = mnid''' % missing_id_list)

            for row in cursor.fetchall():
                treenodes.append(row)
                treenode_ids.add(row[0:8] + (is_superuser or row[8] == user_id or row[8] in domain,))

        labels = defaultdict(list)
        if includeLabels:
            # Avoid dict lookups in loop
            top, left, z1 = params['top'], params['left'], params['z1']
            bottom, right, z2 = params['bottom'], params['right'], params['z2']

            def is_visible(r):
                return r[2] >= left and r[2] < right and \
                    r[3] >= top and r[3] < bottom and \
                    r[4] >= z1 and r[4] < z2

            # Collect treenodes visible in the current section
            visible = ','.join('({0})'.format(row[0]) for row in treenodes if is_visible(row))
            if visible:
                cursor.execute('''
                SELECT tnid, class_instance.name
                FROM class_instance, treenode_class_instance,
                     (VALUES %s) treenodes(tnid)
                WHERE treenode_class_instance.relation_id = %s
                  AND treenode_class_instance.treenode_id = tnid
                  AND class_instance.id = treenode_class_instance.class_instance_id
                ''' % (visible, relation_map['labeled_as']))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

            # Collect connectors visible in the current section
            visible = ','.join('({0})'.format(row[0]) for row in connectors if row[3] >= z1 and row[3] < z2)
            if visible:
                cursor.execute('''
                SELECT cnid, class_instance.name
                FROM class_instance, connector_class_instance,
                     (VALUES %s) connectors(cnid)
                WHERE connector_class_instance.relation_id = %s
                  AND connector_class_instance.connector_id = cnid
                  AND class_instance.id = connector_class_instance.class_instance_id
                ''' % (visible, relation_map['labeled_as']))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

        return HttpResponse(json.dumps((treenodes, connectors, labels, n_retrieved_nodes == params['limit']), separators=(',', ':'))) # default separators have spaces in them like (', ', ': '). Must provide two: for list and for dictionary. The point of this: less space, more compact json

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
        r = Review(project_id=project_id, treenode_id=node_id, reviewer=request.user)
        # Find the skeleton
        r.skeleton = Treenode.objects.get(pk=node_id).skeleton

    r.review_time = datetime.now()
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
        return HttpResponse(json.dumps({'error': 'No skeleton and neuron found for treenode %s' % treenode_id}))

    return HttpResponse(json.dumps({
        'id': tn.id,
        #'skeleton_id': tn.skeleton.id,
        'x': int(tn.location_x),
        'y': int(tn.location_y),
        'z': int(tn.location_z),
        #'most_recent': str(tn.most_recent) + tn.most_recent.strftime('%z'),
        #'most_recent': tn.most_recent.strftime('%Y-%m-%d %H:%M:%S.%f'),
        #'type': 'treenode'
    }))


def _update(Kind, table, nodes, now, user):
    if not nodes:
        return
    # 0: id
    # 1: X
    # 2: Y
    # 3: Z
    can_edit_all_or_fail(user, (node[0] for node in nodes.itervalues()), table)
    for node in nodes.itervalues():
        Kind.objects.filter(id=int(node[0])).update(
            editor=user,
            edition_time=now,
            location_x=float(node[1]),
            location_y=float(node[2]),
            location_z=float(node[3]))


@requires_user_role(UserRole.Annotate)
def node_update(request, project_id=None):
    N = len(request.POST)
    if 0 != N % 4:
        raise Exception("Incorrect number of posted items for node_update.")

    pattern = re.compile('^[tc]\[(\d+)\]\[(\d+)\]$')

    nodes = {'t': {}, 'c': {}}
    for key, value in request.POST.iteritems():
        i, j = pattern.match(key).groups()
        i = int(i)
        j = int(j)
        node = nodes[key[0]].get(i)
        if not node:
            nodes[key[0]][i] = node = {}
        node[j] = value

    now = datetime.now()
    _update(Treenode, 'treenode', nodes['t'], now, request.user)
    _update(Connector, 'connector', nodes['c'], now, request.user)

    num_updated_nodes = len(nodes['t'].keys()) + len(nodes['c'].keys())
    return HttpResponse(json.dumps({'updated': num_updated_nodes}))


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
    try:
        return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise Exception('Could not obtain the location of node with id #%s' % tnid)


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
        return HttpResponse(json.dumps({
            'error': 'Object #%s is not a treenode or a connector' % node_id}))

    # Build result
    return HttpResponse(json.dumps({
        'user': info[1],
        'editor': info[2],
        'creation_time': str(info[3].isoformat()),
        'edition_time': str(info[4].isoformat()),
        'reviewers': [r for r in info[5] if r],
        'review_times': [str(rt.isoformat()) for rt in info[6] if rt]
    }))

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
