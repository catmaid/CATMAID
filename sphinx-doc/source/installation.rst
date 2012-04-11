Basic Installation Instructions
===============================

Prerequisites
-------------

1. PostgreSQL >= 9.0
2. Apache2 Webserver
3. PHP >= 5.2

You can install these main dependencies with::

    sudo apt-get install libapache2-mod-php5 php5-pgsql imagemagick

To use the Python-based helper scripts, you should also install
the following packages::

    sudo apt-get install python-psycopg2 python-yaml python-tz

Installation on Ubuntu 10.10
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
useful. While the article is about version 8.x of PostgreSQL,
it applies to PostgreSQL >= 9.0 as well. Unfortunately, the
official Ubuntu 10.10 repositories, don't offer PostgreSQL 9.x
as a backport package yet. To make it available, just add the
`backports PPA <https://launchpad.net/~pitti/+archive/postgresql>`_
of Martin Pitt to your system::

        sudo add-apt-repository ppa:pitti/postgresql
        sudo apt-get update

In case you are upgrading from a previous PostgreSQL version,
you might want to follow the steps in section
:ref:`upgrading-postgresql`. For a new and clean installation,
you can skip those steps and instead just do the following::

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

(On some systems you may get the the error `ERROR: language "plpgsql"
already exists` which can be safely ignored.)

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

.. _upgrading-postgresql:

1.1 Upgrading from an older PostgreSQL version
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To upgrade a currently running PostgreSQL server to a newer
version, you should follow the steps listed below. In short
you create a backup of your data base, save it to two
different locations, upgrade PostgreSQL and import your
backup into the new server.

To do so, the first step is to stop postgresql and services
that use it (e.g. a web server). Then the backup has to be
created::

    sudo su - postgres
    pg_dumpall > backup_db
    exit

This backup should be copied to another place as well. If you
modified the PostgreSQL configuration files in `/etc/postgresql`
you might want to make a backup of these, too.

Now all traces of the old PostgreSQL server (here 8.4) will
be removed and a newer version (9.1) installed::

    sudo apt-get purge postgresql-8.4
    sudo apt-get install postgresql-9.1

As a last step the backup made before, has to be restored::

    sudo su - postgres
    psql < backup_db
    exit

Now restart postregsql and the services relying on it. Finally,
check if all the data is in place no service complains.

2. Configure Apache
###################

There are two possibilities here - setting up CATMAID on its own
virtual host, or setting it up as a subdirectory of an existing
host. The advice `here <http://wiki.ubuntuusers.de/Apache/Virtual_Hosts>`_
may be of use. We suggest to use the subdirectory approach:

2.1 As a directory of an existing virtual host
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

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

2.2 Named Virtual Hosts approach:
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Your clone of the CATMAID source code should be *outside* any
web-accessible directory.  For example, let's say that you have
the source code in `/home/alice/CATMAID/`

Create a directory for the log files, for example with::

    sudo mkdir -p /var/log/apache2/catmaid/

Create in /etc/apache2/sites-available a file called "catmaid"::

     <VirtualHost *:80>
         ServerName catmaid

         DocumentRoot "/home/alice/CATMAID/httpdocs/"

         php_admin_value register_globals off
         php_admin_value include_path ".:/home/alice/CATMAID/inc"
         php_admin_value session.use_only_cookies 1
         php_admin_value error_reporting 2047
         php_admin_value display_errors true

         <Directory /home/alice/CATMAID/httpdocs/>

             Options FollowSymLinks
             AllowOverride AuthConfig Limit FileInfo

             Order allow,deny
             allow from all

         </Directory>

         CustomLog /var/log/apache2/catmaid/access_log combined
         ErrorLog /var/log/apache2/catmaid/error.log

     </VirtualHost>

Then make apache aware of the virtual host::

     sudo a2ensite catmaid

... then restart apache::

     sudo /etc/init.d/apache2 restart

... and finally add this entry to "/etc/hosts"::

     127.0.0.1    catmaid

3. Now try it out!
##################

Try to start CATMAID::

     firefox http://catmaid/

... or with::

     firefox http://localhost/catmaid/

... depending on the approach you took above.  You will get an
error to tell you that no projects are found.  If you want to
create some example projects and stacks for testing, you should
run::

     scripts/database/insert-example-projects.py

To create a login, you should use the `scripts/create-user.py`
script, such as with::

     scripts/create-user.py humpy "Sir Humphrey Appleby"

This will prompt you for a password for this new user.

4. Adding a new project
#######################

You can generate the image tiles for a stack with the
`scripts/tile_stack` script or by exporting from TrakEM2 with
its "Export > Flat Images" option and selecting the "Export for
web" checkbox.

Then you can create a new project with the script
`scripts/create_project_stack.py`::

      Usage: create-project.py <host> <database-name>

The script enables the generation of a new project or uses an
existing project.  For a new project, it creates the classes and
relations necessary for SVG-based annotation and associates the
project with the users.  It enables the creation of new stacks
associated with the project.

More details about the data model can be found in
`docs/data-model.lyx` - a PDF generated from that file can be
found here:

* http://incf.ini.uzh.ch/docs/catmaid-data-model.pdf
