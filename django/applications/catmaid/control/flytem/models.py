# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json

try:
    # Python 2
    from urllib2 import urlopen, Request, HTTPError, URLError
except ImportError:
    # Python 3
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError

from django.conf import settings


def load_json(url):
    try:
        json_text = urlopen(url).read()
    except HTTPError as e:
        raise ValueError("Couldn't retrieve render service data from %s. Error: %s" % (url, e))
    except URLError as e:
        raise ValueError("Couldn't retrieve render service data from %s. Error: %s" % (url, e))

    return json.loads(json_text)


class FlyTEMDimension:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z


class FlyTEMColor:
    def __init__(self, r, g, b, a):
        self.r = r
        self.g = g
        self.b = b
        self.a = a


class FlyTEMProject:
    def __init__(self, id):
        self.id = id
        self.title = id


class FlyTEMStackMirror:
    def __init__(self, id, title, image_base, file_extension, tile_source_type,
            tile_width, tile_height, position):
        self.id = id
        self.title = title
        self.image_base = image_base
        self.file_extension = file_extension
        self.tile_source_type = tile_source_type
        self.tile_width = tile_width
        self.tile_height = tile_height
        self.position = position


class FlyTEMStack:
    def __init__(self, project_id, stack_id):
        self.project = project_id
        self.id = stack_id
        self.title = stack_id
        self.downsample_factors = None
        self.num_zoom_levels = -1

        # default resolution in case render stack does not have it defined in metadata
        r = settings.FLYTEM_STACK_RESOLUTION
        self.resolution = FlyTEMDimension(r[0], r[1], r[2])

        self.mirrors = [FlyTEMStackMirror(**{
            'id': stack_id,
            'title': 'Default',
            'image_base': '%s/project/%s/stack/%s/' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id),
            'file_extension': 'jpg',
            'tile_source_type': 7,
            'tile_width': settings.FLYTEM_STACK_TILE_WIDTH,
            'tile_height': settings.FLYTEM_STACK_TILE_HEIGHT,
            'position': 0
        })]

        self.description = ''

        url = '%s/project/%s/stack/%s' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
        stack_meta_json = load_json(url)
        self.metadata = stack_meta_json

        bounds_json = None
        if 'stats' in stack_meta_json:
            stats = stack_meta_json['stats']
            if 'stackBounds' in stats:
                bounds_json = stats['stackBounds']

        if bounds_json is None:
            url = '%s/project/%s/stack/%s/bounds' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
            bounds_json = load_json(url)

        if 'currentVersion' in stack_meta_json:
            current_version = stack_meta_json['currentVersion']
            if 'stackResolutionX' in current_version and 'stackResolutionY' in current_version and 'stackResolutionZ' in current_version:
                self.resolution = FlyTEMDimension(current_version['stackResolutionX'],
                                                  current_version['stackResolutionY'],
                                                  current_version['stackResolutionZ'])

        url = '%s/project/%s/stack/%s/zValues' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
        zvalues_json = load_json(url)
        zvalues = [int(v) for v in zvalues_json]
        zvalues.sort()

        # Dimensions
        width = int(bounds_json['maxX'])
        height = int(bounds_json['maxY'])
        depth = int(bounds_json['maxZ']) + 1
        self.dimension = FlyTEMDimension(width, height, depth)

        # Broken slices
        self.broken_slices = []
        last = -1
        for i in zvalues:
            for j in range(last + 1, i):
                self.broken_slices.append(j)
            last = i

        self.downsample_factors = []
        self.attribution = ''
        self.canary_location = FlyTEMDimension(0, 0, 0)
        self.placeholder_color = FlyTEMColor(0, 0, 0, 0)
        self.tags = []


class FlyTEMProjectStacks:
    def __init__(self):
        url = '%s/stackIds' % settings.FLYTEM_SERVICE_URL
        self.data = load_json(url)

        # Default to XY orientation
        self.orientation = 0
        # Default to no translation
        self.translation = FlyTEMDimension(0, 0, 0)

    def get_stack(self, project_id, stack_id):
        return FlyTEMStack(project_id, stack_id)

    def get_project(self, id):
        return FlyTEMProject(id)
