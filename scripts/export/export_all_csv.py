# -*- coding: utf-8 -*-

# Albert Cardona 2014-11-21
# This file is meant to be run from within ./manage.py shell in the environment, like:
# [1] load export_all_csv.py
# [2] project_id = 12
# [2] export(project_id, "all")

from django.db import connection
from django.db import transaction
import gzip

def writeOneSkeleton(file, cursor, skid):
    cursor.execute('''
    select id, parent_id, location_x, location_y, location_z
    from treenode
    where skeleton_id=%s
    ''' % skid)

    for row in cursor.fetchall():
        file.write("%s,%s,%s,%s,%s,%s\n" % ((skid,) + row))


@transaction.atomic
def export(project_id, filename):
    project_id = int(project_id)
    cursor = connection.cursor()

    # First CSV file: skeletons
    with gzip.open(filename +  "." + str(project_id) + ".skeletons.csv.gz", 'w') as file:
        # Header
        file.write('"skeleton ID", "treenode ID", "parent treenode ID", "x", "y", "z"\n')
        # Filter skeletons as having more than one treenode
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

    # Second CSV file: synapses
    with gzip.open(filename + "." + str(project_id) + ".synapses.csv.gz", 'w') as file:
        print("Writing synapses")
        # Header
        file.write('"synapse ID", "presynaptic treenode ID", "presynaptic skeleton ID", "postsynaptic treenode ID", "postsynaptic skeleton ID"\n')
        cursor.execute('''
        select relation_name, id from relation where project_id=%s
        ''' % project_id)
        relations = dict(cursor.fetchall())
        #
        cursor.execute('''
        select tc2.id, tc1.treenode_id, tc1.skeleton_id,
                       tc2.treenode_id, tc2.skeleton_id
        from treenode_connector tc1,
             treenode_connector tc2
        where tc1.project_id=%s
          and tc1.relation_id = %s
          and tc2.relation_id = %s
          and tc1.connector_id = tc2.connector_id
          and tc1.skeleton_id IN (select skeleton_id from treenode where project_id=%s group by skeleton_id having count(*) > 1)
        ''' % (project_id, relations['presynaptic_to'], relations['postsynaptic_to'], project_id))
        #
        for row in cursor.fetchall():
            file.write("%s,%s,%s,%s,%s\n" % row)



