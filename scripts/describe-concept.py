#!/usr/bin/python

import sys
import psycopg2
import os

limit = 50

if len(sys.argv) != 3:
    print >> sys.stderr, "Usage: describe-concept.py <PROJECT-ID> <CONCEPT-ID>"
    sys.exit(1)

pid = int(sys.argv[1])
cid = int(sys.argv[2])

pwhere = "t.project_id = "+str(pid)

catmaid_db_user = None
catmaid_db_password = None

db_login_filename = os.path.join(os.environ['HOME'],'.catmaid-db')
fp = open(db_login_filename)
for i, line in enumerate(fp):
  if i == 0:
    catmaid_db_user = line.strip()
  elif i == 1:
    catmaid_db_password = line.strip()

conn = psycopg2.connect(database="catmaid",user=catmaid_db_user,password=catmaid_db_password)

c = conn.cursor()

relations = {}
c.execute('SELECT id, relation_name FROM relation t WHERE '+pwhere)
for r in c.fetchall():
    relations[r[1]] = r[0]

tables = [ "treenode", "class_instance", "connector" ]

class_name = None

select = 'SELECT p.relname FROM concept t, pg_class p WHERE id = %s AND t.tableoid = p.oid AND '+pwhere
c.execute(select,(cid,))
row = c.fetchone()
if not row:
    print >> sys.stderr, "No concept with id %d was found" % (cid,)
    sys.exit(1)

table_name = row[0]

print "== " + table_name + " =="

def get_location(location_id):
    query = 'SELECT (t.location).x, (t.location).y, (t.location).z FROM location t WHERE id = %s AND '+pwhere
    c.execute(query,(location_id,))
    return c.fetchone()

def get_treenode_radius(treenode_id):
    c.execute('SELECT radius FROM treenode t WHERE id = %s AND '+pwhere,
              (treenode_id,))
    return c.fetchone()[0]

def print_all_relationships(cid):
    combinations = [ { 'this': 'class_instance_a', 'other': 'class_instance_b', 't': 'class_instance_class_instance', 'f': '  [this] {relation_name} {value}' },
                     { 'this': 'class_instance_b', 'other': 'class_instance_a', 't': 'class_instance_class_instance', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'class_instance_id', 'other': 'treenode_id', 't': 'treenode_class_instance', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'treenode_id', 'other': 'class_instance_id', 't': 'treenode_class_instance', 'f': '  [this] {relation_name} {value}' },
                     { 'this': 'class_instance_id', 'other': 'connector_id', 't': 'connector_class_instance', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'connector_id', 'other': 'class_instance_id', 't': 'connector_class_instance', 'f': '  [this] {relation_name} {value}' } ]
    for comb in combinations:
        for rname, rid in relations.items():
            comb['relation_name'] = rname
            comb['pwhere'] = pwhere
            query = 'SELECT {other} FROM {t} t WHERE {this} = %s AND relation_id = %s AND {pwhere}'.format(**comb)
            c.execute(query,(cid,rid))
            rows = c.fetchall()
            for row in rows[0:limit]:
                comb['value'] = row[0]
                print comb['f'].format(**comb)
            if len(rows) > limit:
                print "  [... further output elided ...]"

if table_name == 'class_instance':
    c.execute('SELECT c.class_name, c.id, t.name FROM class_instance t, class c '+
               'WHERE c.id = t.class_id AND '+
               't.id = %s AND '+pwhere, (cid,) )
    class_name, class_id, ci_name = c.fetchone()
    print "  ... of class: %d (%s)"%(class_id,class_name)
    print "  ... with name: "+ci_name
    print_all_relationships(cid)

elif table_name == 'connector':
    print '  ... at position: ', get_location(cid)
    print_all_relationships(cid)

elif table_name == 'treenode':
    print '  ... at position: ', get_location(cid)
    print '  ... of radius: ', get_treenode_radius(cid)
    print_all_relationships(cid)

elif table_name == 'class':
    c.execute('SELECT class_name FROM class t WHERE id = %s AND '+pwhere,(cid,))
    print '  ... with name: '+c.fetchone()[0]

elif table_name == 'relation':
    c.execute('SELECT relation_name FROM relation t WHERE id = %s AND '+pwhere,(cid,))
    print '  ... with name: '+c.fetchone()[0]

else:
    print "There's currently no support for entities from the table '%s'" % (table_name,)
