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
def save_assembly(request, project_id=None, stack_id=None):
    assemblyid = int(request.POST.get('assemblyid', None))
    slices = request.POST.getlist('slices[]')
    segments = request.POST.getlist('segments[]')
    slices_left_flags = request.POST.getlist('slices_left_flags[]')
    slices_right_flags = request.POST.getlist('slices_right_flags[]')
    
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)
    
    # TODO: set assemblyid to null for all slices with this
    # assembly id, or set to null when deleting (better)

    # TODO: ensure that flag lists are set
    if not assemblyid is None:

        # TODO: first completely remove assembly and the reset
        Slices.objects.filter(
                stack = stack,
                project = p,
                assembly = assemblyid
                ).update( assembly = None)

        Segments.objects.filter(
                stack = stack,
                project = p,
                assembly = assemblyid
                ).update( assembly = None)

        for j, node_id in enumerate( slices ):
            Slices.objects.filter(
                stack = stack,
                project = p,
                node_id = node_id
                ).update(assembly=assemblyid, 
                flag_left = int(slices_left_flags[j]),
                flag_right = int(slices_right_flags[j]) )

        for node_id in segments:
            orig = int(node_id.split('_')[0])
            targ = int(node_id.split('_')[1].split('-')[0])
            segmentid = int(node_id.split('_')[1].split('-')[1])
            Segments.objects.filter(
                stack = stack,
                project = p,
                origin_section = orig,
                target_section = targ,
                segmentid = segmentid
                ).update(assembly=assemblyid )

    return HttpResponse(json.dumps({'message': 'Updated {0} slices and {1} segments of assembly {2}'.format(
        len(slices), len(segments), assemblyid)}))

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
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x', 'center_y', 'threshold',
        'size', 'status', 'flag_left', 'flag_right')

    return HttpResponse(json.dumps(list(all_slices)), mimetype="text/json")


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def slices_of_assembly(request, project_id=None, stack_id=None):

    assembly_id = int(request.GET['assemblyid'])

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given skeleton and z section
    all_slices = Slices.objects.filter(
        stack = stack,
        project = p,
        assembly_id = assembly_id).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
        'center_y', 'threshold', 'size', 'status', 'flag_left', 'flag_right')

    return HttpResponse(json.dumps(list(all_slices)), mimetype="text/json")


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def segments_of_assembly(request, project_id=None, stack_id=None):

    assembly_id = int(request.GET['assemblyid'])

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    all_segments = Segments.objects.filter(
        stack = stack,
        project = p,
        assembly_id = assembly_id).all().values('segmentid','segmenttype','origin_section','origin_slice_id','target_section',
    'target1_slice_id','target2_slice_id','direction',
    'center_distance','set_difference','cost','set_difference','set_difference_ratio',
    'aligned_set_difference','aligned_set_difference_ratio',
    'size','overlap','overlap_ratio','aligned_overlap','aligned_overlap_ratio',
    'average_slice_distance', 'max_slice_distance',
    'aligned_average_slice_distance', 'aligned_max_slice_distance',
    'histogram_0', 'histogram_1', 'histogram_2', 'histogram_3', 'histogram_4', 'histogram_5',
    'histogram_6', 'histogram_7', 'histogram_8', 'histogram_9', 'normalized_histogram_0',
    'normalized_histogram_1', 'normalized_histogram_2', 'normalized_histogram_3', 'normalized_histogram_4', 'normalized_histogram_5',
    'normalized_histogram_6', 'normalized_histogram_7', 'normalized_histogram_8', 'normalized_histogram_9')

    return HttpResponse(json.dumps(list(all_segments)), mimetype="text/json")
