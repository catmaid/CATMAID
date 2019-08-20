from django.db import migrations


forward = """
    -- Use UPPER() because Django's ORM tends to use that too for
    -- case-insensitive queries.
    CREATE INDEX class_instance_upper_name_idx ON class_instance (UPPER(name));
"""

backward = """
    DROP INDEX class_instance_upper_name_idx;
"""


class Migration(migrations.Migration):
    """Add a second index to the name column of the class_instance table. This
    is mainly useful for case sensitive and case insensitive name queries that
    are exact. A common case when searching for neurons.
    """

    dependencies = [
        ('catmaid', '0079_add_volume_area_volume_watertight_columns'),
    ]

    operations = [
            migrations.RunSQL(forward, backward),
    ]
