import json

from django.db import transaction, connection
from django.http import HttpResponse

from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@catmaid_login_required
def node_list(request, project_id=None, logged_in_user=None):
    # This is probably the most complex view.  For the moment, I'm
    # just using the same queries as before:
    relation_to_id = get_relation_to_id_map(project_id)
    class_to_id = get_class_to_id_map(project_id)
    presyn_id = relation_to_id['presynaptic_to']
    query_parameters = {}
    for p in ('left', 'width', 'top', 'height', 'z', 'zres'):
        query_parameters[p] = request.GET[p]
    query_parameters['limit'] = 400
    query_parameters['zbound'] = 1.0
    query_parameters['project_id'] = project_id
    c = connection.cursor()
    # Fetch all the treenodes which are in the bounding box:
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
       treenode_class_instance.class_instance_id AS skeleton_id,
       'treenode' AS type
   FROM (treenode INNER JOIN relation ON (relation.relation_name = 'element_of' AND relation.project_id = treenode.project_id))
      LEFT OUTER JOIN (treenode_class_instance
         INNER JOIN (class_instance INNER JOIN class ON class_instance.class_id = class.id AND class.class_name = 'skeleton')
         ON treenode_class_instance.class_instance_id = class_instance.id)
      ON (treenode_class_instance.treenode_id = treenode.id AND treenode_class_instance.relation_id = relation.id)
   WHERE treenode.project_id = %(project_id)s
      AND (treenode.location).x >= %(left)s
      AND (treenode.location).x <= (CAST (%(left)s AS double precision) + %(width)s)
      AND (treenode.location).y >= %(top)s
      AND (treenode.location).y <= (CAST (%(top)s AS double precision) + %(height)s)
      AND (treenode.location).z >= %(z)s - CAST (%(zbound)s AS double precision) * %(zres)s
      AND (treenode.location).z <= %(z)s + CAST (%(zbound)s AS double precision) * %(zres)s
      ORDER BY parentid DESC, id, z_diff
      LIMIT %(limit)s
''',
        query_parameters)
    headings = c.description
    treenodes = [dict(zip((column[0] for column in headings), row))
                 for row in c.fetchall()]

    query_parameters['model_of_id'] = relation_to_id['model_of']
    query_parameters['synapse_id'] = class_to_id['synapse']
    # Now find all the connectors in the same region:
    c.execute('''
SELECT connector.id AS id,
       (connector.location).x AS x,
       (connector.location).y AS y,
       (connector.location).z AS z,
       connector.user_id AS user_id,
       ((connector.location).z - %(z)s) AS z_diff,
       treenode_connector.relation_id AS treenode_relation_id,
       treenode_connector.treenode_id AS tnid,
       'connector' AS type
    FROM connector_class_instance AS lci, class_instance AS ci, connector
        LEFT OUTER JOIN treenode_connector ON treenode_connector.connector_id = connector.id
       WHERE connector.project_id = %(project_id)s AND
           (connector.location).x >= %(left)s AND
           (connector.location).x <= CAST (%(left)s AS double precision) + %(width)s AND
           (connector.location).y >= %(top)s AND
           (connector.location).y <= CAST (%(top)s AS double precision) + %(height)s AND
           (connector.location).z >= %(z)s - CAST (%(zbound)s AS double precision) * %(zres)s AND
           (connector.location).z <= %(z)s + CAST (%(zbound)s AS double precision) * %(zres)s AND
           connector.id = lci.connector_id AND
           ci.id = lci.class_instance_id AND
           lci.relation_id = %(model_of_id)s AND
           ci.class_id = %(synapse_id)s
        ORDER BY id, z_diff LIMIT %(limit)s
''',
        query_parameters)
    headings = c.description
    connectors = [dict(zip((column[0] for column in headings), row))
                  for row in c.fetchall()]

    already_seen_connectors = {}
    pushed_treenodes = len(treenodes)

    # FIXME: this is taken directly from the PHP, and could be simplified
    # a great deal.
    for connector in connectors:
        connector_id = connector['id']
        if connector['tnid']:
            tnid = connector['tnid']
            relationship = 'pre' if (connector['treenode_relation_id'] == presyn_id) else 'post'
        else:
            tnid = None
            relationship = None
        reuse = connector_id in already_seen_connectors
        val = connector
        del val['tnid']
        del val['treenode_relation_id']
        if reuse:
            existing_index = already_seen_connectors[connector_id]
            if tnid:
                val = treenodes[existing_index]
            else:
                val = None
        if val:
            if tnid:
                val.setdefault(relationship, [])
                val[relationship].append({'tnid': tnid})
            if reuse:
                treenodes[existing_index] = val
            else:
                treenodes.append(val)
                already_seen_connectors[connector_id] = pushed_treenodes
                pushed_treenodes += 1

    return HttpResponse(json.dumps(treenodes), mimetype='text/json')

@catmaid_login_required
def update_location_reviewer(request, project_id=None, node_id=None, logged_in_user=None):
    """ Updates the reviewer id and review time of a node """
    p = get_object_or_404(Project, pk=project_id)
    loc = Location.objects.get(
        pk=node_id,
        project=p)
    loc.reviewer_id=logged_in_user.id
    loc.review_time=datetime.now()
    loc.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')

@catmaid_can_edit_project
@transaction.commit_on_success
def update_confidence(request, project_id=None, logged_in_user=None, node_id=0):
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
        insert_into_log(project_id, logged_in_user.id, "change_confidence", location, "Changed to %s" % new_confidence)
    elif (request.POST.get('to_connector', 'false') == 'true'):
        return HttpResponse(json.dumps({'error': 'Failed to update confidence of treenode_connector between treenode %s and connector.' % tnid}))
    else:
        return HttpResponse(json.dumps({'error': 'Failed to update confidence of treenode_connector between treenode %s.' % tnid}))

    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@catmaid_login_required
def most_recent_treenode(request, project_id=None, logged_in_user=None):
    skeleton_id = request.POST.get('skeleton_id', -1)
    treenode_id = request.POST.get('treenode_id', -1)

    try:
        tn = Treenode.objects\
             .filter(project=project_id,
            skeleton=skeleton_id,
            user=logged_in_user)\
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


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def node_update(request, project_id=None, logged_in_user=None):
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
                    user=logged_in_user,
                    location=Double3D(float(node['x']), float(node['y']), float(node['z'])))
            elif node['type'] == 'connector':
                Location.objects.filter(id=node['node_id']).update(
                    user=logged_in_user,
                    location=Double3D(float(node['x']), float(node['y']), float(node['z'])))
            else:
                raise RollbackAndReport('Unknown node type: %s' % node['type'])
        except:
            raise RollbackAndReport('Failed to update treenode: %s' % node['node_id'])

    return HttpResponse(json.dumps({'updated': len(nodes)}))


@catmaid_login_required
@transaction_reportable_commit_on_success
def node_nearest(request, project_id=None, logged_in_user=None):
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