import json

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db import connection

from catmaid.control.authentication import *
from catmaid.control.common import *

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
    return HttpResponse(json.dumps([x.id for x in qs]), mimetype="text/json")


def _in_isolated_synaptic_terminals(skeleton_id):
    """ Returns the neuron id if the skeleton is a 'model_of' a neuron that is 'part_of'
    a group named 'Isolated synaptic terminals'; otherwise returns None.
    This function checks all the way to whether the neuron is really of class 'neuron'
    and the 'Isolated synaptic terminals' is really of class 'group'.
    The extra cost is acceptable and ensures integrity. """
    try:
        skeleton_id = int(skeleton_id) # sanitize
        cursor = connection.cursor()
        # Fetch the id of the neuron for which the skeleton is a model_of
        response_on_error = 'Could not fetch neuron id for skeleton #%s' % skeleton_id
        cursor.execute('''
        SELECT class_instance_b
        FROM class_instance_class_instance cici,
             relation r,
             class_instance ci,
             class
        WHERE cici.class_instance_a = %s
          AND cici.class_instance_b = ci.id
          AND cici.relation_id = r.id
          AND r.relation_name = 'model_of'
          AND ci.class_id = class.id
          AND class.class_name = 'neuron'
        ''' % skeleton_id)
        neuron_id = cursor.fetchone()[0]
        # Determine if neuron is part_of a group titled 'Isolated synaptic terminals'
        response_on_error = 'Could not determine whether neuron #%s is "part_of" the group "Isolated synaptic terminals"' % neuron_id
        cursor.execute('''
        SELECT count(*)
        FROM class_instance_class_instance cici,
             class_instance ci,
             relation r,
             class
        WHERE cici.class_instance_a = %s
          AND cici.class_instance_b = ci.id
          AND cici.relation_id = r.id
          AND r.relation_name = 'part_of'
          AND ci.class_id = class.id
          AND class.class_name = 'group'
          AND ci.name = 'Isolated synaptic terminals'
        ''' % neuron_id)
        rows = tuple(cursor.fetchone())
    except Exception as e:
        raise Exception(response_on_error + str(e))
    if rows[0] > 1:
        raise Exception('Found more than one "Isolated synaptic terminals" as parent of neuron #%s containing skeleton #%s' % (neuron_id, skeleton_id))
    return neuron_id if 1 == rows[0] else None


def _delete_if_empty(neuron_id):
    """ Delete this neuron if no class_instance is a model_of it;
    which is to say, it contains no skeletons. """
    if 0 == ClassInstanceClassInstance.objects.filter(
            class_instance_b=neuron_id,
            relation__relation_name='model_of').count():
        ClassInstance.objects.filter(pk=neuron_id).delete()
        return True
    return False

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


