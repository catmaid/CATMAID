.. _backup:

Backup and restore the database
===============================

Making a backup of CATMAID's Postgres database as well as restoring it, is
currently a manual process. Making backups can and should be automated through
the operating system though. Also keep in mind that a certain database state is
related to a certain source code version. This means after restoring a backup, a
database migration might still be needed. To avoid this, reflecting the commit
name in the backup name, might be a good idea. In most situations this shouldn't
be a concern though.

There are different ways of backing up CATMAID databases. Below three different
options are shown that increase with complexity, but also come with additional
benefits like less space requirements or point in time recovery (PITR). The
first method is easy to set up and if nothing else, this should be set up as a
basic backup strategy.

Modifying the database directly
-------------------------------

To avoid database triggers firing during direct database modifications during a
backup restore, it can be useful to disable database triggers. The following SQL
can be used to disable triggers temporarily::

  SET session_replication_role = replica;

  /* Do your edits */

  SET session_replication_role = DEFAULT;

Generally though, triggers are wanted and you should have a very good reason to
disable them.

Backup of complete databases using ``pg_dump``
----------------------------------------------

To backup a CATMAID database (here named ``catmaid``) execute::

    pg_dump -Fc --clean -U <CATMAID-USER> catmaid -f "catmaid-`date +%Y%m%d%H%M`.gz.dump"

This produces a file that includes a time stamp in its name (note the
backticks!) and that can be used to restore an entire CATMAID instance. The file
itself uses a Postgres specific format to improve loading speed and restoration
options.

To restore the dumped database into a database named ``catmaid`` (which would
have to be created as described in the basic install instructions, including the
database user referenced in the backup)::

    pg_restore -U <CATMAID-USER> -d catmaid catmaid_dump.sql

Both commands will ask for the password. Alternatively, you can use the
scripts ``scripts/database/backup-database.py`` and
``scripts/database/revert-database.py``, which do the same
thing. Those don't ask for a password, but require a
``.pgpass`` file (see `PostgreSQL documentation
<http://www.postgresql.org/docs/current/static/libpq-pgpass.html>`_).

Note that the ``pg_dump`` command above will not include any Postgres user
information. Like explained in the installation instructions, this would have to
be created first, before the ``pg_restore`` command is called. Alternatively,
users and other global database objects can be backed up as well in a separate
file::

    sudo -u postgres pg_dumpall --globals-only | gzip -9 > "globals.gz.dump"

Which in turn could be restored in a completely new database like this::

    zcat globals.gz.dump | sudo -u postgres psql

Afterwards the above ``pg_restore`` command can be executed without further
action.

Excluding materialized views from backup
----------------------------------------

Some tables in CATMAID contain data that is procomputed from other tables. These
"materialized views" can be omitted from backups and recreated after a backup
restore. This reduces the size of backups, but increases the time to reload
backups.

If e.g. ``-T treenode_edge`` is used with ``pg_dump``, the ``treenode_edge``
table is not part of the backup. Without any ``-T`` option, all tables are
exported and no additional steps are required after a restore.

The following tables can be ommitted from a backup (``-T`` option with
``pg_dump``), because they can be recreated after a backup is restored:
``treenode_edge``, ``treenode_connector_edge``, ``connector_geom``,
``catmaid_stats_summary``, ``node_query_cache``, ``catmaid_skeleton_summary``.

If one or more of these tables isn't part of a backup, it is required to backup
the schema separately by using ``pg_dump --schema-only``. When restoring, the
schema has to be restored first, because the tables not included in the backup
need to be created regardless. This command is followed by a ``pg_restore
--data-only --disable-triggers`` of the data dump.

If the ``-T`` option was used, the following command has to be executed
additionally to complete the import::

    manage.py catmaid_rebuild_edge_table

The script ``scripts/database/backup-min-database.sh`` can be used to export
all databases without including the tables mention above. To restore such a
backup, four steps are needed. Assuming the database name is ``catmaid``
(otherwise change the ``-d catmaid`` parameters), they are:

1. Import the schema, which includes all tables. Make sure the relevant
   database user exists already, or use the "globals" export file. The target
   database name is part of the filename and matches the original database::

   $ sudo zcat catmaid.schema.gz.dump | sudo -u postgres psql -p 5432

2. Import the data into the new database::

   $ sudo -u postgres pg_restore -p 5432 -d catmaid --data-only --disable-triggers \
          -S postgres --jobs=4 /path/to/backups/catmaid.all.gz.dump

3. Analyze the database, for faster restoration of materialzied views::

   $ sudo -u postgres psql -p 5432 -d catmaid -c "\timing on" -c "ANALYZE;"

4. Recreate all materializations::

   $ manage.py catmaid_rebuild_all_materializations


Automatic periodic backups
--------------------------

A cron job can be used to automate the backup process. Since this will be run as
the ``root`` user, no password will be needed. The root user's crontab file can
be edited with::

  sudo crontab -e

The actual crontab file is not meant to be edited directly, but only through the
``crontab`` tool. To run the above backup command every night at 3am, the
following line would have to be added::

  0 3 * * * sudo -u postgres pg_dump --clean catmaid -f "/opt/backup/psql/catmaid_$(date +\%Y\%m\%d\%H\%M).sql"

This creates a new file in the folder ``/opt/backup/psql`` at 3am every
night. It will fail if the folder isn't available or writable. The file name
includes the date and time the command is run and will look like
``catmaid_201509101007.sql``. Because ``cron`` treats ``%`` characters
differently, they have to be escaped when calling ``date``).  The first five
columns represent the date and time pattern when the command (``sudo -u postgres
...``) should be run.  It consists of `minute`, `hour`, `day of month`, `month`
and `day of week` with asterisks meaning `any`. For more information see the
manual pages of ``cron`` and ``crontab``. Because this command is run as `root`
and the actual ``pg_dump`` call is executed as `postgres` user with the help of
``sudo``, no database password is required. If your actual backup command gets
more complicated than this, it is recommended to create a script file and call
this from cron.

