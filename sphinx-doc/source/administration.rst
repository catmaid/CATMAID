.. _administering:

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
   ./projects/mysite/manage.py migrate

Collect new and changed static files::

   ./projects/mysite/manage.py collectstatic -l

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

To backup the database named "catmaid"::

    pg_dump --clean -U <CATMAID-USER> catmaid -f catmaid_dump.sql

To restore the dumped database into a database named "catmaid" (which would have
to be created like described in the basic install instructions)::

    psql -U <CATMAID-USER> -d catmaid -f catmaid_dump.sql

Both commands will ask for the password. Alternatively, you can use the
scripts ``scripts/database/backup-database.py`` and
``scripts/database/revert-database.py``, which basically do the same
thing. Those, however, don't ask for a password, but require a
``.pgpass`` file (see `PostgreSQL documentation
<http://www.postgresql.org/docs/current/static/libpq-pgpass.html>`_).

A cron job can be used to automate the backup process. Since this will be run as
the ``root`` user, no password will be needed. The root user's crontab file can
be edited with::

  sudo crontab -e

The actual crontab file is not meant to be edited directly, but only through the
``crontab`` tool. To run the above backup  command every night at 3am, the
following line would have to be added::

  0 3 * * * sudo -u postgres pg_dump --clean catmaid -f "/opt/backup/psql/catmaid_$(date +\%Y\%m\%d\%H\%M).sql"

This would create a new file in the folder ``/opt/backup/psql`` at 3am every
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
more complicated than this, it is recommendet to create a script file and call
this from cron.


.. _performance-tuning:

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

Performance tuning
------------------

There are various application involved to make CATMAID work: A web-server/load
balancer, a WSGI server to run the Python back-end and a PostgreSQL database
server. The configuration of all of them can be optimized to experience better
performance. The following list of suggestions is not exhaustive and if you have
suggestions we are happy to hear about them.

Operationg system and infrastructure
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
  image file is read.

* If LDAP is used to authenticate users and to check permissions on the server
  CATMAID is running or the image data is loaded from, LDAP queries should be
  cached locally. Otherwise, an LDAP request will be made every time a file is
  accessed.

Webserver
^^^^^^^^^

* The access log should be turned off and only critical errors should be written
  to the log. CATMAID can produce a lot of requests and writing every single one
  to disk, especially if multiple users use CATMAID, can be a real performance
  hit.

* Make use of the `SPDY <https://http://en.wikipedia.org/wiki/SPDY>`_ protocol.
  Modern browsers and webservers support it and it only requires you to set up
  SSL/TLS as an additional step before activating it. Through multiplexing,
  compression and prioritization much better use of single connections. Requests
  can be answered more quickly and CATMAID will feel more responsive.

* A cache server like Varnish can be beneficial on the machine that serves the
  image data. If multiple users load the same image data, it will reduce the
  number of times image data has to be loaded from the hard drive.

* Have the webserver transfer data with GZIP.

* The webserver should mark image tiles to not expire so that they can be cached
  by a client. If the image data is public, one could let the webserver also set
  the ``Cache-Control: public`` header for the images.

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
  otherwise (use of ``TIME_ZONE`` is CATMAID's default). All of these settings
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
