#! /bin/sh

# This script will make changes in the configuration files necessary
# to make your catmaid instance use another database.

# The lines where the database is specified in the configuration
# files must be the same as in the template files these config
# files were based on.

# To use this script, you should change the paths below to point to the
# correct path for the catmaid instance you want to change. I have put
# this script on my path, making it easy to use from any terminal.

if [ $# -ne 1 ]
then
  echo "Usage: $0 <DATABASE-NAME>"
  exit 1
fi

sed -i "16s/.*/\$db_db[ 'write' ]	= '$1';/" /home/oliver/CATMAID/inc/setup.inc.php
sed -i "20s/.*/\$db_db[ 'read' ]	= '$1';/" /home/oliver/CATMAID/inc/setup.inc.php

sed -i "2s/.*/database: $1/" /home/oliver/.catmaid-db

sed -i "11s/.*/        'NAME': '$1',      # Or path to database file if using sqlite3./" /home/oliver/CATMAID/django/projects/mysite/settings.py

sed -i "9s/.*/        'NAME': '$1',      # Or path to database file if using sqlite3./" /home/oliver/CATMAID/django/projects/mysite/settings_apache.py
