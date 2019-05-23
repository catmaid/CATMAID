# -*- coding: utf-8 -*-

import logging
import numpy as np
import progressbar
import sys
from typing import Dict

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from catmaid.models import Project
from catmaid.util import str2bool


logger = logging.getLogger(__name__)

winding_check_enabled = True
try:
    from trimesh import Trimesh
    from trimesh.grouping import merge_vertices_hash
except ImportError:
    logger.warn('Optional depedency "trimesh" not found. Won\'t be able to check volume triange winding.')
    winding_check_enabled = False


class Command(BaseCommand):
    help = '''
        Tests the integrity of the specified projects with several sanity checks
        '''

    def add_arguments(self, parser):
        parser.add_argument('--project_id', nargs='*', type=int, default=[])
        parser.add_argument("--tracing", type=str2bool, nargs='?',
                        const=True, default=True, help="Check tracing data.")
        parser.add_argument("--volumes", type=str2bool, nargs='?',
                        const=True, default=True, help="Check volumes data.")

    def handle(self, *args, **options):
        project_ids = options['project_id']
        if not len(project_ids):
            project_ids = Project.objects.all().values_list('id', flat=True)

        passed = True
        for project_id in project_ids:
            passed = self.check_project(project_id, options) and passed

        if not passed:
            sys.exit(1)

    def check_project(self, project_id, options):
        if not Project.objects.filter(id=project_id).exists():
            raise CommandError('Project with id %s does not exist.' % project_id)
        self.stdout.write('Checking integrity of project %s' % project_id)

        passed = True
        if options['tracing']:
            passed = passed and self.check_tracing_data(project_id)

        if options['volumes']:
            passed = passed and self.check_volumes(project_id)

        self.stdout.write('')

        return passed


    def check_tracing_data(self, project_id):
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
        if len(skeleton_ids):
            self.stdout.write('')
        test_passed = True
        with progressbar.ProgressBar(max_value=len(skeleton_ids), redirect_stdout=True) as pbar:
            for i, skeleton_id in enumerate(skeleton_ids):
                pbar.update(i)
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
                    self.stdout.write('FAILED: node %s in skeleton %s has no path to root' % row)

        if test_passed:
            self.stdout.write('OK')


    def check_volumes(self, project_id):
        passed = True
        self.stdout.write('Check if all meshes consist only of triangles...', ending='')
        cursor = connection.cursor()
        cursor.execute("""
            SELECT volume_id, triangle_id, path, txtpoints
            FROM (
                SELECT volume_id,
                    (v.gdump).path[1],
                    array_agg((v.gdump).path order by (v.gdump).path[3] ASC),
                    array_agg((v.gdump).geom order by (v.gdump).path[3] ASC) as points,
                    array_agg(ST_AsText((v.gdump).geom) ORDER BY (v.gdump).path[3] ASC) as txtpoints
                FROM (
                    SELECT volume_id, gdump
                    FROM (
                        SELECT v.id AS volume_id,
                            ST_DumpPoints(geometry) AS gdump
                        FROM catmaid_volume v
                    ) v(volume_id, gdump)
                ) v(volume_id, gdump)
                GROUP BY v.volume_id, (v.gdump).path[1]
            ) triangle(volume_id, triangle_id, path, points, txtpoints)
            WHERE array_length(points, 1) <> 4
                OR ST_X(points[1]) <> ST_X(points[4])
                OR ST_Y(points[1]) <> ST_Y(points[4])
                OR ST_Z(points[1]) <> ST_Z(points[4]);
        """)
        non_triangles = list(cursor.fetchall())
        n_non_triangles = len(non_triangles)
        if n_non_triangles > 0:
            self.stdout.write('FAILED: found {} non-triangle meshes in project {}'.format(
                    n_non_triangles, project_id))
            self.stdout.write('\tThe following volumes contain those geometries: {}'.format(
                    ', '.join(nt[0] for nt in non_triangles)))
            passed = False
        else:
            self.stdout.write('OK')
            passed = passed and True


        self.stdout.write('Check if all triangles have the same orientation...', ending='')
        if winding_check_enabled:
            cursor.execute("""
                SELECT volume_id, triangle_id, points
                        FROM (
                        SELECT volume_id,
                            (v.gdump).path[1],
                            /* Points need to be ordered by index to be comparable. */
                            array_agg(ARRAY[ST_X((v.gdump).geom), ST_Y((v.gdump).geom), ST_Z((v.gdump).geom)] order by (v.gdump).path[ 3] ASC) as points
                        FROM (
                            SELECT volume_id, gdump
                            FROM (
                                SELECT v.id AS volume_id,
                                    ST_DumpPoints(geometry) AS gdump
                                FROM catmaid_volume v
                            ) v(volume_id, gdump)
                        ) v(volume_id, gdump)
                        GROUP BY v.volume_id, (v.gdump).path[1]
                        ) triangle(volume_id, triangle_id, points)
                        WHERE array_length(points, 1) = 4;
            """)
            volumes = {} # type: Dict
            for tri in cursor.fetchall():
                entry = volumes.get(tri[0])
                if not entry:
                    entry = {
                        'volume_id': tri[0],
                        'vertices': [],
                        'faces': [],
                    }
                    volumes[tri[0]] = entry
                vertices = entry['vertices']
                faces = entry['faces']
                vertex_offset = len(vertices)
                vertices.extend(tri[2])
                faces.append([vertex_offset, vertex_offset + 1, vertex_offset + 2])

            volumes_with_inconsistent_winding = []
            for volume_id, details in volumes.items():
                mesh = Trimesh(vertices=np.array(vertices), faces=np.array(faces),
                        process=False)
                # Merge all vertices in trimeshs
                merge_vertices_hash(mesh)
                # Check if the winding is consistent
                if not mesh.is_winding_consistent:
                    volumes_with_inconsistent_winding.append(volume_id)
                details['mesh'] = mesh

            if volumes_with_inconsistent_winding:
                self.stdout.write('FAILED: The following volumes have an ' +
                        'inconsistent winding: {}'.format(', '.join(
                                volumes_with_inconsistent_winding)))
            else:
                self.stdout.write('OK')

            passed = passed and not volumes_with_inconsistent_winding
        else:
            self.stdout.write('Not enabled (pip intall trimesh to enable)')

        return passed
