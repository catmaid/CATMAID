Frequently Asked Questions
==========================

*I updated to Ubuntu 12.04 and I have postgres 8.4 and 9.1 installed on my system*

Remove all postgres version 8.4 packages (this removes also the databases).
Then change the port in /etc/postgresql/9.1/main/postgresql.conf to::

   port = 5432
   
Restart postgres::

   sudo /etc/init.d/postgresql restart
   
Now you should be able to call the ./scripts/createuser.sh script.
