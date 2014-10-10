import json

from collections import defaultdict
from datetime import datetime

from django.db import connection
from django.http import HttpResponse

from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.treenode import can_edit_treenode_or_fail

import sys
try:
    import networkx as nx
except:
    pass


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_list_tuples(request, project_id=None):
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
    for p in ('top', 'left', 'z', 'width', 'height', 'zres'):
        params[p] = float(request.POST.get(p, 0))
    params['limit'] = 5000  # Limit the number of retrieved treenodes within the section
    params['project_id'] = project_id

    try:
        cursor = connection.cursor()

        cursor.execute('''
        SELECT relation_name, id FROM relation WHERE project_id=%s
        ''' % project_id)
        relation_map = dict(cursor.fetchall())

        response_on_error = 'Failed to query treenodes'

        is_superuser = request.user.is_superuser
        user_id = request.user.id

        # Set of other user_id for which the request user has editing rights on.
        # For a superuser, the domain is all users, and implicit.
        domain = None if is_superuser else user_domain(cursor, user_id)

        # Fetch treenodes which are in the bounding box,
        # which in z it includes the full thickess of the prior section
        # and of the next section (therefore the '<' and not '<=' for zhigh)
        params['bottom'] = params['top'] + params['height']
        params['right'] = params['left'] + params['width']
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
            t1.location_z = %(z)s
            AND t1.location_x > %(left)s
            AND t1.location_x < %(right)s
            AND t1.location_y > %(top)s
            AND t1.location_y < %(bottom)s
            AND t1.project_id = %(project_id)s
        LIMIT %(limit)s
        ''', params)

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
        for row in cursor.fetchall():
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
            response_on_error = 'Failed to query connector locations.'
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
            FROM treenode_connector,
                 connector
            WHERE treenode_connector.treenode_id IN (%s)
              AND treenode_connector.connector_id = connector.id
            ''' % ','.join(map(str, treenode_ids)))

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
          AND connector.location_z = %(z)s
          AND connector.location_x > %(left)s
          AND connector.location_x < %(right)s
          AND connector.location_y > %(top)s
          AND connector.location_y < %(bottom)s
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

        # Process crows (rows with connectors) which could have repeated connectors
        # given the join with treenode_connector
        presynaptic_to = relation_map['presynaptic_to']
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
                else:
                    post[cid][tnid] = row[7]

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
                    is_superuser or c[8] == user_id or c[8] in domain)


        # Fetch missing treenodes. These are related to connectors
        # but not in the bounding box of the field of view.
        # This is so that we can draw arrows from any displayed connector
        # to all of its connected treenodes, even if one is several slices
        # below.

        if missing_treenode_ids:
            params['missing'] = tuple(missing_treenode_ids)
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
            FROM treenode
            WHERE id IN %(missing)s''', params)

            for row in cursor.fetchall():
                treenodes.append(row)
                treenode_ids.add(row[0:8] + (is_superuser or row[8] == user_id or row[8] in domain,))

        labels = defaultdict(list)
        if 'true' == request.POST['labels']:
            z0 = params['z']
            # Collect treenodes visible in the current section
            visible = ','.join(str(row[0]) for row in treenodes if row[4] == z0)
            if visible:
                cursor.execute('''
                SELECT treenode.id, class_instance.name
                FROM treenode, class_instance, treenode_class_instance
                WHERE treenode_class_instance.relation_id = %s
                  AND treenode.id IN (%s)
                  AND treenode_class_instance.treenode_id = treenode.id
                  AND class_instance.id = treenode_class_instance.class_instance_id
                ''' % (relation_map['labeled_as'], visible))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

            # Collect connectors visible in the current section
            visible = ','.join(str(row[0]) for row in connectors if row[3] == z0)
            if visible:
                cursor.execute('''
                SELECT connector.id, class_instance.name
                FROM connector, class_instance, connector_class_instance
                WHERE connector_class_instance.relation_id = %s
                  AND connector.id IN (%s)
                  AND connector_class_instance.connector_id = connector.id
                  AND class_instance.id = connector_class_instance.class_instance_id
                ''' % (relation_map['labeled_as'], visible))
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

    return HttpResponse(json.dumps({'reviewer_id': request.user.id}), mimetype='text/json')


@requires_user_role(UserRole.Annotate)
def update_confidence(request, project_id=None, node_id=0):
    tnid = int(node_id)
    can_edit_treenode_or_fail(request.user, project_id, tnid)

    new_confidence = int(request.POST.get('new_confidence', 0))
    if new_confidence < 1 or new_confidence > 5:
        return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))
    to_connector = request.POST.get('to_connector', 'false') == 'true'
    if to_connector:
        # Could be more than one. The GUI doesn't allow for specifying to which one.
        rows_affected = TreenodeConnector.objects.filter(treenode=tnid).update(confidence=new_confidence)
    else:
        rows_affected = Treenode.objects.filter(id=tnid).update(confidence=new_confidence,editor=request.user)

    if rows_affected > 0:
        location = Location.objects.filter(id=tnid).values_list('location_x',
                'location_y', 'location_z')[0]
        insert_into_log(project_id, request.user.id, "change_confidence", location, "Changed to %s" % new_confidence)
        return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')

    # Else, signal error
    if to_connector:
        return HttpResponse(json.dumps({'error': 'Failed to update confidence between treenode %s and connector.' % tnid}))
    else:
        return HttpResponse(json.dumps({'error': 'Failed to update confidence at treenode %s.' % tnid}))



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

    return HttpResponse(json.dumps(len(nodes)))


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


def _skeleton_as_graph(skeleton_id):
    # Fetch all nodes of the skeleton
    cursor = connection.cursor()
    cursor.execute('''
        SELECT id, parent_id
        FROM treenode
        WHERE skeleton_id=%s''', [skeleton_id])
    # Create a directed graph of the skeleton
    graph = nx.DiGraph()
    for row in cursor.fetchall():
        # row[0]: id
        # row[1]: parent_id
        graph.add_node(row[0])
        if row[1]:
            # Create directional edge from parent to child
            graph.add_edge(row[1], row[0])
    return graph


def _fetch_location(treenode_id):
    cursor = connection.cursor()
    cursor.execute('''
        SELECT
          id,
          location_x AS x,
          location_y AS y,
          location_z AS z,
          skeleton_id
        FROM treenode
        WHERE id=%s''', [treenode_id])
    return cursor.fetchone()


def _fetch_location_connector(connector_id):
    cursor = connection.cursor()
    cursor.execute('''
        SELECT
          id,
          location_x AS x,
          location_y AS y,
          location_z AS z
        FROM connector
        WHERE id=%s''', [connector_id])
    return cursor.fetchone()


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_location(request, project_id=None):
    try:
        tnid = int(request.POST['tnid'])
        nodetype = request.POST.get('type', 'treenode')
        if nodetype == 'connector':
            return HttpResponse(json.dumps(_fetch_location_connector(tnid)))
        else:
            return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise Exception('Could not obtain the location of node with id #%s' % tnid)


def _find_first_interesting_node(sequence):
    """ Find the first node that:
    1. Has confidence lower than 5
    2. Has a tag
    3. Receives a synapse
    4. Makes a synapse
    Otherwise return the last node.
    """
    if not sequence:
        raise Exception('No nodes ahead!')

    if 1 == len(sequence):
        return sequence[0]

    cursor = connection.cursor()
    cursor.execute('''
    SELECT t.id, t.confidence, tc.relation_id, tci.relation_id
    FROM treenode t
         LEFT OUTER JOIN treenode_connector tc ON (tc.treenode_id = t.id)
         LEFT OUTER JOIN treenode_class_instance tci ON (tci.treenode_id = t.id)
    WHERE t.id IN (%s)
    ''' % ",".join(map(str, sequence)))

    nodes = {row[0]: row for row in cursor.fetchall()}
    for nodeID in sequence:
        if nodeID in nodes:
            props = nodes[nodeID]
            # [1]: confidence
            # [2]: a treenode_connector.relation_id, e.g. presynaptic_to or postsynaptic_to
            # [3]: a treenode_class_instance.relation_id, e.g. labeled_as
            # 2 and 3 may be None
            if props[1] < 5 or props[2] or props[3]:
                return nodeID
        else:
            raise Exception('Nodes of this skeleton changed while inspecting them.')

    return sequence[-1]


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def find_previous_branchnode_or_root(request, project_id=None):
    try:
        tnid = int(request.POST['tnid'])
        alt = 1 == int(request.POST['alt'])
        skid = Treenode.objects.get(pk=tnid).skeleton_id
        graph = _skeleton_as_graph(skid)
        # Travel upstream until finding a parent node with more than one child
        # or reaching the root node
        seq = [] # Does not include the starting node tnid
        while True:
            parents = graph.predecessors(tnid)
            if parents: # list of parents is not empty
                tnid = parents[0] # Can ony have one parent
                seq.append(tnid)
                if 1 != len(graph.successors(tnid)):
                    break # Found a branch node
            else:
                break # Found the root node

        if seq and alt:
            tnid = _find_first_interesting_node(seq)

        return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise Exception('Could not obtain previous branch node or root:' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def find_next_branchnode_or_end(request, project_id=None):
    try:
        tnid = int(request.POST['tnid'])
        shift = 1 == int(request.POST['shift'])
        alt = 1 == int(request.POST['alt'])
        skid = Treenode.objects.get(pk=tnid).skeleton_id
        graph = _skeleton_as_graph(skid)

        children = graph.successors(tnid)
        if len(children) > 1:
            # Choose one of the children:
            # The closest to 0,0,0 or the furthest if shift is down
            sqDist = 0 if shift else float('inf')
            for t in Treenode.objects.filter(parent_id=tnid):
                d = pow(t.location_x, 2) + pow(t.location_y, 2) + pow(t.location_z, 2)
                if (shift and d > sqDist) or (not shift and d < sqDist):
                    sqDist = d
                    tnid = t.id

        # Travel downstream until finding a child node with more than one child
        # or reaching an end node
        seq = [] # Does not include the starting node tnid
        while True:
            children = graph.successors(tnid)
            if 1 == len(children):
                tnid = children[0]
                seq.append(tnid)
            else:
                break # Found an end node or a branch node

        if seq and alt:
            tnid = _find_first_interesting_node(seq)

        return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise Exception('Could not obtain next branch node or root:' + str(e))

@requires_user_role([UserRole.Browse])
def user_info(request, project_id=None):
    treenode_id = int(request.POST['treenode_id'])
    ts = Treenode.objects.filter(pk=treenode_id).select_related('user', 'editor')
    if not ts:
        ts = Connector.objects.filter(pk=treenode_id).select_related('user', 'editor')
        if not ts:
            return HttpResponse(json.dumps({'error': 'Object #%s is not a treenode or a connector' % treenode_id}))
    t = ts[0]
    # Get all reviews for this treenode
    reviewers = []
    review_times = []
    for r, rt in Review.objects.filter(treenode=t) \
            .values_list('reviewer', 'review_time'):
        reviewers.append(User.objects.filter(pk=r) \
                .values('username', 'first_name', 'last_name')[0])
        review_times.append(str(datetime.date(rt)))
    # Build result
    return HttpResponse(json.dumps({'user': {'username': t.user.username,
                                             'first_name': t.user.first_name,
                                             'last_name': t.user.last_name},
                                    'creation_time': str(datetime.date(t.creation_time)),
                                    'editor': {'username': t.editor.username,
                                               'first_name': t.editor.first_name,
                                               'last_name': t.editor.last_name},
                                    'edition_time': str(datetime.date(t.edition_time)),
                                    'reviewers': reviewers,
                                    'review_times': review_times}))


