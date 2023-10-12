import catmaid.fields
from django.conf import settings
import django.contrib.postgres.functions
from django.db import migrations, models
import django.db.models.deletion


forward = """
    SELECT disable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_userprofile
    ADD COLUMN show_painting_tool boolean
    DEFAULT False;

    ALTER TABLE catmaid_userprofile__history
    ADD COLUMN show_painting_tool boolean;

    SELECT create_history_view_for_table('catmaid_userprofile'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass), FALSE);
"""


backward = """
    SELECT disable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_userprofile
    DROP COLUMN show_painting_tool;

    ALTER TABLE catmaid_userprofile__history
    DROP COLUMN show_painting_tool;

    SELECT create_history_view_for_table('catmaid_userprofile'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass), FALSE);
"""


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0121_add_writable_stack_model'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='userprofile',
                name='show_painting_tool',
                field=models.BooleanField(default=False),
            ),
        ]),
    ]
