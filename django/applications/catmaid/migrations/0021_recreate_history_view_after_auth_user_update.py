# -*- coding: utf-8 -*-

from django.db import migrations

forward = """
    SELECT create_history_view_for_table('auth_user'::regclass);
"""

backward = """
    SELECT drop_history_view_for_table('auth_user'::regclass);
"""

class Migration(migrations.Migration):
    """ CATMAID's history system builds views on top of history tables and live
    tables. This prevents updates of the underlying tables. The auth_user table
    requires an update and the previous migration removes the offending view
    before auth_user is changed and this migration recreates it after auth_user
    is updated.
    """

    dependencies = [
        ('auth', '0008_alter_user_username_max_length'),
        ('catmaid', '0020_delete_history_view_before_auth_user_update')
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
