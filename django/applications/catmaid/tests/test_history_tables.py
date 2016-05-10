import time

from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from guardian.shortcuts import assign_perm
from catmaid.models import Class, Project, User


class HistoryTableTests(TransactionTestCase):
    """Test the history table implementation, expecting an empty database.
    """

    def setUp(self):
        """Create a project and a suer with browse/annotate permissions on
        it. Both are referenced when creating
        """
        self.user = User.objects.create(username="test", password="test")
        self.admin = User.objects.create(username="admin", password="admin", is_superuser=True)
        self.project = Project.objects.create(title="Testproject")
        assign_perm('can_browse', self.user, self.project)
        assign_perm('can_annotate', self.user, self.project)

    def test_history_table_existence(self):
        """Test if all catmaid tables have a history table"""
        expected_tables_with_history = (
            # CATMAID tables
            'broken_slice',
            'cardinality_restriction',
            'catmaid_userprofile',
            'catmaid_volume',
            'change_request',
            'class',
            'class_class',
            'class_instance',
            'class_instance_class_instance',
            'client_data',
            'client_datastore',
            'concept',
            'connector',
            'connector_class_instance',
            'data_view',
            'data_view_type',
            'location',
            'message',
            'overlay',
            'project',
            'project_stack',
            'region_of_interest',
            'region_of_interest_class_instance',
            'relation',
            'relation_instance',
            'restriction',
            'review',
            'reviewer_whitelist',
            'stack',
            'stack_class_instance',
            'suppressed_virtual_treenode',
            'textlabel',
            'textlabel_location',
            'treenode',
            'treenode_class_instance',
            'treenode_connector',

            # Non-CATMAID tables
            'auth_group',
            'auth_group_permissions',
            'auth_permission',
            'auth_user',
            'auth_user_groups',
            'auth_user_user_permissions',
            'authtoken_token',
            'django_admin_log',
            'django_content_type',
            'django_migrations',
            'django_site',
            'guardian_groupobjectpermission',
            'guardian_userobjectpermission',
            'performancetests_event',
            'performancetests_testresult',
            'performancetests_testview',
            'taggit_tag',
            'taggit_taggeditem'
        )

        cursor = connection.cursor()
        cmt_template = ",".join(('(%s)',) * len(expected_tables_with_history))
        cursor.execute("""
            SELECT cmt.table_name, cht.history_table_name,
                COUNT(cmt.table_name), COUNT(cht.history_table_name)
            FROM catmaid_history_table cht
            JOIN (VALUES {}) cmt(table_name)
                ON cmt.table_name::regclass = cht.live_table_name
            GROUP BY cmt.table_name, cht.history_table_name
        """.format(cmt_template), expected_tables_with_history)

        # Expect exactly one history table for all the specified CATMAID tables
        table_info = cursor.fetchall()
        self.assertEqual(len(table_info), len(expected_tables_with_history))
        # Expect only one history table per live table and vice versa
        for live_name, history_name, n_live, n_history in table_info:
            self.assertEqual(1, n_live)
            self.assertEqual(1, n_history)

    @staticmethod
    def get_history_entries(cursor, live_table_name):
        cursor.execute("""
            SELECT row_to_json(t)
            FROM (SELECT * FROM {}_history) t
                  ORDER BY lower(sys_period)
        """.format(live_table_name))
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

    def test_insert(self):
        """Test if inserting new data in a live table, leads to the expected
        result in its history table.
        """
        cursor = connection.cursor()

        original_class_history = self.get_history_entries(cursor, 'class')
        n_original_entries = len(original_class_history)

        cursor.execute("""
            INSERT INTO "class" (user_id, project_id, class_name)
            VALUES (%(user_id)s, %(project_id)s, 'testclass')
            RETURNING row_to_json(class.*)
        """, {
            'user_id': self.user.id,
            'project_id': self.project.id
        });
        class_details = cursor.fetchone()[0]

        new_class_history = self.get_history_entries(cursor, 'class')
        last_class_history_entry = new_class_history[-1][0]
        # Expect one entry more than before
        self.assertEqual(len(new_class_history), n_original_entries + 1)

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, last_class_history_entry[k])

        # Expect the history table entry to have a sys_period column, which is
        # set to an open interval beginning at te original values creation time.
        self.assertTrue('sys_period' in last_class_history_entry)
        # The date formatting is unforunately different for intervals, so we
        # have to transform the creation time into the expectcted interval
        # format, i.e. replacing the "T" and cutting of the last three
        # characters.
        reformated_creation_time = self.timestamp_to_interval_format(
                class_details['creation_time'])
        expected_interval = self.format_range(reformated_creation_time)
        self.assertEqual(last_class_history_entry['sys_period'], expected_interval)

    def test_update(self):
        """Test if updating an existing entry leads to the correct history table
        updates. The update is performed in a different transaction, so that a
        different time is recorded for the change than for the creation.
        """
        cursor = connection.cursor()

        original_class_history = self.get_history_entries(cursor, 'class')
        n_original_entries = len(original_class_history)

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "class" (user_id, project_id, class_name)
            VALUES (%(user_id)s, %(project_id)s, 'testclass')
            RETURNING row_to_json(class.*)
        """, {
            'user_id': self.user.id,
            'project_id': self.project.id
        })
        class_details = cursor.fetchone()[0]
        transaction.commit()

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            UPDATE "class" SET class_name='newname'
            WHERE id=%s
            RETURNING row_to_json(class.*);
        """, (class_details['id'],))
        new_class_details = cursor.fetchone()[0]
        transaction.commit()

        # Creation time shouldn' change, edition time should
        creation_time_1 = self.timestamp_to_interval_format(class_details['creation_time'])
        creation_time_2 = self.timestamp_to_interval_format(new_class_details['creation_time'])
        edition_time_2 = self.timestamp_to_interval_format(new_class_details['edition_time'])
        self.assertEqual(creation_time_1, creation_time_2)
        self.assertNotEqual(creation_time_2, edition_time_2)

        # Expect two more history entries, one for insertion and one for the
        # class name update.
        new_class_history = self.get_history_entries(cursor, 'class')
        self.assertEqual(len(new_class_history), n_original_entries + 2)

        # Get last two class history entries
        class_history_entry_1 = new_class_history[-2][0]
        class_history_entry_2 = new_class_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_history_entry_1[k])
        for k,v in new_class_details.iteritems():
            self.assertEqual(v, class_history_entry_2[k])

        # It is now expected that the range in the first interval will end with
        # the start of the second, which should also equal the edition time of
        # the updated class entry.
        expected_interval_1 = self.format_range(creation_time_1, edition_time_2)
        expected_interval_2 = self.format_range(edition_time_2)
        self.assertEqual(class_history_entry_1['sys_period'], expected_interval_1)
        self.assertEqual(class_history_entry_2['sys_period'], expected_interval_2)

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            UPDATE "class" SET class_name='newname2'
            WHERE id=%s
            RETURNING row_to_json(class.*);
        """, (class_details['id'],))
        new_class_2_details = cursor.fetchone()[0]
        transaction.commit()

        # Creation time shouldn' change, edition time should
        creation_time_3 = self.timestamp_to_interval_format(
                new_class_2_details['creation_time'])
        edition_time_3 = self.timestamp_to_interval_format(
                new_class_2_details['edition_time'])
        self.assertEqual(creation_time_1, creation_time_3)
        self.assertEqual(creation_time_2, creation_time_3)
        self.assertNotEqual(creation_time_3, edition_time_3)

        # Expect two more history entries, one for insertion and one for the
        # class name update.
        new_class_2_history = self.get_history_entries(cursor, 'class')
        self.assertEqual(len(new_class_2_history), len(new_class_history) + 1)

        # Get last two class history entries
        class_history_2_entry_1 = new_class_2_history[-3][0]
        class_history_2_entry_2 = new_class_2_history[-2][0]
        class_history_2_entry_3 = new_class_2_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_history_2_entry_1[k])
        for k,v in new_class_details.iteritems():
            self.assertEqual(v, class_history_2_entry_2[k])
        for k,v in new_class_2_details.iteritems():
            self.assertEqual(v, class_history_2_entry_3[k])

        # It is now expected that the range in the first interval will
        # end with the start of the second and the second will end with
        # the start of the third, which should also equal the edition
        # time of the updated class entry.
        expected_interval_1 = self.format_range(creation_time_1, edition_time_2)
        expected_interval_2 = self.format_range(edition_time_2, edition_time_3)
        expected_interval_3 = self.format_range(edition_time_3)
        self.assertEqual(class_history_2_entry_1['sys_period'], expected_interval_1)
        self.assertEqual(class_history_2_entry_2['sys_period'], expected_interval_2)
        self.assertEqual(class_history_2_entry_3['sys_period'], expected_interval_3)

    def test_delete(self):
        """Test if deleting an existing entry leads to the correct history table
        updates. The delettion is performed in a different transaction, so that
        a different time is recorded for the change than for the creation.
        """
        cursor = connection.cursor()

        original_class_history = self.get_history_entries(cursor, 'class')
        n_original_entries = len(original_class_history)

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "class" (user_id, project_id, class_name)
            VALUES (%(user_id)s, %(project_id)s, 'testclass')
            RETURNING row_to_json(class.*)
        """, {
            'user_id': self.user.id,
            'project_id': self.project.id
        })
        class_details = cursor.fetchone()[0]
        transaction.commit()

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            DELETE FROM "class"
            WHERE id=%s
            RETURNING current_timestamp::text;
        """, (class_details['id'],))
        deletion_time = cursor.fetchone()[0]
        transaction.commit()

        # Expect one more history entry, valid from the original creation time
        # to the deletion time.
        new_class_history = self.get_history_entries(cursor, 'class')
        self.assertEqual(len(new_class_history), n_original_entries + 1)

        # Original Creation time should be n' change, edition time should
        creation_time = self.timestamp_to_interval_format(class_details['creation_time'])
        self.assertNotEqual(creation_time, deletion_time)

        # Get last two class history entries
        class_history_entry = new_class_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_history_entry[k])

        # It is now expected that the range in the first interval will end with
        # the start of the second, which should also equal the edition time of
        # the updated class entry.
        expected_interval = "[\"{}\",\"{}\")".format(creation_time, deletion_time)
        self.assertEqual(class_history_entry['sys_period'], expected_interval)
