import time

from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase
from guardian.shortcuts import assign_perm
from catmaid import history
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

    def run(self, *args):
        """Wrap running of individual tests to make sure history tracking is
        enabled for each test.
        """
        history.enable_history_tracking()
        return super(HistoryTableTests, self).run(*args)

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
    def get_time_entries(cursor, live_table_name):
        cursor.execute("""
            SELECT row_to_json(t)
            FROM (SELECT * FROM {}_time) t
                  ORDER BY edition_time
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
        # Expect no changed history for new rows
        self.assertListEqual(original_class_history, new_class_history)

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
        self.assertEqual(len(new_class_history), n_original_entries + 1)

        # Get last two class history entries
        class_history_entry = new_class_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_history_entry[k])

        # It is now expected that the range in the first interval will end with
        # the start of the second, which should also equal the edition time of
        # the updated class entry.
        expected_interval = self.format_range(creation_time_1, edition_time_2)
        self.assertEqual(class_history_entry['sys_period'], expected_interval)

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

        # Expect one more history entriy for the class name update
        new_class_2_history = self.get_history_entries(cursor, 'class')
        self.assertEqual(len(new_class_2_history), len(new_class_history) + 1)

        # Get last two class history entries
        class_history_2_entry_1 = new_class_2_history[-2][0]
        class_history_2_entry_2 = new_class_2_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_history_2_entry_1[k])
        for k,v in new_class_details.iteritems():
            self.assertEqual(v, class_history_2_entry_2[k])

        # It is now expected that the range in the first interval will
        # end with the start of the second and the second will end with
        # the start of the third, which should also equal the edition
        # time of the updated class entry.
        expected_interval_1 = self.format_range(creation_time_1, edition_time_2)
        expected_interval_2 = self.format_range(edition_time_2, edition_time_3)
        self.assertEqual(class_history_2_entry_1['sys_period'], expected_interval_1)
        self.assertEqual(class_history_2_entry_2['sys_period'], expected_interval_2)

    def test_delete(self):
        """Test if deleting an existing entry leads to the correct history table
        updates. The deletion is performed in a different transaction, so that
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

    @classmethod
    def get_num_tables_without_update_triggers(cls, cursor):
        cursor.execute("""
            SELECT count(*) FROM catmaid_live_table_triggers
            WHERE triggers_installed = false;
        """)
        return cursor.fetchone()[0]

    @classmethod
    def get_num_history_tables(cls, cursor):
        cursor.execute("""
            SELECT count(*) FROM catmaid_history_table;
        """)
        return cursor.fetchone()[0]

    def test_history_tracking_disable_enable_sql(self):
        """Test if history tracking can be disabled and enabled through
        pain SQL.
        """
        cursor = connection.cursor()

        # Assert that history tables are fully set up, i.e. that there are
        # update triggers set for all tables
        n_missing_enabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(0, n_missing_enabled)

        # Disable history tracking
        cursor.execute("""SELECT disable_history_tracking()""")

        # Expect no installed triggers anymore
        n_history_tables = HistoryTableTests.get_num_history_tables(cursor)
        n_missing_disabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(n_history_tables, n_missing_disabled)

        # Enable history tracking and expect zero missing tables again
        cursor.execute("""SELECT enable_history_tracking()""")
        n_missing_enabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(0, n_missing_enabled)

    def test_history_tracking_disable_enable_python(self):
        """Test if history tracking can be disabled and enabled through
        CATMAID's Python API
        """
        cursor = connection.cursor()

        # Assert that history tables are fully set up, i.e. that there are
        # update triggers set for all tables
        n_missing_enabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(0, n_missing_enabled)

        # Disable history tracking
        history.disable_history_tracking()

        # Expect no installed triggers anymore
        n_history_tables = HistoryTableTests.get_num_history_tables(cursor)
        n_missing_disabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(n_history_tables, n_missing_disabled)

        # Enable history tracking and expect zero missing tables again
        history.enable_history_tracking()
        n_missing_enabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(0, n_missing_enabled)

    def test_time_synchronization_missed_insert_without_time_column(self):
        """See if disabling the history and inserting a new live row in a table
        without time column (and hence with time table), yields in the correct
        time table updates.
        """
        cursor = connection.cursor()

        # Disable history tracking and get number of rows
        history.disable_history_tracking()
        original_project_history = self.get_history_entries(cursor, 'project')
        n_original_entries = len(original_project_history)

        # Assert node count didn't change in time table
        original_project_time = self.get_time_entries(cursor, 'project')
        n_original_time_entries = len(original_project_time)

        # Create new row (without history updated)
        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject')
            RETURNING row_to_json(project.*)
        """)
        project_details = cursor.fetchone()[0]
        transaction.commit()

        # Assert the row count didn't change in the history tables, because
        # history tracking is disabled.
        after_insert_project_history = self.get_history_entries(cursor, 'project')
        n_after_insert_entries = len(after_insert_project_history)

        self.assertListEqual(original_project_history, after_insert_project_history)

        after_insert_project_time = self.get_time_entries(cursor, 'project')
        n_after_insert_time_entries = len(after_insert_project_time)

        # Don't expect time entries to change, history system is disabled
        self.assertListEqual(original_project_time, after_insert_project_time)

        # Sync time table
        cursor.execute("""
            SELECT sync_time_table(%s::regclass,
                (SELECT time_table FROM catmaid_history_table
                WHERE live_table_name=%s::regclass)::text),
                current_timestamp::text
        """, ('project', 'project'))
        sync_time = cursor.fetchone()[1]

        # Assert node count didn't change in time table
        after_sync_project_time = self.get_time_entries(cursor, 'project')
        n_after_sync_time_entries = len(after_sync_project_time)

        # Assert node count is up-to-date again
        after_sync_project_history = self.get_history_entries(cursor, 'project')
        n_after_sync_entries = len(after_sync_project_history)

        # Don't expect history to change
        self.assertListEqual(original_project_history,
                after_sync_project_history)

        # Get last time table class history entrie
        project_time_entry = after_sync_project_time[-1][0]
        project_edition_time = self.timestamp_to_interval_format(
            project_time_entry['edition_time'])

        # Expect all fields of the original table to match the history table
        self.assertEqual(project_details['id'], project_time_entry['live_pk'])
        self.assertEqual(sync_time, project_edition_time)

    def test_history_synchronization_missed_modify_without_time_column(self):
        """See if disabling the history and inserting a new live row, yields in
        the correct history if synchronized.
        """
        cursor = connection.cursor()

        # Create new row (without history updated)
        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject')
            RETURNING row_to_json(project.*)
        """)
        project_details = cursor.fetchone()[0]
        transaction.commit()

        # Disable history tracking and get number of rows
        history.disable_history_tracking()
        original_project_history = self.get_history_entries(cursor, 'project')
        n_original_entries = len(original_project_history)

        # Assert node count didn't change in time table
        original_project_time = self.get_time_entries(cursor, 'project')
        n_original_time_entries = len(original_project_time)

        # Get last time table class history entrie
        original_project_time_entry = original_project_time[-1][0]
        original_project_edition_time = self.timestamp_to_interval_format(
            original_project_time_entry['edition_time'])

        cursor.execute("""
            UPDATE "project" SET title='newname'
            WHERE id=%s
        """, (project_details['id'],))
        # Make sure triggers are executed
        transaction.commit()

        # Assert the row count didn't change in the history tables, because
        # history tracking is disabled.
        after_insert_project_history = self.get_history_entries(cursor, 'project')
        n_after_insert_entries = len(original_project_history)

        self.assertListEqual(original_project_history, after_insert_project_history)

        after_update_project_time = self.get_time_entries(cursor, 'project')
        n_after_update_time_entries = len(after_update_project_time)

        # Don't expect time entries to change, history system is disabled
        self.assertListEqual(original_project_time, after_update_project_time)

        # Sync time table
        cursor.execute("""
            SELECT sync_time_table(%s::regclass,
                (SELECT time_table FROM catmaid_history_table
                WHERE live_table_name=%s::regclass)::text),
                current_timestamp::text
        """, ('project', 'project'))
        sync_time = cursor.fetchone()[1]

        # Assert node count didn't change in time table
        after_sync_project_time = self.get_time_entries(cursor, 'project')
        n_after_sync_time_entries = len(after_sync_project_time)

        # Assert node count is up-to-date again
        after_sync_project_history = self.get_history_entries(cursor, 'project')
        n_after_sync_entries = len(after_sync_project_history)

        self.assertEqual(n_original_time_entries, n_after_sync_time_entries)
        self.assertEqual(n_original_entries, n_after_sync_entries)

        # Get last time table class history entrie
        project_time_entry = after_sync_project_time[-1][0]
        project_edition_time = self.timestamp_to_interval_format(
            project_time_entry['edition_time'])

        # Don't expect time table to change. Even though the live table changed,
        # we don't know the old data. Therefore, there is no need to update the
        # time table also. Let's pretend nothing happened.
        self.assertEqual(project_details['id'], project_time_entry['live_pk'])
        self.assertEqual(original_project_edition_time, project_edition_time)
