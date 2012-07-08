import json

from django.http import HttpResponse
from django.db import connection
from django.shortcuts import get_object_or_404
from vncbrowser.models import ClassInstance, TreenodeClassInstance, Treenode, \
        Double3D, ClassInstanceClassInstance
from vncbrowser.transaction import transaction_reportable_commit_on_success, RollbackAndReport
from vncbrowser.views import catmaid_can_edit_project, catmaid_login_required
from vncbrowser.views.catmaid_replacements import get_relation_to_id_map, get_class_to_id_map
from common import insert_into_log


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_treenode(request, project_id=None, logged_in_user=None):
    """
    Add a new treenode to the database
    ----------------------------------

    1. Add new treenode for a given skeleton id. Parent should not be empty.
    return: new treenode id

    2. Add new treenode (root) and create a new skeleton (maybe for a given neuron)
    return: new treenode id and skeleton id.

    If a neuron id is given, use that one to create the skeleton as a model of it.
    """

    params = {}
    default_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'confidence': 0,
            'useneuron': -1,
            'parent_id': 0,
            'radius': 0,
            'targetgroup': 'none'}
    for p in default_values.keys():
        params[p] = request.POST.get(p, default_values[p])

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    def insert_new_treenode(parent_id=None, skeleton=None):
        new_treenode = Treenode()
        new_treenode.user = logged_in_user
        new_treenode.project_id = project_id
        new_treenode.location = Double3D(float(params['x']), float(params['y']), float(params['z']))
        new_treenode.radius = int(params['radius'])
        new_treenode.skeleton = skeleton
        new_treenode.confidence = int(params['confidence'])
        if parent_id:
            new_treenode.parent_id = parent_id
        new_treenode.save()
        return new_treenode

    def make_treenode_element_of_skeleton(treenode, skeleton):
        new_treenode_ci = TreenodeClassInstance()
        new_treenode_ci.user = logged_in_user
        new_treenode_ci.project_id = project_id
        new_treenode_ci.relation_id = relation_map['element_of']
        new_treenode_ci.treenode = treenode
        new_treenode_ci.class_instance = skeleton
        new_treenode_ci.save()

    def create_relation(relation_id, instance_a_id, instance_b_id):
        neuron_relation = ClassInstanceClassInstance()
        neuron_relation.user = logged_in_user
        neuron_relation.project_id = project_id
        neuron_relation.relation_id = relation_id
        neuron_relation.class_instance_a_id = instance_a_id
        neuron_relation.class_instance_b_id = instance_b_id
        neuron_relation.save()
        return neuron_relation

    def relate_neuron_to_skeleton(neuron, skeleton):
        return create_relation(relation_map['model_of'], skeleton, neuron)

    response_on_error = ''

    try:
        if int(params['parent_id']) != -1:  # A root node and parent node exist
            # Retrieve skeleton of parent
            response_on_error = 'Can not find skeleton for parent treenode %s in this project.' % params['parent_id']
            p_skeleton = TreenodeClassInstance.objects.filter(
                    treenode=params['parent_id'],
                    relation=relation_map['element_of'],
                    project=project_id)[0].class_instance

            response_on_error = 'Could not insert new treenode!'
            new_treenode = insert_new_treenode(params['parent_id'], p_skeleton)

            response_on_error = 'Could not create element_of relation between treenode and skeleton!'
            make_treenode_element_of_skeleton(new_treenode, p_skeleton)

            return HttpResponse(json.dumps({'treenode_id': new_treenode.id, 'skeleton_id': p_skeleton.id}))

        else:
            # No parent node: We must create a new root node, which needs a
            # skeleton and a neuron to belong to.
            response_on_error = 'Could not insert new treenode instance!'

            new_skeleton = ClassInstance()
            new_skeleton.user = logged_in_user
            new_skeleton.project_id = project_id
            new_skeleton.class_column_id = class_map['skeleton']
            new_skeleton.name = 'skeleton'
            new_skeleton.save()
            new_skeleton.name = 'skeleton %d' % new_skeleton.id
            new_skeleton.save()

            if int(params['useneuron']) != -1:  # A neuron already exists, so we use it
                response_on_error = 'Could not relate the neuron model to the new skeleton!'
                relate_neuron_to_skeleton(int(params['useneuron']), new_skeleton.id)

                response_on_error = 'Could not insert new treenode!'
                new_treenode = insert_new_treenode(None, new_skeleton)

                response_on_error = 'Could not create element_of relation between treenode and skeleton!'
                make_treenode_element_of_skeleton(new_treenode, new_skeleton)

                return HttpResponse(json.dumps({
                    'treenode_id': new_treenode.id,
                    'skeleton_id': new_skeleton.id,
                    'neuron_id': params['useneuron']}))
            else:
                # A neuron does not exist, therefore we put the new skeleton
                # into a new neuron, and put the new neuron into the fragments group.
                response_on_error = 'Failed to insert new instance of a neuron.'
                new_neuron = ClassInstance()
                new_neuron.user = logged_in_user
                new_neuron.project_id = project_id
                new_neuron.class_column_id = class_map['neuron']
                new_neuron.name = 'neuron'
                new_neuron.save()
                new_neuron.name = 'neuron %d' % new_neuron.id
                new_neuron.save()

                response_on_error = 'Could not relate the neuron model to the new skeleton!'
                relate_neuron_to_skeleton(new_neuron.id, new_skeleton.id)

                # Add neuron to fragments
                try:
                    fragment_group = ClassInstance.objects.filter(
                            name=params['targetgroup'],
                            project=project_id)[0]
                except IndexError:
                    # If the fragments group does not exist yet, must create it and add it:
                    response_on_error = 'Failed to insert new instance of group.'
                    fragment_group = ClassInstance()
                    fragment_group.user = logged_in_user
                    fragment_group.project_id = project_id
                    fragment_group.class_column_id = class_map['group']
                    fragment_group.name = params['targetgroup']
                    fragment_group.save()

                    response_on_error = 'Failed to retrieve root.'
                    root = ClassInstance.objects.filter(
                            project=project_id,
                            class_column=class_map['root'])[0]

                    response_on_error = 'Failed to insert part_of relation between root node and fragments group.'
                    create_relation(relation_map['part_of'], fragment_group.id, root.id)

                response_on_error = 'Failed to insert part_of relation between neuron id and fragments group.'
                create_relation(relation_map['part_of'], new_neuron.id, fragment_group.id)

                response_on_error = 'Failed to insert instance of treenode.'
                new_treenode = insert_new_treenode(None, new_skeleton)

                response_on_error = 'Failed to insert treenode into the skeleton'
                make_treenode_element_of_skeleton(new_treenode, new_skeleton)

                response_on_error = 'Failed to write to logs.'
                insert_into_log(project_id, logged_in_user.id, 'create_neuron', new_treenode.location, 'Create neuron %d and skeleton %d' % (new_neuron.id, new_skeleton.id))

                return HttpResponse(json.dumps({
                    'treenode_id': new_treenode.id,
                    'skeleton_id': new_skeleton.id,
                    'neuron_id': new_neuron.id,
                    'fragmentgroup_id': fragment_group.id
                    }))
    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport({'error': str(e)})
        else:
            raise RollbackAndReport({'error': response_on_error})


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def delete_treenode(request, project_id=None, logged_in_user=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    relation_map = get_relation_to_id_map(project_id)

    def get_class_instance_for_treenode(treenode, relation):
        return TreenodeClassInstance.objects.filter(
                project=project_id,
                relation=relation_map[relation],
                treenode=treenode)

    def get_ci_from_ci(class_instance, relation):
        return ClassInstanceClassInstance.objects.filter(
                project=project_id,
                relation=relation_map[relation],
                class_instance_a=class_instance)

    response_on_error = ''
    try:
        treenode = get_object_or_404(Treenode, id=treenode_id)
        if (treenode.parent is None):
            # This treenode is root. Each child treenode needs its own skeleton
            # that is part_of the original neuron.

            # Retrieve the original neuron id of this treenode's skeleton.
            response_on_error = 'Could not retrieve skeleton for this treenode.'
            skeleton_query = get_class_instance_for_treenode(treenode, 'element_of')
            skeleton = skeleton_query[0]

            # Does not do anything at the moment, will be useful when fixing
            # TODO below.
            # response_on_error = 'Could not find neuron for the skeleton.'
            # neuron = get_ci_from_ci(skeleton, 'model_of')[0]

            response_on_error = 'Could not retrieve children'
            children = Treenode.objects.filter(
                    project=project_id,
                    parent=treenode)

            if (children.count() > 0):
                raise RollbackAndReport({'error': "You can't delete the root node when it has children."})

            # Remove original skeleton.
            response_on_error = 'Could not delete skeleton.'
            skeleton_query.delete()

            # TODO Think we can do this pretty easily, comment from PHP function:
            # FIXME: do not remove neuron without checking if it has other skeletons!
            # $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$neu_id);

            # Remove treenode
            response_on_error = 'Could not delete treenode.'
            treenode.delete()

            return HttpResponse(json.dumps({'success': 'Removed treenode successfully.'}))

        else:
            # Treenode is not root it has a parent and children. We need to reconnect
            # all the children to the parent, and do not update the treenode element_of
            # skeleton relationship

            response_on_error = 'Could not update parent id of children nodes'
            children = Treenode.objects.filter(
                    project=project_id,
                    parent=treenode).update(parent=treenode.parent)

            response_on_error = 'Could not delete treenode #%d' % treenode.id
            treenode.delete()

            return HttpResponse(json.dumps({'message': 'Removed treenode successfully.'}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport({'error': str(e)})
        else:
            raise RollbackAndReport({'error': response_on_error})


@catmaid_login_required
@transaction_reportable_commit_on_success
def treenode_info(request, project_id=None, logged_in_user=None):
    treenode_id = request.POST.get('treenode_id', -1)
    if (treenode_id < 0):
        raise RollbackAndReport({'error': 'A treenode id has not been provided!'})

    c = connection.cursor()
    # Fetch all the treenodes which are in the bounding box:
    c.execute("""
SELECT ci.id as skeleton_id, ci.name as skeleton_name,
ci2.id as neuron_id, ci2.name as neuron_name
FROM treenode_class_instance tci, relation r, relation r2,
class_instance ci, class_instance ci2, class_instance_class_instance cici
WHERE ci.project_id = %s AND
tci.relation_id = r.id AND r.relation_name = 'element_of' AND
tci.treenode_id = %s AND ci.id = tci.class_instance_id AND
ci.id = cici.class_instance_a AND ci2.id = cici.class_instance_b AND
cici.relation_id = r2.id AND r2.relation_name = 'model_of'
                            """, (project_id, treenode_id))
    results = [
            dict(zip([col[0] for col in c.description], row))
            for row in c.fetchall()
            ]
    if (len(results) > 1):
        raise RollbackAndReport({'error': 'Found more than one skeleton and neuron for treenode %s' % treenode_id})
    elif (len(results) == 0):
        raise RollbackAndReport({'error': 'No skeleton and neuron for treenode %s' % treenode_id})
    else:
        return HttpResponse(json.dumps(results[0]))
