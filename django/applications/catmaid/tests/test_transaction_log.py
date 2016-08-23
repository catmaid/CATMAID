import json
import time

from django.db import connection, transaction, InternalError
from django.test import Client, TestCase
from guardian.shortcuts import assign_perm
from catmaid import history
from catmaid.models import Class, Project, User
from catmaid.control import tracing


class TransactionLogTests(TestCase):
    """Test the transaction log implementation, expecting an empty database.
    """

    def setUp(self):
        """Create a project and a suer with browse/annotate permissions on
        it. Both are referenced when creating
        """
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

    def authenticate(self):
        self.client.login(username="test", password="test")

    @staticmethod
    def get_tx_entries(cursor):
        cursor.execute("""
            SELECT row_to_json(t)
            FROM (SELECT * FROM catmaid_transaction_info txi
                  ORDER BY execution_time) t
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

    def test_transaction_log_entry(self):
        """Every node creation in the back-end should cause a new"""
        self.authenticate()
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
        parsed_response = json.loads(response.content)

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
