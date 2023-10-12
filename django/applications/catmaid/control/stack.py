# -*- coding: utf-8 -*-

import datetime
import json
import logging
import os.path
import numpy as np
from typing import Any, Dict

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404

from ..models import UserRole, Project, Stack, ProjectStack, \
        BrokenSlice, StackMirror, StackStackGroup, WritableStack
from .authentication import requires_user_role


logger = logging.getLogger(__name__)


n5_writing_enabled = True
try:
    from pyn5 import File, Mode, CompressionType
except ImportError:
    n5_writing_enabled = False
    logger.info('CATMAID was unable to find the pyn5 library, which is an '
                'optional dependency. N5 writing will therefore be disabled.')


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
        raise ValueError(f'There is no stack with ID {stack_id} linked to the '
                         f'project with ID {project_id}.')
    elif num_stacks > 1:
        raise ValueError(f'The stack with ID {stack_id} is linked multiple times '
                         f'project with ID {project_id}, but there should only be '
                         'one link.')
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
        'metadata': s.metadata,
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
    s.tags.set(tags)

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

@requires_user_role([UserRole.Annotate])
def write_block(request:HttpRequest, project_id=None, stack_id=None) -> JsonResponse:
    """ Store block-wise voxel data.
    """

    if not n5_writing_enabled:
        raise ValueError('N5 file writing is not enabled on the server')

    # Get writable stack for local path info
    writable_stacks = WritableStack.objects.filter(project_id=project_id,
            user=request.user, stack_id=stack_id)
    if len(writable_stacks) == 0:
        raise ValueError(f'Found no writable stacks for stack {stack_id}')
    elif len(writable_stacks) > 1:
        raise ValueError(f'Found more than one writable stack for stack {stack_id}')
    writable_stack = writable_stacks[0]

    dataset_size = writable_stack.metadata.get('dataset_size')
    if not dataset_size:
        raise ValueError('Need dataset_size parameter in writable stack metadata')

    data = request.POST.get('data')
    if not data:
        raise ValueError('Need data')
    data = np.array(json.loads(data)).transpose([2, 1, 0])

    data_bounds_json = request.POST.get('data_bounds')
    if not data_bounds_json:
        raise ValueError('Need data_bounds paramaeter')
    data_bounds = json.loads(data_bounds_json)
    if not isinstance(data_bounds, list) or len(data_bounds) != 2:
        raise ValueError('The data_bounds parameter needs to be a list of two lists')
    if not isinstance(data_bounds[0], list) or len(data_bounds[0]) != len(dataset_size):
        raise ValueError('The first data_bounds list  needs to be a list with the correct dimensionality')
    if not isinstance(data_bounds[1], list) or len(data_bounds[1]) != len(dataset_size):
        raise ValueError('The first data_bounds list  needs to be a list with the correct dimensionality')

    dataset = writable_stack.metadata.get('dataset', 'volumes/main')
    dtype = writable_stack.metadata.get('dtype', 'float64')
    compression_name = writable_stack.metadata.get('compression', 'GZIP')
    compression = getattr(CompressionType, compression_name)
    compression_opts = writable_stack.metadata.get('compression_opts', -1)
    block_size = writable_stack.metadata.get('block_size', [1, 1, 1])

    pyn5.create_dataset(writable_stack.path, dataset, dataset_size,
                        block_size, dtype.upper())
    n5 = pyn5.open(writable_stack.path, dataset, dtype.upper(), False)
    pyn5.write(n5, (np.array(data_bounds[0]), np.array(data_bounds[1])), data, dtype)

    writable_stack.metadata['last_update_time'] = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()
    writable_stack.metadata['last_update_bounds'] = data_bounds
    writable_stack.save()

    return JsonResponse({
        'update': True,
        'last_update_time': writable_stack.metadata.get('last_update_time'),
        'last_update_bounds': writable_stack.metadata.get('last_update_bounds'),
    })


def export_stack_to_n5(project_id, stack_id, stack_mirror_id, name=None, block_size=(512,512,16), bounds=None):
    """Export an existing stack mirror data set to a local N5 dataset,
    optionally limitted to a certain volume.
    """
    stack = Stack.objects.get(id=stack_id)

    export_name = name or f'stack-{stack_id}-{"cutout" if bounds else "full"}.n5'
    export_path = os.path.join(settings.MEDIA_ROOT,
        settings.MEDIA_EXPORT_SUBDIRECTORY, export_name)

    dataset = None
    dataset_size = None
    dtype = None

    pyn5.create_dataset(export_path, dataset, dataset_size,
                        block_size, dtype.upper())
    n5 = pyn5.open(export_path, dataset, dtype.upper(), False)
    pyn5.write(n5, (np.array(data_bounds[0]), np.array(data_bounds[1])), data, dtype)
