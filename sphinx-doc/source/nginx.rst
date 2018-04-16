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
      socket = /run/uwsgi/app/catmaid/socket
      mount = /<catmaid-relative-url>/=<catmaid-path>/django/projects/mysite/django.wsgi
      manage-script-name = true
      workers = 2
      threads = 2
      disable-logging = true

   Note that each thread of each worker will typically have one database
   connection open. This means Postgres will try to allocate a total of about
   workers * threads * work_mem (see ``postgresql.conf``). Make sure you have
   enough memory available here.

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
    (replace this with ``/`` if you don't run in a subdirectory)::

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

.. _nginx-image-data:

Image data
----------

Serving image data works the same way as serving CATMAID static data. However,
you might want to add a so called
`CORS <https://en.wikipedia.org/wiki/Cross-origin_resource_sharing>`_ header to
your Nginx location block::

 Access-Control-Allow-Origin *

Without this header, only a CATMAID instance served from the *same* domain name
as the image data will be able to access it. If the image data should be accessed
by CATMAID instances served  on other domains, this header is required. A
typical tile data location block could look like this::

 location /tiles/ {
   # Regular cached tile access
   alias /path/to/tiles/;
   expires max;
   add_header Cache-Control public;
   # CORS header to allow cross-site access to the tile data
   add_header Access-Control-Allow-Origin *;
 }

Besides adding the CORS header, caching is also set to be explicitly allowed,
which might be helpful for data that doesn't change often.

Of course, like with other static files, Nginx must be able able read those
files and it needs execute permissions on every directory in the path to the
image data.

Setup based on Nginx and Gevent
-------------------------------

`Nginx  <http://nginx.org/>`__ is a web server with focus on high performance
and concurrency while maintaining a low memory footprint. However, it is
(by default) not a WSGI server and one needs to set this up separately. Here,
we will use `Gevent <http://gevent.org/>`_ to provide this functionality. It
is a WSGI server is based on Python `coroutines <http://en.wikipedia.org/wiki/Coroutine>`_
and `greenlets <http://greenlet.readthedocs.org/en/latest/>`_.

Of course, you need to install Nginx, and the libevent package if you will use gevent.
In Debian based distributions, this can be done with::

  sudo apt-get install nginx libevent-dev

Nginx can be started after this.

Gevent in turn is a Python module. To make it usable, activate the *virtualenv*
and install Gevent by running::

  pip install gevent

After this, Gevent is usable. In the next sections we will configure both
the web and the WSGI server.

Nginx configuration
###################

A good general introduction to Nginx configuration can be found
`here <http://blog.martinfjordvald.com/2010/07/nginx-primer/>`_. In the
following, a Nginx configuration is provided to give access to CATMAID:

.. code-block:: nginx

  upstream catmaid-wsgi {
      server 127.0.0.1:8080;
  }

  server {
      listen 80;
      server_name <CATMAID-HOST>;

      # Give access to Django's static files
      location /catmaid/static/ {
          alias <CATMAID-PATH>/django/static/;
      }

      # Route all CATMAID Django WSGI requests to the Gevent WSGI server
      location /catmaid/ {
          proxy_pass http://catmaid-wsgi/;
          proxy_redirect http://catmaid-wsgi/ http://$host/;
          # This is required to tell Django it is behind a proxy
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          # This lets Django know which protocol was used to connect and also
          # overrides the header a client who fakes it.
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }

This setup expects CATMAID to be accessible from a `catmaid` subdirectory
under the domain's root. To use this configuration when CATMAID lives on
the domain's root, just remove `/catmaid` from every location block (and
do the same in Django's settings.py, of course).

The first block (upstream) defines where the Gevent server will be available.
In this case, we assumed we can access it under `127.0.0.1:8080`. The server
block defines the actual web server.

There you have to adjust `<CATMAID-HOST>` to where your CATMAID instance
should be available (e.g. catmaid.example.org). The first location block
defines from where the static files should be served. The `<CATMAID-PATH>`
placeholder needs to be replaced with the absolute path to your CATMAID
folder. The second location block passes all requests to the WSGI server
defined before and allows therefore the execution of Django.

A note on the ``proxy_redirect`` command
****************************************

In general, this command modifies the *Location* and the *Refresh* HTTP header
fields in the header of a redirect reply of the proxied server. In our case
this is the WSGI server, running CATMAID. Redirects happen e.g. as the correct
response to HTTP POST request (which e.g. happen if you change something from
within the admin interface). The first URL gets replaced by the second one,
i.e.  ``http://catmaid-wsgi/`` with ``http://$host/``. The
`$host <http://wiki.nginx.org/HttpCoreModule#.24host>`_ variable is the header's
*Host* field and therefore the host CATMAID is running on. This makes the
outside world see the front end server in the request URLs---a good thing and
if CATMAID is *not* running in a subdirectory, one can remove this line and the
default behavior should just work. The
`default behavior <http://wiki.nginx.org/HttpProxyModule#proxy_redirect>`_
replaces the URL given to ``proxy_pass`` with the path of the whole
``location`` block. When CATMAID doesn't live in a subdirectory, this is
equivalent to:

.. code-block:: nginx

  proxy_redirect http://catmaid-wsgi/ /;

This is fine, so the line could be removed, but it gets a problem if CATMAID
lives in a subdirectory. The default behavior would then translate to (wrt. to
the configuration above):

.. code-block:: nginx

  proxy_redirect http://catmaid-wsgi/ /catmaid/;

If CATMAID lives in a subdirectory, you likely also have the
``FORCE_SCRIPT_NAME`` property in your settings file set accordingly (e.g. to
``/catmaid``). In short, this leads Django to prepend every generated URL with
this path. If in a subdirectory, it is needed for all types of HTTP
requests---not only, but also for redirects. This in turn results in prepending
the subdirectory twice for redirect requests: 1. Django does it due to
``FORCE_SCRIPT_NAME`` 2. Nginx does it when ``proxy_redirect`` is used with its
default behavior (e.g. if left out). To fix this, the rewrite of proxies
redirects has to be explicitly set to rewrite the WSGI URL to ``$host`` or to
``/``, i.e. to:

.. code-block:: nginx

  proxy_redirect http://catmaid-wsgi/ http://$host/;

Therefore, it is is part of the above configuration.

Gevent run script
#################

To start Gevent, a small Python script is used. It is best to place it in::

  <CATMAID-path>/django/projects/mysite/

There, you put the following lines into a file (e.g. run-gevent.py)::

  #!/usr/bin/env python

  # Import gevent monkey and patch everything
  from gevent import monkey
  monkey.patch_all(httplib=True)

  # Import the rest
  from django.core.wsgi import get_wsgi_application
  from django.core.management import setup_environ
  from gevent.wsgi import WSGIServer
  import sys
  import settings

  setup_environ(settings)

  def runserver():
      # Create the server
      application = get_wsgi_application()
      address = "127.0.0.1", 8080
      server = WSGIServer( address, application )
      # Run the server
      try:
          server.serve_forever()
      except KeyboardInterrupt:
          server.stop()
          sys.exit(0)

  if __name__ == '__main__':
      runserver()

If executed, this will start a Gevent server on IP 127.0.0.1 and port 8080.
Adjust those values to your liking.

Having configured and started both servers, you should now be able to access
CATMAID.

Setup based on Nginx and Gunicorn
---------------------------------

For using the Gunicorn WSGI server, the same Nginx configuration
can be used as that given above for use with gevent.  (You may
need to change the port, however.)  As an example of how to
start Gunicorn, there is a upstart script, suitable for Ubuntu,
in ``django/projects/mysite/gunicorn-catmaid.conf``.  You would
copy this to ``/etc/init/``, customize it, and start Gunicorn
with ``initctl start gunicorn-catmaid``.  (Thereafter it will be
started on boot automatically, and can be restarted with
``initctl restart gunicorn-catmaid``.

.. _supervisord:

Using Supervisord for process management
----------------------------------------

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
  command = /opt/catmaid/django/env/bin/uwsgi --ini /opt/catmaid/django/projects/mysite/catmaid-uwsgi.ini
  user = www-data
  stdout_logfile = /opt/catmaid/django/projects/mysite/uwsgi.log
  redirect_stderr = true
  stopsignal = INT

  [program:catmaid-celery]
  command = /opt/catmaid/django/projects/mysite/run-celery.sh
  user = www-data
  stdout_logfile = /opt/catmaid/django/projects/mysite/celery.log
  redirect_stderr = true

  [group:catmaid]
  programs=catmaid-app,catmaid-celery

This of course expects a CATMAID instance installed in the folder
``/opt/catmaid/``. The ``stopsignal = INT`` directive is needed for ``uwsgi``,
because it interprets Supervisor's default ``SIGTERM`` as "brutal reload"
instead of stop. An example for a working ``run-celery.sh`` script can be found
:ref:`here <celery-supervisord>`. With the configuration and the scripts in
place, ``supervisord`` can be instructed to reload its configuration and start
the catmaid group::

  $ sudo supervisorctl reread
  $ sudo supervisorctl update
  $ sudo supervisorctl start catmaid:

For changed configuration files also both ``reread`` and ``update`` are
required.
