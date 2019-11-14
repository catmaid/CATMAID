from django.db import migrations, models
import django.db.models.deletion


forward = """
    SELECT disable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_userprofile
    ADD COLUMN primary_group_id integer
    DEFAULT NULL;

    ALTER TABLE catmaid_userprofile__history
    ADD COLUMN primary_group_id integer;

    ALTER TABLE catmaid_userprofile
        ADD CONSTRAINT catmaid_userprofile_primary_group_id_fkey FOREIGN KEY
        (primary_group_id) REFERENCES auth_group(id);

    SELECT create_history_view_for_table('catmaid_userprofile'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_userprofile
    DROP COLUMN primary_group_id;

    ALTER TABLE catmaid_userprofile__history
    DROP COLUMN primary_group_id;

    SELECT create_history_view_for_table('catmaid_userprofile'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass), FALSE);
"""

class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0011_update_proxy_permissions'),
        ('catmaid', '0092_make_history_trigger_functions_consistent'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='userprofile',
                name='primary_group',
                field=models.ForeignKey(default=None, null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='auth.Group'),
            ),
        ]),
    ]
