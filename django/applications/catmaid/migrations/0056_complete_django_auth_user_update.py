# -*- coding: utf-8 -*-

from django.db import migrations

forward = """
    SELECT enable_history_tracking_for_table('auth_user'::regclass,
            get_history_table_name('auth_user'::regclass), FALSE);
    SELECT create_history_view_for_table('auth_user'::regclass);
"""

backward = """
    SELECT disable_history_tracking_for_table('auth_user'::regclass,
            get_history_table_name('auth_user'::regclass));
    SELECT drop_history_view_for_table('auth_user'::regclass);
"""


class Migration(migrations.Migration):
    """CATMAID keeps track of the history of most tables in the database,
    including some Django tables like auth_user. The upgrade to Django 2.0
    requires an update of the auth_user table. The history system has a view
    defined that uses this table and Postgres won't alter the type of a column
    in the auth_user table if a view is defined on it. To get around this, this
    migration will re-enable the history tracking for the auth_user table again,
    after the previous migration disabled it. Before this migration is applied,
    the auth_user migration hat to be applied as well.
    """

    dependencies = [
        ('catmaid', '0055_prepare_django_auth_user_update'),
        ('auth', '0009_alter_user_last_name_max_length'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]

