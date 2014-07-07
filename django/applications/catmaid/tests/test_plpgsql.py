from django.db import connection
from django.test import TestCase

from catmaid.models import ProjectStack, Treenode

class IntersectionTableTest(TestCase):
    """ This test case tests the PL/pgSQL functions creating the intersection
    tables.
    """
    fixtures = ['catmaid_testdata']

    def test_table_creation(self):
        table_name = 'catmaid_skeleton_intersections'

        cursor = connection.cursor()
        cursor.execute('''
        SELECT * FROM recreate_intersection_table('%s')
        ''' % table_name)

        # Expect the new table to be created
        cursor.execute('''
        SELECT COUNT(*) FROM pg_class WHERE relname='%s'
        ''' % table_name)
        self.assertEqual(1, int(cursor.fetchall()[0][0]))

        # Expect the new table to have four columns
        expected_cols = ['id', 'child_id', 'parent_id', 'intersection']
        cursor.execute('''
        SELECT column_name FROM information_schema.columns
        WHERE table_name = '%s'
        ''' % table_name)
        actual_cols = [c[0] for c in cursor.fetchall()]
        self.assertEqual(expected_cols, actual_cols)

        # Expect the new table to have zero entries
        cursor.execute('SELECT * FROM %s' % table_name)
        self.assertEqual(0, len(cursor.fetchall()))

    def test_on_slice_treenodes(self):
        """ This test case makes sure all intersections are actually found. It
        only tests intersections that are on slices and requires a dense
        representation of the skeleton (i.e. a treenode on each slice that the
        skeleton intersects).
        """
        project_id = 3
        stack_id = 3
        table_name = 'catmaid_skeleton_intersections'

        # Re-create intersection table
        cursor = connection.cursor()
        cursor.execute('''
        SELECT * FROM recreate_intersection_table('%s')
        ''' % table_name)

        # Expect the new table to be created
        cursor.execute('''
        SELECT COUNT(*) FROM pg_class WHERE relname='%s'
        ''' % table_name)
        self.assertEqual(1, int(cursor.fetchall()[0][0]))

        # Populate the intersection table for project one and stack one
        cursor = connection.cursor()
        cursor.execute('''
        SELECT * FROM populate_intersection_table(%s,%s,'%s')
        ''' % (project_id, stack_id, table_name))

        # First, count the number of generated intersections and compare them
        # to the number of treenodes. This test is correct here, because we
        # test against an XY stack amd all treenodes lie on a section of the
        # stack we used to create intersections against.
        num_treenodes = Treenode.objects.filter(project_id=project_id).count()
        cursor.execute('''
        SELECT COUNT(*) FROM %s
        ''' % table_name)
        num_intersections = int(cursor.fetchall()[0][0])
        self.assertEquals(num_treenodes, num_intersections)

        # Second, compare the actual locations of all treenodes against the
        # generated intersections. Because the generated intersections lie on
        # sections, their child_id is equal to the actual treenode ID.
        t_id_vs_loc = dict(Treenode.objects.filter(project_id=project_id) \
                .values_list('id', 'location'))
        cursor.execute('''
        SELECT child_id, intersection FROM %s
        ''' % table_name)
        i_id_vs_loc = {r[0]: r[1] for r in cursor.fetchall()}

        for tid, tloc in t_id_vs_loc.items():
            self.assertEquals(tloc, i_id_vs_loc[tid])
