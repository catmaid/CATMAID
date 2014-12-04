import json

from django.conf import settings
from django.http import HttpResponse

from catmaid.models import UserRole
from catmaid.control.stack import get_stack_info_response
from catmaid.control.flytem.models import FlyTEMProjectStacks


def stack_info(request, project_id=None, stack_id=None):
    """ Returns a dictionary with relevant information for stacks.
    Depending on the tile_source_type, get information from database
    or from tile server directly
    """
    ps = FlyTEMProjectStacks()
    stack = ps.get_stack(project_id, stack_id)
    project = ps.get_project(project_id)

    overlay_data = {}

    broken_slices = {i:1 for i in stack.broken_slices}

    result = get_stack_info_response(project, stack, ps, overlay_data, broken_slices)
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), content_type="text/json")

def stacks(request, project_id=None):
    """ Returns a response containing the JSON object with menu information
    about the project's stacks.
    """
    return HttpResponse(json.dumps({}, sort_keys=True, indent=4),
        content_type="text/json")
