# -*- coding: utf-8 -*-

import django.core.validators
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0033_fix_node_query_cache_fkey'),
    ]

    operations = [
        migrations.AddField(
            model_name='nodequerycache',
            name='update_time',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.RunSQL('''
            CREATE INDEX nodequerycache_uptime_time_idx
            ON node_query_cache (update_time);

            ALTER TABLE node_query_cache
            ADD CONSTRAINT node_query_cache_project_orientation_depth_unique
            UNIQUE (project_id, orientation, depth);
        ''', '''
            DROP INDEX nodequerycache_uptime_time_idx;

            ALTER TABLE node_query_cache
            DROP CONSTRAINT node_query_cache_project_orientation_depth_unique;
        ''', [
            migrations.AlterUniqueTogether(
                name='nodequerycache',
                unique_together=set([('project', 'orientation', 'depth')]),
            )
        ])
    ]
