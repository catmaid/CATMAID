#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import psycopg2
import os
import yaml

first_migration = '2011-07-10T19:23:39'

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
    print >> sys.stderr, "Usage: %s" % (sys.argv[0],)
    sys.exit(1)

conn = psycopg2.connect(host=conf['host'],
                        database=conf['database'],
                        user=conf['username'],
                        password=conf['password'])

c = conn.cursor()

c.execute('SELECT id, title FROM project')
project_tuples = c.fetchall()

for project_id, project_title in project_tuples:
    print("========================================================================")
    print("project_id", project_id)
    print("project_title", project_title)

    c.execute('SELECT relation_name, id FROM relation WHERE project_id = %s',
              (project_id,))
    relations = dict(c.fetchall())
    if 'presynaptic_to' not in relations:
        # Then this project probably isn't set up for tracing
        continue

    c.execute('SELECT class_name, id FROM class WHERE project_id = %s',
              (project_id,))
    classes = dict(c.fetchall())

    # We could do pre and post synaptic in one go, but this is slightly
    # easier:
    for direction in ('presynaptic', 'postsynaptic'):
        print("doing direction:", direction)
        direction_relation_id = relations[direction + '_to']
        terminal_class_id = classes[direction + ' terminal']
        c.execute('''
SELECT tn.id, c.id, terminal1_to_syn.user_id
  FROM treenode tn,
       treenode_class_instance tci,
       class_instance terminal1,
       class_instance_class_instance terminal1_to_syn,
       class_instance syn,
       connector_class_instance syn_to_connector,
       connector c
  WHERE tn.project_id = %(project_id)s
    AND tn.id = tci.treenode_id
    AND tci.relation_id = %(model_of_id)s
    AND terminal1.id = tci.class_instance_id
    AND terminal1.class_id = %(terminal_class_id)s
    AND terminal1.id = terminal1_to_syn.class_instance_a
    AND terminal1_to_syn.relation_id = %(direction_relation_id)s
    AND syn.id = terminal1_to_syn.class_instance_b
    AND syn.class_id = %(synapse_class_id)s
    AND syn.id = syn_to_connector.class_instance_id
    AND syn_to_connector.relation_id = %(model_of_id)s
    AND syn_to_connector.connector_id = c.id
''',
                  {'project_id': project_id,
                   'model_of_id': relations['model_of'],
                   'terminal_class_id': terminal_class_id,
                   'direction_relation_id': direction_relation_id,
                   'synapse_class_id': classes['synapse']})
        for treenode_id, connector_id, user_id in c.fetchall():
            # Do a quick check that this relationship isn't already
            # recorded in the treenode_connector table.  It shouldn't
            # create a problem if we end up with duplicate entries,
            # but try to avoid that:
            parameters = {'treenode_id': treenode_id,
                          'connector_id': connector_id,
                          'project_id': project_id,
                          'user_id': user_id,
                          'direction_relation_id': direction_relation_id}
            c.execute('''
SELECT id
  FROM treenode_connector
  WHERE treenode_id = %(treenode_id)s
    AND connector_id = %(connector_id)s
    AND project_id = %(project_id)s
    AND relation_id = %(direction_relation_id)s
''',
            parameters)
            if not c.fetchone():
                # Then actually insert it:
                c.execute('''
INSERT INTO treenode_connector
  (project_id, user_id, treenode_id, connector_id, relation_id)
  VALUES (%(project_id)s, %(user_id)s, %(treenode_id)s, %(connector_id)s, %(direction_relation_id)s)
''',
                          parameters)

conn.commit()
c.close()
conn.close()
