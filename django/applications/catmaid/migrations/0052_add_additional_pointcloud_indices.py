# -*- coding: utf-8 -*-

from django.db import migrations

forward = """
    -- This index is needed to quickly get all points associated with a point cloud.
    CREATE INDEX pointcloud_point_pointcloud_id_idx ON pointcloud_point (pointcloud_id);
"""

backward = """
    DROP INDEX pointcloud_point_pointcloud_id_idx;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0050_create_volume_class_and_instances'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
