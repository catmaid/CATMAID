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
