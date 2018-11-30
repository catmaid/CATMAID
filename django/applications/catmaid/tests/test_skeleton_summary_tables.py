# -*- coding: utf-8 -*-

import json
import time

from django.db import connection, transaction, InternalError
from django.test import TestCase, TransactionTestCase
from django.test.client import Client
from guardian.shortcuts import assign_perm
from catmaid import history
from catmaid.control import tracing
from catmaid.models import Class, Project, User
from catmaid.state import make_nocheck_state


class SkeletonSummaryTableTests(TransactionTestCase):
    """Test the trigger based skeleton summary upate.
    """

    def setUp(self):
        """Create a project and a suer with browse/annotate permissions.
        """
        self.client = Client()
        admin = User.objects.create(username="admin", password="admin", is_superuser=True)
        project = Project.objects.create(title="Testproject")
        self.project_id = project.id

        # Set project up for tracing
        tracing.setup_tracing(self.project_id, admin)
        self.authenticate()

    def authenticate(self):
        self.client.force_login(User.objects.get_or_create(username='test')[0])
        user = User.objects.get(username="test")
        project = Project.objects.get(pk=self.project_id)
        assign_perm('can_browse', user, project)
        assign_perm('can_annotate', user, project)

    def get_summary(self, cursor, skeleton_id):
        cursor.execute("""
            SELECT skeleton_id, cable_length, num_nodes
            FROM catmaid_skeleton_summary
            WHERE skeleton_id = %(skeleton_id)s

        """, {
            'skeleton_id': skeleton_id    
        })
        summaries = list(map(lambda x: {
            'skeleton_id': x[0],
            'cable_length': x[1],
            'num_nodes': x[2]
        }, cursor.fetchall()))

        if summaries and len(summaries) > 0:
            return summaries[0]
        else:
            return None

    def test_create_update_delete_skeleton(self):
        """Test summary before and after creating a new neuron.
        """
        self.authenticate()
        cursor = connection.cursor()

        # Create new skeleton
        response = self.client.post('/%d/treenode/create' % self.project_id, {
            'x': 1,
            'y': 2,
            'z': 3,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        skeleton_id = parsed_response['skeleton_id']

        # Expect basic summary setup
        initial_skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(initial_skeleton_summary, None)
        self.assertEqual(initial_skeleton_summary['cable_length'], 0.0)
        self.assertEqual(initial_skeleton_summary['num_nodes'], 1)

        # Add second node
        response = self.client.post('/%d/treenode/create' % self.project_id, {
            'x': 4,
            'y': 5,
            'z': 6,
            'confidence': 5,
            'parent_id': parsed_response['treenode_id'],
            'radius': 2,
            'state': make_nocheck_state()
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Expect updated summary setup
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 5.1961524)
        self.assertEqual(skeleton_summary['num_nodes'], 2)

        # Remember second node
        second_node_id = parsed_response['treenode_id']

        # Add third node
        response = self.client.post('/%d/treenode/create' % self.project_id, {
            'x': 7,
            'y': 8,
            'z': 9,
            'confidence': 5,
            'parent_id': second_node_id,
            'radius': 2,
            'state': make_nocheck_state()
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Remember third node
        third_node_id = parsed_response['treenode_id']

        # Expect updated summary setup
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 10.3923048)
        self.assertEqual(skeleton_summary['num_nodes'], 3)

        # Move second node
        response = self.client.post(
                '/%d/node/update' % self.project_id, {
                    'state': make_nocheck_state(),
                    't[0][0]': second_node_id,
                    't[0][1]': 10,
                    't[0][2]': 11,
                    't[0][3]': 12})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Expect updated summary setup
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 20.7846096908265)
        self.assertEqual(skeleton_summary['num_nodes'], 3)

        # Delete last node
        response = self.client.post(
                '/%d/treenode/delete' % self.project_id, {
                    'state': make_nocheck_state(),
                    'treenode_id': third_node_id
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Expect updated summary setup
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 15.588457268119)
        self.assertEqual(skeleton_summary['num_nodes'], 2)

        # Delete neuron
        response = self.client.post('/%d/neurons/from-models' % self.project_id, {
            'model_ids[0]': skeleton_id
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        neuron_id = parsed_response[str(skeleton_id)]

        response = self.client.post(
                '/{}/neuron/{}/delete'.format(self.project_id, neuron_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Expect no summary entry for deleted skeleton
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIs(skeleton_summary, None)

    def create_partition(self, partition, root=None):
        ids = []
        skeleton_id = None
        if root is None:
            root = -1
        parent = root
        for pos in partition:
            # Create new skeleton
            response = self.client.post('/%d/treenode/create' % self.project_id, {
                'x': pos[0],
                'y': pos[1],
                'z': pos[2],
                'confidence': 5,
                'parent_id': parent,
                'radius': 2,
                'state': make_nocheck_state()
            })
            self.assertEqual(response.status_code, 200)
            parsed_response = json.loads(response.content.decode('utf-8'))
            parent = parsed_response['treenode_id']
            ids.append(parsed_response['treenode_id'])

            if not skeleton_id:
                skeleton_id = parsed_response['skeleton_id']

        return ids, skeleton_id

    def test_branches_and_split(self):
        self.authenticate()
        cursor = connection.cursor()

        # Main branch
        main_trunk = [(1,2,3), (4,5,6), (7,8,9), (10,11,12), (13,14,15)]
        main_trunk_ids, skeleton_id = self.create_partition(main_trunk)

        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 20.78460969082)
        self.assertEqual(skeleton_summary['num_nodes'], 5)

        # Branch A
        branch_a = [(2,6,2), (6,2,1), (4,6,1)]
        branch_a_ids, _ = self.create_partition(branch_a, main_trunk_ids[1])

        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 35.58388398682)
        self.assertEqual(skeleton_summary['num_nodes'], 8)

        # Branch B
        branch_b = [(17,12,2), (42,21,12), (52,61,-1)]
        branch_b_ids, _ = self.create_partition(branch_b, main_trunk_ids[3])

        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 119.453404476)
        self.assertEqual(skeleton_summary['num_nodes'], 11)

        # Branch C
        branch_c = [(10,-12,23), (-4,11,122), (5,12,-11)]
        branch_c_ids, _ = self.create_partition(branch_c, main_trunk_ids[3])

        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 380.85271251741471)
        self.assertEqual(skeleton_summary['num_nodes'], 14)

        # Split
        response = self.client.post('/%d/skeleton/split' % self.project_id, {
            'treenode_id': main_trunk_ids[3],
            'upstream_annotation_map': '{}',
            'downstream_annotation_map': '{}',
            'state': make_nocheck_state()
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response['existing_skeleton_id'], skeleton_id)

        new_skeleton_id = parsed_response['new_skeleton_id']

        # Old skeleton
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 25.1915791414)
        self.assertEqual(skeleton_summary['num_nodes'], 6)

        # New skeleton is bigger one by default
        skeleton_summary = self.get_summary(cursor, new_skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 350.46498095330807811942)
        self.assertEqual(skeleton_summary['num_nodes'], 8)

    def test_merge(self):
        self.authenticate()
        cursor = connection.cursor()

        # Main branch
        main_trunk = [(1,2,3), (4,5,6), (7,8,9), (10,11,12), (13,14,15)]
        main_trunk_ids, skeleton_id = self.create_partition(main_trunk)

        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 20.78460969082)
        self.assertEqual(skeleton_summary['num_nodes'], 5)

        # Branch A
        branch_a = [(2,6,2), (6,2,1), (4,6,1)]
        branch_a_ids, skeleton_id_a = self.create_partition(branch_a)

        skeleton_summary = self.get_summary(cursor, skeleton_id_a)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 10.216698601)
        self.assertEqual(skeleton_summary['num_nodes'], 3)

        # Merge A into main branch
        response = self.client.post('/%d/skeleton/join' % self.project_id, {
            'from_id': main_trunk_ids[1],
            'to_id': branch_a_ids[0],
            'annotation_set': '{}',
            'state': make_nocheck_state()
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response['result_skeleton_id'], skeleton_id)
        self.assertEqual(parsed_response['deleted_skeleton_id'], skeleton_id_a)

        # Check summary of kept skeleton
        skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(skeleton_summary, None)
        self.assertAlmostEqual(skeleton_summary['cable_length'], 35.58388398682)
        self.assertEqual(skeleton_summary['num_nodes'], 8)

        # Check summary of removed skeleton
        skeleton_summary = self.get_summary(cursor, skeleton_id_a)
        self.assertIs(skeleton_summary, None)

    def test_recreation_in_sql(self):
        """Test whether a recreation from scratch of the summary table works as
        expected.
        """
        self.authenticate()

        # Create new skeleton
        response = self.client.post('/%d/treenode/create' % self.project_id, {
            'x': 1,
            'y': 2,
            'z': 3,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        skeleton_id = parsed_response['skeleton_id']

        cursor = connection.cursor()
        cursor.execute("""
            SELECT refresh_skeleton_summary_table();
        """)

        # Expect basic summary setup
        initial_skeleton_summary = self.get_summary(cursor, skeleton_id)
        self.assertIsNot(initial_skeleton_summary, None)
        self.assertEqual(initial_skeleton_summary['cable_length'], 0.0)
        self.assertEqual(initial_skeleton_summary['num_nodes'], 1)
