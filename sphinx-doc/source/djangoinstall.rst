Installation of the DJANGO backend
==================================

The Django backend is required to use the neuron catalog, the
WebGL 3D viewer and the cropping tool among others.

Make sure that you have the following packages installed::

  sudo apt-get install python-virtualenv libpq-dev python-dev \
    libxml2-dev libxslt1-dev libjpeg-dev libtiff-dev libgraphicsmagick++3 \
    libgraphicsmagick++1-dev libboost-python1.42.0 h5py libboost-python1.42-dev

  sudo apt-get build-dep python-numpy python-h5py graphicsmagick \
    libimage-exiftool-perl

You first need to create a Python virtualenv. We suggest to create it
within the django subfolder. In this directory, run::

   virtualenv --no-site-packages env

Then run::

   source env/bin/activate

... to activate the virtualenv environment. Now, we need to install a set of
Python packages. Due to a dependency problem, we install NumPy separately::

   pip install numpy==1.6.1

Then install the rest of the packages at the right versions (the pip-frozen file
is in the django subdirectory)::

   pip install -r pip-frozen

Here is the list of packages and version required::

    Django==1.4
    distribute==0.6.25
    django-devserver==0.3.1
    h5py==2.0.1
    psycopg2==2.4.1
    sqlparse==0.1.3
    wsgiref==0.1.2
    networkx==1.6
    pgmagick==0.5.1
    celery==2.4.6
    django-celery==2.4.2
    kombu==2.0.0
    django-kombu==0.9.4
    PyYAML==3.10
    python-dateutil==2.1


*A note on the pgmagick module:* this is a wrapper for GraphicMagick (GM).
GM uses so-called delegates to support different file formats. Depending
of the presence of such a delegate a file format is supported or not. The
cropping tool uses GM through pgmagick and expects the libtiff and the
libjpeg delegates to be present. So make sure your GM installation
supports tiff (check e.g. with the help of "gm convert -list format").

If you want to be able to run the unit tests, you will need to allow
the catmaid database user (catmaid_user by default) to create new
databases.

Start a postgres shell with::

   sudo -u postgres psql

You can change the role  with::

   postgres=# ALTER USER catmaid_user CREATEDB;
   ALTER ROLE

... and you should also add this line at the top of
*/etc/postgresql/XversionX/main/pg_hba.conf* ::

    local test_catmaid catmaid_user md5

... and then restart PostgreSQL::

    sudo /etc/init.d/postgresql restart

Now copy settings.py.example to settings.py and edit it in the
following ways::

  * Set SECRET_KEY to a new value, as suggested in the comment.

  * Change the absolute path in TEMPLATE_DIRS to wherever the
    templates directory in this repository.

  * Change the STATICFILES_URL and STATICFILES_LOCAL variables to
    point to the right locations.

  * Change the absolute path in TMP_DIR to reflect space for
    temporary files (e.g. cropped stacks).  Make sure the web-server
    can read and write this folder.

  * Define CATMAID_DJANGO_URL to be the URL to your Django installation
    as seen from the outside.

  * Define HDF5_STORAGE_PATH to be the local path to stored HDF5
    files

Try running the server locally, with::

  ./manage.py runserver

... and visiting (you might have to be logged-in in your running CATMAID
instance::

  http://localhost:8000/[project_id]

If that works successfully, carry on to configure Apache.

Apache
------

First, install the wsgi Apache module::

   sudo apt-get install libapache2-mod-wsgi

Now copy *settings_apache.py*.example to settings_apache.py, and
customize that file.

Similarly, copy *django.wsgi.example* to *django.wsgi* and customize that file.

Then you need to edit your Apache configuration to point to that WSGI
file and set up the appropriate aliases.  An example is given here::

    Alias /catmaid/dj-static/ /home/alice/CATMAID/django/static/
    Alias /static/ /home/alice/CATMAID/django/static-admin/

    Alias /catmaid/dj /home/alice/CATMAID/django/projects/mysite/django.wsgi
    <Location /catmaid/dj>
            SetHandler wsgi-script
            Options +ExecCGI
    </Location>

    Alias /catmaid/ /home/alice/CATMAID/httpdocs/
    <Directory /home/alice/CATMAID/httpdocs/>

            php_admin_value register_globals off
            php_admin_value include_path ".:/home/alice/CATMAID/inc"
            php_admin_value session.use_only_cookies 1
            php_admin_value error_reporting 2047
            php_admin_value display_errors true

            Options FollowSymLinks
            AllowOverride AuthConfig Limit FileInfo
            Order deny,allow
            Allow from all

    </Directory>


And then you should be able to visit the neuron catalog::

    http://localhost/catmaid/dj/[project_id]

If you see an "Internal Server Error", make sure that you configured and
customized every file properly. You might also want to check the Apache error_log
for the error message and report it to the mailinglist.