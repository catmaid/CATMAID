.. _administering:

Administering a CATMAID Instance
================================

This section presents information on how to update a running CATMAID
instance and how to backup/restore its database. These administrative
tasks might be needed from time to time. Newer versions of
CATMAID (obviously) often include bug fixes and new features.

Updating to a newer version
---------------------------

Before updating to a newer version, please make sure that CATMAID is
not currently running and that you have a backup of your current
database state.

You may be asked to upgrade the database in the release notes for the
versions between your current and your target version. If this is the
case, follow those instructions first (after doing a database backup and
stopping CATMAID). 

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
origin's master branch using the "--rebase" option. If you are familiar
with git branches, you may prefer to switch to the maintenance/RELEASE
branch for your target version (if you do this, you'll switch branches
again the next time you do an upgrade).

Have a careful look at the required steps to update
your current version to the target version. Both ``CHANGELOG.md`` and
``UPDATE.md`` provide this information, the latter in a more condensed
form. It is also available :ref:`here <update>`. If there are extra steps
required, apply them as directed. You should read these for every version
after your current version up to your target version.

Then move into the Django sub-directory::

   cd django

Activate the `virtualenv`::

   source env/bin/activate

Update Python packages::

   pip install -r requirements.txt

Synchronize the Django environment with the database::

   ./projects/manage.py migrate

Collect new and changed static files::

   ./projects/manage.py collectstatic -l

Finally, start the CATMAID process, and visit it in your browser to ensure
it is functioning. When done, if you have other work to do on the system, you
can close the virtualenv as follows::

   deactivate

.. note::

   Updating PostGIS on your host system could cause CATMAID to stop working. See
   :ref:`here <faq-postgis-update-problems>` for how to fix this.

.. note::

   Updating from a CATMAID release before 2015.12.21 (with applied database
   migrations) requires to update to release 2015.12.21 first, apply all
   database migrations and then continue with the release you actually want.
   With the newer version, you have to then fake the initial migration:
   ``manage.py migrate catmaid --fake 0001_initial``.

Backup and restore the database
-------------------------------

Backing CATMAID's database up as well as restoring it, is currently a
manual process. Also keep in mind that a certain database state is
related to a certain source code version. Reflecting the commit name
in the backup name, might therefore be a good idea. A mismatch might
cause some trouble when a database backup is used that includes
migrations that are not present in the selected CATMAID version.

To backup the complete database (here named "catmaid") except for tables that
can be materialized from existing data (to save space)::

    pg_dump -Fc --clean -U <CATMAID-USER> catmaid -f catmaid_dump.sql

This produce a file named ``catmaid_dump.sql`` that can be used to restore a
full CATMAID instance. The file is in Postgres specific format to improve
loading speed and restoration options.

To restore the dumped database into a database named "catmaid" (which would have
to be created as described in the basic install instructions)::

    psql -U <CATMAID-USER> -d catmaid -f catmaid_dump.sql

Both commands will ask for the password. Alternatively, you can use the
scripts ``scripts/database/backup-database.py`` and
``scripts/database/revert-database.py``, which do the same
thing. Those don't ask for a password, but require a
``.pgpass`` file (see `PostgreSQL documentation
<http://www.postgresql.org/docs/current/static/libpq-pgpass.html>`_).

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

3. Analyze database, for faster restoration of materialzied views::

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

Modifying the database directly
-------------------------------

To avoid database triggers firing during direct database modifications, the
following SQL can be used to disable triggers temporarily::

  SET session_replication_role = replica;
  
  /* Do your edits */
  
  SET session_replication_role = DEFAULT;


.. _custom-code:

Adding custom code
------------------

CATMAID supports adding custom code to its front end. This can be used to
create custom tools separate from upstream development, which can make
administration easier: To do so, collect your custom JavaScript files in a
folder and add their filenames to the ``settings.py`` array variable
``STATIC_EXTENSION_FILES``, for instance::

    STATIC_EXTENSION_FILES += ('test.js', )

Next you will have to instruct your web-server to make this folder available
through the URL defined in ``STATIC_EXTENSION_URL``, which defaults to
"/staticext/"). CATMAID will then try to load those files after its own files.

.. _performance-tuning:

Performance tuning
------------------

There are various application involved to make CATMAID work: A web-server/load
balancer, a WSGI server to run the Python back-end and a PostgreSQL database
server. The configuration of all of them can be optimized to experience better
performance. The following list of suggestions is not exhaustive and if you have
suggestions we are happy to hear about them.

Operating system and infrastructure
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* In conjunction with the shared memory setting of PostgreSQL (see below), one
  should increase the kernel's shared memory limit. It defines how much memory
  can be used as a shared resource by different processes. A rule of thumb is
  that one should use about 25% of the system's RAM, but if the machine is
  equipped with plenty of RAM one should be fine for most setups with 4GB (or
  even less). You  can check this kernel setting with ``sysctl kernel.shmmax``.
  The default for most distributions is in the range of kilobytes and megabytes.

* The partition that is hosting the image tiles should be mounted with the
  ``noatime`` option. This makes sure no access time is written every time an
  image file is read. Alternatively, you can use ``chattr`` to set this option
  for individual files and folders.

* If LDAP is used to authenticate users and to check permissions on the server
  CATMAID is running or the image data is loaded from, LDAP queries should be
  cached locally. Otherwise, an LDAP request will be made every time a file is
  accessed.

* If the your server has a lot of memory, the Linux kernel defaults for the
  threshold for writing dirty memory pages to disk are too high (10% of the
  available memory for start writing out, 20% for absolute maximum before I/O
  blocks until write-out is done). To avoid large write-out spikes, it is
  advisable to have the kernel start writing out dirty pages after a lower
  threshold, e.g. 256MB: ``vm.dirty_background_bytes = 268435456``. Also, the
  threshold for the absolute maximum dirty memory threshold before I/O blocks
  until the write-out is finished should be lowered, to e.g. 1GB:
  ``vm.dirty_bytes = 107374182``.

* The kernel should also be discouraged from swapping cached data by setting
  ``vm.swappiness = 10``.

Webserver
^^^^^^^^^

* The access log should be turned off and only critical errors should be written
  to the log. CATMAID can produce a lot of requests and writing every single one
  to disk, especially if multiple users use CATMAID, can be a real performance
  hit.

* Make use of the `HTTP/2 <https://http://en.wikipedia.org/wiki/HTTP/2>`_ protocol.
  Modern browsers and webservers support it and it only requires you to set up
  SSL/TLS as an additional step before activating it. Through multiplexing,
  compression and prioritization much better use of single connections. Requests
  can be answered more quickly and CATMAID will feel more responsive.

* A cache server like Varnish can be beneficial on the machine that serves the
  image data. If multiple users load the same image data, it will reduce the
  number of times image data has to be loaded from the hard drive.

* Have the webserver transfer data with GZIP. Make sure this includes JSON
  data with the content-type ``application/json`` and binary data with the
  content-type ``application/octet-stream``. In nginx, you can include both by
  adding ``application/json`` and ``application/octet-stream`` to the
  ``gzip_types`` setting.

* The CATMAID web-client can send large requests to the server. Increasing the
  web-server's request buffer can prevent writing such requests temporarily to
  disk. A buffer of 512kB should be plenty. In Nginx, this can be done with
  ``client_body_buffer_size 512k;``

* Request responses generated by CATMAID can be large as well. Increasing the
  webserver's buffers to match common response sizes can increase performance
  quite a bit if the buffer is large enough for the webserver to avoid writing
  CATMAID's response temporarily to a file and clients have access to a fast
  connection. For Nginx this means increasing both ``proxy_buffer_size`` and
  ``proxy_buffers``. The former is used for the response headers only and
  can be (much) lower: ``proxy_buffer_size 64k;``. The latter however defines
  how many buffers of what size can be used for a single connection. For
  instance, if the uncompressed (!) response of a typical spatial query for
  neurons is 1.5-2MB in size, allowing a 2MB proxy buffer per connection would
  help performance. If you have enough memory available, you could set this with
  ``proxy_buffers 512 4k;`` (512 4k pages equals 2MB). Make sure there is enough
  memory available: for 100 active connections this proxy buffer setting would
  require already 2GB.

* The webserver should mark image tiles to not expire so that they can be cached
  by a client. If the image data is public, one could let the webserver also set
  the ``Cache-Control: public`` header for the images.

* To not require clients to ask every minute for particular updates (like new
  messages) use an ASGI server like we describe :ref:`here <websockets>`. This
  reduces some basline level of requests.

Database management system
^^^^^^^^^^^^^^^^^^^^^^^^^^

* PostgresSQL's shared memory setting should match what is allowed by the
  kernel. So if you set your kernel to allow 4GB (see above), Postgres should
  use make use of it. This can be adjusted with the setting ``shared_buffers`` in
  ``postgresql.conf``.

* Keeping statistics of the CATMAID tables up to date is very important. These
  statistics are used by the query planer to decide about the optimal
  realization of a query. This can be done manually by calling ``VACUUM
  ANALYZE`` while being connected to the CATMAID database in a psql shell. It is
  also possible (and advisable) to automate this with by setting ``autovacuum =
  on`` in ``postgresql.conf``.

* According to the `Django manual
  <https://docs.djangoproject.com/en/1.6/ref/databases/#optimizing-postgresql-s-configuration>`_,
  Django expects the following parameters for its database connections:
  ``client_encoding: 'UTF8'``,  ``default_transaction_isolation: 'read committed'``
  and ``timezone: 'UTC'`` when ``USE_TZ`` is True, value of ``TIME_ZONE``
  otherwise (``USE_TZ`` is CATMAID's default). All of these settings
  can be configured in ``postgresql.conf`` or more conveniently per database
  user with `ALTER ROLE <http://www.postgresql.org/docs/current/interactive/sql-alterrole.html>`_.
  If these parameters are not the default, Django will do some additional
  queries to set these parameters for each new connection.  Having those
  defaults set will improve the database performance slightly.

CATMAID
^^^^^^^

* Make sure CATMAID is not running in debug mode by checking ``settings.py`` in
  ``django/projects/mysite``: It should contain ``DEBUG = False``. If you get a
  `Bad Request (400)` response, make sure you have set your ``ALLOWED_HOSTS``
  setting in the ``settings.py`` file correct.

* Set `Django's <https://docs.djangoproject.com/en/1.6/ref/databases/#persistent-connections>`_
  ``CONN_MAX_AGE`` option in the database settings of your ``settings.py`` file,
  if you don't use a greenlet based threading model for your WSGI server's
  workers (see `here <https://github.com/benoitc/gunicorn/issues/996>`_ for an
  explanation). This setting controls how long (in seconds) a database
  connection can be re-used. In the default configuration, this is set to ``0``,
  which causes every request to use a new database connection. To test if this
  setting can be used in your environment, set it to a value like ``60`` and
  monitor the number of database connections (e.g. with ``SELECT count(*) FROM
  pg_stat_activity;``). If this number matches your number of WSGI workers (plus
  your own ``psql`` connection), everything is fine. If the number increases
  over time, you should set ``CONN_MAX_AGE`` back to ``0``, because new
  connections are apparently not closed anymore (which can happen with greenlet
  based threading).

* If database connection pooling is used (see ``CONN_MAX_AGE`` above), it can
  help spatial query  performance to use prepared statements. These are created
  for each database connection and pose an overhead without connection pooling.
  To enable prepared statement add ``PREPARED_STATEMENTS = True`` to the
  ``settings.py`` file.

* Depending on the number of nodes per section, using a different spatial query
  type can help performance. By default CATMAID uses the so called ``postgis3d``
  node provider as query strategy. This can be changed to the alternative
  ``postgis2d`` node provider by adding ``NODE_PROVIDER = 'postgis2d'`` to the
  ``settings.py`` file. It is also possible to cache larger field of views on
  tracing data and only update this cache periodically. This can improve
  performance dramatically. Read more about it :ref:`here <node_providers>`.

* If there are too many nodes to be displayed with usable performance, the
  number of returned nodes can be limited. This can be done by setting
  ``NODE_LIST_MAXIMUM_COUNT = <number>`` in the ``settings.py`` file to a
  maximum number of nodes to be queried (e.g. 20000). If however a node limit is
  not really needed and most requests don't hit it, setting
  ``NODE_LIST_MAXIMUM_COUNT`` to ``None`` can slightly improve performance, too.

* If neuron reconstruction statistics are slow to compute, consider running the
  management command ``manage.py catmaid_populate_summary_tables`` to populate
  an optional statistics summary table. Consider running this command regularly
  over, e.g. over night using Celery or a cron job.

* If large client requests result in status 400 errors, you might need to raise
  the ``DATA_UPLOAD_MAX_MEMORY_SIZE`` setting, which is the maximum allowed
  request body size in bytes. It defaults to 10 MB (83886080).

* Consider using node grid cache for large tracing data set, which can speed up
  loading and supports level-of-detail as well as dynamic updates based on
  database events. Automatic cache updates require ``SPATIAL_UPDATE_NOTIFICATIONS``
  to be set to true in ``settings.py`` (default). If caching is not an option,
  make sure to set ``SPATIAL_UPDATE_NOTIFICATIONS = False`` if you deal with
  large skeletons (>50k nodes) to make operations like joins faster.

Making CATMAID available through SSL
------------------------------------

By default the connection between the CATMAID server and a browser is
unencrypted. This means data can be read and manipulated on the way between both
sides. To protect sensitive data like passwords and to improve security as a whole,
it is recommended to use SSL/TLS to encrypt this communication. Below you will
find notes on how to do this with Nginx.

The webserver is the first place where the configuration has to be changed.
Given that you created a certificate and key file, you would add the following
to your Nginx server configuration::

    server {
        listen 443;
        ...

        ssl on;
        ssl_certificate /etc/nginx/ssl/server.crt;
        ssl_certificate_key /etc/nginx/ssl/server.key;
        ssl_prefer_server_ciphers on;
        ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
        ssl_ciphers "EECDH+ECDSA+AESGCM:EECDH+aRSA+AESGCM:EECDH+ECDSA+SHA256:EECDH+aRSA+SHA256:EECDH+ECDSA+SHA384:EECDH+ECDSA+SHA256:EECDH+aRSA+SHA384:EDH+aRSA+AESGCM:EDH+aRSA+SHA256:EDH+aRSA:EECDH:!aNULL:!eNULL:!MEDIUM:!LOW:!3DES:!MD5:!EXP:!PSK:!SRP:!DSS:!RC4:!SEED";

        ...
    }

If you refer to certificates and keys in Nginx that it didn't know before, you
have to restart it (instead of reloading the configuration). The reason is that
the Nginx process drops privileges after loading and root permissions are
required to read the certificates and keys.

A good resource to test your configuration and to disable weak ciphers is
`Qualys SSL Labs <https://www.ssllabs.com/ssltest/>`_.

Django's ``settings.py`` has to be updated as well to make sure it will only
hand out session cookies and CSRF tokens on a secure connection::

    # This CATMAID instance is served through SSL/TLS. Therefore, send session
    # cookies only over HTTPS and don't add CSRF tokens for non-HTTPS connections.
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # Assume a secure connection, if the X-FORWARDED-PROTO header is set to
    # 'https'. This implies that one has to make sure this head is only set to
    # 'https' if the connection is actually secure.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

Please make also sure that
you override the ``X-Forwarded-Proto`` header passed to Django. It should only
contain "https" if the connection is actually secure. Consult the `Django
documentation
<https://docs.djangoproject.com/en/1.6/ref/settings/#std:setting-SECURE_PROXY_SSL_HEADER>`_
to read more about this.

With this you should be able to provide a secure connection to your CATMAID
server.
