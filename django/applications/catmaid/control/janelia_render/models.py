# -*- coding: utf-8 -*-

import json
import logging
from typing import List
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from django.conf import settings

logger = logging.getLogger(__name__)


def load_json(url):

    logger.debug("janelia_render.models.load_json: entry, url=%s" % url)

    try:
        json_text = urlopen(url).read()
    except (HTTPError, URLError) as e:
        raise ValueError("Failed to retrieve render service web data from %s. Error: %s" % (url, e))

    return json.loads(json_text)


class JaneliaRenderDimension:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z


class JaneliaRenderColor:
    def __init__(self, r, g, b, a):
        self.r = r
        self.g = g
        self.b = b
        self.a = a


class JaneliaRenderProject:
    def __init__(self, owner_name, project_name):
        self.owner_name = owner_name
        self.project_name = project_name
        self.project_url = '%s/owner/%s/project/%s' % (settings.JANELIA_RENDER_SERVICE_URL, owner_name, project_name)

        self.id = '%s__%s' % (owner_name, project_name)
        self.title = project_name

    def get_stacks_json(self):
        stacks_url = '%s/stacks' % self.project_url
        return load_json(stacks_url)


class JaneliaRenderStackMirror:
    def __init__(self, id, title, image_base, file_extension,
                 tile_source_type, tile_width, tile_height, position):
        self.id = id
        self.title = title
        self.image_base = image_base
        self.file_extension = file_extension
        self.tile_source_type = tile_source_type
        self.tile_width = tile_width
        self.tile_height = tile_height
        self.position = position


class JaneliaRenderStack:
    def __init__(self, project, stack_id):

        self.stack_url = '%s/stack/%s' % (project.project_url, stack_id)

        self.id = stack_id
        self.title = stack_id
        self.downsample_factors = None
        self.num_zoom_levels = -1

        # default resolution in case render stack does not have it defined in metadata
        r = settings.JANELIA_RENDER_DEFAULT_STACK_RESOLUTION
        self.resolution = JaneliaRenderDimension(r[0], r[1], r[2])

        self.mirrors = [JaneliaRenderStackMirror(**{
            'id': stack_id,
            'title': 'Default',
            'image_base': self.stack_url + "/",
            'file_extension': 'jpg',
            'tile_source_type': 7,
            'tile_width': settings.JANELIA_RENDER_STACK_TILE_WIDTH,
            'tile_height': settings.JANELIA_RENDER_STACK_TILE_HEIGHT,
            'position': 0
        })]

        self.description = ''

        stack_meta_json = load_json(self.stack_url)
        self.metadata = stack_meta_json

        bounds_json = None
        if 'stats' in stack_meta_json:
            stats = stack_meta_json['stats']
            if 'stackBounds' in stats:
                bounds_json = stats['stackBounds']

        if bounds_json is None:
            url = '%s/bounds' % self.stack_url
            bounds_json = load_json(url)

        if 'currentVersion' in stack_meta_json:
            current_version = stack_meta_json['currentVersion']
            if 'stackResolutionX' in current_version and \
                    'stackResolutionY' in current_version and \
                    'stackResolutionZ' in current_version:
                self.resolution = JaneliaRenderDimension(current_version['stackResolutionX'],
                                                         current_version['stackResolutionY'],
                                                         current_version['stackResolutionZ'])

        url = '%s/zValues' % self.stack_url
        z_values_json = load_json(url)
        z_values = [int(v) for v in z_values_json]
        z_values.sort()

        # Dimensions
        width = int(bounds_json['maxX'])
        height = int(bounds_json['maxY'])
        depth = int(bounds_json['maxZ']) + 1
        self.dimension = JaneliaRenderDimension(width, height, depth)

        # Broken slices
        self.broken_slices = [] # type: List
        last = -1
        for i in z_values:
            for j in range(last + 1, i):
                self.broken_slices.append(j)
            last = i

        self.downsample_factors = []
        self.attribution = ''
        self.canary_location = JaneliaRenderDimension(0, 0, 0)
        self.placeholder_color = JaneliaRenderColor(0, 0, 0, 0)
        self.tags = [] # type: List


class JaneliaRenderProjectStacks:
    def __init__(self):
        # Default to XY orientation
        self.orientation = 0
        # Default to no translation
        self.translation = JaneliaRenderDimension(0, 0, 0)

    def get_stack(self, owner_and_project_id, stack_id):
        project = self.get_project(owner_and_project_id)
        return JaneliaRenderStack(project, stack_id)

    @staticmethod
    def get_project(owner_and_project_id):
        sep_index = owner_and_project_id.find('__')
        project_start = sep_index + 2

        if sep_index > -1 and len(owner_and_project_id) > project_start:
            owner_name = owner_and_project_id[:sep_index]
            project_name = owner_and_project_id[project_start:]
        else:
            msg = 'Valid identifiers match the pattern [owner]__[project].'
            raise ValueError("Invalid aggregated owner and project id: '%s'.  %s" % (owner_and_project_id, msg))

        return JaneliaRenderProject(owner_name, project_name)

    @staticmethod
    def get_all_projects():
        owners_url = '%s/owners' % settings.JANELIA_RENDER_SERVICE_URL

        projects = []
        for owner_name in load_json(owners_url):
            projects_url = '%s/owner/%s/projects' % (settings.JANELIA_RENDER_SERVICE_URL, owner_name)
            for project_name in load_json(projects_url):
                projects.append(JaneliaRenderProject(owner_name, project_name))

        return projects
