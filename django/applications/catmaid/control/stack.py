# -*- coding: utf-8 -*-

import datetime
import json
import logging
import os
from typing import Any, Dict
import requests

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from ..models import UserRole, Project, Stack, ProjectStack, \
        BrokenSlice, StackMirror, StackStackGroup, WritableStack
from .authentication import requires_user_role
from catmaid.control.tile import get_tile_source
from catmaid.control.common import ConfigurationError

from rest_framework.views import APIView

logger = logging.getLogger(__name__)


n5_writing_enabled = True
try:
    import cloudvolume
    from cloudvolume.datasource.n5.metadata import N5Metadata
except ImportError:
    n5_writing_enabled = False
    logger.info('CATMAID was unable to find the cloud-volume library, which is an '
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


def get_writable_stack_path(stack_path):
    return os.path.join(settings.MEDIA_ROOT,
                        settings.MEDIA_WRITABLE_STACK_SUBDIRECTORY,
                        stack_path)


class WritableStackListView(APIView):
    """Access to writable stacks."""

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id=None) -> JsonResponse:
        """
        Returns a response containing the JSON object with menu information
        about the user's writable stacks in this project.
        """
        project = Project.objects.get(pk=project_id)
        info = []
        for writable_stack in project.writable_stacks.all().order_by('name'):
            info.append({
                'id': writable_stack.id,
                'user_id': writable_stack.user_id,
                'stack_id': writable_stack.stack_id,
                'name': writable_stack.name,
                'path': writable_stack.path,
                'filetype': writable_stack.filetype,
                'metadata': writable_stack.metadata})
        return JsonResponse(info, safe=False, json_dumps_params={
            'sort_keys': True,
        })


    def post(self, request:HttpRequest, project_id) -> JsonResponse:
        """
        Create a new writable stack for the provided stack.
        """
        if not n5_writing_enabled:
            raise ConfigurationError('N5 writing is not enabled, dependency pyn5 missing')

        project = get_object_or_404(Project, pk=project_id)

        stack_id_param = request.data.get('stack_id')
        if stack_id_param is None:
            raise ValueError('Need stack_id parameter')
        else:
            stack_id = int(stack_id_param)
        stack = get_object_or_404(Stack, pk=stack_id)

        name = request.data.get('name', None)
        if name is None:
            raise ValueError('Need name parameter')

        metadata_param = request.data.get('metadata', None)
        if metadata_param is None:
            metadata_param = '{}'
        metadata = json.loads(metadata_param)

        if 'dataset' not in metadata:
            metadata['dataset'] = 'volumes/main'
        if 'dtype' not in metadata:
            metadata['dtype'] = 'uint8'
        if 'compression' not in metadata:
            metadata['compression'] = 'GZIP'
        if 'compression_opts' not in metadata:
            metadata['compression_opts'] = -1
        if 'block_size' not in metadata:
            metadata['block_size'] = [128, 128, 20]

        # For now we assume a dataset size like the reference stack
        metadata['dataset_size'] = [stack.dimension.x, stack.dimension.y,
                                    stack.dimension.z]
        metadata['resolution'] = [stack.resolution.x, stack.resolution.y,
                                    stack.resolution.z]
        metadata['voxel_offset'] = [0, 0, 0]

        metadata['last_update_time'] = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()
        metadata['last_update_bounds'] = None

        writable_stack = WritableStack.objects.create(
                user_id=request.user.id,
                project_id=project.id,
                stack_id = stack.id,
                name = name,
                path = '',
                filetype = 'n5',
                metadata = metadata)

        # Store per project, include writable stack ID in path and make sure
        # final path doesn't start with a slash character.
        filename = f'{project.id}-{stack.id}-{request.user.id}-{writable_stack.id}.n5'
        writable_stack.path = f'{project.id}/{filename}'
        writable_stack.save()

        # Create initial N5 file
        encoding = 'raw'
        full_path = get_writable_stack_path(writable_stack.path)

        # Create N5 skeleton manually, because the cloud-volume files don't seem
        # to be compatible.
        root_attributes = {
            "n5": "2.1.3",
            "pixelResolution": {
                "unit": "um",
                "dimensions": [
                    metadata['resolution'][0],
                    metadata['resolution'][1],
                    metadata['resolution'][2],
                ]
            },
            "downsamplingFactors": [[
                scale_level.x,
                scale_level.y,
                scale_level.z,
            ] for scale_level in stack.downsample_factors]
        }
        scale_attributes = []
        for n, scale_level in enumerate(stack.downsample_factors):
            dimensions = [
                int(metadata['dataset_size'][0] / scale_level.x),
                int(metadata['dataset_size'][1] / scale_level.y),
                int(metadata['dataset_size'][2] / scale_level.z),
            ]
            resolution = [
                metadata['resolution'][0] / scale_level.x,
                metadata['resolution'][1] / scale_level.y,
                metadata['resolution'][2] / scale_level.z,
            ]
            scale_attributes.append({
                "dataType": metadata['dtype'],
                "compression": {
                    "type": encoding,
                },
                "blockSize": metadata['block_size'],
                "dimensions": dimensions,
                "pixelResolution": {
                    "unit": "um",
                    "dimensions": resolution,
                },
                "downsamplingFactors": [
                    scale_level.x,
                    scale_level.y,
                    scale_level.z
                ]
            })

        os.makedirs(full_path)
        with open(os.path.join(full_path, 'attributes.json'), 'w') as n5_attributes_file:
            json.dump(root_attributes, n5_attributes_file)
        for n, scale_attribute_entry in enumerate(scale_attributes):
            scale_path = os.path.join(full_path, metadata['dataset'], f's{n}')
            os.makedirs(scale_path)
            with open(os.path.join(scale_path, 'attributes.json'), 'w') as n5_attributes_file:
                json.dump(scale_attribute_entry, n5_attributes_file)

        return JsonResponse({
            'id': writable_stack.id,
            'user_id': writable_stack.user_id,
            'stack_id': writable_stack.stack_id,
            'name': writable_stack.name,
            'path': writable_stack.path,
            'filetype': writable_stack.filetype,
            'metadata': writable_stack.metadata,
        })
