.. _basic-installation:

.. note::

   These instructions describe installing CATMAID from source for
   long-term use. If you want to quickly try CATMAID for evaluation or
   demonstration purposes, consider using the :ref:`docker image <docker>`.

Basic Installation Instructions
===============================

These installation instructions have been tested on the most
recent stable release of Ubuntu (18.04 bionic), so may need
some minor changes for other Debian-based distributions.
For installation on Mac OS X, first read these
:ref:`additional instructions <installation-osx>`.

Introduction
------------

The most fundamental dependencies of CATMAID are:

1. PostgreSQL >= 11 and PostGIS >= 2.5
2. Python 3.5, 3.7 or PyPy3.6
3. Imagemagick (for generating image tiles)

To get the required PostgreSQL version for Debian-based systems, such as
Ubuntu, you have to add the officical Postgres repository as an
`extra Apt repository <https://wiki.postgresql.org/wiki/Apt>`_ (if you haven't
done so already)::

    PG_URL="http://apt.postgresql.org/pub/repos/apt/"
    APT_LINE="deb ${PG_URL} $(lsb_release -cs)-pgdg main"
    echo "${APT_LINE}" | sudo tee "/etc/apt/sources.list.d/pgdg.list"
    sudo apt-get install wget ca-certificates
    PG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
    wget --quiet -O - ${PG_KEY_URL} | sudo apt-key add -
    sudo apt-get update

While Python 3.5 is supported, we recommend the use of Python 3.6. To be able to
install it on Ubuntu 16.04 and earlier, the following needs to be done::

    sudo add-apt-repository ppa:deadsnakes/ppa
    sudo apt-get update

And then you can install these dependencies with::

    sudo apt-get install python3.6 postgresql-11 imagemagick

CATMAID is based on the `Django web framework
<https://www.djangoproject.com/>`_.  If you just wish to work on
developing CATMAID, you can use Django's built-in lightweight
development server.  However, for production you will need to
configure your webserver to talk to the CATMAID web application
using WSGI.  We have successfully tested using either Apache
with mod_wsgi, or nginx with gevent, gunicorn or uswgi.  Setting
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

We recommend the use of Python 3.6 for production use at the moment, but Python
3.5 should work equally well. With a few more limitations PyPy3 can be used as
well (no cropping, no back-end plotting, no synapse clustering, no ontology
clustering).

We strongly recommend that you install all Python package dependencies into a
virtualenv, so that they are isolated from the system-wide installed packages
and can be upgraded easily. Some of these Python packages depend on system-wide
libraries that you will need to install in advance, however. You can do this
with one of the following commands (the one suiting best your OS):

Ubuntu 18.04:

    .. fileinclude:: ../../packagelist-ubuntu-18.04-apt.txt
       :removelinebreaks:
       :indent:
       :prepend: sudo apt-get install
       :split: 75
       :splitend:  \

Ubuntu 16.04:

    .. fileinclude:: ../../packagelist-ubuntu-16.04-apt.txt
       :removelinebreaks:
       :indent:
       :prepend: sudo apt-get install
       :split: 75
       :splitend:  \

Virtualenv Wrapper needs to source your environment. Start a new terminal
or if you are using the bash::

    source ~/.bashrc

Please test if ``virtualenvwrapper`` is set up correctly, by executing::

    mkvirtualenv --version

If it gives you a version, everything is fine. Otherwise, e.g. if the command
``mkvirtualenv`` is not found, add the following line to your ``~/.bashrc`` file
and call ``source ~/.bashrc`` again::

    source /etc/bash_completion.d/virtualenvwrapper

To create a new virtualenv for CATMAID's Python dependencies,
you can do::

    mkvirtualenv --no-site-packages -p /usr/bin/python3.6 catmaid

That will create a virtualenv in ``~/.virtualenvs/catmaid/``, and
while your virtualenv is activated, Python libraries will be
imported from (and installed to) there.  After creating the
virtualenv as above, it will be activated for you, but in new
shells, for example, you will need to activate it by running::

    workon catmaid

.. note::

    Many distributions ship with an outdated version of Pip.
    This is the tool we use to install Python packages within the virtualenv,
    so let's update it first::

        python -m pip install -U pip

.. note::

   It is possible to use PyPy as Python implementation, which can improve
   performance of back-end heavy endpoints. Most functionality is available,
   except for the following: Ontology clustering, Cropping, Synapse clustering,
   HDF 5 tiles and User analytics. To use PyPy, a new virtualenv using the PyPy
   executable has to be created::

       mkvirtualenv --no-site-packages -p /usr/bin/pypy catmaid

.. note::

   If you are using Python 3.6 on Ubuntu 14.04 and 16.04, never uninstall Python
   3.5, because it might break some parts of the system.

Install all of the required Python packages with::

    cd /home/alice/catmaid/django
    pip install -r requirements.txt

If that worked correctly, then the second-last line of output
will begin ``Successfully installed``, and list the Python
packages that have just been installed.

*A note on the pgmagick module:* this is a wrapper for GraphicMagick (GM).
GM uses so-called delegates to support different file formats. Depending
of the presence of such a delegate a file format is supported or not. The
cropping tool uses GM through pgmagick and expects the libtiff and the
libjpeg delegates to be present. So make sure your GM installation
supports tiff (check e.g. with the help of "gm convert -list format").

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
``catmaid_user``.  Firstly, we need to reconfigure PostgreSQL to
allow password-based authentication for that user to that
database.  To do that, edit the file
``/etc/postgresql/11/main/pg_hba.conf`` and add this line as the
*first* rule in that file::

    local catmaid catmaid_user md5

After saving that file, you need to restart PostgreSQL with::

    sudo service postgresql restart

You can generate the commands for creating the database and
database user with the ``scripts/createuser.sh`` helper script.
This takes the database name, the database user and the user's
password as arguments and outputs some commands that can be
interpreted by the PostgreSQL shell.  These can be piped
directly to ``psql``, so you could create the database and the
user with, for example::

    scripts/createuser.sh catmaid catmaid_user p4ssw0rd | sudo -u postgres psql

Besides creating the database and the database user, it will also enable a
required Postgres extension, called ``postgis``. You should now be able to
access the database and see that it is currently empty except for PostGIS
relations, e.g.::

    psql -U catmaid_user catmaid
    Password:
    psql (11.3)
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
details requested.  Then you should run::

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
available.  To do this, you need to run::

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

1. Nginx and either Gevent, uWSGI or Gunicorn, in which case see
   :ref:`nginx`

2. Apache + mod_wsgi, in which case see :ref:`apache`

We prefer to use Nginx because of a more straight-forward configuration, smaller
memory footprint and better performance with available WSGI servers.

Note if the domain you are serving your image data from is different from where
CATMAID is running, `CORS <https://en.wikipedia.org/wiki/Cross-origin_resource_sharing>`_
headers have to be sent by the image server or some aspects of the web front-end
won't work as expected. For more details, have a look :ref:`here <nginx-image-data>`.

In general you want to fine-tune your setup to improve performance. Please have
a look at our :ref:`collection of advice <performance-tuning>` for the various
infrastructure parts (e.g.  webserver, database, file system). This can really
make a difference. An explanation of all possible settings in the `settings.py`
file can be found :ref:`here <options>`.

11. Using the admin interface
#############################

You should be able to login to the CATMAID admin interface and
complete administration tasks by adding ``/admin/`` after the
root URL of your CATMAID instance.  For example, with the
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
default. Which tools are visible is stored a
:ref:`user profile <user-profiles>` for each user. You can adjust these
settings at the bottom of the page while editing a user in the admin
interface.
