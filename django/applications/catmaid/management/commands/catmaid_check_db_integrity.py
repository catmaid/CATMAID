import sys

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from catmaid.models import Project

class Command(BaseCommand):
    args = '<project_id> <project_id> ...'
    help = '''
        Tests the integrity of the specified projects with several sanity checks
        '''

    def handle(self, *args, **options):
        if not len(args):
            project_ids = Project.objects.all().values_list('id', flat=True)
        else:
            project_ids = map(int, args)

        passed = True
        for project_id in project_ids:
            passed = passed and self.check_project(project_id)

        if not passed:
            sys.exit(1)

    def check_project(self, project_id):
        if not Project.objects.filter(id=project_id).exists():
            raise CommandError('Project with id %s does not exist.' % project_id)
        project_passed = True
        self.stdout.write('Checking integrity of project %s' % project_id)

        self.stdout.write('Check that no connected treenodes are in different skeletons...', ending='')
        cursor = connection.cursor()
        cursor.execute('''
                SELECT tn1.id, tn2.id
                FROM treenode tn1,
                     treenode tn2
                WHERE tn2.id = tn1.parent_id
                  AND tn1.skeleton_id <> tn2.skeleton_id
                  AND tn1.project_id = %s
                ''', (project_id,))
        if cursor.rowcount == 0:
            self.stdout.write('OK')
        else:
            project_passed = False
            self.stdout.write('')
            self.stdout.write('FAILED: found %s rows (should be 0)' % cursor.rowcount)

        self.stdout.write('Check that each skeleton has exactly one root node...', ending='')
        cursor.execute('''
                SELECT t.skeleton_id, count(*)
                FROM treenode t
                WHERE t.parent_id IS NULL
                  AND t.project_id = %s
                GROUP BY t.skeleton_id
                  HAVING count(*) <> 1
                ''', (project_id,))
        if cursor.rowcount == 0:
            self.stdout.write('OK')
        else:
            project_passed = False
            self.stdout.write('')
            self.stdout.write('FAILED: found %s rows (should be 0)' % cursor.rowcount)

        self.stdout.write('Check that all treenodes in a skeleton are connected to the root node...', ending='')
        cursor.execute('''
                SELECT DISTINCT skeleton_id
                FROM treenode
                WHERE project_id = %s
                ''', (project_id,))
        skeleton_ids = cursor.fetchall()
        test_passed = True
        for skeleton_id in skeleton_ids:
            cursor.execute('''
                    WITH RECURSIVE nodes (id) AS (
                      SELECT t.id
                      FROM treenode t
                      WHERE t.parent_id IS NULL
                        AND t.skeleton_id = %s
                      UNION ALL
                      SELECT t.id
                      FROM treenode t
                      JOIN nodes p ON t.parent_id = p.id)
                    SELECT t.id, t.skeleton_id
                    FROM treenode t
                    WHERE t.skeleton_id = %s
                      AND NOT EXISTS (SELECT n.id FROM nodes n WHERE n.id = t.id);
                    ''', (skeleton_id, skeleton_id))
            if cursor.rowcount:
                if test_passed:
                    self.stdout.write('')
                test_passed = False
                project_passed = False
                row = cursor.fetchone()
                self.stdout.write('FAILED: node %s is skeleton %s has no path to root' % row)
        if test_passed:
            self.stdout.write('OK')

        self.stdout.write('')

        return project_passed
