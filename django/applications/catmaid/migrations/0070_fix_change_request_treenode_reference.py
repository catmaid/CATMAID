from django.db import migrations

forward = """
    SELECT disable_history_tracking_for_table('change_request'::regclass,
            get_history_table_name('change_request'::regclass));
    SELECT drop_history_view_for_table('change_request'::regclass);

    ALTER TABLE change_request ALTER COLUMN treenode_id TYPE bigint;
    ALTER TABLE change_request ALTER COLUMN connector_id TYPE bigint;

    ALTER TABLE change_request__history ALTER COLUMN treenode_id TYPE bigint;
    ALTER TABLE change_request__history ALTER COLUMN connector_id TYPE bigint;

    SELECT create_history_view_for_table('change_request'::regclass);
    SELECT enable_history_tracking_for_table('change_request'::regclass,
            get_history_table_name('change_request'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('change_request'::regclass,
            get_history_table_name('change_request'::regclass));
    SELECT drop_history_view_for_table('change_request'::regclass);

    ALTER TABLE change_request ALTER COLUMN treenode_id TYPE integer;
    ALTER TABLE change_request ALTER COLUMN connector_id TYPE integer;

    ALTER TABLE change_request__history ALTER COLUMN treenode_id TYPE integer;
    ALTER TABLE change_request__history ALTER COLUMN connector_id TYPE integer;

    SELECT create_history_view_for_table('change_request'::regclass);
    SELECT enable_history_tracking_for_table('change_request'::regclass,
            get_history_table_name('change_request'::regclass), FALSE);
"""


class Migration(migrations.Migration):
    """The type of the referenced table columns is bigint, but the type used for
    the actual column in the change_request table is integer. This migration
    updates thie change_request types to bigint.
    """

    dependencies = [
        ('catmaid', '0069_fix_on_edit_treenode_connector_update_edges'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
