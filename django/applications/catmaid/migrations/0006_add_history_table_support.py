# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import connection, migrations, models
from django.conf import settings


# Indicate whether history tables are enabled for this migration. If they are
# not, only history tables will be created, but no triggers are installed and no
# initial population of history tables will happen.
history_tracking_enabled = getattr(settings, 'HISTORY_TRACKING', True)

add_history_functions_sql = """

    -- Create a table to keep track of created history tables, when they were
    -- created, whether triggers were installed on the live table, what the name
    -- of the live table's primary key is and if the live table has a particular
    -- column representing time. The latter is used to synchronize tables if
    -- history tracking is enabled after it was disabled. This table is also used
    -- for rolling back this migration and more robust access to individual
    -- history tables based on a live table name.
    CREATE TABLE catmaid_history_table (
        history_table_name      name PRIMARY KEY,
        live_table_name         regclass,
        triggers_installed      boolean NOT NULL,
        live_table_time_column  text,
        live_table_pkey_column  text,
        creation_time           timestamptz NOT NULL DEFAULT current_timestamp
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


    -- Return the unquoted name of a live table's history table.
    CREATE OR REPLACE FUNCTION history_table_update_trigger_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'on_change_' || relname || '_update_history' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- Return the unquoted name of a live table's history update trigger.
    CREATE OR REPLACE FUNCTION history_table_name(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT relname || '_history' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;


    -- A view that tells if the known history tables have update trigger installed.
    CREATE OR REPLACE VIEW catmaid_live_table_triggers AS
        SELECT cht.live_table_name, EXISTS(
            SELECT * FROM information_schema.triggers ist, pg_class pc
            WHERE pc.oid = cht.live_table_name
            AND ist.event_object_table = pc.relname
            AND ist.trigger_name =
            history_table_update_trigger_name(cht.live_table_name)) AS
                triggers_installed
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


    -- Create a history table and triggers to populate it for the passed in
    -- table. Always use this function to create history tables to ensure
    -- everything is set up correctly. An optional time column can be specified,
    -- which will be used to obtain time information for a live row, otherwise the
    -- current timestamp will be used when time information is needed (e.g. for
    -- syncing live and history tables)d. Currently, only tables with a single
    -- column primary key are supported. If the passed in table inherits from
    -- another table and <copy_inheritance> is true (default), the history table
    -- will have the same inheritance hierarchy as the live table. All parent
    -- history tables are initialized as regular history tables, too. The optional
    -- live_table_time_column is stored so that live tables and history tables can
    -- be synchronized in case triggers are disabled and re-enabled. If <sync> is
    -- true, the created history table is synchronized automatically, after it is
    -- created.
    CREATE OR REPLACE FUNCTION create_history_table(live_table_schema text,
                                                    live_table_name regclass,
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

        -- This will contain the name of a parent history table, if any
        parent_history_table_name text;

        -- A list of columns in the original table
        column_info record;

        -- A list of columns in a potential parent table
        parent_info record;

        -- The primary key of the live table
        live_table_pkey_column  text;
        live_table_n_pkeys      int;

    BEGIN

        -- History tables will be named like the live table plus a '_history' suffix
        history_table_name = history_table_name(live_table_name);

        -- Don't do anything if there is already a history table registered with this name.
        IF EXISTS(SELECT 1 FROM catmaid_history_table cht
                  WHERE cht.history_table_name = outerblock.history_table_name) THEN
            RAISE NOTICE 'History table ''%'' already exists', history_table_name;
            RETURN;
        END IF;

        -- Find primary key of table
        SELECT a.attname
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = live_table_name
        AND    i.indisprimary
        INTO live_table_pkey_column;

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
                WHERE child_oid = live_table_name
                AND child_schemaname = live_table_schema::text;
                EXCEPTION
                    WHEN NO_DATA_FOUND THEN
                        -- Do nothing
                    WHEN TOO_MANY_ROWS THEN
                        -- Multi-inheritance support isn't implemented for history tables, yet
                        RAISE EXCEPTION 'Couldn''t create history table, found more than one parent of %s.%s', live_table_schema, live_table_name;
            END;

            IF FOUND THEN
                RAISE NOTICE 'Setting up history tracking for parent: %, %, %',
                    parent_info.parent_schemaname, parent_info.parent_tablename, parent_info.parent_oid;
                -- Recursively create a history table for the parent
                PERFORM create_history_table(parent_info.parent_schemaname,
                    parent_info.parent_oid, live_table_time_column, TRUE, TRUE);
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

        -- Make all history columns (except the later added sys_period and
        -- transaction info columns) default to NULL.
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
        -- it doesn't exist already (which can happen due to table inheritance.
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
        -- happen due to table inheritance. Together with the lower part
        -- of the sys_period range, the transaction ID is unique.
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

        -- Keep track of created history tables
        INSERT INTO catmaid_history_table (history_table_name, live_table_name,
            triggers_installed, live_table_time_column, live_table_pkey_column)
        VALUES (history_table_name, live_table_name, false,
            live_table_time_column, live_table_pkey_column);

        -- Set up data insert, update and delete trigger on original database
        IF create_triggers THEN
            -- Handle sync separately, makes it easier to disable
            PERFORM enable_history_tracking_for_table(live_table_name,
                history_table_name, false);
        END IF;

        IF sync THEN
            RAISE NOTICE 'Syncing history for table "%" in history table "%"',
                live_table_name, history_table_name;
            PERFORM sync_history_table($2,cht.history_table_name::regclass)
            FROM catmaid_history_table cht
            WHERE cht.live_table_name = $2
            AND cht.history_table_name = outerblock.history_table_name::name;
        END IF;
    END;
    $$;

    -- Copy data from a live table into its history table. Ignore live data that
    -- is already present in the historic data. If a time column is passed in
    -- that is different from NULL and its live value is newer than the
    -- corresponding historic value, the history table is updated and the newer
    -- row is inserted and the old history row is updated.
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


    -- Synchronize a history table by comparing it to its live table. If a
    -- live row does not have a corresponding history entry, a new history table
    -- row is created for it (like when a new entry is added). Otherwise, if a
    -- live row already has a corresponding history table row (i.e. their IDs
    -- match) both are synced. If a time column has been passed in, it is used
    -- to check if the live row is newer. Otherwise, all values are compared
    -- and if live table values differ, a new history entry is created and the
    -- old one is updated to become invalid.
    CREATE OR REPLACE FUNCTION sync_history_table(live_table_name regclass,
        history_table_name regclass)
        RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE
        start_time  timestamptz;
        end_time    timestamptz;
        delta       interval;
        row         record;
        num_updated_rows int;
        num_new_rows int;
        time_column text;
        time_source text;
        pkey_column text;
    BEGIN
        RAISE NOTICE 'Obtaining exclusive locks on tables % and %',
            live_table_name, history_table_name;
        EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', live_table_name);
        EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', history_table_name);

        start_time = clock_timestamp();

        SELECT cht.live_table_time_column
        FROM catmaid_history_table cht
        WHERE cht.live_table_name = $1
        AND cht.history_table_name = $2::name
        INTO time_column;

        SELECT cht.live_table_pkey_column
        FROM catmaid_history_table cht
        WHERE cht.live_table_name = $1
        AND cht.history_table_name = $2::name
        INTO pkey_column;

        IF time_column IS NOT NULL THEN
            RAISE NOTICE 'Synchronizing history information for table "%" using '
                'time column "%" and primary key "%"', live_table_name,
                time_column, pkey_column;
            -- If there is a time column available for this table, invalidate all
            -- history rows with a sys_period range that contains the live row's
            -- time column value, but started before it. New (active) history
            -- rows will then be inserted for those newer live rows.
            time_source = 'lt.' || time_column;
            EXECUTE (
                SELECT format (
                    'WITH updated_entries AS ('
                        'UPDATE %1$s ht '
                        'SET sys_period = tstzrange(lower(ht.sys_period), %3$s) '
                        'FROM %2$s lt, catmaid_history_table cht '
                        'WHERE ht.%5$s = lt.%5$s '
                        'AND ht.sys_period @> %3$s ' -- @> is "contains" operator
                        'AND lower(ht.sys_period) < %3$s '
                        'RETURNING lt.*, tstzrange(%3$s, null) AS sys_period, %4$s AS txid '
                    ') '
                    'INSERT INTO %1$s (%6$s,sys_period,exec_transaction_id) '
                    'SELECT %6$s, sys_period, txid  FROM updated_entries ue '
                    'RETURNING %5$s ',
                    history_table_name,
                    live_table_name,
                    time_source,
                    txid_current(),
                    pkey_column,
                    string_agg(quote_ident(c.column_name), ',')
                )
                FROM information_schema.columns c, pg_class pc
                WHERE pc.oid = live_table_name
                AND c.table_name = pc.relname
            );

            GET DIAGNOSTICS num_updated_rows = ROW_COUNT;

            IF num_updated_rows > 0 THEN
                RAISE NOTICE '% existing history entries required an update',
                    num_updated_rows;
            ELSE
                RAISE NOTICE 'No existing history entries required an update';
            END IF;
        ELSE
            RAISE NOTICE 'Synchronizing history information for table "%" '
                'without time column and with primary key "%"',
                live_table_name, pkey_column;

            -- If there is no time column available for this table, invalidate all
            -- history rows with a sys_period range that contains the current
            -- time stamp, but started before it. New (active) history rows
            -- will then be inserted for those newer live rows.
            time_source = 'current_timestamp';
            EXECUTE (
                SELECT format (
                    'WITH updated_entries AS ('
                        'UPDATE %1$s ht '
                        'SET sys_period = tstzrange(lower(ht.sys_period), %3$s) '
                        'FROM %2$s lt '
                        'WHERE ht.%7$s = lt.%7$s '
                        'AND (%6$s) ' -- Did live table change?
                        'AND ht.sys_period @> %3$s ' -- @> is "contains" operator
                        'RETURNING lt.*, tstzrange(%3$s, null) AS sys_period, %5$s AS txid '
                    ') '
                    'INSERT INTO %1$s (%4$s,sys_period,exec_transaction_id) '
                    'SELECT %4$s, sys_period, txid  FROM updated_entries ue '
                    'RETURNING %7$s ',
                    history_table_name,
                    live_table_name,
                    time_source,
                    string_agg(quote_ident(c.column_name), ','),
                    txid_current(),
                    string_agg('ht.' || quote_ident(c.column_name) || '<>' ||
                        'lt.' || quote_ident(c.column_name), ' OR '),
                    pkey_column
                )
                FROM information_schema.columns c, pg_class pc
                WHERE pc.oid = live_table_name
                AND c.table_name = pc.relname
            );

            GET DIAGNOSTICS num_updated_rows = ROW_COUNT;

            IF num_updated_rows > 0 THEN
                RAISE NOTICE '% existing history entries required an update',
                    num_updated_rows;
            ELSE
                RAISE NOTICE 'No existing history entries required an update';
            END IF;
        END IF;

        -- Insert all live rows that don't have an existing history entry yet.
        EXECUTE (
            SELECT format (
                'INSERT INTO %1$s (%5$s,sys_period,exec_transaction_id) '
                'SELECT %4$s, tstzrange(%3$s, null), %6$s '
                'FROM %2$s lt '
                'LEFT JOIN %1$s ht '
                'ON lt.%7$s = ht.%7$s '
                'WHERE ht.%7$s IS NULL',
                history_table_name,
                live_table_name,
                time_source,
                string_agg('lt.' || quote_ident(c.column_name), ','),
                string_agg(quote_ident(c.column_name), ','),
                txid_current(),
                pkey_column
            )
            FROM information_schema.columns c, pg_class pc
            WHERE pc.oid = live_table_name
            AND c.table_name = pc.relname
        );

        GET DIAGNOSTICS num_new_rows = ROW_COUNT;

        IF num_new_rows > 0 THEN
            RAISE NOTICE '% new live entries where added to the history',
                num_new_rows;
        ELSE
            RAISE NOTICE 'No new live entries where added to the history';
        END IF;

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

        -- Cascading deleting is used to delete parent tables and child tables in one go
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', history_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            history_table_update_trigger_name(live_table_name), live_table_name);

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
        history_trigger_name text;
    BEGIN
        IF NOT EXISTS(
            SELECT * FROM catmaid_live_table_triggers cltt
            WHERE cltt.live_table_name = $1 AND triggers_installed = true)
        THEN
            history_trigger_name = history_table_update_trigger_name(live_table_name);
            -- Sync history table with the live table, if requested.
            IF sync THEN
                RAISE NOTICE 'Syncing history for table "%" in history table "%"',
                    live_table_name, history_table_name;
                PERFORM sync_history_table($1, $2)
                FROM catmaid_history_table cht
                WHERE cht.live_table_name = $1
                AND cht.history_table_name = $2::name;
            END IF;

            EXECUTE(
                SELECT format(
                    'CREATE TRIGGER %I
                    AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW
                    EXECUTE PROCEDURE update_history_of_row(%s, %s, %s)',
                    history_trigger_name, cht.live_table_name, 'sys_period',
                    cht.history_table_name, cht.live_table_pkey_column)
                FROM catmaid_history_table cht
                WHERE cht.live_table_name = $1 AND cht.history_table_name = $2);

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
            history_table_update_trigger_name(live_table_name), live_table_name);
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


    -- History tables: update entry, coming from either a table insert,
    -- update or delete statement. For inserts, this will add the row to
    -- the history table and set its sys_period interval to [now, null).
    -- Updates will cause the currently valid history row with the same ID
    -- to be updated with a sys_period of [current_val, now] and add a new
    -- row. The following arguments are passed to this trigger function and
    -- are part of the TG_ARGV variable:
    -- sys_period_column, history_table_name regclass,live_table_pkey_column
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
            EXECUTE (
                SELECT format(
                    'UPDATE %I
                     SET %s = tstzrange(lower(sys_period), current_timestamp),
                         %s = txid_current()
                     WHERE %4$s=$1.%4$s
                     AND %2$s @> current_timestamp', -- @> is contains operator
                    TG_ARGV[1], TG_ARGV[0], 'exec_transaction_id', TG_ARGV[2])
            ) USING OLD;
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
    DROP VIEW IF EXISTS catmaid_live_table_triggers;
    DROP VIEW catmaid_inheriting_tables;
    DROP TABLE catmaid_history_table;
    DROP TABLE catmaid_transaction_info;
    DROP TYPE IF EXISTS history_change_type;
    DROP FUNCTION IF EXISTS create_history_table(live_table_schema text,
        live_table_name regclass, live_table_time_column text,
        live_table_pkey_column text, create_triggers boolean,
        copy_inheritance boolean, sync boolean);
    DROP FUNCTION IF EXISTS drop_history_table(live_table_name regclass);
    DROP FUNCTION IF EXISTS update_history_of_row();
    DROP FUNCTION IF EXISTS history_table_name(regclass);
    DROP FUNCTION IF EXISTS populate_history_table(text, regclass, regclass, text);
    DROP FUNCTION IF EXISTS sync_history_table(regclass, regclass);
    DROP FUNCTION IF EXISTS enable_history_tracking_for_table(live_table_name regclass, history_table_name text, sync boolean);
    DROP FUNCTION IF EXISTS disable_history_tracking_for_table(live_table_name regclass, history_table_name text);
    DROP FUNCTION IF EXISTS enable_history_tracking();
    DROP FUNCTION IF EXISTS disable_history_tracking();
    DROP FUNCTION IF EXISTS history_table_update_trigger_name(live_table_name regclass);
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
    SELECT create_history_table('public', t.name, t.time_column,
        {create_triggers}, true, false)
    FROM temp_versioned_catmaid_table t;
    SELECT create_history_table('public', t.name, NULL,
        {create_triggers}, true, false)
    FROM temp_versioned_non_catmaid_table t;
""".format(create_triggers='true' if history_tracking_enabled else 'false')

# This snipped is meant to be appended to the add_initial_history_tables_sql
# query, if history tables are initially in use.
populate_initial_history_tables_sql = """
    -- Populate history tables with current live table data. If a table is part
    -- of an inheritance hierarchy, only the current table is scanned and not its
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

if history_tracking_enabled:
    add_initial_history_tables_sql += populate_initial_history_tables_sql


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
