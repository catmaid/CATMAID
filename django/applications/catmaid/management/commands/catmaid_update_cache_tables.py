import ujson
import msgpack
import psycopg2

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.node import (_node_list_tuples_query, update_cache,
        Postgis2dNodeProvider, ORIENTATIONS)
from catmaid.models import Project


class Command(BaseCommand):
    help = "Update node query cache tables of all or individual projects."

    def add_arguments(self, parser):
        parser.add_argument('--clean', action='store_true', dest='clean',
            default=False, help='Remove all existing cache data before update'),
        parser.add_argument('--project_id', dest='project_id', nargs='+',
            default=False, help='Compute only statistics for these projects only (otherwise all)'),
        parser.add_argument('--type', dest='data_type', default="msgpack",
            help='Which type of cache to populate: json, json_text, msgpack'),
        parser.add_argument('--orientation', dest='orientations', nargs='+',
            default='xz', help='Which orientations should be generated: xy, xz, zy'),
        parser.add_argument('--step', dest='steps', nargs='+', required=True,
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
        parser.add_argument('--node-limit', dest='node_limit',
            default=settings.NODE_LIST_MAXIMUM_COUNT, help='Override node limit from settings. 0 means no limit'),
        parser.add_argument('--n-largest-skeletons-limit', dest='n_largest_skeletons_limit',
                default=None, help='Only show treenodes of the N largest skeletons in the field of view'),

    def handle(self, *args, **options):
        cursor = connection.cursor()

        project_ids = options['project_id']
        if project_ids:
            projects = Project.objects.filter(id__in=project_ids)
        else:
            projects = Project.objects.all()

        orientations = options['orientations']
        if type(orientations) in (list, tuple):
            orientations = [o for o in orientations]
        else:
            orientations = ['xy']

        steps = options['steps']
        if not steps:
            raise CommandError('Need depth resolution per orientation (--step)')
        steps = [float(s) for s in steps]

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

        node_limit = int(options['node_limit'])
        if node_limit == 0:
            node_limit = None

        n_largest_skeletons_limit = None
        if options['n_largest_skeletons_limit']:
            n_largest_skeletons_limit = int(options['n_largest_skeletons_limit'])

        data_type = options['data_type']

        if data_type not in ('json', 'json_text', 'msgpack'):
            raise CommandError('Type must be one of: json, json_text, msgpack')
        if len(steps) != len(orientations):
            raise CommandError('Need one depth resolution flag per orientation')

        for p in projects:
            self.stdout.write('Updating cache for project {}'.format(p.id))
            update_cache(p.id, data_type, orientations, steps, node_limit,
                    n_largest_skeletons_limit, delete, bb_limits,
                    log=self.stdout.write)
            self.stdout.write('Updated cache for project {}'.format(p.id))

        self.stdout.write('Done')
