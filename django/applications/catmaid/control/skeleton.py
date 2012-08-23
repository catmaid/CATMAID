from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

import json
import sys
try:
    import networkx as nx
except:
    pass

@catmaid_login_required
@transaction.commit_on_success
def split_skeleton(request, project_id=None, logged_in_user=None):
    treenode_id = request.POST['tnid']
    p = get_object_or_404(Project, pk=project_id)
    # retrieve skeleton
    ci = ClassInstance.objects.get(
        project=project_id,
        class_column__class_name='skeleton',
        treenodeclassinstance__relation__relation_name='element_of',
        treenodeclassinstance__treenode__id=treenode_id)
    skeleton_id = ci.id
    # retrieve neuron id of this skeleton
    sk = get_object_or_404(ClassInstance, pk=skeleton_id, project=project_id)
    neuron = ClassInstance.objects.filter(
        project=p,
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a=sk)
    # retrieve all nodes of the skeleton
    treenode_qs = Treenode.objects.filter(
        treenodeclassinstance__class_instance__id=skeleton_id,
        treenodeclassinstance__relation__relation_name='element_of',
        treenodeclassinstance__class_instance__class_column__class_name='skeleton',
        project=project_id).order_by('id')
    # build the networkx graph from it
    graph = nx.DiGraph()
    for e in treenode_qs:
        graph.add_node( e.id )
        if e.parent_id:
            graph.add_edge( e.parent_id, e.id )
        # find downstream nodes starting from target treenode_id
    # generate id list from it
    change_list = nx.bfs_tree(graph, int(treenode_id)).nodes()
    # create a new skeleton
    new_skeleton = ClassInstance()
    new_skeleton.name = 'Skeleton'
    new_skeleton.project = p
    new_skeleton.user = logged_in_user
    new_skeleton.class_column = Class.objects.get(class_name='skeleton', project=p)
    new_skeleton.save()
    new_skeleton.name = 'Skeleton {0}'.format( new_skeleton.id )
    new_skeleton.save()
    r = Relation.objects.get(relation_name='model_of', project=p)
    cici = ClassInstanceClassInstance()
    cici.class_instance_a = new_skeleton
    cici.class_instance_b = neuron[0]
    cici.relation = r
    cici.user = logged_in_user
    cici.project = p
    cici.save()
    # update skeleton_id of list in treenode table
    tns = Treenode.objects.filter(
        id__in=change_list,
        project=project_id).update(skeleton=new_skeleton)
    # update treenodeclassinstance element_of relation
    tci = TreenodeClassInstance.objects.filter(
        relation__relation_name='element_of',
        treenode__id__in=change_list,
        project=project_id).update(class_instance=new_skeleton)
    # setting parent of target treenode to null
    tc = TreenodeConnector.objects.filter(
        project=project_id,
        relation__relation_name__endswith = 'synaptic_to',
        treenode__in=change_list,
    ).update(skeleton=new_skeleton)
    Treenode.objects.filter(
        id=treenode_id,
        project=project_id).update(parent=None)
    locations = Location.objects.filter(
        project=project_id,
        id=treenode_id
    )
    if len(locations) > 0:
        location = locations[0].location
    insert_into_log( project_id, logged_in_user.id, "split_skeleton", location, "Split skeleton with ID {0} (neuron: {1})".format( skeleton_id, neuron[0].name ) )
    return HttpResponse(json.dumps({}), mimetype='text/json')


def join_skeleton(request, project_id=None, logged_in_user=None):
    pass

def reroot_skeleton(request, project_id=None, logged_in_user=None):
    pass

@catmaid_login_required
def root_for_skeleton(request, project_id=None, skeleton_id=None, logged_in_user=None):
    tn = Treenode.objects.get(
        project=project_id,
        parent__isnull=True,
        treenodeclassinstance__class_instance__id=skeleton_id)
    return HttpResponse(json.dumps({
        'root_id': tn.id,
        'x': tn.location.x,
        'y': tn.location.y,
        'z': tn.location.z}),
        mimetype='text/json')




@catmaid_login_required
@transaction_reportable_commit_on_success
def skeleton_ancestry(request, project_id=None, logged_in_user=None):
    # All of the values() things in this function can be replaced by
    # prefetch_related when we upgrade to Django 1.4 or above
    skeleton_id = request.POST.get('skeleton_id', None)
    if skeleton_id is None:
        raise RollbackAndReport('A skeleton id has not been provided!')

    relation_map = get_relation_to_id_map(project_id)
    for rel in ['model_of', 'part_of']:
        if rel not in relation_map:
            raise RollbackAndReport(' => "Failed to find the required relation %s' % rel)

    response_on_error = ''
    try:
        response_on_error = 'The search query failed.'
        neuron_rows = ClassInstanceClassInstance.objects.filter(
            class_instance_a=skeleton_id,
            relation=relation_map['model_of']).values(
            'class_instance_b',
            'class_instance_b__name')
        neuron_count = neuron_rows.count()
        if neuron_count == 0:
            raise RollbackAndReport('No neuron was found that the skeleton %s models' % skeleton_id)
        elif neuron_count > 1:
            raise RollbackAndReport('More than one neuron was found that the skeleton %s models' % skeleton_id)

        parent_neuron = neuron_rows[0]
        ancestry = []
        ancestry.append({
            'name': parent_neuron['class_instance_b__name'],
            'id': parent_neuron['class_instance_b'],
            'class': 'neuron'})

        # Doing this query in a loop is horrible, but it should be very rare
        # for the hierarchy to be more than 4 deep or so.  (This is a classic
        # problem of not being able to do recursive joins in pure SQL.) Just
        # in case a cyclic hierarchy has somehow been introduced, limit the
        # number of parents that may be found to 10.
        current_ci = parent_neuron['class_instance_b']
        for i in range(10):
            response_on_error = 'Could not retrieve parent of class instance %s' % current_ci
            parents = ClassInstanceClassInstance.objects.filter(
                class_instance_a=current_ci,
                relation=relation_map['part_of']).values(
                'class_instance_b__name',
                'class_instance_b',
                'class_instance_b__class_column__class_name')
            parent_count = parents.count()
            if parent_count == 0:
                break  # We've reached the top of the hierarchy.
            elif parent_count > 1:
                raise RollbackAndReport('More than one class_instance was found that the class_instance %s is part_of.' % current_ci)
            else:
                parent = parents[0]
                ancestry.append({
                    'name': parent['class_instance_b__name'],
                    'id': parent['class_instance_b'],
                    'class': parent['class_instance_b__class_column__class_name']
                })
                current_ci = parent['class_instance_b']

        return HttpResponse(json.dumps(ancestry))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_login_required
def skeleton_info(request, project_id=None, skeleton_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)

    neuron_id = request.POST['neuron_id']

    n = get_object_or_404(ClassInstance, pk=neuron_id, project=project_id)

    skeletons = ClassInstance.objects.filter(
        project=p,
        cici_via_a__relation__relation_name='model_of',
        class_column__class_name='skeleton',
        cici_via_a__class_instance_b=n)

    outgoing = n.all_neurons_downstream(project_id, skeletons)
    incoming = n.all_neurons_upstream(project_id, skeletons)

    outgoing = [x for x in outgoing if not x['name'].startswith('orphaned ')]
    incoming = [x for x in incoming if not x['name'].startswith('orphaned ')]

    data = {
        'incoming': incoming,
        'outgoing': outgoing
    }

    json_return = json.dumps(data, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')



@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def reroot_skeleton(request, project_id=None, logged_in_user=None):
    treenode_id = request.POST.get('tnid', None)
    if treenode_id is None:
        raise RollbackAndReport('A treenode id has not been provided!')

    response_on_error = ''
    try:
        response_on_error = 'Failed to select treenode with id %s.' % treenode_id
        treenode = Treenode.objects.filter(
            id=treenode_id,
            project=project_id)

        # no parent found or is root, then return
        response_on_error = 'An error occured while rerooting. No valid query result.'
        treenode = treenode[0]

        first_parent = treenode.parent
        if first_parent is None:
            raise RollbackAndReport('An error occured while rerooting. No valid query result.')

        # Traverse up the chain of parents, reversing the parent relationships so
        # that the selected treenode (with ID treenode_id) becomes the root.
        node_to_become_new_parent = treenode
        change_node = first_parent  # Will have its parent changed each iteration.
        while True:
            # The parent's parent will have its parent changed next iteration.
            change_nodes_old_parent = change_node.parent

            response_on_error = 'Failed to update treenode with id %s to have new parent %s' % (change_node.id, node_to_become_new_parent.id)
            change_node.parent = node_to_become_new_parent
            change_node.save()

            if change_nodes_old_parent is None:
                break
            else:
                node_to_become_new_parent = change_node
                change_node = change_nodes_old_parent

        # Finally make treenode root
        response_on_error = 'Failed to set treenode with ID %s as root.' % treenode.id
        treenode.parent = None
        treenode.save()

        response_on_error = 'Failed to log reroot.'
        insert_into_log(project_id, logged_in_user.id, 'reroot_skeleton', treenode.location, 'Rerooted skeleton for treenode with ID %s' % treenode.id)

        return HttpResponse(json.dumps({'newroot': treenode.id}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def join_skeleton(request, project_id=None, logged_in_user=None):
    from_treenode = request.POST.get('from_id', None)
    to_treenode = request.POST.get('to_id', None)
    if from_treenode is None or to_treenode is None:
        raise RollbackAndReport('From treenode or to treenode not given.')
    else:
        from_treenode = int(from_treenode)
        to_treenode = int(to_treenode)

    relation_map = get_relation_to_id_map(project_id)
    if 'element_of' not in relation_map:
        raise RollbackAndReport('Could not find element_of relation.')

    response_on_error = ''
    try:
        response_on_error = 'Can not find skeleton for from-treenode.'
        from_skeleton = TreenodeClassInstance.objects.filter(
            project=project_id,
            treenode=from_treenode,
            relation=relation_map['element_of'])[0].class_instance_id

        response_on_error = 'Can not find skeleton for to-treenode.'
        to_skeleton = TreenodeClassInstance.objects.filter(
            project=project_id,
            treenode=to_treenode,
            relation=relation_map['element_of'])[0].class_instance_id

        if from_skeleton == to_skeleton:
            raise RollbackAndReport('Please do not join treenodes of the same skeleton. This introduces loops.')

        # Update element_of relationship of target skeleton the target skeleton is
        # removed and its treenode assume the skeleton id of the from-skeleton.

        response_on_error = 'Could not update TreenodeClassInstance table.'
        TreenodeClassInstance.objects.filter(
            class_instance=to_skeleton,
            relation=relation_map['element_of']).update(
            class_instance=from_skeleton)

        response_on_error = 'Could not update Treenode table.'
        Treenode.objects.filter(
            skeleton=to_skeleton).update(skeleton=from_skeleton)

        response_on_error = 'Could not update TreenodeConnector table.'
        TreenodeConnector.objects.filter(
            skeleton=to_skeleton).update(skeleton=from_skeleton)

        # Remove skeleton of to_id (should delete part of to neuron by cascade,
        # leaving the parent neuron dangeling in the object tree).

        response_on_error = 'Could not delete skeleton with ID %s.' % to_skeleton
        ClassInstance.objects.filter(id=to_skeleton).delete()

        # Update the parent of to_treenode.
        response_on_error = 'Could not update parent of treenode with ID %s' % to_treenode
        Treenode.objects.filter(id=to_treenode).update(parent=from_treenode)

        response_on_error = 'Could not log actions.'
        location = get_object_or_404(Treenode, id=from_treenode).location
        insert_into_log(project_id, logged_in_user.id, 'join_skeleton', location, 'Joined skeleton with ID %s to skeleton with ID %s' % (from_skeleton, to_skeleton))

        return HttpResponse(json.dumps({
            'message': 'success',
            'fromid': from_treenode,
            'toid': to_treenode}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)

