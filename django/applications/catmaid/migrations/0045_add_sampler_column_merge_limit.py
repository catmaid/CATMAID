# -*- coding: utf-8 -*-
import django.core.validators
from django.db import migrations, models

forward_history = """
    SELECT disable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass));


    -- Update table columns, add leaf_segment_handling column
    ALTER TABLE catmaid_sampler
    ADD COLUMN merge_limit real;

    UPDATE catmaid_sampler
    SET merge_limit = 0;

    ALTER TABLE catmaid_sampler ALTER COLUMN merge_limit SET NOT NULL;
    ALTER TABLE catmaid_sampler ALTER COLUMN merge_limit SET DEFAULT 0;

    -- Update history table
    ALTER TABLE catmaid_sampler__history
    ADD COLUMN merge_limit real;

    UPDATE catmaid_sampler__history
    SET merge_limit = 0;


    SELECT enable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass), FALSE);
"""

backward_history = """
    SELECT disable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass));

    ALTER TABLE catmaid_sampler
    DROP COLUMN merge_limit;
    ALTER TABLE catmaid_sampler__history
    DROP COLUMN merge_limit;

    SELECT enable_history_tracking_for_table('catmaid_sampler'::regclass,
            get_history_table_name('catmaid_sampler'::regclass), FALSE);
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0044_wrap_skeleton_summary_update_in_function'),
    ]

    operations = [
        migrations.RunSQL(
            forward_history,
            backward_history,
            [
                migrations.AddField(
                    model_name='sampler',
                    name='merge_limit',
                    field=models.FloatField(default=0)),
            ],
        ),
    ]
