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

try:
    conf = yaml.load(open(os.path.join(os.environ['HOME'], '.catmaid-db')))
except:
    print >> sys.stderr, '''Your ~/.catmaid-db file should look like:

host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user'''
    sys.exit(1)

if len(sys.argv) != 2:
    print >> sys.stderr, "Usage: export_from_catmaid.py <PROJECT-ID>"
    sys.exit(1)

pid = int(sys.argv[1])

conn = psycopg2.connect(host=conf['host'],
                        database=conf['database'],
                        user=conf['username'],
                        password=conf['password'])

c = conn.cursor()

def treenodes_to_numpy(tnrows):
	""" Converts retrieved list of treenode tuples to an array 
	
	Parameters
	----------
	tnrows : list of tuples
		treenode tuples of the form (id, loc.x, loc.y, loc.z, parent_id)
	
	Returns
	-------
	location : Nx3 array-like
	local_topology : Nx1 array-like
	idx : Nx1 array-like
	
	Notes
	-----
	For root nodes, the parent_id is None and is converted to -1.
	Assumes that the first tuple is the root node tuple.
	"""
	N = len( tnrows )
	if N == 0:
		return None, None
		
	locarr = np.zeros( (N,3), dtype = np.float32 )
	loctop = np.zeros( (N,), dtype = np.int32 )
	
	# First tuple is root node
	assert( tnrows[0][-1] == None )
	idx = []
	par = []
	for i, tn in enumerate(tnrows):
		locarr[i,0] = tn[1]
		locarr[i,1] = tn[2]
		locarr[i,2] = tn[3]
		idx.append( tn[0] )
		par.append( tn[-1] )
	
	# build local topology array
	# for root node, first entry is -1
	loctop[0] = -1
	for i,p in enumerate(par[1:]):
		loctop[i+1] = idx.index(p)

	return locarr, loctop, idx
	

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
    
# Loop over all skeletons, retrieve treenodes (element_of)
allskeletons = []
skelidlist = []
for row in rows:
	skid, = row
	skelidlist.append( skid )
	print "exporting skeleton {0}".format(skid)
	query = 'SELECT t.id, (t.location).x, (t.location).y, (t.location).z , t.parent_id '
	query += 'FROM treenode t, treenode_class_instance tci '
	query += 'WHERE t.project_id = %s AND tci.class_instance_id = %s AND '
	query += 't.id = tci.treenode_id AND tci.relation_id = {relid} '.format(relid = eleofid)
	query += 'ORDER BY t.parent_id DESC'
	c.execute(query,(pid,skid,))
	tnrows = c.fetchall()
	# Transform retrieved list of treenodes to a numpy array
	allskeletons.append( treenodes_to_numpy(tnrows) )

# Make big table
# Find absolute number of treenodes
N = 0
for sk in allskeletons:
	N += len( sk[0] )

all_id =  np.zeros( (N,), dtype = np.int32 )
all_loc = np.zeros( (N,3), dtype = np.float32 )
all_lab = np.zeros( (N,), dtype = np.int32 )
all_top = np.zeros( (N,), dtype = np.int32 )

cnt = 0
for i, arr in enumerate(allskeletons):
	locarr, toparr, idx = arr
	Nskel = len( locarr )
	
	all_loc[cnt:cnt+Nskel, :] = locarr
	all_top[cnt:cnt+Nskel] = toparr
	all_lab[cnt:cnt+Nskel] = [ skelidlist[i] ] * Nskel
	all_id[cnt:cnt+Nskel] = idx
	cnt += Nskel
	
# Exporting treenodes finished.

###
# Export connectors
###
# Need to be clear how we index topology into treenode arrays
# Probably need to recover the globally unique treenode id for global topology,
# or remapped topology of all_X arrays
