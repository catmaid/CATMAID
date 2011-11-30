## Basic Installation Instructions

### Prerequisites

1. PostgreSQL > 8.2
2. Apache2 Webserver
3. PHP 5

You can install these main dependencies with:

    sudo apt-get install libapache2-mod-php5 php5-pgsql imagemagick

To use the Python-based helper scripts, you should also install
the following packages:

    sudo apt-get install python-psycopg2 python-yaml

### Installation on Ubuntu 10.10

#### 0. Clone the repository

The git repository is hosted at
https://github.com/acardona/CATMAID - clone this repository
somewhere outside your web root, e.g. in `/home/alice`, so that
the source code is in `/home/alice/catmaid`:

        git clone git://github.com/acardona/CATMAID.git

#### 1. Install and configure PostgresSQL

You may find the advice
[here](https://help.ubuntu.com/community/PostgreSQL) useful.  In
short, you should do the following:

        sudo apt-get install postgresql pgadmin3 phppgadmin postgresql-contrib

phppgadmin is optional, but is suggested if you are not
comfortable with interacting with PostgreSQL from a terminal.
Update the password for your catmaid user in
`/home/alice/catmaid/docs/createuser.sql`.  If you want the
database to be called something other than `catmaid` you
also change that in the lines beginning `CREATE DATABASE`
and `\c` in the same file.

Then you should run the commands in that file as the postgres user:

	sudo -u postgres psql < docs/createuser.sql

(On some systems you may get the the error
`ERROR: language "plpgsql" already exists`
which can be safely ignored.)

Check if you can login - the database should still be empty, however:

	http://localhost/phppgadmin/

Make sure that the catmaid database is accessible using MD5
hashed passwords - you have to add this line as the *first* rule
in `/etc/postgresql/8.4/main/pg_hba.conf`:

    local catmaid catmaid_user md5

(If you have changed the database name or user, you should change
them in that rule as well.)

After the above please restart the database:

    sudo /etc/init.d/postgresql-8.4 restart

Update the catmaid database configuration in:
`inc/setup.inc.php.template` and rename the file to
`inc/setup.inc.php`

#### 2. Configure Apache

There are two possibilities here - setting up CATMAID on its own
virtual host, or setting it up as a subdirectory of an existing
host:

#### 2.1 Named Virtual Hosts approach:

(The advice
[here](http://wiki.ubuntuusers.de/Apache/Virtual_Hosts) may
be of use.)

Your clone of the CATMAID source code should be *outside* any
web-accessible directory.  For example, let's say that you have
the source code in `/home/alice/catmaid/`

Create a directory for the log files, for example with:

    sudo mkdir -p /var/log/apache2/catmaid/

Create in /etc/apache2/sites-available a file called "catmaid":

     <VirtualHost *:80>
         ServerName catmaid

         DocumentRoot "/home/alice/catmaid/httpdocs/"

         php_admin_value register_globals off
         php_admin_value include_path ".:/home/alice/catmaid/inc"
         php_admin_value session.use_only_cookies 1
         php_admin_value error_reporting 2047
         php_admin_value display_errors true

         <Directory /home/alice/catmaid/httpdocs/>

             Options FollowSymLinks
             AllowOverride AuthConfig Limit FileInfo

             Order allow,deny
             allow from all

         </Directory>

         CustomLog /var/log/apache2/catmaid/access_log combined
         ErrorLog /var/log/apache2/catmaid/error.log

     </VirtualHost>

Then make apache aware of the virtual host:

     sudo a2ensite catmaid

... then restart apache:

     /etc/init.d/apache2 restart

... and finally add this entry to "/etc/hosts" :

     127.0.0.1    catmaid

#### 2.2 As a directory of an existing virtual host

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

             Alias /catmaid/ /home/mark/catmaid-local-instance/httpdocs/
             <Directory /home/mark/catmaid-local-instance/httpdocs/>

                     php_admin_value register_globals off
                     php_admin_value include_path ".:/home/mark/catmaid-local-instance/inc"
                     php_admin_value session.use_only_cookies 1
                     php_admin_value error_reporting 2047
                     php_admin_value display_errors true

                     Options FollowSymLinks
                     AllowOverride AuthConfig Limit FileInfo
                     Order allow,deny
                     Allow from all
             </Directory>

             ...
             ...
     </VirtualHost>

You should then restart Apache:

     /etc/init.d/apache2 restart

#### 3. Now try it out!

Try to start CATMAID::

     firefox http://catmaid/

... or with:

     firefox http://localhost/catmaid/

... depending on the approach you took above.  You will get an
error to tell you that no projects are found.  If you want to
create some example projects and stacks for testing, you should
run:

     scripts/insert-example-projects.py

To create a login, you should use the `scripts/create-user.py`
script, such as with:

     scripts/create-user.py humpy "Sir Humphrey Appleby"

This will prompt you for a password for this new user.

#### 4. Adding a new project

You can generate the image tiles for a stack with the
`scripts/tile_stack` script or by exporting from TrakEM2 with
its "Export > Flat Images" option and selecting the "Export for
web" checkbox.

Then you can create a new project with the script
`scripts/create_project_stack.py`

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
