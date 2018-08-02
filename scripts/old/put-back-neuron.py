#!/usr/bin/env python
# -*- coding: utf-8 -*-

from common import db_connection

import sys
import os

limit = 50

if len(sys.argv) != 2:
    print >> sys.stderr, "Usage: %s <SKELETON-ID>" % (sys.argv[0],)
    sys.exit(1)

orphaned_skeleton_id = int(sys.argv[1])

c = db_connection.cursor()

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

db_connection.commit()
c.close()
db_connection.close()
