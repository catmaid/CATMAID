from django.db import migrations, models
import django.contrib.gis.db.models.fields


forward = """
    -- We rewrite the table from scratch, because all indices have to be
    -- rewritten anyway. This also allows us to regenerate all indices in one go
    -- and check all constraints also only once at the end. The new
    -- treenode_edge table is also ordered by skeleton_id, which should help
    -- with updates like rerooting and merges.
    --
    -- Note: this migration can be sped up if no replication is in place by
    -- setting `wal_level = minimal`, `archive_mode = off` and `max_wal_senders = 0`
    -- for Postgres. Also in case the fill factor should be changed, this is a
    -- good opportunity to do it, because the table is rewritten anyway.
    --
    -- To create the new version of the table and its indices in a new
    -- tablespace, set the default tablespace before running this migration:
    -- SET default_tablespace = '<tablespace-name>';

    ALTER TABLE treenode_edge
    RENAME TO treenode_edge_old;

    -- Create new treenode_edge table with ideal column alignment a fillfactor
    -- that allows some updates on the same pages.

    CREATE TABLE treenode_edge
    WITH (fillfactor = 85) AS
    SELECT t.id, t.parent_id, t.project_id, te.edge
    FROM treenode t
    JOIN treenode_edge_old te
        ON t.id = te.id;

    -- Remove old table

    DROP TABLE treenode_edge_old;

    -- Add constraints

    ALTER TABLE treenode_edge
    ALTER COLUMN id SET NOT NULL;

    ALTER TABLE treenode_edge
    ALTER COLUMN project_id SET NOT NULL;

    ALTER TABLE treenode_edge
    ALTER COLUMN project_id SET NOT NULL;

    ALTER TABLE treenode_edge
    ALTER COLUMN edge SET NOT NULL;

    ALTER TABLE treenode_edge
    ADD PRIMARY KEY (id);

    -- Recreate indices

    CREATE INDEX treenode_edge_2d_gist ON treenode_edge
        USING gist (edge);
    CREATE INDEX treenode_edge_gix ON treenode_edge
        USING gist (edge gist_geometry_ops_nd);
    CREATE INDEX treenode_edge_project_id_index ON treenode_edge
        USING btree (project_id);
    CREATE INDEX treenode_edge_z_range_gist ON treenode_edge
        USING gist (floatrange(st_zmin(edge::box3d), st_zmax(edge::box3d), '[]'::text));

    -- Update the edge refresh function.

    CREATE OR REPLACE FUNCTION refresh_skeleton_edges(skeleton_ids bigint[])
    RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN
         INSERT INTO treenode_edge (id, parent_id, project_id, edge)
         SELECT e.id, e.parent_id, e.project_id, e.edge
         FROM (
             SELECT DISTINCT ON (t.id) t.id, t.parent_id, t.project_id, ST_MakeLine(
                       ST_MakePoint(t.location_x, t.location_y, t.location_z),
                       ST_MakePoint(p.location_x, p.location_y, p.location_z))
             FROM treenode t
             JOIN UNNEST(skeleton_ids) query(skeleton_id)
                 ON query.skeleton_id = t.skeleton_id
             JOIN treenode p
                 ON p.id = t.parent_id OR (t.parent_id IS NULL AND t.id = p.id)
         ) e(id, parent_id, project_id, edge)
         ON CONFLICT (id) DO UPDATE
         SET project_id = EXCLUDED.project_id,
             edge = EXCLUDED.edge;

    END;
    $$;


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

    ANALYZE;
"""

backward = """
    CREATE OR REPLACE FUNCTION refresh_skeleton_edges(skeleton_ids bigint[])
    RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN
         INSERT INTO treenode_edge (id, project_id, edge)
         SELECT e.id, e.project_id, e.edge
         FROM (
             SELECT DISTINCT ON (t.id) t.id, t.project_id, ST_MakeLine(
                       ST_MakePoint(t.location_x, t.location_y, t.location_z),
                       ST_MakePoint(p.location_x, p.location_y, p.location_z))
             FROM treenode t
             JOIN UNNEST(skeleton_ids) query(skeleton_id)
                 ON query.skeleton_id = t.skeleton_id
             JOIN treenode p
                 ON p.id = t.parent_id OR (t.parent_id IS NULL AND t.id = p.id)
         ) e(id, project_id, edge)
         ON CONFLICT (id) DO UPDATE
         SET project_id = EXCLUDED.project_id,
             edge = EXCLUDED.edge;

    END;
    $$;

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
            SELECT c.id, c.project_id, c.skeleton_id, c.creation_time,
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
            INSERT INTO treenode_edge (id, project_id, edge)
            SELECT e.id, e.project_id, e.edge FROM new_edges e
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
            SET edge = ue.edge
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

    -- Dropping a column is quick and doesn't require a rewrite, but also won't
    -- reclaim space immediately. This should be okay for a backward migration.
    ALTER TABLE treenode_edge
    DROP COLUMN parent_id;

    ANALYZE;
"""


class Migration(migrations.Migration):
    """Add the parent_id of each treenode (or NULL for root nodes) to the
    treenode_edge table. This improves most query times significantly, because
    we can remove the JOIN to query the parent ID.
    """

    dependencies = [
        ('catmaid', '0081_add_more_skeleton_summary_indices'),
    ]

    operations = [
            migrations.RunSQL(forward, backward, [
                migrations.CreateModel(
                    name='TreenodeEdge',
                    fields=[
                        ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('edge', django.contrib.gis.db.models.fields.GeometryField(srid=0)),
                        ('parent', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.Treenode')),
                        ('project', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.Project')),
                    ],
                    options={
                        'db_table': 'treenode_edge',
                    },
                ),
            ]),
    ]
