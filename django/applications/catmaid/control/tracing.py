# -*- coding: utf-8 -*-

import json
from typing import List, Tuple

from django.http import HttpRequest, JsonResponse

from catmaid.apps import get_system_user
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_class_to_id_map, get_relation_to_id_map
from catmaid.models import (Class, ClassInstance, Relation, SamplerDomainType,
        SamplerIntervalState, SamplerState, SamplerConnectorState, UserRole)


# All classes needed by the tracing system alongside their
# descriptions.
needed_classes = {
    'group': "A group",
    'label': "A label",
    'neuron': "A neuron representation",
    'root': "The root node for the tracing system",
    'skeleton': "The representation of a skeleton",
    'sampler-created': "Nodes that are created by the reconstruction sampler"
}

# All relations needed by the tracing system alongside their
# descriptions.
needed_relations = {
    'labeled_as': "Something is labeled by sth. else.",
    'element_of': "A generic element-of relationship",
    'presynaptic_to': "Something is presynaptic to something else.",
    'postsynaptic_to': "Something is postsynaptic to something else.",
    'abutting': "Two things abut against each other",
    'gapjunction_with': "Something has a gap junction with something else",
    'tightjunction_with': "A tight juction between two objects",
    'desmosome_with': "A desmosome between two objects",
    'attached_to': "Something is considered attached/linked to something else",
    'adjacent_to': { 'description': "Next to each other", 'isreciprocal': True },
    'mirror_of': { 'description': "A mirror configuration to each other", 'isreciprocal': True },
}

# Expected sampler states, sampler interval sates and sampler domain types
needed_sampler_states = {
    'open':    'A sampler that hasn\'t been completed yet',
    'closed':  'A completed sampler'
}
needed_sampler_interval_states = {
    'untouched': 'A new interval, which has not been looked at',
    'started':   'The interval is being worked on',
    'completed': 'The interval has been completed',
    'abandoned': 'The interval has been abandoned and won\'t be completed'
}
needed_sampler_domain_types = {
    'regular':  'A general explicitly defined domain',
    'backbone': 'The backbone of a neuron',
    'bouton':   'A particular type of morphology',
    'covering': 'Complete neuron',
    'twig':     'A small distal fragment'
}
needed_sampler_connector_states = {
    'untouched': 'A new connector, which has not been sampled so far',
    'started':   'The connector can be sampled',
    'completed': 'The connector has been completed and shouldn\'t be used for sampling',
    'excluded':  'The connector is excluded from sampling'
}


def check_tracing_setup_view(request:HttpRequest, project_id=None) -> JsonResponse:
    all_good, mc, mr, mci = check_tracing_setup_detailed(project_id)
    initialize = (len(mc) == len(needed_classes)) and \
                 (len(mr) == len(needed_relations))
    can_administer = request.user.has_perm('can_administer', project_id)
    return JsonResponse({
        'needs_setup': not all_good,
        'missing_classes': mc,
        'missing_relations': mr,
        'missing_classinstances': mci,
        'has_needed_permissions': can_administer,
        'initialize': initialize
    })

def check_tracing_setup(project_id, opt_class_map=None, opt_relation_map=None,
        check_root_ci=True) -> bool:
    """ Checks if all classes and relations needed by the tracing system are
    available. Allows avoiding tests for root class instances and passing
    already available class and relation maps to saved queries.
    """
    all_good, _, _, _ = check_tracing_setup_detailed(project_id, opt_class_map,
            opt_relation_map, check_root_ci)
    return all_good

def check_tracing_setup_detailed(project_id, opt_class_map=None,
        opt_relation_map=None, check_root_ci=True) -> Tuple[bool, List, List, List]:
    """ Checks if all classes and relations needed by the tracing system are
    available. It returns a four-tuple with a boolean indicating if all is
    setup, the missing class names, the missing relation names and the missing
    class instance names. Allows avoidng tests for root class instances and
    passing already available class and relation maps.
    """
    # Get class and relation data. If available, use the provided one.
    class_map = opt_class_map or get_class_to_id_map(project_id)
    relation_map = opt_relation_map or get_relation_to_id_map(project_id)

    # Check if all classes and relations are available
    all_good = True
    missing_classes = []
    missing_relations = []
    missing_classinstances = []

    for c in needed_classes:
        if not c in class_map:
            all_good = False
            missing_classes.append(c)
    for r in needed_relations:
        if not r in relation_map:
            all_good = False
            missing_relations.append(r)
    # Check if the root node is there if requested
    if check_root_ci:
        if 'root' in class_map:
            exists = ClassInstance.objects.filter(
                class_column=class_map['root'],
                project_id=project_id).exists()
            if not exists:
                all_good = False
                missing_classinstances.append('root')
        else:
                missing_classinstances.append('root')

    return all_good, missing_classes, missing_relations, missing_classinstances

@requires_user_role([UserRole.Admin])
def rebuild_tracing_setup_view(request:HttpRequest, project_id=None) -> JsonResponse:
    setup_tracing(project_id, request.user)
    all_good = check_tracing_setup(project_id)
    return JsonResponse({'all_good': all_good})

@requires_user_role([UserRole.Browse])
def validate_tracing_setup(request:HttpRequest, project_id) -> JsonResponse:
    setup_tracing(project_id)
    return JsonResponse({'success': True})

def setup_tracing(project_id, user=None) -> None:
    """ Tests which of the needed classes and relations is missing
    from the project's semantic space and adds those.
    """
    if not user:
        user = get_system_user()
    # Remember available classes
    available_classes = {}

    # Add missing classes
    for c in needed_classes:
        class_object, _ = Class.objects.get_or_create(
            class_name=c,
            project_id=project_id,
            defaults={'user': user,
                      'description': needed_classes[c]})
        available_classes[c] = class_object
    # Add missing relations
    for r in needed_relations:
        defaults = {
            'user': user,
        }
        data_type = type(needed_relations[r])
        if data_type == str:
            defaults['description'] = needed_relations[r]
        else:
            defaults.update(needed_relations[r]) # type: ignore

        Relation.objects.get_or_create(
            relation_name=r,
            project_id=project_id,
            defaults=defaults)
    # Add missing sampler states
    for sn, sd in needed_sampler_states.items():
        SamplerState.objects.get_or_create(
            name=sn, defaults={'description': sd})
    # Add missing sampler interval states
    for sn, sd in needed_sampler_interval_states.items():
        SamplerIntervalState.objects.get_or_create(
            name=sn, defaults={'description': sd})
    # Add missing sampler domain types
    for sn, sd in needed_sampler_domain_types.items():
        SamplerDomainType.objects.get_or_create(
            name=sn, defaults={'description': sd})
    # Add missing sampler connector states
    for sn, sd in needed_sampler_connector_states.items():
        SamplerConnectorState.objects.get_or_create(
            name=sn, defaults={'description': sd})

    # Add root class instance
    ClassInstance.objects.get_or_create(
        class_column=available_classes['root'],
        project_id=project_id,
        defaults={'user': user,
                  'name': 'neuropile'})
