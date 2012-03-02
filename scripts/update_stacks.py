#!/usr/bin/python

# This is a small helper script to create a project, its stacks
# and add the required database entries to enable tracing of a
# the project with skeletons, connectors, etc.

# You may need to install psycopg2, e.g. with:
#	sudo apt-get install python-psycopg2

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
	print >> sys.stderr, "Usage: create-projects.py"
	sys.exit(1)

conn = psycopg2.connect(host=conf['host'], database=conf['database'],
						user=conf['username'], password=conf['password'])

# Structure to keep info about stacks
class StackInfo:
	def __init__(self, name, dim, res, url, metadata=""):
		self.name = name
		self.dim = dim
		self.res = res
		self.metadata = metadata
		self.comment = ''
		self.base_url = url
		self.file_ext = 'jpg'
		self.num_zoom_levels = 3

	def __cmp__(self, other):
		return cmp(self.name, other.name)

	def __str__(self):
		return "Stack: " + self.name + " dim: " + self.dim + " res: " + self.res + " url: " + self.base_url
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
if data_dir[len(data_dir)-1] != "/":
	data_dir = data_dir + "/"
if not os.path.isdir(data_dir):
	print >> sys.stderr, "The given directory was not found"
	sys.exit(1)
else:
	print "Using directory: " + data_dir

# Get fiter
filter_term = raw_input("Please add additional filters if you want (default: *): ")
if filter_term == "":
	filter_term = "*"

# Get all matching stack folders
stack_dirs = []
for currentFile in glob.glob( os.path.join(data_dir, filter_term) ):
	if os.path.isdir(currentFile):
		stack_dirs.append(currentFile)

# Find projects among stacks
projects = {}
projectNames = {}
for stack in stack_dirs:
		folderName = stack.replace(data_dir, "")
		dim = ""
		res = ""
		name = ""
		url = base_url + data_dir + folderName + "/"
		# Try to load info.yml of stack
		infoPath = data_dir + folderName  + "/info.yml"
		all_metadata = {}
		try:
			info = yaml.load(open(infoPath))
			dim = info['dimension']
			res = info['resolution']
			name = info['name']
			# Read out meta data, expect max. four channels
			all_metadata[0] = info['metadata-ch0'] if'metadata-ch0' in info else ""
			all_metadata[1] = info['metadata-ch1'] if'metadata-ch1' in info else ""
			all_metadata[2] = info['metadata-ch2'] if'metadata-ch2' in info else ""
			all_metadata[3] = info['metadata-ch3'] if'metadata-ch3' in info else ""
		except:
			print >> sys.stderr, "Could not read info.yml of stack " + stack
			sys.exit(1)
		stack_name = folderName
		metadata = ""
		# Rename stack if requested and choose correct meta data
		if stack_name.endswith("-ch1"):
			metadata = all_metadata[0]
			if simplify_stack_names:
				stack_name = "Channel 1"
		elif stack_name.endswith("-ch2"):
			metadata = all_metadata[1]
			if simplify_stack_names:
				stack_name = "Channel 2"
		elif stack_name.endswith("-ch3"):
			metadata = all_metadata[2]
			if simplify_stack_names:
				stack_name = "Channel 3"
		elif stack_name.endswith("-ch4"):
			metadata = all_metadata[3]
			if simplify_stack_names:
				stack_name = "Channel 4"
		elif stack_name.endswith("-composite"):
			if simplify_stack_names:
				stack_name = "Composite"
		# Create new stack info and add it to project
		si = StackInfo(stack_name, dim, res, url, metadata)
		projectId = folderName[:folderName.rfind("-")]
		if projectId not in projects:
			projects[projectId] = []
		projects[projectId].append(si)
		# Remember the name for the project if not already there
		if projectId not in projectNames:
			projectNames[projectId] = name
for p in projects:
	projects[p].sort()
	print 'projec: ' + p + " -- title: " + projectNames[p]
	for s in projects[p]:
		print '\t' + str(s)

# Check if this configuration is okay
projects_okay = raw_input("Should this project-stacks configuration be used? [y]/n: ")
if projects_okay in ('n', 'no', 'nop', 'nope'):
	print "Aborting on user request."
	sys.exit(1)

# Add all projects and stacks
for p in projects:
	print 'Looking at project: ' + projectNames[p]
	# Add stacks
	updated_stacks = []
	for s in projects[p]:
		update = "UPDATE stack SET dimension = %s, resolution = %s, metadata = %s WHERE image_base = %s AND title = %s"
		c.execute( update, (s.dim, s.res, s.metadata, s.base_url, s.name) )
		select = "SELECT * FROM stack WHERE image_base = %s AND title = %s"
		c.execute( select, (s.base_url, s.name) )
		stack_id = str(c.fetchone()[0])
		print '\tupdated stack ' + s.name + " with ID " + stack_id
		updated_stacks.append( stack_id )
	# Check if all stacks belong to same project
	linked_projects = []
	for s_id in updated_stacks:
		proj_select = 'SELECT ps.project_id FROM "project_stack" ps WHERE ps.stack_id = %s'
		c.execute( proj_select, ( str( s_id ), ) )
		rows = c.fetchall()
		for row in rows:
			p_id = str(row[0])
			if p_id not in linked_projects:
				linked_projects.append( p_id )
	if len( linked_projects ) > 1:
		print( "Warning: The stacks " + ", ".join( updated_stacks ) + " are linked to more than one project (" + ", ".join( linked_projects ) + ")" )
		update_anyway = raw_input("Should the project title be updated anyway? [y]/n: ")
		if update_anyway in ('n', 'no', 'nop', 'nope'):
			print "Continueing with next batcht."
			continue
	# Update project title of first project
	update = "UPDATE project SET title = %s WHERE id = %s"
	project_id = str( linked_projects[0] )
	c.execute( update, ( projectNames[p], project_id ) )
	print '\tupdated project ' + projectNames[p] + ' with ID ' + project_id

conn.commit()
c.close()
conn.close()
print 'done'

sys.exit(1)
