# -*- coding: utf-8 -*-

import django.core.validators
from django.db import migrations, models

forward_history = """
    SELECT disable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass));


    -- Update table columns, add leaf_segment_handling column
    ALTER TABLE catmaid_sampler
    ADD COLUMN leaf_segment_handling text;

    UPDATE catmaid_sampler
    SET leaf_segment_handling = 'ignore';

    ALTER TABLE catmaid_sampler
    ALTER COLUMN leaf_segment_handling SET NOT NULL;

    -- Update history table
    ALTER TABLE catmaid_sampler__history
    ADD COLUMN leaf_segment_handling text;

    UPDATE catmaid_sampler__history
    SET leaf_segment_handling = 'ignore';


    SELECT enable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass), FALSE);
"""

backward_history = """
    SELECT disable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass));

    ALTER TABLE catmaid_sampler
    DROP COLUMN leaf_segment_handling;
    ALTER TABLE catmaid_sampler__history
    DROP COLUMN leaf_segment_handling;

    SELECT enable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass), FALSE);
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0040_add_skeleton_summary_update_function'),
    ]

    operations = [
        migrations.RunSQL(
            forward_history,
            backward_history,
            [
                migrations.AddField(
                    model_name='sampler',
                    name='leaf_segment_handling',
                    field=models.TextField(default="ignore")),
            ],
        ),
    ]
