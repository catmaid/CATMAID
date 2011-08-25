#!/usr/bin/python

# This script dumps the complete tracing geometry (skeletons and connectors)
# into an irregular NeuroHDF dataset (neurohdf.org) and associates it to
# a Region which corresponds to the Stack in CATMAID.

# The complete microcircuitry of the NeuroHDF file can be visualized
# with fos-pyside (github.com/fos/fos-pyside)

import sys
import psycopg2
import os
import yaml
import numpy as np
import yaml


try:

    conf = yaml.load(open(os.path.join(os.environ['HOME'], '.catmaid-db')))
except:
    print >> sys.stderr, '''Your ~/.catmaid-db file should look like:
host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user'''
    sys.exit(1)

#if len(sys.argv) != 2:
#    print >> sys.stderr, "Usage: export_from_catmaid.py <PROJECT-ID>"
#    sys.exit(1)

pid = 3 # int(sys.argv[1])

conn = psycopg2.connect(host=conf['host'],
                        database=conf['database'],
                        user=conf['username'],
                        password=conf['password'])
c = conn.cursor()

# Find project information
select = 'SELECT p.title '
select += 'FROM project p '
select += 'WHERE p.id = %s'
c.execute(select,(pid,))
row = c.fetchone()
if not row:
	print >> sys.stderr, "No project with id {0} was found".format(pid)
	sys.exit(1)

ptitle, = row
print "Project found: {0}".format(ptitle)

###
# Export treenodes
###

# Retrieve skeleton class id
query = "SELECT c.id FROM class c WHERE c.project_id = %s AND c.class_name = '{skelname}'".format(skelname = 'skeleton')
c.execute(query,(pid,))
row = c.fetchone()
if not row:
    print >> sys.stderr, "No skeleton class was found in project {0}".format(ptitle)
    sys.exit(1)
scid, = row

# Retrieve element_of id
query = "SELECT r.id FROM relation r WHERE r.project_id = %s AND r.relation_name = '{eleof}'".format(eleof = 'element_of')
c.execute(query,(pid,))
row = c.fetchone()
if not row:
    print >> sys.stderr, "No element_of relation was found in project {0}".format(ptitle)
    sys.exit(1)
eleofid, = row

# Retrieve all skeletons from this project
query = 'SELECT ci.id FROM class_instance ci WHERE ci.project_id = %s AND ci.class_id = %s'
c.execute(query,(pid,scid))
rows = c.fetchall()
if len(rows) == 0:
    print >> sys.stderr, "No skeletons found in project {0}".format(ptitle)
    sys.exit(1)

# fetch skeleton nodes
query = """
select tn.id, (tn.location).x, (tn.location).y, (tn.location).z, tn.parent_id, tci.class_instance_id as skeleton_id from treenode as tn, treenode_class_instance as tci where tn.project_id = 3 and tci.treenode_id = tn.id and tci.relation_id = 11 order by tci.class_instance_id asc
"""
c.execute(query,(pid,scid))
tn_nr = c.rowcount
tn_xyz = np.zeros( (tn_nr, 3), dtype = np.float32 )
tn_connectivity = np.zeros( (tn_nr, 2), dtype = np.uint32 )
tn_skeletonid =  np.zeros( (tn_nr, 1), dtype = np.uint32 )
tn_id =  np.zeros( (tn_nr, 1), dtype = np.uint32 )
tn_mapid2idx = {}
tn_mapid2skelid = {}
cnt = 0
concnt = 0
for i,row in enumerate(c):
    tn_mapid2idx[row[0]] = i
    tn_mapid2skelid[row[0]] = row[5]
    tn_id[i] = row[0]
    tn_xyz[i,0] = row[1]
    tn_xyz[i,1] = row[2]
    tn_xyz[i,2] = row[3]
    if row[4] is None:
        # a root node
        cnt += 1
    else:
        tn_connectivity[concnt,0] = i
        tn_connectivity[concnt,1] = row[4]
        concnt += 1
    tn_skeletonid[i,0] = row[5]


# discard unused rows
tn_connectivity = tn_connectivity[:-(cnt),:]
# map connectivity to index
for row in tn_connectivity:
    print row
    row[1] = tn_mapid2idx[row[1]]
# type, only skeleton now
tn_type =  np.ones( (len(tn_connectivity), 1), dtype = np.uint32 )

# fetch connector nodes
query = """
select cn.id, (cn.location).x, (cn.location).y, (cn.location).z from connector as cn where cn.project_id = 3
"""
c.execute(query,(pid,scid))
cn_nr = c.rowcount
cn_id = np.zeros( (cn_nr, 1), dtype = np.uint32 )
cn_xyz = np.zeros( (cn_nr, 3), dtype = np.float32 )
cn_mapid2idx = {}
for i,row in enumerate(c):
    cn_mapid2idx[row[0]] = i
    cn_id[i,0] = row[0]
    cn_xyz[i,0] = row[1]
    cn_xyz[i,1] = row[2]
    cn_xyz[i,2] = row[3]

# fetch treenode - connector connectivity, transform to index connectivity
query = """
select tc.relation_id, tc.treenode_id, tc.connector_id from treenode_connector as tc where tc.project_id = 3
"""
c.execute(query,(pid,scid))
tc_nr = c.rowcount
tc_connectivity = np.zeros( (tc_nr, 2), dtype = np.uint32 )
tc_type = np.zeros( (tc_nr, 1), dtype = np.uint32 )
tc_id = np.zeros( (tc_nr, 1), dtype = np.uint32 )
for i,row in enumerate(c):
    tc_type[i,0] = row[0]
    tc_id[i,0] = tn_mapid2skelid[row[1]]
    tc_connectivity[i,0] = tn_mapid2idx[row[1]]
    tc_connectivity[i,1] = cn_mapid2idx[row[2]] + len(tn_xyz)

print tc_connectivity

vertices = np.concatenate( (tn_xyz, cn_xyz) )
connectivity = np.concatenate( (tn_connectivity, tc_connectivity) )
connectivity_type = np.concatenate( (tn_type, tc_type) )
connectivity_skeletonid = np.concatenate( (tn_skeletonid, tc_id) )

print "vertices", vertices
print "connectivity", connectivity
print "type", connectivity_type
print "skeletonid", connectivity_skeletonid

print "cnids", cn_id
# output into neurohdf irregular dataset for stack region

np.save('/home/stephan/vert.npy', vertices)
np.save('/home/stephan/conn.npy', connectivity)
np.save('/home/stephan/conn_id.npy', connectivity_skeletonid)

# act.deselect()

