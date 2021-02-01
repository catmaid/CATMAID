import catmaid.fields
from django.conf import settings
import django.contrib.postgres.fields
import django.contrib.postgres.fields.jsonb
import django.contrib.postgres.functions
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    """The actual database side was already part of its own migration, this bit
    represents only an update of the Django perspective, which was not done
    before.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0105_add_deep_link_model'),
    ]

    operations = [
        migrations.RunSQL(migrations.RunSQL.noop, migrations.RunSQL.noop, [
            migrations.AlterField(
                model_name='stackmirror',
                name='tile_source_type',
                field=models.IntegerField(choices=[(1, '1: File-based image stack'), (2, '2: Request query-based image stack'), (3, '3: HDF5 via CATMAID backend'), (4, '4: File-based image stack with zoom level directories'), (5, '5: Directory-based image stack'), (6, '6: DVID imageblk voxels'), (7, '7: Render service'), (8, '8: DVID imagetile tiles'), (9, '9: FlixServer tiles'), (10, '10: H2N5 tiles'), (11, '11: N5 volume'), (12, '12: Boss tiles'), (13, '13: CloudVolume tiles (back-end)'), (14, '14: Neuroglancer precomputed')], default=1, help_text='This represents how the tile data is organized. See <a href="http://catmaid.org/page/tile_sources.html">tile source conventions documentation</a>.'),
            ),
        ]),
    ]
