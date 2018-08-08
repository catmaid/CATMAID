#!/usr/bin/env python
# -*- coding: utf-8 -*-
from common import db_connection

import sys

limit = 50

if len(sys.argv) != 2:
    print("Usage: describe-concept.py <CONCEPT-ID>", file=sys.stderr)
    sys.exit(1)

cid = int(sys.argv[1])

c = db_connection.cursor()

# Find which table the concept is really in, and also the project_id:

select = 'SELECT p.relname, t.project_id, t.user_id, u.name '
select += 'FROM concept t, pg_class p, "user" u '
select += 'WHERE t.id = %s AND t.tableoid = p.oid AND t.user_id = u.id'
c.execute(select,(cid,))
row = c.fetchone()
if not row:
    print("No concept with id {0} was found".format(cid), file=sys.stderr)
    sys.exit(1)

table_name, pid, user_id, user_name = row

# Find all the relations in that project:

relations = {}
c.execute('SELECT id, relation_name FROM relation t WHERE project_id = %s',(pid,))
for r in c.fetchall():
    relations[r[1]] = r[0]

print("== " + table_name + " ==")
print("-- owned by {0} ({1})".format(user_id,user_name))

def get_location(location_id):
    query = 'SELECT (t.location).x, (t.location).y, (t.location).z FROM location t WHERE id = %s'
    c.execute(query,(location_id,))
    return c.fetchone()

def get_treenode_radius(treenode_id):
    c.execute('SELECT radius FROM treenode t WHERE id = %s',
              (treenode_id,))
    return c.fetchone()[0]

def print_all_relationships(cid):
    combinations = [ { 'this': 'class_instance_a', 'other': 'class_instance_b', 't': 'class_instance_class_instance', 'f': '  [this] {relation_name} {value}' },
                     { 'this': 'class_instance_b', 'other': 'class_instance_a', 't': 'class_instance_class_instance', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'class_instance_id', 'other': 'treenode_id', 't': 'treenode_class_instance', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'treenode_id', 'other': 'class_instance_id', 't': 'treenode_class_instance', 'f': '  [this] {relation_name} {value}' },
                     { 'this': 'connector_id', 'other': 'treenode_id', 't': 'treenode_connector', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'treenode_id', 'other': 'connector_id', 't': 'treenode_connector', 'f': '  [this] {relation_name} {value}' },
                     { 'this': 'class_instance_id', 'other': 'connector_id', 't': 'connector_class_instance', 'f': '  {value} {relation_name} [this]' },
                     { 'this': 'connector_id', 'other': 'class_instance_id', 't': 'connector_class_instance', 'f': '  [this] {relation_name} {value}' } ]
    for comb in combinations:
        for rname, rid in relations.items():
            comb['relation_name'] = rname
            query = 'SELECT {other} FROM {t} t WHERE {this} = %s AND relation_id = %s'.format(**comb)
            c.execute(query,(cid,rid))
            rows = c.fetchall()
            for row in rows[0:limit]:
                comb['value'] = row[0]
                print(comb['f'].format(**comb))
            if len(rows) > limit:
                print("  [... further output elided ...]")

if table_name == 'class_instance':
    c.execute('SELECT c.class_name, c.id, t.name FROM class_instance t, class c '+
               'WHERE c.id = t.class_id AND '+
               't.id = %s', (cid,) )
    class_name, class_id, ci_name = c.fetchone()
    print("  ... of class: {0} ({1})".format(class_id,class_name))
    print("  ... with name: "+ci_name)
    print_all_relationships(cid)

elif table_name == 'connector':
    print('  ... at position: ', get_location(cid))
    print_all_relationships(cid)

elif table_name == 'treenode':
    print('  ... at position: ', get_location(cid))
    print('  ... of radius: ', get_treenode_radius(cid))
    print_all_relationships(cid)

elif table_name == 'class':
    c.execute('SELECT class_name FROM class t WHERE id = %s',(cid,))
    print('  ... with name: '+c.fetchone()[0])

elif table_name == 'relation':
    c.execute('SELECT relation_name FROM relation t WHERE id = %s',(cid,))
    print('  ... with name: '+c.fetchone()[0])

else:
    print("There's currently no support for entities from the table '{0}'".format(table_name))

c.close()
db_connection.close()
