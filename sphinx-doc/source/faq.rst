Frequently Asked Questions
==========================

*Question: While trying to open CATMAID on the browser I get the following:
Got an AJAX error with status: 200 for URL: model/migrate-db.php*

Answer: Most likely there is something wrong with the PHP configuration or there is an
actual error in the migrate-db.php file. Make sure to check the error message in the Apache2 log file::

   sudo tail -f /var/log/apache2/error.log