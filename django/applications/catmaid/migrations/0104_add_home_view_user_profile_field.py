from django.db import migrations, models
import django.db.models.deletion


forward = """
    SELECT disable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_userprofile
    ADD COLUMN home_view_id integer
    DEFAULT NULL;

    ALTER TABLE catmaid_userprofile__history
    ADD COLUMN home_view_id integer;

    ALTER TABLE catmaid_userprofile
        ADD CONSTRAINT catmaid_userprofile_home_view_id_fkey FOREIGN KEY
        (home_view_id) REFERENCES data_view(id) ON DELETE SET NULL;

    SELECT create_history_view_for_table('catmaid_userprofile'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass), FALSE);
"""

backward = """
    SELECT disable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass));
    SELECT drop_history_view_for_table('catmaid_userprofile'::regclass);

    ALTER TABLE catmaid_userprofile
    DROP COLUMN home_view_id;

    ALTER TABLE catmaid_userprofile__history
    DROP COLUMN home_view_id;

    SELECT create_history_view_for_table('catmaid_userprofile'::regclass);
    SELECT enable_history_tracking_for_table('catmaid_userprofile'::regclass,
            get_history_table_name('catmaid_userprofile'::regclass), FALSE);
"""


class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0011_update_proxy_permissions'),
        ('catmaid', '0103_add_project_wide_sumary_update_function'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='userprofile',
                name='home_view',
                field=models.ForeignKey(blank=True, default=None, null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.DataView'),
            ),
            migrations.AlterField(
                model_name='stackmirror',
                name='tile_source_type',
                field=models.IntegerField(choices=[(1, '1: File-based image stack'), (2, '2: Request query-based image stack'), (3, '3: HDF5 via CATMAID backend'), (4, '4: File-based image stack with zoom level directories'), (5, '5: Directory-based image stack'), (6, '6: DVID imageblk voxels'), (7, '7: Render service'), (8, '8: DVID imagetile tiles'), (9, '9: FlixServer tiles'), (10, '10: H2N5 tiles'), (11, '11: N5 volume'), (12, '12: Boss tiles'), (13, '13: CloudVolume tiles (back-end)')], default=1, help_text='This represents how the tile data is organized. See <a href="http://catmaid.org/page/tile_sources.html">tile source conventions documentation</a>.'),
            ),
        ]),
    ]
