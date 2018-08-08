#!/usr/bin/env python
#
# This script will ask you for a Django authentication group name
# and possible permission options for CATMAID projects to grant
# those permmisons to all CATMAID projects.
#
# You may need to install psycopg2, e.g. with:
#	sudo apt-get install python-psycopg2
#
# Requires the file .catmaid-db to be present in your
# home directory, with the following format:
#
# host: localhost
# database: catmaid
# username: catmaid_user
# password: password_of_your_catmaid_user
#
# -*- coding: utf-8 -*-
import sys
import psycopg2
import os
import yaml
import re

from six.moves import input


try:
	conf = yaml.load(open(os.path.join(os.environ['HOME'], '.catmaid-db')))
except:
	print('''Your ~/.catmaid-db file should look like:

host: localhost
database: catmaid
username: catmaid_user
password: password_of_your_catmaid_user''', file=sys.stderr)
	sys.exit(1)

if len(sys.argv) != 1:
	print("Usage: change_users_of_public_projects.py", file=sys.stderr)
	sys.exit(1)

conn = psycopg2.connect(host=conf['host'], database=conf['database'],
						user=conf['username'], password=conf['password'])

#
# Start dialog
#
c = conn.cursor()

# Group name
groupname = input("Insert the group name that should get access to selected projects: ")
select = 'SELECT g.id FROM "auth_group" g WHERE g.name = %s'
c.execute(select, (groupname,) )
row = c.fetchone()
if not row:
	print("Group name " + groupname + " does not exist in the database", file=sys.stderr)
	sys.exit(1)
else:
	group_id = int(row[0])

# An idicator whether there are constaints on project selection
project_constraints = False

# Should only public projects be considered?
only_public_projects = input("Should only public projects be considered? y/[n]: ")
if only_public_projects in ('y', 'yes', 'Ja', 'Yo'):
	print("\tOnly public projects will be considered.")
	only_public_projects = True
	project_constraints = True
else:
	print("\tWill consider public *and* private projects.")
	only_public_projects = False

# Get the wanted project selection
while True:
	# Should there be any filter on the stacks of the projects?
	print( "You can now add a filter for stacks, associated with the a project. A project is ignored," )
	print( "when *no* stack of a project matches the filter. By default all stacks are matched." )
	stack_filter = input("Please add a regex filter if you want (default: .*): ")
	if len(stack_filter) == 0:
		stack_filter = ".*"

	# Do the actual project selection
	projects = {}
	select = 'SELECT p.id, p.title FROM "project" p'
	if project_constraints:
		select += " WHERE "
	if only_public_projects:
		select += " p.public = TRUE"
	c.execute( select )
	rows = c.fetchall()
	# Apply the stack filter
	re_filter = re.compile( stack_filter )
	for row in rows:
		p_id = row[0]
		p_name = row[1]
		# Get all the stacks associtated with the project
		select = 'SELECT s.image_base FROM stack s INNER JOIN project_stack ps ON (s.id = ps.stack_id) WHERE ps.project_id = %s'
		c.execute( select, ( p_id, ) )
		image_bases = c.fetchall()
		# Ignore projects without stacks
		if not image_bases:
			print( "Warning: project " + str(p_id) + " is not associated with any stacks. Ignoring project." )
			continue
		# Filter stacks
		all_matched = True
		for ib in image_bases:
			if re_filter.match(ib[0]) is None:
				all_matched = False
				break
		if all_matched:
			projects[ int(p_id) ] = p_name

	# Try again if no projects did match?
	if len(projects) == 0:
		try_again = input( "Sorry, no projects were found, try again? [y]/n: ")
		if try_again in ('n', 'no', 'nop', 'nope'):
			print("Canceled on user request.")
			sys.exit(1)
	else:
		# Ask whether to go on with the selected projects
		print( "Selected the following projects:" )
		for p in projects:
			print( "\t" + projects[p] + " (ID: " + str(p) + ")" )
		go_on = input("Should I continue with these selected projects? [y]/n: ")
		if go_on not in ('n', 'no', 'nop', 'nope'):
			break

# Get the content type id for CATMAID projets
select = 'SELECT ct.id FROM "django_content_type" ct WHERE ct.name = %s AND ct.app_label = %s AND model = %s'
c.execute( select, ("project", "catmaid", "project") )
row = c.fetchone()
if not row:
	print("Could not find content type ID for CATMAID projects. Exiting.", file=sys.stderr)
	sys.exit(1)
else:
	content_type_id = str(row[0])
	print( "Found content type ID for CATMAID projects: " + content_type_id )

# Ask for permissions to add
select = 'SELECT ap.id, ap.name FROM "auth_permission" ap WHERE ap.content_type_id = %s'
c.execute( select, ( content_type_id, ) )
rows = c.fetchall()
if not row:
	print("Could not find permission options for CATMAID projects. Exiting.", file=sys.stderr)
	sys.exit(1)
else:
	print( "Please select the permissions you want to grant to the group:" )
	for n, r in enumerate(rows):
		print( str(n) + ") " + r[1] )
	# Get a list of wanted permissions
	permissions = input( "Insert all permissions as comma seperated list (e.g. 1,2,3): " )
	permissions = permissions.replace(" ", "").split(",")
	permissions = [rows[int(p)][0] for p in permissions]
	if len(permissions) == 0:
		print( "Could not understand your permission selection list. Exiting." )
		sys.exit(1)
	print( "Using the following permission ids: " + str(permissions) )

# Add permissions
for project_id in projects:
	for permission_id in permissions:
		ggp_select = 'SELECT ggp.id FROM "guardian_groupobjectpermission" ggp WHERE '
		ggp_select += 'ggp.permission_id = %s AND ggp.content_type_id = %s AND ggp.object_pk = %s AND group_id = %s'
		c.execute( ggp_select, (permission_id, content_type_id, str(project_id), group_id) )
		rows = c.fetchall()
		if len(rows) > 0:
			print( "Permissions already exist on project \"" + projects[project_id] + "\" (ID: " + str(project_id) + ")")
		else:
			insert = 'INSERT INTO guardian_groupobjectpermission (permission_id, content_type_id, object_pk, group_id) '
			insert += 'VALUES (%s, %s, %s, %s)'
			c.execute( insert, (permission_id, content_type_id, str(project_id), group_id) )
			print( "Modified permissions on project \"" + projects[project_id] + "\" (ID: " + str(project_id) + ")")

conn.commit()
c.close()
conn.close()
print("Done")
