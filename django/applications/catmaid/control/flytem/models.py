import json
import urllib2

from django.conf import settings

class FlyTEMDimension:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z

class FlyTEMProject:
    def __init__(self, id):
        self.id = id
        self.title = id

class FlyTEMStack:
    def __init__(self, project_id, stack_id):
        self.project = project_id
        self.id = stack_id
        self.title = stack_id
        self.image_base = '%s/project/%s/stack/%s/' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
        self.num_zoom_levels = -1
        self.file_extension = 'jpg'
        r = settings.FLYTEM_STACK_RESOLUTION
        self.resolution = FlyTEMDimension(r[0], r[1], r[2])
        self.tile_source_type = 7
        self.tile_width = settings.FLYTEM_STACK_TILE_WIDTH
        self.tile_height = settings.FLYTEM_STACK_TILE_HEIGHT
        self.metadata = ''
        self.trakem2_project = False

        try:
            url = '%s/project/%s/stack/%s/bounds' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
            bounds_json = urllib2.urlopen(url).read()
        except urllib2.HTTPError as e:
            raise ValueError("Couldn't retrieve FlyTEM project information from %s" % url)
        except urllib2.URLError as e:
            raise ValueError("Couldn't retrieve FlyTEM project information from %s" % url)

        bounds_json = json.loads(bounds_json)

        try:
            url = '%s/project/%s/stack/%s/zValues' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
            zvalues_json = urllib2.urlopen(url).read()
        except urllib2.HTTPError as e:
            raise ValueError("Couldn't retrieve FlyTEM project information from %s" % url)
        except urllib2.URLError as e:
            raise ValueError("Couldn't retrieve FlyTEM project information from %s" % url)

        zvalues_json = json.loads(zvalues_json)
        zvalues = [int(v) for v in zvalues_json]
        zvalues.sort()

        # Dimensions
        width = int(bounds_json['maxX'])
        height = int(bounds_json['maxY'])
        depth = zvalues[-1] + 1
        self.dimension = FlyTEMDimension(width, height, depth)

        # Broken slices
        self.broken_slices = []
        last = -1
        for i in zvalues:
            for j in range(last + 1, i):
                self.broken_slices.append(j)
            last = i

class FlyTEMProjectStacks:
    def __init__(self):
        try:
            url = '%s/stackIds' % settings.FLYTEM_SERVICE_URL
            project_stacks_json = urllib2.urlopen(url).read()
        except urllib2.HTTPError as e:
            raise ValueError("Couldn't retrieve FlyTEM project information from %s" % url)
        except urllib2.URLError as e:
            raise ValueError("Couldn't retrieve FlyTEM project information from %s" % url)

        self.data = json.loads(project_stacks_json)

        # Default to XY orientation
        self.orientation = 0
        # Default to no translation
        self.translation = FlyTEMDimension(0, 0, 0)

    def get_stack(self, project_id, stack_id):
        return FlyTEMStack(project_id, stack_id)

    def get_project(self, id):
        return FlyTEMProject(id)
