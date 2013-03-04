from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.simplejson.encoder import JSONEncoder

import json

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
import sys

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def constraintset_for_segment(request, project_id=None, stack_id=None):
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    segmentnodeid = request.GET.get('segmentnodeid', '')

    scm = SegmentToConstraintMap.objects.filter(
        stack = stack,
        project = p,
        segment_node_id = segmentnodeid
    ).select_related().all()
    result = []
    for constraintmap in scm:
        # print >> sys.stderr, constraintmap.constraint.segments, , constraintmap.constraint.target_section
        result.append( constraintmap.constraint.segments )
        origin_section = constraintmap.constraint.origin_section
        target_section = constraintmap.constraint.target_section

    return HttpResponse(json.dumps({
        'origin_section': origin_section,
        'target_section': target_section,
        'constraintsets': result }), mimetype='text/json')        

