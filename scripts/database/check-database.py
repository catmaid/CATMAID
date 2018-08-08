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

if len(sys.argv) != 1:
    print("Usage: %s" % (sys.argv[0],), file=sys.stderr)
    sys.exit(1)

c = db_connection.cursor()

# ------------------------------------------------------------------------
# Find all empty skeletons: first, find all the skeletons in the project:

c.execute("""
SELECT ci.id
   FROM (class_instance ci INNER JOIN class c ON c.id = ci.class_id AND c.class_name = 'skeleton')
   WHERE c.class_name = 'skeleton'""")

all_skeletons = set(x[0] for x in c.fetchall())

# Now find all skeletons that have at least one skeleton:

c.execute("""
SELECT DISTINCT tci.class_instance_id
   FROM (class_instance ci INNER JOIN class c ON c.id = ci.class_id AND c.class_name = 'skeleton')
     INNER JOIN treenode_class_instance tci ON tci.class_instance_id = ci.id
     INNER JOIN relation r ON tci.relation_id = r.id AND r.relation_name = 'element_of'""")

skeletons_with_at_least_one_treenode = set(x[0] for x in c.fetchall())

for skeleton_id in sorted((all_skeletons - skeletons_with_at_least_one_treenode)):
    print("[skeleton %d] is empty (has no treenodes)" % (skeleton_id,))

# ------------------------------------------------------------------------

# Try to find any cases where the skeleton_id column of
# treenode_connector table is inconsistent with the skeleton that the
# treenode is an element_of.

c.execute("""
SELECT tc.treenode_id, tci.class_instance_id, tc.id, tc.connector_id, tc.skeleton_id
  FROM treenode_connector tc, treenode_class_instance tci, relation er
  WHERE tc.treenode_id = tci.treenode_id AND
        tci.relation_id = er.id AND relation_name = 'element_of'
        AND tc.skeleton_id != tci.class_instance_id""")

for tid, skid, tcid, cid, tc_skid in c.fetchall():
    context = "[treenode %d <-> connector %d]" % (tid, cid)
    print(context, "The treenode is an element_of skeleton %d, but the skeleton_id column of treenode_connector is set to %d" % (skid, tc_skid))

# ------------------------------------------------------------------------

# Go through each skeleton - check that it has only one node
# for which the parent is NULL and that every other node has a parent
# in the same skeleton.

c.execute("""SELECT ci.id, p.id, p.title
  FROM class_instance ci, class c, project p
  WHERE ci.project_id = p.id AND
        c.class_name = 'skeleton' AND
        ci.class_id = c.id""")

for skeleton_id, project_id, project_title in c.fetchall():

    context = "[skeleton %d in project %d (%s)]" % (skeleton_id,
                                                    project_id,
                                                    project_title)

    # First find all treenodes via the element_of relation:

    c.execute("""SELECT t.id, t.parent_id
  FROM treenode t, treenode_class_instance tci, relation r
  WHERE t.id = tci.treenode_id AND
        tci.relation_id = r.id AND
        tci.class_instance_id = %s AND
        r.relation_name = 'element_of'""", (skeleton_id,))
    ids_and_parents = set(tuple(row) for row in c.fetchall())

    # Now find all treenodes via the redundant skeleton_id column in
    # treenode:

    c.execute("""SELECT t.id, t.parent_id
  FROM treenode t
  WHERE t.skeleton_id = %s""", (skeleton_id,))
    ids_and_parents_redundant = set(tuple(row) for row in c.fetchall())

    for treenode_id, parent in (ids_and_parents - ids_and_parents_redundant):
        print(context, "treenode_id", treenode_id, "with parent", parent, "was only found via element_of")

    for treenode_id, parent in (ids_and_parents_redundant - ids_and_parents):
        print(context, "treenode_id", treenode_id, "with parent", parent, "was only found via skeleton_id")

    parents = set(t[1] for t in ids_and_parents)

    if ids_and_parents:

        root_nodes = [t[0] for t in ids_and_parents if not t[1]]
        if len(root_nodes) == 0:
            print(context, "There were no root nodes")
        if len(root_nodes) > 1:
            print(context, "There were multiple (%d) root nodes" % (len(root_nodes),))
            isolated_root_nodes = 0
            for root_node_id in root_nodes:
                if root_node_id not in parents:
                    print(context, "No other node had root node %d as a parent" % (root_node_id,))
                    isolated_root_nodes += 1
            if isolated_root_nodes != (len(root_nodes) - 1):
                print(context, "!! Not automatically fixable.")

# Check there are no treenodes that are not element_of exactly one skeleton:

c.execute("""SELECT t.id, tci.class_instance_id
  FROM treenode t LEFT OUTER JOIN (treenode_class_instance tci INNER JOIN relation r ON tci.relation_id = r.id)
        ON t.id = tci.treenode_id
  WHERE r.relation_name = 'element_of'""")

for treenode_id, skeleton_id in c.fetchall():
    if not skeleton_id:
        print("The treenode %d was not an element_of any skeleton" % (treenode_id,))

c.close()
db_connection.close()

print("DONE!")
