import time

from django.db import connection, transaction, InternalError
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

    tables_with_history = (
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

    tables_without_history = (
        # History tables of versioned CATMAID tables
        'broken_slice_history',
        'cardinality_restriction_history',
        'catmaid_userprofile_history',
        'catmaid_volume_history',
        'change_request_history',
        'class_history',
        'class_class_history',
        'class_instance_history',
        'class_instance_class_instance_history',
        'client_data_history',
        'client_datastore_history',
        'concept_history',
        'connector_history',
        'connector_class_instance_history',
        'data_view_history',
        'data_view_type_history',
        'location_history',
        'message_history',
        'overlay_history',
        'project_history',
        'project_stack_history',
        'region_of_interest_history',
        'region_of_interest_class_instance_history',
        'relation_history',
        'relation_instance_history',
        'restriction_history',
        'review_history',
        'reviewer_whitelist_history',
        'stack_history',
        'stack_class_instance_history',
        'suppressed_virtual_treenode_history',
        'textlabel_history',
        'textlabel_location_history',
        'treenode_history',
        'treenode_class_instance_history',
        'treenode_connector_history',

        # History tables of versioned non-CATMAID tables
        'auth_group_history',
        'auth_group_permissions_history',
        'auth_permission_history',
        'auth_user_history',
        'auth_user_groups_history',
        'auth_user_user_permissions_history',
        'authtoken_token_history',
        'django_admin_log_history',
        'django_content_type_history',
        'django_migrations_history',
        'django_site_history',
        'guardian_groupobjectpermission_history',
        'guardian_userobjectpermission_history',
        'performancetests_event_history',
        'performancetests_testresult_history',
        'performancetests_testview_history',
        'taggit_tag_history',
        'taggit_taggeditem',

        # Time tables
        'broken_slice_time',
        'catmaid_userprofile_time',
        'client_data_time',
        'client_datastore_time',
        'data_view_time',
        'data_view_type_time',
        'overlay_time',
        'project_time',
        'project_stack_time',
        'reviewer_whitelist_time',
        'stack_time',
        'textlabel_location_time',
        'auth_group_time',
        'auth_group_permissions_time',
        'auth_permission_time',
        'auth_user_time',
        'auth_user_groups_time',
        'auth_user_user_permissions_time',
        'authtoken_token_time',
        'django_admin_log_time',
        'django_content_type_time',
        'django_migrations_time',
        'django_site_time',
        'guardian_groupobjectpermission_time',
        'guardian_userobjectpermission_time',
        'performancetests_event_time',
        'performancetests_testresult_time',
        'performancetests_testview_time',
        'taggit_tag_time',
        'taggit_taggeditem_history',
        'taggit_taggeditem_time',

        # Regular unversioned CATMAID tables
        'log',
        'treenode_edge',
        'catmaid_history_table',
        'treenode_connector_edge',
        'connector_geom',
        'catmaid_transaction_info',

        # Regular unversioned non-CATMAID tables
        'djkombu_queue',
        'djkombu_message',
        'djcelery_periodictasks',
        'celery_taskmeta',
        'celery_tasksetmeta',
        'djcelery_crontabschedule',
        'djcelery_intervalschedule',
        'djcelery_periodictask',
        'djcelery_workerstate',
        'djcelery_taskstate',
        'django_session',
        'spatial_ref_sys'
    )

    def test_name_length_limits(self):
        """ Make sure an exception is raised if the history table name for a live
        table exceeds identifier limits imposed by Postgres.
        """
        cursor = connection.cursor()
        with self.assertRaises(InternalError):
            cursor.execute("""
                CREATE TABLE
                    a_very_very_long_table_name_which_is_pretty_close_to_63_chars (
                        test    text
                    );
                SELECT create_history_table(
                    'a_very_very_long_table_name_which_is_pretty_close_to_63_chars'::regclass)
            """)


    def test_history_table_existence(self):
        """Test if all catmaid tables have a history table"""

        cursor = connection.cursor()

        # Check if tables show up in own catmaid_history_table tracking table.
        # First, get all expected tables that are defined in the list above.
        cmt_template = ",".join(('(%s)',) * len(HistoryTableTests.tables_with_history))
        cursor.execute("""
            SELECT cmt.table_name, cht.history_table_name,
                COUNT(cmt.table_name), COUNT(cht.history_table_name)
            FROM catmaid_history_table cht
            JOIN (VALUES {}) cmt(table_name)
                ON cmt.table_name::regclass = cht.live_table_name
            GROUP BY cmt.table_name, cht.history_table_name
        """.format(cmt_template), HistoryTableTests.tables_with_history)

        # Expect exactly one history table for all the specified CATMAID tables
        table_info = cursor.fetchall()
        self.assertEqual(len(table_info), len(HistoryTableTests.tables_with_history))
        # Expect only one history table per live table and vice versa
        for live_name, history_name, n_live, n_history in table_info:
            self.assertEqual(1, n_live)
            self.assertEqual(1, n_history)

        # List all tables in current database search path and make sure there
        # are no tables that are neither listed as explicitely as versioned or
        # without history. This should fail if e.g. one of CATMAID's
        # dependencies creates a new table that we haven't seen before.
        cursor.execute("""
            SELECT tablename FROM pg_tables WHERE schemaname='public';
        """)
        all_tables = [row[0] for row in cursor.fetchall()]
        unknown_tables = []
        for table_name in all_tables:
            if table_name in HistoryTableTests.tables_with_history:
                cursor.execute("""
                    SELECT history_table_name(%s::regclass)::regclass;
                """, (table_name,))
            elif table_name in HistoryTableTests.tables_without_history:
                with self.assertRaises(Exception):
                    cursor.execute("""
                        SELECT history_table_name({}::regclass)::regclass;
                    """, (table_name,))
            else:
                unknown_tables.append(table_name)

        if unknown_tables:
            if 1 == len(unknown_tables):
                raise ValueError("The tables {} wasn't declared as table with or "
                        "without history. Please add it to the list so that "
                        "checks can be performed properly.".format(
                            unknown_tables[0]))
            else:
                raise ValueError("The tables {} weren't declared as table with or "
                        "without history. Please add them to the list so that "
                        "checks can be performed properly.".format(
                            ", ".join(unknown_tables)))


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

    def test_insert_with_time_column(self):
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

    def test_insert_without_time_column(self):
        """Test if inserting new data in a live table without time column (and
        therefore with time table), leads to the expected result: no history
        change, but new time table entry.
        """
        cursor = connection.cursor()

        original_project_history = self.get_history_entries(cursor, 'project')
        n_original_entries = len(original_project_history)

        original_project_time = self.get_time_entries(cursor, 'project')
        n_original_time_entries = len(original_project_time)

        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject')
            RETURNING row_to_json(project.*),
                current_timestamp::text
        """)
        insert_result = cursor.fetchone()
        project_details = insert_result[0]
        project_creation_time = insert_result[1]

        new_project_history = self.get_history_entries(cursor, 'project')
        # Expect no changed history for new rows
        self.assertListEqual(original_project_history, new_project_history)

        # But expect a new time entry
        after_insert_project_time = self.get_time_entries(cursor, 'project')
        n_after_insert_time_entries = len(after_insert_project_time)

        # Get last time table class history entrie
        after_insert_project_time_entry = after_insert_project_time[-1][0]
        after_insert_project_edition_time = self.timestamp_to_interval_format(
            after_insert_project_time_entry['edition_time'])

        self.assertEqual(n_original_time_entries + 1, n_after_insert_time_entries)

        self.assertEqual(project_details['id'], after_insert_project_time_entry['live_pk'])
        self.assertEqual(project_creation_time, after_insert_project_edition_time)

    def test_update_with_time_column(self):
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

        # Expect one more history entry for the class name update
        new_class_history = self.get_history_entries(cursor, 'class')
        self.assertEqual(len(new_class_history), n_original_entries + 1)

        # Get last class history entry
        class_history_entry = new_class_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_history_entry[k])

        # It is now expected that the range of the history interval will end with
        # the edition time of the live table entry.
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

    def test_update_without_time_column(self):
        """Test if updating an existing entry without time column (and therefore
        with time table) leads to the correct history table updates. The update
        is performed in a different transaction, so that a different time is
        recorded for the change than for the creation.
        """
        cursor = connection.cursor()

        original_project_history = self.get_history_entries(cursor, 'project')
        n_original_entries = len(original_project_history)

        original_project_time = self.get_time_entries(cursor, 'project')
        n_original_time_entries = len(original_project_time)

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject')
            RETURNING row_to_json(project.*),
                current_timestamp::text
        """)
        project_result = cursor.fetchone()
        project_details = project_result[0]
        creation_time = project_result[1]
        transaction.commit()

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            UPDATE "project" SET title='new title'
            WHERE id=%s
            RETURNING row_to_json(project.*),
            current_timestamp::text;
        """, (project_details['id'],))
        new_project_result = cursor.fetchone()
        new_project_details = new_project_result[0]
        new_project_timestamp = new_project_result[1]
        transaction.commit()

        after_update_project_time = self.get_time_entries(cursor, 'project')
        n_after_update_time_entries = len(after_update_project_time)

        # Get last time table project entry
        after_update_project_time_entry = after_update_project_time[-1][0]
        after_update_project_edition_time = self.timestamp_to_interval_format(
            after_update_project_time_entry['edition_time'])

        self.assertEqual(n_original_time_entries + 1, n_after_update_time_entries)
        self.assertNotEqual(creation_time, after_update_project_edition_time)
        self.assertEqual(new_project_timestamp,
                after_update_project_edition_time)

        # Expect one more history entry for the update
        new_project_history = self.get_history_entries(cursor, 'project')
        self.assertEqual(len(new_project_history), n_original_entries + 1)

        # Get new project history entry
        project_history_entry = new_project_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in project_details.iteritems():
            self.assertEqual(v, project_history_entry[k])

        # It is now expected that the range of the history interval will end with
        # the edition time of the live table entry.
        expected_interval = self.format_range(creation_time, new_project_timestamp)
        self.assertEqual(project_history_entry['sys_period'], expected_interval)

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            UPDATE "project" SET title='new name 2'
            WHERE id=%s
            RETURNING row_to_json(project.*),
                current_timestamp::text;
        """, (project_details['id'],))
        new_project_2_result = cursor.fetchone()
        new_project_2_details = new_project_2_result[0]
        new_project_2_timestamp = new_project_2_result[1]
        transaction.commit()

        after_update_2_project_time = self.get_time_entries(cursor, 'project')
        n_after_update_2_time_entries = len(after_update_2_project_time)

        # Get last time table project entry
        after_update_2_project_time_entry = after_update_2_project_time[-1][0]
        after_update_2_project_edition_time = self.timestamp_to_interval_format(
            after_update_2_project_time_entry['edition_time'])

        self.assertNotEqual(new_project_timestamp, after_update_2_project_edition_time)
        self.assertEqual(new_project_2_timestamp, after_update_2_project_edition_time)

        # Expect one more history entry for the project name update
        new_project_2_history = self.get_history_entries(cursor, 'project')
        self.assertEqual(len(new_project_2_history), len(new_project_history) + 1)

        # Get last two project history entries
        project_history_2_entry_1 = new_project_2_history[-2][0]
        project_history_2_entry_2 = new_project_2_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in project_details.iteritems():
            self.assertEqual(v, project_history_2_entry_1[k])
        for k,v in new_project_details.iteritems():
            self.assertEqual(v, project_history_2_entry_2[k])

        # It is now expected that the range in the first interval will
        # end with the start of the second and the second will end with
        # the time table timestamp of the updated project.
        expected_interval_1 = self.format_range(creation_time,
                new_project_timestamp)
        expected_interval_2 = self.format_range(new_project_timestamp,
                new_project_2_timestamp)
        self.assertEqual(project_history_2_entry_1['sys_period'], expected_interval_1)
        self.assertEqual(project_history_2_entry_2['sys_period'], expected_interval_2)

    def test_delete_with_time_column(self):
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

    def test_delete_without_time_column(self):
        """Test if deleting an existing entry leads to the correct history table
        updates. The deletion is performed in a different transaction, so that
        a different time is recorded for the change than for the creation.
        """
        cursor = connection.cursor()

        original_project_history = self.get_history_entries(cursor, 'project')
        n_original_entries = len(original_project_history)

        original_project_time = self.get_time_entries(cursor, 'project')
        n_original_time_entries = len(original_project_time)

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject')
            RETURNING row_to_json(project.*),
                current_timestamp::text
        """)
        project_result = cursor.fetchone()
        project_details = project_result[0]
        creation_time = project_result[1]
        transaction.commit()

        after_insert_project_time = self.get_time_entries(cursor, 'project')
        n_after_insert_time_entries = len(after_insert_project_time)
        self.assertEqual(n_original_time_entries + 1, n_after_insert_time_entries)

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            DELETE FROM "project"
            WHERE id=%s
            RETURNING current_timestamp::text;
        """, (project_details['id'],))
        deletion_time = cursor.fetchone()[0]
        transaction.commit()

        # Expect one more history entry, valid from the original creation time
        # to the deletion time.
        new_project_history = self.get_history_entries(cursor, 'project')
        self.assertEqual(len(new_project_history), n_original_entries + 1)

        after_delete_project_time = self.get_time_entries(cursor, 'project')
        n_after_delete_time_entries = len(after_delete_project_time)

        after_delete_project_time_entry = after_delete_project_time[-1][0]
        after_delete_project_edition_time = self.timestamp_to_interval_format(
            after_delete_project_time_entry['edition_time'])

        # Expect one time table entry less, because the live row was deleted
        self.assertEqual(n_original_time_entries, n_after_delete_time_entries)
        # Don't expect last time entry to have ID of deleted row
        self.assertNotEqual(project_details['id'],
                after_delete_project_time_entry['live_pk'])

        # Get last project history entry
        project_history_entry = new_project_history[-1][0]

        # Expect all fields of the original table to match the history table
        for k,v in project_details.iteritems():
            self.assertEqual(v, project_history_entry[k])

        # It is now expected that the range in the first interval will end with
        # the start of the second, which should also equal the edition time of
        # the updated project entry.
        expected_interval = "[\"{}\",\"{}\")".format(creation_time, deletion_time)
        self.assertEqual(project_history_entry['sys_period'], expected_interval)

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

        # Disable history tracking again
        history.disable_history_tracking()

        # Expect no installed triggers anymore
        n_history_tables = HistoryTableTests.get_num_history_tables(cursor)
        n_missing_disabled = HistoryTableTests.get_num_tables_without_update_triggers(cursor)
        self.assertEqual(n_history_tables, n_missing_disabled)

        # Enable history tracking, but allow for silent failure. Expect zero
        # missing tables afterwards.
        history.enable_history_tracking(True)
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

    def test_live_table_truncate_with_time_column(self):
        """Test if truncating a live table copies all its rows to the history
        table.
        """
        cursor = connection.cursor()

        original_class_history = self.get_history_entries(cursor, 'class')
        n_original_entries = len(original_class_history)

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "class" (user_id, project_id, class_name)
            VALUES (%(user_id)s, %(project_id)s, 'testclass')
            RETURNING row_to_json(class.*),
                current_timestamp::text
        """, {
            'user_id': self.user.id,
            'project_id': self.project.id
        })
        class_result = cursor.fetchone()
        class_details = class_result[0]
        class_creation_time = class_result[1]
        transaction.commit()

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "class" (user_id, project_id, class_name)
            VALUES (%(user_id)s, %(project_id)s, 'testclass2')
            RETURNING row_to_json(class.*),
                current_timestamp::text
        """, {
            'user_id': self.user.id,
            'project_id': self.project.id
        })
        class_2_result = cursor.fetchone()
        class_2_details = class_2_result[0]
        class_2_creation_time = class_2_result[1]
        transaction.commit()

        # Get current number of projects
        cursor.execute("SELECT COUNT(*) FROM class")
        n_live_classes = cursor.fetchone()[0]
        transaction.commit()

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            TRUNCATE "class" CASCADE;
            SELECT current_timestamp::text;
        """)
        truncate_result = cursor.fetchone()
        truncate_timestamp = truncate_result[0]
        transaction.commit()

        # Expect time table to be truncated too
        self.assertNotEqual(class_creation_time, truncate_timestamp)
        self.assertNotEqual(class_2_creation_time, truncate_timestamp)

        # Expect all former live table entries to now be in the history table
        class_history = self.get_history_entries(cursor, 'class')
        self.assertEqual(len(class_history),
                n_original_entries + n_live_classes)

        # Get new project history entries
        class_1_history_entry = class_history[-2][0] #older
        class_2_history_entry = class_history[-1][0] #newer

        # Expect all fields of the original table to match the history table
        for k,v in class_details.iteritems():
            self.assertEqual(v, class_1_history_entry[k])
        for k,v in class_2_details.iteritems():
            self.assertEqual(v, class_2_history_entry[k])

        # It is now expected that the range of the history interval will end with
        # the truncation time of the live table.
        expected_interval_1 = self.format_range(class_creation_time, truncate_timestamp)
        expected_interval_2 = self.format_range(class_2_creation_time, truncate_timestamp)
        self.assertEqual(class_1_history_entry['sys_period'], expected_interval_1)
        self.assertEqual(class_2_history_entry['sys_period'], expected_interval_2)

    def test_live_table_truncate_without_time_column(self):
        """Test if truncating a live table copies all its rows to the history
        table.
        """
        cursor = connection.cursor()

        original_project_history = self.get_history_entries(cursor, 'project')
        n_original_entries = len(original_project_history)

        original_project_time = self.get_time_entries(cursor, 'project')
        n_original_time_entries = len(original_project_time)

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject')
            RETURNING row_to_json(project.*),
                current_timestamp::text
        """)
        project_result = cursor.fetchone()
        project_details = project_result[0]
        creation_time = project_result[1]
        transaction.commit()

        # Create initial row that will be modified
        cursor.execute("""
            INSERT INTO "project" (title)
            VALUES ('testproject2')
            RETURNING row_to_json(project.*),
                current_timestamp::text
        """)
        project_2_result = cursor.fetchone()
        project_2_details = project_2_result[0]
        creation_time_2 = project_2_result[1]
        transaction.commit()

        # Get current number of projects
        cursor.execute("SELECT COUNT(*) FROM project")
        n_live_projects = cursor.fetchone()[0]
        transaction.commit()

        # Update row in new transaction (to have new timestamp)
        cursor.execute("""
            TRUNCATE "project" CASCADE;
            SELECT current_timestamp::text;
        """, (project_details['id'],))
        truncate_result = cursor.fetchone()
        truncate_timestamp = truncate_result[0]
        transaction.commit()

        after_truncate_project_time = self.get_time_entries(cursor, 'project')
        n_after_truncate_time_entries = len(after_truncate_project_time)

        # Expect time table to be truncated too
        self.assertEqual(0, n_after_truncate_time_entries)
        self.assertNotEqual(creation_time, truncate_timestamp)

        # Expect all former live table entries to now be in the history table
        truncate_history = self.get_history_entries(cursor, 'project')
        self.assertEqual(len(truncate_history),
                n_original_entries + n_live_projects)

        # Get new project history entries
        project_1_history_entry = truncate_history[-2][0] #older
        project_2_history_entry = truncate_history[-1][0] #newer

        # Expect all fields of the original table to match the history table
        for k,v in project_details.iteritems():
            self.assertEqual(v, project_1_history_entry[k])
        for k,v in project_2_details.iteritems():
            self.assertEqual(v, project_2_history_entry[k])

        # It is now expected that the range of the history interval will end with
        # the truncation time of the live table.
        expected_interval_1 = self.format_range(creation_time, truncate_timestamp)
        expected_interval_2 = self.format_range(creation_time_2, truncate_timestamp)
        self.assertEqual(project_1_history_entry['sys_period'], expected_interval_1)
        self.assertEqual(project_2_history_entry['sys_period'], expected_interval_2)
