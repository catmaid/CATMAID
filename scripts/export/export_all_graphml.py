# -*- coding: utf-8 -*-

# Albert Cardona 2014-11-20
# This file is meant to be run from within ./manage.py shell in the environment, like:
# [1] load export_all_graphml.py
# [2] project_id = 12
# [2] export(project_id, "all.graphml")
#
# Will generate a gzip'ed file like "all.graphml.gz"
#
# Includes all skeletons with more than 1 treenode;
# each skeleton is an undirected graph, where each treenode is a node
# (with the skeleton ID and the location as extra attributes)
# and each relationship between child and parent treenodes is an undirected edge
# that has the skeleton ID as an extra attribute.
# Each presynaptic+postsynaptic connection is a directed edge between treenodes;
# these directed edges also contain the skeleton ID of the pre- and the postsynaptic
# skeletons.

from django.db import connection
from django.db import transaction
import gzip
import sys

def writeOneSkeleton(file, cursor, skid):
    cursor.execute('''
    select id, parent_id, location_x, location_y, location_z
    from treenode
    where skeleton_id=%s
    ''' % skid)

    for row in cursor.fetchall():
        file.write('''<node id="n%s">
<data key="skid">%s</data>
<data key="x">%s</data>
<data key="y">%s</data>
<data key="z">%s</data>
</node>\n''' % (row[0], skid, row[2], row[3], row[4]))
        if row[1]:
            file.write('<edge id="e%s" directed="false" source="n%s" target="n%s" />\n' % (row[0], row[0], row[1]))

@transaction.atomic
def export(project_id, filename):
    project_id = int(project_id)
    cursor = connection.cursor()

    with gzip.open(filename + '.gz', 'w') as file:
        file.write('''<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
<key id="skid" for="node" attr.name="skeleton id" attr.type="long"/>
<key id="x" for="node" attr.name="x" attr.type="float"/>
<key id="y" for="node" attr.name="y" attr.type="float"/>
<key id="z" for="node" attr.name="z" attr.type="float"/>
<key id="pre_skid" for="edge" attr.name="presynaptic skeleton id" attr.type="long"/>
<key id="post_skid" for="edge" attr.name="postsynaptic skeleton id" attr.type="long"/>
<graph id="CNS">\n''')
        #
        cursor.execute('''
        select skeleton_id
        from treenode
        where project_id=%s
        group by skeleton_id
        having count(*) > 1
        ''' % project_id)
        #
        for row in cursor.fetchall():
            print("Writing skeleton nodes for %s" % row[0])
            writeOneSkeleton(file, cursor, row[0])
        #
        cursor.execute('''
        select relation_name, id from relation where project_id=%s
        ''' % project_id)
        relations = dict(cursor.fetchall())
        #
        cursor.execute('''
        select tc2.id, tc1.treenode_id, tc2.treenode_id,
                       tc1.skeleton_id, tc2.skeleton_id
        from treenode_connector tc1,
             treenode_connector tc2
        where tc1.project_id=%s
          and tc1.relation_id = %s
          and tc2.relation_id = %s
          and tc1.connector_id = tc2.connector_id
          and tc1.skeleton_id IN (select skeleton_id from treenode where project_id=%s group by skeleton_id having count(*) > 1)
        ''' % (project_id, relations['presynaptic_to'], relations['postsynaptic_to'], project_id))
        #
        print("Writing synapses")
        for row in cursor.fetchall():
            file.write('<edge id="e%s" directed="true" source="n%s" target="n%s">\n<data key="pre_skid">%s</data>\n<data key="post_skid">%s</data>\n</edge>\n' % row)
        #
        file.write("</graph>\n</graphml>")

def run():
    if sys.argv < 3:
        print("Need 2 arguments: <project id> <filename.gml>")
    else:
        project_id = int(sys.argv[1])
        filename = sys.argv[2]
        run(project_id, filename)

