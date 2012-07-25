#! /bin/sh

# Warning: This WILL erase all data in the chosen database.

# This script takes schema and data from a .sql file, and replaces the chosen
# database with the database encoded in the .sql file. Useful if you want to
# reset the database to the last clean state, e.g. when you want to add new
# data for a test case.

# To use this script, you should change the paths below to point to the
# correct script and .sql files. I have put this script on my path, making
# it easy to use from any terminal.

if [ $# -ne 1 ]
then
  echo "Usage: $0 <DATABASE-NAME>"
  exit 1
fi

sudo -u postgres dropdb $1
/home/oliver/CATMAID/scripts/createuser.sh $1 catmaid_user catmaid_user_password | sudo -u postgres psql
psql -U catmaid_user $1 < /home/oliver/CATMAID/django/applications/vncbrowser/tables_and_data.sql
