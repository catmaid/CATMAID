#!/usr/bin/python

# This is a small helper script to create a project, its stacks
# and add the required database entries to enable tracing of a
# the project with skeletons, connectors, etc.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

# Requires the file .catmaid-db in the home folder present
# with username and password of the catmaid database user

import sys
import psycopg2
import os

limit = 50

if len(sys.argv) != 3:
    print >> sys.stderr, "Usage: create-project.py <host> <database-name>"
    sys.exit(1)

database_host = sys.argv[1]
database_name = sys.argv[2]

db_login_filename = os.path.join(os.environ['HOME'],'.catmaid-db')
fp = open(db_login_filename)
for i, line in enumerate(fp):
  if i == 0:
    catmaid_db_user = line.strip()
  elif i == 1:
    catmaid_db_password = line.strip()

conn = psycopg2.connect(host=database_host, database=database_name,
                        user=catmaid_db_user,password=catmaid_db_password)

# Helper function
def create_annotation(user_id, project_id):

    print("Create annotations for project with id {0} as user with id {1}".format(project_id, user_id) )
    classes_required = [ ( "skeleton", True ),
                         ( "neuron", True ),
                         ( "group", True ),
                         ( "label", False ),
                         ( "root", False ),
                         ( "synapse", True ),
                         ( "presynaptic terminal", True ),
                         ( "postsynaptic terminal", True ) ]

    class_dictionary = {}

    for required_class, show_in_tree in classes_required:
        class_dictionary[required_class] = {'show_in_tree': show_in_tree};
        c.execute("INSERT INTO class (user_id, project_id, class_name, showintree) "+
                  "VALUES (%s, %s, %s, %s) RETURNING id",
                  (user_id, project_id, required_class, show_in_tree))
        class_dictionary[required_class]['id'] = c.fetchone()[0]

    c.execute("INSERT INTO class_instance (user_id, project_id, class_id, name) "+
              "VALUES (%s, %s, %s, %s)",
              (user_id,
               project_id,
               class_dictionary['root']['id'],
               'neuropile'))

    relations_required = (
        "labeled_as",
        "postsynaptic_to",
        "presynaptic_to",
        "element_of",
        "model_of",
        "part_of",
        "is_a"
        )

    for required_relation in relations_required:
        c.execute("INSERT INTO relation (user_id, project_id, relation_name) "+
                  "VALUES (%s, %s, %s)",
                  (user_id, project_id, required_relation))

    print("Annotation classes and relations successfully created.")

# Start dialog
c = conn.cursor()

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
    insert = 'INSERT INTO project (title, public) VALUES (%s, %s) RETURNING id'
    c.execute(insert, (project_name, project_public) )

    project_id = c.fetchone()[0]

    create_annotation( user_id, project_id )

    print("Project successfully created with ID {0}".format(project_id) )

    insert = 'INSERT INTO project_user (project_id, user_id) '
    insert += 'VALUES (%s, %s)'
    c.execute(insert, (project_id, user_id) )

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
    # trakem2_project = raw_input(": ")

    print("----")
    print("Title: {0}".format(title))
    print("Dimension: {0}".format(dimension))
    print("Resolution: {0}".format(resolution))
    print("Image Base: {0}".format(image_base))
    print("Comment: {0}".format(comment))
    print("Translation: {0}".format(translation))
    print("----")
    
    correct = raw_input("Is this information correct? [y]/n ")

    if correct in ('n', 'no', 'nop', 'nope'):
        continue

    insert = 'INSERT INTO stack (title, dimension, resolution, image_base, comment) '
    insert += 'VALUES (%s, %s, %s, %s, %s) RETURNING id'
    c.execute(insert, (title, dimension, resolution, image_base, comment) )
    stack_id = c.fetchone()[0]

    # update the project_stack table
    insert = 'INSERT INTO project_stack (project_id, stack_id, translation) '
    insert += 'VALUES (%s, %s, %s)'
    c.execute(insert, (project_id, stack_id, translation) )

    print("Created stack with id {0} and project-stack association.".format(stack_id) )

conn.commit()
c.close()
conn.close()

print("Finished script. Closed database connection.")