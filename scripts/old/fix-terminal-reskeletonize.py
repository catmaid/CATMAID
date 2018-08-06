#!/usr/bin/env python
# -*- coding: utf-8 -*-

# If you have a terminal that is not part_of any skeleton, this script
# will try to find the right skeleton via its treenode and update with
# that.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

# Requires the file .catmaid-db to be present in your
# home directory, with the following format:
#
# host: localhost
# database: catmaid
# username: catmaid_user
# password: password_of_your_catmaid_user



import sys, os
from common import db_connection
from subprocess import check_call

if len(sys.argv) != 2:
    print >> sys.stderr, "Usage: %s <TERMINAL-ID>" % (sys.argv[0],)
    sys.exit(1)

terminal_id = int(sys.argv[1], 10)

c = db_connection.cursor()

# First check that it really is missing:

c.execute("""SELECT cici.class_instance_b
  FROM class_instance_class_instance cici, relation r
  WHERE cici.class_instance_a = %s AND
        cici.relation_id = r.id AND
        r.relation_name = 'part_of'""", (terminal_id,))
rows = c.fetchall()
if len(rows) != 0:
    print("The terminal was already part_of a skeleton")
    sys.exit(1)

# Find the right treenode:

c.execute("""SELECT tci.treenode_id, tci.user_id, tci.project_id
  FROM treenode_class_instance tci,
       relation r
  WHERE
    r.id = tci.relation_id AND
    r.relation_name = 'model_of' AND
    tci.class_instance_id = %s""", (terminal_id,))

rows = c.fetchall()
if len(rows) != 1:
    print >> sys.stderr, "Failed to find a unique treenode"
    sys.exit(1)

treenode_id, user_id, project_id = rows[0]

c.execute("""SELECT id
  FROM relation
  WHERE project_id = %s AND
        relation_name = 'part_of'""", (project_id,))
rows = c.fetchall()
if len(rows) != 1:
    print >> sys.stderr, "Failed to find the 'model_of' relation in project", project_id
    sys.exit(1)

relation_id = rows[0][0]

c.execute("""SELECT tci.class_instance_id
  FROM treenode_class_instance tci,
       class_instance ci,
       class c,
       relation r
  WHERE tci.class_instance_id = ci.id AND
        ci.class_id = c.id AND
        c.class_name = 'skeleton' AND
        r.id = tci.relation_id AND
        r.relation_name = 'element_of' AND
        tci.treenode_id = %s""", (treenode_id,))
rows = c.fetchall()
if len(rows) != 1:
    print >> sys.stderr, "Failed to find a unique skeleton"
    sys.exit(1)

skeleton_id = rows[0][0]

print("The skeleton was:", skeleton_id)

# Now insert the part_of relationship:

c.execute("""INSERT INTO class_instance_class_instance
  (user_id, project_id, relation_id, class_instance_a, class_instance_b)
  VALUES
  (%s, %s, %s, %s, %s)""", (user_id, project_id, relation_id, terminal_id, skeleton_id))

db_connection.commit()
c.close()
db_connection.close()
