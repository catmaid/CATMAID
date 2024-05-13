# -*- coding: utf-8 -*-

import datetime
import json
import logging
import os
import numpy as np
from typing import Any, Dict
import requests
import shutil

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404

from ..models import UserRole, Project, Stack, ProjectStack, \
        BrokenSlice, StackMirror, StackStackGroup, WritableStack
from .authentication import requires_user_role
from catmaid.apps import get_system_user
from catmaid.control.tile import get_tile_source


logger = logging.getLogger(__name__)


n5_writing_enabled = True
try:
    import pyn5
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
    compression = getattr(pyn5.CompressionType, compression_name)
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


def export_stack_to_n5(project_id, stack_id, stack_mirror_id=None, name=None,
                       block_size=(512,512,16), dataset='volumes/main',
                       dtype='float64', compression='GZIP', compression_opts=-1,
                       bounds=None, voxel_space_bounds=True, replace=False,
                       verify_ssl=True):
    """Export an existing stack mirror data set to a local N5 dataset,
    optionally limitted to a certain volume.

    bounds: a two element tuple (min, max) where both elements are three-tuples
            of the respective corner of the bounds to export.
    """
    stack = Stack.objects.get(id=stack_id)

    export_name = name or f'stack-{stack_id}-{"cutout" if bounds else "full"}.n5'
    export_path = os.path.join(settings.MEDIA_ROOT,
        settings.MEDIA_EXPORT_SUBDIRECTORY, export_name)

    if bounds:
        if bounds[1][0] > stack.dimension.x or bounds[1][1] > stack.dimension.y \
                or bounds[1][2] > stack.dimension.z:
            raise ValueError('The provided `bounds` are larger than the stack '
                    'dimensions')
    else:
        bounds = (
            (0,0,0),
            (stack.dimension.x, stack.dimension.y, stack.dimension.z)
        )

    #data = np.array(json.loads(data)).transpose([2, 1, 0])
    dataset_size = (
        bounds[1][0] - bounds[0][0],
        bounds[1][1] - bounds[0][1],
        bounds[1][2] - bounds[0][2],
    )

    logger.info(f'Exporting stack {stack.id} ({stack.title}, '
                f'Res: {stack.resolution.x}x{stack.resolution.y}x'
                f'{stack.resolution.z}) to path {export_path}, '
                f'dataset size: {dataset_size}, bounds: {bounds}, dtype: {dtype}, '
                f'block size: {block_size}')

    if replace and os.path.exists(export_path):
        logger.info(f'Removing existing output file {export_path}')
        shutil.rmtree(export_path)

    pyn5.create_dataset(export_path, dataset, dataset_size,
                        block_size, dtype.upper())

    with open(export_path + '/' + dataset + "/attributes.json", 'r') as f:
            attrs = json.load(f)
            attrs['unit'] = 'nanometer'
            attrs['pixelResolution'] = [
                stack.resolution.x,
                stack.resolution.y,
                stack.resolution.z
            ]

    with open(export_path + '/' + dataset + "/attributes.json", 'w') as f:
            f.write(json.dumps(attrs))

    n5 = pyn5.open(export_path, dataset, dtype.upper(), False)

    # Crop substack with first reachable mirror
    stack_mirror_ids = []
    if stack_mirror_id:
        stack_mirror_id.append(stack_mirror_id)
    else:
        stack_mirrors = StackMirror.objects.filter(stack_id=stack_id)
        if len(stack_mirrors) == 0:
            raise ValueError('No stack mirrors found')
        for sm in stack_mirrors:
            # If mirror is reachable use it right away
            tile_source = get_tile_source(sm.tile_source_type)
            try:
                logger.debug(tile_source.get_canary_url(sm))
                req = requests.head(tile_source.get_canary_url(sm),
                        allow_redirects=True, verify=verify_ssl, timeout=0.1)
                reachable = req.status_code == 200
            except Exception as e:
                logger.error(e)
                reachable = False
            if reachable:
                stack_mirror_ids.append(sm.id)
                break
        if not reachable:
            raise ValueError(f"Can't find reachable stack mirror for stack {stack_id}")

    # Crate a new cropping job, import here to avoid circular import
    from catmaid.control.cropping import CropJob, extract_substack

    if voxel_space_bounds:
        rx, ry, rz = stack.resolution.x, stack.resolution.y, stack.resolution.z
    else:
        rx, ry, rz = 1.0, 1.0, 1.0

    t = ProjectStack.objects.get(
            project_id=project_id, stack_id=stack.id).translation

    # In contrast tu X and Y, dimension Z seems to be inclusive
    job = CropJob(get_system_user(), project_id, stack_mirror_ids,
                x_min=t.x+(bounds[0][0]*rx), x_max=t.x+(bounds[1][0]*rx),
                y_min=t.y+(bounds[0][1]*ry), y_max=t.y+(bounds[1][1]*ry),
                z_min=t.z+(bounds[0][2]*rz), z_max=t.z+((bounds[1][2]-1)*rz),
                rotation_cw=0, zoom_level=0, single_channel=True)

    cropped_stack = extract_substack(job)
    print(f'Extracted {len(cropped_stack)} slices')

    if len(cropped_stack) == 0:
        raise ValueError('No data was extracted')

    np_slices = list(map(lambda s: np.array(s), cropped_stack))
    data = np.array(np_slices)

    if data.dtype != dtype:
        data = data.astype(dtype)

    # We need row-major (Fortran) order, hence the .T
    pyn5.write(n5, (np.array((0,0,0)), np.array(dataset_size)), data.T, dtype)
    logger.info(f'Done exporting to {export_path}')
