# -*- coding: utf-8 -*-

import json
from django.http import HttpRequest, JsonResponse
from catmaid.control.stack import get_stack_info_response
from catmaid.control.dvid.models import DVIDProjectStacks


def stack_info(request:HttpRequest, project_id=None, stack_id=None) -> JsonResponse:
    """ Returns a dictionary with relevant information for stacks.
    Depending on the tile_source_type, get information from database
    or from tile server directly
    """
    ps = DVIDProjectStacks()
    stack = ps.get_stack(project_id, stack_id)
    project = ps.get_project(project_id)

    broken_slices = {i:1 for i in stack.broken_slices}

    result = get_stack_info_response(project, stack, ps, stack.mirrors, broken_slices)
    return JsonResponse(result, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })

def stacks(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns a response containing the JSON object with menu information
    about the project's stacks.
    """
    return JsonResponse([], safe=False)
