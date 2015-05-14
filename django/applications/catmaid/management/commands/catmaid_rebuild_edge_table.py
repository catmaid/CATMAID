import os
import catmaid

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from catmaid.models import Project
from optparse import make_option

class DryRunRollback(Exception):
    pass

class Command(BaseCommand):
    args = '<project_id>'
    help = 'Rebuild the edge table for all skeletons in the specified ' \
        'projects. No skeleton optimization will be done.'
    option_list = BaseCommand.option_list + (
        make_option('--dryrun',
            action='store_true',
            dest='dryrun',
            default=False,
            help='Don\'t actually apply changes'),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not args:
            raise CommandError('Please specify at least one project ID as argument')

        # Check arguments
        dryrun = options['dryrun']

        if dryrun:
            self.stdout.write('DRY RUN - no changes will be made')
        else:
            self.stdout.write('This will make changes to the database')

        cursor = connection.cursor()

        try:
            with transaction.atomic():
                for project_id in args:
                    try:
                        project = Project.objects.get(pk=int(project_id))
                        cursor.execute("SELECT count(*) FROM treenode_edge WHERE project_id = %s",
                                       (project.id,))
                        num_existing_edges = cursor.fetchone()[0]
                        # Clear edge table
                        cursor.execute('DELETE FROM treenode_edge WHERE project_id = %s',
                                       (project_id,))
                        self.stdout.write('Deleted edge information for project "%s" (%s edges)' % \
                                        (project_id, num_existing_edges))

                        # Add edges of available treenodes
                        cursor.execute('''
                            INSERT INTO treenode_edge (id, project_id, edge) (
                                SELECT c.id, c.project_id, ST_MakeLine(
                                ST_MakePoint(c.location_x, c.location_y, c.location_z),
                                ST_MakePoint(p.location_x, p.location_y, p.location_z))
                                FROM treenode c JOIN treenode p ON c.parent_id = p.id
                                WHERE c.parent_id IS NOT NULL AND c.project_id = %s)''',
                            (project_id,))
                        # Add self referencing adges for all root nodes
                        cursor.execute('''
                            INSERT INTO treenode_edge (id, project_id, edge) (
                                SELECT r.id, r.project_id, ST_MakeLine(
                                ST_MakePoint(r.location_x, r.location_y, r.location_z),
                                ST_MakePoint(r.location_x, r.location_y, r.location_z))
                                FROM treenode r
                                WHERE r.parent_id IS NULL AND r.project_id = %s)''',
                            (project_id,))

                        cursor.execute("SELECT count(*) FROM treenode_edge WHERE project_id = %s",
                                       (project.id,))
                        num_new_edges = cursor.fetchone()[0]
                        self.stdout.write('Created edge information for project "%s" (%s edges)' % \
                                        (project.id, num_new_edges))
                    except Project.DoesNotExist:
                        raise CommandError('Project "%s" does not exist' % project_id)

                if dryrun:
                    # For a dry run, cancel the transaction by raising an exception
                    raise DryRunRollback()

                self.stdout.write('Successfully rebuilt edge table')

        except DryRunRollback:
            self.stdout.write('Dry run completed')
