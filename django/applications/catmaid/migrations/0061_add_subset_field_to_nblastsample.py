# Generated by Django 2.1.5 on 2019-01-30 03:17

import django.contrib.postgres.fields
from django.db import migrations, models


forward = """
    SELECT disable_history_tracking_for_table('nblast_sample'::regclass,
            get_history_table_name('nblast_sample'::regclass));
    SELECT drop_history_view_for_table('nblast_sample'::regclass);

    ALTER TABLE nblast_sample
    ADD COLUMN subset jsonb;

    ALTER TABLE nblast_sample__history
    ADD COLUMN subset jsonb;

    SELECT create_history_view_for_table('nblast_sample'::regclass);
    SELECT enable_history_tracking_for_table('nblast_sample'::regclass,
            get_history_table_name('nblast_sample'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('nblast_sample'::regclass,
            get_history_table_name('nblast_sample'::regclass));
    SELECT drop_history_view_for_table('nblast_sample'::regclass);

    ALTER TABLE nblast_sample
    DROP COLUMN subset;

    ALTER TABLE nblast_sample__history
    DROP COLUMN subset;

    SELECT create_history_view_for_table('nblast_sample'::regclass);
    SELECT enable_history_tracking_for_table('nblast_sample'::regclass,
            get_history_table_name('nblast_sample'::regclass), FALSE);
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0060_remove_segmentation_tool'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='nblastsample',
                name='subset',
                field=django.contrib.postgres.fields.JSONField(null=True, blank=True),
            ),
        ]),
    ]
