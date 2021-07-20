from django.db import migrations, models

forward = """
    SELECT disable_history_tracking_for_table('catmaid_deep_link'::regclass,
            get_history_table_name('catmaid_deep_link'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_deep_link
    ADD COLUMN is_exportable boolean
    DEFAULT FALSE;

    ALTER TABLE catmaid_deep_link__history
    ADD COLUMN is_exportable boolean;

    SELECT create_history_view_for_table('catmaid_deep_link'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_deep_link'::regclass,
            get_history_table_name('catmaid_deep_link'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('catmaid_deep_link'::regclass,
            get_history_table_name('catmaid_deep_link'::regclass));
    SELECT drop_history_view_for_table('catmaid_deep_link'::regclass);

    ALTER TABLE catmaid_deep_link
    DROP COLUMN is_exportable;

    ALTER TABLE catmaid_deep_link__history
    DROP COLUMN is_exportable;

    SELECT create_history_view_for_table('catmaid_deep_link'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_deep_link'::regclass,
            get_history_table_name('catmaid_deep_link'::regclass), FALSE);
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0113_add_volume_origin_talble'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='deeplink',
                name='is_exportable',
                field=models.BooleanField(default=False),
            ),
        ]),
    ]
