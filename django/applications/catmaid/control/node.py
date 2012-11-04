import json

from collections import defaultdict

from django.db import transaction, connection
from django.http import HttpResponse
from django.contrib.auth.decorators import login_required

from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

try:
    import networkx as nx
except:
    pass

@login_required
@transaction_reportable_commit_on_success
def node_list(request, project_id=None):
    # TODO This function is used very often and Catmaid would benefit from its
    # optimization. The following things should have big effects, ordered by
    # expected efficienct gain VS effort to implement.

    # - Stop using cursor_fetch_dictionary, dictionary creation requires an
    # entire iteration over each query result list. Instead access each
    # selected column directly.

    # - Do not use the two separate dictionaries treenodes_by_id and
    # connectors_by_id. Instead, just append newly queries data onto a result
    # list. This will require manually keeping track of connectors and their
    # places in the list when collecting their relation properties.

    # - Remove a connector's top level relation properties when it is first
    # encountered (when implementing the optimization above), instead of doing
    # so in a separate iteration over the result list/dictionary.

    params = {}
    # z: the section index in calibrated units.
    # width: the width of the field of view in calibrated units.
    # height: the height of the field of view in calibrated units.
    # zres: the resolution in the Z axis, used to determine the thickness of a section.
    # as: the ID of the active skeleton
    for p in ('z', 'width', 'height', 'zres', 'as'):
        params[p] = int(request.POST.get(p, 0))
    for p in ('top', 'left'):
        params[p] = float(request.POST.get(p, 0))
    params['limit'] = 2000  # Limit the number of retrieved treenodes.
    params['zbound'] = 1.0  # The scale factor to volume bound the query in z-direction based on the z-resolution.
    params['project_id'] = project_id
    
    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    if 'skeleton' not in class_map:
        raise CatmaidException('Can not find "skeleton" class for this project')

    for relation in ['presynaptic_to', 'postsynaptic_to', 'model_of']:
        if relation not in relation_map:
            raise CatmaidException('Can not find "%s" relation for this project' % relation)

    response_on_error = ''
    try:
        c = connection.cursor()
        # Fetch treenodes which are in the bounding box:
        response_on_error = 'Failed to query treenodes'
        c.execute('''
        SELECT treenode.id AS id,
            treenode.parent_id AS parentid,
            (treenode.location).x AS x,
            (treenode.location).y AS y,
            (treenode.location).z AS z,
            treenode.confidence AS confidence,
            treenode.user_id AS user_id,
            treenode.radius AS radius,
            ((treenode.location).z - %(z)s) AS z_diff,
            skeleton_id,
            'treenode' AS type
        FROM treenode
        WHERE
            treenode.project_id = %(project_id)s
            AND (treenode.location).x >= %(left)s
            AND (treenode.location).x <= (%(left)s + %(width)s)
            AND (treenode.location).y >= %(top)s
            AND (treenode.location).y <= (%(top)s + %(height)s)
            AND (treenode.location).z >= (%(z)s - %(zbound)s * %(zres)s)
            AND (treenode.location).z <= (%(z)s + %(zbound)s * %(zres)s)
        LIMIT %(limit)s
        ''', params)

        treenodes_by_id = {}
        for tn in cursor_fetch_dictionary(c):
            treenodes_by_id[tn['id']] = tn

        # Now, if an ID for the active skeleton was supplied, make sure
        # that all treenodes for that skeleton are added:
        if 0 != params['as']:
            response_on_error = "Failed to query active skeleton's (id %s) treenodes" % params['as']
            c.execute('''
            SELECT treenode.id AS id,
                treenode.parent_id AS parentid,
                (treenode.location).x AS x,
                (treenode.location).y AS y,
                (treenode.location).z AS z,
                treenode.confidence AS confidence,
                treenode.user_id AS user_id,
                treenode.radius AS radius,
                ((treenode.location).z - %(z)s) AS z_diff,
                skeleton_id,
                'treenode' AS type
            FROM treenode
            WHERE
                skeleton_id = %(as)s
            ''', params)
            active_skeleton_treenodes = cursor_fetch_dictionary(c)

            for tn in active_skeleton_treenodes:
                treenodes_by_id[tn['id']] = tn

        params['zbound'] = 4.1
        # Retrieve connectors that are synapses - do a LEFT OUTER JOIN with
        # the treenode_connector table, so that we get entries even if the
        # connector is not connected to any treenodes
        response_on_error = 'Failed to query connector locations.'
        c.execute('''
        SELECT connector.id AS id,
            (connector.location).x AS x,
            (connector.location).y AS y,
            (connector.location).z AS z,
            connector.confidence AS confidence,
            connector.user_id AS user_id,
            ((connector.location).z - %(z)s) AS z_diff,
            treenode_connector.relation_id AS treenode_relation_id,
            treenode_connector.treenode_id AS tnid,
            treenode_connector.confidence AS tc_confidence,
            'connector' AS type
        FROM connector LEFT OUTER JOIN treenode_connector
            ON treenode_connector.connector_id = connector.id
        WHERE connector.project_id = %(project_id)s AND
            (connector.location).x >= %(left)s AND
            (connector.location).x <= (%(left)s + %(width)s) AND
            (connector.location).y >= %(top)s AND
            (connector.location).y <= (%(top)s + %(height)s) AND
            (connector.location).z >= (%(z)s - %(zbound)s * %(zres)s) AND
            (connector.location).z <= (%(z)s + %(zbound)s * %(zres)s)
        ORDER BY id, z_diff LIMIT %(limit)s
        ''', params)
        connector_relations = cursor_fetch_dictionary(c)

        # Check for any treenodes that those connectors are linked to that
        # weren't either in the active skeleton or in the bounding box.
        # This is so that we can draw arrows from any displayed connector
        # to all of its connected treenodes, even if one is several slices
        # below.

        missing_treenode_ids = set()
        for cn in connector_relations:
            if cn['tnid'] is not None and cn['tnid'] not in treenodes_by_id:
                missing_treenode_ids.add(cn['tnid'])

        if len(missing_treenode_ids) > 0:
            params_z = float(params['z'])
            response_on_error = 'Failed to query treenodes from connectors'
            tnds = Treenode.objects.filter(
                id__in = missing_treenode_ids
            ).select_related('parent')
            for tn in tnds:
                treenodes_by_id[tn.id] = {
                    'id': tn.id,
                    'parentid': tn.parent_id,
                    'x': tn.location.x,
                    'y': tn.location.y,
                    'z': tn.location.z,
                    'confidence': tn.confidence,
                    'radius': tn.radius,
                    'z_diff': tn.location.z - params_z,
                    'skeleton_id': tn.skeleton_id,
                    'type': 'treenode'
                }

        # For each connector, collect its relation properties.
        connectors_by_id = {}
        for cn in connector_relations:
            cn_id = 'con_%s' % cn['id']

            # Enter a connector only once, and update the existing entry when
            # we encounter new connector entries with the same id (but other
            # relations) so that all relations are collected in one entry.
            if cn_id not in connectors_by_id:
                connectors_by_id[cn_id] = cn

            cn_entry = connectors_by_id[cn_id]

            if cn['tnid'] is not None:  # We have a relationship to add to the connector.
                tnid = cn['tnid']
                if cn['treenode_relation_id'] == relation_map['presynaptic_to']:
                    relationship = 'pre'
                else:
                    relationship = 'post'
                tc_confidence = cn['tc_confidence']

                # Ensure there is an array to hold relationships of this type.
                if relationship not in cn_entry:
                    cn_entry[relationship] = []

                cn_entry[relationship].append({
                    'tnid': tnid,
                    'confidence': tc_confidence})

        # Clean out connector relation info from the top level of each
        # connector, as it has been added to relationship arrays at this point.
        for cn in connectors_by_id.values():
            for key in ('tnid', 'treenode_relation_id', 'tc_confidence'):
                if key in cn:
                    del(cn[key])

        return HttpResponse(json.dumps(treenodes_by_id.values() + connectors_by_id.values()))

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))


@login_required
@transaction_reportable_commit_on_success
def node_list_tuples(request, project_id=None):
    ''' Retrieve an JSON array with two entries:
    [0] an array of arrays, each array representing a treenode
    [1] an array of arrays, each array representing a connector and containing
    arrays inside that specify the relations between the connector and treenodes.
    In this function tuples are used as much as possible for immutable list,
    and uses directly the tuples returned by the database cursor.
    The returned JSON data is therefore sensitive to indices in the array,
    so care must be taken never to alter the order of the variables in the SQL
    statements without modifying the accesses to said data both in this function
    and in the client that consumes it.
    '''
    params = {}
    # z: the section index in calibrated units.
    # width: the width of the field of view in calibrated units.
    # height: the height of the field of view in calibrated units.
    # zres: the resolution in the Z axis, used to determine the thickness of a section.
    # as: the ID of the active skeleton
    # top: the Y coordinate of the bounding box (field of view) in calibrated units
    # left: the X coordinate of the bounding box (field of view) in calibrated units
    for p in ('z', 'width', 'height', 'zres', 'as'):
        params[p] = int(request.POST.get(p, 0))
    for p in ('top', 'left'):
        params[p] = float(request.POST.get(p, 0))
    params['limit'] = 2000  # Limit the number of retrieved treenodes.
    params['project_id'] = project_id
    
    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    if 'skeleton' not in class_map:
        raise CatmaidException('Can not find "skeleton" class for this project')

    for relation in ['presynaptic_to', 'postsynaptic_to', 'model_of']:
        if relation not in relation_map:
            raise CatmaidException('Can not find "%s" relation for this project' % relation)

    try:
        cursor = connection.cursor()
        # Fetch treenodes which are in the bounding box,
        # which in z it includes the full thickess of the prior section
        # and of the next section (therefore the '<' and not '<=' for zhigh)
        response_on_error = 'Failed to query treenodes'
        z0 = params['z']
        zres = params['zres']
        params['zlow']  = z0 - zres
        params['zhigh'] = z0 + 2 * zres
        params['bottom'] = params['top'] + params['height']
        params['right'] = params['left'] + params['width']
        cursor.execute('''
        SELECT
            id,
            parent_id,
            (location).x AS x,
            (location).y AS y,
            (location).z AS z,
            confidence,
            user_id,
            radius,
            skeleton_id
        FROM treenode
        WHERE
            project_id = %(project_id)s
            AND (location).x >= %(left)s
            AND (location).x <= %(right)s
            AND (location).y >= %(top)s
            AND (location).y <= %(bottom)s
            AND (location).z >= %(zlow)s
            AND (location).z <  %(zhigh)s
        LIMIT %(limit)s
        ''', params)

        # A list of tuples, each tuple containing the selected columns for each treenode
        # The id is the first element of each tuple
        treenodes = []
        # A set of unique treenode IDs
        treenode_ids = set()

        for row in cursor.fetchall():
          treenodes.append(row)
          treenode_ids.add(row[0])

        # Ensure that the parents and children of all nodes of
        # the selected skeleton are added
        # (Doing it for all visible nodes in the section is far too expensive.)
        ids = set() # ids of nodes within visible section
        parent_ids = set() # ids of not yet fetched parents
        z1 = z0 + zres
        skeleton_id = params['as']
        for row in treenodes:
            if row[8] == skeleton_id and z0 <= row[4] < z1:
                # Collect node ids within visible section
                ids.add(row[0])
                # Check if the parent is loaded
                if row[1] and row[1] not in treenode_ids:
                    parent_ids.add(row[1])
        if ids: # There can only be parent_ids if there are ids
            # Select nodes whose Z is smaller than z0 or larger or equal than z1,
            # and whose parent is in ids or itself is in parent_ids
            # No need to specify the project_id
            query = '''
            SELECT
                id,
                parent_id,
                (location).x AS x,
                (location).y AS y,
                (location).z AS z,
                confidence,
                user_id,
                radius,
                skeleton_id
            FROM treenode
            WHERE
                skeleton_id = %s
                AND ''' % skeleton_id
            if parent_ids:
                query += "(id IN (%s) OR parent_id IN (%s))" %\
                    (','.join(str(x) for x in parent_ids), # tuple(missing_ids) would add numbers as 456L (notice the L), which fails in SQL
                     ','.join(str(x) for x in ids))
            else: # not parent_ids
                query += "parent_id IN (%s)" % ','.join(str(x) for x in ids)

            cursor.execute(query)
            for row in cursor.fetchall():
                tnid = row[0]
                if tnid not in treenode_ids:
                    treenode_ids.add(tnid)
                    treenodes.append(row)


        params['zlow'] = z0 - 4.0 * zres
        params['zhigh'] =  z0 + 5.0 * zres
        # Retrieve connectors that are synapses - do a LEFT OUTER JOIN with
        # the treenode_connector table, so that we get entries even if the
        # connector is not connected to any treenodes
        # Retrieves connectors up to 4 sections below and above
        response_on_error = 'Failed to query connector locations.'
        cursor.execute('''
        SELECT connector.id AS id,
            (connector.location).x AS x,
            (connector.location).y AS y,
            (connector.location).z AS z,
            connector.confidence AS confidence,
            connector.user_id AS user_id,
            treenode_connector.relation_id AS treenode_relation_id,
            treenode_connector.treenode_id AS tnid,
            treenode_connector.confidence AS tc_confidence
        FROM connector LEFT OUTER JOIN treenode_connector
            ON treenode_connector.connector_id = connector.id
        WHERE connector.project_id = %(project_id)s AND
            (connector.location).x >= %(left)s AND
            (connector.location).x <= %(right)s AND
            (connector.location).y >= %(top)s AND
            (connector.location).y <= %(bottom)s AND
            (connector.location).z >= %(zlow)s AND
            (connector.location).z <  %(zhigh)s
        LIMIT %(limit)s
        ''', params)


        # A list of tuples, each tuple containing the selected columns of each connector
        # which could be repeated given the join with treenode_connector
        connectors = []
        # A set of unique connector IDs
        connector_ids = set()
        # A set of missing treenode IDs
        missing_treenode_ids = set()
        # The relations between connectors and treenodes, stored
        # as connector ID keys vs a list of tuples, each with the treenode id,
        # the type of relation (presynaptic_to or postsynaptic_to), and the confidence.
        pre = defaultdict(list)
        post = defaultdict(list)

        for row in cursor.fetchall():
            # Collect treeenode IDs related to connectors but not yet in treenode_ids
            # because they lay beyond adjacent sections
            tnid = row[7] # The tnid column is index 7 (see SQL statement above)
            cid = row[0] # connector ID
            if tnid is not None:
                if tnid not in treenode_ids:
                    missing_treenode_ids.add(tnid)
                # Collect relations between connectors and treenodes
                # row[0]: connector id (cid above)
                # row[6]: treenode_relation_id
                # tow[7]: treenode_id (tnid above)
                # row[8]: tc_confidence
                if row[6] == relation_map['presynaptic_to']:
                    pre[cid].append((tnid, row[8]))
                else:
                    post[cid].append((tnid, row[8]))

            # Collect unique connectors
            if cid not in connector_ids:
                connectors.append(row)
                connector_ids.add(cid)

        # Fix connectors to contain only the relevant entries, plus the relations
        for i in xrange(len(connectors)):
            c = connectors[i]
            cid = c[0]
            connectors[i] = (cid, c[1], c[2], c[3], c[4], c[5], pre[cid], post[cid])


        # Fetch missing treenodes. These are related to connectors
        # but not in the bounding box or the active skeleton.
        # This is so that we can draw arrows from any displayed connector
        # to all of its connected treenodes, even if one is several slices
        # below.

        if missing_treenode_ids:
            params['missing'] = tuple(missing_treenode_ids)
            response_on_error = 'Failed to query treenodes from connectors'
            cursor.execute('''
            SELECT id,
                parent_id,
                (location).x AS x,
                (location).y AS y,
                (location).z AS z,
                confidence,
                user_id,
                radius,
                skeleton_id
            FROM treenode
            WHERE id IN %(missing)s''', params)

            for row in cursor.fetchall():
                treenodes.append(row)
                treenode_ids.add(row[0])

        labels = defaultdict(list)
        if request.POST['labels']:
            # Collect treenodes visible in the current section
            visible = ','.join(str(row[0]) for row in treenodes if z0 <= row[4] <= z1)
            if visible:
                cursor.execute('''
                SELECT treenode.id, class_instance.name
                FROM treenode, class_instance, treenode_class_instance, relation
                WHERE relation.id = treenode_class_instance.relation_id
                  AND relation.relation_name = 'labeled_as'
                  AND treenode_class_instance.treenode_id = treenode.id
                  AND class_instance.id = treenode_class_instance.class_instance_id
                  AND treenode.id IN (%s)
                ''' % visible)
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

            # Collect connectors visible in the current section
            visible = ','.join(str(row[0]) for row in connectors if z0 <= row[3] <= z1)
            if visible:
                cursor.execute('''
                SELECT connector.id, class_instance.name
                FROM connector, class_instance, connector_class_instance, relation
                WHERE relation.id = connector_class_instance.relation_id
                  AND relation.relation_name = 'labeled_as'
                  AND connector_class_instance.connector_id = connector.id
                  AND class_instance.id = connector_class_instance.class_instance_id
                  AND connector.id IN (%s)
                ''' % visible)
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

        return HttpResponse(json.dumps((treenodes, connectors, labels)))

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))



@login_required
def update_location_reviewer(request, project_id=None, node_id=None):
    """ Updates the reviewer id and review time of a node """
    p = get_object_or_404(Project, pk=project_id)
    loc = Location.objects.get(
        pk=node_id,
        project=p)
    loc.reviewer_id=request.user.id
    loc.review_time=datetime.now()
    loc.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')

@requires_user_role(UserRole.Annotate)
@transaction.commit_on_success
def update_confidence(request, project_id=None, node_id=0):
    new_confidence = request.POST.get('new_confidence', None)
    if (new_confidence == None):
        return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))
    else:
        parsed_confidence = int(new_confidence)
        if (parsed_confidence not in range(1, 6)):
            return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))

    tnid = int(node_id)

    if (request.POST.get('to_connector', 'false') == 'true'):
        toUpdate = TreenodeConnector.objects.filter(
            project=project_id,
            treenode=tnid)
    else:
        toUpdate = Treenode.objects.filter(
            project=project_id,
            id=tnid)

    rows_affected = toUpdate.update(confidence=new_confidence)

    if (rows_affected > 0):
        location = Location.objects.filter(project=project_id, id=tnid)[0].location
        insert_into_log(project_id, request.user.id, "change_confidence", location, "Changed to %s" % new_confidence)
    elif (request.POST.get('to_connector', 'false') == 'true'):
        return HttpResponse(json.dumps({'error': 'Failed to update confidence of treenode_connector between treenode %s and connector.' % tnid}))
    else:
        return HttpResponse(json.dumps({'error': 'Failed to update confidence of treenode_connector between treenode %s.' % tnid}))

    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@login_required
def most_recent_treenode(request, project_id=None):
    skeleton_id = request.POST.get('skeleton_id', -1)
    treenode_id = request.POST.get('treenode_id', -1)

    try:
        tn = Treenode.objects\
             .filter(project=project_id,
            skeleton=skeleton_id,
            user=request.user)\
             .extra(select={'most_recent': 'greatest(treenode.creation_time, treenode.edition_time)'})\
             .extra(order_by=['-most_recent', '-treenode.id'])[0]
    except IndexError:
        # TODO Not sure whether this is correct. This is the only place
        # where the treenode_id is used. Does it really have anything
        # to do with the query? The error message doesn't make much sense
        # either.
        return HttpResponse(json.dumps({'error': 'No skeleton and neuron found for treenode %s' % treenode_id}))
    except Exception as e:
        return HttpResponse(json.dumps({'error': str(e)}))

    return HttpResponse(json.dumps({
        'id': tn.id,
        'skeleton_id': tn.skeleton.id,
        'x': int(tn.location.x),
        'y': int(tn.location.y),
        'z': int(tn.location.z),
        # 'most_recent': str(tn.most_recent) + tn.most_recent.strftime('%z'),
        'most_recent': tn.most_recent.strftime('%Y-%m-%d %H:%M:%S.%f'),
        'type': 'treenode'
    }))


@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def node_update(request, project_id=None):
    nodes = {}
    for key, value in request.POST.items():
        parsed_key = re.search('^(?P<property>[a-zA-Z_]+)(?P<node_index>[0-9]+)$', key)
        if not parsed_key:
            continue
        node_index = parsed_key.group('node_index')
        node_property = parsed_key.group('property')
        if node_index not in nodes:
            nodes[node_index] = {}
        nodes[node_index][node_property] = value

    required_properties = ['node_id', 'x', 'y', 'z', 'type']
    for node_index, node in nodes.items():
        for req_prop in required_properties:
            if req_prop not in node:
                raise CatmaidException('Missing key: %s in index %s' % (req_prop, node_index))

        try:
            if node['type'] == 'treenode':
                Treenode.objects.filter(id=node['node_id']).update(
                    user=request.user,
                    location=Double3D(float(node['x']), float(node['y']), float(node['z'])))
            elif node['type'] == 'connector':
                Location.objects.filter(id=node['node_id']).update(
                    user=request.user,
                    location=Double3D(float(node['x']), float(node['y']), float(node['z'])))
            else:
                raise CatmaidException('Unknown node type: %s' % node['type'])
        except:
            raise CatmaidException('Failed to update treenode: %s' % node['node_id'])
    
    return HttpResponse(json.dumps({'updated': len(nodes)}))


@login_required
@transaction_reportable_commit_on_success
def node_nearest(request, project_id=None):
    params = {}
    param_defaults = {
        'x': 0,
        'y': 0,
        'z': 0,
        'skeleton_id': -1,
        'neuron_id': -1}
    for p in param_defaults.keys():
        params[p] = request.POST.get(p, param_defaults[p])
    relation_map = get_relation_to_id_map(project_id)

    if params['skeleton_id'] < 0 and params['neuron_id'] < 0:
        raise CatmaidException('You must specify either a skeleton or a neuron')

    for rel in ['part_of', 'model_of']:
        if rel not in relation_map:
            raise CatmaidException('Could not find required relation %s for project %s.' % (rel, project_id))

    skeletons = []
    if params['skeleton_id'] > 0:
        skeletons.append(params['skeleton_id'])

    message_on_error = ''
    try:
        if params['neuron_id'] > 0:  # Add skeletons related to specified neuron
            # Assumes that a cici 'model_of' relationship always involves a
            # skeleton as ci_a and a neuron as ci_b.
            message_on_error = 'Finding the skeletons failed.'
            neuron_skeletons = ClassInstanceClassInstance.objects.filter(
                class_instance_b=params['neuron_id'],
                relation=relation_map['model_of'])
            for neur_skel_relation in neuron_skeletons:
                skeletons.append(neur_skel_relation.class_instance_a_id)

        # Get all treenodes connected to skeletons
        message_on_error = 'Finding the treenodes failed.'
        treenodes = Treenode.objects.filter(project=project_id, skeleton__in=skeletons)

        def getNearestTreenode(x, y, z, treenodes):
            minDistance = -1
            nearestTreenode = None
            for tn in treenodes:
                xdiff = x - tn.location.x
                ydiff = y - tn.location.y
                zdiff = z - tn.location.z
                distanceSquared = xdiff ** 2 + ydiff ** 2 + zdiff ** 2
                if distanceSquared < minDistance or minDistance < 0:
                    nearestTreenode = tn
                    minDistance = distanceSquared
            return nearestTreenode

        nearestTreenode = getNearestTreenode(
            int(params['x']),
            int(params['y']),
            int(params['z']),
            treenodes)
        if nearestTreenode is None:
            raise CatmaidException('No treenodes were found.')

        # TODO Check if callers really need string data.
        # Return string data to emulate behavior of pg_fetch_assoc.
        return HttpResponse(json.dumps({
            'treenode_id': str(nearestTreenode.id),
            'x': str(int(nearestTreenode.location.x)),
            'y': str(int(nearestTreenode.location.y)),
            'z': str(int(nearestTreenode.location.z)),
            'skeleton_id': str(nearestTreenode.skeleton_id)}))

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))


def _skeleton_as_graph(skeleton_id):
    # Fetch all nodes of the skeleton
    cursor = connection.cursor()
    cursor.execute('''
        SELECT id, parent_id
        FROM treenode
        WHERE skeleton_id=%s''' % skeleton_id)
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
          (location).x AS x,
          (location).y AS y,
          (location).z AS z
        FROM treenode
        WHERE id=%s''' % treenode_id)
    return cursor.fetchone()

@login_required
def get_location(request, project_id=None):
    try:
        tnid = request.POST['tnid']
        return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise CatmaidException('Could not obtain the location of node with id #%s' % tnid)

@login_required
def find_previous_branchnode_or_root(request, project_id=None):
    try:
        tnid = int(request.POST['tnid'])
        graph = _skeleton_as_graph(request.POST['skid'])
        # Travel upstream until finding a parent node with more than one child 
        # or reaching the root node
        while True:
            parents = graph.predecessors(tnid)
            if parents: # list of parents is not empty
                tnid = parents[0] # Can ony have one parent
                if 1 != len(graph.successors(tnid)):
                    break # Found a branch node
            else:
                break # Found the root node
        return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise CatmaidException('Could not obtain previous branch node or root:' + str(e))

@login_required
def find_next_branchnode_or_end(request, project_id=None):
    try:
        tnid = int(request.POST['tnid'])
        graph = _skeleton_as_graph(request.POST['skid'])
        # Travel downstream until finding a child node with more than one child
        # or reaching an end node
        while True:
            children = graph.successors(tnid)
            if 1 == len(children):
                tnid = children[0]
            else:
                break # Found an end node or a branch node
        return HttpResponse(json.dumps(_fetch_location(tnid)))
    except Exception as e:
        raise CatmaidException('Could not obtain next branch node or root:' + str(e))

