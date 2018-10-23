# -*- coding: utf-8 -*-
from django.db import migrations, models

forward_history = """
    SELECT disable_history_tracking_for_table('nblast_similarity'::regclass,
            get_history_table_name('nblast_similarity'::regclass));

    ALTER TABLE nblast_similarity
    ADD COLUMN normalized text;

    UPDATE nblast_similarity
    SET normalized = 'raw';

    ALTER TABLE nblast_similarity ALTER COLUMN normalized SET NOT NULL;
    ALTER TABLE nblast_similarity ALTER COLUMN normalized SET DEFAULT 'raw';
    ALTER TABLE nblast_similarity ADD CONSTRAINT check_valid_normalization
        CHECK (normalized IN ('raw', 'normalized', 'mean'));

    ALTER TABLE nblast_similarity
    ADD COLUMN use_alpha boolean;

    UPDATE nblast_similarity
    SET use_alpha = FALSE;

    ALTER TABLE nblast_similarity ALTER COLUMN use_alpha SET NOT NULL;
    ALTER TABLE nblast_similarity ALTER COLUMN use_alpha SET DEFAULT FALSE;

    -- Update history table
    ALTER TABLE nblast_similarity__history
    ADD COLUMN normalized text;

    UPDATE nblast_similarity__history
    SET normalized = 'raw';

    ALTER TABLE nblast_similarity__history
    ADD COLUMN use_alpha boolean;

    UPDATE nblast_similarity__history
    SET use_alpha = FALSE;

    SELECT enable_history_tracking_for_table('nblast_similarity'::regclass,
            get_history_table_name('nblast_similarity'::regclass), FALSE);
"""

backward_history = """
    SELECT disable_history_tracking_for_table('nblast_similarity'::regclass,
            get_history_table_name('nblast_similarity'::regclass));

    ALTER TABLE nblast_similarity
    DROP COLUMN normalized;
    ALTER TABLE nblast_similarity
    DROP COLUMN use_alpha;
    ALTER TABLE nblast_similarity__history
    DROP COLUMN normalized;
    ALTER TABLE nblast_similarity__history
    DROP COLUMN use_alpha;

    SELECT enable_history_tracking_for_table('nblast_similarity'::regclass,
            get_history_table_name('nblast_similarity'::regclass), FALSE);
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0050_create_volume_class_and_instances'),
    ]

    operations = [
        migrations.RunSQL(
            forward_history,
            backward_history,
            [
                migrations.AddField(
                    model_name='nblastsimilarity',
                    name='normalized',
                    field=models.TextField(default='raw')),
                migrations.AddField(
                    model_name='nblastsimilarity',
                    name='use_alpha',
                    field=models.BooleanField(default=False)),
            ],
        ),
    ]
