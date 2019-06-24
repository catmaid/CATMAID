from django.db import migrations


forward = """
    SELECT disable_history_tracking_for_table('catmaid_samplerdomain'::regclass,
            get_history_table_name('catmaid_samplerdomain'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerdomain'::regclass);

    ALTER TABLE catmaid_samplerdomain ALTER COLUMN start_node_id TYPE bigint;

    ALTER TABLE catmaid_samplerdomain__history ALTER COLUMN start_node_id TYPE bigint;

    SELECT create_history_view_for_table('catmaid_samplerdomain'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerdomain'::regclass,
            get_history_table_name('catmaid_samplerdomain'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('catmaid_samplerdomainend'::regclass,
            get_history_table_name('catmaid_samplerdomainend'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerdomainend'::regclass);

    ALTER TABLE catmaid_samplerdomainend ALTER COLUMN end_node_id TYPE bigint;

    ALTER TABLE catmaid_samplerdomainend__history ALTER COLUMN end_node_id TYPE bigint;

    SELECT create_history_view_for_table('catmaid_samplerdomainend'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerdomainend'::regclass,
            get_history_table_name('catmaid_samplerdomainend'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('catmaid_samplerinterval'::regclass,
            get_history_table_name('catmaid_samplerinterval'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerinterval'::regclass);

    ALTER TABLE catmaid_samplerinterval ALTER COLUMN start_node_id TYPE bigint;
    ALTER TABLE catmaid_samplerinterval ALTER COLUMN end_node_id TYPE bigint;

    ALTER TABLE catmaid_samplerinterval__history ALTER COLUMN start_node_id TYPE bigint;
    ALTER TABLE catmaid_samplerinterval__history ALTER COLUMN end_node_id TYPE bigint;

    SELECT create_history_view_for_table('catmaid_samplerinterval'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerinterval'::regclass,
            get_history_table_name('catmaid_samplerinterval'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('suppressed_virtual_treenode'::regclass,
            get_history_table_name('suppressed_virtual_treenode'::regclass));
    SELECT drop_history_view_for_table('suppressed_virtual_treenode'::regclass);

    ALTER TABLE suppressed_virtual_treenode ALTER COLUMN child_id TYPE bigint;

    ALTER TABLE suppressed_virtual_treenode__history ALTER COLUMN child_id TYPE bigint;

    SELECT create_history_view_for_table('suppressed_virtual_treenode'::regclass);
    SELECT enable_history_tracking_for_table('suppressed_virtual_treenode'::regclass,
            get_history_table_name('suppressed_virtual_treenode'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('catmaid_samplerconnector'::regclass,
            get_history_table_name('catmaid_samplerconnector'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerconnector'::regclass);

    ALTER TABLE catmaid_samplerconnector ALTER COLUMN connector_id TYPE bigint;

    ALTER TABLE catmaid_samplerconnector__history ALTER COLUMN connector_id TYPE bigint;

    SELECT create_history_view_for_table('catmaid_samplerconnector'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerconnector'::regclass,
            get_history_table_name('catmaid_samplerconnector'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('catmaid_samplerdomain'::regclass,
            get_history_table_name('catmaid_samplerdomain'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerdomain'::regclass);

    ALTER TABLE catmaid_samplerdomain ALTER COLUMN start_node_id TYPE integer;

    ALTER TABLE catmaid_samplerdomain__history ALTER COLUMN start_node_id TYPE integer;

    SELECT create_history_view_for_table('catmaid_samplerdomain'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerdomain'::regclass,
            get_history_table_name('catmaid_samplerdomain'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('catmaid_samplerdomainend'::regclass,
            get_history_table_name('catmaid_samplerdomainend'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerdomainend'::regclass);

    ALTER TABLE catmaid_samplerdomainend ALTER COLUMN end_node_id TYPE integer;

    ALTER TABLE catmaid_samplerdomainend__history ALTER COLUMN end_node_id TYPE integer;

    SELECT create_history_view_for_table('catmaid_samplerdomainend'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerdomainend'::regclass,
            get_history_table_name('catmaid_samplerdomainend'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('catmaid_samplerinterval'::regclass,
            get_history_table_name('catmaid_samplerinterval'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerinterval'::regclass);

    ALTER TABLE catmaid_samplerinterval ALTER COLUMN start_node_id TYPE integer;
    ALTER TABLE catmaid_samplerinterval ALTER COLUMN end_node_id TYPE integer;

    ALTER TABLE catmaid_samplerinterval__history ALTER COLUMN start_node_id TYPE integer;
    ALTER TABLE catmaid_samplerinterval__history ALTER COLUMN end_node_id TYPE integer;

    SELECT create_history_view_for_table('catmaid_samplerinterval'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerinterval'::regclass,
            get_history_table_name('catmaid_samplerinterval'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('suppressed_virtual_treenode'::regclass,
            get_history_table_name('suppressed_virtual_treenode'::regclass));
    SELECT drop_history_view_for_table('suppressed_virtual_treenode'::regclass);

    ALTER TABLE suppressed_virtual_treenode ALTER COLUMN child_id TYPE integer;

    ALTER TABLE suppressed_virtual_treenode__history ALTER COLUMN child_id TYPE integer;

    SELECT create_history_view_for_table('suppressed_virtual_treenode'::regclass);
    SELECT enable_history_tracking_for_table('suppressed_virtual_treenode'::regclass,
            get_history_table_name('suppressed_virtual_treenode'::regclass), FALSE);


    SELECT disable_history_tracking_for_table('catmaid_samplerconnector'::regclass,
            get_history_table_name('catmaid_samplerconnector'::regclass));
    SELECT drop_history_view_for_table('catmaid_samplerconnector'::regclass);

    ALTER TABLE catmaid_samplerconnector ALTER COLUMN connector_id TYPE integer;

    ALTER TABLE catmaid_samplerconnector__history ALTER COLUMN connector_id TYPE integer;

    SELECT create_history_view_for_table('catmaid_samplerconnector'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_samplerconnector'::regclass,
            get_history_table_name('catmaid_samplerconnector'::regclass), FALSE);
"""


class Migration(migrations.Migration):
    """It turns out a few references to the treenode and connecto tables where
    using the wrong datatype. This migration replaces the current integer
    references with bigint references.
    """

    dependencies = [
        ('catmaid', '0070_fix_change_request_treenode_reference'),
    ]

    operations = [
            migrations.RunSQL(forward, backward)
    ]
