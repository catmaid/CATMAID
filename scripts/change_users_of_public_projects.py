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

if len(sys.argv) != 1:
	print >> sys.stderr, "Usage: change_users_of_public_projects.py"
	sys.exit(1)

conn = psycopg2.connect(host=conf['host'], database=conf['database'],
						user=conf['username'], password=conf['password'])

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

# Usernames to be linked to the projects
linked_users_input = True
linked_users = {}
while not linked_users:
	users = raw_input("What are the users that should be linked to public projects? ")
	if users == "":
		print "\tProject will only be linked to user \"" + username + "\""
		users = []
	else:
		users = users.split(',')
	if username not in users:
		users.append( username )
	accepted = raw_input("The project will be linked to the following " + str(len(users)) + " users " + ', '.join( users ) + " -- alright? [y]/n:")
	linked_users_input = accepted in ('n', 'no', 'nop', 'nope')
	if not linked_users_input:
		# Get the user ids
		for u in users:
			select = 'SELECT u.id FROM "user" u WHERE u.name = %s'
			c.execute(select, (u,) )
			row = c.fetchone()
			if not row:
				print >> sys.stderr, "Username " + u + " does not exist in the database"
				linked_users_input = True
			else:
				linked_users[u] = row[0]

# Get public projects
projects = []
select = 'SELECT p.id FROM "project" p WHERE p.public=%s'
c.execute( select, ( str( True ), ) )
rows = c.fetchall()
for row in rows:
	p_id = row[0]
	projects.append( p_id )

# Add all projects and stacks
for project_id in projects:
	# Link users to project
	for u in linked_users:
		# Check if that link already exists
		p_select = 'SELECT pu.project_id FROM "project_user" pu WHERE pu.project_id = %s AND pu.user_id = %s'
		c.execute( p_select, (project_id, linked_users[u]) )
		rows = c.fetchall()
		if len(rows) > 0:
			print '\tlinke already exists: project ' + str(project_id) + ' to user ' + u + ' with ID ' + str(linked_users[u])
		else:
			insert = 'INSERT INTO project_user (project_id, user_id) '
			insert += 'VALUES (%s, %s)'
			c.execute( insert, (project_id, linked_users[u]) )
			print '\tlinked project ' + str(project_id) + ' to user ' + u + ' with ID ' + str(linked_users[u])

conn.commit()
c.close()
conn.close()
print "done"
