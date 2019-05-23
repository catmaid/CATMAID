# -*- coding: utf-8 -*-

import json
import logging
import os.path
from typing import Any, Dict

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404

from ..models import UserRole, Project, Stack, ProjectStack, \
        BrokenSlice, StackMirror, StackStackGroup
from .authentication import requires_user_role

logger = logging.getLogger(__name__)

def get_stack_info(project_id=None, stack_id=None) -> Dict[str, Any]:
    """ Returns a dictionary with relevant information for stacks.
    Depending on the tile_source_type, get information from database
    or from tile server directly
    """
    p = get_object_or_404(Project, pk=project_id)
    s = get_object_or_404(Stack, pk=stack_id)
    ps_all = ProjectStack.objects.filter(project=project_id, stack=stack_id)
    num_stacks = len(ps_all)
    if num_stacks == 0:
        return {'error': 'There is no stack with ID %s linked to the ' \
                         'project with ID %s.' % (stack_id, project_id)}
    elif num_stacks > 1:
        return {'error': 'The stack with ID %s is linked multiple times ' \
                         'to the project with ID %s, but there should only be ' \
                         'one link.' % (stack_id, project_id)}
    ps = ps_all[0]

    broken_slices = {i:1 for i in BrokenSlice.objects.filter(stack=stack_id) \
                     .values_list('index', flat=True)}
    mirror_data = StackMirror.objects.filter(stack=stack_id)

    return get_stack_info_response(p, s, ps, mirror_data, broken_slices)

def get_stack_info_response(p, s, ps, mirror_data, broken_slices) -> Dict[str, Any]:

    mirrors = []
    for ele in mirror_data:
        mirrors.append({
            'id': ele.id,
            'title': ele.title,
            'image_base': ele.image_base,
            'tile_width': int(ele.tile_width),
            'tile_height': int(ele.tile_height),
            'tile_source_type': int(ele.tile_source_type),
            'file_extension': ele.file_extension,
            'position': int(ele.position)
            })
    result = {
        'sid': s.id,
        'pid': p.id,
        'ptitle': p.title,
        'stitle': s.title,
        'downsample_factors': [zf.to_dict() for zf in s.downsample_factors] if s.downsample_factors else None,
        'num_zoom_levels': int(s.num_zoom_levels),
        'translation': {
            'x': ps.translation.x,
            'y': ps.translation.y,
            'z': ps.translation.z
        },
        'resolution': {
            'x': float(s.resolution.x),
            'y': float(s.resolution.y),
            'z': float(s.resolution.z)
        },
        'dimension': {
            'x': int(s.dimension.x),
            'y': int(s.dimension.y),
            'z': int(s.dimension.z)
        },
        'comment': s.comment,
        'description': s.description,
        'metadata' : s.metadata,
        'broken_slices': broken_slices,
        'mirrors': mirrors,
        'orientation': ps.orientation,
        'attribution': s.attribution,
        'canary_location': {
            'x': int(s.canary_location.x),
            'y': int(s.canary_location.y),
            'z': int(s.canary_location.z)
        },
        'placeholder_color': {
            'r': float(s.placeholder_color.r),
            'g': float(s.placeholder_color.g),
            'b': float(s.placeholder_color.b),
            'a': float(s.placeholder_color.a)
        }
    }

    return result

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_stack_tags(request:HttpRequest, project_id=None, stack_id=None) -> JsonResponse:
    """ Return the tags associated with the stack.
    """
    s = get_object_or_404(Stack, pk=stack_id)
    tags = [str(t) for t in s.tags.all()]
    result = {'tags': tags}
    return JsonResponse(result, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def update_stack_tags(request:HttpRequest, project_id=None, stack_id=None, tags=None) -> JsonResponse:
    """ Updates the given stack with the supplied tags. All
    existing tags will be replaced.
    """
    s = get_object_or_404(Stack, pk=stack_id)
    # Create list of single stripped tags
    if tags is None:
        tags = []
    else:
        tags = tags.split(",")
        tags = [t.strip() for t in tags]

    # Add tags to the model
    s.tags.set(*tags)

    # Return an empty closing response
    return JsonResponse("", safe=False)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stack_info(request:HttpRequest, project_id=None, stack_id=None) -> JsonResponse:
    result = get_stack_info(project_id, stack_id)
    return JsonResponse(result, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stacks(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns a response containing the JSON object with menu information
    about the project's stacks.
    """
    project = Project.objects.get(pk=project_id)
    info = []
    for stack in project.stacks.all():
        info.append({
            'id': stack.id,
            'pid': project.id,
            'title': stack.title,
            'comment': stack.comment})
    return JsonResponse(info, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stack_groups(request:HttpRequest, project_id=None, stack_id=None) -> JsonResponse:
    stack_group_ids = StackStackGroup.objects \
        .filter(stack=stack_id) \
        .values_list('stack_group_id', flat=True)

    result = {
        'stack_group_ids': list(stack_group_ids)
    }

    return JsonResponse(result)
