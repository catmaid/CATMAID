# -*- coding: utf-8 -*-

from django.db import migrations
from django.conf import settings


# This migration will remove all existing history tables and replace them with
# a new version, which also keeps track of transaction IDs. This happens either
# in live tables directly or as part of tracking table (formally time tables).
# To make this change easier to read, all history functions are created from
# scratch in this file. Note that while rolling back this migration brings back
# the previous version of history tracking, previous history entries won't be
# restored!


# Indicate whether history tables are enabled for this migration. If they are
# not, only history tables will be created, but no triggers are installed and no
# initial population of history tables will happen.
history_tracking_enabled = getattr(settings, 'HISTORY_TRACKING', True)


# This essentially rolls back migration 0006_add_history_table_support
forward_remove_existing_history = """
    -- Remove all history tables, time tables and triggers
    SELECT drop_all_history_tables();

    -- Remove history functions
    DROP VIEW IF EXISTS catmaid_live_table_triggers;
    DROP VIEW IF EXISTS catmaid_inheriting_tables;
    DROP TABLE IF EXISTS catmaid_history_table;
    DROP TABLE IF EXISTS catmaid_transaction_info;
    DROP TYPE IF EXISTS history_change_type;
    DROP FUNCTION IF EXISTS create_history_table(regclass,
        text, boolean, boolean, boolean);
    DROP FUNCTION IF EXISTS drop_history_table(regclass);
    DROP FUNCTION IF EXISTS update_history_of_row_timetable();
    DROP FUNCTION IF EXISTS history_table_name(regclass);
    DROP FUNCTION IF EXISTS sync_time_table(regclass, regclass);
    DROP FUNCTION IF EXISTS truncate_time_table() CASCADE;
    DROP FUNCTION IF EXISTS handle_live_table_truncate() CASCADE;
    DROP FUNCTION IF EXISTS enable_history_tracking_for_table(regclass, text, boolean);
    DROP FUNCTION IF EXISTS disable_history_tracking_for_table(regclass, text);
    DROP FUNCTION IF EXISTS enable_history_tracking();
    DROP FUNCTION IF EXISTS disable_history_tracking();
    DROP FUNCTION IF EXISTS get_history_update_fn_name_regular(regclass);
    DROP FUNCTION IF EXISTS get_history_update_trigger_name_regular(regclass);
    DROP FUNCTION IF EXISTS get_history_update_trigger_name_timetable(regclass);
    DROP FUNCTION IF EXISTS get_history_truncate_trigger_name();
    DROP FUNCTION IF EXISTS get_time_table_name(regclass);
    DROP FUNCTION IF EXISTS get_time_table_update_trigger_name(regclass);
    DROP FUNCTION IF EXISTS get_time_table_truncate_trigger_name(regclass);
    DROP FUNCTION IF EXISTS update_time_for_row();
    DROP VIEW IF EXISTS catmaid_table_info;
"""


forward_history_update = """

    -- Create a table to keep track of created history tables, when they were
    -- created, whether triggers were installed on the live table, what the name
    -- of the live table's primary key is and if the live table has particular
    -- column representing time and a transaction ID. Or, alternatively, if this
    -- the time and txid columns are used with a particular 1:1 tracking table.
    -- Having an extra table is needed for non-CATMAID tables that don't already
    -- keep track of edition time and transactions. The time information itself is
    -- used to synchronize tables if history tracking is enabled after it was
    -- disabled and to discover changed rows based on the transaction log. This
    -- table is also used for rolling back this migration and more robust access to
    -- individual history tables based on a live table name.
    CREATE TABLE catmaid_history_table (
        live_table              regclass PRIMARY KEY,
        history_table           regclass NOT NULL,
        triggers_installed      boolean NOT NULL,
        live_table_pkey_column  text NOT NULL,
        tracking_table          regclass,
        time_column             text NOT NULL,
        txid_column             text NOT NULL,
        creation_time           timestamptz NOT NULL DEFAULT current_timestamp,
        CONSTRAINT history_table_unique UNIQUE (history_table)
    );


    -- This enum type represents different types of history changes that are
    -- recorded in CATMAID's transaction information table.
    CREATE TYPE history_change_type AS ENUM ('Backend', 'Migration', 'External');


    -- The combination of transaction ID and execution time is unique and
    -- represents one semantic front-end action, initiated by a particular
    -- user. The unique constraint isn't added explicitly to avoid performance
    -- costs during insertion.
    CREATE TABLE catmaid_transaction_info (
        transaction_id      bigint DEFAULT txid_current(),
        execution_time      timestamp with time zone NOT NULL DEFAULT current_timestamp,
        user_id             integer,
        project_id          integer,
        change_type         history_change_type NOT NULL,
        label text          NOT NULL,
        CONSTRAINT catmaid_transaction_info_pk PRIMARY KEY (transaction_id, execution_time)
    );


    -- Return the unquoted name of a live table's history table regular update trigger.
    CREATE OR REPLACE FUNCTION get_history_update_fn_name_regular(live_table regclass)
        RETURNS text AS
    $$
        SELECT 'update_history_' || relname || '_reg' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history table regular update trigger.
    CREATE OR REPLACE FUNCTION get_history_update_trigger_name_regular()
        RETURNS text AS
    $$
        SELECT 'on_change_update_history_regular'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history table tracking-table update trigger.
    CREATE OR REPLACE FUNCTION get_history_update_trigger_name_tracking()
        RETURNS text AS
    $$
        SELECT 'on_change_history_trackingtable'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a table tracking history for the live table.
    -- Doesn't check if the table actually exists.
    CREATE OR REPLACE FUNCTION get_history_table_name(live_table regclass)
        RETURNS text AS
    $$
        SELECT relname || '__history' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history table truncate trigger.
    CREATE OR REPLACE FUNCTION get_history_truncate_trigger_name()
        RETURNS text AS
    $$
        SELECT 'on_truncate_handle_live_table_truncate'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a table tracking time and transaction IDs
    -- for the live table.  Doesn't check if the table actually exists.
    CREATE OR REPLACE FUNCTION get_tracking_table_name(live_table regclass)
        RETURNS text AS
    $$
        SELECT relname || '__tracking' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's traclomg table update trigger.
    CREATE OR REPLACE FUNCTION get_tracking_table_update_trigger_name()
        RETURNS text AS
    $$
        SELECT 'on_change_update_tracking_table'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's tracking table truncate trigger.
    CREATE OR REPLACE FUNCTION get_tracking_table_truncate_trigger_name()
        RETURNS text AS
    $$
        SELECT 'on_truncate_truncate_tracking_table'::text;
    $$ LANGUAGE sql STABLE;


    -- A view that tells if the known history tables have update trigger installed.
    CREATE OR REPLACE VIEW catmaid_live_table_triggers AS
        SELECT cht.live_table,
            ((
                cht.tracking_table IS NULL
                AND EXISTS (
                SELECT 1 FROM information_schema.triggers ist, pg_class pc
                WHERE pc.oid = cht.live_table
                AND ist.event_object_table = pc.relname
                AND ist.trigger_name =
                    get_history_update_trigger_name_regular())
            ) OR (
                cht.tracking_table IS NOT NULL
                AND (
                EXISTS (
                    SELECT 1 FROM information_schema.triggers ist, pg_class pc
                    WHERE pc.oid = cht.live_table
                    AND ist.event_object_table = pc.relname
                    AND ist.trigger_name =
                        get_history_update_trigger_name_tracking()
                ) AND EXISTS (
                    SELECT 1 FROM information_schema.triggers ist, pg_class pc
                    WHERE pc.oid = cht.live_table
                    AND ist.event_object_table = pc.relname
                    AND ist.trigger_name =
                        get_tracking_table_update_trigger_name()
                ))
            )) AS triggers_installed
        FROM catmaid_history_table cht;


    -- A view that makes access to inheritance information more convenient.
    CREATE VIEW catmaid_inheriting_tables
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


    -- A view to simplify schema and column lookup for regclass objects
    CREATE OR REPLACE VIEW catmaid_table_info
    AS
        SELECT pc.oid AS rel_oid, pc.relname AS rel_name,
            pn.nspname AS rel_schema, c.column_name AS column_name
        FROM information_schema.columns c, pg_class pc, pg_namespace pn
        WHERE c.table_name = pc.relname
        AND pn.oid = pc.relnamespace
        AND c.table_schema = pn.nspname;


    -- Create a history table and triggers to populate it for the passed in table.
    -- Always use this function to create history tables to ensure everything is
    -- set up correctly. An optional time column and transaction ID column can be
    -- specified, which, if provided, will be used to obtain time information for a
    -- live row and its transaction ID. If no time column is passed in, an extra
    -- 1:1 table that tracks edition time and transactions of live table rows is
    -- created and used as a time and transaction source for individual live rows
    -- when needed.  Currently, only live tables with a single column primary key
    -- are supported.  If the passed in table inherits from another table and
    -- <copy_inheritance> is true (default), the history table will have the
    -- same inheritance hierarchy as the live table. All parent history tables
    -- are initialized as regular history tables, too. The optional
    -- <time_column> and <txid_column> either have both
    -- to be present or both NULL. If <sync> is true, the created history table
    -- (and potentially tracking table) is synchronized automatically, after it
    -- is created.
    CREATE OR REPLACE FUNCTION create_history_table(live_table regclass,
                                                    time_column text DEFAULT NULL,
                                                    txid_column text DEFAULT NULL,
                                                    create_triggers boolean DEFAULT true,
                                                    copy_inheritance boolean DEFAULT true,
                                                    sync boolean DEFAULT true)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- This will contain the name of the newly created history table
        history_table_name text;

        -- This will contain a reference to the newly created history table
        history_table_oid regclass;

        -- If a time table is created, this contains the name of it
        tracking_table_name text;

        -- If a time table is created, this holds a reference to it.
        tracking_table_oid regclass;

        -- This will contain the name of a parent history table, if any
        parent_history_table_name text;

        -- A list of columns in the original table
        column_info record;

        -- A list of columns in a potential parent table
        parent_info record;

        -- The primary key of the live table
        live_table_pkey_column  text;
        live_table_pkey_type    text;
        live_table_n_pkeys      int;

    BEGIN

        -- History tables will be named like the live table plus a '_history' suffix
        history_table_name = get_history_table_name(live_table);

        -- Make sure the history table name is not longer than 63 characters, a
        -- limit that Postgres defaults to and which causes identifier names to
        -- become shortened silently.
        IF (LENGTH(get_history_update_fn_name_regular(live_table)) > 63) THEN
            RAISE EXCEPTION 'Can''t create history table with name longer than '
                '63 characters: %', history_table_name;
        END IF;

        -- Don't do anything if there is already a history table registered with this name.
        IF EXISTS(SELECT 1 FROM catmaid_history_table cht
            WHERE cht.history_table::text = history_table_name)
        THEN
            RAISE NOTICE 'History table ''%'' already exists', history_table_name;
            RETURN;
        END IF;

        -- Find primary key and type of table
        SELECT a.attname, format_type(a.atttypid, a.atttypmod)
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = live_table
        AND    i.indisprimary
        INTO live_table_pkey_column, live_table_pkey_type;

        GET DIAGNOSTICS live_table_n_pkeys = ROW_COUNT;


        -- Make sure there is a single-column primary key available on the live table.
        IF live_table_n_pkeys = 0 THEN
            RAISE EXCEPTION 'Need primary key on table to create history '
                'table for "%"', live_table;
        ELSIF live_table_n_pkeys > 1 THEN
            RAISE EXCEPTION 'Currently only single column primary keys are'
            'supported, the primary key of table "%" consists of % columns: %',
                live_table, live_table_n_pkeys, live_table_pkey_column;
        END IF;

        -- If a time column was provided, make sure there also a transaction
        -- column provided. And then make sure both exist.
        IF (time_column IS NULL AND txid_column IS NOT NULL) OR
           (time_column IS NOT NULL AND txid_column IS NULL)
        THEN
            RAISE EXCEPTION 'Either provide both time column name and '
                'transaction column name or none for table %', live_table;
        ELSIF (time_column IS NOT NULL AND txid_column IS NOT NULL)
        THEN
            IF NOT EXISTS(SELECT 1 FROM catmaid_table_info
                WHERE rel_oid = live_table AND column_name <> time_column)
            THEN
                RAISE EXCEPTION 'The time column % doesn''t exist in table %',
                    time_column, live_table;
            END IF;
            IF NOT EXISTS(SELECT 1 FROM catmaid_table_info
                WHERE rel_oid = live_table AND column_name <> txid_column)
            THEN
                RAISE EXCEPTION 'The transaction column % doesn''t exist in table %',
                    txid_column, live_table;
            END IF;
        END IF;

        -- Set parent information to nothing by default
        SELECT NULL INTO parent_info;

        -- Create new history table with the same columns as the original,
        -- but without indices or constraints. Parent tables are required to
        -- have regular history tables as well.
        IF copy_inheritance THEN
            -- If the table inherits from another table and <copy_inheritance> is
            -- true, the complete inheritance hierarchy will be recreated for the
            -- new table. Currently, only single table inheritance is supported.
            RAISE NOTICE 'START INHERITANCE for %', live_table;
            BEGIN
                SELECT parent_schemaname, parent_tablename, parent_oid INTO STRICT parent_info
                FROM catmaid_inheriting_tables
                WHERE child_oid = live_table;
                EXCEPTION
                    WHEN NO_DATA_FOUND THEN
                        -- Do nothing
                    WHEN TOO_MANY_ROWS THEN
                        -- Multi-inheritance support isn't implemented for history tables, yet
                        RAISE EXCEPTION 'Couldn''t create history table, found '
                                'more than one parent of "%s"', live_table;
            END;

            IF FOUND THEN
                RAISE NOTICE 'Setting up history tracking for parent: %, %, %',
                    parent_info.parent_schemaname, parent_info.parent_tablename,
                    parent_info.parent_oid;
                -- Recursively create a history table for the parent
                PERFORM create_history_table(parent_info.parent_oid, time_column,
                    txid_column, create_triggers, copy_inheritance, sync);
            END IF;
            RAISE NOTICE 'END INHERITANCE';
        END IF;

        IF parent_info IS NOT NULL THEN
            parent_history_table_name = get_history_table_name(parent_info.parent_oid);
            RAISE NOTICE 'CREATE History table with INHERITANCE %', parent_history_table_name;
            -- Create a history table that inherits from the previously created
            -- parent history table.
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I (LIKE %s) INHERITS (%I)',
                history_table_name, live_table, parent_history_table_name
            );
        ELSE
            -- Create a regular history table without inheritance, either
            -- because no parent is available or no parent check was performed.
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I (LIKE %s)',
                history_table_name, live_table
            );
        END IF;

        -- Get the OID of the new history table
        history_table_oid = to_regclass(history_table_name);

        -- Make all history columns (except the later added sys_period and
        -- transaction info columns) default to NULL.
        FOR column_info IN
            SELECT column_name
            FROM catmaid_table_info
            WHERE rel_oid = live_table
            AND column_name <> 'sys_period'
        LOOP
            -- Drop NOT NULL constraints and add default
            EXECUTE format(
                'ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL',
                history_table_oid, column_info.column_name);
            EXECUTE format(
                'ALTER TABLE %s ALTER COLUMN %I SET DEFAULT NULL',
                history_table_oid, column_info.column_name);
        END LOOP;

        -- Add a system time column to the history table, named sys_period, if
        -- it doesn't exist already (which can happen due to table inheritance).
        IF NOT EXISTS(SELECT column_name
                      FROM catmaid_table_info
                      WHERE rel_oid = history_table_oid
                      AND column_name = 'sys_period') THEN
            EXECUTE format(
                'ALTER TABLE %s ADD COLUMN sys_period tstzrange
                NOT NULL DEFAULT tstzrange(current_timestamp, null)',
                history_table_oid
            );
        END IF;

        -- Add a transaction reference to the history table, named
        -- exec_transaction_id, if it doesn't exist already (which can
        -- happen due to table inheritance. Together with the lower part
        -- of the sys_period range, the transaction ID is unique.
        IF NOT EXISTS(SELECT column_name
                      FROM catmaid_table_info
                      WHERE rel_oid = history_table_oid
                      AND column_name = 'exec_transaction_id') THEN
            EXECUTE format(
                'ALTER TABLE %s ADD COLUMN exec_transaction_id bigint
                NOT NULL DEFAULT txid_current()',
                history_table_oid
            );
        END IF;

        -- Create live table primary key index for the new history table. This
        -- is needed to quickly query older versions of an entity.
        IF (SELECT to_regclass(history_table_name || '_live_pk_index')) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %s (%I)',
                history_table_name || '_live_pk_index', history_table_oid, live_table_pkey_column);
        END IF;

        -- Create sys_period (validity period) index for the new history
        -- table. This is needed to quickly query older state snapshots.
        IF (SELECT to_regclass(history_table_name || '_sys_period')) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %s USING gist(sys_period)',
                history_table_name || '_sys_period', history_table_oid);
        END IF;

        -- Create index for transaction information, which is also needed to
        -- quickly find events that are part of the same transaction.
        IF (SELECT to_regclass(history_table_name || '_exec_transaction_id')) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %s (exec_transaction_id)',
                history_table_name || '_exec_transaction_id', history_table_oid);
        END IF;


        -- Create a tracking table if no time column was provided. It will
        -- store the last edition time for each entry. Update triggers are
        -- created as part of the trigger enabling.
        IF time_column IS NULL THEN

            -- A foreign key reference to live table's PK isn't used, because
            -- it make is much easier to deal with TRUNCATE queries on the live
            -- table.
            tracking_table_name = get_tracking_table_name(live_table);
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %s ('
                '  live_pk %s UNIQUE DEFERRABLE INITIALLY DEFERRED,'
                '  edition_time timestamptz NOT NULL,'
                '  txid bigint NOT NULL'
                ')',
                tracking_table_name, live_table_pkey_type);

            -- Get the OID of the new history table
            tracking_table_oid = to_regclass(tracking_table_name);

            -- Create ID index for quick look-ups when updating the tracking table
            IF (SELECT to_regclass(tracking_table_name || '_live_pk_index')) IS NULL THEN
                EXECUTE format(
                    'CREATE INDEX %I ON %s (%s)',
                    tracking_table_name || '_live_pk_index', tracking_table_oid, 'live_pk');
            END IF;

        ELSE
            SELECT NULL into tracking_table_oid;
        END IF;


        -- Keep track of created history tables
        INSERT INTO catmaid_history_table (history_table, live_table,
            triggers_installed, time_column, txid_column,
            live_table_pkey_column, tracking_table)
        VALUES (history_table_oid, live_table, false,
            COALESCE(time_column, 'edition_time'),
            COALESCE(txid_column, 'txid'),
            live_table_pkey_column, tracking_table_oid);

        -- Set up data insert, update and delete trigger on original database
        IF create_triggers THEN
            -- Handle sync separately, makes it easier to disable
            PERFORM enable_history_tracking_for_table(live_table,
                history_table_name, false);
        END IF;


        IF sync AND time_column IS NULL THEN
            RAISE NOTICE 'Syncing time for table "%" in tracking table "%"',
                live_table, tracking_table_oid;
            PERFORM sync_tracking_table(live_table, tracking_table_oid);
        END IF;
    END;
    $$;


    -- Synchronize a tracking table by inserting entries into it that are currently
    -- only present in the live table. Removing all entries not available in
    -- the live table is not necessary, because of the tracking table's foreign key
    -- constraint.
    CREATE OR REPLACE FUNCTION sync_tracking_table(live_table regclass,
            tracking_table regclass)
        RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        start_time  timestamptz;
        end_time    timestamptz;
        delta       interval;
        pkey_column text;
    BEGIN
        RAISE NOTICE 'Obtaining exclusive locks on tables % and %',
            live_table, tracking_table;
        EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', live_table);
        EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', tracking_table);

        start_time = clock_timestamp();

        EXECUTE (
            SELECT format(
                'INSERT INTO %1$s (live_pk, edition_time, txid) '
                'SELECT %3$s, current_timestamp, txid_current() '
                'FROM ONLY %2$s lt '
                'LEFT JOIN %1$s tt ON lt.%3$s = tt.live_pk '
                'WHERE tt.live_pk IS NULL',
                $2, cht.live_table, cht.live_table_pkey_column)
            FROM catmaid_history_table cht
            WHERE cht.live_table = $1
            AND cht.tracking_table = $2);

        end_time = clock_timestamp();
        delta = 1000 * (extract(epoch from end_time) - extract(epoch from start_time));
        RAISE NOTICE 'Execution time: %ms', delta;
    END;
    $$;


    -- Remove an existing history table for the passed in table
    CREATE OR REPLACE FUNCTION drop_history_table(live_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- This will contain the name of the newly created history table. No
        -- regclass is used, because the implicit table existence check on variable
        -- assignment can fail if the table has already been removed by an
        -- cascaded table drop.
        history_table_name text;

    BEGIN

        -- History tables will be named like the live table plus a '__history' suffix
        history_table_name = get_history_table_name(live_table);

        -- Cascading deleting is used to also delete child tables and triggers.
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', history_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_update_trigger_name(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_truncate_trigger_name(), live_table);
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE',
            get_tracking_table_name(live_table));

        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_regular(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_tracking(), live_table);
        EXECUTE format('DROP FUNCTION IF EXISTS %s() CASCADE',
            get_history_update_fn_name_regular(live_table));
        EXECUTE format('DROP FUNCTION IF EXISTS %s() CASCADE',
            get_history_truncate_trigger_name());

        -- Remove from created table log
        DELETE FROM catmaid_history_table cht WHERE cht.live_table = $1;
    END;
    $$;


    -- Remove all history tables and triggers that were created, i.e. all
    -- tables referenced in the history_table table.
    CREATE OR REPLACE FUNCTION drop_all_history_tables()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- A record in the history_table table
        row record;

    BEGIN

        -- Remove existing history tables and triggers
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM drop_history_table(row.live_table);
        END LOOP;

    END;
    $$;


    -- Create the trigger code for history updates. This is done in a separate
    -- function to make it easier to change in the future and allow for easier testing.
    CREATE OR REPLACE FUNCTION create_history_update_trigger_code(history_update_fn_name text,
            history_info catmaid_history_table)
    RETURNS TABLE (trigger_code text)
    LANGUAGE plpgsql AS
    $$
    BEGIN
        RETURN QUERY
        SELECT format(
            'CREATE OR REPLACE FUNCTION %1$s()
            RETURNS TRIGGER
            LANGUAGE plpgsql AS
            $FN$
            BEGIN

                -- Insert new historic data into history table, based on the
                -- currently available columns in the updated table.
                INSERT INTO %2$I (%3$s,%4$s,%5$s)
                SELECT %6$s, tstzrange(LEAST(OLD.%7$s, current_timestamp), current_timestamp),
                txid_current();

                -- A non-null NEW has to be returned to execute the actual query (because
                -- this is to be used as a BEFORE trigger).
                IF TG_OP=''DELETE'' THEN
                    RETURN OLD;
                ELSE
                    -- Update current row
                    NEW.%8$s = txid_current();
                    RETURN NEW;
                END IF;
            END;
            $FN$',
            history_update_fn_name,
            history_info.history_table,
            string_agg(quote_ident(cti.column_name), ','),
            'sys_period',
            'exec_transaction_id',
            string_agg('OLD.' || quote_ident(cti.column_name), ','),
            history_info.time_column,
            history_info.txid_column)
        FROM catmaid_table_info cti
        WHERE cti.rel_oid = history_info.live_table;
    END;
    $$;


    -- Enable history tracking for a particular live table and history table by
    -- making sure all triggers are connected to history events. In case
    -- triggers have to be created, the history table is synced by default,
    -- which can optionally be disabled.
    CREATE OR REPLACE FUNCTION enable_history_tracking_for_table(live_table regclass,
        history_table regclass, sync boolean DEFAULT true)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        history_update_fn_name text;
        history_trigger_name_regular text;
        history_trigger_name_tracking text;
        time_trigger_name name;
        history_info catmaid_history_table;
    BEGIN
        IF NOT EXISTS(
            SELECT 1 FROM catmaid_history_table cht
            WHERE cht.live_table =$1 AND triggers_installed = true)
        THEN
            SELECT * FROM catmaid_history_table cht
            WHERE cht.live_table = $1
            AND cht.history_table = $2
            INTO history_info;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Couldn''t find history table information for '
                    'table "%" and history table "%"! You need to create it first.',
                    live_table, history_table;
            END IF;

            IF history_info.tracking_table IS NULL THEN
                -- Install regular triggers if no tracking table is provided,
                -- expect time column to be available from live table.
                history_trigger_name_regular =
                    get_history_update_trigger_name_regular();

                history_update_fn_name =
                    get_history_update_fn_name_regular(live_table);

                -- History tables: update entry, coming from either a table update or
                -- delete statement. Both wil create a new history entry containing the old
                -- data along with the validity time range [old-time-column,
                -- current-timestamp). The time information is provided by the live table
                -- itself, it has to provide the time column.
                EXECUTE (
                    SELECT create_history_update_trigger_code(history_update_fn_name, history_info)
                );

                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'BEFORE UPDATE OR DELETE ON %2$s FOR EACH ROW '
                    'EXECUTE PROCEDURE %3$s()',
                    history_trigger_name_regular, history_info.live_table,
                    history_update_fn_name
                );
            ELSE
                -- Install tracking table based triggers if a tracking table
                -- is provided, expect time column to be available from it.
                time_trigger_name =
                    get_tracking_table_update_trigger_name();
                history_trigger_name_tracking =
                    get_history_update_trigger_name_tracking();

                IF sync THEN
                    RAISE NOTICE 'Syncing time records for table "%" into table "%"',
                        live_table, history_info.tracking_table;
                    PERFORM sync_tracking_table(live_table, history_info.tracking_table);
                END IF;

                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER INSERT OR UPDATE OR DELETE ON %2$s FOR EACH ROW '
                    'EXECUTE PROCEDURE update_time_for_row(%3$s, %4$s)',
                    time_trigger_name, live_table, history_info.tracking_table,
                    history_info.live_table_pkey_column);

                -- In case the original is truncated, truncate time table too.
                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER TRUNCATE ON %2$s FOR EACH STATEMENT '
                    'EXECUTE PROCEDURE truncate_tracking_table(%s)',
                    get_tracking_table_truncate_trigger_name(),
                    live_table, history_info.tracking_table);

                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER UPDATE OR DELETE ON %2$s FOR EACH ROW '
                    'EXECUTE PROCEDURE update_history_of_row_tracking( '
                        '%3$s, %4$s, %5$s, %6$s, %7$s, %8$s)',
                    history_trigger_name_tracking, history_info.live_table, 'sys_period',
                    history_info.history_table, history_info.live_table_pkey_column,
                    history_info.tracking_table, 'edition_time', 'txid');
            END IF;

            -- In case the original is truncated, invalidate all live entries.
            -- This has to happen *before* the actual truncation of the live
            -- table, because the live data is needed for the history table.
            EXECUTE format(
                'CREATE TRIGGER %1$I '
                'BEFORE TRUNCATE ON %2$s FOR EACH STATEMENT '
                'EXECUTE PROCEDURE handle_live_table_truncate(%s)',
                get_history_truncate_trigger_name(),
                live_table, history_info.history_table);

            -- Remember that triggers are now installed for this table
            UPDATE catmaid_history_table cht SET triggers_installed = true
            WHERE cht.live_table = $1 AND cht.history_table = $2;
        END IF;
    END;
    $$;


    -- Disable history tracking by ensuring all triggers for history events on
    -- the passed in live table are dropped.
    CREATE OR REPLACE FUNCTION
    disable_history_tracking_for_table(live_table regclass, history_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_update_trigger_name(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_truncate_trigger_name(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_regular(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_tracking(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_truncate_trigger_name(), live_table);
        -- Remember that triggers are now removed for this table
        UPDATE catmaid_history_table cht SET triggers_installed = false
        WHERE cht.live_table = $1 AND cht.history_table = $2;
    END;
    $$;


    -- Enable history tracking by making sure all triggers for all monitored
    -- lived tables are created.
    CREATE OR REPLACE FUNCTION enable_history_tracking()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        -- A record in the catmaid_history_table table
        row record;
    BEGIN
        -- Iterate over all known history tables
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM enable_history_tracking_for_table(row.live_table,
                row.history_table);
        END LOOP;
    END;
    $$;


    -- Disable history tracking by making sure all history table triggers of
    -- all monitored live tables are dropped.
    CREATE OR REPLACE FUNCTION disable_history_tracking()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        -- A record in the catmaid_history_table table
        row record;
    BEGIN
        -- Iterate over all known history tables
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM disable_history_tracking_for_table(row.live_table,
                row.history_table);
        END LOOP;
    END;
    $$;


    -- History tables: update entry, coming from either a table update or
    -- delete statement. Both wil create a new history entry containing the old
    -- data along with the validity time range [old-time-column,
    -- current-timestamp). A time table passed in as argument is used to
    -- retrieve time information, it has to provide the passed in time column.
    -- The following arguments are passed to this trigger function and are part
    -- of the TG_ARGV variable:
    -- 0: sys_period_column, 1: history_table_name, 2: live_table_pkey_column,
    -- 3: tracking_table_name, 4: time_column, 5: txid_column
    CREATE OR REPLACE FUNCTION update_history_of_row_tracking()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Insert new historic data into history table, based on the
        -- currently available columns in the updated table. If no
        -- tracking table is given, retrieve time from table.
        EXECUTE (
            SELECT format(
                'INSERT INTO %1$I AS ht (%2$s,%3$s,%4$s) '
                'SELECT %5s, tstzrange(LEAST(tt.%8$s, current_timestamp), current_timestamp), '
                    'tt.%9$s '
                'FROM %6$I tt WHERE tt.live_pk = $1.%7$s',
                TG_ARGV[1],
                string_agg(quote_ident(column_name), ','),
                TG_ARGV[0],
                'exec_transaction_id',
                string_agg('$1.' || quote_ident(column_name), ','),
                TG_ARGV[3],
                TG_ARGV[2],
                TG_ARGV[4],
                TG_ARGV[5])
            FROM   information_schema.columns
            WHERE  table_name   = TG_TABLE_NAME    -- table name, case sensitive
            AND    table_schema = TG_TABLE_SCHEMA  -- schema name, case sensitive
        ) USING OLD;

        -- No return value is expected if run
        RETURN NULL;
    END;
    $$;


    -- Invalidate all entries of the source table, by copying them to the
    -- history table. Expects history table name as first argument. Since this
    -- is expected to be a very infrequent operation, it is not optimized for
    -- performance.
    CREATE OR REPLACE FUNCTION handle_live_table_truncate()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    DECLARE
        history_info record;
    BEGIN
        SELECT * FROM catmaid_history_table cht
        WHERE cht.live_table = TG_RELID
        AND cht.history_table = TG_ARGV[0]::regclass
        INTO history_info;

        -- Insert new historic data into history table, based on the
        -- currently available columns in the updated table.
        IF history_info.tracking_table IS NULL THEN
            EXECUTE (
                SELECT format(
                    'INSERT INTO %1$I (%2$s,%3$s,%4$s) '
                    'SELECT %5$s, tstzrange(LEAST(lt.%6$s, current_timestamp), current_timestamp), '
                    'lt.%8$s '
                    'FROM %7$s lt',
                    history_info.history_table,
                    string_agg(quote_ident(cti.column_name), ','),
                    'sys_period',
                    'exec_transaction_id',
                    string_agg('lt.' || quote_ident(cti.column_name), ','),
                    history_info.time_column,
                    history_info.live_table,
                    history_info.txid_column)
                FROM catmaid_table_info cti
                WHERE cti.rel_oid = TG_RELID);
        ELSE
            EXECUTE (
                SELECT format(
                    'INSERT INTO %1$I (%2$s,%3$s,%4$s) '
                    'SELECT %5$s, tstzrange(LEAST(tt.%6$s, current_timestamp), current_timestamp), '
                    'tt.%10$s '
                    'FROM %7$s lt '
                    'JOIN %8$s tt ON lt.%9$s = tt.live_pk',
                    history_info.history_table,
                    string_agg(quote_ident(cti.column_name), ','),
                    'sys_period',
                    'exec_transaction_id',
                    string_agg('lt.' || quote_ident(cti.column_name), ','),
                    history_info.time_column,
                    history_info.live_table,
                    history_info.tracking_table,
                    history_info.live_table_pkey_column,
                    history_info.txid_column)
                FROM catmaid_table_info cti
                WHERE cti.rel_oid = TG_RELID);
        END IF;

        RETURN NULL;
    END;
    $$;


    -- Truncate the tracking table of the source table. Expects tracking
    -- table name as first argument.
    CREATE OR REPLACE FUNCTION truncate_tracking_table()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN
        EXECUTE format('TRUNCATE %I', TG_ARGV[0]);
        RETURN NULL;
    END;
    $$;


    -- Insert or update a tracking table entry for a particular live table. Delete
    -- time info row if respective target row is deleted. This trigger should
    -- only be installed on tables that don't have a tracking table already.The
    -- following arguments are passed to this trigger function:
    -- 0: tracking_table_name, 1: live_table_pkey_column
    CREATE OR REPLACE FUNCTION update_time_for_row()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN
        IF TG_OP = 'UPDATE' THEN
            EXECUTE format(
                'UPDATE %1$I SET edition_time = current_timestamp, '
                'txid = txid_current() '
                'WHERE live_pk = $1.%2$s', TG_ARGV[0], TG_ARGV[1])
            USING NEW;
        ELSIF TG_OP = 'INSERT' THEN
            EXECUTE format(
                'INSERT INTO %1$I (live_pk, edition_time, txid) '
                'VALUES ($1.%2$s, current_timestamp, txid_current())',
                TG_ARGV[0], TG_ARGV[1])
            USING NEW;
        ELSIF TG_OP = 'DELETE' THEN
            EXECUTE format(
                'DELETE FROM %1$I '
                'WHERE %1$s.live_pk = $1.%2$s',
                TG_ARGV[0], TG_ARGV[1])
            USING OLD;
        END IF;

        -- No return value is expected
        RETURN NULL;
    END;
    $$;


    -- Re-create all triggers associated with history tracking on a particular
    -- live table (if it has a history table). This function has to be called
    -- after a live table was changed (e.g. a column was added or remove).
    CREATE OR REPLACE FUNCTION reload_history_tracking_for_table(live_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        PERFORM disable_history_tracking_for_table(live_table, cht.history_table)
        FROM catmaid_history_table
        WHERE live_table = live_table;

        PERFORM enable_history_tracking_for_table(live_table, cht.history_table)
        FROM catmaid_history_table
        WHERE live_table = live_table;
    END;
    $$;


    -- Re-create all triggers associated with history tracking of all versioned
    -- live tables. This function can be called if many tables changed at the
    -- same time and is more convenient than calling reload_history_tracking_for_table()
    -- for each changed table.
    CREATE OR REPLACE FUNCTION reload_history_tracking()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        PERFORM disable_history_tracking();
        PERFORM enable_history_tracking();
    END;
    $$;
"""

forward_add_initial_history_tables_sql = """
    BEGIN;
    -- The list of CATMAID tables for which a history table is initially
    -- created. These are all except log and treenode_edge
    CREATE TEMPORARY TABLE temp_versioned_catmaid_table (
        name regclass,
        time_column text,
        txid_column text DEFAULT NULL
    ) ON COMMIT DROP;
    INSERT INTO temp_versioned_catmaid_table (VALUES
        ('broken_slice', NULL),
        ('cardinality_restriction', 'edition_time'),
        ('catmaid_userprofile', NULL),
        ('catmaid_volume', 'edition_time'),
        ('change_request', 'edition_time'),
        ('class', 'edition_time'),
        ('class_class', 'edition_time'),
        ('class_instance', 'edition_time'),
        ('class_instance_class_instance', 'edition_time'),
        ('client_data', NULL),
        ('client_datastore', NULL),
        ('concept', 'edition_time'),
        ('connector', 'edition_time'),
        ('connector_class_instance', 'edition_time'),
        ('data_view', NULL),
        ('data_view_type', NULL),
        ('location', 'edition_time'),
        ('message', 'time'),
        ('overlay', NULL),
        ('project', NULL),
        ('project_stack', NULL),
        ('region_of_interest', 'edition_time'),
        ('region_of_interest_class_instance', 'edition_time'),
        ('relation', 'edition_time'),
        ('relation_instance', 'edition_time'),
        ('restriction', 'edition_time'),
        ('review', 'review_time'),
        ('reviewer_whitelist', NULL),
        ('stack', NULL),
        ('stack_class_instance', 'edition_time'),
        ('suppressed_virtual_treenode', 'edition_time'),
        ('textlabel', 'edition_time'),
        ('textlabel_location', NULL),
        ('treenode', 'edition_time'),
        ('treenode_class_instance', 'edition_time'),
        ('treenode_connector', 'edition_time')
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

    -- Add a transaction ID column to the passed in table
    CREATE OR REPLACE FUNCTION add_txid_column(target_table regclass)
    RETURNS text
    LANGUAGE plpgsql AS
    $$
    BEGIN
        RAISE NOTICE 'Add transaction ID column to table %', target_table;
        EXECUTE format(
            'ALTER TABLE %1$s '
            'ADD COLUMN txid bigint DEFAULT txid_current()',
            target_table);
        RETURN 'txid';
    END;
    $$;

    -- Walk over all CATMAID tables and if they have a time column associated,
    -- make sure they also have a transaction column 'txid'. If not, the table
    -- is updated if and only if it has no inhertience child tables.
    UPDATE temp_versioned_catmaid_table t
    SET txid_column = add_txid_column(t.name::regclass)
    FROM temp_versioned_catmaid_table t2
    LEFT JOIN catmaid_inheriting_tables cit
    ON cit.child_oid = t2.name::regclass
    WHERE cit.child_oid IS NULL
    AND t2.time_column IS NOT NULL
    AND t.name = t2.name;

    -- Now that all non-inheritance and inheritance root tables are updated,
    -- update all inheritance child tables.
    UPDATE temp_versioned_catmaid_table t
    SET txid_column = 'txid'
    FROM temp_versioned_catmaid_table t2
    JOIN catmaid_inheriting_tables cit
    ON cit.child_oid = t2.name::regclass
    WHERE t2.time_column IS NOT NULL
    AND t.txid_column IS NULL
    AND t.name = t2.name;

    -- Don't keep column adding function
    DROP FUNCTION add_txid_column(regclass);


    -- Create a history table including inheritance for all tables, but handle
    -- sync separately (to avoid syncing when disabled in settings and to
    -- allow faster initial syncing).
    SELECT create_history_table(t.name, t.time_column, t.txid_column,
        {create_triggers}, true, false)
    FROM temp_versioned_catmaid_table t;
    SELECT create_history_table(t.name, NULL, NULL,
        {create_triggers}, true, false)
    FROM temp_versioned_non_catmaid_table t;

    -- Sync time tables if history tables are enabled
    SELECT CASE WHEN {create_triggers}
        THEN sync_tracking_table(cht.live_table, cht.tracking_table)
        ELSE NULL END
    FROM catmaid_history_table cht
    WHERE cht.tracking_table IS NOT NULL;

    COMMIT;
""".format(create_triggers='true' if history_tracking_enabled else 'false')

backward_history_update = """
    -- Remove history functions
    DROP FUNCTION create_history_update_trigger_code(text,catmaid_history_table);
    DROP VIEW IF EXISTS catmaid_live_table_triggers;
    DROP VIEW IF EXISTS catmaid_inheriting_tables;
    DROP TABLE IF EXISTS catmaid_history_table;
    DROP TABLE IF EXISTS catmaid_transaction_info;
    DROP TYPE IF EXISTS history_change_type;
    DROP FUNCTION IF EXISTS create_history_table(regclass, text,
        text, boolean, boolean, boolean);
    DROP FUNCTION IF EXISTS drop_history_table(regclass);
    DROP FUNCTION IF EXISTS update_history_of_row_tracking();
    DROP FUNCTION IF EXISTS get_history_table_name(regclass);
    DROP FUNCTION IF EXISTS sync_tracking_table(regclass, regclass);
    DROP FUNCTION IF EXISTS truncate_tracking_table() CASCADE;
    DROP FUNCTION IF EXISTS handle_live_table_truncate() CASCADE;
    DROP FUNCTION IF EXISTS enable_history_tracking_for_table(regclass, text, boolean);
    DROP FUNCTION IF EXISTS disable_history_tracking_for_table(regclass, text);
    DROP FUNCTION IF EXISTS enable_history_tracking();
    DROP FUNCTION IF EXISTS disable_history_tracking();
    DROP FUNCTION IF EXISTS get_history_update_fn_name_regular(regclass);
    DROP FUNCTION IF EXISTS get_history_update_trigger_name_regular();
    DROP FUNCTION IF EXISTS get_history_update_trigger_name_tracking();
    DROP FUNCTION IF EXISTS get_history_truncate_trigger_name();
    DROP FUNCTION IF EXISTS get_tracking_table_name(regclass);
    DROP FUNCTION IF EXISTS get_tracking_table_update_trigger_name();
    DROP FUNCTION IF EXISTS get_tracking_table_truncate_trigger_name(regclass);
    DROP FUNCTION IF EXISTS update_time_for_row();
    DROP VIEW IF EXISTS catmaid_table_info;
    DROP FUNCTION reload_history_tracking_for_table(regclass);
    DROP FUNCTION reload_history_tracking();
"""

backward_add_previous_history_tracking = """
    -- Create a table to keep track of created history tables, when they were
    -- created, whether triggers were installed on the live table, what the name
    -- of the live table's primary key is and if the live table has a particular
    -- column representing time or if this column is used with a particular 1:1
    -- time tracking table. Having an extra table is needed for non-CATMAID tables
    -- that don't already have an edition time. The time information itself is
    -- used to synchronize tables if history tracking is enabled after it was
    -- disabled. This table is also used for rolling back this migration and more
    -- robust access to individual history tables based on a live table name.
    CREATE TABLE catmaid_history_table (
        history_table_name      name PRIMARY KEY,
        live_table_name         regclass,
        triggers_installed      boolean NOT NULL,
        time_table              regclass,
        live_table_time_column  text,
        live_table_pkey_column  text,
        creation_time           timestamptz NOT NULL DEFAULT current_timestamp
    );


    -- This enum type represents different types of history changes that are
    -- recorded in CATMAID's transaction information table.
    CREATE TYPE history_change_type AS ENUM ('Backend', 'Migration', 'External');


    -- The combination of transaction ID and execution time is unique and
    -- represents one semantic front-end action, initiated by a particular
    -- user. The unique constraint isn't added explicitly to avoid performance
    -- costs during insertion.
    CREATE TABLE catmaid_transaction_info (
        transaction_id bigint DEFAULT txid_current(),
        execution_time timestamp with time zone DEFAULT current_timestamp,
        user_id integer,
        change_type history_change_type NOT NULL,
        label text NOT NULL,
        CONSTRAINT catmaid_transaction_info_pk PRIMARY KEY (transaction_id, execution_time)
    );


    -- Return the unquoted name of a live table's history table regular update trigger.
    CREATE OR REPLACE FUNCTION get_history_update_fn_name_regular(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'update_history_' || relname || '_reg' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history table regular update trigger.
    CREATE OR REPLACE FUNCTION get_history_update_trigger_name_regular(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'on_change_update_history_regular'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history table time-table update trigger.
    CREATE OR REPLACE FUNCTION get_history_update_trigger_name_timetable(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'on_change_history_timetable'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a table tracking history for the live table.
    -- Doesn't check if the table actually exists.
    CREATE OR REPLACE FUNCTION history_table_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT relname || '_history' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history table truncate trigger.
    CREATE OR REPLACE FUNCTION get_history_truncate_trigger_name()
        RETURNS text AS
    $$
        SELECT 'on_truncate_handle_live_table_truncate'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a table tracking time for the live table.
    -- Doesn't check if the table actually exists.
    CREATE OR REPLACE FUNCTION get_time_table_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT relname || '_time' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's time table update trigger.
    CREATE OR REPLACE FUNCTION get_time_table_update_trigger_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'on_change_update_time_table'::text;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's time table truncate trigger.
    CREATE OR REPLACE FUNCTION get_time_table_truncate_trigger_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'on_truncate_truncate_time_table'::text;
    $$ LANGUAGE sql STABLE;


    -- A view that tells if the known history tables have update trigger installed.
    CREATE OR REPLACE VIEW catmaid_live_table_triggers AS
        SELECT cht.live_table_name,
            ((
                cht.time_table IS NULL
                AND EXISTS (
                SELECT 1 FROM information_schema.triggers ist, pg_class pc
                WHERE pc.oid = cht.live_table_name
                AND ist.event_object_table = pc.relname
                AND ist.trigger_name =
                    get_history_update_trigger_name_regular(cht.live_table_name))
            ) OR (
                cht.time_table IS NOT NULL
                AND (
                EXISTS (
                    SELECT 1 FROM information_schema.triggers ist, pg_class pc
                    WHERE pc.oid = cht.live_table_name
                    AND ist.event_object_table = pc.relname
                    AND ist.trigger_name =
                        get_history_update_trigger_name_timetable(cht.live_table_name)
                ) AND EXISTS (
                    SELECT 1 FROM information_schema.triggers ist, pg_class pc
                    WHERE pc.oid = cht.live_table_name
                    AND ist.event_object_table = pc.relname
                    AND ist.trigger_name =
                        get_time_table_update_trigger_name(cht.live_table_name)
                ))
            )) AS triggers_installed
        FROM catmaid_history_table cht;


    -- A view that makes access to inheritance information more convenient.
    CREATE VIEW catmaid_inheriting_tables
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


    -- A view to simplify schema and column lookup for regclass objects
    CREATE OR REPLACE VIEW catmaid_table_info
    AS
        SELECT pc.oid AS rel_oid, pc.relname AS rel_name,
            pn.nspname AS rel_schema, c.column_name AS column_name
        FROM information_schema.columns c, pg_class pc, pg_namespace pn
        WHERE c.table_name = pc.relname
        AND pn.oid = pc.relnamespace
        AND c.table_schema = pn.nspname;


    -- Create a history table and triggers to populate it for the passed in
    -- table. Always use this function to create history tables to ensure
    -- everything is set up correctly. An optional time column can be specified,
    -- which will be used to obtain time information for a live row, otherwise the
    -- current timestamp will be used when time information is needed (e.g. for
    -- syncing live and history tables). If no time column is passed in, an extra
    -- 1:1 table that tracks edition time of live table rows is created and used
    -- as a time source for individual live rows when needed. Currently, only live
    -- tables with a single column primary key are supported. If the passed in table
    -- inherits from another table and <copy_inheritance> is true (default), the
    -- history table will have the same inheritance hierarchy as the live table. All
    -- parent history tables are initialized as regular history tables, too. The
    -- optional <live_table_time_column> is stored so that live tables and history
    -- tables can be synchronized in case triggers are disabled and re-enabled. If
    -- <sync> is true, the created history table is synchronized automatically, after
    -- it is created.
    CREATE OR REPLACE FUNCTION create_history_table(live_table_name regclass,
                                                    live_table_time_column text DEFAULT NULL,
                                                    create_triggers boolean DEFAULT true,
                                                    copy_inheritance boolean DEFAULT true,
                                                    sync boolean DEFAULT true)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    << outerblock >>
    DECLARE

        -- This will contain the name of the newly created history table
        history_table_name text;

        -- This will contain a reference to the newly created history table
        history_table_oid regclass;

        -- If a time table is created, this contains the name of it
        time_table_name text;

        -- If a time table is created, this holds a reference to it.
        time_table_oid regclass;

        -- This will contain the name of a parent history table, if any
        parent_history_table_name text;

        -- A list of columns in the original table
        column_info record;

        -- A list of columns in a potential parent table
        parent_info record;

        -- The primary key of the live table
        live_table_pkey_column  text;
        live_table_pkey_type    text;
        live_table_n_pkeys      int;

    BEGIN

        -- History tables will be named like the live table plus a '_history' suffix
        history_table_name = history_table_name(live_table_name);

        -- Make sure the history table name is not longer than 63 characters, a
        -- limit that Postgres defaults to and which causes identifier names to
        -- become shortened silently.
        IF (LENGTH(get_history_update_fn_name_regular(live_table_name)) > 63) THEN
            RAISE EXCEPTION 'Can''t create history table with name longer than '
                '63 characters: %', history_table_name;
        END IF;

        -- Don't do anything if there is already a history table registered with this name.
        IF EXISTS(SELECT 1 FROM catmaid_history_table cht
                  WHERE cht.history_table_name = outerblock.history_table_name) THEN
            RAISE NOTICE 'History table ''%'' already exists', history_table_name;
            RETURN;
        END IF;

        -- Find primary key and type of table
        SELECT a.attname, format_type(a.atttypid, a.atttypmod)
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = live_table_name
        AND    i.indisprimary
        INTO live_table_pkey_column, live_table_pkey_type;

        GET DIAGNOSTICS live_table_n_pkeys = ROW_COUNT;


        -- Make sure there is a single-column primary key available on the live table.
        IF live_table_n_pkeys = 0 THEN
            RAISE EXCEPTION 'Need primary key on table to create history '
                'table for "%"', live_table_name;
        ELSIF live_table_n_pkeys > 1 THEN
            RAISE EXCEPTION 'Currently only single column primary keys are'
            'supported, the primary key of table "%" consists of % columns: %',
                live_table_name, live_table_n_pkeys, live_table_pkey_column;
        END IF;

        -- If a time column was provided, make sure it actually exists
        -- TODO!

        -- Set parent information to nothing by default
        SELECT NULL INTO parent_info;

        -- Create new history table with the same columns as the original,
        -- but without indices or constraints. Parent tables are required to
        -- have regular history tables as well.
        IF copy_inheritance THEN
            -- If the table inherits from another table and <copy_inheritance> is
            -- true, the complete inheritance hierarchy will be recreated for the
            -- new table. Currently, only single table inheritance is supported.
            RAISE NOTICE 'START INHERITANCE for %', live_table_name;
            BEGIN
                SELECT parent_schemaname, parent_tablename, parent_oid INTO STRICT parent_info
                FROM catmaid_inheriting_tables
                WHERE child_oid = live_table_name;
                EXCEPTION
                    WHEN NO_DATA_FOUND THEN
                        -- Do nothing
                    WHEN TOO_MANY_ROWS THEN
                        -- Multi-inheritance support isn't implemented for history tables, yet
                        RAISE EXCEPTION 'Couldn''t create history table, found more than one parent of "%s"', live_table_name;
            END;

            IF FOUND THEN
                RAISE NOTICE 'Setting up history tracking for parent: %, %, %',
                    parent_info.parent_schemaname, parent_info.parent_tablename, parent_info.parent_oid;
                -- Recursively create a history table for the parent
                PERFORM create_history_table(parent_info.parent_oid, live_table_time_column,
                    create_triggers, copy_inheritance, sync);
            END IF;
            RAISE NOTICE 'END INHERITANCE';
        END IF;

        IF parent_info IS NOT NULL THEN
            parent_history_table_name = history_table_name(parent_info.parent_oid);
            RAISE NOTICE 'CREATE History table with INHERITANCE %', parent_history_table_name;
            -- Create a history table that inherits from the previously created
            -- parent history table.
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

        -- Get the OID of the new history table
        history_table_oid = to_regclass(history_table_name);

        -- Make all history columns (except the later added sys_period and
        -- transaction info columns) default to NULL.
        FOR column_info IN
            SELECT column_name
            FROM catmaid_table_info
            WHERE rel_oid = live_table_name
            AND column_name <> 'sys_period'
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
        -- it doesn't exist already (which can happen due to table inheritance.
        IF NOT EXISTS(SELECT column_name
                      FROM catmaid_table_info
                      WHERE rel_oid = history_table_oid
                      AND column_name = 'sys_period') THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN sys_period tstzrange
                NOT NULL DEFAULT tstzrange(current_timestamp, null)',
                history_table_name
            );
        END IF;

        -- Add a transaction reference to the history table, named
        -- exec_transaction_id, if it doesn't exist already (which can
        -- happen due to table inheritance. Together with the lower part
        -- of the sys_period range, the transaction ID is unique.
        IF NOT EXISTS(SELECT column_name
                      FROM catmaid_table_info
                      WHERE rel_oid = history_table_oid
                      AND column_name = 'exec_transaction_id') THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN exec_transaction_id bigint
                NOT NULL DEFAULT txid_current()',
                history_table_name
            );
        END IF;

        -- Create live table primary key index for the new history table. This
        -- is needed to quickly query older versions of an entity.
        IF (SELECT to_regclass(history_table_name || '_live_pk_index')) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %I (%I)',
                history_table_name || '_live_pk_index', history_table_name, live_table_pkey_column);
        END IF;

        -- Create sys_period (validity period) index for the new history
        -- table. This is needed to quickly query older state snapshots.
        IF (SELECT to_regclass(history_table_name || '_sys_period')) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %I USING gist(sys_period)',
                history_table_name || '_sys_period', history_table_name);
        END IF;

        -- Create index for transaction information, which is also needed to
        -- quickly find events that are part of the same transaction.
        IF (SELECT to_regclass(history_table_name || '_exec_transaction_id')) IS NULL THEN
            EXECUTE format(
                'CREATE INDEX %I ON %I (exec_transaction_id)',
                history_table_name || '_exec_transaction_id', history_table_name);
        END IF;


        -- Create a time tracking table if no time column was provided. It will
        -- store the last edition time for each entry. Update triggers are
        -- created as part of the trigger enabling.
        IF live_table_time_column IS NULL THEN

            -- A foreign key reference to live table's PK isn't used, because
            -- it make is much easier to deal with TRUNCATE queries on the live
            -- table.
            time_table_name = get_time_table_name(live_table_name);
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %s ('
                '  live_pk %s UNIQUE DEFERRABLE INITIALLY DEFERRED,'
                '  edition_time timestamptz NOT NULL'
                ')',
                time_table_name, live_table_pkey_type);

            -- Get the OID of the new history table
            time_table_oid = to_regclass(time_table_name);

            -- Create ID index for quick look-ups when updating the time table
            IF (SELECT to_regclass(time_table_name || '_live_pk_index')) IS NULL THEN
                EXECUTE format(
                    'CREATE INDEX %I ON %s (%s)',
                    time_table_name || '_live_pk_index', time_table_oid, 'live_pk');
            END IF;

        ELSE
            SELECT NULL into time_table_oid;
        END IF;


        -- Keep track of created history tables
        INSERT INTO catmaid_history_table (history_table_name, live_table_name,
            triggers_installed, live_table_time_column, live_table_pkey_column,
            time_table)
        VALUES (history_table_name, live_table_name, false,
            live_table_time_column, live_table_pkey_column, time_table_oid);

        -- Set up data insert, update and delete trigger on original database
        IF create_triggers THEN
            -- Handle sync separately, makes it easier to disable
            PERFORM enable_history_tracking_for_table(live_table_name,
                history_table_name, false);
        END IF;


        IF sync AND live_table_time_column IS NULL THEN
            RAISE NOTICE 'Syncing time for table "%" in time table "%"',
                live_table_name, time_table_oid;
            PERFORM sync_time_table(live_table_name, time_table_oid);
        END IF;
    END;
    $$;


    -- Synchronize a time table by inserting entries into it that are currently
    -- only present in the live table. Removing all entries not available in
    -- the live table is not necessary, because of the time table's foreign key
    -- constraint.
    CREATE OR REPLACE FUNCTION sync_time_table(live_table_name regclass,
            time_table_name regclass)
        RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        start_time  timestamptz;
        end_time    timestamptz;
        delta       interval;
        pkey_column text;
    BEGIN
        RAISE NOTICE 'Obtaining exclusive locks on tables % and %',
            live_table_name, time_table_name;
        EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', live_table_name);
        EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', time_table_name);

        start_time = clock_timestamp();

        EXECUTE (
            SELECT format(
                'INSERT INTO %1$s (live_pk, edition_time) '
                'SELECT %3$s, current_timestamp '
                'FROM ONLY %2$s lt '
                'LEFT JOIN %1$s tt ON lt.%3$s = tt.live_pk '
                'WHERE tt.live_pk IS NULL',
                time_table_name, cht.live_table_name, cht.live_table_pkey_column)
            FROM catmaid_history_table cht
            WHERE cht.live_table_name = $1
            AND cht.time_table = $2);

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
        -- regclass is used, because the implicit table existence check on variable
        -- assignment can fail if the table has already been removed by an
        -- cascaded table drop.
        history_table_name text;

    BEGIN

        -- History tables will be named like the live table plus a '_history' suffix
        history_table_name = history_table_name(live_table_name);

        -- Cascading deleting is used to also delete child tables and triggers.
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', history_table_name);
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE',
            get_time_table_name(live_table_name));
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_time_table_update_trigger_name(live_table_name), live_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_regular(live_table_name), live_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_timetable(live_table_name), live_table_name);
        EXECUTE format('DROP FUNCTION IF EXISTS %s() CASCADE',
            get_history_update_fn_name_regular(live_table_name));

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

        -- A record in the history_table table
        row record;

    BEGIN

        -- Remove existing history tables and triggers
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM drop_history_table(row.live_table_name);
        END LOOP;

    END;
    $$;


    -- Enable history tracking for a particular live table and history table by
    -- making sure all triggers are connected to history events. In case
    -- triggers have to be created, the history table is synced by default,
    -- which can optionally be disabled.
    CREATE OR REPLACE FUNCTION enable_history_tracking_for_table(live_table_name regclass,
        history_table_name text, sync boolean DEFAULT true)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        history_update_fn_name text;
        history_trigger_name_regular text;
        history_trigger_name_timetable text;
        time_trigger_name name;
        history_info record;
    BEGIN
        IF NOT EXISTS(
            SELECT 1 FROM catmaid_history_table cht
            WHERE cht.live_table_name =$1 AND triggers_installed = true)
        THEN
            SELECT * FROM catmaid_history_table cht
            WHERE cht.live_table_name = $1
            AND cht.history_table_name = $2
            INTO history_info;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Couldn''t find history table information for '
                    'table "%" and history table "%"! You need to create it first.',
                    live_table_name, history_table_name;
            END IF;

            IF history_info.time_table IS NULL THEN
                -- Install regular triggers if no time time table is provided,
                -- expect time column to be available from live table.
                history_trigger_name_regular =
                    get_history_update_trigger_name_regular(live_table_name);

                history_update_fn_name =
                    get_history_update_fn_name_regular(live_table_name);

                -- History tables: update entry, coming from either a table update or
                -- delete statement. Both wil create a new history entry containing the old
                -- data along with the validity time range [old-time-column,
                -- current-timestamp). The time information is provided by the live table
                -- itself, it has to provide the time column.
                EXECUTE (
                    SELECT format(
                        'CREATE OR REPLACE FUNCTION %1$s()
                        RETURNS TRIGGER
                        LANGUAGE plpgsql AS
                        $FN$
                        BEGIN

                            -- Insert new historic data into history table, based on the
                            -- currently available columns in the updated table.
                            INSERT INTO %2$I (%3$s,%4$s,%5$s)
                            SELECT %6$s, tstzrange(LEAST(OLD.%7$s, current_timestamp), current_timestamp),
                            txid_current();

                            -- No return value is expected if run
                            RETURN NULL;
                        END;
                        $FN$',
                        history_update_fn_name,
                        history_info.history_table_name,
                        string_agg(quote_ident(cti.column_name), ','),
                        'sys_period',
                        'exec_transaction_id',
                        string_agg('OLD.' || quote_ident(cti.column_name), ','),
                        history_info.live_table_time_column)
                    FROM catmaid_table_info cti
                    WHERE cti.rel_oid = history_info.live_table_name
                );

                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER UPDATE OR DELETE ON %2$s FOR EACH ROW '
                    'EXECUTE PROCEDURE %3$s()',
                    history_trigger_name_regular, history_info.live_table_name,
                    history_update_fn_name
                );
            ELSE
                -- Install time table based triggers if a time time table is provided,
                -- expect time column to be available from it.
                time_trigger_name =
                    get_time_table_update_trigger_name(live_table_name);
                history_trigger_name_timetable =
                    get_history_update_trigger_name_timetable(live_table_name);

                IF sync THEN
                    RAISE NOTICE 'Syncing time records for table "%" into table "%"',
                        live_table_name, history_info.time_table;
                    PERFORM sync_time_table(live_table_name, history_info.time_table);
                END IF;

                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER INSERT OR UPDATE OR DELETE ON %2$s FOR EACH ROW '
                    'EXECUTE PROCEDURE update_time_for_row(%3$s, %4$s)',
                    time_trigger_name, live_table_name, history_info.time_table,
                    history_info.live_table_pkey_column);

                -- In case the original is truncated, truncate time table too.
                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER TRUNCATE ON %2$s FOR EACH STATEMENT '
                    'EXECUTE PROCEDURE truncate_time_table(%s)',
                    get_time_table_truncate_trigger_name(live_table_name),
                    live_table_name, history_info.time_table);

                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER UPDATE OR DELETE ON %2$s FOR EACH ROW '
                    'EXECUTE PROCEDURE update_history_of_row_timetable(%3$s, %4$s, %5$s, %6$s, %7$s)',
                    history_trigger_name_timetable, history_info.live_table_name, 'sys_period',
                    history_info.history_table_name, history_info.live_table_pkey_column,
                    history_info.time_table, 'edition_time');
            END IF;

            -- In case the original is truncated, invalidate all live entries.
            -- This has to happen *before* the actual truncation of the live
            -- table, because the live data is needed for the history table.
            EXECUTE format(
                'CREATE TRIGGER %1$I '
                'BEFORE TRUNCATE ON %2$s FOR EACH STATEMENT '
                'EXECUTE PROCEDURE handle_live_table_truncate(%s)',
                get_history_truncate_trigger_name(),
                live_table_name, history_info.history_table_name);

            -- Remember that triggers are now installed for this table
            UPDATE catmaid_history_table cht SET triggers_installed = true
            WHERE cht.live_table_name = $1 AND cht.history_table_name = $2;
        END IF;
    END;
    $$;


    -- Disable history tracking by ensuring all triggers for history events on
    -- the passed in live table are dropped.
    CREATE OR REPLACE FUNCTION
    disable_history_tracking_for_table(live_table_name regclass, history_table_name text)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_time_table_update_trigger_name(live_table_name), live_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_time_table_truncate_trigger_name(live_table_name), live_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_regular(live_table_name), live_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_timetable(live_table_name), live_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_truncate_trigger_name(), live_table_name);
        -- Remember that triggers are now removed for this table
        UPDATE catmaid_history_table cht SET triggers_installed = false
        WHERE cht.live_table_name = $1 AND cht.history_table_name = $2;
    END;
    $$;


    -- Enable history tracking by making sure all triggers for all monitored
    -- lived tables are created.
    CREATE OR REPLACE FUNCTION enable_history_tracking()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        -- A record in the catmaid_history_table table
        row record;
    BEGIN
        -- Iterate over all known history tables
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM enable_history_tracking_for_table(row.live_table_name,
                row.history_table_name);
        END LOOP;
    END;
    $$;


    -- Disable history tracking by making sure all history table triggers of
    -- all monitored live tables are dropped.
    CREATE OR REPLACE FUNCTION disable_history_tracking()
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        -- A record in the catmaid_history_table table
        row record;
    BEGIN
        -- Iterate over all known history tables
        FOR row IN SELECT * FROM catmaid_history_table
        LOOP
            PERFORM disable_history_tracking_for_table(row.live_table_name,
                row.history_table_name);
        END LOOP;
    END;
    $$;

    -- History tables: update entry, coming from either a table update or
    -- delete statement. Both wil create a new history entry containing the old
    -- data along with the validity time range [old-time-column,
    -- current-timestamp). A time table passed in as argument is used to
    -- retrieve time information, it has to provide the passed in time column.
    -- The following arguments are passed to this trigger function and are part
    -- of the TG_ARGV variable:
    -- 0: sys_period_column, 1: history_table_name, 2: live_table_pkey_column,
    -- 3: time_table_name, 4: time_column
    CREATE OR REPLACE FUNCTION update_history_of_row_timetable()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN


        -- Insert new historic data into history table, based on the --
        -- currently available columns in the updated table. If no time table
        -- is given, retrieve time from table.
        EXECUTE (
            SELECT format(
                'INSERT INTO %1$I AS ht (%2$s,%3$s,%4$s) '
                'SELECT %5s, tstzrange(LEAST(tt.%8$s, current_timestamp), current_timestamp), txid_current() '
                'FROM %6$I tt WHERE tt.live_pk = $1.%7$s',
                TG_ARGV[1], string_agg(quote_ident(column_name), ','), TG_ARGV[0], 'exec_transaction_id',
                string_agg('$1.' || quote_ident(column_name), ','), TG_ARGV[3], TG_ARGV[2], TG_ARGV[4])
            FROM   information_schema.columns
            WHERE  table_name   = TG_TABLE_NAME    -- table name, case sensitive
            AND    table_schema = TG_TABLE_SCHEMA  -- schema name, case sensitive
        ) USING OLD;

        -- No return value is expected if run
        RETURN NULL;
    END;
    $$;

    -- Invalidate all entries of the source table, by copying them to the
    -- history table. Expects history table name as first argument. Since this
    -- is expected to be a very infrequent operation, it is not optimized for
    -- performance.
    CREATE OR REPLACE FUNCTION handle_live_table_truncate()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    DECLARE
        history_info record;
    BEGIN
        SELECT * FROM catmaid_history_table cht
        WHERE cht.live_table_name = TG_RELID
        AND cht.history_table_name = TG_ARGV[0]::regclass::name
        INTO history_info;

        -- Insert new historic data into history table, based on the
        -- currently available columns in the updated table.
        IF history_info.time_table IS NULL THEN
            EXECUTE (
                SELECT format(
                    'INSERT INTO %1$I (%2$s,%3$s,%4$s) '
                    'SELECT %5$s, tstzrange(LEAST(lt.%6$s, current_timestamp), current_timestamp), '
                    'txid_current() '
                    'FROM %7$s lt',
                    history_info.history_table_name,
                    string_agg(quote_ident(cti.column_name), ','),
                    'sys_period',
                    'exec_transaction_id',
                    string_agg('lt.' || quote_ident(cti.column_name), ','),
                    history_info.live_table_time_column,
                    history_info.live_table_name)
                FROM catmaid_table_info cti
                WHERE cti.rel_oid = TG_RELID);
        ELSE
            EXECUTE (
                SELECT format(
                    'INSERT INTO %1$I (%2$s,%3$s,%4$s) '
                    'SELECT %5$s, tstzrange(LEAST(tt.%6$s, current_timestamp), current_timestamp), '
                    'txid_current() '
                    'FROM %7$s lt '
                    'JOIN %8$s tt ON lt.%9$s = tt.live_pk',
                    history_info.history_table_name,
                    string_agg(quote_ident(cti.column_name), ','),
                    'sys_period',
                    'exec_transaction_id',
                    string_agg('lt.' || quote_ident(cti.column_name), ','),
                    'edition_time',
                    history_info.live_table_name,
                    history_info.time_table,
                    history_info.live_table_pkey_column)
                FROM catmaid_table_info cti
                WHERE cti.rel_oid = TG_RELID);
        END IF;

        RETURN NULL;
    END;
    $$;

    -- Truncate the time table of the source table. Expects time table name as
    -- first argument.
    CREATE OR REPLACE FUNCTION truncate_time_table()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN
        EXECUTE format('TRUNCATE %I', TG_ARGV[0]);
        RETURN NULL;
    END;
    $$;


    -- Insert or update a time table entry for a particular live table. Delete
    -- time info row if respective target row is deleted. This trigger should
    -- only be installed on tables that don't have a time table already.The
    -- following arguments are passed to this trigger function:
    -- 0: time_table_name, 1: live_table_pkey_column
    CREATE OR REPLACE FUNCTION update_time_for_row()
    RETURNS TRIGGER
    LANGUAGE plpgsql AS
    $$
    BEGIN
        IF TG_OP = 'UPDATE' THEN
            EXECUTE format(
                'UPDATE %1$I SET edition_time = current_timestamp '
                'WHERE live_pk = $1.%2$s', TG_ARGV[0], TG_ARGV[1])
            USING NEW;
        ELSIF TG_OP = 'INSERT' THEN
            EXECUTE format(
                'INSERT INTO %1$I (live_pk, edition_time) '
                'VALUES ($1.%2$s, current_timestamp)',
                TG_ARGV[0], TG_ARGV[1])
            USING NEW;
        ELSIF TG_OP = 'DELETE' THEN
            EXECUTE format(
                'DELETE FROM %1$I '
                'WHERE %1$s.live_pk = $1.%2$s',
                TG_ARGV[0], TG_ARGV[1])
            USING OLD;
        END IF;

        -- No return value is expected
        RETURN NULL;
    END;
    $$;
"""

# If this migration is rolled back, the new state will include an initialized
# version of the previous history tracking system, if enabled.
backward_reinit_previous_history_tables_sql = """
    BEGIN;
    -- The list of CATMAID tables for which a history table is initially
    -- created. These are all except log and treenode_edge
    CREATE TEMPORARY TABLE temp_versioned_catmaid_table (
        name regclass,
        time_column text
    ) ON COMMIT DROP;
    INSERT INTO temp_versioned_catmaid_table (VALUES
        ('broken_slice', NULL),
        ('cardinality_restriction', 'edition_time'),
        ('catmaid_userprofile', NULL),
        ('catmaid_volume', 'edition_time'),
        ('change_request', 'edition_time'),
        ('class', 'edition_time'),
        ('class_class', 'edition_time'),
        ('class_instance', 'edition_time'),
        ('class_instance_class_instance', 'edition_time'),
        ('client_data', NULL),
        ('client_datastore', NULL),
        ('concept', 'edition_time'),
        ('connector', 'edition_time'),
        ('connector_class_instance', 'edition_time'),
        ('data_view', NULL),
        ('data_view_type', NULL),
        ('location', 'edition_time'),
        ('message', 'time'),
        ('overlay', NULL),
        ('project', NULL),
        ('project_stack', NULL),
        ('region_of_interest', 'edition_time'),
        ('region_of_interest_class_instance', 'edition_time'),
        ('relation', 'edition_time'),
        ('relation_instance', 'edition_time'),
        ('restriction', 'edition_time'),
        ('review', 'review_time'),
        ('reviewer_whitelist', NULL),
        ('stack', NULL),
        ('stack_class_instance', 'edition_time'),
        ('suppressed_virtual_treenode', 'edition_time'),
        ('textlabel', 'edition_time'),
        ('textlabel_location', NULL),
        ('treenode', 'edition_time'),
        ('treenode_class_instance', 'edition_time'),
        ('treenode_connector', 'edition_time')
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

    -- Create a history table including inheritance for all tables, but handle
    -- sync separately (to avoid syncing when disabled in settings and to
    -- allow faster initial syncing).
    SELECT create_history_table(t.name, t.time_column,
        {create_triggers}, true, false)
    FROM temp_versioned_catmaid_table t;
    SELECT create_history_table(t.name, NULL,
        {create_triggers}, true, false)
    FROM temp_versioned_non_catmaid_table t;

    -- Sync time tables if history tables are enabled
    SELECT CASE WHEN {create_triggers}
        THEN sync_time_table(cht.live_table_name, cht.time_table)
        ELSE NULL END
    FROM catmaid_history_table cht
    WHERE cht.time_table IS NOT NULL;
    COMMIT;
""".format(create_triggers='true' if history_tracking_enabled else 'false')

backward_remove_history_tables_sql = """
    -- Find all tables that got a new transaction ID column added, and remove it
    BEGIN;
        CREATE TEMPORARY TABLE temp_versioned_catmaid_table (
            name        regclass,
            txid_col    text
        ) ON COMMIT DROP;

        INSERT INTO temp_versioned_catmaid_table (name, txid_col)
        SELECT cht.live_table, cht.txid_column
        FROM catmaid_history_table cht
        LEFT JOIN catmaid_inheriting_tables cit
        ON cht.live_table = cit.child_oid
        WHERE cit.child_oid IS NULL
        AND cht.tracking_table IS NULL;

        -- Remove transaction ID column to the passed in table
        CREATE OR REPLACE FUNCTION remove_column(target_table regclass, col text)
        RETURNS void
        LANGUAGE plpgsql AS
        $$
        BEGIN
            RAISE NOTICE 'Remove column % from table %', col, target_table;
            EXECUTE format(
                'ALTER TABLE %1$s '
                'DROP COLUMN %2$s',
                target_table, col);
        END;
        $$;

        -- Perform actual column removal
        SELECT remove_column(t.name, t.txid_col)
        FROM temp_versioned_catmaid_table t;

        DROP FUNCTION remove_column(regclass, text);

        -- Remove history tables
        SELECT drop_all_history_tables();

    COMMIT;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0009_ensure_required_project_classes'),
    ]

    operations = [
        migrations.RunSQL(migrations.RunSQL.noop, backward_reinit_previous_history_tables_sql),
        migrations.RunSQL(forward_remove_existing_history, backward_add_previous_history_tracking),
        migrations.RunSQL(forward_history_update, backward_history_update),
        migrations.RunSQL(forward_add_initial_history_tables_sql, backward_remove_history_tables_sql),
    ]
