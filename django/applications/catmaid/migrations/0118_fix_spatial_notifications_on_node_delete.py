from django.db import migrations


forward = """
    -- Remove all deleted nodes and their contributed cable length from
    -- skeleton summary and delete the edge reference.
    CREATE OR REPLACE FUNCTION on_delete_treenode_update_summary_and_edges()
        RETURNS trigger
        LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Compute aggregated node count and cable length of deleted
        -- nodes per skeleton. Use this information to update summary.
        WITH skeleton_data AS (
            SELECT t.skeleton_id,
                t.project_id AS project_id,
                COUNT(*) AS num_nodes,
                SUM(ST_3DLength(e.edge)) AS length
            FROM deleted_treenode t
            JOIN treenode_edge e
                ON t.id = e.id
            JOIN LATERAL (
                SELECT notify_conditionally('catmaid.spatial-update', '{"project_id": ' ||
                    e.project_id || ', "type": "edge", "p1": [' ||
                    ST_X(ST_StartPoint(e.edge)) || ',' ||
                    ST_Y(ST_StartPoint(e.edge)) || ',' ||
                    ST_Z(ST_StartPoint(e.edge)) || '], "p2": [' ||
                    ST_X(ST_EndPoint(e.edge)) || ',' ||
                    ST_Y(ST_EndPoint(e.edge)) || ',' ||
                    ST_Z(ST_EndPoint(e.edge)) || ']}')
            ) notify
                ON TRUE
            GROUP BY t.skeleton_id, t.project_id
        ), skeletons_with_imported_nodes AS (
            SELECT sd.skeleton_id, num_imported_nodes
            FROM skeleton_data sd
            JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = sd.skeleton_id
            WHERE num_imported_nodes > 0
        ), imported_nodes AS (
            -- Count nodes that were originally imported from another
            -- project/instance, per old skeleton version.
            SELECT t.skeleton_id, COUNT(*) AS num_imported_nodes
            FROM deleted_treenode t
            JOIN skeletons_with_imported_nodes swin
                ON swin.skeleton_id = t.skeleton_id
            JOIN LATERAL (
                -- Get original transaction ID and creation time
                SELECT txid, edition_time
                FROM treenode__with_history th
                WHERE th.id = t.id
                ORDER BY edition_time ASC
                LIMIT 1
            ) t_origin
                ON TRUE
            JOIN catmaid_transaction_info cti
                ON cti.transaction_id = t_origin.txid
                    -- A transaction ID is only unique together with a date.
                    AND cti.execution_time = t_origin.edition_time
            WHERE cti.label = 'skeletons.import'
            GROUP BY t.skeleton_id
        )
        UPDATE catmaid_skeleton_summary s
        SET num_nodes = s.num_nodes - d.num_nodes,
            cable_length = s.cable_length - d.length,
            last_edition_time = now(),
            -- Try to get current user from transaction setting. Don't change it
            -- if no user is found, because we don't want to prevent deletion,
            -- but also don't have more information.
            last_editor_id = COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id),
            num_imported_nodes = s.num_imported_nodes - COALESCE(ins.num_imported_nodes, 0)
        FROM skeleton_data d
        LEFT JOIN imported_nodes ins
            ON ins.skeleton_id = d.skeleton_id
        WHERE d.skeleton_id = s.skeleton_id
        AND d.project_id = s.project_id;

        -- Delete existing edge
        DELETE FROM treenode_edge e
        USING deleted_treenode t
        WHERE t.id = e.id
        AND t.project_id = e.project_id;

        RETURN OLD;
    END;
    $$;
"""

backward = """
    -- Remove all deleted nodes and their contributed cable length from
    -- skeleton summary and delete the edge reference.
    CREATE OR REPLACE FUNCTION on_delete_treenode_update_summary_and_edges()
        RETURNS trigger
        LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Compute aggregated node count and cable length of deleted
        -- nodes per skeleton. Use this information to update summary.
        WITH skeleton_data AS (
            SELECT t.skeleton_id,
                t.project_id AS project_id,
                COUNT(*) AS num_nodes,
                SUM(ST_3DLength(e.edge)) AS length
            FROM deleted_treenode t
            JOIN treenode_edge e
                ON t.id = e.id
            GROUP BY t.skeleton_id, t.project_id
        ), skeletons_with_imported_nodes AS (
            SELECT sd.skeleton_id, num_imported_nodes
            FROM skeleton_data sd
            JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = sd.skeleton_id
            WHERE num_imported_nodes > 0
        ), imported_nodes AS (
            -- Count nodes that were originally imported from another
            -- project/instance, per old skeleton version.
            SELECT t.skeleton_id, COUNT(*) AS num_imported_nodes
            FROM deleted_treenode t
            JOIN skeletons_with_imported_nodes swin
                ON swin.skeleton_id = t.skeleton_id
            JOIN LATERAL (
                -- Get original transaction ID and creation time
                SELECT txid, edition_time
                FROM treenode__with_history th
                WHERE th.id = t.id
                ORDER BY edition_time ASC
                LIMIT 1
            ) t_origin
                ON TRUE
            JOIN catmaid_transaction_info cti
                ON cti.transaction_id = t_origin.txid
                    -- A transaction ID is only unique together with a date.
                    AND cti.execution_time = t_origin.edition_time
            WHERE cti.label = 'skeletons.import'
            GROUP BY t.skeleton_id
        ), notify AS (
            SELECT notify_conditionally('catmaid.spatial-update', '{"project_id": ' ||
                e.project_id || ', "type": "edge", "p1": [' ||
                ST_X(ST_StartPoint(e.edge)) || ',' ||
                ST_Y(ST_StartPoint(e.edge)) || ',' ||
                ST_Z(ST_StartPoint(e.edge)) || '], "p2": [' ||
                ST_X(ST_EndPoint(e.edge)) || ',' ||
                ST_Y(ST_EndPoint(e.edge)) || ',' ||
                ST_Z(ST_EndPoint(e.edge)) || ']}')
            FROM deleted_treenode t
            JOIN treenode_edge e
                ON t.id = e.id
        )
        UPDATE catmaid_skeleton_summary s
        SET num_nodes = s.num_nodes - d.num_nodes,
            cable_length = s.cable_length - d.length,
            last_edition_time = now(),
            -- Try to get current user from transaction setting. Don't change it
            -- if no user is found, because we don't want to prevent deletion,
            -- but also don't have more information.
            last_editor_id = COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id),
            num_imported_nodes = s.num_imported_nodes - COALESCE(ins.num_imported_nodes, 0)
        FROM skeleton_data d
        LEFT JOIN imported_nodes ins
            ON ins.skeleton_id = d.skeleton_id
        WHERE d.skeleton_id = s.skeleton_id
        AND d.project_id = s.project_id;

        -- Delete existing edge
        DELETE FROM treenode_edge e
        USING deleted_treenode t
        WHERE t.id = e.id
        AND t.project_id = e.project_id;

        RETURN OLD;
    END;
    $$;
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0117_update_json_field_types'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
