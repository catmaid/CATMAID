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
