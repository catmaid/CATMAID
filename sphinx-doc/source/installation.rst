.. _basic-installation:

.. note::

   These instructions describe installing CATMAID from source for
   long-term use. If you want to quickly try CATMAID for evaluation or
   demonstration purposes, consider using the :ref:`docker image <docker>`.

Basic Installation Instructions
===============================

These installation instructions have been tested on Ubuntu 20.04 LTS
(Focal Fossa), so may need some minor changes for other Debian-based
distributions.
For installation on Mac OS X, first read these
:ref:`additional instructions <installation-osx>`.

Introduction
------------

The most fundamental dependencies of CATMAID are:

1. PostgreSQL 13+ and PostGIS 3.1 (PostgreSQL 14 and PostGIS 3.2 is recommended)
2. CPython 3.8, 3.9, 3.10 or PyPy3.8 (CPython 3.10 is recommended)

To get the required PostgreSQL version for Debian-based systems, such as
Ubuntu, you have to add the official Postgres repository as an
`extra Apt repository <https://wiki.postgresql.org/wiki/Apt>`_ (if you haven't
done so already)::

    PG_URL="http://apt.postgresql.org/pub/repos/apt/"
    APT_LINE="deb ${PG_URL} $(lsb_release -cs)-pgdg main"
    echo "${APT_LINE}" | sudo tee "/etc/apt/sources.list.d/pgdg.list"
    sudo apt-get install wget ca-certificates
    PG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
    wget --quiet -O - ${PG_KEY_URL} | sudo apt-key add -
    sudo apt-get update

While other Python versions are supported, we recommend the use of Python 3.8.
To be able to install it on Ubuntu 16.04 and earlier, the following needs to be done::

    sudo add-apt-repository ppa:deadsnakes/ppa
    sudo apt-get update

The Django version we use also requires a GDAL version of at least 2.0. The
installed version can be checked using ``gdalinfo --version``. Should version 2
or newer not be available on your system, use the following PPA::

    sudo add-apt-repository ppa:ubuntugis/ppa
    sudo apt-get update

And then you can install these dependencies with::

    sudo apt-get install python3.8 postgresql-13 postgresql-13-postgis-3-scripts gdal-bin

CATMAID is based on the `Django web framework
<https://www.djangoproject.com/>`_.  If you just wish to work on
developing CATMAID, you can use Django's built-in lightweight
development server. However, for production you will need to
configure your webserver to talk to the CATMAID web application
using WSGI. We have successfully tested using either Apache
with mod_wsgi, or Nginx with gevent, gunicorn or uSWGI.
Particularly Nginx with uWSGI have been tested extensively. Setting
up one of these web servers is described in later sections.

1. Clone the repository
#######################

The git repository is hosted at `https://github.com/catmaid/CATMAID
<https://github.com/catmaid/CATMAID>`_  - clone this repository
somewhere outside your web root, e.g. in ``/home/alice``, so that
the source code is in ``/home/alice/catmaid``::

   git clone https://github.com/catmaid/CATMAID.git catmaid

2. Install required Python packages
###################################

We recommend the use of Python 3.8 or newer for production use. With a few
limitations PyPy3 can be used as well (no cropping, no back-end plotting,
no synapse clustering, no ontology clustering).

We strongly recommend that you install all Python package dependencies into a
virtualenv, so that they are isolated from the system-wide installed packages
and can be upgraded easily. Some of these Python packages depend on system-wide
libraries that you will need to install in advance, however.
You can do this with the following command on Ubuntu
(you may need additional PPAs, such as ``ubuntugis`` and ``postgresql``):

    .. fileinclude:: ../../packagelist-ubuntu-apt.txt
       :removelinebreaks:
       :indent:
       :prepend: sudo apt-get install
       :split: 75
       :splitend:  \

Create a virtual environment based on the python binary at /usr/bin/python3.8:

    /usr/bin/python3.8 -m venv --prompt catmaid /home/alice/catmaid/django/env

Whenever you are working with this environment in a new shell, you need to

    source /home/alice/catmaid/django/env/bin/activate

You can deactivate the environment with ``deactivate``.

.. note::

   It is possible to use PyPy as Python implementation, which can improve
   performance of back-end heavy endpoints. Most functionality is available,
   except for the following: Ontology clustering, Cropping, Synapse clustering,
   HDF 5 tiles and User analytics. To use PyPy, a new virtualenv using the PyPy
   executable has to be created.

.. note::

   If you are using Python 3.6 or newer on Ubuntu 14.04 and 16.04, never uninstall Python
   3.5, because it might break some parts of the system.

Install all of the required Python packages with::

    cd /home/alice/catmaid/django
    pip install .

If that worked correctly, then the second-last line of output will begin
``Successfully installed``, and list the Python packages that have just been
installed.

CATMAID has a number of optional "extras".
These extras are specified in the usual way:

    pip install '.[async,optional,production]'


3. Install and configure PostgreSQL
###################################

If you are comfortable with creating a new PostgreSQL database for CATMAID, then
you should do that and continue to the next section. If you decide to do so,
please make sure to also install the ``postgis`` extension and the ``pg_trgm``
extension for the new CATMAID database. The advice here is a suggested approach
for people who are unsure what to do.

If you are uncomfortable with using the PostgreSQL interactive
terminal from the command line, you may wish to install an
alternative interface, such as pgAdmin (``sudo apt-get install
pgadmin3``) or phpPgAdmin (``sudo apt-get install phppgadmin``).

We suppose for the examples below that you want to create a
database called ``catmaid`` and a database user called
``catmaid_user``. Firstly, we need to reconfigure PostgreSQL to
allow password-based authentication for that user to that
database. To do that, edit the file
``/etc/postgresql/13/main/pg_hba.conf`` (or replace ``13`` with your postgres version) and add this line as the
*first* rule in that file::

    local catmaid catmaid_user md5

After saving that file, you need to restart PostgreSQL with::

    sudo service postgresql reload

You can generate the commands for creating the database and
database user with the ``scripts/createuser.sh`` helper script.
This takes the database name, the database user and the user's
password as arguments and outputs some commands that can be
interpreted by the PostgreSQL shell. These can be piped
directly to ``psql``, so you could create the database and the
user with, for example::

    scripts/createuser.sh catmaid catmaid_user p4ssw0rd | sudo -u postgres psql

Besides creating the database and the database user, it will also enable a
required Postgres extension, called ``postgis``. You should now be able to
access the database and see that it is currently empty except for PostGIS
relations, e.g.::

    psql -U catmaid_user catmaid
    Password for user catmaid_user:
    psql (12.9 (Ubuntu 12.9-2.pgdg20.04+1))
    Type "help" for help.

    catmaid=> \d
             List of relations
     Schema |       Name        | Type  |  Owner
    --------+-------------------+-------+----------
     public | geography_columns | view  | postgres
     public | geometry_columns  | view  | postgres
     public | raster_columns    | view  | postgres
     public | raster_overviews  | view  | postgres
     public | spatial_ref_sys   | table | postgres

4. Create the Django settings files
###################################

Now you should change into
``/home/alice/catmaid/django/`` and run::

    cp configuration.py.example configuration.py

You should now edit ``configuration.py`` and fill in all the
details requested. Then you should run::

    ./create_configuration.py

This will output some suggested Nginx and Apache configuration in the
terminal, and generate the files ``django.wsgi`` and ``settings.py``
in ``/home/alice/catmaid/django/projects/mysite``. An explanation of all
possible settings in the `settings.py` file can be found :ref:`here <options>`.

5. Create the database tables
#############################

The commands in the following sections are all based on the Django site's admin
script ``manage.py``, which would be in ``/home/alice/catmaid/django/projects``,
so these instructions assume that you've changed into that directory::

    cd /home/alice/catmaid/django/projects

Now create all required tables and bring the database schema up to date
for applications that mange changes to their tables with South::

    ./manage.py migrate

6. Prepare the static files
###########################

The static files (mostly Javascript, CSS and image files) that
CATMAID requires need to be collected together into
``/home/alice/catmaid/django/static`` before they will be
available. To do this, you need to run::

   ./manage.py collectstatic -l

(The ``-l`` means to create symbolic links to the original
location of the files rather than copy them.)

7. Create an administrative user
################################

In order to be able to log in to the CATMAID admin interface,
you will need to create a "superuser" account to log in with.
You can do this with::

    ./manage.py createsuperuser

8. Optionally add some example projects
#######################################

If you want to have some example projects to try in your new
CATMAID instance, you can create a couple with the following
command::

    ./manage.py catmaid_insert_example_projects --user=1

(The superuser you just created should have the user ID ``1``.)

9. Try running the Django development server
############################################

You can run the Django development server with::

    ./manage.py runserver

You should then be able to visit your instance of catmaid at `http://localhost:8000
<http://localhost:8000>`_. Note though that in its default configuration CATMAID
will prevent static files from being served with the ``runserver`` command and
while the website should load it may not look like expected. To temporarily
allow this to test without enabling debug mode, set ``SERVE_STATIC = True`` in
``settings.py``. For a production setup, the webserver should take care of
serving static files.

10. Setting up a production webserver
#####################################

You have various options for setting up CATMAID with a production webserver -
you can choose from (at least) the following two:

1. :ref:`Nginx and uWSGI <nginx>` (or alternatively with :ref:`Gevent or Gunicorn <alternative_setup>`)
2. Apache and mod_wsgi, in which case see :ref:`apache`

We prefer to use Nginx because of a more straight-forward configuration, smaller
memory footprint and better performance with available WSGI servers. In
production setups we made good experience with uWSGI running behind Nginx, which
is described in more detail in the :ref:`Nginx and uWSGI <nginx>` section.

Note if the domain you are serving your image data from is different from where
CATMAID is running, `CORS <https://en.wikipedia.org/wiki/Cross-origin_resource_sharing>`_
headers have to be sent by the image server or some aspects of the web front-end
won't work as expected. For more details, have a look :ref:`here <nginx-image-data>`.
The same is true for CATMAID back-ends that should be accessed by clients originating
not from the same domain. Check the :ref:`CORS setup <nginx-cors>` section for more
details.

In general you want to fine-tune your setup to improve performance. Please have
a look at our :ref:`collection of advice <performance-tuning>` for the various
infrastructure parts (e.g. webserver, database, file system). This can really
make a difference. An explanation of all possible settings in the `settings.py`
file can be found :ref:`here <options>`.

11. Using the admin interface
#############################

You should be able to log in to the CATMAID admin interface and
complete administration tasks by adding ``/admin/`` after the
root URL of your CATMAID instance. For example, with the
development server, this would be::

    http://localhost:8000/admin/

... or, to use the variables used in the ``configuration.py`` (see step 4), the
URL would be::

    http://<catmaid_servername>/<catmaid_subdirectory>/admin/

12. Creating tiles for new CATMAID stacks
#########################################

You can generate the image tiles for a stack with the
``scripts/tiles/tile_stack`` script or by exporting from TrakEM2
with its "Export > Flat Images" option and selecting the "Export
for web" checkbox. Make the folder with the image pyramid
web-accessible and use the URL as ``image_base`` URL for your
stack.

13. Making tools visible
########################

CATMAID offers a growing set of :ref:`tools <tools>`. To not overload
the user-interface, all tools which go beyond navigation are hidden by
default. Which tools are visible is stored in a
:ref:`user profile <user-profiles>` for each user. You can adjust these
settings at the bottom of the page while editing a user in the admin
interface.
