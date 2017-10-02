# -*- coding: utf-8 -*-

import django.utils.timezone

from django.conf import settings
import django.contrib.postgres.fields.jsonb
from django.db import migrations, models
import django.db.models.deletion

forward = """
  -- Create table that represents a 3D grid in project space.
  CREATE TABLE node_grid_cache (
    id serial PRIMARY KEY,
    project_id integer REFERENCES project (id) ON DELETE CASCADE,
    orientation integer DEFAULT 0 NOT NULL,
    cell_width bigint,
    cell_height bigint,
    cell_depth bigint,
    n_largest_skeletons_limit integer,
    n_last_edited_skeletons_limit integer,
    -- Data is organized in an array that consists of `n_lod_levels` buckets.
    -- These buckets can be used to configure level of detail (LOD), which in
    -- turn can be used by node queries to speed up data retrieval. By default,
    -- there is only one bucket, i.e. no actual LOD lookup is performed. If set
    -- to 2, the first array item will contain `lod_min_bucket_size` nodes and the
    -- second one all the rest.
    n_lod_levels int DEFAULT 1 NOT NULL,
    -- The LOD cutoff is used as a starting value for LOD bucket sizes and is
    -- essentially the minimum bucket size of first data array entry. If there
    -- only one LOD level, all other nodes are contained in this bucket as well.
    lod_min_bucket_size int DEFAULT 500 NOT NULL,
    -- In 'linear' strategy, the first LOD bucket has the size of
    -- `lod_min_bucket_size`. The second one twice this size and so on until the
    -- last bucket contains all remaining nodes (which can be filtered with
    -- other settings. In `quadratic` mode the n-th bucket will have a size of
    -- `lod_min_bucket_size^n`.
    lod_strategy text DEFAULT 'linear' NOT NULL,
    hidden_last_editor_id integer REFERENCES auth_user (id) ON DELETE SET NULL,
    allow_empty boolean DEFAULT FALSE NOT NULL,
    has_json_data boolean DEFAULT FALSE NOT NULL,
    has_json_text_data boolean DEFAULT FALSE NOT NULL,
    has_msgpack_data boolean DEFAULT FALSE NOT NULL,
    enabled boolean DEFAULT TRUE NOT NULL,
    UNIQUE (project_id, orientation, cell_width, cell_height, cell_depth)
  );

  ALTER TABLE node_grid_cache ADD CONSTRAINT check_valid_lod_strategy
      CHECK (lod_strategy IN ('linear', 'quadratic', 'exponential'));

  -- Add table for individual grid cells. Technically, there is no need to store
  -- the bounding box, but it makes some queries easier and for now we don't
  -- expect a huge set of cells. Data is stored as level-of-detail (LOD) lists.
  -- The grid cache defines how many LOD levels there are, i.e. how many array
  -- elements each data entry has. The first element is the most detailed one, the
  -- the last element is the most corse one. Data of individual levels is
  -- supposed to add up. If a grid cache has four zoom levels, and the client
  -- requests all data for LOD level 2, all entries from the second array entry
  -- to the last entry have to be retrieved as a union. If all entries (= zoom
  -- level 1) should be returned, all array elements will be returned as a
  -- union.
  CREATE TABLE node_grid_cache_cell (
    id bigserial PRIMARY KEY,
    grid_id integer REFERENCES node_grid_cache (id) ON DELETE CASCADE,
    x_index integer NOT NULL,
    y_index integer NOT NULL,
    z_index integer NOT NULL,
    update_time timestamp with time zone DEFAULT now() NOT NULL,
    msgpack_data bytea[],
    json_data jsonb[],
    json_text_data text[],
    UNIQUE (grid_id, x_index, y_index, z_index)
  );

  -- A separate table keeps track of dirty cells that need to be updated. This
  -- This is done separately from the cells table to not require too much locking
  -- on the main table during updates.
  CREATE TABLE dirty_node_grid_cache_cell (
    id bigserial PRIMARY KEY,
    -- grid_cell_id bigint REFERENCES node_grid_cache_cell (id) ON DELETE CASCADE,
    grid_id integer REFERENCES node_grid_cache (id) ON DELETE CASCADE,
    x_index integer NOT NULL,
    y_index integer NOT NULL,
    z_index integer NOT NULL,
    invalidation_time timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (grid_id, x_index, y_index, z_index)
  );

  -- If a new cell is marked dirty, emit the signal "catmaid.dirty-cache".
  CREATE OR REPLACE FUNCTION on_update_dirty_node_grid_cache_cell() RETURNS trigger
  LANGUAGE plpgsql AS
  $$
  BEGIN
      -- Trigger event with edge information as JSON encoded payload.
      PERFORM notify_conditionally('catmaid.dirty-cache', '{"grid_id": ' || NEW.grid_id ||
          ', "x": ' || NEW.x_index || ', "y": ' || NEW.y_index ||
          ', "z": ' || NEW.z_index || '}');

      RETURN NEW;
  END;
  $$;

  CREATE TRIGGER on_insert_dirty_node_grid_cache_cell_tgr
  AFTER INSERT ON dirty_node_grid_cache_cell
  FOR EACH ROW EXECUTE PROCEDURE on_update_dirty_node_grid_cache_cell();

  CREATE TRIGGER on_update_dirty_node_grid_cache_cell_tgr
  AFTER UPDATE ON dirty_node_grid_cache_cell
  FOR EACH ROW EXECUTE PROCEDURE on_update_dirty_node_grid_cache_cell();

  -- Add some indices, B-Tree is more useful here than e.g. BRIN, the extra
  -- storage needed is justified by the performance improvements.
  CREATE INDEX node_grid_cache_cell_x_index_idx ON node_grid_cache_cell (x_index);
  CREATE INDEX node_grid_cache_cell_y_index_idx ON node_grid_cache_cell (y_index);
  CREATE INDEX node_grid_cache_cell_z_index_idx ON node_grid_cache_cell (z_index);

  CREATE INDEX dirty_node_grid_cache_cell_x_index_idx ON dirty_node_grid_cache_cell (x_index);
  CREATE INDEX dirty_node_grid_cache_cell_y_index_idx ON dirty_node_grid_cache_cell (y_index);
  CREATE INDEX dirty_node_grid_cache_cell_z_index_idx ON dirty_node_grid_cache_cell (z_index);

  CREATE OR REPLACE FUNCTION enable_spatial_update_events() RETURNS void
  LANGUAGE plpgsql AS
  $$
  BEGIN
      CREATE OR REPLACE FUNCTION notify_conditionally(channel text, payload text) RETURNS int
      LANGUAGE plpgsql AS
      $inner$
      BEGIN
          PERFORM pg_notify(channel, payload);
          RETURN 0;
      END;
      $inner$;
  END;
  $$;

  CREATE OR REPLACE FUNCTION disable_spatial_update_events() RETURNS void
  LANGUAGE plpgsql AS
  $$
  BEGIN
      CREATE OR REPLACE FUNCTION notify_conditionally(channel text, payload text) RETURNS int
      LANGUAGE plpgsql AS
      $inner$
      BEGIN
          PERFORM 1 WHERE 1 = 0;
          RETURN 0;
      END;
      $inner$;
  END;
  $$;

  -- Disable spatial update events by default.
  SELECT disable_spatial_update_events();

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
      -- Transition tables (old_treenode and new_treenode) can only be
      -- read once per statement. This is why we select them
      -- completely into a CTE. With Postgres 10.4 this can be replaced
      -- by direct transition table access, because it fixes the bug
      -- causing the current behavior.
      WITH old_treenode_data AS (
          SELECT * FROM old_treenode
      ), new_treenode_data AS (
          SELECT * FROM new_treenode
      ), updated_parent_edge_data AS (
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
          FROM new_treenode_data t
          JOIN old_treenode_data ot
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
          JOIN old_treenode_data ot
              ON ot.id = c.parent_id
          JOIN new_treenode_data e
              ON c.parent_id = e.id
          LEFT JOIN new_treenode_data c2
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
          FROM new_treenode_data nt
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


  CREATE OR REPLACE FUNCTION on_delete_connector_update_geom() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      DELETE FROM connector_geom
          WHERE id = OLD.id;

      PERFORM notify_conditionally('catmaid.spatial-update', '{"project_id": ' || OLD.project_id || ', "type": "point", "p": [' ||
          OLD.location_x || ',' || OLD.location_y || ',' || OLD.location_z || ']}');

      RETURN OLD;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_edit_treenode_connector_update_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      IF OLD.treenode_id IS DISTINCT FROM NEW.treenode_id OR
         OLD.connector_id IS DISTINCT FROM NEW.connector_ID THEN

          UPDATE treenode_connector_edge
              SET
                  id = NEW.id,
                  edge = sub.edge
              FROM (
                  SELECT ST_MakeLine(
                          ST_MakePoint(t.location_x, t.location_y, t.location_z),
                          ST_MakePoint(c.location_x, c.location_y, c.location_z)) AS edge,
                      notify_conditionally('catmaid.spatial-update', '{"project_id": ' || NEW.project_id || ', "type": "edge", "p1": [' ||
                          c.location_x || ',' || c.location_y || ',' || c.location_z || '], "p2": [' ||
                          t.location_x || ',' || t.location_y || ',' || t.location_z || ']}')
              FROM treenode t, connector c
              WHERE id = OLD.id
                AND t.id = NEW.treenode_id
                AND c.id = NEW.connector_id
              ) sub;
      END IF;
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_edit_treenode_update_treenode_connector_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      IF OLD.location_x != NEW.location_x OR
         OLD.location_y != NEW.location_y OR
         OLD.location_z != NEW.location_z THEN
          UPDATE treenode_connector_edge
              SET edge = sub.edge
              FROM (SELECT
                      tc.id AS tcid,
                      ST_MakeLine(
                          ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z),
                          ST_MakePoint(c.location_x, c.location_y, c.location_z)) AS edge,
                      notify_conditionally('catmaid.spatial-update', '{"project_id": ' || NEW.project_id || ', "type": "edges", "edges": [[[' ||
                          c.location_x || ',' || c.location_y || ',' || c.location_z || '], [' ||
                          NEW.location_x || ',' || NEW.location_y || ',' || NEW.location_z ||
                          ']], [[' ||
                          c.location_x || ',' || c.location_y || ',' || c.location_z || '], [' ||
                          OLD.location_x || ',' || OLD.location_y || ',' || OLD.location_z || ']]]}')
                  FROM
                      treenode_connector tc,
                      connector c
                  WHERE tc.treenode_id = NEW.id
                    AND c.id = tc.connector_id) sub
              WHERE id = sub.tcid;
      END IF;
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_edit_connector_update_treenode_connector_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      IF OLD.location_x != NEW.location_x OR
         OLD.location_y != NEW.location_y OR
         OLD.location_z != NEW.location_z THEN
          UPDATE treenode_connector_edge
              SET edge = sub.edge
              FROM (SELECT
                      tc.id AS tcid,
                      ST_MakeLine(
                          ST_MakePoint(t.location_x, t.location_y, t.location_z),
                          ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z)) AS edge,
                      notify_conditionally('catmaid.spatial-update', '{"project_id": ' || NEW.project_id || ', "type": "edges", "edges": [[[' ||
                          t.location_x || ',' || t.location_y || ',' || t.location_z || '], [' ||
                          NEW.location_x || ',' || NEW.location_y || ',' ||
                          NEW.location_z
                          || ']], [[' ||
                          t.location_x || ',' || t.location_y || ',' || t.location_z || '], [' ||
                          OLD.location_x || ',' || OLD.location_y || ',' || OLD.location_z || ']]]}')
                  FROM treenode_connector tc, treenode t
                  WHERE tc.connector_id = NEW.id
                    AND t.id = tc.treenode_id) sub
              WHERE id = sub.tcid;

          UPDATE connector_geom
              SET geom = ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z)
              WHERE id = NEW.id;
      END IF;
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_insert_treenode_connector_update_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      INSERT INTO treenode_connector_edge (
              id,
              project_id,
              edge)
      (SELECT id, project_id, edge
       FROM (
           SELECT
           NEW.id,
           NEW.project_id,
           ST_MakeLine(
               ST_MakePoint(t.location_x, t.location_y, t.location_z),
               ST_MakePoint(c.location_x, c.location_y, c.location_z)) AS edge,
           notify_conditionally('catmaid.spatial-update', '{"project_id": ' || NEW.project_id || ', "type": "edge", "p1": [' ||
               t.location_x || ',' || t.location_y || ',' || t.location_z || '], "p2": [' ||
               c.location_x || ',' || c.location_y || ',' || c.location_z || ']}')
           FROM treenode t, connector c
           WHERE t.id = NEW.treenode_id
             AND c.id = NEW.connector_id) sub);
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_insert_connector_update_connector_geom() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      INSERT INTO connector_geom (
              id,
              project_id,
              geom)
          VALUES (
              NEW.id,
              NEW.project_id,
              ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z));

      PERFORM notify_conditionally('catmaid.spatial-update', '{"project_id": ' || NEW.project_id || ', "type": "point", "p": [' ||
          NEW.location_x || ',' || NEW.location_y || ',' || NEW.location_z || ']}');

      RETURN NEW;
  END;
  $$;
"""

backward = """
  DROP TABLE dirty_node_grid_cache_cell;
  DROP TABLE node_grid_cache_cell;
  DROP TABLE node_grid_cache;


  DROP FUNCTION enable_spatial_update_events();
  DROP FUNCTION disable_spatial_update_events();
  DROP FUNCTION IF EXISTS notify_conditionally(text, text);

  -- If a new node is inserted: add a new row to the summary table if
  -- inserted node has no parent. If this results in a conflict,
  -- increase node count of existing.
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
              ) AS edge
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
      -- Transition tables (old_treenode and new_treenode) can only be
      -- read once per statement. This is why we select them
      -- completely into a CTE. With Postgres 10.4 this can be replaced
      -- by direct transition table access, because it fixes the bug
      -- causing the current behavior.
      WITH old_treenode_data AS (
          SELECT * FROM old_treenode
      ), new_treenode_data AS (
          SELECT * FROM new_treenode
      ), updated_parent_edge_data AS (
          -- Find all nodes that changed their position or parent
          SELECT t.id, t.project_id, t.skeleton_id, t.creation_time,
              t.edition_time, t.editor_id, ST_MakeLine(
                  ST_MakePoint(t.location_x, t.location_y, t.location_z),
                  ST_MakePoint(p.location_x, p.location_y, p.location_z)
              ) AS edge,
              t.parent_id,
              ot.edition_time as old_edition_time,
              ot.creation_time AS old_creation_time,
              ot.skeleton_id AS old_skeleton_id
          FROM new_treenode_data t
          JOIN old_treenode_data ot
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
              c.skeleton_id AS old_skeleton_id
          FROM treenode c
          JOIN new_treenode_data e
              ON c.parent_id = e.id
          LEFT JOIN new_treenode_data c2
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
          FROM new_treenode_data nt
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


  CREATE OR REPLACE FUNCTION on_delete_treenode_connector_update_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      DELETE FROM treenode_connector_edge
          WHERE id = OLD.id;
      RETURN OLD;
  END;
  $$;

  CREATE OR REPLACE FUNCTION on_delete_connector_update_geom() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      DELETE FROM connector_geom
          WHERE id = OLD.id;
      RETURN OLD;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_edit_treenode_connector_update_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      IF OLD.treenode_id IS DISTINCT FROM NEW.treenode_id OR
         OLD.connector_id IS DISTINCT FROM NEW.connector_ID THEN

          UPDATE treenode_connector_edge
              SET
                  id = NEW.id,
                  edge = ST_MakeLine(
                      ST_MakePoint(t.location_x, t.location_y, t.location_z),
                      ST_MakePoint(c.location_x, c.location_y, c.location_z))
              FROM treenode t, connector c
              WHERE id = OLD.id
                AND t.id = NEW.treenode_id
                AND c.id = NEW.connector_id;
      END IF;
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_edit_treenode_update_treenode_connector_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      IF OLD.location_x != NEW.location_x OR
         OLD.location_y != NEW.location_y OR
         OLD.location_z != NEW.location_z THEN
          UPDATE treenode_connector_edge
              SET edge = q.edge
              FROM (SELECT
                      tc.id,
                      ST_MakeLine(
                          ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z),
                          ST_MakePoint(c.location_x, c.location_y, c.location_z))
                  FROM
                      treenode_connector tc,
                      connector c
                  WHERE tc.treenode_id = NEW.id
                    AND c.id = tc.connector_id) AS q(tcid, edge)
              WHERE id = q.tcid;
      END IF;
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_edit_connector_update_treenode_connector_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      IF OLD.location_x != NEW.location_x OR
         OLD.location_y != NEW.location_y OR
         OLD.location_z != NEW.location_z THEN
          UPDATE treenode_connector_edge
              SET edge = q.edge
              FROM (SELECT
                      tc.id,
                      ST_MakeLine(
                          ST_MakePoint(t.location_x, t.location_y, t.location_z),
                          ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z))
                  FROM treenode_connector tc, treenode t
                  WHERE tc.connector_id = NEW.id
                    AND t.id = tc.treenode_id) AS q(tcid, edge)
              WHERE id = q.tcid;

          UPDATE connector_geom
              SET geom = ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z)
              WHERE id = NEW.id;
      END IF;
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_insert_treenode_connector_update_edges() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      INSERT INTO treenode_connector_edge (
              id,
              project_id,
              edge)
          (SELECT
              NEW.id,
              NEW.project_id,
              ST_MakeLine(
                  ST_MakePoint(t.location_x, t.location_y, t.location_z),
                  ST_MakePoint(c.location_x, c.location_y, c.location_z))
          FROM treenode t, connector c
          WHERE t.id = NEW.treenode_id
            AND c.id = NEW.connector_id);
      RETURN NEW;
  END;
  $$;


  CREATE OR REPLACE FUNCTION on_insert_connector_update_connector_geom() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
      INSERT INTO connector_geom (
              id,
              project_id,
              geom)
          VALUES (
              NEW.id,
              NEW.project_id,
              ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z));
      RETURN NEW;
  END;
  $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0058_add_pg_trgm_ext_and_class_instance_name_index'),
    ]

    operations = [
      migrations.RunSQL(forward, backward, [
          migrations.CreateModel(
              name='NodeGridCache',
              fields=[
                  ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                  ('orientation', models.IntegerField(default=0)),
                  ('cell_width', models.IntegerField()),
                  ('cell_height', models.IntegerField()),
                  ('cell_depth', models.IntegerField()),
                  ('n_largest_skeletons_limit', models.IntegerField(null=True)),
                  ('n_last_edited_skeletons_limit', models.IntegerField(null=True)),
                  ('project', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.Project')),
              ],
              options={
                  'db_table': 'node_grid_cache',
              },
          ),
          migrations.CreateModel(
              name='NodeGridCacheCell',
              fields=[
                  ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                  ('x_index', models.IntegerField()),
                  ('y_index', models.IntegerField()),
                  ('z_index', models.IntegerField()),
                  ('update_time', models.DateTimeField(default=django.utils.timezone.now)),
                  ('json_data', django.contrib.postgres.fields.jsonb.JSONField(blank=True, null=True)),
                  ('json_text_data', models.TextField(blank=True, null=True)),
                  ('msgpack_data', models.BinaryField(null=True)),
                  ('grid', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.NodeGridCache')),
              ],
              options={
                  'db_table': 'node_grid_cache_cell',
              },
          ),
          migrations.CreateModel(
              name='DirtyNodeGridCacheCell',
              fields=[
                  ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                  #('grid_cell', models.OneToOneField(on_delete=django.db.models.deletion.DO_NOTHING, primary_key=True, serialize=False, to='catmaid.NodeGridCacheCell')),
                  ('grid', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.NodeGridCache')),
                  ('x_index', models.IntegerField()),
                  ('y_index', models.IntegerField()),
                  ('z_index', models.IntegerField()),
                  ('invalidation_time', models.DateTimeField(default=django.utils.timezone.now)),
              ],
              options={
                  'db_table': 'dirty_node_grid_cache_cell',
              },
          ),
          migrations.AlterUniqueTogether(
              name='nodegridcachecell',
              unique_together={('grid', 'x_index', 'y_index', 'z_index')},
          ),
          migrations.AlterUniqueTogether(
              name='dirtynodegridcachecell',
              unique_together={('grid', 'x_index', 'y_index', 'z_index')},
          ),
          migrations.AlterUniqueTogether(
              name='nodegridcache',
              unique_together={('project', 'orientation', 'cell_width', 'cell_height', 'cell_depth')},
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='enabled',
              field=models.BooleanField(default=True),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='allow_empty',
              field=models.BooleanField(default=False),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='has_json_data',
              field=models.BooleanField(default=False),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='has_json_text_data',
              field=models.BooleanField(default=False),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='has_msgpack_data',
              field=models.BooleanField(default=False),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='hidden_last_editor',
              field=models.ForeignKey(on_delete=models.deletion.DO_NOTHING, to=settings.AUTH_USER_MODEL),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='lod_min_bucket_size',
              field=models.IntegerField(default=500),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='lod_strategy',
              field=models.TextField(default='quadratic'),
          ),
          migrations.AddField(
              model_name='nodegridcache',
              name='n_lod_levels',
              field=models.IntegerField(default=1),
          ),
        ]),
    ]
