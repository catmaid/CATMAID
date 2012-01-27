#!/usr/bin/python

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
    print >> sys.stderr, "Usage: %s" % (sys.argv[0],)
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
    print "[skeleton %d] is empty (has no treenodes)" % (skeleton_id,)

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
    print context, "The treenode is an element_of skeleton %d, but the skeleton_id column of treenode_connector is set to %d" % (skid, tc_skid)

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
        print context, "treenode_id", treenode_id, "with parent", parent, "was only found via element_of"

    for treenode_id, parent in (ids_and_parents_redundant - ids_and_parents):
        print context, "treenode_id", treenode_id, "with parent", parent, "was only found via skeleton_id"

    parents = set(t[1] for t in ids_and_parents)

    if ids_and_parents:

        root_nodes = [t[0] for t in ids_and_parents if not t[1]]
        if len(root_nodes) == 0:
            print context, "There were no root nodes"
        if len(root_nodes) > 1:
            print context, "There were multiple (%d) root nodes" % (len(root_nodes),)
            isolated_root_nodes = 0
            for root_node_id in root_nodes:
                if root_node_id not in parents:
                    print context, "No other node had root node %d as a parent" % (root_node_id,)
                    isolated_root_nodes += 1
            if isolated_root_nodes != (len(root_nodes) - 1):
                print context, "!! Not automatically fixable."

# Look for treenode <-> connector relations in the geometry domain:

c.execute("""SELECT tc.treenode_id, tc.connector_id, r.relation_name
  FROM treenode_connector tc, relation r
  WHERE tc.relation_id = r.id""")

geometry_relations = []
treenode_connector_from_geometry = set([])

for treenode_id, connector_id, relation_name in c.fetchall():
    context = "treenode %d <-> connector %d" % (treenode_id, connector_id)
    if relation_name not in ('presynaptic_to', 'postsynaptic_to'):
        print context, "Wrong relation:", relation_name
    geometry_relations.append((treenode_id, connector_id, relation_name))
    treenode_connector_from_geometry.add((treenode_id, connector_id))

# Now look for relations in the annotation domain:

c.execute("""SELECT cici.class_instance_a, cici.class_instance_b, r.relation_name
  FROM class_instance_class_instance cici, class_instance ci, class c, relation r
  WHERE cici.class_instance_b = ci.id AND
        ci.class_id = c.id AND
        c.class_name = 'synapse' AND
        cici.relation_id = r.id""")

annotation_relations = []
treenode_connector_from_annotation = set([])
treenode_to_skeleton_via_annotation = {}

for terminal_id, synapse_id, relation_name in c.fetchall():
    context = "terminal %d <-> synapse %d" % (terminal_id, synapse_id)
    if relation_name not in ('presynaptic_to', 'postsynaptic_to'):
        print context, "Wrong relation:", relation_name

    # Now find the treenode that models that terminal, and do some
    # checks:
    c.execute("""SELECT tci.treenode_id, c.class_name
  FROM treenode_class_instance tci, class_instance ci, relation r, class c
  WHERE tci.class_instance_id = %s AND
        tci.class_instance_id = ci.id AND
        ci.class_id = c.id AND
        tci.relation_id = r.id AND
        r.relation_name = 'model_of'""", (terminal_id,))
    rows = c.fetchall()
    if len(rows) == 0:
        print context, "No treenode found that models that terminal"
    elif len(rows) > 1:
        print context, "More than one treenode found that models that terminal"
    treenode_id, terminal_class = rows[0]
    if relation_name == 'presynaptic_to' and (terminal_class != 'presynaptic terminal'):
        print context, "The relation (%s) didn't match the terminal class (%s)" % (relation_name, terminal_class)
    if relation_name == 'postsynaptic_to' and (terminal_class != 'postsynaptic terminal'):
        print context, "The relation (%s) didn't match the terminal class (%s)" % (relation_name, terminal_class)

    # Now find the connector that models the synapse:
    c.execute("""SELECT cci.connector_id
  FROM connector_class_instance cci, relation r
  WHERE cci.class_instance_id = %s AND
        cci.relation_id = r.id AND
        r.relation_name = 'model_of'""", (synapse_id,))
    rows = c.fetchall()
    if len(rows) == 0:
        print context, "No connector found that models that synapse"
    elif len(rows) > 1:
        print context, "More than one treenode found that models that synapse"
    connector_id = rows[0][0]

    treenode_connector_from_annotation.add((treenode_id, connector_id))

    # Also check that the terminal is part of the same skeleton that
    # the treenode is an element_of:

    c.execute("""SELECT cici.class_instance_b
  FROM class_instance_class_instance cici, relation r
  WHERE cici.class_instance_a = %s AND
        cici.relation_id = r.id AND
        r.relation_name = 'part_of'""", (terminal_id,))
    rows = c.fetchall()
    if len(rows) == 0:
        print context, "The terminal was not part_of any skeleton"
    elif len(rows) > 1:
        print context, "The terminal was part_of more than one skeleton"
    else:

        skeleton_id_from_annotation = rows[0][0]
        treenode_to_skeleton_via_annotation[treenode_id] = skeleton_id_from_annotation

        c.execute("""SELECT tci.class_instance_id
  FROM treenode_class_instance tci, relation r
  WHERE tci.treenode_id = %s AND
        tci.relation_id = r.id AND
        r.relation_name = 'element_of'""", (treenode_id,))
        rows = c.fetchall()
        if len(rows) == 0:
            print context, "The treenode was not part_of any skeleton"
        elif len(rows) > 1:
            print context, "The treenode was part_of more than one skeleton"
        else:
            skeleton_id_from_geometry = rows[0][0]
            if skeleton_id_from_geometry != skeleton_id_from_geometry:
                print context, "The skeleton (%d) from the terminal didn't match that from the treenode (%d)" % (skeleton_id_from_annotation,
                                                                                                                 skeleton_id_from_geometry)

# Find the set differences:

for treenode_id, connector_id in (treenode_connector_from_geometry - treenode_connector_from_annotation):
    context = "treenode %d <-> connector %d" % (treenode_id, connector_id)
    print context, "was present in the geometry but not annotation domain"

for treenode_id, connector_id in (treenode_connector_from_annotation - treenode_connector_from_geometry):
    context = "treenode %d <-> connector %d" % (treenode_id, connector_id)
    print context, "was present in the annotation but not geometry domain"

# Check there are no treenodes that are not element_of exactly one skeleton:

c.execute("""SELECT t.id, tci.class_instance_id
  FROM treenode t LEFT OUTER JOIN (treenode_class_instance tci INNER JOIN relation r ON tci.relation_id = r.id)
        ON t.id = tci.treenode_id
  WHERE r.relation_name = 'element_of'""")

for treenode_id, skeleton_id in c.fetchall():
    if not skeleton_id:
        print "The treenode %d was not an element_of any skeleton" % (treenode_id,)
        if treenode_id in treenode_to_skeleton_via_annotation:
            print "However, via a terminal, it should be part of skeleton %d" % (treenode_to_skeleton_via_annotation[treenode_id],)

c.close()
db_connection.close()
