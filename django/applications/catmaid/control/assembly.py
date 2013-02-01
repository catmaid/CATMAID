from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.common import _create_relation
from catmaid.transaction import *

@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def create_assembly_and_neuron(request, project_id=None, stack_id=None):

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)
    user = request.user

    try:
        staging_group = ClassInstance.objects.get(project=project_id, name='Staging')
    except ObjectDoesNotExist as e:
        # Doesn't exist, create it:
        staging_group = ClassInstance()
        staging_group.user = user
        staging_group.project_id = project_id
        staging_group.class_column_id = class_map['group']
        staging_group.name = 'Staging'
        staging_group.save()
        root = ClassInstance.objects.get(project=project_id, class_column=class_map['root'])

        _create_relation(user, project_id, relation_map['part_of'], staging_group.id, root.id)

    # Get the staging folder for the user doing the request
    name = user.first_name + ' ' + user.last_name + ' (' + user.username + ')'
    try:
        group = ClassInstance.objects.get(project=project_id, name=name)
    except ObjectDoesNotExist as e:
        # Group does not exist: create it
        group = ClassInstance()
        group.user = user
        group.project_id = project_id
        group.class_column_id = class_map['group']
        group.name = name
        group.save()
        _create_relation(user, project_id, relation_map['part_of'], group.id, staging_group.id)
        is_new = True

    response_on_error = 'Failed to insert new instance of a neuron.'
    new_neuron = ClassInstance()
    new_neuron.user = request.user
    new_neuron.project_id = project_id
    new_neuron.class_column_id = class_map['neuron']
    new_neuron.name = 'neuron'
    new_neuron.save()
    new_neuron.name = 'neuron %d' % new_neuron.id
    new_neuron.save()

    _create_relation(user, project_id, relation_map['part_of'], new_neuron.id, group.id)

    response_on_error = 'Failed to insert new instance of an assembly.'
    new_assembly = ClassInstance()
    new_assembly.user = request.user
    new_assembly.project_id = project_id
    new_assembly.class_column_id = class_map['assembly']
    new_assembly.name = 'assembly'
    new_assembly.save()
    new_assembly.name = 'assembly %d' % new_neuron.id
    new_assembly.save()

    _create_relation(user, project_id, relation_map['model_of'], new_assembly.id, new_neuron.id)

    insert_into_log(project_id, request.user.id, "create_assembly", None, "Created neuron with ID %s and assembly with ID %s" % (new_neuron.id, new_assembly.id))

    return HttpResponse(json.dumps({
        'assembly_id': new_assembly.id,
        'neuron_id': new_neuron.id
        }))


#TODO: in transaction
@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def slices_of_assembly_for_section(request, project_id=None, stack_id=None):

    assembly_id = int(request.GET['assembly_id'])
    sectionindex = int(request.GET['sectionindex'])

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given skeleton and z section
    all_slices = Slices.objects.filter(
        stack = stack,
        project = p,
        assembly_id = assembly_id,
        sectionindex = sectionindex).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x', 'center_y', 'threshold', 'size', 'status')

    return HttpResponse(json.dumps(list(all_slices)), mimetype="text/json")
