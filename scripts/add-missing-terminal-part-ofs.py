#!/usr/bin/env python

from common import db_connection

import sys

if len(sys.argv) != 3:
    print >> sys.stderr, "Usage: %s <PROJECT-ID> <USER-ID>" % (sys.argv[0],)
    sys.exit(1)

project_id = int(sys.argv[1])
user_id = int(sys.argv[2])

c = db_connection.cursor()

c.execute("SELECT id FROM relation WHERE project_id = %s AND relation_name='part_of'",
          (project_id,))
part_of_id = c.fetchone()[0]

for direction in ('pre', 'post'):
    query = '''
SELECT cit.id, cis.id
    FROM class_instance cit, class_instance cis,
         class cs, class ct,
         treenode_class_instance tcit, treenode_class_instance tcis
    WHERE ct.class_name = '{direction}synaptic terminal' AND
          cit.class_id = ct.id AND
          cs.class_name = 'skeleton' AND
          cis.class_id = cs.id AND
          tcit.class_instance_id = cit.id AND
          tcis.class_instance_id = cis.id AND
          tcit.treenode_id = tcis.treenode_id
'''.format(direction=direction)
    c.execute(query)
    rows = c.fetchall()
    for terminal_id, skeleton_id in rows:
        c.execute('''
INSERT INTO class_instance_class_instance
    (user_id, project_id, relation_id, class_instance_a, class_instance_b)
    VALUES (%(u)s, %(p)s, %(r)s, %(ca)s, %(cb)s)
''',
                  {'u': user_id,
                   'p': project_id,
                   'r': part_of_id,
                   'ca': terminal_id,
                   'cb': skeleton_id})

db_connection.commit()
c.close()
db_connection.close()
