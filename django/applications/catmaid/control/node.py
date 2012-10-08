import json

from django.db import transaction, connection
from django.http import HttpResponse
from django.contrib.auth.decorators import login_required

from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@login_required
@transaction_reportable_commit_on_success
def node_list(request, project_id=None):
    # TODO This function is used very often and Catmaid would benefit from its
    # optimization. The following things should have big effects, ordered by
    # expected efficiencty gain VS effort to implement.

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
    for p in ('z', 'top', 'left', 'width', 'height', 'zres', 'as'):
        params[p] = int(request.POST.get(p, 0))
    params['limit'] = 2000  # Limit the number of retrieved treenodes.
    params['zbound'] = 1.0  # The scale factor to volume bound the query in z-direction based on the z-resolution.
    params['project_id'] = project_id
    
    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    for class_name in ['skeleton']:
        if class_name not in class_map:
            raise RollbackAndReport('Can not find "%s" class for this project' % class_name)

    for relation in ['presynaptic_to', 'postsynaptic_to', 'model_of', 'element_of']:
        if relation not in relation_map:
            raise RollbackAndReport('Can not find "%s" relation for this project' % relation)

    response_on_error = ''
    try:
        c = connection.cursor()
        # Fetch treenodes which are in the bounding box:
        response_on_error = 'Failed to query treenodes.'
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
        treenodes_q = cursor_fetch_dictionary(c)
        for tn in treenodes_q:
            treenodes_by_id[tn['id']] = tn

        # Now, if an ID for the active skeleton was supplied, make sure
        # that all treenodes for that skeleton are added:
        if (params['as'] != 0):
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

        missing_treenode_ids = []
        for cn in connector_relations:
            if cn['tnid'] is not None and cn['tnid'] not in treenodes_by_id:
                missing_treenode_ids.append(cn['tnid'])
        params['missing_treenode_ids'] = ','.join(map(str, missing_treenode_ids))

        if len(missing_treenode_ids) > 0:
            response_on_error = 'Failed to query treenodes from connectors.'
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
                    'z_diff': float(tn.location.z) - float(params['z']),
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
            for key in ['tnid', 'treenode_relation_id', 'tc_confidence']:
                if key in cn:
                    del(cn[key])

        return HttpResponse(json.dumps(treenodes_by_id.values() + connectors_by_id.values()))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error + ';' + str(e))


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
             .extra(order_by=['-most_recent'])[0]
    except IndexError:
        # TODO Not sure whether this is correct. This is the only place
        # where the treenode_id is used. Does it really have anything
        # to do with the query? The error message doesn't make much sense
        # either.
        return HttpResponse(json.dumps({'error': 'No skeleton and neuron found for treenode %s' % treenode_id}))

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
                raise RollbackAndReport('Missing key: %s in index %s' % (req_prop, node_index))

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
                raise RollbackAndReport('Unknown node type: %s' % node['type'])
        except:
            raise RollbackAndReport('Failed to update treenode: %s' % node['node_id'])
    
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
        raise RollbackAndReport('You must specify either a skeleton or a neuron')

    for rel in ['part_of', 'model_of']:
        if rel not in relation_map:
            raise RollbackAndReport('Could not find required relation %s for project %s.' % (rel, project_id))

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
            raise RollbackAndReport('No treenodes were found.')

        # TODO Check if callers really need string data.
        # Return string data to emulate behavior of pg_fetch_assoc.
        return HttpResponse(json.dumps({
            'treenode_id': str(nearestTreenode.id),
            'x': str(int(nearestTreenode.location.x)),
            'y': str(int(nearestTreenode.location.y)),
            'z': str(int(nearestTreenode.location.z)),
            'skeleton_id': str(nearestTreenode.skeleton_id)}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (message_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(message_on_error)