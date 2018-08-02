# -*- coding: utf-8 -*-

from django.conf import settings
from django.db import migrations

from catmaid.apps import get_system_user

def forwards(apps, schema_editor):
    """Make sure all required class and relations are existing for all
    projects.  We can't use the regular model classes, but have to get
    them through the migration system.
    """
    from catmaid.control.project import validate_project_setup

    Class = apps.get_model('catmaid', 'Class')
    Project = apps.get_model('catmaid', 'Project')
    Relation = apps.get_model('catmaid', 'Relation')
    User = apps.get_model('auth', 'User')
    ClientDatastore = apps.get_model('catmaid', 'ClientDatastore')

    projects = Project.objects.all()
    # If there are no projects, don't continue, because there is nothing to
    # migrate.
    if 0 == len(projects) or 0 == User.objects.count():
        return

    system_user = get_system_user(User)
    for p in projects:
        validate_project_setup(p.id, system_user.id, True, Class, Relation, ClientDatastore)


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0008_update_transaction_log'),
    ]

    operations = [
            migrations.RunPython(forwards, migrations.RunPython.noop)
    ]
