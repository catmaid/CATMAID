Frequently Asked Questions
==========================

My CATMAID instance is working in debug mode, but can't be reached in production. What is the problem?
------------------------------------------------------------------------------------------------------

If you see return code 400 (Bad Request), check the ``ALLOWED_HOSTS`` setting in
your Django configuration file::

    django/projects/mysite/settings.py

Since Django 1.5 this setting is present and should contain a list of all
host/domain names that your CATMAID instance is reachable under. Access will be
blocked if target host isn't found in this list. For more detail have a look at
the `Django documentation <https://docs.djangoproject.com/en/1.6/ref/settings/#allowed-hosts>`_.

Be aware that if you use Nginx and make a WSGI server available through an
*upstream* definition, the host that Django sees is the upstream's name. So this
is what you want to add to ``ALLOWED_HOSTS``. Alternatively, you can add a
``X-Forwarded-Host`` header when calling the upstream in a Nginx location block
to forward the original host to Django::

  proxy_set_header X-Forwarded-Host $host;

If you then instruct Django to use this header by setting ``USE_X_FORWARDED_HOST
= True`` in ``settings.py`` (see `doc <https://docs.djangoproject.com/en/1.8/ref/settings/#use-x-forwarded-host>`_),
you can add the original host name to ``ALLOWED_HOSTS``.

I have more than one CATMAID instance running on the same (sub-)domain, but in different folders. When I open different instances in the same browser at the same time, one session is always logged out. Why?
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Django uses the cookie name 'sessionid' for its session information in a cookie
called 'csrftoken' for CSRF information. This is fine if only one instance is
running on a certain domain. If, however, multiple instances run on the same
domain, this naming scheme fails. The same cookie name is then used for both
instances, which leads to the logout in all but one instances if the multiple
instances are opened in the same browser.

To fix this, either regenerate your settings.py file with a recent CATMAID
version or manually set different names for the relevant cookies in all your
``settings.py`` files by overriding the variables ``SESSION_COOKIE_NAME`` and
``CSRF_COOKIE_NAME``. Recent CATMAID versions do this automatically, based on
the specified sub-folder.


I get an error 500 response and in debug mode I see the error "libhdf5.so.8: cannot open shared object file: No such file or directory". This might have started after the system update.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Apparently, your system's HDF5 library was changed. Therefore, the Python
bindings that are used by CATMAID have to be updated. Given you are within the
``virtualenv`` and in CATMAID's ``django`` directory, the following should fix
it::

    grep h5py requirements.txt | xargs pip install -I

This will reinstall (and recompile) the HDF5 python bindings with the version
specified in our dependency file (``requirements.txt``).


.. _faq-postgis-update-problems:

CATMAID stopped working after PostGIS update
--------------------------------------------

Updating PostGIS on your host system could cause CATMAID to stop working. You
might see errors like::

   django.core.exceptions.ImproperlyConfigured: Cannot determine PostGIS
   version for database "catmaid". GeoDjango requires at least PostGIS
   version 1.3. Was the database created from a spatial database template?

This can happen when old PostGIS library files are removed and PostGIS can't
find what it expects. To fix this, log into the CATMAID Postgres database and
update the PostGIS extension::

    sudo -u postgres psql -d <CATMAID-DB-NAME>
    ALTER EXTENSION postgis UPDATE;

No image data due to lack of Cross-Origin Resource Sharing (CORS) headers
-------------------------------------------------------------------------

You might get an error like this if you don't serve images with CORS header fields::

  Image from origin 'http://images.catmaid-host.org' has been blocked from
  loading by Cross-Origin Resource Sharing policy: No
  'Access-Control-Allow-Origin' header is present on the requested resource.
  Origin 'http://other.catmaid-host.org' is therefore not allowed access.
  """

This can be fixed by sending an access policy header along with the images,
coming in the form of this header field::

  Access-Control-Allow-Origin *

An example setup for Nginx can be found :ref:`here <nginx-image-data>`.

Nginx won't serve static files
------------------------------

Besides checking the Nginx configuration itself, make sure the files are
readable by the user running Nginx (e.g. ``www-data``).  Also, to serve static
files, Nginx needs execute permission on every directory in the path to those
files. To check this, the ``namei`` command can be very helpful, because it can
list permissions for each path component when called like this: ``namei -l
/path/to/static/files``.

Letsencrypt.org SSL certificate problems behind firewall
--------------------------------------------------------

There are usually two different ways firewalls attempt to block traffic related
to SSL certificate creation/renewal: either outbound traffic from the server to
letsencrypt.org is blocked or, 2. inbound traffic from letsencrypt.org to a
server is bocked. Of course, both can happen at the same time. Both problems
have different workarounds, each of which will be discussed below.

1. Blocked outbound traffic will usually manifest itself as letsencrypt.org
   being unreachable from the server, connections can't be established. To work
   around this, a SOCKS proxy can be created using SSH and all HTTP requests can
   be routed through this proxy. This proxy server needs to be reachable by SSH
   and should be able to connect to letsencrypt.org::

     # Make sure all dependencies are installed
     pip3 install -U pysocks urllib3[socks] requests[socks]

     # Create a tunnel on local port 7777 to the defined host
     ssh -D 7777 -f -C -q -N user@example.com

     # Define proxy through HTTP[S]_PROXY environment variables
     export https_proxy=socks5://127.0.0.1:7777 http_proxy=socks5://127.0.0.1:7777

     # Run certbot update
     certbot renew --nginx -d my.server.org

2. Inbound traffic blocks usually lead to 503 errors and can be replicated in
   the browser for acme-protocol URLS. To circumvent this, a different challenge
   type has to be used with certbot. Normally, there are only DNS based and HTTP
   based challenges available. Inbound blocks seem to be implemented often by
   blocking well known URLS from the ACME protocol. One workaround for this is
   to install a new challenge method that uses HTTPS, and therefore hides URLS.
   This can be done using the `certbot-ualpn
   <https://github.com/ndilieto/certbot-ualpn>` plugin for ``certbot``. In order
   to do this follow the directions given in the repository. Basically, a new
   ``certbot`` plugin has to be compiled manually and the tool ``ualpn`` has to
   be put in-between incoming requests on port 443 and the webserver, e.g. Nginx::

     # Install uALPN
     mkdir uacme
     wget -O - https://github.com/ndilieto/uacme/archive/upstream/latest.tar.gz | tar zx -C uacme --strip-components=1
     cd uacme
     ./configure
     make
     sudo make install
     cd ..

   Update Nginx SSL configuration to listen on port 4443::

     server {
       listen 127.0.0.1:4443 ssl proxy_protocol;
       set_real_ip_from 127.0.0.0/24;
       real_ip_header proxy_protocol;
       proxy_set_header X-Real-IP $proxy_protocol_addr;
       proxy_set_header X-Forwarded-For $proxy_protocol_addr;
       ...

  Run ``ualpn`` to answer SSL requests::

    sudo ualpn -v -d -u nobody:nogroup -c 127.0.0.1@4443 -S 666

  Install ``certbot``::

    git clone https://github.com/certbot/certbot
    cd certbot
    python tools/venv3.py
    source venv3/bin/activate
    cd ..

  Install `certbot-ualpn``::

    git clone https://github.com/ndilieto/certbot-ualpn
    cd certbot-ualpn
    python setup.py install
    cd ..

  Make sure to add the ``pref_challs`` parameter of your certbot renewal
  file to include ``tls-alpn-01`` as ``pref_challs`` as possible challenge
  method::

    pref_challs = http-01, tls-alpn-01

  Finally, use ``certbot`` in this environment like usual, e.g.::

    certbot --agree-tos \
      --register-unsafely-without-email \
      --staging \
      -a ualpn \
      -d www.example.com renew
