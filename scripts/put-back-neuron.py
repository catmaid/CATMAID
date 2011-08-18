#!/usr/bin/python

import sys
import psycopg2
import os
import yaml

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

if len(sys.argv) != 2:
    print >> sys.stderr, "Usage: %s <SKELETON-ID>" % (sys.argv[0],)
    sys.exit(1)

orphaned_skeleton_id = int(sys.argv[1])

conn = psycopg2.connect(host=conf['host'],
                        database=conf['database'],
                        user=conf['username'],
                        password=conf['password'])

c = conn.cursor()

# Get the project ID first of all:

c.execute("SELECT project_id, user_id FROM class_instance WHERE id = %s",
          (orphaned_skeleton_id,))
project_id, user_id = c.fetchone()

# Now find the fragments folder:
# FIXME: should also check that this folder is a child of the
# root node.

c.execute("SELECT ci.id FROM class_instance ci, class c WHERE name = 'Fragments' AND ci.project_id = %s AND c.class_name = 'group' AND c.id = ci.class_id",
          (project_id,))
fragments_group_id = c.fetchone()[0]

c.execute("SELECT id FROM class c WHERE class_name = 'neuron'")
neuron_class_id = c.fetchone()[0]

# Now create the neuron:

c.execute("INSERT INTO class_instance (user_id, project_id, class_id, name) VALUES (%s, %s, %s, 'rescued neuron') RETURNING id",
          (user_id, project_id, neuron_class_id))
new_neuron_id = c.fetchone()[0]

c.execute("SELECT id FROM relation WHERE relation_name = 'model_of'")
model_of_id = c.fetchone()[0]

c.execute("SELECT id FROM relation WHERE relation_name = 'part_of'")
part_of_id = c.fetchone()[0]

c.execute("INSERT INTO class_instance_class_instance (user_id, project_id, relation_id, class_instance_a, class_instance_b) "+
          "VALUES (%s, %s, %s, %s, %s)",
          (user_id, project_id, part_of_id, new_neuron_id, fragments_group_id))

c.execute("INSERT INTO class_instance_class_instance (user_id, project_id, relation_id, class_instance_a, class_instance_b) "+
          "VALUES (%s, %s, %s, %s, %s)",
          (user_id, project_id, model_of_id, orphaned_skeleton_id, new_neuron_id))

conn.commit()
c.close()
conn.close()
