.. _bulk_loading:

Bulk loading of tracing data
============================

In order to import large amounts of data, we try to minimize the work the
database has to do. Most importantly this means *disabling trigger functions*
and thereby *foreign key constraints* as well as *disabling index updates*
during the data loading. The example below explains how to do that. There is
also some good general advise available from the `Postgres documentation
<https://www.postgresql.org/docs/11/populate.html>`_.

To prepare the database to load a lot of data, some settings can be tweaked
temporarily::

  -- Depending on the number of CPUs. This helps with creating B-Tree indices.
  max_parallel_maintenance_workers = 8

Having all this said, the following SQL code provides a wrapper to disable
triggers, and indices for central tables. It also resets the relevant ID
sequences in use::

  -- Disable all triggers, including foreign keys
  SET session_replication_role = replica;


  -- A list of tables for which to temporarily disable indices. This tables is
  -- deleted at the end of the current session (can be used in multiple
  -- transactions in this session).
  CREATE TEMPORARY TABLE indexed_table (
    rel regclass
  );
  INSERT INTO indexed_table (VALUES
    ('class_instance'),
    ('class_instance_class_instance'),
    ('treenode'),
    ('treenode_edge'),
    ('connector'),
    ('connector_geom'),
    ('treenode_connector_edge')
  );


  -- Disable all indices for all relevant indexed tables
  UPDATE pg_index
  SET indisready=false
  FROM indexed_table it
  WHERE indrelid = it.rel;


  -- Import data: class_instance, class_instance
  BEGIN;
  SET CONSTRAINTS ALL DEFERRED;

  COPY class_instance (id, user_id, project_id, class_id, name)
  FROM '/path/to/data/import_class_instance_0.csv' WITH (FORMAT csv);
  ...

  COPY class_instance_class_instance (id, user_id, project_id, relation_id,
    class_instance_a, class_instance_b)
  FROM '/path/to/data/import_class_class_0.csv' WITH (FORMAT csv);
  ...

  -- Reset ID sequence to new maximum ID
  SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
  FROM concept;

  COMMIT;


  -- Import data: treenode
  BEGIN;
  SET CONSTRAINTS ALL DEFERRED;

  COPY treenode (id, project_id, location_x, location_y, location_z, editor_id,
    user_id, skeleton_id, radius, parent_id)
  FROM '/path/to/data/import_treenode_0.csv' WITH (FORMAT csv);
  ...

  -- Reset ID sequence to new maximum ID
  SELECT setval('location_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM location;

  COMMIT;


  -- Import data: treenode_edge
  BEGIN;
  SET CONSTRAINTS ALL DEFERRED;

  COPY treenode_edge(id, project_id, edge)
  FROM '/path/to/data/import_treenode_edge_0.csv' WITH (FORMAT csv);
  ...

  COMMIT;


  -- Enable all indices for all relevant indexed tables
  UPDATE pg_index
  SET indisready=true
  FROM indexed_table it
  WHERE indrelid = it.rel;


  -- Reindex tables. For large tables it is faster to create indices manually in
  -- parallel.
  REINDEX TABLE class_instance;
  REINDEX TABLE class_instance_class_instance;
  REINDEX TABLE treenode;
  REINDEX TABLE treenode_edge;
  REINDEX TABLE connector;
  REINDEX TABLE connector_geom;
  REINDEX TABLE treenode_connector_edge;

In this example, the format of the loaded CSV files has to match the table
definition exactly and is assumed those CSV files are created by a separate
process.

Unlogged tables
---------------

It is possible to import into ``unlogged`` (no WAL) tables to speed up the
process. If the table is written to during regular use it is advisable to use
``logged`` tables for crash safity. ``logged`` tables are also needed for
replication. To create a logged table from an unlogged one, it can safe some
time to set the following settings::

  wal_level = minimal
  archive_mode = off
  max_wal_senders = 0

This allows bypassing the WAL as explained in the `Postgres documentation
<https://www.postgresql.org/docs/11/populate.html#POPULATE-PITR>`_ if the new
table is created and populated in one statment. To that the new ``logged`` table
needs to match the ``unlogged`` table definition. Using a separate table rather
than ``SET logged`` on the original table allows Postgres to free up the space
used by the ``unlogged`` table *without* running ``VACUUM FULL``::

  -- Create WAL unlogged treenode_edge table to import

  -- Create a WAL logged copy of that table. With "wal_level = minimal" this can
  -- bypass the WAL for this operation:
  CREATE TABLE treenode_edge_logged (id, project_id, edge)
  AS select id, project_id, edge from treenode_edge;

  -- Add missing constraints
  ALTER TABLE treenode_edge_logged ALTER COLUMN id SET NOT NULL;
  ALTER TABLE treenode_edge_logged ALTER COLUMN project_id SET NOT NULL;
  ALTER TABLE treenode_edge_logged ADD CONSTRAINT treenode_edge_logged_pkey PRIMARY KEY (id);

  -- Drop unlogged table and rename logged table
  DROP TABLE treenode_edge;
  ALTER TABLE treenode_edge_logged RENAME TO treenode_edge;
  --
