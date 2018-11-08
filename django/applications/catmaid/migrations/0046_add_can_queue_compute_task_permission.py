# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.conf import settings
import django.contrib.gis.db.models.fields
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0045_add_sampler_column_merge_limit'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='project',
            options={'managed': True, 'permissions': (
                ('can_administer', 'Can administer projects'),
                ('can_annotate', 'Can annotate projects'),
                ('can_browse', 'Can browse projects'),
                ('can_import', 'Can import into projects'),
                ('can_queue_compute_task', 'Can queue resource-intensive tasks'))},
        )
    ]
