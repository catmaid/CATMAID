#! /bin/sh

# This script dumps the chosen database into a .sql file, useful if you've
# added new test case data.

# To use this script, you should change the paths below to point to the
# correct script and .sql files. I have put this script on my path, making
# it easy to use from any terminal.

if [ $# -ne 1 ]
then
  echo "Usage: $0 <DATABASE-NAME>"
  exit 1
fi

/home/oliver/CATMAID/scripts/database/dump-database.sh $1 > /home/oliver/CATMAID/django/applications/vncbrowser/tables_and_data.sql
