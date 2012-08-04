#!/usr/bin/env python

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
import os
from common import db_connection
from subprocess import check_call

limit = 50

if len(sys.argv) != 1:
    print >> sys.stderr, "Usage: create-project.py"
    sys.exit(1)

# Start dialog
c = db_connection.cursor()

username = raw_input("What is your CATMAID user name: ")
select = 'SELECT u.id FROM "user" u WHERE u.name = %s'
c.execute(select, (username,) )
row = c.fetchone()
if not row:
    print >> sys.stderr, "Username does not exist in the database"
    sys.exit(1)
else:
    user_id = row[0]

project_name = raw_input("Project name: ")
select = 'SELECT p.id FROM "project" p WHERE p.title = %s'
c.execute(select, (project_name,) )
row = c.fetchone()
if row:
    project_id  = row[0]
    print("Found the project with the given name with the id {0}".format(project_id))
else:
    print >> sys.stderr, "Project does not yet exist in the database"

    project_public = raw_input("Should this project be public? [y]/n: ")

    if project_public in ('n', 'no', 'nop', 'nope'):
        project_public = "FALSE"
    else:
        project_public = "TRUE"

    # Check if project already exists
    insert = "INSERT INTO project (title, public) VALUES (%s, %s) RETURNING id"
    c.execute(insert, (project_name, project_public,) )
    db_connection.commit()

    project_id = c.fetchone()[0]

    print("Create annotations for project with id {0} as user with id {1}".format(project_id, user_id) )
    helper_script = os.path.join(sys.path[0], 'setup-tracing-for-project.py')
    check_call([helper_script,  str(project_id), str(user_id)])
    print("Annotation classes and relations successfully created.")

    print("Project successfully created with ID {0}".format(project_id) )

    print("Created association between user with id {0} and project with id {1}".format(user_id, project_id))

def add_new_stack():
    new_stack = raw_input("Add a new stack to the project? [y]/n: ")
    create_new_stack = not new_stack in ('n', 'no', 'nop', 'nope')
    return create_new_stack

while True:

    create_new_stack = add_new_stack()

    if not create_new_stack:
        break

    print("Create new stack")
    print("================")

    title = raw_input("Title: ")
    dimension = raw_input("Dimension as 3-tuple, like (1000,1000,400): ")
    resolution = raw_input("Resolution in nanometer as 3-tuple: ")
    image_base = raw_input("Image base URL: ")
    comment = raw_input("Additional comments (can be HTML formatted): ")
    translation = raw_input("Translation of the stack in the world project coordinates as 3-tuple: ")
    num_zoom_levels = raw_input("Number of zoom levels [default: -1 for heuristic]: ")
    file_extension = raw_input("File name extension for image tiles [default: jpg]: ")
    # trakem2_project = raw_input(": ")

    print("----")
    print("Title: {0}".format(title))
    print("Dimension: {0}".format(dimension))
    print("Resolution: {0}".format(resolution))
    print("Image Base: {0}".format(image_base))
    print("Comment: {0}".format(comment))
    print("Translation: {0}".format(translation))
    print("Num zoom levels: {0}".format(num_zoom_levels))
    print("File extension: {0}".format(file_extension))
    print("----")

    if num_zoom_levels is None or num_zoom_levels == '':
        num_zoom_levels = str(-1)

    if file_extension is None or file_extension == '':
        file_extension = 'jpg'

    correct = raw_input("Is this information correct? [y]/n ")

    if correct in ('n', 'no', 'nop', 'nope'):
        continue

    insert = 'INSERT INTO stack (title, dimension, resolution, image_base, comment, num_zoom_levels, file_extension) '
    insert += 'VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id'
    c.execute(insert, (title, dimension, resolution, image_base, comment, num_zoom_levels, file_extension) )
    stack_id = c.fetchone()[0]

    # update the project_stack table
    insert = 'INSERT INTO project_stack (project_id, stack_id, translation) '
    insert += 'VALUES (%s, %s, %s)'
    c.execute(insert, (project_id, stack_id, translation) )

    print("Created stack with id {0} and project-stack association.".format(stack_id) )

db_connection.commit()
c.close()
db_connection.close()

print("Finished script. Closed database connection.")
