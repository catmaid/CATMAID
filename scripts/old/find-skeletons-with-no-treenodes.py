#!/usr/bin/env python
# -*- coding: utf-8 -*-

# This script checks your database for some common
# inconsistencies or errors that may have arisen from
# past bugs.

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
    print >> sys.stderr, "Usage: %s <PROJECT-ID>" % (sys.argv[0],)
    sys.exit(1)

project_id = sys.argv[1]

c = db_connection.cursor()

# This could be done with a single LEFT OUTER JOIN, but I'm too tired
# to figure that out at the moment...

# Find all the skeletons in the project:

c.execute("""
SELECT ci.id
   FROM (class_instance ci INNER JOIN class c ON c.id = ci.class_id AND c.class_name = 'skeleton')
   WHERE c.class_name = 'skeleton' AND ci.project_id = %s""",
          project_id)

all_skeletons = set(x[0] for x in c.fetchall())

# Now find all skeletons that have at least one skeleton:

c.execute("""
SELECT DISTINCT tci.class_instance_id
   FROM (class_instance ci INNER JOIN class c ON c.id = ci.class_id AND c.class_name = 'skeleton')
     INNER JOIN treenode_class_instance tci ON tci.class_instance_id = ci.id
     INNER JOIN relation r ON tci.relation_id = r.id AND r.relation_name = 'element_of'""")

skeletons_with_at_least_one_treenode = set(x[0] for x in c.fetchall())

for skeleton_id in sorted((all_skeletons - skeletons_with_at_least_one_treenode)):
    print(skeleton_id)

