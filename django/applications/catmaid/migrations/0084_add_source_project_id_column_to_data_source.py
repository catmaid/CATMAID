from django.db import migrations, models


forward = """
    SELECT disable_history_tracking_for_table('data_source'::regclass,
            get_history_table_name('data_source'::regclass));
    SELECT drop_history_view_for_table('data_source'::regclass);

    ALTER TABLE data_source
    ADD COLUMN source_project_id integer;

    ALTER TABLE data_source__history
    ADD COLUMN source_project_id integer;

    -- This is an arbitrary default value for existing rows. The migration this
    -- changes isn't yet in use anywhere and we can basically assume this table
    -- empty.
    UPDATE data_source SET source_project_id = id;
    UPDATE data_source__history SET source_project_id = id;

    ALTER TABLE data_source
    DROP CONSTRAINT data_source_project_id_url_key;

    ALTER TABLE data_source
    ADD CONSTRAINT data_source_project_id_url_source_project_id_key
    UNIQUE (project_id, url, source_project_id);

    ALTER TABLE data_source
    ALTER COLUMN source_project_id
    SET NOT NULL;

    SELECT create_history_view_for_table('data_source'::regclass);
    SELECT enable_history_tracking_for_table('data_source'::regclass,
            get_history_table_name('data_source'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('data_source'::regclass,
            get_history_table_name('data_source'::regclass));
    SELECT drop_history_view_for_table('data_source'::regclass);

    ALTER TABLE data_source
    DROP CONSTRAINT data_source_project_id_url_source_project_id_key;

    ALTER TABLE data_source
    ADD CONSTRAINT data_source_project_id_url_key
    UNIQUE (project_id, url);

    ALTER TABLE data_source
    DROP COLUMN source_project_id;

    ALTER TABLE data_source__history
    DROP COLUMN source_project_id;

    SELECT create_history_view_for_table('data_source'::regclass);
    SELECT enable_history_tracking_for_table('data_source'::regclass,
            get_history_table_name('data_source'::regclass), FALSE);
"""


class Migration(migrations.Migration):
    """Add a new column to the data_source table.
    """

    dependencies = [
        ('catmaid', '0083_add_datasource_and_skeletonorigin_tables'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='datasource',
                name='source_project_id',
                field=models.IntegerField(default=1),
                preserve_default=False,
            ),
        ]),
    ]
