#!/usr/bin/env python
# -*- coding: utf-8 -*-

from common import db_connection

import sys
import os

first_migration = '2011-07-10T19:23:39'

if len(sys.argv) != 1:
    print >> sys.stderr, "Usage: " + sys.argv[0]
    sys.exit(1)

everything_ok = True

c = db_connection.cursor()

c.execute("select tablename from pg_tables")
tables = set(x[0] for x in c.fetchall())

required_tables = [ "bezierkey",
                    "bezierkey",
                    "location",
                    "bezierprofile",
                    "broken_slice",
                    "class_instance",
                    "class_class",
                    "class_instance_class_instance",
                    "relation_instance",
                    "class",
                    "concept",
                    "message",
                    "treenode_connector",
                    "relation",
                    "user",
                    "object",
                    "project_stack",
                    "project_user",
                    "connector_class_instance",
                    "treenode_class_instance",
                    "treenode",
                    "textlabel",
                    "project",
                    "connector",
                    "stack",
                    "textlabel_location",
                    "profile" ]

for t in required_tables:
    if t not in tables:
        print("The required table '%s' was missing" % (t,))
        everything_ok = False

c.execute("select proname from pg_proc")
procedures = set(x[0] for x in c.fetchall())

if not 'connectby' in procedures:
    print("The procedure 'connectby' hasn't been defined")
    everything_ok = False

c.execute("select tgname from pg_trigger")
triggers = set(x[0] for x in c.fetchall())

required_triggers = [ "on_edit",
                      "on_edit_bezierprofile",
                      "on_edit_class",
                      "on_edit_relation_instance",
                      "on_edit_class_class",
                      "on_edit_class_instance",
                      "on_edit_class_instance_class_instance",
                      "on_edit_location",
                      "on_edit_connector",
                      "on_edit_connector_class_instance",
                      "on_edit_treenode_connector",
                      "on_edit_relation",
                      "on_edit_treenode",
                      "on_edit_treenode_class_instance" ]

for trigger in required_triggers:
    if not trigger in triggers:
        print("The required trigger '%s' was missing" % (trigger,))
        everything_ok = False

if not everything_ok:
    print('''It seems that your database is not in the state)
described in master.sql from commit 5145c06574a2, so
this script refuses to set the schema version.  You will
need to fix this by hand.  For more information see:
https://github.com/catmaid/CATMAID/wiki/Automatic-Database-Migrations'''
    sys.exit(1)

# Otherwise we can go ahead and set the schema version:

try:
    c.execute("SAVEPOINT sp")
    c.execute("CREATE TABLE settings (key text PRIMARY KEY, value text)")
except psycopg2.ProgrammingError as e:
    # This probably means that the table already exists
    c.execute("ROLLBACK TO SAVEPOINT sp")
    pass

try:
    c.execute("SAVEPOINT sp")
    c.execute("INSERT INTO settings (key, value) VALUES ('schema_version',%s)",
              (first_migration,))
except psycopg2.ProgrammingError as e:
    # This probably means that the row already exists
    c.execute("ROLLBACK TO SAVEPOINT sp")
    pass

print("Setting the schema version to '%s' ..." % (first_migration,))

c.execute("UPDATE settings SET value = %s WHERE key = 'schema_version'",
          (first_migration,))

print("done.")

db_connection.commit()
c.close()
db_connection.close()
