# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import connection, migrations, models

from catmaid.apps import get_system_user

add_history_functions_sql = """

    -- Create a table to keep track of created history tables. This log is
    -- useful for rolling back this migration and more robust access to
    -- individual history tables based on a live table name.
    CREATE TABLE catmaid_history_table (
        history_table_name  name PRIMARY KEY,
        live_table_name     regclass,
        creation_time       timestamptz NOT NULL DEFAULT current_timestamp
    );


    -- This enum type represents different types of history changes that are
    -- recorded in CATMAID's transaction information table.
    CREATE TYPE history_change_type AS ENUM ('Backend', 'Migration', 'External');


    -- The combination of transaction ID and execution time is unique and
    -- represents one semantic front-end action, initiated by a particular
    -- user. The unique constraint isn't added explicitelt to avoid performance
    -- costs during insertion.
    CREATE TABLE catmaid_transaction_info (
        transaction_id bigint DEFAULT txid_current(),
        execution_time timestamp with time zone DEFAULT current_timestamp,
        user_id integer,
        change_type history_change_type NOT NULL,
        label text NOT NULL,
        CONSTRAINT catmaid_transaction_info_pk PRIMARY KEY (transaction_id, execution_time)
    );


    -- Return the unquoted name of an input table's history table.
    CREATE OR REPLACE FUNCTION history_table_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT relname || '_history' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;

    -- Create a view that makes access to inheritance information more convenient
    CREATE VIEW catmaid_inheritening_tables
    AS
        SELECT parnsp.nspname AS parent_schemaname,
            parcla.relname AS parent_tablename,
            parcla.oid AS parent_oid,
            chlnsp.nspname AS child_schemaname,
            chlcla.relname AS child_tablename,
            chlcla.oid AS child_oid
        FROM pg_catalog.pg_inherits
        JOIN pg_catalog.pg_class AS chlcla ON (chlcla.oid = inhrelid)
        JOIN pg_catalog.pg_namespace AS chlnsp ON (chlnsp.oid = chlcla.relnamespace)
        JOIN pg_catalog.pg_class AS parcla ON (parcla.oid = inhparent)
            JOIN pg_catalog.pg_namespace AS parnsp ON (parnsp.oid = parcla.relnamespace);


    -- Create a history table and triggers to populate it for the passed in
    -- table. Always use this function to create history tables to ensure
    -- everything is set up correctly. If the passed in table inherits from
    -- another table and <copy_inheritance> is true (default), the history
    -- table will have the same inheritance hierarchy as the live table.
    --
    -- Note that while regclass typed arguments are safer, they can't be
    -- easiliy used to construct new database identifier names without
    -- running into quoting issues easily. The validity of this input is checked.
    CREATE OR REPLACE FUNCTION create_history_table(live_table_schema text,
                                                    live_table_name regclass,
                                                    create_triggers boolean DEFAULT true,
                                                    copy_inheritance boolean DEFAULT true)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    << outerblock >>
    DECLARE

        -- This will contain the name of the newly created history table
        history_table_name text;

        -- This will contain the name of a parent history table, if any
        parent_history_table_name text;

        -- A list of columns in the original table
        column_info record;

        -- A list of columns in a potential parent table
        parent_info record;

    BEGIN

        -- History tables will be named like the live table plus a '_history' suffix
        history_table_name = history_table_name(live_table_name);

        -- If there is already a history table registered with this name, continue
        IF EXISTS(SELECT 1 FROM catmaid_history_table cht
                  WHERE cht.history_table_name = outerblock.history_table_name) THEN
            RAISE NOTICE 'History table ''%'' already exists', history_table_name;
            RETURN;
        END IF;

        -- Set parent information to nothing by default
        SELECT NULL INTO parent_info;

        -- Create new history table with the same columns as the original,
        -- but without indices or constraints. Its name is created by
        -- appending "_history" to the input table name. The original table
        -- is not changed, but the history table will have a new column:
        -- sys_period, representing the valid range of a row.
        IF copy_inheritance THEN
            -- If the table inherits from another table and <copy_inheritance> is
            -- true, the complete inheritance hierarchy will be recreated for the
            -- new table. Triggers, however, are only applied to the passed in live
            -- table. Recursively walk parents to guarantee path to root.
            RAISE NOTICE 'START INHERITANCE for %', live_table_name;
            BEGIN
                SELECT parent_schemaname, parent_tablename, parent_oid INTO STRICT parent_info
                FROM catmaid_inheritening_tables
                WHERE child_oid = live_table_name
                AND child_schemaname = live_table_schema::text;
                EXCEPTION
                    WHEN NO_DATA_FOUND THEN
                        -- Do nothing
                    WHEN TOO_MANY_ROWS THEN
                        -- Multi-inheritance support isn't implemented for histoty tables, yet
                        RAISE EXCEPTION 'Couldn''t create history table, found more than one parent of %s.%s', live_table_schema, live_table_name;
            END;

            IF FOUND THEN
                RAISE NOTICE 'Parent: %, %, %', parent_info.parent_schemaname, parent_info.parent_tablename, parent_info.parent_oid;
                -- Recursively create a history table for the parent, without adding triggers
                PERFORM create_history_table(parent_info.parent_schemaname, parent_info.parent_oid, TRUE, TRUE);
            END IF;
            RAISE NOTICE 'END INHERITANCE';
        END IF;

        IF parent_info IS NOT NULL THEN
            parent_history_table_name = history_table_name(parent_info.parent_oid);
            RAISE NOTICE 'CREATE History table with INHERITANCE %', parent_history_table_name;
            -- Parent rows are sorted by their depth, most distant first.
            -- If this parent table doesn't have a history table, yet, it is created.
            -- Create a regular history table without inheritance, either
            -- because no parent is available or no parent check was performed.
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I (LIKE %s) INHERITS (%I)',
                history_table_name,live_table_name, parent_history_table_name
            );
        ELSE
            -- Create a regular history table without inheritance, either
            -- because no parent is available or no parent check was performed.
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I (LIKE %s)',
                history_table_name,live_table_name
            );
        END IF;

        -- Make all history columns (except the later added sys_period column
        -- default to NULL
        FOR column_info IN
            SELECT c.column_name
            FROM information_schema.columns c
            WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog')
            AND c.table_name = live_table_name::text
            AND c.column_name <> 'sys_period'
        LOOP
            -- Drop NOT NULL constraints and add default
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL',
                history_table_name, column_info.column_name);
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT NULL',
                history_table_name, column_info.column_name);
        END LOOP;

        -- Add a system time column to the history table, named sys_period, if
        -- it doesn't exist already (which can happen due to table inheritence.
        IF NOT EXISTS(SELECT column_name
                      FROM information_schema.columns
                      WHERE table_schema = 'public'
                      AND table_name = history_table_name
                      AND column_name = 'sys_period') THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN sys_period tstzrange
                NOT NULL DEFAULT tstzrange(current_timestamp, null)',
                history_table_name
            );
        END IF;

        -- Add a transaction reference to the history table, named
        -- exec_transaction_id, if it doesn't exist already (which can
        -- happen due to table inheritence. Together with the lower part
        -- of the sys_period range, the transaction ID is uniqie.
        IF NOT EXISTS(SELECT column_name
                      FROM information_schema.columns
                      WHERE table_schema = 'public'
                      AND table_name = history_table_name
                      AND column_name = 'exec_transaction_id') THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN exec_transaction_id bigint
                NOT NULL DEFAULT txid_current()',
                history_table_name
            );
        END IF;

        -- Create sys_period (validity period) index for the new history
        -- table. This is needed to quickly query older versions of an
        -- entity.
        -- TODO: Maybe also needs an id index?
        IF (SELECT to_regclass((history_table_name || '_sys_period')::cstring)) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %I USING gist(sys_period)',
                history_table_name || '_sys_period', history_table_name);
        END IF;

        -- Set up data insert, update and delete trigger on original database
        IF create_triggers THEN
            EXECUTE format(
                'CREATE TRIGGER %I
                AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW
                EXECUTE PROCEDURE update_history_of_row(%s, %s, %s)',
                'on_change_' || live_table_name || '_update_history',
                live_table_name, 'sys_period', history_table_name, 'true');

            -- Keep track of created history tables
            INSERT INTO catmaid_history_table (history_table_name, live_table_name)
            VALUES (history_table_name, live_table_name);

            -- Monitor schema changes with DDL event triggers
            --
            -- * If the table is dropped, drop history table
            -- * If column type changes, rename column in history table:
            --   <column_name>_<date> and add new column with new data type
            -- * If column is renamed, rename column in history table accordingly
            --
            -- TODO: Find way to do schema changes without triggering these events
            -- (useful if one knows what one is doing, e.g. a data type change from
            -- float to double shouldn't necessarily create a new column)

            -- Create event trigger for alter table statements on the original
            -- table. The trigger function will inspect the changes and update
            -- the history table accordingly. That is, new columns are just
            -- added and removed columns are renamed. History columns always
            -- default to NULL.
            --   EXECUTE format(
            --       'CREATE EVENT TRIGGER on_%s_alter_table ON ddl_command_end
            --        WHEN TAG IN ('ALTER TABLE')
            --        EXECUTE PROCEDURE alter_history_table($1)',
            --   live_table_name)
            --   USING history_table_name;
        END IF;

    END;
    $$;

    -- Copy data from a live table into its history table.
    CREATE OR REPLACE FUNCTION populate_history_table(live_table_schema text,
        live_table_name regclass, history_table_name regclass, time_column text)
        RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        start_time timestamptz;
        end_time timestamptz;
        delta interval;
    BEGIN
        RAISE NOTICE 'Adding initial history information for table %', live_table_name;
        start_time = clock_timestamp();
        EXECUTE (
            SELECT format(
                'INSERT INTO %I (%s,%s,exec_transaction_id) SELECT %s, tstzrange(%s, null), %s FROM ONLY %s.%s lt',
                history_table_name,
                string_agg(quote_ident(c.column_name), ','),
                'sys_period',
                string_agg('lt.' || quote_ident(c.column_name), ','),
                CASE WHEN time_column IS NULL THEN 'current_timestamp' ELSE
                    'lt.' || time_column END,
                    txid_current(), live_table_schema, live_table_name::text)
            FROM information_schema.columns c, pg_class pc
            WHERE pc.oid = live_table_name
            AND c.table_name = pc.relname
            AND c.table_schema = live_table_schema);
        end_time = clock_timestamp();
        delta = 1000 * (extract(epoch from end_time) - extract(epoch from start_time));
        RAISE NOTICE 'Execution time: %ms', delta;
    END;
    $$;


    -- Remove an existing history table for the passed in table
    CREATE OR REPLACE FUNCTION drop_history_table(live_table_name regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- This will contain the name of the newly created history table. No
        -- regclass is used, because the implcit table existance check on variable
        -- assignment can fail if the table has already been removed by as
        -- cascaded table drop.
        history_table_name text;

    BEGIN

        -- History tables will be named like the live table plus a '_history' suffix
        history_table_name = history_table_name(live_table_name);

        -- Cascading deleting is used to delete parent tables and child tables in one go
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', history_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            'on_change_' || live_table_name || '_update_history', live_table_name);

        -- Remove from created table log
        DELETE FROM catmaid_history_table cht WHERE cht.live_table_name = $1;

    END;
    $$;


    -- Remove all history tables and triggers that were created, i.e. all
    -- tables referenced in the history_table table.
    CREATE OR REPLACE FUNCTION drop_all_history_tables()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- A record in the the history_table table
        row record;

    BEGIN

        -- Remove existing history tables and triggers
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM drop_history_table(row.live_table_name);
        END LOOP;

    END;
    $$;


    -- History tables: update entry, coming from either a table insert,
    -- update or delete statement. For inserts, this will add the row to
    -- the history table and set its sys_period interval to [now, null).
    -- Updates will cause the currently valid history row with the same ID
    -- to be updated with a sys_period of [current_val, now] and add a new
    -- row. The following arguments are passed to this trigger function and
    -- are part of the TG_ARGV variable:
    -- sys_period_column, history_table_name regclass,live_table_name,adjust
    CREATE OR REPLACE FUNCTION update_history_of_row()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN
        IF TG_NARGS <> 3 THEN
            RAISE EXCEPTION 'History could not be updated, expected three arguments in trigger';
        END IF;

        IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN

            -- Set existing history row's sys_period to [old_value, now)
            -- if their current sys_period contains the current_timestamp.
            -- TODO: Should this be more fault tolerant and ignore deletes of
            -- non existing rows?
            EXECUTE format(
                'UPDATE %I
                 SET %s = tstzrange(lower(sys_period), current_timestamp),
                     %s = txid_current()
                 WHERE id=%s
                 AND %2$s @> current_timestamp', -- @> is contains operator
                TG_ARGV[1], TG_ARGV[0], 'exec_transaction_id', OLD.id);
        END IF;

        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN

            -- Insert new data into history table, based on the currently
            -- available columns in the updated table.
            EXECUTE (
                SELECT format(
                    'INSERT INTO %I (%s,%s,%s) SELECT %s, tstzrange(current_timestamp, null), txid_current()',
                    TG_ARGV[1], string_agg(quote_ident(column_name), ','), TG_ARGV[0], 'exec_transaction_id',
                    string_agg('$1.' || quote_ident(column_name), ','))
                FROM   information_schema.columns
                WHERE  table_name   = TG_TABLE_NAME    -- table name, case sensitive
                AND    table_schema = TG_TABLE_SCHEMA  -- schema name, case sensitive
            ) USING NEW;

        END IF;

        -- No return value is expected if run
        RETURN NULL;
    END;
    $$;
"""

remove_history_functions_sql = """
    -- Remove history functions
    DROP TABLE catmaid_history_table;
    DROP TABLE catmaid_transaction_info;
    DROP VIEW catmaid_inheritening_tables;
    DROP TYPE IF EXISTS history_change_type;
    DROP FUNCTION IF EXISTS create_history_table(live_table_schema text, live_table_name regclass, create_triggers boolean, copy_inheritance boolean);
    DROP FUNCTION IF EXISTS drop_history_table(live_table_name regclass);
    DROP FUNCTION IF EXISTS update_history_of_row();
    DROP FUNCTION IF EXISTS history_table_name(regclass);
    DROP FUNCTION IF EXISTS populate_history_table(text, regclass, regclass, text);
"""

add_initial_history_tables_sql = """
    -- The list of CATMAID tables for which a history table is initially
    -- created. These are all except log and treenode_edge
    CREATE TEMPORARY TABLE temp_versioned_catmaid_table (
        name regclass,
        time_column text
    ) ON COMMIT DROP;
    INSERT INTO temp_versioned_catmaid_table (VALUES
        ('broken_slice', NULL),
        ('cardinality_restriction', 'creation_time'),
        ('catmaid_userprofile', NULL),
        ('catmaid_volume', 'creation_time'),
        ('change_request', 'creation_time'),
        ('class', 'creation_time'),
        ('class_class', 'creation_time'),
        ('class_instance', 'creation_time'),
        ('class_instance_class_instance', 'creation_time'),
        ('client_data', NULL),
        ('client_datastore', NULL),
        ('concept', 'creation_time'),
        ('connector', 'creation_time'),
        ('connector_class_instance', 'creation_time'),
        ('data_view', NULL),
        ('data_view_type', NULL),
        ('location', 'creation_time'),
        ('message', 'time'),
        ('overlay', NULL),
        ('project', NULL),
        ('project_stack', NULL),
        ('region_of_interest', 'creation_time'),
        ('region_of_interest_class_instance', 'creation_time'),
        ('relation', 'creation_time'),
        ('relation_instance', 'creation_time'),
        ('restriction', 'creation_time'),
        ('review', 'review_time'),
        ('reviewer_whitelist', NULL),
        ('stack', NULL),
        ('stack_class_instance', 'creation_time'),
        ('suppressed_virtual_treenode', 'creation_time'),
        ('textlabel', 'creation_time'),
        ('textlabel_location', NULL),
        ('treenode', 'creation_time'),
        ('treenode_class_instance', 'creation_time'),
        ('treenode_connector', 'creation_time')
    );

    -- The list of non-CATMAID tables for which a history table is initially
    -- created. These are all tables except celery, kombu and session tables.
    CREATE TEMPORARY TABLE temp_versioned_non_catmaid_table (
        name regclass
    ) ON COMMIT DROP;
    INSERT INTO temp_versioned_non_catmaid_table (VALUES
        ('auth_group'),
        ('auth_group_permissions'),
        ('auth_permission'),
        ('auth_user'),
        ('auth_user_groups'),
        ('auth_user_user_permissions'),
        ('authtoken_token'),
        ('django_admin_log'),
        ('django_content_type'),
        ('django_migrations'),
        ('django_site'),
        ('guardian_groupobjectpermission'),
        ('guardian_userobjectpermission'),
        ('performancetests_event'),
        ('performancetests_testresult'),
        ('performancetests_testview'),
        ('taggit_tag'),
        ('taggit_taggeditem')
    );

    -- Create a history table for all tables
    SELECT create_history_table('public', t.name) FROM temp_versioned_catmaid_table t;
    SELECT create_history_table('public', t.name) FROM temp_versioned_non_catmaid_table t;

    -- Populate history tables with current live table data. If a tavle is part
    -- of an inheritence chain, only the current table is scanned and not its
    -- descendants. This is done to avoid duplicates.
    SELECT populate_history_table('public', tt.name,
        ht.history_table_name::regclass, tt.time_column)
    FROM temp_versioned_catmaid_table tt, catmaid_history_table ht
    WHERE ht.live_table_name = tt.name AND tt.time_column IS NOT NULL;

    SELECT populate_history_table('public', tt.name,
        ht.history_table_name::regclass, NULL)
    FROM temp_versioned_catmaid_table tt, catmaid_history_table ht
    WHERE ht.live_table_name = tt.name AND tt.time_column IS NULL;

    SELECT populate_history_table('public', tt.name,
        ht.history_table_name::regclass, NULL)
    FROM temp_versioned_non_catmaid_table tt, catmaid_history_table ht
    WHERE ht.live_table_name = tt.name;

    -- Add transaction information for initial data migration. During first
    -- database setup, there is no system user set up. This is why we don't
    -- reference the system user here, but only use NULL.
    INSERT INTO catmaid_transaction_info (transaction_id, execution_time, user_id, change_type, label)
    VALUES (txid_current(), current_timestamp, NULL, 'Migration', 'Initial history population');
"""

remove_history_tables_sql = """
    -- Remove existing history tables and triggers
    SELECT drop_all_history_tables();
"""

class Migration(migrations.Migration):

    # These dependencies are needed to initialize history tables for other
    # applications, too.
    dependencies = [
        ('auth', '0006_require_contenttypes_0002'),
        ('authtoken', '0001_initial'),
        ('catmaid', '0005_add_missing_primary_keys'),
        ('guardian', '0001_initial'),
        ('performancetests', '0001_initial'),
        ('sites', '0001_initial'),
        ('taggit', '0002_auto_20150616_2121')
    ]

    operations = [
        migrations.RunSQL(add_history_functions_sql, remove_history_functions_sql),
        migrations.RunSQL(add_initial_history_tables_sql, remove_history_tables_sql),
    ]
