#!/usr/bin/python

# This is a small helper script to create a project, its stacks
# and add the required database entries to enable tracing of a
# the project with skeletons, connectors, etc.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

# Requires the file .catmaid-db to be present in your
# home directory, with the following format:
#
# host: localhost
# database: catmaid
# username: catmaid_user
# password: password_of_your_catmaid_user

import sys
import psycopg2
import os
import yaml
import glob

try:
    conf = yaml.load(open(os.path.join(os.environ['HOME'], '.catmaid-db')))
except:
    print >> sys.stderr, '''Your ~/.catmaid-db file should look like:

host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user'''
    sys.exit(1)

limit = 50

# The base URL will be prpended to the data folder
base_url = 'http://rablibrary.mpi-cbg.de/catmaid/'
# Define if stack name substitution should be done
simplify_stack_names = True

if len(sys.argv) != 1:
    print >> sys.stderr, "Usage: remove_projects.py"
    sys.exit(1)

conn = psycopg2.connect(host=conf['host'], database=conf['database'],
                        user=conf['username'], password=conf['password'])

# Structure to keep info about stacks
class StackInfo:
	def __init__(self, name, dim, res, url):
		self.name = name
		self.dim = dim
		self.res = res
		self.comment = ''
		self.base_url = url
		self.file_ext = 'jpg'
		self.num_zoom_levels = 3

	def __cmp__(self, other):
		return cmp(self.name, other.name)

	def __str__(self):
		return "Stack: " + self.name + " dim: " + dim + " res: " + res + " url: " + self.base_url
#
# Start dialog
#
c = conn.cursor()

# Username
username = raw_input("What is your CATMAID user name: ")
select = 'SELECT u.id FROM "user" u WHERE u.name = %s'
c.execute(select, (username,) )
row = c.fetchone()
if not row:
    print >> sys.stderr, "Username does not exist in the database"
    sys.exit(1)
else:
    user_id = row[0]

# Stack selection
data_dir = raw_input("Data folder (with folder for each stack): ")
print "Looking for projects refering to directory: " + data_dir

select = 'SELECT s.id, s.title, s.image_base FROM "stack" s WHERE s.image_base LIKE %s'
like_dir = "%" + data_dir + "%"
c.execute(select, (like_dir,) )

count = 0
stacks_to_remove = []
rows = c.fetchall()
for row in rows:
    count = count + 1
    if row:
        stacks_to_remove.append( row[0] )
        print "Stack id: " + str(row[0]) + " -- title: " + row[1] + " -- image base: " + row[2]
    else:
        print "element " + str(count) + " is None"

print "Found " + str(count) + " stacks in total"

# Find all related projects

# Create dictionary fer projects to remove to hold a boolean if tha
# project should indeed be removed.
projects = {}
for s_id in stacks_to_remove:
    proj_select = 'SELECT ps.project_id FROM "project_stack" ps WHERE ps.stack_id = %s'
    c.execute( proj_select, ( str( s_id ), ) )
    rows = c.fetchall()
    for row in rows:
        p_id = row[0]
        if p_id not in projects:
            projects[ p_id ] = True

# Check if these projects contain othr stacks to
projects_to_remove = []
for p_id in projects:
    stack_select = 'SELECT ps.stack_id FROM "project_stack" ps WHERE ps.project_id = %s'
    c.execute( stack_select, ( str( p_id ), ) )
    rows = c.fetchall()
    extra_stacks = []
    for row in rows:
        s_id = row[0]
        # Mark the project as not to remove if it contains other stacks
        # than the ones wa want to remove.
        if s_id not in stacks_to_remove:
            projects[ p_id ] = False
            extra_stacks.append( s_id )
    if projects[ p_id ] == True:
        projects_to_remove.append( p_id )
    proj_select = 'SELECT p.id, p.title, p.public FROM "project" p WHERE p.id = %s'
    c.execute( proj_select, ( str( p_id ), ) )
    row = c.fetchone()
    print "Project id: " + str( p_id ) + " -- remove: " + str( projects[ p_id ] ) + " -- title: " + row[1] + " -- public: " + str( row[2] )
    if len( extra_stacks ) > 0:
        print "    extra stacks: " + str( extra_stacks )


# Let user confirm that all marked projects/stacks will be deleted
clear_db = raw_input("Should *all* removal-marked projects and stacks be removed from the DB? y/[n]: ")
if clear_db in ('y', 'yes', 'yo', 'ja', 'jo'):
	print "\tWill remove all marked projects and stacks from the DB."
	clear_db = True
else:
	print "\tWill *not* emove marked previous projects and stacks from the DB."
	clear_db = False

if clear_db:
    for p_id in projects_to_remove:
        print "Project " + str( p_id ) + " related:"
        print "    Deleting project-user connection"
        user_proj_del = 'DELETE FROM "project_user" pu WHERE pu.project_id = %s'
        c.execute( user_proj_del, ( str( p_id ), ) )
        print "    Deleding project-stack connection"
        stack_proj_del = 'DELETE FROM "project_stack" ps WHERE ps.project_id = %s'
        c.execute( stack_proj_del, ( str( p_id ), ) )
        print "    Deleting project"
        proj_del = 'DELETE FROM "project" p WHERE p.id = %s'
        c.execute( proj_del, ( str( p_id ), ) )
    for s_id in stacks_to_remove:
        print "Stack " + str( s_id ) + " related:"
        print "    Deleting stack"
        stack_del = 'DELETE FROM "stack" s WHERE s.id = %s'
        c.execute( stack_del, ( str( s_id ), ) )
        print "    Deleting connected overlays"
        overlay_del = 'DELETE FROM "overlay" o WHERE o.stack_id = %s'
        c.execute( overlay_del, ( str( s_id ), ) )
conn.commit()
c.close()
conn.close()
print 'done'

sys.exit(1)
