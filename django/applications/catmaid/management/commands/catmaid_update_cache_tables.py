import ujson
import msgpack
import psycopg2

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.node import (_node_list_tuples_query, update_cache,
        Postgis2dNodeProvider, ORIENTATIONS, update_node_query_cache,
        update_grid_cache)
from catmaid.models import Project


class Command(BaseCommand):
    help = "Update node query cache tables of all or individual projects."

    def add_arguments(self, parser):
        parser.add_argument('--clean', action='store_true', dest='clean',
            default=False, help='Remove all existing cache data before update'),
        parser.add_argument('--project_id', dest='project_id', nargs='+',
            default=False, help='Compute only statistics for these projects only (otherwise all)'),
        parser.add_argument('--cache', dest='cache_type', default="section",
            help='Which type of cache should be used: grid or section'),
        parser.add_argument('--type', dest='data_type', default="msgpack",
            help='Which type of cache to populate: json, json_text, msgpack'),
        parser.add_argument('--orientation', dest='orientations', nargs='+',
            default='xy', help='Which orientations should be generated: xy, ' +
            'xz, zy. Only used if a section cache type is used.'),
        parser.add_argument('--step', dest='steps', nargs='+',
            help='Map section thickness (depth resultion) for each orientation (in nm)'),
        parser.add_argument('--min-x', dest='min_x', default='-inf',
            help='Optional minimum X project space coordinate for cache update'),
        parser.add_argument('--max-x', dest='max_x', default='inf',
            help='Optional maximum X project space coordinate for cache update'),
        parser.add_argument('--min-y', dest='min_y', default='-inf',
            help='Optional minimum Y project space coordinate for cache update'),
        parser.add_argument('--max-y', dest='max_y', default='inf',
            help='Optional mayimum Y project space coordinate for cache update'),
        parser.add_argument('--min-z', dest='min_z', default='-inf',
            help='Optional minimum Z project space coordinate for cache update'),
        parser.add_argument('--max-z', dest='max_z', default='inf',
            help='Optional maximum Z project space coordinate for cache update'),
        parser.add_argument('--cell-width', dest='cell_width',
            default=settings.DEFAULT_CACHE_GRID_CELL_WIDTH,
            required=False, help='Optional, used with grid cache type: grid cell width in nm'),
        parser.add_argument('--cell-height', dest='cell_height',
            default=settings.DEFAULT_CACHE_GRID_CELL_HEIGHT,
            required=False, help='Optional, used with grid cache type: grid cell height in nm'),
        parser.add_argument('--cell-depth', dest='cell_depth',
            default=settings.DEFAULT_CACHE_GRID_CELL_DEPTH,
            required=False, help='Optional, used with grid cache type: grid cell width in nm'),
        parser.add_argument('--allow-empty', dest='allow_empty', action='store_true', default=False,
            required=False, help='Optional, used with grid cache type: whether empty cells are created'),
        parser.add_argument('--node-limit', dest='node_limit',
            default=settings.NODE_LIST_MAXIMUM_COUNT, help='Override node limit from settings. 0 means no limit'),
        parser.add_argument('--n-largest-skeletons-limit', dest='n_largest_skeletons_limit',
            default=None, help='Only show treenodes of the N largest skeletons in the field of view'),
        parser.add_argument('--n-last-edited-skeletons-limit', dest='n_last_edited_skeletons_limit',
            default=None, help='Only show treenodes of the N most recently edited skeletons in the field of view'),
        parser.add_argument('--hidden-last-editor', dest='hidden_last_editor',
            default=None, help='Only show treenodes that have not been edited last by this user (username)'),
        parser.add_argument('--lod-levels', dest='lod_levels', default=1,
                type=int, help='Optional, number of level-of-detail levels'),
        parser.add_argument('--lod-bucket-size', dest='lod_bucket_size', default=500,
                type=int, help='Optional, number of (smallest) LOD bucket.'),
        parser.add_argument('--lod-strategy', dest='lod_strategy', default='quadratic',
                type=str, help='Optional, the strategy of LOD bucket size change with LOD. Can be "linear" or "quadratic".'),
        parser.add_argument('--from-config', action="store_true", dest='from_config',
            default=False, help="Update cache based on NODE_PROVIDERS variable in settings")
        parser.add_argument('--progress', dest='progress', default=True,
            const=True, type=lambda x: (str(x).lower() == 'true'), nargs='?',
            help='Whether to show progress information')

    def handle(self, *args, **options):
        if options['from_config']:
            self.update_from_config(options)
        else:
            self.update_from_options(options)

        self.stdout.write('Done')

    def update_from_config(self, options):
        update_node_query_cache(log=lambda x: self.stdout.write(x))

    def update_from_options(self, options):
        cursor = connection.cursor()
        project_ids = options['project_id']
        if project_ids:
            projects = Project.objects.filter(id__in=project_ids)
        else:
            projects = Project.objects.all()

        cache_type = options['cache_type']
        if cache_type not in ('section', 'grid'):
            raise CommandError('Cache type must be one of: section, grid')

        orientations = options['orientations']
        if type(orientations) in (list, tuple):
            orientations = [o for o in orientations]
        else:
            orientations = ['xy']

        steps = options['steps']
        if cache_type == 'section':
            if not steps:
                raise CommandError('Need depth resolution per orientation (--step)')
            steps = [float(s) for s in steps]

            if len(steps) != len(orientations):
                raise CommandError('Need one depth resolution flag per orientation')

        delete = False
        clean = options['clean']
        if clean:
            if project_ids:
                delete = True
            else:
                # Removing cache data for all projects is faster this way.
                cursor.execute("TRUNCATE node_query_cache")

        bb_limits = [
            [float(options['min_x']), float(options['min_y']), float(options['min_z'])],
            [float(options['max_x']), float(options['max_y']), float(options['max_z'])]
        ]

        node_limit = options['node_limit']
        if node_limit:
            node_limit = int(options['node_limit'])
        else:
            node_limit = None

        n_largest_skeletons_limit = None
        if options['n_largest_skeletons_limit']:
            n_largest_skeletons_limit = int(options['n_largest_skeletons_limit'])

        n_last_edited_skeletons_limit = None
        if options['n_last_edited_skeletons_limit']:
            n_last_edited_skeletons_limit = int(options['n_last_edited_skeletons_limit'])

        hidden_last_editor_id = None
        if options['hidden_last_editor']:
            user = User.objects.get(username=options['hidden_last_editor'])
            hidden_last_editor_id = user.id

        data_type = options['data_type']

        if data_type not in ('json', 'json_text', 'msgpack'):
            raise CommandError('Type must be one of: json, json_text, msgpack')

        cell_width = options['cell_width']
        if cell_width:
            cell_width = float(cell_width)

        cell_height = options['cell_height']
        if cell_height:
            cell_height = float(cell_height)

        cell_depth = options['cell_depth']
        if cell_depth:
            cell_depth = float(cell_depth)

        allow_empty = options['allow_empty']

        lod_levels = options['lod_levels']
        if lod_levels:
            lod_levels = int(lod_levels)

        lod_bucket_size = options['lod_bucket_size']
        if lod_bucket_size:
            lod_bucket_size = int(lod_bucket_size)


        lod_strategy = options['lod_strategy']
        if lod_strategy not in ('linear', 'quadratic', 'exponential'):
            raise ValueError("Unknown LOD strategy: {}".format(lod_strategy))

        progress = options['progress']

        for p in projects:
            self.stdout.write('Updating {} cache for project {}'.format(cache_type, p.id))
            if cache_type == 'section':
                update_cache(p.id, data_type, orientations, steps, node_limit,
                        n_largest_skeletons_limit, n_last_edited_skeletons_limit,
                        hidden_last_editor_id, delete, bb_limits, log=self.stdout.write)
            elif cache_type == 'grid':
                update_grid_cache(p.id, data_type, orientations, cell_width,
                        cell_height, cell_depth, node_limit, n_largest_skeletons_limit,
                        n_last_edited_skeletons_limit, hidden_last_editor_id, delete,
                        bb_limits, log=self.stdout.write, progress=progress,
                        allow_empty=allow_empty, lod_levels=lod_levels,
                        lod_bucket_size=lod_bucket_size, lod_strategy=lod_strategy)
            self.stdout.write('Updated {} cache for project {}'.format(cache_type, p.id))
