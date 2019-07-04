from django.db import migrations, models
import django.contrib.gis.db.models.fields


forward = """
    BEGIN;

    ALTER TABLE treenode_connector_edge RENAME TO treenode_connector_edge_old;

    -- Create new version of the treenode_connector_edge table, which uses the
    -- bigint data type for its ID. All other constraints will be added after
    -- the data is copied.
    CREATE TABLE treenode_connector_edge (
        id  bigint PRIMARY KEY NOT NULL,
        project_id integer NOT NULL,
        edge geometry(LinestringZ) NOT NULL
    );

    INSERT INTO treenode_connector_edge (id, project_id, edge)
    SELECT id, project_id, edge FROM treenode_connector_edge_old;

    DROP TABLE treenode_connector_edge_old;

    COMMIT;
"""


backward = """
    BEGIN;

    ALTER TABLE treenode_connector_edge RENAME TO treenode_connector_edge_old;

    -- Create old version of the treenode_connector_edge table which uses the
    -- bigint data type for its ID. All other constraints will be added after
    -- the data is copied.
    CREATE TABLE treenode_connector_edge (
        id  integer PRIMARY KEY NOT NULL,
        project_id integer NOT NULL,
        edge geometry(LinestringZ) NOT NULL
    );

    INSERT INTO treenode_connector_edge (id, project_id, edge)
    SELECT id, project_id, edge FROM treenode_connector_edge_old;

    DROP TABLE treenode_connector_edge_old;

    COMMIT;
"""

create_indices = """
    CREATE INDEX treenode_connector_edge_2d_gist ON treenode_connector_edge
        USING gist (edge);
    CREATE INDEX treenode_connector_edge_gix ON treenode_connector_edge
        USING gist (edge gist_geometry_ops_nd);
    CREATE INDEX treenode_connector_edge_project_index ON treenode_connector_edge
        USING btree (project_id);
    CREATE INDEX treenode_connector_edge_z_range_gist ON treenode_connector_edge
        USING gist (floatrange(st_zmin(edge::box3d), st_zmax(edge::box3d), '[]'::text));
"""

create_constraints = """
    ALTER TABLE treenode_connector_edge
        ADD CONSTRAINT treenode_connector_edge_id_fkey FOREIGN KEY (id)
        REFERENCES treenode_connector_edge (id) ON DELETE CASCADE DEFERRABLE
        INITIALLY DEFERRED;
    ALTER TABLE treenode_connector_edge
        ADD CONSTRAINT treenode_connector_edge_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES project (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
"""

db_maintenance = """
    VACUUM ANALYZE;
"""


class Migration(migrations.Migration):
    """This migration rewrites the table treenode_connector_edge, because their
    references to the tables treenode_connector and connector are wrong and
    need to be updated. Up to this migration the id column was of type int, but
    since it references the treenode_edge id column , it should follow its
    type, which is bigint.  This is updated by this migration by creating a new
    table. This has the benefit that cleaning up the old table is easier and
    doesn't need a VACUUM FULL run.
    """

    dependencies = [
        ('catmaid', '0088_connector_geom_fix_bigint'),
    ]

    operations = [
        migrations.RunSQL(migrations.RunSQL.noop, db_maintenance),
        migrations.RunSQL(migrations.RunSQL.noop, create_indices),
        migrations.RunSQL(forward, backward, [
            migrations.CreateModel(
                name='TreenodeConnectorEdge',
                fields=[
                    ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('edge', django.contrib.gis.db.models.fields.GeometryField(srid=0)),
                    ('project', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.Project')),
                ],
                options={
                    'db_table': 'treenode_connector_edge',
                },
        ),
        ]),
        migrations.RunSQL(create_constraints, migrations.RunSQL.noop),
        migrations.RunSQL(create_indices, migrations.RunSQL.noop),
        migrations.RunSQL(db_maintenance, migrations.RunSQL.noop),
    ]
