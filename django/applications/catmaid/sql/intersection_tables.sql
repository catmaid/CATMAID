-- This function will drop a table with the given name and recreates it as
-- an intersection table. i.e. with the fields id, child_id, parent_id,
-- intersection.
CREATE OR REPLACE FUNCTION recreate_intersection_table(table_name text)
RETURNS void AS $$
DECLARE
  seq_name text;
  tmp_name text;
  row_count integer;
BEGIN
  -- We need to store the table name in a separate variable, because a regclass
  -- type variable will be invalid after the table is removed that it refers to.
  tmp_name = '' || table_name;

  -- Test if table exists
  EXECUTE format($a$SELECT COUNT(*) FROM pg_class WHERE relname='%s'$a$, table_name)
    INTO row_count;

  IF row_count <> 0
  THEN
    EXECUTE format('DROP TABLE %s', table_name);
  END IF;

  -- Prepare sequence name
  seq_name = format('%s_id_seq', tmp_name);

  -- Create intersection table
  EXECUTE format('CREATE TABLE %I (
    id bigint PRIMARY KEY,
    child_id bigint NOT NULL,
    parent_id bigint,
    intersection double3d NOT NULL,
    CONSTRAINT ' || tmp_name || '_child_id_fkey FOREIGN KEY (child_id)
        REFERENCES treenode(id),
    CONSTRAINT ' || tmp_name || '_parent_id_fkey FOREIGN KEY (parent_id)
        REFERENCES treenode(id))', tmp_name);
  EXECUTE format('CREATE SEQUENCE %s START WITH 1 INCREMENT BY 1 ' ||
    'NO MINVALUE NO MAXVALUE CACHE 1', seq_name);
  EXECUTE format('ALTER SEQUENCE %s OWNED BY %s.id', seq_name, tmp_name);
  EXECUTE format('ALTER TABLE ONLY %s ALTER COLUMN id ' ||
    $a$SET DEFAULT nextval('%s'::regclass)$a$, tmp_name, seq_name);

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- This function shrinks the treenode table by removing all treenodes that are
-- on a straight line between its neighbors and are no branch points and are not
-- referened in any other way (e.g. by tags).
CREATE OR REPLACE FUNCTION reduce_treenode_table()
RETURNS void AS $$
BEGIN
  RETURN;
END;
$$ LANGUAGE plpgsql;


-- This function populates an intersection table for a specific stack. It
-- will create an intersection for every edge in the treenode table. Two
-- parameters are required: project ID and stack ID.
-- This function walks all skeltons in the treenode table and finds
-- intersections between sekeltons and slices for a given stack. Next to project
-- and stack ID, it expects the target table to be passed as a parameter. The
-- target table has to exist already. This function doesn't remove data from the
-- target table, but only adds to it.
--
-- TODO: Compensate for possible translation between stack and project
-- TODO: What to do with broken slices?
CREATE OR REPLACE FUNCTION populate_intersection_table(sid integer, pid integer, table_name regclass)
RETURNS integer AS $$
DECLARE
  dimension stack.dimension%TYPE;
  resolution stack.resolution%TYPE;
  translation project_stack.translation%TYPE;
  orientation integer;
  skeleton_class_id integer;
  root_node_id integer;
  skeleton class_instance%ROWTYPE;
  node RECORD;
  section_distance double precision;
  next_isect_dist double precision;
  base_offset double precision;
  slice_thickness double precision;
  sin_alpha double precision;
  num_intersections integer;
  num_treenodes integer;
  treenode_count integer;
  insert_statement text;
  direction treenode.location%TYPE;
  direction_length double precision;
  new_location treenode.location%TYPE;
  -- edge_count integer;
BEGIN
  -- Get the stack's dimension and resolution
  SELECT (s.dimension).* INTO dimension FROM stack s WHERE id = sid LIMIT 1;
  SELECT (s.resolution).* INTO resolution FROM stack s WHERE id = sid LIMIT 1;
  SELECT (ps.translation).* INTO translation FROM project_stack ps WHERE project_id = pid AND stack_id = sid LIMIT 1;
  -- Make sure we got the data we want
  IF NOT FOUND THEN
      RAISE EXCEPTION 'stack % not found', sid;
  END IF;

  -- Get ID of 'skeleton' class of the current project
  SELECT id INTO skeleton_class_id FROM class
      WHERE class_name = 'skeleton' AND project_id = pid LIMIT 1;

  -- Find out how many treenodes we have
  SELECT count(*) INTO num_treenodes FROM treenode WHERE project_id=pid;
  treenode_count = 0;


  -- Depending on the view, create a functinon to measure the distance between a
  -- node and a section. The orientation is encoded as an integer: XY = 0, XZ = 1
  -- and ZY = 2.
  SELECT ps.orientation INTO orientation FROM project_stack ps
      WHERE ps.project_id=pid AND ps.stack_id=sid;
  IF orientation = 0
  THEN
    -- Helper to get the sine of the angle between the passed in direction and a
    -- slice of this orientation. The direction is expected to be normalized.
    CREATE OR REPLACE FUNCTION get_sin_angle_to_slices(treenode.location%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      -- Calculate length of dot product between normal of XY plane and
      -- direction in an optimized fasion.
      return sqrt(($1).y * ($1).y + ($1).x * ($1).x);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get distance of a node to a section.
    CREATE OR REPLACE FUNCTION get_section_distance(treenode.location%TYPE, stack.resolution%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      RETURN MOD(($1).z::numeric, ($2).z::numeric);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get number of intersections between two nodes
    CREATE OR REPLACE FUNCTION get_num_intersections(treenode.location%TYPE, treenode.location%TYPE, double precision, stack.resolution%TYPE)
    RETURNS integer AS $a$
    BEGIN
      RETURN floor((abs(($1).z - ($2).z) + $3) / ($4).z);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to test if the first nodes projection is lower than the second one's
    CREATE OR REPLACE FUNCTION is_higher_up(treenode.location%TYPE, treenode.location%TYPE)
    RETURNS boolean AS $a$
    BEGIN
      RETURN ($1).z < ($2).z;
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get the thickness of a slice
    CREATE OR REPLACE FUNCTION get_slice_thickness(stack.resolution%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      return ($1).z;
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to transform a location into the current coordinate space
    CREATE OR REPLACE FUNCTION transform(treenode.location%TYPE)
    RETURNS treenode.location%TYPE AS $a$
    BEGIN
      return (($1).x, ($1).y, ($1).z);
    END;
    $a$ LANGUAGE plpgsql;
  ELSIF orientation = 1
  THEN
    -- Helper to get the sine of the angle between the passed in direction and a
    -- slice of this orientation. The direction is expected to be normalized.
    CREATE OR REPLACE FUNCTION get_sin_angle_to_slices(treenode.location%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      -- Calculate length of dot product between normal of XZ plane and
      -- direction in an optimized fasion.
      return sqrt(($1).z * ($1).z + ($1).y * ($1).y);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get distance of a node to a section.
    CREATE OR REPLACE FUNCTION get_section_distance(treenode.location%TYPE, stack.resolution%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      return MOD(($1).y::numeric, ($2).y::numeric);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get number of intersections between two nodes
    CREATE OR REPLACE FUNCTION get_num_intersections(treenode.location%TYPE, treenode.location%TYPE, double precision, stack.resolution%TYPE)
    RETURNS integer AS $a$
    BEGIN
      RETURN floor((abs(($1).y - ($2).y) + $3) / ($4).y);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to test if the first nodes projection is lower than the second one's
    CREATE OR REPLACE FUNCTION is_higher_up(treenode.location%TYPE, treenode.location%TYPE)
    RETURNS boolean AS $a$
    BEGIN
      RETURN ($1).y < ($2).y;
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get the thickness of a slice
    CREATE OR REPLACE FUNCTION get_slice_thickness(stack.resolution%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      return ($1).y;
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to transform a location into the current coordinate space
    CREATE OR REPLACE FUNCTION transform(treenode.location%TYPE)
    RETURNS treenode.location%TYPE AS $a$
    BEGIN
      return (($1).x, ($1).z, ($1).y);
    END;
    $a$ LANGUAGE plpgsql;
  ELSIF orientation = 2
  THEN
    -- Helper to get the sine of the angle between the passed in direction and a
    -- slice of this orientation. The direction is expected to be normalized.
    CREATE OR REPLACE FUNCTION get_sin_angle_to_slices(treenode.location%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      -- Calculate length of dot product between normal of ZY plane and
      -- direction in an optimized fasion.
      return sqrt(($1).z * ($1).z + ($1).y * ($1).y);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get distance of a node to a section.
    CREATE OR REPLACE FUNCTION get_section_distance(treenode.location%TYPE, stack.resolution%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      return MOD(($1).x::numeric, ($2).x::numeric);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get number of intersections between two nodes
    CREATE OR REPLACE FUNCTION get_num_intersections(treenode.location%TYPE, treenode.location%TYPE, double precision, stack.resolution%TYPE)
    RETURNS integer AS $a$
    BEGIN
      RETURN floor((abs(($1).x - ($2).x) + $3) / ($4).x);
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to test if the first nodes projection is lower than the second one's
    CREATE OR REPLACE FUNCTION is_higher_up(treenode.location%TYPE, treenode.location%TYPE)
    RETURNS boolean AS $a$
    BEGIN
      RETURN ($1).x < ($2).x;
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to get the thickness of a slice
    CREATE OR REPLACE FUNCTION get_slice_thickness(stack.resolution%TYPE)
    RETURNS double precision AS $a$
    BEGIN
      return ($1).x;
    END;
    $a$ LANGUAGE plpgsql;
    -- Helper to transform a location into the current coordinate space
    CREATE OR REPLACE FUNCTION transform(treenode.location%TYPE)
    RETURNS treenode.location%TYPE AS $a$
    BEGIN
      return (($1).z, ($1).y, ($1).x);
    END;
    $a$ LANGUAGE plpgsql;
  END IF;

  RAISE NOTICE 'Walking skeleton';

  -- Slice thickness won't change while walking the skeleton
  slice_thickness := get_slice_thickness(resolution);

  -- Prepare basic insert statement
  insert_statement = format('INSERT INTO %s (child_id, parent_id, intersection) ' ||
    'VALUES ($1, $2, $3)', table_name);
  -- Prepare parent update statement
--  update_parent = format('UPDATE %s SET parent_id = $2 WHERE id = $1', table_name);

  -- Walk each skeleton of this project from root to all leafes. This is faster
  -- than walking sequencially though a big join. Expect the skeleton to have no
  -- loops.
  FOR skeleton IN SELECT * FROM class_instance ci WHERE ci.project_id = pid
      AND ci.class_id = skeleton_class_id LOOP

    -- Build a Common Table Expression to build up the skeleton tree with all
    -- location information needed and traverse it.
    FOR node IN
        WITH RECURSIVE skeleton_tree(id, location, parent_id, parent_location) AS (
            -- Non-recursive part: the root node, expect only one per skeleton. The
            -- NULL value for the (non existing) parent location has to be typed or
            -- Postgres will default to TEXT type and complain.
            SELECT id, location, parent_id, location
                FROM treenode WHERE skeleton_id = skeleton.id AND parent_id IS NULL
          UNION ALL
            -- Recursive part which can reference the query's own output
            SELECT t.id, t.location, s.id, s.location
                FROM treenode t, skeleton_tree s WHERE s.id = t.parent_id
        )
        SELECT * FROM skeleton_tree
    LOOP
      -- Output status information
      treenode_count = treenode_count + 1;
      RAISE NOTICE 'Status: %/% node: % parent: %', treenode_count, num_treenodes, node.location, node.parent_location;

      -- Find out how far away the current node is from the last section
      section_distance = get_section_distance(node.location, resolution);
      RAISE NOTICE '# Section distance: %', section_distance;

      -- Calculate the number of intersections between this node and its parent.
      num_intersections = get_num_intersections(node.location, node.parent_location, section_distance, resolution);

      -- Display intersections with:
      RAISE NOTICE '# Intersections: %', num_intersections;

      -- In every iteration one node of the current skeleton is available as
      -- 'node'. It has the properties 'id', 'location', 'parent_id' and
      -- 'parent_location'. The last two are NULL for the root node. Based on
      -- this, all intersections can be calculated. Start with the current
      -- location and add an intersection, if it is on a section.
      IF section_distance < 0.0001 THEN
          RAISE NOTICE 'Skeleton %: adding intersection: %', skeleton.id, node.location;
          EXECUTE insert_statement USING node.id, node.parent_id, node.location;
          -- Subtract one from number of intersections that still have to be
          -- added
          num_intersections := num_intersections - 1;
      END IF;

      -- Because not included in num_intersections, check if the parent is also
      -- located exactly on a section. If so, add an intersection entry for it
      -- as well. This makes two intersections for one edge if child and parent
      -- are both exactly on a section.
--      IF node.parent_location IS NOT NULL
--          AND get_section_distance(node.parent_location, resolution) < 0.0001 THEN
--        -- RAISE NOTICE 'Skeleton %: adding intersection: %', skeleton.id, node.location;
--        EXECUTE insert_statement USING node.id, node.parent_id, node.parent_location;
--      END IF;

      -- Continue with next node if there are no intersections. For a root node,
      -- num_intersections will be 0 as well as if the distance between the last
      -- section and the node's parent is smaller than the resolution in this
      -- dimension.
      IF num_intersections < 1 THEN
        CONTINUE;
      END IF;

      -- Calculate the direction of the next intersection (not normalized),
      -- which is toward the partent
      direction.x := (node.parent_location).x - (node.location).x;
      direction.y := (node.parent_location).y - (node.location).y;
      direction.z := (node.parent_location).z - (node.location).z;
      -- Get distance between node and parent
      direction_length := sqrt(direction.x * direction.x
                             + direction.y * direction.y
                             + direction.z * direction.z);
      -- Normalize this vector
      direction.x := direction.x / direction_length;
      direction.y := direction.y / direction_length;
      direction.z := direction.z / direction_length;

      -- The distance between slices along <direction> is based on the angle
      -- between the the direction and the section plane. If this angle is zero,
      -- there is no further intersection (actuall infinity).
      sin_alpha = get_sin_angle_to_slices(direction);
      IF abs(sin_alpha) < 0.0001 THEN
        -- TODO: Instead of don't adding any intersections, should we add one at
        -- the parent?
        CONTINUE;
      END IF;
      -- Sine trigonometry to get the distance
      base_offset := slice_thickness / sin_alpha;
      RAISE NOTICE '  Base offset: %', base_offset;

      -- If the parent node is higher up in the stack than the current node,
      -- check backwars for intersections. Otherwise go forwards.
      IF is_higher_up(node.parent_location, node.location) THEN
        -- Calculate the distance to the first intersection and get the base_offset
        -- for every succequent iteration
        next_isect_dist := slice_thickness - base_offset;
      ELSE
        -- Calculate the distance to the first intersection
        next_isect_dist := base_offset;
      END IF;

--      last_node_id = node.id;

      -- Walk over intersections
      WHILE num_intersections > 0 LOOP
        -- Calculate intersection
        new_location.x := (node.location).x + next_isect_dist * direction.x;
        new_location.y := (node.location).y + next_isect_dist * direction.y;
        new_location.z := (node.location).z + next_isect_dist * direction.z;
        -- Add intersection
        EXECUTE insert_statement USING node.id, node.parent_id, new_location;
--        -- Update original parent and current node to reflect this change
--         EXECUTE update_parent USING last_node_id, new_node.id;
        -- Mark intersection as added
        num_intersections := num_intersections - 1;
        -- Update distance
        next_isect_dist := next_isect_dist + base_offset;
        -- Debug output
        RAISE NOTICE '  Adding additional intersection at %', new_location;
      END LOOP;

      -- This could be used to display each node:
      -- RAISE NOTICE 'Skeleton % edge: % to %', skeleton.id, node.parent_location, node.location;
    END LOOP;

    -- The number of nodes per skeleton can now be obtained and displayed with:
    -- SELECT COUNT(*) INTO edge_count FROM skeleton_tree;
    -- RAISE NOTICE 'Skeleton % has % edges', skeleton.id, edge_count;
  END LOOP;

  -- Clean up
  DROP FUNCTION get_section_distance(treenode.location%TYPE, stack.resolution%TYPE);
  DROP FUNCTION get_num_intersections(treenode.location%TYPE, treenode.location%TYPE, double precision, stack.resolution%TYPE);
  DROP FUNCTION is_higher_up(treenode.location%TYPE, treenode.location%TYPE);
  DROP FUNCTION get_slice_thickness(stack.resolution%TYPE);

  RAISE NOTICE 'Done populating intersection table for stack %', sid;
  RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Drop the intersection table if it exists
CREATE OR REPLACE FUNCTION intersection_test()
RETURNS void AS $$
BEGIN
  PERFORM recreate_intersection_table('catmaid_skeleton_intersections');
  PERFORM populate_intersection_table(1,2, 'catmaid_skeleton_intersections');
  RETURN;
END;
$$ LANGUAGE plpgsql;
