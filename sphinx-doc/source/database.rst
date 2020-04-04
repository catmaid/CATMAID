.. _database_admin:

Postgres administration
=======================

This is a collection of some common and uncommen database administration tasks.

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
      auth_user_group, catmaid_userprofile, guardian_userobjectpermission,
      guardian_groupobjectpermission)
    FROM SERVER remote_catmaid INTO remote_catmaid_fdw;

Now it's possible to select data from the remote source::

   SELECT * from remote_catmaid_fdw.auth_user;

Example of copying user accounts across instances
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To check if local users have the same ID/name combinations as remote users one
could now do::

    SELECT * FROM remote_catmaid_fdw.auth_user rau
    JOIN auth_user au
      ON au.id = rau.id
    WHERE au.username <> rau.username
      OR au.id IS NULL;

    SELECT * FROM remote_catmaid_fdw.auth_group rag
    JOIN auth_group ag
      ON ag.id = rag.id
    WHERE ag.name <> rag.name;

    SELECT * FROM remote_catmaid_fdw.auth_user_groups raug
    JOIN auth_user_groups aug
      ON aug.id = raug.id
    WHERE aug.user_id <> raug.user_id OR aug.group_id <> raug.group_id;

    SELECT * FROM remote_catmaid_fdw.catmaid_userprofile rcup
    JOIN catmaid_userprofile cup
      ON cup.id = rcup.id
    WHERE cup.user_id <> rcup.user_id;

    SELECT * FROM remote_catmaid_fdw.guardian_userobjectpermission rguop
    JOIN guardian_userobjectpermission guop
      ON guop.id = rguop.id
    WHERE guop.user_id <> rguop.user_id
      OR guop.object_pk <> rguop.object_pk;

    SELECT * FROM remote_catmaid_fdw.guardian_groupobjectpermission rggop
    JOIN guardian_groupobjectpermission ggop
      ON ggop.id = rggop.id
    WHERE ggop.group_id <> rggop.group_id
      OR ggop.object_pk <> rggop.object_pk;

If these and similar queries return empty, remote data can be imported without
conflicts. If results are returned, a pragmatic and reasonabl safe option would
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
    WHERE aug.id IS NULL;

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
    SELECT * FROM remote_catmaid_fdw.auth_user rau
    LEFT JOIN auth_user au ON au.id = rau.id
    WHERE au.id IS NULL;

    INSERT INTO auth_group
    SELECT * FROM remote_catmaid_fdw.auth_group rag
    LEFT JOIN auth_group ag ON ag.id = rag.id
    WHERE ag.id IS NULL;

    INSERT INTO auth_user_groups
    SELECT raug.* FROM remote_catmaid_fdw.auth_user_groups raug
    LEFT JOIN auth_user_groups aug
      ON aug.id = raug.id
    WHERE aug.id IS NULL

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
coutners for all modified tables::

    SELECT setval('auth_user_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM auth_user;
    SELECT setval('auth_group_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM auth_group;
    SELECT setval('auth_user_groups_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM auth_user_groups;
    SELECT setval('catmaid_userprofile_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM catmaid_userprofile;
    SELECT setval('guardian_userobjectpermission_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM guardian_userobjectpermission;
    SELECT setval('guardian_groupobjectpermission_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM guardian_groupobjectpermission;
