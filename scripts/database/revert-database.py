# -*- coding: utf-8 -*-

#!/usr/bin/env python

# This is a small helper script revert a CATMAID
# database from to a recent backup.

# For example, you might call this as:

# revert-database.py /mnt/catmaid-backups/2011-12-10T19-14-47.bz2

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
from subprocess import Popen, check_call, PIPE
import getpass
from psycopg2 import IntegrityError
from datetime import datetime

if len(sys.argv) != 2:
    print("Usage: %s <COMPRESSED-BACKUP>" % (sys.argv[0],), file=sys.stderr)
    sys.exit(1)

filename = sys.argv[1]

# You must specify your password in ~/.pgpass, as described here:
#   http://www.postgresql.org/docs/current/static/libpq-pgpass.html

cat_command = ['bzcat', filename]

restore_command = ['psql',
                   '-U',
                   db_username,
                   '--no-password',
                   db_database]

p1 = Popen(cat_command, stdout=PIPE)
p2 = Popen(restore_command, stdin=p1.stdout)

p1.stdout.close()
p1.wait()
p2.wait()
