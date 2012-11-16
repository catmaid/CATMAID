.. _basic-installation:

Basic Installation Instructions
===============================

Prerequisites
-------------

1. PostgreSQL >= 9.0
2. Apache2 Webserver
3. PHP >= 5.2
4. Python 2.7

You can install these main dependencies with::

    sudo apt-get install libapache2-mod-php5 php5-pgsql imagemagick

To use the Python-based helper scripts, you should also install
the following packages::

    sudo apt-get install python-psycopg2 python-yaml python-tz

We recommend the use of Python 2.7. CATMAID is likely to run with
Python 2.6 as well, however Python 2.7 is used for development and
testing.

Installation on Ubuntu 12.04
----------------------------

0. Clone the repository
#######################

The git repository is hosted at
https://github.com/acardona/CATMAID - clone this repository
somewhere outside your web root, e.g. in `/home/alice`, so that
the source code is in `/home/alice/catmaid`::

        git clone git://github.com/acardona/CATMAID.git

1. Install and configure PostgresSQL
####################################

You may find the advice `here <https://help.ubuntu.com/community/PostgreSQL>`_
useful. Install PostgreSQL >= 9.0 and helper tools::

        sudo apt-get install postgresql pgadmin3 phppgadmin postgresql-contrib

phppgadmin is optional, but is suggested if you are not
comfortable with interacting with PostgreSQL from a terminal.

You can then create the database, some required functions and
the database user by piping the output of the
`scripts/createuser.sh` script to PostgreSQL.  The three
parameters to that script, which you may wish to customize, are
the database name, the database user name and the database
user's password.  For example::

        scripts/createuser.sh catmaid catmaid_user p4ssw0rd | sudo -u postgres psql

Check if you can login - the database should still be empty, however::

	http://localhost/phppgadmin/

Make sure that the catmaid database is accessible using MD5
hashed passwords - you have to add this line as the *first* rule
in `/etc/postgresql/XversionX/main/pg_hba.conf`::

    local catmaid catmaid_user md5

(If you have changed the database name or user, you should change
them in that rule as well.)

After the above please restart the database::

    sudo /etc/init.d/postgresql restart

Update the catmaid database configuration in:
`inc/setup.inc.php.template` and rename the file to
`inc/setup.inc.php`

2. Configure Apache
###################

The advice `here <http://wiki.ubuntuusers.de/Apache/Virtual_Hosts>`_
may be of use.

2.1 Subdirectory installation of an existing virtual host
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

We assume that you cloned the CATMAID source code to
`/home/alice/CATMAID/`. Then, the configuration as a directory 
in `/etc/apache2/sites-enabled/000-default` ::

     <VirtualHost *:80>
             ServerAdmin webmaster@localhost

             DocumentRoot /var/www
             <Directory />
                     Options FollowSymLinks
                     AllowOverride None
             </Directory>
             ...
             ...

             # Add CATMAID configuration here:
             Alias /catmaid/ /home/alice/CATMAID/httpdocs/
             <Directory /home/alice/CATMAID/httpdocs/>

                     php_admin_value register_globals off
                     php_admin_value include_path ".:/home/alice/CATMAID/inc"
                     php_admin_value session.use_only_cookies 1
                     php_admin_value error_reporting 2047
                     php_admin_value display_errors true

                     Options FollowSymLinks
                     AllowOverride AuthConfig Limit FileInfo
                     Order allow,deny
                     Allow from all
             </Directory>

     </VirtualHost>

You should then restart Apache::

     sudo /etc/init.d/apache2 restart


3. Now try it out!
##################

Try to start CATMAID::

     firefox http://localhost/catmaid/

You will get an error to tell you that no projects are found.  If you want to
create some example projects and stacks for testing, you should run::

     scripts/database/insert-example-projects.py

To create a login, you should use the `scripts/database/create-user.py`
script, such as with::

     scripts/database/create-user.py humpy "Sir Humphrey Appleby"

This will prompt you for a password for this new user. A default login (user: gerhard,
password: gerhard) is created for the example projects and tracing is enabled.

4. Adding a new project
#######################

You can generate the image tiles for a stack with the
`scripts/tiles/tile_stack` script or by exporting from TrakEM2 with
its "Export > Flat Images" option and selecting the "Export for
web" checkbox.

Then you can create a new project with the script
`scripts/database/create_project_stack.py`::

      scripts/database/create_project_stack.py

The script enables the generation of a new project or uses an
existing project.  For a new project, it creates the classes and
relations necessary for SVG-based annotation and associates the
project with the users.  It enables the creation of new stacks
associated with the project.