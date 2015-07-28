While the article is about version 8.x of PostgreSQL,
it applies to PostgreSQL >= 9.0 as well. Unfortunately, the
official Ubuntu 10.10 repositories, don't offer PostgreSQL 9.x
as a backport package yet. To make it available, just add the
`backports PPA <https://launchpad.net/~pitti/+archive/postgresql>`_
of Martin Pitt to your system::

        sudo add-apt-repository ppa:pitti/postgresql
        sudo apt-get update

In case you are upgrading from a previous PostgreSQL version,
you might want to follow the steps in section
:ref:`upgrading-postgresql`.

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