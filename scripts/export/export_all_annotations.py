# -*- coding: utf-8 -*-

# Albert Cardona 2015-02-03
# This file is meant to be run from within ./manager.py shell in the environment, like:
# [1] load 'export_all_annotations.py'
# [2] project_id = 12
# [3] export(project_id, "all", "all")

from django.db import connection
from django.db import transaction
import gzip

@transaction.atomic
def export(project_id, skID_vs_annotID, annotID_vs_name):
    project_id = int(project_id)
    cursor = connection.cursor()

    cursor.execute('''
    select relation_name, id from relation where project_id = %s
    ''' % int(project_id))
    relations = dict(cursor.fetchall())

    # First CSV file: skeleton_id vs annotation_id
    with gzip.open(skID_vs_annotID + ".skID_vs_annotID." + str(project_id) + ".csv.gz", 'w') as file:
        # Header
        file.write('"skeleton ID", "annotation ID"\n')
        # Filter skeletons as having more than one treenode
        # Annotations: skeleton_id, annotation id
        cursor.execute('''
        select c1.class_instance_a,
               c2.class_instance_b
        from class_instance_class_instance c1,
             class_instance_class_instance c2
        where c1.class_instance_a in
          (select skeleton_id
           from treenode
           where project_id=%s
           group by skeleton_id
           having count(*) > 1)
          and c1.relation_id = %s
          and c1.class_instance_b = c2.class_instance_a
          and c2.relation_id = %s
        ''' % (int(project_id),
               relations["model_of"],
               relations["annotated_with"]))

        for row in cursor.fetchall():
            file.write("%s, %s\n" % row)

        # Neurons: skeleton_id, neuron id
        cursor.execute('''
        select c.class_instance_a,
               c.class_instance_b
        from class_instance_class_instance c
        where c.class_instance_a in
          (select skeleton_id
           from treenode
           where project_id=%s
           group by skeleton_id
           having count(*) > 1)
          and c.relation_id = %s
        ''' % (int(project_id),
               relations["model_of"]))

        for row in cursor.fetchall():
            file.write("%s, %s\n" % row)

    # Second CSV file: annotations (including neuron names)
    with gzip.open(annotID_vs_name + ".annotID_vs_name." + str(project_id) + ".csv.gz", 'w') as file:
        # Header
        file.write('"annotation ID", "text"\n')
        # Annotations: annotation id, name
        cursor.execute('''
        select ci.id, ci.name
        from class_instance ci,
             class_instance_class_instance c1,
             class_instance_class_instance c2
        where c1.class_instance_a in
          (select skeleton_id
           from treenode
           where project_id=%s
           group by skeleton_id
           having count(*) > 1)
          and c1.relation_id = %s
          and c1.class_instance_b = c2.class_instance_a
          and c2.relation_id = %s
          and c2.class_instance_b = ci.id
        ''' % (int(project_id),
               relations["model_of"],
               relations["annotated_with"]))
        #
        for row in cursor.fetchall():
            file.write('%s, "%s"\n' % (row[0], row[1].replace('"','\\"')))

        # Neurons: neuron id, name
        cursor.execute('''
        select ci.id, ci.name
        from class_instance ci,
             class_instance_class_instance c
        where c.class_instance_a in
          (select skeleton_id
           from treenode
           where project_id=%s
           group by skeleton_id
           having count(*) > 1)
          and c.relation_id = %s
          and c.class_instance_b = ci.id
        ''' % (int(project_id),
               relations["model_of"]))
        #
        for row in cursor.fetchall():
            # Escape quotes
            file.write('%s, "%s"\n' % (row[0], row[1].replace('"','\\"')))

