import ujson
import msgpack
import psycopg2
import progressbar
import time

from collections import defaultdict
from timeit import default_timer as timer

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.node import (_node_list_tuples_query,
        get_tracing_bounding_box, Postgis2dNodeProvider, ORIENTATIONS,
        AVAILABLE_NODE_PROVIDERS, )
from catmaid.models import Project, ProjectStack


class Command(BaseCommand):
    help = "Sample all projects to find a reasonable node provider configuration"

    def add_arguments(self, parser):
        parser.add_argument('--project_id', dest='project_id', nargs='+',
            default=False, help='Sample node providers for these projects only (otherwise all)')
        parser.add_argument('--orientation', dest='orientations', nargs='+',
            default='xz', help='Sample only in the provided orientations (otherwise all available')
        parser.add_argument('--step', dest='steps', nargs='+', required=True,
            help='Map section thickness (depth resultion) for each orientation (in nm)')
        parser.add_argument('--sample-interval', dest='sample_intervals', nargs='+', required=True,
            help='Map sample interval to each orientation (in multiples of <step>)')
        parser.add_argument('--min-x', dest='min_x', default='-inf',
            help='Optional minimum X project space coordinate for cache update')
        parser.add_argument('--max-x', dest='max_x', default='inf',
            help='Optional maximum X project space coordinate for cache update')
        parser.add_argument('--min-y', dest='min_y', default='-inf',
            help='Optional minimum Y project space coordinate for cache update')
        parser.add_argument('--max-y', dest='max_y', default='inf',
            help='Optional mayimum Y project space coordinate for cache update')
        parser.add_argument('--min-z', dest='min_z', default='-inf',
            help='Optional minimum Z project space coordinate for cache update')
        parser.add_argument('--max-z', dest='max_z', default='inf',
            help='Optional maximum Z project space coordinate for cache update')
        parser.add_argument('--node-limit', dest='node_limit',
            default=settings.NODE_LIST_MAXIMUM_COUNT, help='Override node limit from settings. 0 means no limit')
        parser.add_argument('--min-fov-extent', dest='min_fov_extent', required=False, default=1000,
                help='Set a lower zoom level limit for either planar dimension.')
        parser.add_argument('--provider', dest='providers', nargs='+',
                required=False, default=['postgis2d', 'postgis2dblurry',
                    'postgis3d', 'postgis3dblurry'],
            help='A list of node providers to test, otherwise all are taken')

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
            orientations = list(ProjectStack.objects.filter(project__in=projects) \
                    .distinct('orientation').values_list('orientation', flat=True))

        steps = options['steps']
        if not steps:
            raise CommandError('Need depth resolution per orientation (--step)')
        steps = [float(s) for s in steps]

        sample_intervals = options['sample_intervals']
        if not sample_intervals:
            raise CommandError('Need sample interval for eachorientation (--sample-intervals)')
        sample_intervals = [int(s) for s in sample_intervals]

        bb_limits = [
            [float(options['min_x']), float(options['min_y']), float(options['min_z'])],
            [float(options['max_x']), float(options['max_y']), float(options['max_z'])]
        ]

        node_limit = options['node_limit']
        if node_limit == 0:
            node_limit = None
        elif node_limit is not None:
            node_limit = int(node_limit)

        min_fov_extent = int(options['min_fov_extent'])

        unavailable_node_providers = list(filter(lambda x: x not in AVAILABLE_NODE_PROVIDERS,
                options['providers']))
        if unavailable_node_providers:
            raise CommandError("Unknown node providers: {}".format(
                    str(unavailable_node_providers)))
        node_providers = options['providers']

        self.stdout.write("Using the following providers: {}".format(", ".join(node_providers)))

        project_results = {}

        for p in projects:
            self.stdout.write("Sampling project {}".format(p.id))
            # Find tracing bounding box
            self.stdout.write(' -> Finding tracing data bounding box')
            bb_data = get_tracing_bounding_box(p.id, cursor)
            bb = [bb_data[0], bb_data[1]]
            if None in bb[0] or None in bb[1]:
                self.stdout.write(' -> Found no valid bounding box, skipping project: {}'.format(bb))
                continue
            else:
                self.stdout.write(' -> Found bounding box: {}'.format(bb))

            # Apply bounding box limits to it
            if bb_limits:
                bb[0][0] = max(bb[0][0], bb_limits[0][0])
                bb[0][1] = max(bb[0][1], bb_limits[0][1])
                bb[0][2] = max(bb[0][2], bb_limits[0][2])
                bb[1][0] = min(bb[1][0], bb_limits[1][0])
                bb[1][1] = min(bb[1][1], bb_limits[1][1])
                bb[1][2] = min(bb[1][2], bb_limits[1][2])
                self.stdout.write(' -> Applied limits to bounding box: {}'.format(bb))

            params = {
                'left': bb[0][0],
                'top': bb[0][1],
                'z1': None,
                'right': bb[1][0],
                'bottom': bb[1][1],
                'z2': None,
                'project_id': p.id,
                'limit': node_limit,
                'format': 'json'
            }

            min_z = bb[0][2]
            max_z = bb[1][2]

            width = params['right'] - params['left']
            height = params['bottom'] - params['top']

            provider = Postgis2dNodeProvider()
            data_types = ['json']
            types = ', '.join(data_types)

            results = []
            project_results[p.id] = results

            # Step through boundinx box in each orientation using both the
            # section thickness <step> and <sample-interval>.
            for o, step, sample_interval in zip(orientations, steps, sample_intervals):
                orientation_id = ORIENTATIONS[o]
                self.stdout.write(' -> Sampling tracing data in orientation {} ' \
                        'with depth resolution {} and interval {} for type(s) {}'.format(
                        o, step, sample_interval, types))

                with progressbar.ProgressBar(min_value=min_z, max_value=max_z, redirect_stdout=True) as pbar:
                    z = min_z
                    while z < max_z:
                        params['z1'] = z
                        params['z2'] = z + step

                        first_run = True
                        # Step through zoom levels, cut field of view in half until we
                        # reach a lower dimension limit
                        current_min_extent = min(width, height)
                        current_level = 0
                        while current_min_extent > min_fov_extent or first_run:
                            first_run = False

                            effective_width = width / (2 ** current_level)
                            effective_height = height / (2 ** current_level)
                            current_min_extent = min(effective_width, effective_height)

                            width_offset = (width - effective_width) / 2
                            height_offset = (height - effective_height) / 2

                            # Center the view, maybe it should be density based.
                            params['left'] = bb[0][0] + width_offset
                            params['top'] = bb[0][1] + height_offset
                            params['right'] = bb[1][0] - width_offset
                            params['bottom'] = bb[1][1] - height_offset

                            # Iterare over all used node providers
                            for provider_name in node_providers:
                                # Time node query for each target node provider
                                provider = AVAILABLE_NODE_PROVIDERS[provider_name]()
                                timings = []
                                for i in range(0,3):
                                    start = time.time()
                                    result_tuple = _node_list_tuples_query(params, p.id, provider)
                                    end = time.time()
                                    timings.append(end - start)

                                results.append({
                                    'time': min(timings),
                                    'provider': provider_name,
                                    'width': int(effective_width),
                                    'height': int(effective_height),
                                    'z': z,
                                    'orientation': o,
                                    'n_nodes': len(result_tuple[0]),
                                    'n_connectors': len(result_tuple[1])
                                })

                            current_level += 1

                        z += step * sample_interval
                        pbar.update(min(z, max_z))

        self.stdout.write('Sorting data')
        for pid, data in project_results.items():
            self.stdout.write('Top 2 queries with nodes per zoom and extent in project {}'.format(pid))
            nonzero_data = list(filter(lambda x: x['n_nodes'] > 0, data))
            sorted_data = sorted(nonzero_data, key=lambda x: (-x['width'], -x['height'], -x['n_nodes'], x['time']))
            depth_count = defaultdict(float)
            for d in sorted_data:
                count = depth_count[d['width']]
                if count > 1:
                    continue
                depth_count[d['width']] += 1
                self.stdout.write('-> width: {width:>10} height: {height:>10} time: ' \
                        '{time:.4f} provider: {provider:>15} z: {z:>8} n_nodes: {n_nodes:>10}'.format(**d))

        self.stdout.write('Done')
