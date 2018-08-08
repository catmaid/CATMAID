#!/usr/bin/env python
# -*- coding: utf-8 -*-

# This is a small helper script to remove all annotations from a
# project.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

import sys
import psycopg2
import os
from common import db_connection, conf
from six.moves import input

if len(sys.argv) != 1:
    print("Usage:", sys.argv[0], file=sys.stderr)
    sys.exit(1)

c = db_connection.cursor()

print("""Warning: this script removes all annotations from all projects
in the database '%s'""" % (conf['database'],),)
print("To continue, type 'Yes' followed by Enter.")
reply = input()
if reply != 'Yes':
    sys.exit(2)

tables_to_truncate = (
    'treenode_class_instance',
    'connector_class_instance',
    'treenode_connector',
    'class_instance_class_instance',
    'class_instance',
    'treenode',
    'connector',
    'class_class',
    'class',
    'relation'
)

c.execute('TRUNCATE '+', '.join(tables_to_truncate))

db_connection.commit()
c.close()
db_connection.close()
