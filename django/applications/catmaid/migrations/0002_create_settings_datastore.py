# -*- coding: utf-8 -*-

from django.db import migrations, models


def create_settings_datastore(apps, schema_editor):
    ClientDatastore = apps.get_model("catmaid", "ClientDatastore")
    ClientDatastore.objects.get_or_create(name="settings")


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_settings_datastore),
    ]
