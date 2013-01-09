.. _administering

Administering a CATMAID instance
================================

This section presents information on how to update a running CATMAID
instance and how to backup/restore its database. These administrative
tasks might be needed from time to time. Newer CATMAID versions of
CATMAID (obviously) often include bug fixes and new features.

Updating to a newer version
---------------------------

Before updating to a newer version, please make sure that CATMAID is
currently not running anymore and to have a backup of your current
database state. While not very likely to cause problems if not stopped,
it is recommended to not have the server running during the update. At
the end, your CATMAID instance is very likely to need a restart anyway.

Updating a CATMAID instance involves several steps: First move to your
CATMAID instance's root directory. This is also the root of CATMAID's
Git repository::

    cd <LOCAL-CATMAID-PATH>

Next, get the source code version you are interested in. The following
example will update to the current master branch of Git's "origin"
remote::

   git pull origin master

Note that this will merge into your local branch. So if you have local
commits that you want to keep you might want to rebase those on
origin's master branch. Then, move into the Django sub-directory::

   cd django

Activate the `virtualenv`::

   source env/bin/activate

Update Python packages::

   pip install -r pip-frozen

Synchronize the Django environment with the database::

   ./projects/mysite/manage.py syncdb

Finally, open the web-frontend of your CATMAID instance in a browser to
start the database migration. If you don't need it anymore, you can also
clone the virtualenv by calling::

   deactivate

Backup an restore the database
------------------------------

Backing CATMAID's database up as well as restoring it, is currently a
manual process. Also keep in mind that a certain database state is
related to a certain source code version. Reflecting the commit name
in the backup name, might therefore be a good idea. A mismatch might
cause some trouble when a database backup is used that includes
migrations that are not present in the selected CATMAID version.

To backup the database::

    pg_dump --clean -U <CATMAID-USER> catmaid -f catmaid_dump.sql

To restore the dumped database::

    psql -U <CATMAID-USER> -d catmaid -f catmaid_dump.sql

Both commands will ask for the password. Alternatively, you can use the
scripts ``scripts/database/backup-database.py`` and
``scripts/database/revert-database.py``, which basically do the same
thing. Those, however, don't ask for a password, but require a
``.pgpass`` file (see `PostgreSQL documentation
<http://www.postgresql.org/docs/current/static/libpq-pgpass.html>`_).
