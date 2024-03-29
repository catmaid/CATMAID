.. _database_admin:

Postgres administration
=======================

This is a collection of some common and uncommen database administration tasks.

Create a read-only database user
--------------------------------

This is useful for some independent analysis tasks. Assuming the CATMAID
database is called ``catmaid`` and the read-only user should be called
``catmaid_read_only``, login to Postgres and run the following::

  CREATE ROLE catmaid_read_only WITH LOGIN PASSWORD 'a-very-strong-password' NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION VALID UNTIL 'infinity';
  \c catmaid
  GRANT CONNECT ON DATABASE catmaid TO catmaid_read_only;
  GRANT USAGE ON SCHEMA public TO catmaid_read_only;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO catmaid_read_only;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO catmaid_read_only;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public to catmaid_read_only;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO catmaid_read_only;

Copy data from other (CATMAID) database
---------------------------------------

Postgres makes it possible to work with other databases directly using its
foreign data wrappers. This alles for instance to copy user accounts or tracing
data from one CATMAID intance to another on the database level. In order to
use data from other databases, one has to create a foreign data wrapper first::

   CREATE EXTENSION postgres_fdw;
   CREATE SCHEMA remote_catmaid_fdw;
   CREATE SERVER remote_catmaid FOREIGN DATA WRAPPER postgres_fdw
     OPTIONS (dbname '<remote-catmaid-db>', port '5432', host 'localhost');
   CREATE USER MAPPING for CURRENT_USER SERVER remote_catmaid
     OPTIONS (user '<catmaid-user>', password  '<catmaid-pass>');

With this individual tables (or alternatively all) can be imported into the
local database::

    IMPORT FOREIGN SCHEMA public LIMIT TO (auth_user, auth_group,
      auth_user_group, auth_user_groups, catmaid_userprofile,
      guardian_userobjectpermission, guardian_groupobjectpermission)
    FROM SERVER remote_catmaid INTO remote_catmaid_fdw;

Now it's possible to select data from the remote source::

   SELECT * from remote_catmaid_fdw.auth_user;

Example of copying user accounts across instances
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To check if local users have the same ID/name combinations as remote users one
could now do::

    SELECT rau.*, au.* FROM remote_catmaid_fdw.auth_user rau
    JOIN auth_user au
      ON au.id = rau.id
    WHERE au.username <> rau.username;

    SELECT rag.*, ag.* FROM remote_catmaid_fdw.auth_group rag
    JOIN auth_group ag
      ON ag.id = rag.id
    WHERE ag.name <> rag.name;

    SELECT raug.*, aug.* FROM remote_catmaid_fdw.auth_user_groups raug
    JOIN auth_user_groups aug
      ON aug.id = raug.id
    WHERE aug.user_id <> raug.user_id OR aug.group_id <> raug.group_id;

    SELECT rcup.*, cup.* FROM remote_catmaid_fdw.catmaid_userprofile rcup
    JOIN catmaid_userprofile cup
      ON cup.id = rcup.id
    WHERE cup.user_id <> rcup.user_id;

    SELECT rguop.*, guop.* FROM remote_catmaid_fdw.guardian_userobjectpermission rguop
    JOIN guardian_userobjectpermission guop
      ON guop.id = rguop.id
    WHERE guop.user_id <> rguop.user_id
      OR guop.object_pk <> rguop.object_pk;

    SELECT rggop.*, ggop.* FROM remote_catmaid_fdw.guardian_groupobjectpermission rggop
    JOIN guardian_groupobjectpermission ggop
      ON ggop.id = rggop.id
    WHERE ggop.group_id <> rggop.group_id
      OR ggop.object_pk <> rggop.object_pk;

If these and similar queries return empty, remote data can be imported without
conflicts. If results are returned, a pragmatic and reasonably safe option would
be to move their IDs into negative number space, e.g::

    UPDATE auth_user_groups SET id = -id WHERE id IN (
      SELECT aug.id FROM remote_catmaid_fdw.auth_user_groups raug
      JOIN auth_user_groups aug
      ON aug.id = raug.id
      WHERE aug.user_id <> raug.user_id OR aug.group_id <> raug.group_id);

To see which users, groups, userprofiles and permissions would be imported,
use::

    SELECT rau.* FROM remote_catmaid_fdw.auth_user rau
    LEFT JOIN auth_user au ON au.id = rau.id
    WHERE au.id IS NULL;

    SELECT * FROM remote_catmaid_fdw.auth_group rag
    LEFT JOIN auth_group ag ON ag.id = rag.id
    WHERE ag.id IS NULL;

    SELECT * FROM remote_catmaid_fdw.auth_user_groups raug
    LEFT JOIN auth_user_groups aug
      ON aug.id = raug.id
    WHERE aug.id IS NULL
      OR aug.user_id <> raug.user_id
      or aug.group_id <> raug.group_id;

    SELECT * FROM remote_catmaid_fdw.catmaid_userprofile rcup
    LEFT JOIN catmaid_userprofile cup
      ON cup.id = rcup.id
    WHERE cup.id IS NULL;

    SELECT * FROM remote_catmaid_fdw.guardian_userobjectpermission rguop
    LEFT JOIN guardian_userobjectpermission guop
      ON guop.id = rguop.id
    WHERE guop.id IS NULL;

    SELECT * FROM remote_catmaid_fdw.guardian_groupobjectpermission rggop
    LEFT JOIN guardian_groupobjectpermission ggop
      ON ggop.id = rggop.id
    WHERE ggop.id IS NULL;

If this matches the expectation, this can now be imported::

    INSERT INTO auth_user
    SELECT rau.* FROM remote_catmaid_fdw.auth_user rau
    LEFT JOIN auth_user au ON au.id = rau.id
    WHERE au.id IS NULL;

    INSERT INTO auth_group
    SELECT rag.* FROM remote_catmaid_fdw.auth_group rag
    LEFT JOIN auth_group ag ON ag.id = rag.id
    WHERE ag.id IS NULL;

    INSERT INTO auth_user_groups
    SELECT raug.* FROM remote_catmaid_fdw.auth_user_groups raug
    LEFT JOIN auth_user_groups aug
      ON aug.id = raug.id
    WHERE aug.id IS NULL;

    INSERT INTO catmaid_userprofile
    SELECT rcup.* FROM remote_catmaid_fdw.catmaid_userprofile rcup
    LEFT JOIN catmaid_userprofile cup
      ON cup.id = rcup.id
    WHERE cup.id IS NULL;

    INSERT INTO guardian_userobjectpermission
    SELECT rguop.* FROM remote_catmaid_fdw.guardian_userobjectpermission rguop
    LEFT JOIN guardian_userobjectpermission guop
      ON guop.id = rguop.id
    WHERE guop.id IS NULL;

    INSERT INTO guardian_groupobjectpermission
    SELECT rggop.* FROM remote_catmaid_fdw.guardian_groupobjectpermission rggop
    LEFT JOIN guardian_groupobjectpermission ggop
      ON ggop.id = rggop.id
    WHERE ggop.id IS NULL;

In case such imports are performed, it is important to reset the ID sequence
coutners for all modified tables if they haven't been set manually to something
else already::

    SELECT setval('auth_user_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM auth_user;
    SELECT setval('auth_group_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM auth_group;
    SELECT setval('auth_user_groups_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM auth_user_groups;
    SELECT setval('catmaid_userprofile_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM catmaid_userprofile;
    SELECT setval('guardian_userobjectpermission_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM guardian_userobjectpermission;
    SELECT setval('guardian_groupobjectpermission_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM guardian_groupobjectpermission;

Alterantively, if such a sync operation is happening repeatedly, it can be
convenient to set the ID sequences of the target database to a different range,
e.g. to start new IDs only with enough headroom to the repeated imports.
