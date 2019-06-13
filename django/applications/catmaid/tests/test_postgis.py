# -*- coding: utf-8 -*-

from django.db import connection
from django.test import TestCase
from django.test.client import Client
from guardian.shortcuts import assign_perm
from catmaid.models import Project, User, TreenodeConnector
from catmaid.control import node, skeleton, treenode
from catmaid.tests.common import CatmaidTestCase

import json

class PostGISTests(CatmaidTestCase):
    """
    Test PostGIS related functionality. It expects the 'postgis' extension to
    be available in the test database. At the moment, it seems, the easiest way
    to have this, is to create a Postgres template called 'template_postgis'
    which has this extension enabled:
    https://docs.djangoproject.com/en/dev/ref/contrib/gis/install/postgis/#creating-a-spatial-database-template-for-earlier-versions
    """
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.username = "test2"
        self.password = "test"
        self.user = User.objects.get(username=self.username)
        self.test_project_id = 3

        self.client = Client()
        self.client.login(username=self.username, password=self.password)

        # Make sure the test user has permissions to browse and annotate
        # projects
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', self.user, p)
        assign_perm('can_annotate', self.user, p)

    def test_node_query(self):
        """
        Make sure nodes returned by a PostGIS based query are the same as the
        regular ones.
        """
        params = {
            'sid': 3,
            'limit': 5000,
            'project_id': self.test_project_id,
            'z1': 0,
            'z2': 9,
            'top': 4625.0,
            'left': 2860.0,
            'bottom': 8075.0,
            'right': 10860.0,
            'labels': False,
        }

        postgis_3d_nodes_r = node.node_list_tuples_query(params,
                self.test_project_id, node.Postgis3dNodeProvider(),
                tuple(), tuple(), include_labels=False)

        postgis_2d_nodes_r = node.node_list_tuples_query(params,
                self.test_project_id, node.Postgis2dNodeProvider(),
                tuple(), tuple(), include_labels=False)

        with self.settings(PREPARED_STATEMENTS=True):
            node_3d_ps_provider = node.Postgis3dNodeProvider()
            node_3d_ps_provider.prepare_db_statements(connection)
            postgis_3d_ps_nodes_r = node.node_list_tuples_query(params,
                    self.test_project_id, node_3d_ps_provider,
                    tuple(), tuple(), include_labels=False)

        with self.settings(PREPARED_STATEMENTS=True):
            node_2d_ps_provider = node.Postgis2dNodeProvider()
            node_2d_ps_provider.prepare_db_statements(connection)
            postgis_2d_ps_nodes_r = node.node_list_tuples_query(params,
                    self.test_project_id, node_2d_ps_provider,
                    tuple(), tuple(), include_labels=False)


        self.assertEqual(postgis_3d_nodes_r.status_code, 200)
        self.assertEqual(postgis_2d_nodes_r.status_code, 200)
        self.assertEqual(postgis_3d_ps_nodes_r.status_code, 200)
        self.assertEqual(postgis_2d_ps_nodes_r.status_code, 200)
        postgis_3d_nodes = json.loads(postgis_3d_nodes_r.content.decode('utf-8'))
        postgis_2d_nodes = json.loads(postgis_2d_nodes_r.content.decode('utf-8'))
        postgis_3d_ps_nodes = json.loads(postgis_3d_ps_nodes_r.content.decode('utf-8'))
        postgis_2d_ps_nodes = json.loads(postgis_2d_ps_nodes_r.content.decode('utf-8'))

        def test_returned_nodes(reference, to_test):
            self.assertEqual(len(reference), len(to_test))
            self.assertEqual(len(reference[0]), len(to_test[0]))
            self.assertEqual(len(reference[1]), len(to_test[1]))
            self.assertEqual(len(reference[2]), len(to_test[2]))
            self.assertEqual(reference[3], to_test[3])

            for tn in reference[0]:
                self.assertTrue(tn in to_test[0])

            for tn in to_test[0]:
                self.assertTrue(tn in reference[0])

            for c in reference[1]:
                c[7] = sorted(c[7])

            for c in to_test[1]:
                c[7] = sorted(c[7])

            for c in reference[1]:
                self.assertTrue(c in to_test[1])

            for c in to_test[1]:
                self.assertTrue(c in reference[1])

        test_returned_nodes(postgis_3d_nodes, postgis_2d_nodes)
        test_returned_nodes(postgis_3d_nodes, postgis_3d_ps_nodes)
        test_returned_nodes(postgis_3d_nodes, postgis_2d_ps_nodes)

    def get_edges(self, cursor, tnid):
        cursor.execute("""
            SELECT edge FROM treenode_edge WHERE id=%s AND project_id=%s
                    """,
            (tnid, self.test_project_id))
        return cursor.fetchall()

    def test_skeleton_join(self):
        """Test if joning two skeletons update the edge table correctly.
        """
        # Create two independent skeletons with one treenode each
        from_treenode = treenode._create_treenode(
            self.test_project_id, self.user, self.user, 0, 0, 0, -1, 0, -1, -1)
        to_treenode = treenode._create_treenode(
            self.test_project_id, self.user, self.user, 1, 1, 1, -1, 0, -1, -1)
        annotation_map = {}

        cursor = connection.cursor()

        # Expect one (self referencing) edge for both new nodes
        from_edges_before = self.get_edges(cursor, from_treenode.treenode_id)
        to_edges_before = self.get_edges(cursor, to_treenode.treenode_id)
        self.assertEqual(1, len(from_edges_before))
        self.assertEqual(1, len(to_edges_before))

        # Join them and test if the correct node appears in the edge table
        skeleton._join_skeleton(self.user,
                                from_treenode.treenode_id,
                                to_treenode.treenode_id,
                                self.test_project_id,
                                annotation_map)

        # Expect still one edge per node, but expect the to_edge to be
        # different from before (because it now references from_node)
        from_edges_after = self.get_edges(cursor, from_treenode.treenode_id)
        to_edges_after = self.get_edges(cursor, to_treenode.treenode_id)
        self.assertEqual(1, len(from_edges_after))
        self.assertEqual(1, len(to_edges_after))
        self.assertEqual(from_edges_before[0], from_edges_after[0])
        self.assertNotEqual(to_edges_before[0], to_edges_after[0])

    def test_trigger_on_edit_treenode_connector_upadte_edge(self):
        """Test if modifying a treenode/connector link will correctly update
        the respective edge table (treenode_connector_edge).
        """
        self.fake_authentication()
        treenode_connector_id = 360

        # Make sure the current edge entry is what we expect
        cursor = connection.cursor()
        cursor.execute("""
            SELECT bool_and(x)
            FROM (
                SELECT UNNEST(ARRAY[
                    ABS(t.location_x - ST_X(ST_StartPoint(tce.edge))) < 0.000001,
                    ABS(t.location_y - ST_Y(ST_StartPoint(tce.edge))) < 0.000001,
                    ABS(t.location_z - ST_Z(ST_StartPoint(tce.edge))) < 0.000001,
                    ABS(c.location_x - ST_X(ST_EndPoint(tce.edge))) < 0.000001,
                    ABS(c.location_y - ST_Y(ST_EndPoint(tce.edge))) < 0.000001,
                    ABS(c.location_z - ST_Z(ST_EndPoint(tce.edge))) < 0.000001]::boolean[]) AS x
                FROM treenode_connector_edge tce
                JOIN treenode_connector tc
                    ON tc.id = tce.id
                JOIN treenode t
                    ON t.id = tc.treenode_id
                JOIN connector c
                    ON c.id = tc.connector_id
                WHERE tce.id = %(tce_id)s
            ) sub
        """, {
            'tce_id': treenode_connector_id,
        })
        self.assertTrue(cursor.fetchone()[0])

        # Update treenode of link and expect edge to be updated too
        new_treenode = treenode._create_treenode(
            self.test_project_id, self.user, self.user, 0, 0, 0, -1, 0, -1, -1)

        treenode_connector = TreenodeConnector.objects.get(id=treenode_connector_id)
        treenode_connector.treenode_id = new_treenode.treenode_id
        treenode_connector.skeleton_id = new_treenode.skeleton_id
        treenode_connector.save();

        cursor.execute("""
            SELECT bool_and(x)
            FROM (
                SELECT UNNEST(ARRAY[
                    ABS(t.location_x - ST_X(ST_StartPoint(tce.edge))) < 0.000001,
                    ABS(t.location_y - ST_Y(ST_StartPoint(tce.edge))) < 0.000001,
                    ABS(t.location_z - ST_Z(ST_StartPoint(tce.edge))) < 0.000001,
                    ABS(c.location_x - ST_X(ST_EndPoint(tce.edge))) < 0.000001,
                    ABS(c.location_y - ST_Y(ST_EndPoint(tce.edge))) < 0.000001,
                    ABS(c.location_z - ST_Z(ST_EndPoint(tce.edge))) < 0.000001]::boolean[]) AS x
                FROM treenode_connector_edge tce
                JOIN treenode_connector tc
                    ON tc.id = tce.id
                JOIN treenode t
                    ON t.id = tc.treenode_id
                JOIN connector c
                    ON c.id = tc.connector_id
                WHERE tce.id = %(tce_id)s
            ) sub
        """, {
            'tce_id': treenode_connector_id,
        })
        self.assertTrue(cursor.fetchone()[0])
