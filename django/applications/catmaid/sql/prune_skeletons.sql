CREATE OR REPLACE FUNCTION prune_skeletons(pid integer, dryrun boolean DEFAULT false)
  RETURNS integer AS $$
DECLARE

  skeleton class_instance%ROWTYPE;
  last_parent bigint;
  node RECORD;
  ref RECORD;
  skeleton_class_id integer;
  num_treenodes integer;
  collinear_count integer;
  deleted_count integer;
  gn real;
  gp real;
  pn real;
  reference_statement text;
  rc integer;
  do_update boolean;

BEGIN

  -- Set dry run or update mode
  do_update = NOT dryrun;

  -- Make sure all constraints are tested immediately
  SET CONSTRAINTS ALL IMMEDIATE;

  -- Get ID of 'skeleton' class of the current project
  SELECT id INTO skeleton_class_id FROM class
      WHERE class_name = 'skeleton' AND project_id = pid LIMIT 1;

  -- Find out how many treenodes we have
  SELECT count(*) INTO num_treenodes FROM treenode WHERE project_id=pid;
  collinear_count = 0;
  deleted_count = 0;

  -- RAISE NOTICE 'Walking skeletons';

  -- Walk each skeleton of this project from root to all leafes. This is faster
  -- than walking sequencially though a big join. Expect the skeleton to have no
  -- loops.
  FOR skeleton IN SELECT * FROM class_instance ci WHERE ci.project_id = pid
      AND ci.class_id = skeleton_class_id LOOP

    -- Build a Common Table Expression to build up the skeleton tree with all
    -- location information needed and traverse it.
    <<nodeloop>>
    FOR node IN
        WITH RECURSIVE skeleton_tree(id, x, y, z,
                                     p_id, px, py, pz,
                                     g_id, gx, gy, gz) AS (
            -- Non-recursive part: the root node, expect only one per skeleton. The
            -- NULL value for the (non existing) parent location has to be typed or
            -- Postgres will default to TEXT type and complain.
            SELECT id, location_x, location_y, location_z,
                   parent_id, location_x, location_y, location_z,
                   parent_id, location_x, location_y, location_z
              FROM treenode WHERE skeleton_id = skeleton.id AND parent_id IS NULL
          UNION ALL
            -- Recursive part which can reference the query's own output
            SELECT t.id, t.location_x, t.location_y, t.location_z,
                   s.id, s.x, s.y, s.z, s.p_id, s.px, s.py, s.pz
              FROM treenode t, skeleton_tree s WHERE t.parent_id = s.id
        )
        SELECT * FROM skeleton_tree
    LOOP
      -- Ignore nodes that don't have a parent or grand parent
      CONTINUE WHEN node.p_id IS NULL OR node.g_id IS NULL;

      -- This could be used to display each node:
      -- RAISE NOTICE 'Status: %/% n %: %, %, % p %: %, %, % g %: %, %, %',
      --  collinear_count, num_treenodes,
      --  node.id, node.x, node.y, node.z,
      --  node.p_id, node.px, node.py, node.pz,
      --  node.g_id, node.gx, node.gy, node.gz;

      -- Find out, if P lies on a line between G and N.

      -- Check if the parent node (P) can be pruned. This is the case if it is
      -- on the straight line between grand parent (G) and this node (N). This
      -- in turn can be checked by comparing the length of GN and (GP + PN). If
      -- they are the same, all three points are collinear and P is between G
      -- and N.

      gn = sqrt( (node.x - node.gx) * (node.x - node.gx) +
                 (node.y - node.gy) * (node.y - node.gy) +
                 (node.z - node.gz) * (node.z - node.gz) );

      gp = sqrt( (node.px - node.gx) * (node.px - node.gx) +
                 (node.py - node.gy) * (node.py - node.gy) +
                 (node.pz - node.gz) * (node.pz - node.gz) );

      pn = sqrt( (node.x - node.px) * (node.x - node.px) +
                 (node.y - node.py) * (node.y - node.py) +
                 (node.z - node.pz) * (node.z - node.pz) );

      IF abs(gn - (gp + pn)) < 0.0001 THEN
        -- RAISE NOTICE 'Collinear!';
        collinear_count = collinear_count + 1;
        -- Test if P is referenced from other relations (but the treenode table)
        FOR ref IN SELECT tc.table_name, kcu.column_name
                FROM
                    information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                WHERE constraint_type = 'FOREIGN KEY' AND ccu.table_name='treenode'
                                                      AND ccu.column_name='id'
                                                      AND tc.table_name!='treenode'
        LOOP
        -- Prepare a statement that can be used to test if avalue exists in a table
          EXECUTE format('SELECT 1 FROM %I WHERE %I = $1', ref.table_name, ref.column_name) USING node.p_id;
          GET DIAGNOSTICS rc = ROW_COUNT;
          IF rc > 0 THEN
            RAISE NOTICE 'Cannot prune node %, it is referenced from %.%',
                node.p_id, ref.table_name, ref.column_name;
            last_parent = node.p_id;
            CONTINUE nodeloop;
          ELSE
            -- Test if P is only referenced by N in the treenode table
            IF EXISTS(SELECT 1 FROM treenode WHERE id != node.id AND parent_id = node.p_id) THEN
              RAISE NOTICE 'Cannot prune node %, it is still a parent of other treenodes', node.p_id;
              last_parent = node.p_id;
              CONTINUE nodeloop;
            END IF;
          END IF;
        END LOOP;

        -- Now it should be safe to remove P and connect G and N
        IF do_update THEN
          UPDATE treenode SET parent_id = last_parent WHERE id = node.id;
          DELETE FROM treenode WHERE id = node.p_id;
        END IF;
        deleted_count = deleted_count + 1;
      END IF;

    END LOOP;

  END LOOP;

  -- The number of nodes per skeleton can now be obtained and displayed with:
  -- SELECT COUNT(*) INTO edge_count FROM skeleton_tree;
  RAISE NOTICE '% or % total nodes are collinear with neighbors, deleted % of them',
      collinear_count, num_treenodes, deleted_count;

  RETURN deleted_count;
END;
$$ LANGUAGE 'plpgsql';
