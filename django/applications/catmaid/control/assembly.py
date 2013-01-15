from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def component_count(request, project_id=None, assembly_id=None):
    p = get_object_or_404(Project, pk=project_id)
    return HttpResponse(json.dumps({
        'count': Component.objects.filter(assembly_id=assembly_id).count(),
        'assembly_id': assembly_id}), mimetype='text/json')

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
