from __future__ import absolute_import

import os.path
import json
import httplib
import logging

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from ..models import UserRole, Project, Stack, ProjectStack, \
        BrokenSlice, Overlay
from .authentication import requires_user_role

logger = logging.getLogger(__name__)

def get_stack_info(project_id=None, stack_id=None):
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
    overlay_data = Overlay.objects.filter(stack=stack_id)

    return get_stack_info_response(p, s, ps, overlay_data, broken_slices)

def get_stack_info_response(p, s, ps, overlay_data, broken_slices):

    overlays = []
    for ele in overlay_data:
        overlays.append({
            'id': ele.id,
            'title': ele.title,
            'image_base': ele.image_base,
            'default_opacity': ele.default_opacity,
            'tile_width': ele.tile_width,
            'tile_height': ele.tile_height,
            'tile_source_type': ele.tile_source_type,
            'file_extension': ele.file_extension
            })
    result = {
        'sid': s.id,
        'pid': p.id,
        'ptitle': p.title,
        'stitle': s.title,
        'image_base': s.image_base,
        'num_zoom_levels': int(s.num_zoom_levels),
        'file_extension': s.file_extension,
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
        'tile_height': int(s.tile_height),
        'tile_width': int(s.tile_width),
        'tile_source_type': int(s.tile_source_type),
        'metadata' : s.metadata,
        'broken_slices': broken_slices,
        'trakem2_project': int(s.trakem2_project),
        'overlay': overlays,
        'orientation': ps.orientation,
    }

    return result

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_stack_tags(request, project_id=None, stack_id=None):
    """ Return the tags associated with the stack.
    """
    s = get_object_or_404(Stack, pk=stack_id)
    tags = [str(t) for t in s.tags.all()]
    result = {'tags': tags}
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), content_type="application/json")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def update_stack_tags(request, project_id=None, stack_id=None, tags=None):
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
    return HttpResponse(json.dumps(""), content_type="application/json")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stack_info(request, project_id=None, stack_id=None):
    result = get_stack_info(project_id, stack_id)
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), content_type="application/json")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def stacks(request, project_id=None):
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
    return HttpResponse(json.dumps(info, sort_keys=True, indent=4),
                        content_type="application/json")
