Frequently Asked Questions
==========================

*I updated to Ubuntu 12.04 and I have postgres 8.4 and 9.1 installed on my system*

Remove all postgres version 8.4 packages (this removes also the databases).
Then change the port in /etc/postgresql/9.1/main/postgresql.conf to::

   port = 5432
   
Restart postgres::

   sudo /etc/init.d/postgresql restart
   
Now you should be able to call the ./scripts/createuser.sh script.

*My CATMAID instance is working in debug mode, but can't be reached in
production. What is the problem?*

Check the `ALLOWED_HOSTS` setting in your Django configuration file:

    django/projects/mysite/settings.py

Since Django 1.5 this setting is present and should contain a list of all
host/domain names that your CATMAID instance is reachable under. Access will be
blocked if target host isn't found in this list. For more detail have a look at
the `Django documentation <https://docs.djangoproject.com/en/1.6/ref/settings/#allowed-hosts>`_.
