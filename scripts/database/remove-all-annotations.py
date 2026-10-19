#!/usr/bin/env python

# This is a small helper script to remove all annotations from a
# project.

import sys
import os
from common import db_connection, conf

if len(sys.argv) != 1:
    print("Usage:", sys.argv[0], file=sys.stderr)
    sys.exit(1)

# The connection block commits on success and rolls back on errors or exit.
with db_connection, db_connection.cursor() as c:
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
