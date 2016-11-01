# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations

forward = """
  -- Create table that represents a 3D grid of the project space.
  CREATE TABLE intersection_grid_cells (
    id bigserial PRIMARY KEY,
    project_id integer REFERENCES project (id),
    seq_index bigint,
    min_x real,
    min_y real,
    min_z real,
    max_x real,
    max_y real,
    max_z real,
    dirty boolean,
    intersections bigint[],
    UNIQUE (project_id, seq_index)
  );

  -- Add some indices
  CREATE INDEX intersection_grid_cells_min_x_brin ON intersection_grid_cells using BRIN(min_x);
  CREATE INDEX intersection_grid_cells_min_y_brin ON intersection_grid_cells using BRIN(min_y);
  CREATE INDEX intersection_grid_cells_min_z_brin ON intersection_grid_cells using BRIN(min_z);
  CREATE INDEX intersection_grid_cells_max_x_brin ON intersection_grid_cells using BRIN(max_x);
  CREATE INDEX intersection_grid_cells_max_y_brin ON intersection_grid_cells using BRIN(max_y);
  CREATE INDEX intersection_grid_cells_max_z_brin ON intersection_grid_cells using BRIN(max_z);

  -- A separate table keeps track of dirty cells that need to be updated. This
  -- This is done separate from the cells table to not require too much locking
  -- on the main table during update.
  CREATE TABLE intersection_grid_dirty_cells (

  );

  -- Create a single cell at the given location. If an existing cell has the
  -- same sequence ID for the passed in project ID, it is updated with new
  -- data. By default, no empty cells are created. This can be changed with the
  -- help of the allow_empty parameter.
  CREATE OR REPLACE FUNCTION create_or_update_cell(cell_project_id integer, seq_index bigint,
          cell_min_x real, cell_min_y real, cell_min_z real, w real, h real, d real,
          allow_empty boolean DEFAULT false)
      RETURNS bigint AS
  $$
    INSERT INTO intersection_grid_cells (project_id, seq_index, min_x, min_y,
      min_z, max_x, max_y, max_z, dirty, intersections)
    SELECT cell_project_id, seq_index,
      cell_min_x,
      cell_min_y,
      cell_min_z,
      cell_min_x + w,
      cell_min_y + h,
      cell_min_z + d,
      false,
      isect.ids
    FROM (
      SELECT array_agg(te.id) as ids
        FROM treenode_edge te
        WHERE te.edge &&& ST_MakeLine(ST_MakePoint(cell_min_x, cell_min_y, cell_min_z),
                                    ST_MakePoint(cell_min_x + w, cell_min_y + h, cell_min_z + d))
        -- AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_GeomFromText(
        -- 'LINESTRING(%(left)s %(top)s %(halfz)s, %(right)s %(top)s %(halfz)s,
        --						%(right)s %(bottom)s %(halfz)s, %(left)s %(bottom)s %(halfz)s,
        --						%(left)s %(top)s %(halfz)s)')), %(halfzdiff)s)
        AND te.project_id = cell_project_id
    ) isect
    WHERE cardinality(isect.ids) IS NOT NULL OR allow_empty
    ON CONFLICT (project_id, seq_index) DO UPDATE SET
      min_x = excluded.min_x,
      min_y = excluded.min_y,
      min_z = excluded.min_z,
      max_x = excluded.max_x,
      max_y = excluded.max_y,
      max_z = excluded.max_z,
      intersections = excluded.intersections
    RETURNING id
  $$ LANGUAGE sql;


  -- Replace all intersection grill cells for a project. Rows of existing cells
  -- are reused as much as possible. Old rows that were not reused, will be deleted.
  -- The created grid is sparse, i.e. cells will only actually exist if there are
  -- intersections in the volume it occupies. each cell has the same dimensions
  -- and stores a location index that represents the cell location by following
  -- an XYZ indexing scheme: index = X % w + Y % h + Z % d
  CREATE OR REPLACE FUNCTION update_intersection_grid(project_id integer, w real, h real, d real,
      allow_empty boolean DEFAULT false)
      RETURNS TABLE(
        updated_cells bigint,
        deleted_cells bigint
      ) AS
  $$
    -- delete all existing grid cells that have not been updated
    WITH updated_cells AS (
      -- find min and max coordinate in space and information on the new grid
      WITH
        bb AS (
          SELECT
            min(location_x) AS min_x,
            min(location_y) AS min_y,
            min(location_z) AS min_z,
            max(location_x) AS max_x,
            max(location_y) AS max_y,
            max(location_z) AS max_z
          FROM treenode
        ),
        bb_info AS (
          SELECT
            bb.max_x - bb.min_x AS width,
            bb.max_y - bb.min_y AS height,
            bb.max_z - bb.min_z AS depth
          FROM bb
        ),
        grid_info AS (
          SELECT
            ceil(bb.width / w)::bigint AS n_cells_w,
            ceil(bb.height / h)::bigint AS n_cells_h,
            ceil(bb.depth / d)::bigint AS n_cells_d,
            (ceil(bb.width / w) * ceil(bb.height / h) * ceil(bb.depth / d))::bigint AS n_cells
          FROM bb_info bb
        )
      -- iterate over all cells, follow pattern
      SELECT create_or_update_cell(project_id, seq.idx,
        bb.min_x + (w * (seq.idx % grid_info.n_cells_w))::real,
        bb.min_y + (h * (floor(seq.idx / grid_info.n_cells_w)::bigint % grid_info.n_cells_h))::real,
        bb.min_z + (d * (floor(seq.idx / (grid_info.n_cells_w * grid_info.n_cells_h))))::real,
        w, h, d, allow_empty) AS id
      FROM (
        SELECT generate_series(0, grid_info.n_cells) as idx
        FROM grid_info
      ) seq(idx), bb, grid_info
    ),
    deleted_cells AS (
      DELETE FROM intersection_grid_cells ig
      USING (
        -- get cells that have not (!) been updated or created
        SELECT ig2.id
        FROM intersection_grid_cells ig2
        FULL OUTER JOIN updated_cells
        ON ig2.id = updated_cells.id
        WHERE updated_cells.id IS NULL
      ) to_delete
      WHERE ig.id = to_delete.id
      RETURNING ig.id
    )
    SELECT count(uc), count(dc) from updated_cells uc, deleted_cells dc;
  $$ language sql;
"""

backward = """
  DROP FUNCTION IF EXISTS update_intersection_grid(integer, real, real, real, boolean);
  DROP FUNCTION IF EXISTS create_or_update_cell(integer, bigint,
          real, real, real, real, real, real, boolean);
  DROP TABLE intersection_grid_cells;
"""


forward_init_intersection_grid = """

"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0013_add_missing_tnci_and_cnci_indices'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
        #migrations.RunSQL(forward_init_intersection_grid, migrations.RunSQL.noop)
    ]
