.. _apache:

Setting up Apache and mod_wsgi
------------------------------

Firstly, make sure that Apache and mod_wsgi are installed with::

    sudo apt-get install libapache2-mod-wsgi

If you have problems with the instructions below, try checking
that the settings files appear to be correct, and look for
errors in the Apache error logs, with::

     sudo tail -f /var/log/apache2/error.log

... or::

     sudo tail -f /var/log/apache2/catmaid/error.log

... depending on whether you have set a custom ErrorLog.

Subdirectory installation of an existing virtual host
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

We assume that you cloned the CATMAID source code to
``/home/alice/catmaid/``, that the file that defines the
existing virtual host that you want to modify is in
``/etc/apache2/sites-enabled/000-default`` and that you want to
have your catmaid instance appear at ``/catmaid``.  We also
assume that you have already run the ``create_configuration.py``
script as described in :ref:`basic_installation` to create your
``django.wsgi`` file.

You should then add lines to your existing virtualhost as shown
below, from the lines ``# Add CATMAID configuration here:`` to
the end of the ``<VirtualHost>`` section.  You can take these
lines from the output of ``create_configuration.py`` from
earlier (or by running it again) or follow the example here::

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

             Alias /catmaid /home/alice/catmaid/django/projects/mysite/django.wsgi
             <Location /catmaid>
                     SetHandler wsgi-script
                     Options +ExecCGI
             </Location>

             Alias /catmaid/static /home/alice/catmaid/django/static/
             <Directory /home/alice/catmaid/django/static/>
                 Options FollowSymLinks
                 AllowOverride AuthConfig Limit FileInfo
                 Order deny,allow
                 Allow from all
             </Directory>

     </VirtualHost>

You should then restart Apache::

     sudo /etc/init.d/apache2 restart

Installation at the root of a virtual host
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To install at the root of a new virtual host, you should create
a new file in ``/etc/apache2/sites-available/`` (called
``catmaid``, say) with the following contents::

    <VirtualHost *:80>
        ServerName your-catmaid-hostname.example.org

        WSGIScriptAlias / /home/alice/catmaid/django/projects/mysite/django.wsgi

        Alias /static /home/alice/catmaid/django/static/
        <Directory /home/alice/catmaid/django/static/>
            Options FollowSymLinks
            AllowOverride AuthConfig Limit FileInfo
            Order deny,allow
            Allow from all
        </Directory>

        CustomLog /var/log/apache2/catmaid/access_log combined
        ErrorLog /var/log/apache2/catmaid/error.log

    </VirtualHost>

You should then enable that website with::

    sudo a2ensite catmaid

... and finally restart Apache::

     sudo /etc/init.d/apache2 restart
