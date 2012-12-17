Frequently Asked Questions
==========================

*Question: While trying to open CATMAID on the browser I get the following:
Got an AJAX error with status: 200 for URL: model/migrate-db.php*

Answer: Most likely there is something wrong with the PHP configuration or there is an
actual error in the migrate-db.php file. Make sure to check the error message in the Apache2 log file::

   sudo tail -f /var/log/apache2/error.log
   
*I updated to Ubuntu 12.04 and I have postgres 8.4 and 9.1 installed on my system*

Remove all postgres version 8.4 packages (this removes also the databases).
Then change the port in /etc/postgresql/9.1/main/postgresql.conf to::

   port = 5432
   
Restart postgres::

   sudo /etc/init.d/postgresql restart
   
Now you should be able to call the ./scripts/createuser.sh script.
