#!/usr/bin/env python
# -*- coding: utf-8 -*-

# If you have a skeleton that has multiple root nodes,
# this script will attempt to fix that.

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
    print >> sys.stderr, "Usage: %s <SKELETON-ID>" % (sys.argv[0],)
    sys.exit(1)

skeleton_id = int(sys.argv[1], 10)

c = db_connection.cursor()

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

otherwise_broken = False

for treenode_id, parent in (ids_and_parents - ids_and_parents_redundant):
    print("treenode_id", treenode_id, "with parent", parent, "was only found via element_of")
    otherwise_broken = True

for treenode_id, parent in (ids_and_parents_redundant - ids_and_parents):
    print("treenode_id", treenode_id, "with parent", parent, "was only found via skeleton_id")
    otherwise_broken = True

if otherwise_broken:
    sys.exit(1)

parents = set(t[1] for t in ids_and_parents)

if not ids_and_parents:
    print >> sys.stderr, "No treenodes were found for that skeleton."
    sys.exit(1)

root_nodes = [t[0] for t in ids_and_parents if not t[1]]
if len(root_nodes) == 0:
    print("There were no root nodes - can't fix that automatically")
    sys.exit(1)
if len(root_nodes) == 1:
    print("No problem - just one root node")
    sys.exit(0)
if len(root_nodes) > 1:
    print("There were multiple (%d) root nodes" % (len(root_nodes),))
    to_reconnect = []
    for root_node_id in root_nodes:
        if root_node_id not in parents:
            print("No other node had root node %d as a parent" % (root_node_id,))
            to_reconnect.append(root_node_id)
    if len(to_reconnect) != (len(root_nodes) - 1):
        print("!! Not automatically fixable.")
        sys.exit(1)

treenode_id_to_position = {}

c.execute("""SELECT t.id, (t.location).x, (t.location).y, (t.location).z
  FROM treenode t
  WHERE t.skeleton_id = %s""", (skeleton_id,))

for treenode_id, x, y, z in c.fetchall():
    treenode_id_to_position[treenode_id] = (x, y, z)

for bad_root_node in to_reconnect:
    bx, by, bz = treenode_id_to_position[bad_root_node]
    print("bx:", bx, "by:", by, "bz:", bz )
    minimum_distance_squared = sys.float_info.max
    closest_other_treenode = None
    for treenode_id, _ in ids_and_parents:
        if treenode_id == bad_root_node:
            continue
        x, y, z = treenode_id_to_position[treenode_id]
        xdiff = x - bx
        ydiff = y - by
        zdiff = z - bz
        distance_squared = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff
        print("id:", treenode_id, "x:", x, "y:", y, "z:", z, "distance_squared is:", distance_squared)
        if distance_squared < minimum_distance_squared:
            minimum_distance_squared = distance_squared
            closest_other_treenode = treenode_id
    print("Would make the parent of:", bad_root_node, "the node with id:", closest_other_treenode)
    c.execute("UPDATE treenode SET parent_id = %s WHERE id = %s", (closest_other_treenode, bad_root_node))

db_connection.commit()
c.close()
db_connection.close()
