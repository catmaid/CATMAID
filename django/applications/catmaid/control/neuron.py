# -*- coding: utf-8 -*-

from collections import defaultdict
import datetime
from functools import reduce
import json
import operator
from typing import Any, DefaultDict, List, Optional, Tuple

from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.db import connection
from django.contrib.auth.models import User

from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail, can_edit_all_or_fail
from catmaid.control.common import insert_into_log, get_request_list, \
        get_class_to_id_map
from catmaid.models import UserRole, Project, Class, ClassInstance, \
        ClassInstanceClassInstance, Relation, Treenode

from rest_framework.decorators import api_view



@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_all_skeletons_of_neuron(request:HttpRequest, project_id=None, neuron_id=None) -> JsonResponse:
    skeleton_ids = _get_all_skeletons_of_neuron(project_id, neuron_id)
    return JsonResponse(skeleton_ids, safe=False)

def _get_all_skeletons_of_neuron(project_id, neuron_id) -> List:
    p = get_object_or_404(Project, pk=project_id)
    neuron = get_object_or_404(ClassInstance,
        pk=neuron_id,
        class_column__class_name='neuron',
        project=p)
    qs = ClassInstance.objects.filter(
        project=p,
        cici_via_a__relation__relation_name='model_of',
        cici_via_a__class_instance_b=neuron)
    return [x.id for x in qs]

def _delete_if_empty(neuron_id) -> bool:
    """ Delete this neuron if no class_instance is a model_of it;
    which is to say, it contains no skeletons. """
    is_empty = not ClassInstanceClassInstance.objects.filter(
            class_instance_b=neuron_id,
            relation__relation_name='model_of').exists()
    if is_empty:
        ClassInstance.objects.filter(pk=neuron_id).delete()
    return is_empty

@requires_user_role(UserRole.Annotate)
def delete_neuron(request:HttpRequest, project_id=None, neuron_id=None) -> JsonResponse:
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
                             root_node.location_z) # type: Optional[Tuple[Any, Any, Any]]
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

    return JsonResponse({
        'skeleton_ids': list(skeleton_ids),
        'success': "Deleted neuron #%s as well as its skeletons and " \
                "annotations." % neuron_id
    })

@requires_user_role(UserRole.Annotate)
def give_neuron_to_other_user(request:HttpRequest, project_id=None, neuron_id=None) -> JsonResponse:
    neuron_id = int(neuron_id)
    target_user = User.objects.get(pk=int(request.POST['target_user_id']))

    # 1. Check that the request.user is superuser
    #    or owns the neuron and the skeletons under it
    neuron = ClassInstance.objects.get(pk=neuron_id)
    if not request.user.is_superuser and neuron.user.id != request.user.id:
        return JsonResponse({'error': 'You don\'t own the neuron!'})

    qs = ClassInstanceClassInstance.objects.filter(
            class_instance_b=neuron_id,
            relation__relation_name='model_of').values_list('class_instance_a__user_id', 'class_instance_a')
    skeletons = defaultdict(list) # type: DefaultDict[Any, List]
                                  # user_id vs list of owned skeletons
    for row in qs:
        skeletons[row[0]].append(row[1])

    if not skeletons:
        return JsonResponse({'error': 'The neuron does not contain any skeletons!'})

    sks = {k:v[:] for k,v in skeletons.items()} # deep copy
    if request.user.id in sks:
        del sks[request.user.id]
    if not request.user.is_superuser and sks:
        skeleton_ids = reduce(operator.add, sks.values())
        return JsonResponse({'error': 'You don\'t own: %s' % skeleton_ids})

    # 2. Change neuron's and skeleton's and class_instance_class_instance relationship owner to target_user

    # Update user_id of the relation 'model_of' between any skeletons and the chosen neuron
    ClassInstanceClassInstance.objects.filter(
        relation__relation_name='model_of',
        class_instance_b=neuron_id).update(user=target_user)

    # Update user_id of the neuron
    ClassInstance.objects.filter(pk=neuron_id).update(user=target_user)

    # Update user_id of the skeleton(s)
    skeleton_ids = reduce(operator.add, skeletons.values())
    ClassInstance.objects.filter(pk__in=skeleton_ids).update(user=target_user)

    return JsonResponse({'success':'Moved neuron #%s to %s staging area.'})


@api_view(['POST'])
@requires_user_role(UserRole.Annotate)
def rename_neuron(request:HttpRequest, project_id=None, neuron_id=None) -> JsonResponse:
    """Rename a neuron.

    If a neuron is not locked by a user on which the current user has no
    permission, the name of neuron can be changed through this endpoint. Neuron
    names are currently not allowed to contain pipe characters ("|").
    ---
    parameters:
        - name: neuron_id
          description: ID of neuron to rename
          required: true
          type: integer
          paramType: path
        - name: name
          description: New name of the neuron
          required: true
          type: string
          paramType: form
    type:
      success:
        description: If renaming was successful
        type: boolean
        required: true
      renamed_neuron:
        description: ID of the renamed neuron
        type: integer
        required: true
      old_name:
        description: Old name of the renamed neuron
        type: string
        required: true
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

    return JsonResponse({
        'success': True,
        'renamed_neuron': neuron.id,
        'old_name': old_name
    })


@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def get_neuron_ids_from_models(request:HttpRequest, project_id=None) -> JsonResponse:
    """Retrieve neuron IDs modeled by particular entities, eg skeletons.

    From a list of source entities (class instances), the IDs of all modeled
    neurons are returned. There are currently only skeletons that model neurons.
    ---
    parameters:
        - name: model_ids[]
          description: IDs of models to find neurons for (e.g. skeleton IDs)
          required: true
          type: array
          items:
            type: integer
          paramType: form
    type:
      '{model_id}':
        description: ID of modeled neuron
        type: integer
        required: true
    """
    model_ids = get_request_list(request.POST, 'model_ids', map_fn=int)
    if not model_ids:
        raise ValueError("No valid model IDs provided")

    cursor = connection.cursor()
    model_template = ",".join(("(%s)",) * len(model_ids)) or "()"
    params = [project_id] + model_ids + [project_id]
    cursor.execute('''
        WITH allowed_relation AS (
            SELECT id FROM relation
            WHERE project_id = %s AND relation_name = 'model_of'
            LIMIT 1
        )
        SELECT cici.class_instance_a, cici.class_instance_b
        FROM allowed_relation ar, class_instance_class_instance cici
        JOIN (VALUES {}) model(id)
        ON cici.class_instance_a = model.id
        WHERE cici.project_id = %s
        AND cici.relation_id = ar.id
    '''.format(model_template), params)

    models = {}
    for row in cursor.fetchall():
        models[row[0]] = row[1]
    return JsonResponse(models)


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def list_neurons(request:HttpRequest, project_id) -> JsonResponse:
    """List neurons matching filtering criteria.

    The result set is the intersection of neurons matching criteria (the
    criteria are conjunctive) unless stated otherwise.
    ---
    parameters:
        - name: created_by
          description: Filter for user ID of the neurons' creator.
          type: integer
          paramType: query
        - name: reviewed_by
          description: Filter for user ID of the neurons' reviewer.
          type: integer
          paramType: query
        - name: from_date
          description: Filter for neurons with nodes created after this date.
          type: string
          format: date
          paramType: query
        - name: to_date
          description: Filter for neurons with nodes created before this date.
          type: string
          format: date
          paramType: query
        - name: nodecount_gt
          description: |
            Filter for neurons with more nodes than this threshold. Removes
            all other criteria.
          type: integer
          paramType: query
    type:
    - type: array
      items:
        type: integer
        description: ID of neuron matching the criteria.
      required: true
    """
    created_by = request.GET.get('created_by', None)
    reviewed_by = request.GET.get('reviewed_by', None)
    from_date = request.GET.get('from', None)
    to_date = request.GET.get('to', None)
    nodecount_gt = int(request.GET.get('nodecount_gt', 0))

    # Sanitize
    if reviewed_by:
        reviewed_by = int(reviewed_by)
    if created_by:
        created_by = int(created_by)
    if from_date:
        from_date = datetime.datetime.strptime(from_date, '%Y%m%d')
    if to_date:
        to_date = datetime.datetime.strptime(to_date, '%Y%m%d')

    response = _list_neurons(project_id, created_by, reviewed_by, from_date,
                to_date, nodecount_gt)
    return JsonResponse(response, safe=False)


def _list_neurons(project_id, created_by, reviewed_by, from_date, to_date,
        nodecount_gt) -> List:
    """ Returns a list of neuron IDs of which nodes exist that fulfill the
    given constraints (if any). It can be constrained who created nodes in this
    neuron during a given period of time. Having nodes that are reviewed by
    a certain user is another constraint. And so is the node count that one can
    specify which each result node must exceed.
    """
    cursor = connection.cursor()
    class_map = get_class_to_id_map(project_id, ["neuron"])

    # Without any constraints, it is fastest to list all neurons in the project.
    with_constraints = created_by or reviewed_by or from_date or to_date or nodecount_gt > 0
    if with_constraints:
        # Need to import internally to prevent cyclic import
        from catmaid.control.skeleton import _list_skeletons

        skeleton_ids = _list_skeletons(project_id, created_by, reviewed_by,
                from_date, to_date, nodecount_gt)
        skeleton_id_template = ",".join("(%s)" for _ in skeleton_ids)

        # Get neurons modeled by skeletons
        if skeleton_ids:
            cursor.execute("""
                SELECT DISTINCT c.id
                FROM class_instance_class_instance cc
                JOIN class_instance c
                    ON cc.class_instance_b = c.id
                JOIN (VALUES {}) skeleton(id)
                    ON cc.class_instance_a = skeleton.id
                WHERE cc.project_id = %s
                AND c.class_id = %s
            """.format(skeleton_id_template),
                    skeleton_ids + [project_id, class_map["neuron"]])

            return list(map(lambda x: x[0], cursor.fetchall()))
        else:
            return []
    else:
        cursor.execute("""
            SELECT id
            FROM class_instance
            WHERE project_id = %s
            AND class_id = %s
        """, (project_id, class_map["neuron"]))

        return list(map(lambda x: x[0], cursor.fetchall()))
