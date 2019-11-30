from django.db import migrations, models
import django.contrib.gis.db.models.fields


forward_summary_update = """
    -- The summary table does not have a history table associated.
    -- Add num_imported_nodes column
    ALTER TABLE catmaid_skeleton_summary
    ADD COLUMN num_imported_nodes bigint;

    UPDATE catmaid_skeleton_summary
    SET num_imported_nodes = import_record.n_imported_nodes
    FROM (
        SELECT css.skeleton_id, sub.n_imported_nodes
        FROM  catmaid_skeleton_summary css
        JOIN LATERAL (
            SELECT COUNT(*) AS n_imported_nodes
            FROM treenode t
            JOIN LATERAL (
                -- Get original transaction ID and creation time
                SELECT txid, edition_time
                FROM treenode__with_history th
                WHERE th.id = t.id
                ORDER BY edition_time ASC
                LIMIT 1
            ) t_origin
                ON TRUE
            JOIN LATERAL (
                SELECT label
                FROM catmaid_transaction_info cti
                WHERE cti.transaction_id = t_origin.txid
                    -- Transaction ID wraparound match protection. A transaction
                    -- ID is only unique together with a date.
                    AND cti.execution_time = t_origin.edition_time
            ) t_origin_label
                ON t_origin_label.label = 'skeletons.import'
            WHERE t.skeleton_id = css.skeleton_id
        ) sub ON TRUE
    ) import_record(skeleton_id, n_imported_nodes)
    WHERE import_record.skeleton_id = catmaid_skeleton_summary.skeleton_id;

    ALTER TABLE catmaid_skeleton_summary
    ALTER COLUMN num_imported_nodes SET NOT NULL;

    ALTER TABLE catmaid_skeleton_summary
    ALTER COLUMN num_imported_nodes SET DEFAULT 0;

    -- Create B-tree index for new column.
    CREATE INDEX catmaid_skeleton_summary_num_imported_nodes_idx
        ON catmaid_skeleton_summary (num_imported_nodes);

    -- Update stats of changed table.
    ANALYZE catmaid_skeleton_summary;
"""

backward_summary_update = """
    ALTER TABLE catmaid_skeleton_summary
    DROP COLUMN num_imported_nodes;
"""

forward = """
    -- If a new node is inserted: add a new row to the summary table if
    -- inserted node has no parent. If this results in a conflict,
    -- increase node count of existing. Also send a NOTIFY event, in case there
    -- are interested listeners, channel 'catmaid.spatial-update' is used.
    CREATE OR REPLACE FUNCTION on_insert_treenode_update_summary_and_edges() RETURNS trigger
    LANGUAGE plpgsql AS
    $$
    BEGIN
        WITH new_edges AS (
            -- Compute new edges and collect some other needed information
            SELECT c.id, c.parent_id, c.project_id, c.skeleton_id, c.creation_time,
                c.edition_time, c.editor_id, ST_MakeLine(
                    ST_MakePoint(c.location_x, c.location_y, c.location_z),
                    ST_MakePoint(p.location_x, p.location_y, p.location_z)
                ) AS edge,
                -- Trigger event with edge information as JSON encoded payload.
                notify_conditionally('catmaid.spatial-update',
                    '{"project_id": ' || p.project_id || ', "type": "edge", "p1": [' ||
                    c.location_x || ',' || c.location_y || ',' || c.location_z || '], "p2": [' ||
                    p.location_x || ',' || p.location_y || ',' || p.location_z || ']}')
            FROM treenode p
            JOIN (
                SELECT * FROM inserted_treenode
                LIMIT (SELECT COUNT(*) FROM inserted_treenode)
            ) c
                ON (c.parent_id = p.id) OR (c.parent_id IS NULL AND c.id = p.id)
        ), edge_insert AS (
            -- Insert new edges into edge table
            INSERT INTO treenode_edge (id, parent_id, project_id, edge)
            SELECT e.id, e.parent_id, e.project_id, e.edge FROM new_edges e
        ), skeleton_data AS (
            -- Aggregate data over skeletons to prepare for summary update.
            SELECT skeleton_id, project_id,
                COUNT(*) AS num_nodes,
                SUM(ST_3DLength(edge)) AS length,
                MIN(creation_time) AS min_creation_time,
                MAX(edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, edge, creation_time, edition_time,
                    first_value(editor_id) OVER w AS last_editor_id
                FROM new_edges e
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY edition_time DESC)
            ) edge_info
            GROUP BY skeleton_id, project_id, last_editor_id
        )
        INSERT INTO catmaid_skeleton_summary (project_id, skeleton_id,
            last_summary_update, original_creation_time,
            last_edition_time, last_editor_id, num_nodes, cable_length,
            num_imported_nodes)
        (
            SELECT s.project_id, s.skeleton_id, now(), s.min_creation_time,
                s.max_edition_time,
                COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id),
                s.num_nodes, s.length,
                CASE WHEN tx_data.is_import_transaction THEN s.num_nodes ELSE 0 END AS num_imported_nodes
            FROM skeleton_data s, (
                SELECT EXISTS(SELECT 1 FROM catmaid_transaction_info
                    WHERE transaction_id = txid_current()
                    AND label = 'skeletons.import') AS is_import_transaction
            ) tx_data
        )
        ON CONFLICT (skeleton_id) DO UPDATE
        SET num_nodes = catmaid_skeleton_summary.num_nodes + EXCLUDED.num_nodes,
            last_summary_update = EXCLUDED.last_summary_update,
            original_creation_time = LEAST(
                catmaid_skeleton_summary.original_creation_time,
                EXCLUDED.original_creation_time),
            last_edition_time = GREATEST(
                catmaid_skeleton_summary.last_edition_time,
                EXCLUDED.last_edition_time),
            last_editor_id = EXCLUDED.last_editor_id,
            cable_length = catmaid_skeleton_summary.cable_length + EXCLUDED.cable_length,
            num_imported_nodes = catmaid_skeleton_summary.num_imported_nodes + EXCLUDED.num_imported_nodes;

        RETURN NEW;

    END;
    $$;

    -- Note that this trigger function relies in manu places on transition
    -- tables. Unfortunately, these come without statistics and we use a LIMIT
    -- clause to hint to the planner how many entries are in a transition table.
    -- And we find out how many entries are in there by counting them. This
    -- works surprisingly well.
    CREATE OR REPLACE FUNCTION on_edit_treenode_update_summary_and_edges() RETURNS trigger
    LANGUAGE plpgsql AS
    $$
    BEGIN
        WITH updated_parent_edge_data AS (
            -- Find all nodes that changed their position or parent
            SELECT t.id, t.project_id, t.skeleton_id, t.creation_time,
                t.edition_time, t.editor_id, ST_MakeLine(
                    ST_MakePoint(t.location_x, t.location_y, t.location_z),
                    ST_MakePoint(p.location_x, p.location_y, p.location_z)
                ) AS edge,
                t.parent_id,
                ot.edition_time as old_edition_time,
                ot.creation_time AS old_creation_time,
                ot.skeleton_id AS old_skeleton_id,
                -- Trigger event with information on changed edges (old and new)
                -- as JSON encoded payload.
                notify_conditionally('catmaid.spatial-update', '{"project_id": ' ||
                    t.project_id || ', "type": "edges", "edges": [[[' ||
                    t.location_x || ',' || t.location_y || ',' || t.location_z || '], [' ||
                    p.location_x || ',' || p.location_y || ',' || p.location_z || ']], [[' ||
                    ot.location_x || ',' || ot.location_y || ',' || ot.location_z || '], [' ||
                    p.location_x || ',' || p.location_y || ',' || p.location_z || ']]]}')
            FROM treenode p
            JOIN (
                    SELECT * FROM new_treenode
                    LIMIT (SELECT COUNT(*) FROM new_treenode)
                ) t
                ON (t.parent_id IS NOT NULL AND p.id = t.parent_id) OR
                    (t.parent_id IS NULL AND p.id = t.id)
            JOIN (
                    SELECT * FROM old_treenode
                    LIMIT (SELECT COUNT(*) FROM old_treenode)
                ) ot
                ON ot.id = t.id
            WHERE ot.parent_id IS DISTINCT FROM t.parent_id OR
               ot.location_x != t.location_x OR
               ot.location_y != t.location_y OR
               ot.location_z != t.location_z OR
               ot.skeleton_id != t.skeleton_id
        ), updated_child_edge_data AS (
            -- Find all unseen child nodes of the nodes with a changed
            -- edge using an anti join.
            SELECT c.id, c.project_id, c.skeleton_id, c.creation_time,
                c.edition_time, c.editor_id, ST_MakeLine(
                    ST_MakePoint(c.location_x, c.location_y, c.location_z),
                    ST_MakePoint(e.location_x, e.location_y, e.location_z)
                ) AS edge,
                c.parent_id,
                c.edition_time AS old_edition_time,
                c.creation_time AS old_creation_time,
                c.skeleton_id AS old_skeleton_id,
                -- Trigger event with edge information as JSON encoded payload.
                notify_conditionally('catmaid.spatial-update', '{"project_id": ' ||
                e.project_id || ', "type": "edges", "edges": [[[' ||
                    c.location_x || ',' || c.location_y || ',' || c.location_z || '], [' ||
                    e.location_x || ',' || e.location_y || ',' || e.location_z || ']], [[' ||
                    c.location_x || ',' || c.location_y || ',' || c.location_z || '], [' ||
                    ot.location_x || ',' || ot.location_y || ',' || ot.location_z || ']]]}')
            FROM treenode c
            JOIN (
                SELECT * FROM old_treenode
                LIMIT (SELECT COUNT(*) FROM old_treenode)
            ) ot
                ON ot.id = c.parent_id
            JOIN (
                SELECT * FROM new_treenode
                LIMIT (SELECT COUNT(*) FROM new_treenode)
            ) e
                ON c.parent_id = e.id
            LEFT JOIN (
                SELECT * FROM new_treenode
                LIMIT (SELECT COUNT(*) FROM new_treenode)
            ) c2
                ON c.id = c2.id
            WHERE c2.id IS NULL
        ), updated_edge_data AS (
            -- Combine all directly changed nodes with a changed
            -- location as well as the extra child nodes where the
            -- parent changed location. The limit is needed to indicate
            -- to the planner an upper limit of this CTE. This is
            -- unfortunately needed, because no real estimates are done
            -- on CTEs and no actual stats are used. This leads to
            -- unfortunate join plans in the updated_edge CTE.
            (SELECT *
            FROM updated_parent_edge_data
            LIMIT (SELECT COUNT(*) FROM updated_parent_edge_data))
            UNION ALL
            (SELECT *
            FROM updated_child_edge_data
            LIMIT (SELECT COUNT(*) FROM updated_child_edge_data))
        ), old_edge AS (
            -- Get all old edges of changed nodes as well as their
            -- children (if any). Child edges contribute to the cable
            -- length as well and need to be updated.
            SELECT t.id, t.project_id, t.old_skeleton_id AS skeleton_id,
                t.old_creation_time AS creation_time,
                t.old_edition_time AS edition_time,
                e.edge,
                t.editor_id
            FROM updated_edge_data t
            JOIN treenode_edge e
                ON e.id = t.id
        ), updated_edge AS (
            -- Update all changed edges. To have this join work fast, we
            -- rely on reasonable statistics on the row count of
            -- updated_edge_data. This is provided, by setting (obivious)
            -- limits on its size when creating it.
            UPDATE treenode_edge e
            SET edge = ue.edge, parent_id = ue.parent_id
            FROM updated_edge_data ue
            WHERE e.id = ue.id
            RETURNING e.id
        ), new_edge AS (
            -- Collect changed nodes both with and without location
            -- change. Updated edge information takes precedence.
            SELECT ue.id, ue.project_id, ue.skeleton_id,
                ue.creation_time, ue.edition_time, ue.edge, ue.editor_id
            FROM updated_edge_data ue
            UNION ALL
            SELECT nt.id, nt.project_id, nt.skeleton_id,
                nt.creation_time, nt.edition_time, oe.edge, nt.editor_id
            FROM (
                SELECT * FROM new_treenode
                LIMIT (SELECT COUNT(*) FROM new_treenode)
            ) nt
            LEFT JOIN updated_edge_data ue
                ON nt.id = ue.id
            JOIN old_edge oe
                ON nt.id = oe.id
            WHERE ue.id IS NULL
        ), old_skeleton_data AS (
            -- Aggregate data over old skeleton datas to delete for summary.
            SELECT skeleton_id, project_id,
                -COUNT(*) AS num_nodes,
                -SUM(ST_3DLength(edge)) AS length,
                MIN(creation_time) AS min_creation_time,
                MAX(edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, edge, creation_time, edition_time,
                    first_value(editor_id) OVER w AS last_editor_id
                FROM old_edge
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY edition_time DESC)
            ) edge_info
            GROUP BY skeleton_id, project_id, last_editor_id
        ), new_skeleton_data AS (
            -- Aggregate data over skeletons to prepare for summary update.
            SELECT skeleton_id, project_id,
                COUNT(*) AS num_nodes,
                SUM(ST_3DLength(edge)) AS length,
                MIN(creation_time) AS min_creation_time,
                MAX(edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, edge, creation_time, edition_time,
                    first_value(editor_id) OVER w AS last_editor_id
                FROM new_edge
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY edition_time DESC)
            ) edge_info
            GROUP BY skeleton_id, project_id, last_editor_id
        ), old_skeletons_with_imported_nodes AS (
            SELECT osd.skeleton_id, num_imported_nodes
            FROM old_skeleton_data osd
            JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = osd.skeleton_id
            WHERE num_imported_nodes > 0
        ), imported_nodes AS (
            -- Count nodes that were originally imported from another
            -- project/instance, per old skeleton version.
            SELECT t.id, t.skeleton_id AS old_skeleton_id
            FROM old_treenode t
            JOIN old_skeletons_with_imported_nodes oswin
                ON oswin.skeleton_id = t.skeleton_id
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
                    -- A transaction ID is only unique with a date.
                    AND cti.execution_time = t_origin.edition_time
            WHERE cti.label = 'skeletons.import'
        ), old_imported_nodes AS (
            -- Count nodes that were originally imported from another
            -- project/instance, per old skeleton version.
            SELECT ins.old_skeleton_id AS skeleton_id, COUNT(*) AS num_imported_nodes
            FROM imported_nodes ins
            GROUP BY ins.old_skeleton_id
        ), new_imported_nodes AS (
            -- Count nodes that were originally imported from another
            -- project/instance, per old skeleton version. It is okay to
            -- use the old skeleton here, because the fact whether a node
            -- was imported, will not change between new/old.
            SELECT nt.skeleton_id, COUNT(*) AS num_imported_nodes
            FROM imported_nodes ins
            JOIN new_treenode nt
                ON nt.id = ins.id
            GROUP BY nt.skeleton_id
        ), summary_update_delta AS (
            SELECT skeleton_id, project_id,
                SUM(num_nodes) AS num_nodes,
                SUM(length) AS length,
                MIN(min_creation_time) AS min_creation_time,
                MAX(max_edition_time) AS max_edition_time,
                last_editor_id,
                SUM(num_imported_nodes) AS num_imported_nodes
            FROM (
                SELECT skeleton_id, project_id, num_nodes, length,
                    min_creation_time, max_edition_time,
                    first_value(last_editor_id) OVER w AS last_editor_id,
                    COALESCE(num_imported_nodes, 0) AS num_imported_nodes
                FROM (
                    (
                        SELECT os.skeleton_id, os.project_id, os.num_nodes,
                            os.length, os.min_creation_time, os.max_edition_time,
                            os.last_editor_id, -1 * ins.num_imported_nodes AS num_imported_nodes
                        FROM old_skeleton_data os
                        LEFT JOIN old_imported_nodes ins
                            ON ins.skeleton_id = os.skeleton_id
                    )
                    UNION ALL
                    (
                        SELECT ns.skeleton_id, ns.project_id, ns.num_nodes,
                            ns.length, ns.min_creation_time, ns.max_edition_time,
                            ns.last_editor_id, ins.num_imported_nodes
                        FROM new_skeleton_data ns
                        LEFT JOIN new_imported_nodes ins
                            ON ins.skeleton_id = ns.skeleton_id
                    )
                ) _update_data
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY max_edition_time DESC)
            ) update_data
            GROUP BY skeleton_id, project_id, last_editor_id
        )
        INSERT INTO catmaid_skeleton_summary (project_id, skeleton_id,
            last_summary_update, original_creation_time,
            last_edition_time, last_editor_id, num_nodes, cable_length,
            num_imported_nodes)
        (
            SELECT s.project_id, s.skeleton_id, now(), s.min_creation_time,
                s.max_edition_time,
                COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id),
                s.num_nodes, s.length, s.num_imported_nodes
            FROM summary_update_delta s
        )
        ON CONFLICT (skeleton_id) DO UPDATE
        SET num_nodes = catmaid_skeleton_summary.num_nodes + EXCLUDED.num_nodes,
            last_summary_update = EXCLUDED.last_summary_update,
            last_edition_time = GREATEST(
                catmaid_skeleton_summary.last_edition_time,
                EXCLUDED.last_edition_time),
            last_editor_id = EXCLUDED.last_editor_id,
            cable_length = catmaid_skeleton_summary.cable_length + EXCLUDED.cable_length,
            num_imported_nodes = catmaid_skeleton_summary.num_imported_nodes + EXCLUDED.num_imported_nodes;

        RETURN NEW;
    END;
    $$;


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

backward = """
    -- If a new node is inserted: add a new row to the summary table if
    -- inserted node has no parent. If this results in a conflict,
    -- increase node count of existing. Also send a NOTIFY event, in case there
    -- are interested listeners, channel 'catmaid.spatial-update' is used.
    CREATE OR REPLACE FUNCTION on_insert_treenode_update_summary_and_edges() RETURNS trigger
    LANGUAGE plpgsql AS
    $$
    BEGIN
        WITH new_edges AS (
            -- Compute new edges and collect some other needed information
            SELECT c.id, c.parent_id, c.project_id, c.skeleton_id, c.creation_time,
                c.edition_time, c.editor_id, ST_MakeLine(
                    ST_MakePoint(c.location_x, c.location_y, c.location_z),
                    ST_MakePoint(p.location_x, p.location_y, p.location_z)
                ) AS edge,
                -- Trigger event with edge information as JSON encoded payload.
                notify_conditionally('catmaid.spatial-update',
                    '{"project_id": ' || p.project_id || ', "type": "edge", "p1": [' ||
                    c.location_x || ',' || c.location_y || ',' || c.location_z || '], "p2": [' ||
                    p.location_x || ',' || p.location_y || ',' || p.location_z || ']}')
            FROM inserted_treenode c JOIN treenode p ON
                (c.parent_id = p.id) OR (c.parent_id IS NULL AND c.id = p.id)
        ), edge_insert AS (
            -- Insert new edges into edge table
            INSERT INTO treenode_edge (id, parent_id, project_id, edge)
            SELECT e.id, e.parent_id, e.project_id, e.edge FROM new_edges e
        ), skeleton_data AS (
            -- Aggregate data over skeletons to prepare for summary update.
            SELECT skeleton_id, project_id,
                COUNT(*) AS num_nodes,
                SUM(ST_3DLength(edge)) AS length,
                MIN(creation_time) AS min_creation_time,
                MAX(edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, edge, creation_time, edition_time,
                    first_value(editor_id) OVER w AS last_editor_id
                FROM new_edges e
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY edition_time DESC)
            ) edge_info
            GROUP BY skeleton_id, project_id, last_editor_id
        )
        INSERT INTO catmaid_skeleton_summary (project_id, skeleton_id,
            last_summary_update, original_creation_time,
            last_edition_time, last_editor_id, num_nodes, cable_length)
        (
            SELECT s.project_id, s.skeleton_id, now(), s.min_creation_time,
                s.max_edition_time,
                COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id),
                s.num_nodes, s.length
            FROM skeleton_data s
        )
        ON CONFLICT (skeleton_id) DO UPDATE
        SET num_nodes = catmaid_skeleton_summary.num_nodes + EXCLUDED.num_nodes,
            last_summary_update = EXCLUDED.last_summary_update,
            original_creation_time = LEAST(
                catmaid_skeleton_summary.original_creation_time,
                EXCLUDED.original_creation_time),
            last_edition_time = GREATEST(
                catmaid_skeleton_summary.last_edition_time,
                EXCLUDED.last_edition_time),
            last_editor_id = EXCLUDED.last_editor_id,
            cable_length = catmaid_skeleton_summary.cable_length + EXCLUDED.cable_length;

        RETURN NEW;

    END;
    $$;

    CREATE OR REPLACE FUNCTION on_edit_treenode_update_summary_and_edges() RETURNS trigger
    LANGUAGE plpgsql AS
    $$
    BEGIN
        WITH updated_parent_edge_data AS (
            -- Find all nodes that changed their position or parent
            SELECT t.id, t.project_id, t.skeleton_id, t.creation_time,
                t.edition_time, t.editor_id, ST_MakeLine(
                    ST_MakePoint(t.location_x, t.location_y, t.location_z),
                    ST_MakePoint(p.location_x, p.location_y, p.location_z)
                ) AS edge,
                t.parent_id,
                ot.edition_time as old_edition_time,
                ot.creation_time AS old_creation_time,
                ot.skeleton_id AS old_skeleton_id,
                -- Trigger event with information on changed edges (old and new)
                -- as JSON encoded payload.
                notify_conditionally('catmaid.spatial-update', '{"project_id": ' ||
                    t.project_id || ', "type": "edges", "edges": [[[' ||
                    t.location_x || ',' || t.location_y || ',' || t.location_z || '], [' ||
                    p.location_x || ',' || p.location_y || ',' || p.location_z ||
                    ']], [[' ||
                    ot.location_x || ',' || ot.location_y || ',' || ot.location_z || '], [' ||
                    p.location_x || ',' || p.location_y || ',' || p.location_z || ']]]}')
            FROM new_treenode t
            JOIN old_treenode ot
                ON t.id = ot.id
            JOIN treenode p
                ON (t.parent_id IS NOT NULL AND p.id = t.parent_id) OR
                   (t.parent_id IS NULL AND p.id = t.id)
            WHERE ot.parent_id IS DISTINCT FROM t.parent_id OR
               ot.location_x != t.location_x OR
               ot.location_y != t.location_y OR
               ot.location_z != t.location_z OR
               ot.skeleton_id != t.skeleton_id
        ), updated_child_edge_data AS (
            -- Find all unseen child nodes of the nodes with a changed
            -- edge using an anti join.
            SELECT c.id, c.project_id, c.skeleton_id, c.creation_time,
                c.edition_time, c.editor_id, ST_MakeLine(
                    ST_MakePoint(c.location_x, c.location_y, c.location_z),
                    ST_MakePoint(e.location_x, e.location_y, e.location_z)
                ) AS edge,
                c.parent_id,
                c.edition_time AS old_edition_time,
                c.creation_time AS old_creation_time,
                c.skeleton_id AS old_skeleton_id,
                -- Trigger event with edge information as JSON encoded payload.
                notify_conditionally('catmaid.spatial-update', '{"project_id": ' ||
                e.project_id || ', "type": "edges", "edges": [[[' ||
                    c.location_x || ',' || c.location_y || ',' || c.location_z || '], [' ||
                    e.location_x || ',' || e.location_y || ',' || e.location_z ||
                    ']], [[' ||
                    c.location_x || ',' || c.location_y || ',' || c.location_z || '], [' ||
                    ot.location_x || ',' || ot.location_y || ',' || ot.location_z || ']]]}')
            FROM treenode c
            JOIN old_treenode ot
                ON ot.id = c.parent_id
            JOIN new_treenode e
                ON c.parent_id = e.id
            LEFT JOIN new_treenode c2
                ON c.id = c2.id
            WHERE c2.id IS NULL
        ), updated_edge_data AS (
            -- Combine all directly changed nodes with a changed
            -- location as well as the extra child nodes where the
            -- parent changed location. The limit is needed to indicate
            -- to the planner an upper limit of this CTE. This is
            -- unfortunately needed, because no real estimates are done
            -- on CTEs and no actual stats are used. This leads to
            -- unfortunate join plans in the updated_edge CTE.
            (SELECT *
            FROM updated_parent_edge_data
            LIMIT (SELECT COUNT(*) FROM updated_parent_edge_data))
            UNION ALL
            (SELECT *
            FROM updated_child_edge_data
            LIMIT (SELECT COUNT(*) FROM updated_child_edge_data))
        ), old_edge AS (
            -- Get all old edges of changed nodes as well as their
            -- children (if any). Child edges contribute to the cable
            -- length as well and need to be updated.
            SELECT t.id, t.project_id, t.old_skeleton_id AS skeleton_id,
                t.old_creation_time AS creation_time,
                t.old_edition_time AS edition_time,
                e.edge,
                t.editor_id
            FROM updated_edge_data t
            JOIN treenode_edge e
                ON e.id = t.id
        ), updated_edge AS (
            -- Update all changed edges. To have this join work fast, we
            -- rely on reasonable statistics on the row count of
            -- updated_edge_data. This is provided, by setting (obivious)
            -- limits on its size when creating it.
            UPDATE treenode_edge e
            SET edge = ue.edge, parent_id = ue.parent_id
            FROM updated_edge_data ue
            WHERE e.id = ue.id
            RETURNING e.id
        ), new_edge AS (
            -- Collect changed nodes both with and without location
            -- change. Updated edge information takes precedence.
            SELECT ue.id, ue.project_id, ue.skeleton_id,
                ue.creation_time, ue.edition_time, ue.edge, ue.editor_id
            FROM updated_edge_data ue
            UNION ALL
            SELECT nt.id, nt.project_id, nt.skeleton_id,
                nt.creation_time, nt.edition_time, oe.edge, nt.editor_id
            FROM new_treenode nt
            LEFT JOIN updated_edge_data ue
                ON nt.id = ue.id
            JOIN old_edge oe
                ON nt.id = oe.id
            WHERE ue.id IS NULL
        ), old_skeleton_data AS (
            -- Aggregate data over old skeleton datas to delete for summary.
            SELECT skeleton_id, project_id,
                -COUNT(*) AS num_nodes,
                -SUM(ST_3DLength(edge)) AS length,
                MIN(creation_time) AS min_creation_time,
                MAX(edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, edge, creation_time, edition_time,
                    first_value(editor_id) OVER w AS last_editor_id
                FROM old_edge
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY edition_time DESC)
            ) edge_info
            GROUP BY skeleton_id, project_id, last_editor_id
        ), new_skeleton_data AS (
            -- Aggregate data over skeletons to prepare for summary update.
            SELECT skeleton_id, project_id,
                COUNT(*) AS num_nodes,
                SUM(ST_3DLength(edge)) AS length,
                MIN(creation_time) AS min_creation_time,
                MAX(edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, edge, creation_time, edition_time,
                    first_value(editor_id) OVER w AS last_editor_id
                FROM new_edge
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY edition_time DESC)
            ) edge_info
            GROUP BY skeleton_id, project_id, last_editor_id
        ), summary_update_delta AS (
            SELECT skeleton_id, project_id,
                SUM(num_nodes) AS num_nodes,
                SUM(length) AS length,
                MIN(min_creation_time) AS min_creation_time,
                MAX(max_edition_time) AS max_edition_time,
                last_editor_id
            FROM (
                SELECT skeleton_id, project_id, num_nodes, length,
                    min_creation_time, max_edition_time,
                    first_value(last_editor_id) OVER w AS last_editor_id
                FROM (
                    SELECT os.skeleton_id, os.project_id, os.num_nodes,
                        os.length, os.min_creation_time, os.max_edition_time,
                        os.last_editor_id
                    FROM old_skeleton_data os
                    UNION ALL
                    SELECT ns.skeleton_id, ns.project_id, ns.num_nodes,
                        ns.length, ns.min_creation_time, ns.max_edition_time,
                        ns.last_editor_id
                    FROM new_skeleton_data ns
                ) _update_data
                WINDOW w AS (PARTITION BY skeleton_id, project_id ORDER BY max_edition_time DESC)
            ) update_data
            GROUP BY skeleton_id, project_id, last_editor_id
        )
        INSERT INTO catmaid_skeleton_summary (project_id, skeleton_id,
            last_summary_update, original_creation_time,
            last_edition_time, last_editor_id, num_nodes, cable_length)
        (
            SELECT s.project_id, s.skeleton_id, now(), s.min_creation_time,
                s.max_edition_time,
                COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id),
                s.num_nodes, s.length
            FROM summary_update_delta s
        )
        ON CONFLICT (skeleton_id) DO UPDATE
        SET num_nodes = catmaid_skeleton_summary.num_nodes + EXCLUDED.num_nodes,
            last_summary_update = EXCLUDED.last_summary_update,
            last_edition_time = GREATEST(
                catmaid_skeleton_summary.last_edition_time,
                EXCLUDED.last_edition_time),
            last_editor_id = EXCLUDED.last_editor_id,
            cable_length = catmaid_skeleton_summary.cable_length + EXCLUDED.cable_length;

        RETURN NEW;
    END;
    $$;


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
            last_editor_id = COALESCE(NULLIF(current_setting('catmaid.user_id', TRUE), '')::integer, s.last_editor_id)
        FROM skeleton_data d
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
        ('catmaid', '0096_optimize_history_tracking'),
    ]

    operations = [
        migrations.RunSQL(forward_summary_update, backward_summary_update, [
            migrations.AddField(
                model_name='skeletonsummary',
                name='num_imported_nodes',
                field=models.IntegerField(default=0),
            ),
        ]),
        migrations.RunSQL(forward, backward),
    ]
