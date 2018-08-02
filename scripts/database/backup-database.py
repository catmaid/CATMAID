#!/usr/bin/env python
# -*- coding: utf-8 -*-

# This is a small helper script to back up a CATMAID
# database.

# For example, I'm calling this script from cron with the following
# crontab entry, which will cause a backup to happen every 8 hours at
# 20 past the hour:
#
# 20 0-23/8 * * * CATMAID_CONFIGURATION=$HOME/.catmaid-db.whatever $HOME/catmaid/scripts/backup-database.py /mnt/catmaid-backups/

# You will need to create a .pgpass file so that your password can be
# found.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

# Requires the file .catmaid-db to be present in your
# home directory, with the following format:
#
# host: localhost
# database: catmaid
# username: catmaid_user
# password: password_of_your_catmaid_user


import sys
import os
from common import db_database, db_username, db_password
from subprocess import check_call
import getpass
from psycopg2 import IntegrityError
from datetime import datetime

if len(sys.argv) != 2:
    print("Usage: %s <BACKUP-DIRECTORY>" % (sys.argv[0],), file=sys.stderr)
    sys.exit(1)

destination_directory = sys.argv[1]

output_filename = os.path.join(destination_directory,
                               datetime.now().strftime('%Y-%m-%dT%H-%M-%S'))

# You must specify your password in ~/.pgpass, as described here:
#   http://www.postgresql.org/docs/current/static/libpq-pgpass.html
dump_command = ['pg_dump',
                '--clean',
                '-U',
                db_username,
                '--no-password',
                db_database]

with open(output_filename, "w") as fp:
    check_call(dump_command, stdout=fp)

check_call(['bzip2', output_filename])
