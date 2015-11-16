Frequently Asked Questions
==========================

I updated to Ubuntu 12.04 and I have postgres 8.4 and 9.1 installed on my system
--------------------------------------------------------------------------------

Remove all postgres version 8.4 packages (this removes also the databases).
Then change the port in /etc/postgresql/9.1/main/postgresql.conf to::

   port = 5432
   
Restart postgres::

   sudo /etc/init.d/postgresql restart
   
Now you should be able to call the ./scripts/createuser.sh script.

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

I get an error 500 response and in debug mode I see the error "libboost_python.so.1.56.0: cannot open shared object file: No such file or directory". (Or any other boost version) This might have started after a system update.*
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

It seems that the Boost library was updated and therefore one module that we
depend on has to be recompiled: pgmagick. Given you are within the
``virtualenv`` and in CATMAID's ``django`` directory, the following should fix
it::

    grep pgmagick requirements.txt | xargs pip install -I

This will reinstall (and recompile) the pgmagick module, using the version
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

