# -*- coding: utf-8 -*-

from django.db import migrations
from django.conf import settings


disable_history_tracking = """
    SELECT disable_history_tracking();
"""

enable_history_tracking = """
    SELECT enable_history_tracking();
"""

forward = """
    -- Return the unquoted name of a live table's transaction ID regular update trigger.
    CREATE OR REPLACE FUNCTION get_history_txid_update_trigger_name_regular()
        RETURNS text AS
    $$
        SELECT 'on_change_update_history_txid_regular'::text;
    $$ LANGUAGE sql STABLE;

    -- Return the unquoted name of a live table's history table regular delete trigger.
    CREATE OR REPLACE FUNCTION get_history_delete_trigger_name_regular()
        RETURNS text AS
    $$
        SELECT 'on_delete_update_history_txid_regular'::text;
    $$ LANGUAGE sql STABLE;

    -- Return the unquoted name of a live table's history table regular update trigger.
    CREATE OR REPLACE FUNCTION get_history_txid_update_fn_name_regular(live_table_name regclass)
        RETURNS text AS
    $$
        SELECT 'update_history_txid_' || relname || '_reg' FROM pg_class WHERE oid = $1;
    $$ LANGUAGE sql STABLE;

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
                SELECT %6$s, tstzrange(LEAST(ot.%7$s, current_timestamp), current_timestamp), txid_current()
                FROM old_treenode ot;

                RETURN NULL;
            END;
            $FN$',
            history_update_fn_name,
            history_info.history_table,
            string_agg(quote_ident(cti.column_name), ','),
            'sys_period',
            'exec_transaction_id',
            string_agg('ot.' || quote_ident(cti.column_name), ','),
            history_info.time_column)
        FROM catmaid_table_info cti
        WHERE cti.rel_oid = history_info.live_table;
    END;
    $$;

    -- Create the trigger code for transaction ID updates. This is done in a separate
    -- function so that other parts of the history tracking system can run with
    -- different trigger parameters.
    CREATE OR REPLACE FUNCTION create_history_txid_update_trigger_code(history_update_fn_name text,
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
                -- Update current row
                NEW.%2$s = txid_current();
                RETURN NEW;
            END;
            $FN$',
            history_update_fn_name,
            history_info.txid_column);
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
        history_txid_update_fn_name text;
        history_trigger_name_regular text;
        history_del_trigger_name_regular text;
        history_txid_trigger_name_regular text;
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
                history_del_trigger_name_regular =
                    get_history_delete_trigger_name_regular();
                history_txid_trigger_name_regular =
                    get_history_txid_update_trigger_name_regular();

                history_update_fn_name =
                    get_history_update_fn_name_regular(live_table);
                history_txid_update_fn_name =
                    get_history_txid_update_fn_name_regular(live_table);

                -- History tables: update entry, coming from either a table update or
                -- delete statement. Both wil create a new history entry containing the old
                -- data along with the validity time range [old-time-column,
                -- current-timestamp). The time information is provided by the live table
                -- itself, it has to provide the time column.
                EXECUTE (
                    SELECT create_history_update_trigger_code(history_update_fn_name, history_info)
                );
                EXECUTE (
                    SELECT create_history_txid_update_trigger_code(history_txid_update_fn_name, history_info)
                );

                -- The history update trigger needs to run once per update or
                -- delete statement to move the changed/removed data to the history
                -- table. Since we need the old table for this, Postgres
                -- requires us to use an AFTER trigger.
                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER UPDATE ON %2$s '
                    'REFERENCING OLD TABLE as old_treenode '
                    'FOR EACH STATEMENT EXECUTE PROCEDURE %3$s()',
                    history_trigger_name_regular, history_info.live_table,
                    history_update_fn_name
                );
                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'AFTER DELETE ON %2$s '
                    'REFERENCING OLD TABLE as old_treenode '
                    'FOR EACH STATEMENT EXECUTE PROCEDURE %3$s()',
                    history_del_trigger_name_regular, history_info.live_table,
                    history_update_fn_name
                );
                -- The transaction ID trigger needs to be updated per row for
                -- each changed row, so that we can inject the new transacction
                -- ID. TODO: This can possibly be optimized by not using trigger
                -- functions for this.
                EXECUTE format(
                    'CREATE TRIGGER %1$I '
                    'BEFORE UPDATE ON %2$s '
                    'FOR EACH ROW EXECUTE PROCEDURE %3$s()',
                    history_txid_trigger_name_regular, history_info.live_table,
                    history_txid_update_fn_name
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
            get_history_delete_trigger_name_regular(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_txid_update_trigger_name_regular(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_tracking(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_truncate_trigger_name(), live_table);
        -- Remember that triggers are now removed for this table
        UPDATE catmaid_history_table cht SET triggers_installed = false
        WHERE cht.live_table = $1 AND cht.history_table = $2;
    END;
    $$;
"""

backward = """
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

    DROP FUNCTION create_history_txid_update_trigger_code(history_update_fn_name text,
            history_info catmaid_history_table);
    DROP FUNCTION get_history_txid_update_fn_name_regular(live_table_name regclass);
    DROP FUNCTION get_history_delete_trigger_name_regular();
    DROP FUNCTION get_history_txid_update_trigger_name_regular();
"""

class Migration(migrations.Migration):
    """This migration splits up the regular history update triggers into two
    separate trigger functions, both run BEFORE UPDATE OR DELETE, but one
    executed FOR EACH ROW (like now) and the other one executed FOR EACH
    STATEMENT. The goal is to improve performance with larger treenode tables
    (>100e6 nodes). The per row trigger will update the transaction ID of the
    modified data for updates and the per statement trigger will insert the
    changes into the history table.

    Splitting this logic into two functions is necessary, because statement
    level triggers can't modify the updated rows, which we need to store the
    modifying transaction's ID. More precisely, the Postgres manual says: "The
    return value of a row-level trigger fired AFTER or a statement-level trigger
    fired BEFORE or AFTER is always ignored; it might as well be null. However,
    any of these types of triggers might still abort the entire operation by
    raising an error."

    TODO This means for us: If we need to write the current txid to the new row,
    we can't do this with a statement level trigger. However, if we were to use
    Postgres 12, computed fields we might get around this.
    """

    dependencies = [
        ('catmaid', '0095_create_can_fork_permission'),
    ]

    operations = [
        migrations.RunSQL(disable_history_tracking, enable_history_tracking),
        migrations.RunSQL(forward, backward),
        migrations.RunSQL(enable_history_tracking, disable_history_tracking),
    ]
