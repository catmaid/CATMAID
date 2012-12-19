#!/usr/bin/env python

# This is a small helper script to add the required database entries
# to enable tracing of a particular project with treelines,
# connectors, etc.  This should really be done in a larger project
# creation script.

# You may need to install psycopg2, e.g. with:
#   sudo apt-get install python-psycopg2

import sys
import psycopg2
import os
from common import db_connection

if len(sys.argv) != 3:
    print >> sys.stderr, "Usage: %s <PROJECT-ID> <USER-ID>" % (sys.argv[0])
    sys.exit(1)

project_id = int(sys.argv[1])
user_id = int(sys.argv[2])

c = db_connection.cursor()

classes_required = [ "assembly",
                     "skeleton",
                     "neuron",
                     "group",
                     "label",
                     "root" ]

class_dictionary = {}

for required_class in classes_required:
    c.execute("SELECT id FROM class WHERE class_name = %s AND project_id = %s",
              (required_class, project_id))
    rows = c.fetchall()
    if len(rows) > 0:
        class_dictionary[required_class] = rows[0][0]
    else:
        c.execute("INSERT INTO class (user_id, project_id, class_name) "+
                  "VALUES (%s, %s, %s) RETURNING id",
                  (user_id, project_id, required_class))
        class_dictionary[required_class] = c.fetchone()[0]

c.execute("SELECT id FROM class_instance WHERE class_id = %s AND project_id = %s",
    (class_dictionary['root'], project_id))
rows = c.fetchall()
if len(rows) > 0:
    print('The root node already exists!')
else:
    c.execute("INSERT INTO class_instance (user_id, project_id, class_id, name) "+
          "VALUES (%s, %s, %s, %s)",
          (user_id,
           project_id,
           class_dictionary['root'],
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
    c.execute("SELECT id FROM relation WHERE relation_name = %s AND project_id = %s",
              (required_relation, project_id))
    rows = c.fetchall()
    if 0 == len(rows):
        c.execute("INSERT INTO relation (user_id, project_id, relation_name) "+
                  "VALUES (%s, %s, %s)",
                  (user_id, project_id, required_relation))

# TODO: Set viewing and editing permissions for user/project. This has to be set up
# manually at the moment using Django's admin interface.

db_connection.commit()
c.close()
db_connection.close()
