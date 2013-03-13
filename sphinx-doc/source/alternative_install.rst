.. _alternative-install:

Alternative web and WGSI server installation
============================================

Of course, using Apache and its WSGI module (mod_wsgi) is not the only
way to run CATMAID. There are many web and WSGI servers available.
This section is intended to provide information on such alternatives.

The installation instructions provided here, assume that you have set up
the database and Django as described in the standard installation
instructions.

Setup based on Nginx and Gevent
-------------------------------

`Nginx  <http://nginx.org/>`_ is a web server with focus on high performance
and concurrency while maintaining a low memory footprint. However, it is
(by default) not a WSGI server and one needs to set this up separately. Here,
we will use `Gevent <http://gevent.org/>`_ to provide this functionality. It
is a WSGI server is based on Python `coroutines <http://en.wikipedia.org/wiki/Coroutine>`_
and `greenlets <http://greenlet.readthedocs.org/en/latest/>`_.

Of course, you need to install Nginx. In Debian based distributions, this can
be done with::

  sudo apt-get install nginx

Nginx can be started after this. Additionally, you need to make sure a FastCGI
PHP server is installed. Here we assume PHP-FPM to be available and listing on
the unix socket *unix:/run/php-fpm/php-fpm.sock*.

Gevent in turn is a Python module. To make it usable, activate the *virtualenv*
and install Gevent by running::

  pip install gevent

After this, Gevent is usable. In the next sections we will configure both,
the web and the WSGI server.

Nginx configuration
###################

A good general introduction to Nginx configuration can be found
`here <http://blog.martinfjordvald.com/2010/07/nginx-primer/>`_. In the
following, a Nginx configuration is provided to give access to CATMAID::

  upstream catmaid-wsgi {
      server 127.0.0.1:8080;
  }

  server {
      listen 80;
      server_name <CATMAID-host>

      root   <CATMAID-path>/httpdocs;

      location / {
          index  index.html;
      }

      # Give access to Django's static files
      location /dj-static/ {
         alias <CATMAID-path>/django/static/;
      }

      # Route all CATMAID Django WSGI requests to the Gevent WSGI server
      location /dj/ {
          proxy_pass http://catmaid-wsgi/;
          proxy_redirect http://catmaid-wsgi/ http://$host/;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      }

      # Let PHP-FPM deal with PHP files
      location ~ \.php$ {
          fastcgi_pass   unix:/run/php-fpm/php-fpm.sock;
          fastcgi_param  PHP_VALUE "include_path=<CATMAID-path>/inc:.";
          fastcgi_index  index.php;
          include        fastcgi.conf;
      }
  }

The first block (upstream) defines where the Gevent server will be available.
In this case, we assumed we can access it under 127.0.0.1:8080. The server block
defines the actual web server. There you have to adjust the *<CATMAID-host>* to
where the CATMAID instance should be available (e.g. catmaid.example.org). Next,
the root path of your CATMAID installation needs to replace the *<CATMAID-path>*
place-holder. The first location block defines an index page when the root of
your *<CATMAID-host>* is requested. The second block gives access to Django's
static files. The next location block passes all requests that start with */dj/*
to the WSGI server defined before. An the last location block allows the
execution of PHP scripts. Note that you need to replace in the PHP block
*<CATMAID-path>* as well.

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
  from django.core.handlers.wsgi import WSGIHandler as DjangoWSGIApp
  from django.core.management import setup_environ
  from gevent.wsgi import WSGIServer
  import sys
  import settings

  setup_environ(settings)

  def runserver():
      # Create the server
      application = DjangoWSGIApp()
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

