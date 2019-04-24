# -*- coding: utf-8 -*-

from django.conf import settings
from typing import List

from catmaid.control.dvid import get_server_info

class DVIDDimension:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z


class DVIDColor:
    def __init__(self, r, g, b, a):
        self.r = r
        self.g = g
        self.b = b
        self.a = a


class DVIDProject:
    def __init__(self, id):
        self.id = id
        self.title = id


class DVIDStackMirror:
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


class DVIDStack:
    def __init__(self, project_id, stack_id, stack_data, source_data):
        self.project = project_id
        self.id = stack_id
        self.title = stack_id
        dvid_url = settings.DVID_URL.rstrip('/')
        levels = stack_data['Extended']['Levels']
        r = levels['0']['Resolution']
        self.downsample_factors = [
            [a / b for (a, b) in zip(levels[str(k)]['Resolution'], r)]
            for k in sorted(map(int, levels.keys()))] # Convert to int to prevent lexographic sort.
        self.num_zoom_levels = len(levels.keys()) - 1
        self.resolution = DVIDDimension(r[0], r[1], r[2])
        ts = levels['0']['TileSize']
        self.description = ''
        self.metadata = None

        self.mirrors = [DVIDStackMirror(**{
            'id': stack_id,
            'title': 'Default',
            'image_base': 'api/%s/node/%s/%s/tile/' % (dvid_url, project_id, stack_id),
            'file_extension': settings.DVID_FORMAT,
            'tile_source_type': 8, # DVIDImagetileTileSource
            'tile_width': ts[0],
            'tile_height': ts[1],
            'position': 0
        })]

        # Dimensions
        min_point = source_data['Extended']['MinPoint']
        max_point = source_data['Extended']['MaxPoint']
        self.dimension = DVIDDimension(
            int(max_point[0]) - int(min_point[0]),
            int(max_point[1]) - int(min_point[1]),
            int(max_point[2]) - int(min_point[2]))

        # Broken slices
        self.broken_slices = [] # type: List

        self.downsample_factors = []
        self.attribution = ''
        self.canary_location = DVIDDimension(0, 0, 0)
        self.placeholder_color = DVIDColor(0, 0, 0, 0)
        self.tags = [] # type: List

class DVIDProjectStacks:
    def __init__(self):
        dvid_url = settings.DVID_URL.rstrip('/')
        self.data = get_server_info(dvid_url)

        # Default to XY orientation
        self.orientation = 0
        # Default to no translation
        self.translation = DVIDDimension(0, 0, 0)

    def get_stack(self, project_id, stack_id) -> DVIDStack:
        stack_data = self.data[project_id]['DataInstances'][stack_id]
        source_id = stack_data['Extended']['Source']
        source_data = self.data[project_id]['DataInstances'][source_id]
        return DVIDStack(project_id, stack_id, stack_data, source_data)

    def get_project(self, project_id) -> DVIDProject:
        return DVIDProject(project_id)
