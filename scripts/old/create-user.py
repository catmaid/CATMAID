#!/usr/bin/env python

# This is a small helper script to create a CATMAID user.

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
from common import db_connection
from subprocess import check_call
import getpass
from psycopg2 import IntegrityError

if len(sys.argv) != 3:
    print >> sys.stderr, "Usage: create-project.py <USERNAME> <LONG-NAME>"
    sys.exit(1)

username = sys.argv[1]
full_name = sys.argv[2]

# Now get a password from the user:
p1 = getpass.getpass()
p2 = getpass.getpass("Confirm passsword: ")

if p1 != p2:
    print >> sys.stderr, "The passwords didn't match."
    sys.exit(2)

c = db_connection.cursor()

try:
    c.execute('INSERT INTO "user" (name, pwd, longname) VALUES (%s, md5(%s), %s) RETURNING id',
              (username, p1, full_name))
except IntegrityError, e:
    print >> sys.stderr, "There is already a user called '%s'" % (username,)
    sys.exit(3)

user_id = c.fetchone()[0]

print "Created the user '%s' with ID: %d" % (username, user_id)

db_connection.commit()
c.close()
db_connection.close()
