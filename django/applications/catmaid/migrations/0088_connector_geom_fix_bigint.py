from django.db import migrations, models
import django.contrib.gis.db.models.fields


forward = """
    BEGIN;

    ALTER TABLE connector_geom RENAME TO connector_geom_old;

    -- Create new version of the connector_geom table which uses the bigint
    -- data type for its ID. All other constraints will be added after the data
    -- is copied.
    CREATE TABLE connector_geom (
        id bigint NOT NULL,
        project_id integer NOT NULL,
        geom geometry(PointZ) NOT NULL
    );

    INSERT INTO connector_geom (id, project_id, geom)
    SELECT id, project_id, geom FROM connector_geom_old;

    DROP TABLE connector_geom_old;

    COMMIT;
"""


backward = """
    BEGIN;

    ALTER TABLE connector_geom RENAME TO connector_geom_old;

    -- Create old version of the connector_geom table, which uses the bigint
    -- data type for its ID. All other constraints will be added after the data
    -- is copied.
    CREATE TABLE connector_geom (
        id integer PRIMARY KEY NOT NULL,
        project_id integer NOT NULL,
        geom geometry(PointZ) NOT NULL
    );

    INSERT INTO connector_geom (id, project_id, geom)
    SELECT id, project_id, geom FROM connector_geom_old;

    DROP TABLE connector_geom_old;

    COMMIT;
"""

create_indices = """
    CREATE INDEX connector_geom_2d_gist ON connector_geom
        USING gist (geom);
    CREATE INDEX connector_geom_gix ON connector_geom
        USING gist (geom gist_geometry_ops_nd);
    CREATE INDEX connector_geom_project_index ON connector_geom
        USING btree (project_id);
    CREATE INDEX connector_geom_z_range_gist ON connector_geom
        USING gist (floatrange(st_zmin(geom::box3d), st_zmax(geom::box3d), '[]'::text));
"""

create_constraints = """
    ALTER TABLE connector_geom
        ADD CONSTRAINT connector_geom_id_fkey FOREIGN KEY (id)
        REFERENCES connector (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE connector_geom
        ADD CONSTRAINT connector_geom_project_id_fkey FOREIGN KEY (project_id)
        REFERENCES project (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
"""

db_maintenance = """
    VACUUM ANALYZE;
"""


class Migration(migrations.Migration):
    """This migration rewrites the table connector_geom. because its references
    to the connector table are wrong and need to be updated. Up to this
    migration the id column was of type int, but since it references the
    treenode_edge id column (and the connector id column), it should follow its
    type, which is bigint.  This is updated by this migration by creating a new
    table. This has the benefit that cleaning up the old table is easier and
    doesn't need a VACUUM FULL run.

    This is a new version of the already existing version of this migration.
    The existing version rewrote the table directly, which would only allow to
    reclaim space with VACCUUM FULL. Since this isn't very practical on large
    tables with many connectors, this new version is introduced. The schema
    outcome is the same and therefore no action has to be taken, if the
    previous version has been applied already.
    """

    dependencies = [
        ('catmaid', '0087_add_nblast_normalization_mode'),
    ]

    operations = [
        migrations.RunSQL(migrations.RunSQL.noop, db_maintenance),
        # Before, there were no constraints on this table
        migrations.RunSQL(migrations.RunSQL.noop, create_indices),

        migrations.RunSQL(forward, backward, [
            migrations.CreateModel(
                name='ConnectorGeom',
                fields=[
                    ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                    ('geom', django.contrib.gis.db.models.fields.GeometryField(srid=0)),
                    ('project', models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.Project')),
                ],
                options={
                    'db_table': 'connector_geom',
                },
            ),
        ]),

        migrations.RunSQL(create_constraints, migrations.RunSQL.noop),
        migrations.RunSQL(create_indices, migrations.RunSQL.noop),
        migrations.RunSQL(db_maintenance, migrations.RunSQL.noop),
    ]
