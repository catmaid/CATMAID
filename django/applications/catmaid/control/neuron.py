import json

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db import connection
from django.contrib.auth.models import User

from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail, can_edit_all_or_fail
from catmaid.control.common import insert_into_log
from catmaid.models import UserRole, Project, Class, ClassInstance, \
        ClassInstanceClassInstance, Relation, Treenode

import operator
from collections import defaultdict


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_all_skeletons_of_neuron(request, project_id=None, neuron_id=None):
    p = get_object_or_404(Project, pk=project_id)
    neuron = get_object_or_404(ClassInstance,
        pk=neuron_id,
        class_column__class_name='neuron',
        project=p)
    qs = ClassInstance.objects.filter(
        project=p,
        cici_via_a__relation__relation_name='model_of',
        cici_via_a__class_instance_b=neuron)
    return HttpResponse(json.dumps([x.id for x in qs]), content_type="application/json")

def _delete_if_empty(neuron_id):
    """ Delete this neuron if no class_instance is a model_of it;
    which is to say, it contains no skeletons. """
    is_empty = not ClassInstanceClassInstance.objects.filter(
            class_instance_b=neuron_id,
            relation__relation_name='model_of').exists()
    if is_empty:
        ClassInstance.objects.filter(pk=neuron_id).delete()
    return is_empty

@requires_user_role(UserRole.Annotate)
def delete_neuron(request, project_id=None, neuron_id=None):
    """ Deletes a neuron if and only if two things are the case: 1. The user
    ownes all treenodes of the skeleton modeling the neuron in question and
    2. The neuron is not annotated by other users.
    """
    # Make sure the user can edit the neuron in general
    can_edit_class_instance_or_fail(request.user, neuron_id, 'neuron')

    # Create class and relation dictionaries
    classes = dict(Class.objects.filter(
            project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(
            project_id=project_id).values_list('relation_name', 'id'))

    # Make sure the user has permission to edit all treenodes of all skeletons
    skeleton_ids = ClassInstanceClassInstance.objects.filter(
            class_instance_b=neuron_id,
            relation_id=relations['model_of']).values_list(
                    'class_instance_a', flat=True)
    for skid in skeleton_ids:
        others_nodes = Treenode.objects.filter(skeleton_id=skid).exclude(
                user_id=request.user.id).values_list('id', flat=True)
        if others_nodes:
            try:
                can_edit_all_or_fail(request.user, others_nodes, 'treenode')
            except Exception:
                raise Exception("You don't have permission to remove all " \
                        "treenodes of skeleton %s modeling this neuron. The " \
                        "neuron won't be deleted." % skid)

    # Make sure the user has permission to edit all annotations of this neuron
    annotation_ids = set(ClassInstanceClassInstance.objects.filter(
            class_instance_a_id=neuron_id,
            relation_id=relations['annotated_with']).values_list(
                    'id', flat=True))
    if annotation_ids:
        try:
            can_edit_all_or_fail(request.user, annotation_ids,
                    'class_instance_class_instance')
        except Exception:
            raise Exception("You don't have permission to remove all " \
                    "annotations linked to this neuron. The neuron won't " \
                    "be deleted.")

    # Try to get the root node to have a valid location for a log entry
    if skeleton_ids:
        try:
            root_node = Treenode.objects.get(
                    skeleton_id=skeleton_ids[0], parent=None)
            root_location = (root_node.location_x, root_node.location_y,
                             root_node.location_z)
        except (Treenode.DoesNotExist, Treenode.MultipleObjectsReturned):
            root_location = None
    else:
        root_location = None

    # Delete neuron (and implicitely all annotation links due to Django's
    # cascading deletion)
    neuron = get_object_or_404(ClassInstance, pk=neuron_id)
    neuron.delete()

    # Delete all annotations that are not used anymore
    used_annotation_ids = set(ClassInstanceClassInstance.objects.filter(
            class_instance_b_id__in=annotation_ids,
            relation_id=relations['annotated_with']).values_list(
                    'id', flat=True))
    unused_annotation_ids = annotation_ids.difference(used_annotation_ids)
    ClassInstance.objects.filter(id__in=unused_annotation_ids).delete()

    # Delete the skeletons (and their treenodes through cascading delete)
    cursor = connection.cursor()
    for skid in skeleton_ids:
        # Because there are constraints used in the database that Django is not
        # aware of, it's emulation of cascading deletion doesn't work.
        # Therefore, raw SQL needs to be used to use true cascading deletion.
        cursor.execute('''
        BEGIN;
        DELETE FROM change_request WHERE treenode_id IN (
            SELECT id FROM treenode WHERE skeleton_id=%s AND project_id=%s);
        DELETE FROM change_request WHERE connector_id IN (
            SELECT id FROM treenode_connector WHERE skeleton_id=%s AND project_id=%s);
        DELETE FROM treenode_class_instance WHERE treenode_id IN (
            SELECT id FROM treenode WHERE skeleton_id=%s AND project_id=%s);
        DELETE FROM treenode WHERE skeleton_id=%s AND project_id=%s;
        DELETE FROM treenode_connector WHERE skeleton_id=%s AND project_id=%s;
        DELETE FROM class_instance WHERE id=%s AND project_id=%s;
        DELETE FROM review WHERE skeleton_id=%s AND project_id=%s;
        COMMIT;
        ''', (skid, project_id) * 7)

    # Insert log entry and refer to position of the first skeleton's root node
    insert_into_log(project_id, request.user.id, 'remove_neuron', root_location,
            'Deleted neuron %s and skeleton(s) %s.' % (neuron_id,
                    ', '.join([str(s) for s in skeleton_ids])))

    return HttpResponse(json.dumps({
        'skeleton_ids': list(skeleton_ids),
        'success': "Deleted neuron #%s as well as its skeletons and " \
                "annotations." % neuron_id}))

@requires_user_role(UserRole.Annotate)
def give_neuron_to_other_user(request, project_id=None, neuron_id=None):
    neuron_id = int(neuron_id)
    target_user = User.objects.get(pk=int(request.POST['target_user_id']))

    # 1. Check that the request.user is superuser
    #    or owns the neuron and the skeletons under it
    neuron = ClassInstance.objects.get(pk=neuron_id)
    if not request.user.is_superuser and neuron.user.id != request.user.id:
        return HttpResponse(json.dumps({'error': 'You don\'t own the neuron!'}))

    qs = ClassInstanceClassInstance.objects.filter(
            class_instance_b=neuron_id,
            relation__relation_name='model_of').values_list('class_instance_a__user_id', 'class_instance_a')
    skeletons = defaultdict(list) # user_id vs list of owned skeletons
    for row in qs:
        skeletons[row[0]].append(row[1])

    if not skeletons:
        return HttpResponse(json.dumps({'error': 'The neuron does not contain any skeletons!'}))

    sks = {k:v[:] for k,v in skeletons.iteritems()} # deep copy
    if request.user.id in sks:
        del sks[request.user.id]
    if not request.user.is_superuser and sks:
        return HttpResponse(json.dumps({'error': 'You don\'t own: %s' % reduce(operator.add, sks.values())}))

    # 2. Change neuron's and skeleton's and class_instance_class_instance relationship owner to target_user

    # Update user_id of the relation 'model_of' between any skeletons and the chosen neuron
    ClassInstanceClassInstance.objects.filter(
        relation__relation_name='model_of',
        class_instance_b=neuron_id).update(user=target_user)

    # Update user_id of the neuron
    ClassInstance.objects.filter(pk=neuron_id).update(user=target_user)

    # Update user_id of the skeleton(s)
    ClassInstance.objects.filter(pk__in=reduce(operator.add, skeletons.values())).update(user=target_user)

    return HttpResponse(json.dumps({'success':'Moved neuron #%s to %s staging area.'}))


@requires_user_role(UserRole.Annotate)
def rename_neuron(request, project_id=None, neuron_id=None):
    """Rename a neuron if it is not locked by a user on which the current user
    has no permission.
    """
    # Make sure the user can edit the neuron
    can_edit_class_instance_or_fail(request.user, neuron_id, 'neuron')
    new_name = request.POST.get('name', None)
    if not new_name:
        raise ValueError("No name specified")
    # Do not allow '|' in name because it is used as string separator in NeuroHDF export
    if '|' in new_name:
        raise ValueError('New name should not contain pipe character')

    # Update neuron name
    neuron = ClassInstance.objects.get(id=neuron_id)
    old_name = neuron.name
    neuron.name=new_name
    neuron.save()

    # Insert log entry and return successfully
    insert_into_log(project_id, request.user.id, "rename_neuron", None,
                    "Renamed neuron with ID %s from %s to %s" % (neuron.id , old_name, new_name))

    return HttpResponse(json.dumps({
        'success': True,
        'renamed_neuron': neuron.id
    }))
