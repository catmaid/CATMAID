.. _nginx:

Setting Up Nginx for CATMAID
============================

We made good experience using Nginx together with uWSGI and this setup will get
be explained in more detail below. CATMAID will of course work with other
web-servers and UWSGI servers as well. Further down some information on
alternative setups using Gevent or Gunicorn are briefly discussed.

The installation instructions provided here, assume that you have set up the
database and Django as described in the
:ref:`standard installation <basic-installation>` instructions.

Setup based on Nginx and uWSGI
------------------------------

`uWSGI <http://projects.unbit.it/uwsgi/>`_ is a versatile WSGI server written in C,
and can serve as the middle layer between Nginx and CATMAID. It works well with
connection pooling and communicates efficiently with Nginx.

1. Install nginx, on Ubunto this would be::

      sudo apt-get install nginx

2. Being in CATMAID's ``virtualenv``, install uwsgi::

      pip install uwsgi

3. Create a new configuration file for ``uwsgi`` called ``catmaid-uwsgi.ini`` in
   CATMAID's ``django/projects/mysite/`` folder::

      ; uWSGI instance configuration for CATMAID
      [uwsgi]
      virtualenv = <path-to-virtual-env>
      chdir = <catmaid-path>/django
      socket = /var/run/catmaid/uwsgi.socket
      mount = /<catmaid-relative-url>=<catmaid-path>/django/projects/mysite/django.wsgi
      manage-script-name = true
      workers = 2
      threads = 2
      disable-logging = true

   Important: there should *not* be a trailing slash after the mountpoint
   ``/<catmaid-relative-url>`` above. Note also that each thread of each worker
   will typically have one database connection open. This means Postgres will
   try to allocate a total of about workers * threads * work_mem (see
   ``postgresql.conf``). Make sure you have enough memory available here.

4. Make sure that the ``socket`` directory from your ``.ini`` file
   (``/run/uwsgi/app/catmaid/`` above) exists and is readable and writable by
   the user that will run ``uwsgi``. You now should able to start
   uWSGI manually, running it as the current user::

      uwsgi --ini <catmaid-path>/django/projects/mysite/catmaid-uwsgi.ini

   Also note that Nginx needs to be able to access the created ``socket`` file
   to communicate with uWSGI. Either you run ``uwsgi`` as the user running Nginx
   (typically ``www-data``) or you give the Nginx user access on the file, e.g.
   by using a ``SetGID`` sticky bit on the ``socket`` folder so that all files
   created in it have automatically the default group of the Nginx running user
   assigned (typically ``www-data``).

5.  Here is a sample nginx configuration file, where ``<catmaid-relative-url> = /catmaid``
    (replace this with ``/`` if you don't run in a subdirectory). At the end of
    this chapter you will find a more complete example configuration::

       server {
         listen 80;
         server_name <CATMAID-HOST>;

         # Give access to Django's static files
         location /catmaid/static/ {
           alias <CATMAID-PATH>/django/static/;
         }

         # Route all CATMAID Django WSGI requests to uWSGI
         location /catmaid/ {
           include uwsgi_params;
           uwsgi_pass unix:///run/uwsgi/app/catmaid/socket;
         }
       }

.. note::

   To serve static files, Nginx needs execute permission on every directory in
   the path to those files (``<CATMAID-PATH>/django/static`` in example above).
   To check this, the ``namei`` command can be very helpful, because it can list
   permissions for each path component when called like this:
   ``namei -l <CATMAID-PATH>/django/static``.

   Also, it easy to miss, but important that the the relative URL in the
   ``mount`` line of the uWSGI configuration in step 3 has to be exactly the
   same as the uWSGI location block in the Nginx configuration in step 5,
   including whether there is an ending slash character.

.. _nginx-cors:

CORS
----

Serving image data works the same way as serving CATMAID static data. If the
image data is going to be accessed from websites that aren't served from the
same server, `CORS
<https://en.wikipedia.org/wiki/Cross-origin_resource_sharing>`_  has to be set
up. CORS stands for Cross Origin Resource Sharing and manages security of
web-clients accessing a particular resource. The same has to be done if a CATMAID
API should be accessible by other CATMAID servers.

In its simplest form, this can be done by adding the following line to an Nginx
``location`` block. It's only this simple though if no basic HTTP authentication is
in use::

 Access-Control-Allow-Origin *

Without this header, only a CATMAID instance served from the *same* domain name
as the image data will be able to access it. If the image data or CATMAID server
should be accessed by CATMAID instances served on other domains, this header is
required.

In order to support basic HTTP authentication and allow caching of preflight
requests, consider the following more complete example, which can be added to
any ``location`` block::

   # Require HTTP Bsic Auth, except for OPTIONS requests. This is needed
   # for CORS preflight requests. If no HTTP basic auth is wanted, this block
   # can be skipped.
   limit_except OPTIONS {
           auth_basic "Restricted";
           auth_basic_user_file /path/to/logins;
   }

   # Allow any origin (be more restrictive if wanted)
   add_header 'Access-Control-Allow-Origin' '*' always;
   # Credentials can be cookies, authorization headers or TLS client certificates
   add_header 'Access-Control-Allow-Credentials' 'true' always;
   # What methods should be allowed when accessing the resource in response to a preflight request
   add_header 'Access-Control-Allow-Methods' 'GET, POST, PATCH, PUT, DELETE, OPTIONS' always;
   # Access-Control-Allow-Headers response header is used in response to a preflight request to indicate which HTTP headers can be used during the actual request.
   add_header 'Access-Control-Allow-Headers' 'DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,X-Authorization,Authorization' always;

   # Preflighted requests. Headers from above are repeated, because of the
   # new context being created due to the return statement (causing above
   # headers to not be visible).
   if ($request_method = 'OPTIONS' ) {
           # We need to re-add these headers, because the return statement in the if-block causes this to be a different context.
           add_header 'Access-Control-Allow-Origin' '*' always;
           add_header 'Access-Control-Allow-Credentials' 'true' always;
           add_header 'Access-Control-Allow-Methods' 'GET, POST, PATCH, PUT, DELETE, OPTIONS' always;
           add_header 'Access-Control-Allow-Headers' 'DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,X-Authorization,Authorization' always;
           # Tell client that this pre-flight info is valid for 20 days
           add_header 'Access-Control-Max-Age' 1728000;
           add_header 'Content-Type' 'text/plain charset=UTF-8';
           add_header 'Content-Length' 0;
           return 204;
   }

Note that this allows any other client to access the API, if added to the
regular WSGI ``location`` block. It also makes sure preflight requests are
cached.

.. _nginx-image-data:

Image data
----------

Image data often is supposed to be accessed from many different clients, some of
which aren't originating from the same domain name the images are hosted. In
order to make this as seamless as possible, CORS needs to be set up (see
previous section). A typical tile data location block could look like the
example below. There a tile is looked up and if not found, a black default tile
is returned instead::

 location ~ /tiles/dataset/(.*)$ {
   # Try to open path to tile, fallback to black.jpg for non-existent tiles.
   try_files /data/dataset/tiles/$1 /data/dataset/tiles/black.jpg =404;

   expires max;
   add_header Cache-Control public;
   # CORS header to allow cross-site access to the tile data
   add_header Access-Control-Allow-Origin *;
   # Logging usually not needed
   access_log off;
 }

Besides adding the CORS header, caching is also set to be explicitly allowed,
which might be helpful for data that doesn't change often.

Of course, like with other static files, Nginx must be able able read those
files and it needs execute permissions on every directory in the path to the
image data.

.. _supervisord:

Process management with Supervisor
----------------------------------

Depending on your setup, you might use custom scripts to run a WSGI server,
Celery or other server components. In this case, process management has to be
taken care of as well, so that these scripts are run after a e.g. a server
restart. One way to do this is using ``supervisord``. We found it to be
reliable, flexible and easy to configure with multiple custom scripts. For each
program or program group a new configuration file has to be created::

  /etc/supervisor/conf.d/<name>.conf

Such a configuration file can contain information about individual programs and
groups of them (to manage them together). Below you will find an example of
a typical setup with a uWSGI start script and a Celery start script, both
grouped under the name "catmaid"::

  [program:catmaid-app]
  command = /home/catmaid/catmaid-server/django/env/bin/uwsgi --ini /opt/catmaid/django/projects/mysite/catmaid-uwsgi.ini
  user = www-data
  stdout_logfile = /home/catmaid/catmaid-server/django/projects/mysite/uwsgi.log
  redirect_stderr = true
  stopsignal = INT

  [program:catmaid-celery]
  command = /home/catmaid/catmaid-server/django/projects/mysite/run-celery.sh
  user = www-data
  stdout_logfile = /home/catmaid/catmaid-server/django/projects/mysite/celery.log
  redirect_stderr = true

  [group:catmaid]
  programs=catmaid-app,catmaid-celery

This of course expects a CATMAID instance installed in the folder
``/opt/catmaid/``. The ``stopsignal = INT`` directive is needed for ``uwsgi``,
because it interprets Supervisor's default ``SIGTERM`` as "brutal reload"
instead of stop. An example for a working ``run-celery.sh`` script can be found
:ref:`here <celery_supervisord>`__. With the configuration and the scripts in
place, ``supervisord`` can be instructed to reload its configuration and start
the catmaid group::

  $ sudo supervisorctl reread
  $ sudo supervisorctl update
  $ sudo supervisorctl start catmaid:

For changed configuration files also both ``reread`` and ``update`` are
required.

Maintenance mode
----------------

A simple way to display a maintenance mode page in case of an unreachable WSGI
server can be configured with the help of Nginx. First, a simple HTML error page
is made available as named location block. The CATMAID repo includes an example.
The main CATMAID entry location block then references the maintenance location
in the case of an unreachable upstream server::

  location / {
    # Handle error pages
    location @maintenance {
      root /home/catmaid/catmaid-server/docs/html;
      rewrite ^(.*)$ /maintenance.html break;
    }

    location /tracing/fafb/v14/ {
      error_page 502 503 504 @maintenance;
      include uwsgi_params;
      uwsgi_pass catmaid-fafb-v14;
      expires 0;
      # Add optional CORS header
    }
  }

.. _example_configs:

Example configurations
======================

This shows a more complete example configuration that we have used in a similar
form in production, including support for WebSockets (``/channels/`` endpoint).
The CORS config above is made available as ``/etc/nginx/snippets/cors.conf`` and
included in the CATMAID config::

  server {
    listen 443 ssl http2;

    server_name <CATMAID-HOST>;

    ssl_certificate <CERT-PATH>;
    ssl_certificate_key <CERT-KEY-PATH>;

    # Force browsers to keep using https instead of http
    add_header Strict-Transport-Security "max-age=604800";

    location ~ /tiles/dataset/(.*)$ {
      # Try to open path to tile, fallback to black.jpg for non-existent tiles.
      try_files /data/dataset/tiles/$1 /data/dataset/tiles/black.jpg =404;

      expires max;
      add_header Cache-Control public;
      # CORS header to allow cross-site access to the tile data
      add_header Access-Control-Allow-Origin *;
      # Logging usually not needed
      access_log off;
    }

    location /path/to/catmaid/static/ {
      alias /home/catmaid/catmaid-server/django/static/;
    }
    location /path/to/catmaid/files/ {
      alias /home/catmaid/catmaid-server/django/files/;
    }
    location /path/to/catmaid/channels/ {
      proxy_pass http://catmaid-fafb-v14-asgi/channels/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";

      proxy_redirect     off;
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Host $server_name;
    }
    location /path/to/catmaid/ {
      error_page 502 503 504 @maintenance;

      # Use default uWSGI params and unix socket
      include uwsgi_params;
      uwsgi_pass unix:///var/run/catmaid/uwsgi.socket;

      # No caching
      expires 0;
      add_header Cache-Control no-cache;

      # We need to allow larger requests for our setup (long neuron lists).
      client_max_body_size 20m;

      # Include open CORS config
      include snippets/cors.conf;
    }

    # Handle error pages
    location @maintenance {
      root /home/catmaid/public_html;
      rewrite ^(.*)$ /502.html break;
    }
  }

In order to makue sure, the in-memory filesystem folder
``/run/catmaid/uwsgi.socket`` is available after a reboot, the following can be
added to ``/etc/rc.local``::

  if [ ! -d /var/run/catmaid ]; then
    mkdir /var/run/catmaid/
    chown www-data:www-data /var/run/catmaid/
    chmod 755 /var/run/catmaid/
  fi

  # Make sure to exit rc.local with success code
  exit 0

The following uWSGI configuration allows zero-downtime updates and includes a
statistics socket for ``uwsgi-top``::

  ;uWSGI instance configuration for CATMAID
  [uwsgi]
  chdir = /home/catmaid/catmaid-server/django/
  virtualenv = /home/catmaid/catmaid-server/django/env
  pidfile = /var/run/catmaid/uwsgi.pid
  chmod-socket = 666
  socket = /var/run/catmaid/uwsgi.socket
  mount = /path/to/catmaid=/home/catmaid/catmaid-server/django/projects/mysite/django.wsgi
  manage-script-name = true
  uid = www-data
  gid = www-data
  #plugins = python
  workers = 8
  threads = 2
  disable-logging = true
  master = true

  # POST buffering
  post-buffering = 8192

  # Stats
  stats = /var/run/catmaid/uwsgi-stats.socket
  memory-report = true

  # During deploy, old and new master share the same socket. With vacuum=true,
  # old master would delete it during shutdown.
  vacuum = false

  # CATMAID in started in lazy-apps mode, i.e. each worker has a full copy of
  # the code in memory. Workers are managed by a master process (no emperor).
  master = true
  lazy-apps = true

  # Use this file as a flag to indicate the uwsgi process is ready to accept
  # connections.  The file can be looked up during deploy, but it has no meaning
  # afterwards. Even there, it is not strictly necessary. It's only a safety
  # check.
  hook-accepting1-once = write:/var/run/catmaid/catmaid.ready ok
  hook-as-user-atexit = unlink:/var/run/catmaid/catmaid.ready

  # Create two FIFO slots that we can switch between during runtime. A switch is
  # done by sending [0,10] to the current FIFO, by default the first (0) is
  # selected.
  master-fifo = /var/run/catmaid/new_instance.fifo
  master-fifo = /var/run/catmaid/running_instance.fifo

  # If there is a running instance, terminate it as soon as the first worker is
  # ready to accept connections.
  if-exists = /var/run/catmaid/running_instance.fifo
    hook-accepting1-once = writefifo:/var/run/catmaid/running_instance.fifo q
  endif =

  # On start-up, switch from the initial new_instance fifo queue to the
  # new_instance queue, by providing the new fifo's index (1) and update the PID
  # file (P).
  hook-accepting1-once = writefifo:/var/run/catmaid/new_instance.fifo 1P

Like in the initial example, the Supervisor config ties all programs together,
this time including the ASGI server Daphne::

  [program:catmaid-server-uwsgi]
  directory = /home/catmaid/catmaid-server/django/projects/
  command = /home/catmaid/catmaid-server/django/env/bin/uwsgi --ini /etc/uwsgi/apps-available/catmaid-server.ini
  user = www-data
  stdout_logfile = /var/log/catmaid/catmaid-server.log
  redirect_stderr = true
  stopsignal = INT

  [program:catmaid-server-daphne]
  directory = /home/catmaid/catmaid-server/django/projects/
  command = /home/catmaid/catmaid-server/django/env/bin/daphne --unix-socket=/var/run/catmaid/daphne.sock --access-log - --proxy-headers mysite.asgi:application
  user = www-data
  stdout_logfile = /var/log/catmaid/daphne-server.log
  redirect_stderr = true

  [program:catmaid-server-celery]
  directory = /home/catmaid/catmaid-server/django/projects/
  command = /home/catmaid/catmaid-server/django/env/bin/celery -A mysite worker -l info --pidfile=/var/run/catmaid/celery.pid
  user = www-data
  stdout_logfile = /var/log/catmaid/celery.log
  redirect_stderr = true

  [program:catmaid-server-celery-beat]
  directory = /home/catmaid/catmaid-server/django/projects/
  command = /home/catmaid/catmaid-server/django/env/bin/celery -A mysite beat -l info --pidfile=/var/run/catmaid/celery-beat.pid --schedule=/var/run/catmaid/celery-beat-schedule-catmaid-server
  user = www-data
  stdout_logfile = /var/log/catmaid/celery-beat.log
  redirect_stderr = true

  [group:catmaid-server]
  programs=catmaid-server-uwsgi,catmaid-server-daphne,catmaid-server-celery,catmaid-server-celery-beat
