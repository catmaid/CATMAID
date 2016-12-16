59621.8895322, 95494.8502154, 106150.0,
80935.219288,  88605.367425,  106100.0


-- 5000 nodes:

-- 38102.6525607 77834.098039 106050.0,
-- 53173, 4525607 72962.498039 106000.0

38102.6525607 77834.098039 106050.0,
53173.4525607 72962.498039 106000.0

-- Total nodes: 12365231

-- Query 1a:
-- Nodes: 1021
-- Time: 98 ms (58 ms)

SELECT t1.id, t1.parent_id, t1.location_x, t1.location_y, t1.location_z, t1.confidence, t1.radius, t1.skeleton_id, t1.user_id, t2.id, t2.parent_id, t2.location_x, t2.location_y, t2.location_z, t2.confidence, t2.radius, t2.skeleton_id, t2.user_id
FROM treenode t1
  INNER JOIN treenode t2 ON ( (t1.id = t2.parent_id OR t1.parent_id = t2.id) OR (t1.parent_id IS NULL AND t1.id = t2.id))
  INNER JOIN ( SELECT te.id
               FROM treenode_edge te
               WHERE te.edge &&& 'LINESTRINGZ(38102.6525607 77834.098039 106050.0, 53173.4525607 72962.498039 106000.0)') edges(edge_child_id) ON edge_child_id = t1.id
 WHERE t1.project_id = 1 LIMIT 5000

-- Query 1b:
-- Nodes: 1017
-- Time: 1598.527 ms (1060 ms)

SELECT t1.id, t1.parent_id,t1.location_x,t1.location_y,t1.location_z,t1.confidence,t1.radius,t1.skeleton_id,t1.user_id,t2.id,t2.parent_id,t2.location_x,t2.location_y,t2.location_z,t2.confidence,t2.radius,t2.skeleton_id,t2.user_id
FROM treenode t1, treenode t2,
        (SELECT te.id
         FROM treenode_edge te
         WHERE ST_3DDWithin(te.edge, ST_MakePolygon(ST_GeomFromText('LINESTRING(
            38102.6525607 77834.098039 106025.0,
            53173.4525607 77834.098039 106025.0,
            53173.4525607 72962.498039 106025.0,
            38102.6525607 72962.498039 106025.0,
            38102.6525607 77834.098039 106025.0)')), 25)) edges(edge_child_id)
      WHERE t1.project_id = 1
        AND ((t1.id = t2.parent_id
              OR t1.parent_id = t2.id)
             OR (t1.parent_id IS NULL
                 AND t1.id = t2.id))
        AND edge_child_id = t1.id LIMIT 5000

-- Query 2a: much smaller field of view
-- Nodes: 106 Nodes
-- Time: 22 ms (22 ms)

SELECT t1.id, t1.parent_id, t1.location_x, t1.location_y, t1.location_z, t1.confidence, t1.radius, t1.skeleton_id, t1.user_id, t2.id, t2.parent_id, t2.location_x, t2.location_y, t2.location_z, t2.confidence, t2.radius, t2.skeleton_id, t2.user_id
FROM treenode t1, treenode t2,
            ( SELECT te.id
              FROM treenode_edge te
              WHERE te.edge &&& 'LINESTRINGZ(38102.6525607 77834.098039 106050.0, 45000.4525607 77000.498039 106000.0)') edges(edge_child_id)
 WHERE t1.project_id = 1
    AND ( (t1.id = t2.parent_id OR t1.parent_id = t2.id) OR (t1.parent_id IS NULL AND t1.id = t2.id))
    AND edge_child_id = t1.id
 LIMIT 5000

-- Query 2b: much smaller field of view
-- Nodes: 106
-- Time: 107 ms (106 ms)

SELECT t1.id, t1.parent_id,t1.location_x,t1.location_y,t1.location_z,t1.confidence,t1.radius,t1.skeleton_id,t1.user_id,t2.id,t2.parent_id,t2.location_x,t2.location_y,t2.location_z,t2.confidence,t2.radius,t2.skeleton_id,t2.user_id
FROM treenode t1, treenode t2,
        (SELECT te.id
         FROM treenode_edge te
         WHERE ST_3DDWithin(te.edge, ST_MakePolygon(ST_GeomFromText('LINESTRING(
            38102.6525607 77834.098039 106025.0,
            45000.4525607 77834.098039 106025.0,
            45000.4525607 77000.498039 106025.0,
            38102.6525607 77000.498039 106025.0,
            38102.6525607 77834.098039 106025.0)')), 25)) edges(edge_child_id)
      WHERE t1.project_id = 1
        AND ((t1.id = t2.parent_id
              OR t1.parent_id = t2.id)
             OR (t1.parent_id IS NULL
                 AND t1.id = t2.id))
        AND edge_child_id = t1.id LIMIT 5000


-- Query 3a: other region:
-- Nodes: 2615
-- Time: 145 ms 92 ms 
-- Nodes neurocean: 2434
-- Time neurocean: 426 ms (complete request, multiple queries)
-- Region: 41819.31354090536 81255.64336110713 102850, 59868.26425961124 88903.95239000155 102900

SELECT t1.id, t1.parent_id, t1.location_x, t1.location_y, t1.location_z, t1.confidence, t1.radius, t1.skeleton_id, t1.user_id, t2.id, t2.parent_id, t2.location_x, t2.location_y, t2.location_z, t2.confidence, t2.radius, t2.skeleton_id, t2.user_id
FROM treenode t1, treenode t2,
            ( SELECT te.id
              FROM treenode_edge te
              WHERE te.edge &&& 'LINESTRINGZ(41819.31354090536 81255.64336110713 102850, 59868.26425961124 88903.95239000155 102900)') edges(edge_child_id)
 WHERE t1.project_id = 1
    AND ( (t1.id = t2.parent_id OR t1.parent_id = t2.id) OR (t1.parent_id IS NULL AND t1.id = t2.id))
    AND edge_child_id = t1.id
 LIMIT 5000

-- Query 3b: 
-- Nodes: 1745
-- Time: 2917 ms (2413 ms)

SELECT t1.id, t1.parent_id,t1.location_x,t1.location_y,t1.location_z,t1.confidence,t1.radius,t1.skeleton_id,t1.user_id,t2.id,t2.parent_id,t2.location_x,t2.location_y,t2.location_z,t2.confidence,t2.radius,t2.skeleton_id,t2.user_id
FROM treenode t1, treenode t2,
        (SELECT te.id
         FROM treenode_edge te
         WHERE ST_3DDWithin(te.edge, ST_MakePolygon(ST_GeomFromText('LINESTRING(
            41819.31354090536 81255.64336110713 102850,
            59868.26425961124 81255.64336110713 102900,
            59868.26425961124 88903.95239000155 102900,
            41819.31354090536 88903.95239000155 102850,
            41819.31354090536 81255.64336110713 102850)')), 25)) edges(edge_child_id)
      WHERE t1.project_id = 1
        AND ((t1.id = t2.parent_id
              OR t1.parent_id = t2.id)
             OR (t1.parent_id IS NULL
                 AND t1.id = t2.id))
        AND edge_child_id = t1.id LIMIT 5000


-- Query 4: both &&& and ST_3DDWithin combined
-- Nodes: 884
-- Time: 106 ms (61 ms)

SELECT te.id
FROM treenode_edge te
WHERE te.edge &&& 'LINESTRINGZ(41819.31354090536 81255.64336110713 102850, 59868.26425961124 88903.95239000155 102900)'
  AND _st_3ddwithin(te.edge, ST_MakePolygon(ST_GeomFromText('LINESTRING(
    41819.31354090536 81255.64336110713 102825,
    59868.26425961124 81255.64336110713 102925,
    59868.26425961124 88903.95239000155 102925,
    41819.31354090536 88903.95239000155 102825,
    41819.31354090536 81255.64336110713 102825)')), 25);
