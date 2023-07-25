# Generated by Django 3.2.18 on 2023-07-25 15:10

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0119_exportuser_reducedinfouser'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='project',
            options={'managed': True, 'permissions': (('can_administer', 'Can administer projects'), ('can_annotate', 'Can annotate projects'), ('can_browse', 'Can browse projects'), ('can_import', 'Can import into projects'), ('can_queue_compute_task', 'Can queue resource-intensive tasks'), ('can_annotate_with_token', 'Can annotate project using API token'), ('can_fork', 'Can create personal copies of projects (only stacks)'), ('can_create_deep_links', 'Can create deep links without Annotate'))},
        ),
    ]
