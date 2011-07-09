#!/usr/bin/python

# This is a small helper script to add the required database entries
# to enable tracing of a particular project with treelines,
# connectors, etc.  This should really be done in a larger project
# creation script.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

import sys
import psycopg2
import os

if len(sys.argv) != 2:
    print >> sys.stderr, "Usage: %s <PROJECT-ID> <USER-ID>"
    sys.exit(1)

project_id = int(sys.argv[1])
user_id = int(sys.argv[1])

db_login_filename = os.path.join(os.environ['HOME'],'.catmaid-db')
fp = open(db_login_filename)
for i, line in enumerate(fp):
  if i == 0:
    catmaid_db_user = line.strip()
  elif i == 1:
    catmaid_db_password = line.strip()

conn = psycopg2.connect(database="catmaid",user=catmaid_db_user,password=catmaid_db_password)

c = conn.cursor()

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
