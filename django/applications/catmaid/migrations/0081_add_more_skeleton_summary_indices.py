from django.db import migrations


forward = """
    CREATE INDEX catmaid_skeleton_summary_cable_length_idx
        ON catmaid_skeleton_summary (cable_length);
    CREATE INDEX catmaid_skeleton_summary_num_nodes_idx
        ON catmaid_skeleton_summary (num_nodes);
"""

backward = """
    DROP INDEX catmaid_skeleton_summary_cable_length_idx;
    DROP INDEX catmaid_skeleton_summary_num_nodes_idx;
"""


class Migration(migrations.Migration):
    """Add a B-Tree index to the cable_length field and num_nodes field..
    """

    dependencies = [
        ('catmaid', '0080_add_class_instance_name_index'),
    ]

    operations = [
            migrations.RunSQL(forward, backward)
    ]
