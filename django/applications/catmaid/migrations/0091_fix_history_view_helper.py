from django.db import migrations


forward = """
    CREATE OR REPLACE VIEW catmaid_table_info
    AS
        SELECT pc.oid AS rel_oid, pc.relname AS rel_name,
            pn.nspname AS rel_schema, c.column_name AS column_name,
            c.ordinal_position AS pos
        FROM information_schema.columns c, pg_class pc, pg_namespace pn
        WHERE c.table_name = pc.relname
        AND pn.oid = pc.relnamespace
        AND c.table_schema = pn.nspname
        ORDER BY pc.oid, c.ordinal_position ASC;


    -- A function to create a unified history and live table view.
    CREATE OR REPLACE FUNCTION create_history_view_for_table(live_table regclass)
        RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Make sure there is a history table
        IF NOT EXISTS(SELECT 1 FROM catmaid_history_table cht
                      WHERE cht.live_table = $1)
        THEN
            RAISE EXCEPTION 'Table % doesn''t have a history table', live_table;
        END IF;

        -- Drop existing view. Don't use CREATE OR REPLACE, because it only
        -- allows added columns, but no removed ones which might not work well
        -- with all table updates.
        EXECUTE format('DROP VIEW IF EXISTS %I', get_history_view_name(live_table));

        -- Create view that includes both live and history entries for a table.
        -- UNION ALL can be used, because we know live table and history tables
        -- have distinct rows.
        EXECUTE (
            SELECT format(
                'CREATE VIEW %1$s AS '
                '(SELECT %2$s FROM %3$s) '
                'UNION ALL '
                '(SELECT %2$s FROM %4$s) ',
                get_history_view_name(cht.live_table),
                string_agg(quote_ident(cti.column_name), ',' ORDER BY cti.pos ASC),
                cht.live_table,
                cht.history_table)
            FROM catmaid_history_table cht
            JOIN catmaid_table_info cti
                ON cht.live_table = cti.rel_oid
            WHERE cht.live_table = $1
            GROUP BY cht.live_table);
    END;
    $$;

    -- Recreate all history views
    SELECT create_history_view_for_table(live_table)
    FROM catmaid_history_table;
"""

backward = """
    DROP FUNCTION create_history_view_for_table(regclass);
    DROP VIEW catmaid_table_info;

    CREATE OR REPLACE VIEW catmaid_table_info
    AS
        SELECT pc.oid AS rel_oid, pc.relname AS rel_name,
            pn.nspname AS rel_schema, c.column_name AS column_name
        FROM information_schema.columns c, pg_class pc, pg_namespace pn
        WHERE c.table_name = pc.relname
        AND pn.oid = pc.relnamespace
        AND c.table_schema = pn.nspname;


    -- A function to create a unified history and live table view.
    CREATE OR REPLACE FUNCTION create_history_view_for_table(live_table regclass)
        RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Make sure there is a history table
        IF NOT EXISTS(SELECT 1 FROM catmaid_history_table cht
                      WHERE cht.live_table = $1)
        THEN
            RAISE EXCEPTION 'Table % doesn''t have a history table', live_table;
        END IF;

        -- Drop existing view. Don't use CREATE OR REPLACE, because it only
        -- allows added columns, but no removed ones which might not work well
        -- with all table updates.
        EXECUTE format('DROP VIEW IF EXISTS %I', get_history_view_name(live_table));

        -- Create view that includes both live and history entries for a table.
        -- UNION ALL can be used, because we know live table and history tables
        -- have distinct rows.
        EXECUTE (
            SELECT format(
                'CREATE VIEW %1$s AS '
                '(SELECT %2$s FROM %3$s) '
                'UNION ALL '
                '(SELECT %2$s FROM %4$s) ',
                get_history_view_name(cht.live_table),
                string_agg(quote_ident(cti.column_name), ','),
                cht.live_table,
                cht.history_table)
            FROM catmaid_history_table cht
            JOIN catmaid_table_info cti
                ON cht.live_table = cti.rel_oid
            WHERE cht.live_table = $1
            GROUP BY cht.live_table);
    END;
    $$;

    -- Recreate all history views
    SELECT create_history_view_for_table(live_table)
    FROM catmaid_history_table;
"""


class Migration(migrations.Migration):
    """This view obtains information on a table's columns. Since other views are
    created from this, it's column ordering should be inforced. This is done by
    using the column order defined in the table.
    """

    dependencies = [
        ('catmaid', '0090_fix_change_reques_ids'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
