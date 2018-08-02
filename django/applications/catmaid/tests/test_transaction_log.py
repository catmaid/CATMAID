# -*- coding: utf-8 -*-

import json
import time
from unittest import skipUnless

from django.conf import settings
from django.core.cache import cache
from django.db import connection, transaction, InternalError
from django.test import Client, TestCase, TransactionTestCase
from guardian.shortcuts import assign_perm
from catmaid import history
from catmaid.models import Class, Project, User
from catmaid.control import tracing
from catmaid.state import make_nocheck_state


class TransactionLogTests(TransactionTestCase):
    """Test the transaction log implementation, expecting an empty database.
    """

    def setUp(self):
        """Create a project and a suer with browse/annotate permissions on
        it. Both are referenced when creating
        """
        cache.clear()

        self.client = Client()
        self.user = User.objects.create(username="test")
        self.user.set_password("test")
        self.user.save()
        self.admin = User.objects.create(username="admin", is_superuser=True)
        self.admin.set_password("admin")
        self.admin.save()
        self.project = Project.objects.create(title="Testproject")
        assign_perm('can_browse', self.user, self.project)
        assign_perm('can_annotate', self.user, self.project)

        # Set project up for tracing
        tracing.setup_tracing(self.project.id, self.admin)
        self.authenticate()

    def run(self, *args):
        """Wrap running of individual tests to make sure the transaction log is
        truncated after every test run. This table isn't taken care of by
        Django, because it is not known as a model to it.
        """
        self.reset_tx_log()
        result = super(TransactionLogTests, self).run(*args)
        return result

    def authenticate(self):
        self.client.login(username="test", password="test")

    @staticmethod
    def reset_tx_log(cursor=None):
        cursor = cursor or connection.cursor()
        # Reset transaction log
        cursor.execute("""
            TRUNCATE TABLE catmaid_transaction_info;
        """)
        # Reset history
        cursor.execute("""
            TRUNCATE TABLE treenode__history;
        """)
        transaction.commit()

    @staticmethod
    def get_tx_entries(cursor):
        cursor.execute("""
            SELECT row_to_json(t)
            FROM (SELECT * FROM catmaid_transaction_info txi
                  ORDER BY execution_time ASC) t
        """)
        return cursor.fetchall()

    @staticmethod
    def timestamp_to_interval_format(timestamp):
        """The JSON representation of intervals encodes timestamps in a
        different format than regular timestamps are encoded. This will
        transform a string representation of regular timestamps into the
        representation used of ranges.
        """
        return timestamp.replace("T", " ")[0:-3]

    @staticmethod
    def format_range(timestamp1, timestamp2=None):
        """Format one or two timestamps to represent a half-open Postgres range
        """
        if timestamp2:
            return "[\"{}\",\"{}\")".format(timestamp1, timestamp2)
        else:
            return "[\"{}\",)".format(timestamp1)

    def get_location(self, txid, exec_time, label):
        """ Get location based on the transaction ID and time"""
        response = self.client.get('/%d/transactions/location' % self.project.id,
                {
                    'transaction_id': txid,
                    'execution_time': exec_time,
                    'label': label
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        return parsed_response

    def test_transaction_log_entry(self):
        """Every node creation in the back-end should cause a new"""
        cursor = connection.cursor()
        original_tx_entries = self.get_tx_entries(cursor)
        n_original_tx_entries = len(original_tx_entries)

        # Create a new treenode
        response = self.client.post('/%d/treenode/create' % self.project.id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        transaction.commit()

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        after_insert_tx_entries = self.get_tx_entries(cursor)
        n_after_insert_tx_entries = len(after_insert_tx_entries)
        self.assertEqual(n_original_tx_entries + 1, n_after_insert_tx_entries)
        after_insert_tx = after_insert_tx_entries[0][0]

        self.assertEqual('Backend', after_insert_tx['change_type'])
        self.assertEqual('treenodes.create', after_insert_tx['label'])

        self.assertEqual(self.user.id, after_insert_tx['user_id'])
        self.assertEqual(self.project.id, after_insert_tx['project_id'])

        txid = after_insert_tx['transaction_id']

        cursor.execute("""
            SELECT row_to_json(t) FROM treenode t WHERE txid=%s
        """, (txid,))
        treenodes_of_txid = cursor.fetchall()

        self.assertEqual(1, len(treenodes_of_txid))
        nt = treenodes_of_txid[0][0]

        self.assertEqual(5, nt['confidence'])
        self.assertEqual(self.user.id, nt['user_id'])
        self.assertEqual(5, nt['location_x'])
        self.assertEqual(10, nt['location_y'])
        self.assertEqual(15, nt['location_z'])
        self.assertEqual(2, nt['radius'])
        self.assertEqual(None, nt['parent_id'])
        self.assertEqual(self.project.id, nt['project_id'])

    @skipUnless(getattr(settings, 'HISTORY_TRACKING', True), 'History tracking is not enabled')
    def test_locaton_lookup_treenode(self):
        """Test if the location of a newly created treenode can be retrieved
        through the transaction log. Also test if this works for the updated
        location and the historic creation event."""
        cursor = connection.cursor()

        # Create a new treenode
        response = self.client.post('/%d/treenode/create' % self.project.id, {
            'x': 5.5,
            'y': 10.5,
            'z': 15.5,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2})
        transaction.commit()
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)
        treenode_id = parsed_response['treenode_id']

        after_insert_tx_entries = self.get_tx_entries(cursor)
        n_after_insert_tx_entries = len(after_insert_tx_entries)
        after_insert_tx = after_insert_tx_entries[0][0]

        txid = after_insert_tx['transaction_id']
        exec_time = after_insert_tx['execution_time']
        label = after_insert_tx['label']

        # Get location based on the transaction ID and time, expect it to be the
        # same like the location of the created node above.
        txid_locaton = self.get_location(txid, exec_time, label)

        self.assertEqual(5.5, txid_locaton['x'])
        self.assertEqual(10.5, txid_locaton['y'])
        self.assertEqual(15.5, txid_locaton['z'])

        # Update the node location and
        response = self.client.post(
                '/%d/node/update' % self.project.id, {
                    'state': make_nocheck_state(),
                    't[0][0]': treenode_id,
                    't[0][1]': 6.2,
                    't[0][2]': 11.2,
                    't[0][3]': 16.2})
        transaction.commit()
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        after_update_tx_entries = self.get_tx_entries(cursor)
        n_after_update_tx_entries = len(after_update_tx_entries)
        after_update_tx = after_update_tx_entries[1][0]

        self.assertEqual(n_after_insert_tx_entries + 1,
                n_after_update_tx_entries)

        txid_2 = after_update_tx['transaction_id']
        exec_time_2 = after_update_tx['execution_time']
        label_2 = after_update_tx['label']

        # Test locaton of original node with original transaction
        txid_locaton = self.get_location(txid, exec_time, label)

        self.assertAlmostEqual(5.5, txid_locaton['x'], 5)
        self.assertAlmostEqual(10.5, txid_locaton['y'], 5)
        self.assertAlmostEqual(15.5, txid_locaton['z'], 5)

        # Test locaton of updated node with new transaction
        txid_locaton_2 = self.get_location(txid_2, exec_time_2, label_2)

        self.assertAlmostEqual(6.2, txid_locaton_2['x'], 5)
        self.assertAlmostEqual(11.2, txid_locaton_2['y'], 5)
        self.assertAlmostEqual(16.2, txid_locaton_2['z'], 5)
