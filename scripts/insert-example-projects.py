#!/usr/bin/python

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

import sys, os
from common import db_connection
from subprocess import check_call

limit = 50

if len(sys.argv) != 1:
    print >> sys.stderr, "Usage: %s" % (sys.argv[0],)
    sys.exit(1)

c = db_connection.cursor()

projects = {'Default Project': {'stacks': []},
            'Evaluation data set': {'stacks': []},
            'Focussed Ion Beam (FIB)': {'stacks': []}}

projects['Default Project']['stacks'].append(
    {'title': 'Original data.',
     'dimension': '(4096,4096,16)',
     'resolution': '(3.2614000000000001,3.2614000000000001,60)',
     'image_base': 'http://fly.mpi-cbg.de/map/evaluation/original/',
     'comment': '''<p>&copy;2007 by Stephan Saalfeld.</p>
<p>Rendered with <a href="http://www.povray.org/">POV-Ray&nbsp;v3.6</a>
using this <a href="http://fly.mpi-cbg.de/~saalfeld/download/volume.tar.bz2">scene-file</a>.</p>''',
     'trakem2_project': False})

projects['Focussed Ion Beam (FIB)']['stacks'].append(
    {'title': 'Focussed Ion Beam (FIB) stack of Rat Striatum',
     'dimension': '(2048,1536,460)',
     'resolution': '(5,5,9)',
     'image_base': 'http://incf.ini.uzh.ch/image-stack-fib/',
     'comment': '''
<p>&copy;2009 <a href="http://people.epfl.ch/graham.knott">Graham Knott</a>.</p>
<p>Public INCF data set available at the
<a href="http://www.incf.org/about/nodes/switzerland/data">Swiss INCF Node</a>.</p>''',
     'trakem2_project': False})

for p in projects:
    insert = "INSERT INTO project (title, public) VALUES (%s, %s) RETURNING id"
    c.execute(insert, (p, True) )
    projects[p]['id'] = c.fetchone()[0]

    # Now insert the stacks as well:
    for s in projects[p]['stacks']:
        insert = "INSERT INTO stack (%s) VALUES (%s) RETURNING id" % (
            ', '.join(s.keys()),
            ', '.join("%%(%s)s" % x for x in s.keys()))
        c.execute(insert, s)
        s['id'] = c.fetchone()[0]
        # And insert into the project_stack join table:
        c.execute("INSERT INTO project_stack "+
                  "(project_id, stack_id, translation) "+
                  "VALUES (%s, %s, %s)", (projects[p]['id'], s['id'], '(0,0,0)'))

users = [
    {'name': 'saalfeld',
     'pwd': '84789cbcbd2daf359a9fa4f34350e50f',
     'longname': 'Stephan Saalfeld'},
    {'name': 'test',
     'pwd': '098f6bcd4621d373cade4e832627b4f6',
     'longname': 'Theo Test'},
    {'name': 'gerhard',
     'pwd': '494524b27acdc356fb3dcb9f0b108267',
     'longname': 'Stephan Gerhard'}]

for u in users:
    insert = "INSERT INTO \"user\" (name, pwd, longname) VALUES (%(name)s, %(pwd)s, %(longname)s) RETURNING id"
    c.execute(insert, u)
    u['id'] = c.fetchone()[0]
    if u['name'] == 'gerhard':
        for p in ('Default Project', 'Focussed Ion Beam (FIB)'):
            c.execute("INSERT INTO project_user (project_id, user_id) VALUES (%s, %s)", (projects[p]['id'], u['id']))
    elif u['name'] == 'saalfeld':
        for p in projects:
            c.execute("INSERT INTO project_user (project_id, user_id) VALUES (%s, %s)", (projects[p]['id'], u['id']))

# Now insert the classes and relations for neuron annotation:

gerhard_id = users[2]['id']
tracing_project_id = projects['Focussed Ion Beam (FIB)']['id']

db_connection.commit()

helper_script = os.path.join(sys.path[0], 'setup-tracing-for-project.py')
check_call([helper_script,
            str(tracing_project_id),
            str(gerhard_id)])

# Find the class_id for the root node class_instance:
select = 'SELECT c.id FROM class c WHERE c.class_name = %s and c.project_id = %s'
c.execute(select, ('root', tracing_project_id))
row = c.fetchone()
root_class_id = row[0]

# Check if root node already exists
select = 'SELECT c.id FROM class_instance c WHERE c.class_id = %s and c.project_id = %s'
c.execute(select, (root_class_id, tracing_project_id))
row = c.fetchall()
if len(row) == 0:
    c.execute("INSERT INTO class_instance "+
              "(user_id, project_id, class_id, name) "+
              "VALUES (%(user_id)s, %(project_id)s, %(class_id)s, 'neuropile')",
              {'user_id': gerhard_id,
               'project_id': tracing_project_id,
               'class_id': root_class_id})

db_connection.commit()
c.close()
db_connection.close()
