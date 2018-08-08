#!/usr/bin/python
# -*- coding: utf-8 -*-

# This script fetches treenodes from the database and renders them to
# stack-sized PNGs

from math import pi as M_PI  # used by many snippets

import sys
import psycopg2
import os
import numpy as np
import yaml
import cairo
if not (cairo.HAS_IMAGE_SURFACE and cairo.HAS_PNG_FUNCTIONS):
  raise SystemExit ('cairo was not compiled with ImageSurface and PNG support')

# TODO: remove hard-coded stack information
# selecting only the project is not enough because node coordinates
# are not associated to a stack, they are in project space

stackx, stacky, stackz = 2048,1536,460
resx, resy, resz = 5,5,9

try:

    conf = yaml.load(open(os.path.join(os.environ['HOME'], '.catmaid-db')))
except:
    print('''Your ~/.catmaid-db file should look like:
host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user''', file=sys.stderr)
    sys.exit(1)

#if len(sys.argv) != 2:
#    print >> sys.stderr, "Usage: export_from_catmaid.py <PROJECT-ID>"
#    sys.exit(1)

pid = int(sys.argv[1])

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
	print("No project with id {0} was found".format(pid), file=sys.stderr)
	sys.exit(1)

ptitle, = row
print("Project found: {0}".format(ptitle))

###
# Export treenodes
###

# Retrieve skeleton class id
query = "SELECT c.id FROM class c WHERE c.project_id = %s AND c.class_name = '{skelname}'".format(skelname = 'skeleton')
c.execute(query,(pid,))
row = c.fetchone()
if not row:
    print("No skeleton class was found in project {0}".format(ptitle), file=sys.stderr)
    sys.exit(1)
scid, = row


# Retrieve element_of id
query = "SELECT r.id FROM relation r WHERE r.project_id = %s AND r.relation_name = '{eleof}'".format(eleof = 'element_of')
c.execute(query,(pid,))
row = c.fetchone()
if not row:
    print("No element_of relation was found in project {0}".format(ptitle), file=sys.stderr)
    sys.exit(1)
eleofid, = row

# Retrieve all skeletons from this project
query = 'SELECT ci.id FROM class_instance ci WHERE ci.project_id = %s AND ci.class_id = %s'
c.execute(query,(pid,scid))
rows = c.fetchall()
if len(rows) == 0:
    print("No skeletons found in project {0}".format(ptitle), file=sys.stderr)
    sys.exit(1)

# fetch skeleton nodes
query = """
SELECT tn.id, (tn.location).x, (tn.location).y, (tn.location).z, tn.parent_id, tci.class_instance_id as skeleton_id
FROM treenode as tn, treenode_class_instance as tci
WHERE tn.project_id = {pid} and tci.treenode_id = tn.id and tci.relation_id = {eleof}
ORDER BY tci.class_instance_id asc
""".format(pid = pid, eleof = eleofid)
c.execute(query,)
tn_nr = c.rowcount
tn_xyz = np.zeros( (tn_nr, 3), dtype = np.float32 )
tn_connectivity = np.zeros( (tn_nr, 2), dtype = np.uint32 )
tn_skeletonid =  np.zeros( (tn_nr, 1), dtype = np.uint32 )
cnt = 0
concnt = 0
for i,row in enumerate(c):
    tn_xyz[i,0] = row[1]
    tn_xyz[i,1] = row[2]
    tn_xyz[i,2] = row[3]

# fetch connector nodes
query = """
SELECT cn.id, (cn.location).x, (cn.location).y, (cn.location).z
FROM connector as cn
WHERE cn.project_id = {pid}
""".format(pid = pid)
c.execute(query)
cn_nr = c.rowcount
cn_xyz = np.zeros( (cn_nr, 3), dtype = np.float32 )
for i,row in enumerate(c):
    cn_xyz[i,0] = row[1]
    cn_xyz[i,1] = row[2]
    cn_xyz[i,2] = row[3]

## now rendering with CAIRO

def circle(cr, xc, yc):
    cr.set_source_rgba (1, 0.2, 0.2, 1.0)
    cr.arc (xc, yc, 6, 0, 2*M_PI)
    cr.fill()

def circle_con(cr, xc, yc):
    cr.set_source_rgba (0.92, 0.45, 0.0, 1.0)
    cr.arc (xc, yc, 12, 0, 2*M_PI)
    cr.fill()

def render_points_to_png(width, height, txyz, cxyz, fname):
    """ Make slice with skeleton and connector nodes """
    print("Render")

    surface = cairo.ImageSurface (cairo.FORMAT_ARGB32, width, height)
    cr = cairo.Context (surface)
    cr.save()

    for xc, yc, zc in txyz:
        #print(xc/resx, yc/resy)
        circle(cr, xc/resx, yc/resy)

    for xc, yc, zc in cxyz:
        #print(xc/resx, yc/resy)
        circle_con(cr, xc/resx, yc/resy)

    cr.restore()
    surface.write_to_png(fname)

for i in range(10):
    print("stack {0}".format(i))

    idx = np.where(tn_xyz[:,2]==float(i*resz))[0]
    txyz = tn_xyz[idx,:]

    idx = np.where(cn_xyz[:,2]==float(i*resz))[0]
    cxyz = cn_xyz[idx,:]

    render_points_to_png(stackx, stacky, txyz, cxyz, fname='/tmp/slice_{0}.png'.format(i))

# then, convert to tiff and create image pyramid
# add it as overlay to catmaid
