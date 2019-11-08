from django.db import migrations


forward = """
    -- Re-create all triggers associated with history tracking on a particular
    -- live table (if it has a history table). This function has to be called
    -- after a live table was changed (e.g. a column was added or remove).
    CREATE OR REPLACE FUNCTION reload_history_tracking_for_table(live_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        PERFORM disable_history_tracking_for_table(cht.live_table, cht.history_table)
        FROM catmaid_history_table cht
        WHERE cht.live_table = $1;

        PERFORM enable_history_tracking_for_table(cht.live_table, cht.history_table)
        FROM catmaid_history_table cht
        WHERE cht.live_table = $1;
    END;
    $$;

    -- Also re-create all history update trigger code for consistency. This
    -- basically makes sure trigger functions will insert updatesd data in the
    -- regular column order. This doesn't make a performance difference, but it
    -- makes reading schema diffs easier.
    SELECT reload_history_tracking_for_table(live_table)
    FROM catmaid_history_table
    WHERE triggers_installed = TRUE;

    -- Recreate all history views
    SELECT create_history_view_for_table(live_table)
    FROM catmaid_history_table;
"""


backward = """
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
        FROM catmaid_history_tabl
        WHERE live_table = live_table;
    END;
    $$;

    -- Also re-create all history update trigger code for consistency. This
    -- basically makes sure trigger functions will insert updatesd data in the
    -- regular column order. This doesn't make a performance difference, but it
    -- makes reading schema diffs easier.
    WITH to_update AS (
        SELECT live_table, history_table
        FROM catmaid_history_table
        WHERE triggers_installed = true
    ), disabled AS (
        SELECT disable_history_tracking_for_table(live_table, history_table)
        FROM to_update
    )
    SELECT enable_history_tracking_for_table(live_table, history_table)
    FROM to_update;

    -- Recreate all history views
    SELECT create_history_view_for_table(live_table)
    FROM catmaid_history_table;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0091_fix_history_view_helper'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
