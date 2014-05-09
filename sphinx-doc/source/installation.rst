.. _basic-installation:

Basic Installation Instructions
===============================

These installation instructions have been tested on the most
recent stable release of Ubuntu (12.04 precise), so may need
some minor changes for other Debian-based distributions.

As an alternative, we have generated an AMI (Amazon Machine
Image) that will let you easily create an EC2 instance with a
running CATMAID instance and a couple of example projects.  If
you would prefer that approach, please see the instructions in
:ref:`ami`.

Introduction
------------

The most fundamental dependencies of CATMAID are:

1. PostgreSQL >= 9.0
2. Python 2.7
3. Imagemagick (for generating image tiles)

On Debian-based systems, such as Ubuntu, you can install these
with::

    sudo apt-get install python postgresql-9.1 imagemagick

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

The git repository is hosted at `https://github.com/acardona/CATMAID
<https://github.com/acardona/CATMAID>`_  - clone this repository
somewhere outside your web root, e.g. in ``/home/alice``, so that
the source code is in ``/home/alice/catmaid``::

   git clone git://github.com/acardona/CATMAID.git catmaid

2. Install required Python packages
###################################

We recommend the use of Python 2.7. CATMAID is likely to run
with Python 2.6 as well, but Python 2.7 is used for development
and testing.

We strongly recommend that you install all Python package
dependencies into a virtualenv, so that they are isolated from
the system-wide installed packages and can be upgraded easily.
Some of these Python packages depend on system-wide libraries
that you will need to install in advance, however.  You can do
this with::

    sudo apt-get install gcc gfortran apt-file \
                         python2.7-dev postgresql-common \
                         libpq-dev libgraphicsmagick++1-dev \
                         libhdf5-serial-dev libboost1.48-dev \
                         libboost-python1.48-dev uuid-dev \
                         libxml2-dev libxslt1-dev libjpeg-dev \
                         libtiff-dev virtualenvwrapper \
                         libblas-dev liblapack-dev

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

    mkvirtualenv --no-site-packages -p /usr/bin/python2.7 catmaid

That will create a virtualenv in ``~/.virtualenvs/catmaid/``, and
while your virtualenv is activated, Python libraries will be
imported from (and installed to) there.  After creating the
virtualenv as above, it will be activated for you, but in new
shells, for example, you will need to activate it by running::

    workon catmaid

Ubuntu 12.04 ships a rather old version of Pip, the tool we use to install
Python packages within the virtualenv. Let's update it therefor first---within
the virtualenv::

    pip install pip==1.5.4

You can probably use a later version as well, but we tested it with Pip v1.5.4.

Due to `a dependency problem
<https://github.com/h5py/h5py/issues/96>`_, we need to install
NumPy separately::

   pip install numpy==1.6.1

You should then install all the rest of the required Python
packages with::

    cd /home/alice/catmaid/django
    pip install -r pip-frozen

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

If you are comfortable with creating a new PostgreSQL database
for CATMAID, then you should do that and continue to the next
section.  The advice here is a suggested approach for people
who are unsure what to do.

If you are uncomfortable with using the PostgreSQL interactive
terminal from the command line, you may wish to install an
alternative interface, such as pgAdmin (``sudo apt-get install
pgadmin3``) or phpPgAdmin (``sudo apt-get install phppgadmin``).

We suppose for the examples below that you want to create a
database called ``catmaid`` and a database user called
``catmaid_user``.  Firstly, we need to reconfigure PostgreSQL to
allow password-based authentication for that user to that
database.  To do that, edit the file
``/etc/postgresql/9.1/main/pg_hba.conf`` (where ``9.1`` may be a
slightly different version for you) and add this line as the
*first* rule in that file::

    local catmaid catmaid_user md5

After saving that file, you need to restart PostgreSQL with::

    sudo /etc/init.d/postgresql restart

You can generate the commands for creating the database and
database user with the ``scripts/createuser.sh`` helper script.
This takes the database name, the database user and the user's
password as arguments and outputs some commands that can be
interpreted by the PostgreSQL shell.  These can be piped
directly to ``psql``, so you could create the database and the
user with, for example::

    scripts/createuser.sh catmaid catmaid_user p4ssw0rd | sudo -u postgres psql

You should now be able to access the database and see that it is
currently empty, e.g.::

    psql -U catmaid_user catmaid
    Password:
    psql (9.1.8)
    Type "help" for help.

    catmaid=> \d
    No relations found.

4. Create the Django settings files
###################################

Now you should change into
``/home/alice/catmaid/django/`` and run::

    cp configuration.py.example configuration.py

You should now edit ``configuration.py`` and fill in all the
details requested.  Then you should run::

    ./create_configuration.py

This will output some suggested Apache configuration in the
terminal, and generate the files ``django.wsgi`` and ``settings.py``
in ``/home/alice/catmaid/django/projects/mysite``.

5. Create the database tables
#############################

The commands in the following sections are all based on the
Django site's admin script ``manage.py``, which would be in
``/home/alice/catmaid/django/projects/mysite``, so these
instructions assume that you've changed into that directory::

    cd /home/alice/catmaid/django/projects/mysite

Now create some required tables with::

    ./manage.py syncdb

And bring the database schema up to date for applications that
mange changes to their tables with South::

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
<http://localhost:8000>`_

10. Setting up a production webserver
#####################################

You have various options for setting up CATMAID with a
production webserver - you can choose from (at least) the
following options:

1. Apache + mod_wsgi, in which case see :ref:`apache`

2. Nginx and either gevent, uWSGI or Gunicorn, in which case see
   :ref:`alternative-install`

11. Using the admin interface
#############################

You should be able to login to the CATMAID admin interface and
complete administration tasks by adding ``/admin/`` after the
root URL of your CATMAID instance.  For example, with the
development server, this would be::

    http://localhost:8000/admin/

... or if your CATMAID instance is at
``http://myserver.example.org/catmaid``, it would be at::

    http://myserver.example.org/catmaid/admin/

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
