import json
import urllib2

from django.conf import settings


def load_json(url):
    try:
        json_text = urllib2.urlopen(url).read()
    except urllib2.HTTPError as e:
        raise ValueError("Couldn't retrieve render service data from %s. Error: %s" % (url, e))
    except urllib2.URLError as e:
        raise ValueError("Couldn't retrieve render service data from %s. Error: %s" % (url, e))

    return json.loads(json_text)


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

        # default resolution in case render stack does not have it defined in metadata
        r = settings.FLYTEM_STACK_RESOLUTION
        self.resolution = FlyTEMDimension(r[0], r[1], r[2])

        self.file_extension = 'jpg'
        self.tile_source_type = 7
        self.tile_width = settings.FLYTEM_STACK_TILE_WIDTH
        self.tile_height = settings.FLYTEM_STACK_TILE_HEIGHT
        self.metadata = ''
        self.trakem2_project = False

        url = '%s/project/%s/stack/%s' % (settings.FLYTEM_SERVICE_URL, project_id, stack_id)
        stack_meta_json = load_json(url)

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
