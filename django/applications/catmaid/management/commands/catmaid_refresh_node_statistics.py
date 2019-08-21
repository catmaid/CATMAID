from django.core.management.base import BaseCommand
from django.db import connection

from catmaid.control.stats import populate_stats_summary
from catmaid.models import Project


class Command(BaseCommand):
    help = "Rebuild statistics summary information, optionally from scratch."

    def add_arguments(self, parser):
        parser.add_argument('--clean', action='store_true', dest='clean',
            default=False, help='Remove all existing statistics before recomputation'),
        parser.add_argument('--project_id', dest='project_id', nargs='+',
            default=False, help='Compute only statistics for these projects only (otherwise all)'),

    def handle(self, *args, **options):
        cursor = connection.cursor()

        project_ids = options['project_id']
        if project_ids:
            projects = Project.objects.filter(id__in=project_ids)
        else:
            projects = Project.objects.all()

        delete = False
        clean = options['clean']
        if clean:
            if project_ids:
                delete = True
            else:
                # Removing statistics for all projects is much faster this way.
                cursor.execute("TRUNCATE catmaid_stats_summary")

        incremental = not clean
        for p in projects:
            populate_stats_summary(p.id, delete, incremental)
            self.stdout.write('Computed statistics for project {}'.format(p.id))
