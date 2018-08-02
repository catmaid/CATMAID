# -*- coding: utf-8 -*-

from django.db import migrations

forward = """
    SELECT drop_history_view_for_table('auth_user'::regclass);
"""

backward = """
    SELECT create_history_view_for_table('auth_user'::regclass);
"""

class Migration(migrations.Migration):
    """ CATMAID's history system builds views on top of history tables and live
    tables. This prevents updates of the underlying tables. The auth_user table
    requires an update and therefore this migration removes the offending view
    before auth_user is changed and a second migration recreates it after
    auth_user is updated.
    """

    dependencies = [
        ('catmaid', '0019_add_import_permission')
    ]

    run_before = [
        ('auth', '0008_alter_user_username_max_length')
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
