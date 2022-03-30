import ujson
import msgpack
import psycopg2
import logging

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.nat.r import create_dps_data_cache
from catmaid.models import Project
from catmaid.util import str2bool

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Update cache files that can be used by R based tools to access " + \
            "simplified skeleton versions to speed-up e.g. NBLAST queries."

    def add_arguments(self, parser):
        parser.add_argument('--project-id', dest='project_ids', nargs='+', required=True,
            default=[], help='Compute cache files only for these projects (otherwise all)'),
        parser.add_argument('--tangeht-neighbors', dest='tangent_neighbors', type=int,
            default=20, help='The number of neighbors to include for tangent estimation.'),
        parser.add_argument('--detail', dest='detail', type=int,
            default=10, help='The number of branching levels to keep.'),
        parser.add_argument('--resample-by', dest='resample_by', type=float,
            default=1e3, help='Resample skeletons to this spacing.'),
        parser.add_argument('--min-length', dest='min_length', type=float,
            default=0, help='Only include skeletons with a cable length of at least this.'),
        parser.add_argument('--max-length', dest='max_length', type=float,
            default=None, help='Only include skeletons with a cable length of at max this.'),
        parser.add_argument('--min-soma-length', dest='min_soma_length', type=float,
            default=1000, help='Only include skeletons with a cable length of at least this, in case there is a soma node.'),
        parser.add_argument('--soma-tags', dest='soma_tags', nargs='+',
            default=['soma'], help='Tags that identify soma nodes.'),
        parser.add_argument('--progress', dest='progress',
            type=str2bool, default=False, const=True, nargs='?',
            help='Whether or not to show progress reporting'),
        parser.add_argument('--skip-existing-files', dest='skip_existing_files',
            type=str2bool, default=True, const=True, nargs='?',
            help='Whether or not to skip existing cache files'),
        parser.add_argument('--omit-failures', dest='omit_failures',
            type=str2bool, default=True, const=True, nargs='?',
            help='Whether or not to skip over failed skeletons.'),
        parser.add_argument('--cache-path', dest='cache_path',
            default=None, help='File path to a target file'),

    def handle(self, *args, **options):
        cursor = connection.cursor()

        project_ids = options['project_ids']
        projects = Project.objects.filter(id__in=project_ids)

        for p in projects:
            logger.info(f'Creating cache for project {p}')
            create_dps_data_cache(p.id, 'skeleton',
                    tangent_neighbors=options['tangent_neighbors'],
                    detail=options['detail'],
                    omit_failures=options['omit_failures'],
                    min_length=options['min_length'],
                    min_soma_length=options['min_soma_length'],
                    soma_tags=options['soma_tags'],
                    resample_by=options['resample_by'],
                    progress=options['progress'],
                    max_length=options['max_length'],
                    cache_path=options['cache_path'])
        logger.info('Done')
