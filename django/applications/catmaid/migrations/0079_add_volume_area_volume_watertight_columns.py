from django.db import migrations, models
from catmaid.control.volume import update_volume_meta_information


forward = """
    SELECT disable_history_tracking_for_table('catmaid_volume'::regclass,
            get_history_table_name('catmaid_volume'::regclass));
    SELECT drop_history_view_for_table('catmaid_volume'::regclass);

    ALTER TABLE catmaid_volume
    ADD COLUMN area real;

    ALTER TABLE catmaid_volume__history
    ADD COLUMN area real;

    ALTER TABLE catmaid_volume
    ADD COLUMN volume real;

    ALTER TABLE catmaid_volume__history
    ADD COLUMN volume real;

    ALTER TABLE catmaid_volume
    ADD COLUMN watertight bool;

    ALTER TABLE catmaid_volume__history
    ADD COLUMN watertight bool;

    ALTER TABLE catmaid_volume
    ADD COLUMN meta_computed bool DEFAULT FALSE NOT NULL;

    ALTER TABLE catmaid_volume__history
    ADD COLUMN meta_computed bool;

    SELECT create_history_view_for_table('catmaid_volume'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_volume'::regclass,
            get_history_table_name('catmaid_volume'::regclass), FALSE);
"""


backward = """
    SELECT disable_history_tracking_for_table('catmaid_volume'::regclass,
            get_history_table_name('catmaid_volume'::regclass));
    SELECT drop_history_view_for_table('catmaid_volume'::regclass);

    ALTER TABLE catmaid_volume
    DROP COLUMN area;

    ALTER TABLE catmaid_volume__history
    DROP COLUMN area;

    ALTER TABLE catmaid_volume
    DROP COLUMN volume;

    ALTER TABLE catmaid_volume__history
    DROP COLUMN volume;

    ALTER TABLE catmaid_volume
    DROP COLUMN watertight;

    ALTER TABLE catmaid_volume__history
    DROP COLUMN watertight;

    ALTER TABLE catmaid_volume
    DROP COLUMN meta_computed;

    ALTER TABLE catmaid_volume__history
    DROP COLUMN meta_computed;

    SELECT create_history_view_for_table('catmaid_volume'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_volume'::regclass,
            get_history_table_name('catmaid_volume'::regclass), FALSE);
"""


def init_volume_meta_data(apps, schema_editor):
    """Update all meta information all volumes in every project.
    """
    Project = apps.get_model('catmaid', 'Project')
    for p in Project.objects.all():
        update_volume_meta_information(p.id)


class Migration(migrations.Migration):
    """Add three four new columns to the catmaid_volume table and its history
    tables.
    """

    dependencies = [
        ('catmaid', '0078_add_order_column_to_node_grid_cache'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='volume',
                name='area',
                field=models.FloatField(blank=True, null=True),
            ),
            migrations.AddField(
                model_name='volume',
                name='volume',
                field=models.FloatField(blank=True, null=True),
            ),
            migrations.AddField(
                model_name='volume',
                name='watertight',
                field=models.BooleanField(blank=True, null=True),
            ),
            migrations.AddField(
                model_name='volume',
                name='meta_computed',
                field=models.BooleanField(default=True),
            ),
        ]),
        migrations.RunPython(init_volume_meta_data, migrations.RunPython.noop),
    ]
