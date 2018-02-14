import ujson
import msgpack
import psycopg2

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.node import (_node_list_tuples_query, Postgis2dNodeProvider,
        ORIENTATIONS)
from catmaid.models import Project


class Command(BaseCommand):
    help = "Update node query cache tables of all or individual projects."

    def add_arguments(self, parser):
        parser.add_argument('--keep-data', action='store_false', dest='clean',
            default=True, help='Remove all existing cache data before update'),
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

    def handle(self, *args, **options):
        cursor = connection.cursor()

        project_ids = options['project_id']
        if project_ids:
            projects = Project.objects.filter(id__in=project_ids)
        else:
            projects = Project.objects.all()

        orientations = options['orientations']
        if type(orientations) in (list, tuple):
            orientations = [ORIENTATIONS[o] for o in orientations]
        else:
            orientations = [0]

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

        data_type = options['data_type']
        for p in projects:
            self.stdout.write('Updating cache for project {}'.format(p.id))
            self.update_cache(p.id, data_type, orientations, steps, node_limit, delete, bb_limits)
            self.stdout.write('Updated cache for project {}'.format(p.id))

        self.stdout.write('Done')

    def update_cache(self, project_id, data_type, orientations, steps, node_limit=None, delete=True, bb_limits=None):
        if data_type not in ('json', 'json_text', 'msgpack'):
            raise CommandError('Type must be one of: json, json_text, msgpack')
        if len(steps) != len(orientations):
            raise CommandError('Need one depth resolution flag per orientation')

        cursor = connection.cursor()

        self.stdout.write(' -> Finding tracing data bounding box')
        cursor.execute("""
            SELECT ARRAY[ST_XMin(bb.box), ST_YMin(bb.box), ST_ZMin(bb.box)],
                   ARRAY[ST_XMax(bb.box), ST_YMax(bb.box), ST_ZMax(bb.box)]
            FROM (
                SELECT ST_3DExtent(edge) box FROM treenode_edge
                WHERE project_id = %(project_id)s
            ) bb;
        """, {
            'project_id': project_id
        })
        row = cursor.fetchone()
        if not row:
            raise CommandError("Could not compute bounding box of project {}".format(project_id))
        bb = [row[0], row[1]]
        if None in bb[0] or None in bb[1]:
            self.stdout.write(' -> Found no valid bounding box, skipping project: {}'.format(bb))
            return
        else:
            self.stdout.write(' -> Found bounding box: {}'.format(bb))

        if bb_limits:
            bb[0][0] = max(bb[0][0], bb_limits[0][0])
            bb[0][1] = max(bb[0][1], bb_limits[0][1])
            bb[0][2] = max(bb[0][2], bb_limits[0][2])
            bb[1][0] = min(bb[1][0], bb_limits[1][0])
            bb[1][1] = min(bb[1][1], bb_limits[1][1])
            bb[1][2] = min(bb[1][2], bb_limits[1][2])
            self.stdout.write(' -> Applied limits to bounding box: {}'.format(bb))

        if delete:
            for o in orientations:
                self.stdout.write(' -> Deleting existing cache entries in orientation {}'.format(project_id, o))
                cursor.execute("""
                    DELETE FROM node_query_cache
                    WHERE project_id = %(project_id)s
                    AND orientation = %(orientation)s
                """, {
                    'project_id': project_id,
                    'orientation': o
                })

        params = {
            'left': bb[0][0],
            'top': bb[0][1],
            'z1': None,
            'right': bb[1][0],
            'bottom': bb[1][1],
            'z2': None,
            'project_id': project_id,
            'limit': node_limit
        }

        min_z = bb[0][2]
        max_z = bb[1][2]

        data_types = [data_type]
        update_json_cache = 'json' in data_types
        update_json_text_cache = 'json_text' in data_types
        update_msgpack_cache = 'msgpack' in data_types

        provider = Postgis2dNodeProvider()
        types = ', '.join(data_types)

        for o, step in zip(orientations, steps):
            self.stdout.write(' -> Populating cache for orientation {} with depth resolution {} for types: {}'.format(o, step, types))
            z = min_z
            while z < max_z:
                params['z1'] = z
                params['z2'] = z + step
                result_tuple = _node_list_tuples_query(params, project_id, provider)

                if update_json_cache:
                    data = ujson.dumps(result_tuple)
                    cursor.execute("""
                        INSERT INTO node_query_cache (project_id, orientation, depth, json_data)
                        VALUES (%s, %s, %s, %s)
                    """, (project_id, o, z, json.dumps(result_tuple)))

                if update_json_text_cache:
                    data = ujson.dumps(result_tuple)
                    cursor.execute("""
                        INSERT INTO node_query_cache (project_id, orientation, depth, json_text_data)
                        VALUES (%s, %s, %s, %s)
                    """, (project_id, o, z, json.dumps(result_tuple)))

                if update_msgpack_cache:
                    data = msgpack.packb(result_tuple)
                    cursor.execute("""
                        INSERT INTO node_query_cache (project_id, orientation, depth, msgpack_data)
                        VALUES (%s, %s, %s, %s)
                    """, (project_id, o, z, psycopg2.Binary(data)))

                z += step
