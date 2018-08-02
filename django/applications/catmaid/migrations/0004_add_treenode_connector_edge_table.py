# -*- coding: utf-8 -*-

from django.db import migrations, models


create_treenode_connector_edge_table_and_triggers = """

    -- Recreate this index since despite existing in 0001 it is not in some
    -- legacy databases.
    ALTER TABLE ONLY treenode_connector DROP CONSTRAINT IF EXISTS
      treenode_connector_pkey;
    ALTER TABLE ONLY treenode_connector ADD CONSTRAINT
      treenode_connector_pkey
      PRIMARY KEY (id);

    CREATE TABLE treenode_connector_edge (
        id integer PRIMARY KEY,
        project_id integer NOT NULL,
        edge geometry(LineStringZ) NOT NULL
    );

    CREATE TABLE connector_geom (
        id integer PRIMARY KEY,
        project_id integer NOT NULL,
        geom geometry(PointZ) NOT NULL
    );

    INSERT INTO treenode_connector_edge
        SELECT
            tc.id,
            tc.project_id,
            ST_MakeLine(
                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                ST_MakePoint(c.location_x, c.location_y, c.location_z))
        FROM treenode_connector tc, treenode t, connector c
        WHERE t.id = tc.treenode_id
          AND c.id = tc.connector_id;

    INSERT INTO connector_geom
        SELECT
            c.id,
            c.project_id,
            ST_MakePoint(c.location_x, c.location_y, c.location_z)
        FROM connector c;

    CREATE INDEX treenode_connector_edge_project_index
      ON treenode_connector_edge
      USING btree (project_id);

    CREATE INDEX treenode_connector_edge_gix
      ON treenode_connector_edge
      USING gist
      (edge gist_geometry_ops_nd);

    CREATE INDEX connector_geom_project_index
      ON connector_geom
      USING btree (project_id);

    CREATE INDEX connector_geom_gix
      ON connector_geom
      USING gist
      (geom gist_geometry_ops_nd);

    CREATE FUNCTION on_delete_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            DELETE FROM treenode_connector_edge
                WHERE id = OLD.id;
            RETURN OLD;
        END;
        $$;

    CREATE FUNCTION on_delete_connector_update_geom() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            DELETE FROM connector_geom
                WHERE id = OLD.id;
            RETURN OLD;
        END;
        $$;

    CREATE FUNCTION on_edit_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            IF OLD.treenode_id IS DISTINCT FROM NEW.treenode_id OR
               OLD.connector_id IS DISTINCT FROM NEW.connector_ID THEN

                UPDATE treenode_connector_edge
                    SET
                        id = NEW.id,
                        edge = ST_MakeLine(
                            ST_MakePoint(t.location_x, t.location_y, t.location_z),
                            ST_MakePoint(c.location_x, c.location_y, c.location_z))
                    FROM treenode t, connector c
                    WHERE id = OLD.id
                      AND t.id = NEW.treenode_id
                      AND c.id = NEW.connector_id;
            END IF;
            RETURN NEW;
        END;
        $$;

    CREATE FUNCTION on_edit_treenode_update_treenode_connector_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            IF OLD.location_x != NEW.location_x OR
               OLD.location_y != NEW.location_y OR
               OLD.location_z != NEW.location_z THEN
                UPDATE treenode_connector_edge
                    SET edge = q.edge
                    FROM (SELECT
                            tc.id,
                            ST_MakeLine(
                                ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z),
                                ST_MakePoint(c.location_x, c.location_y, c.location_z))
                        FROM
                            treenode_connector tc,
                            connector c
                        WHERE tc.treenode_id = NEW.id
                          AND c.id = tc.connector_id) AS q(tcid, edge)
                    WHERE id = q.tcid;
            END IF;
            RETURN NEW;
        END;
        $$;

    CREATE FUNCTION on_edit_connector_update_treenode_connector_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            IF OLD.location_x != NEW.location_x OR
               OLD.location_y != NEW.location_y OR
               OLD.location_z != NEW.location_z THEN
                UPDATE treenode_connector_edge
                    SET edge = q.edge
                    FROM (SELECT
                            tc.id,
                            ST_MakeLine(
                                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                                ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z))
                        FROM treenode_connector tc, treenode t
                        WHERE tc.connector_id = NEW.id
                          AND t.id = tc.treenode_id) AS q(tcid, edge)
                    WHERE id = q.tcid;

                UPDATE connector_geom
                    SET geom = ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z)
                    WHERE id = NEW.id;
            END IF;
            RETURN NEW;
        END;
        $$;

    CREATE FUNCTION on_insert_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            INSERT INTO treenode_connector_edge (
                    id,
                    project_id,
                    edge)
                (SELECT
                    NEW.id,
                    NEW.project_id,
                    ST_MakeLine(
                        ST_MakePoint(t.location_x, t.location_y, t.location_z),
                        ST_MakePoint(c.location_x, c.location_y, c.location_z))
                FROM treenode t, connector c
                WHERE t.id = NEW.treenode_id
                  AND c.id = NEW.connector_id);
            RETURN NEW;
        END;
        $$;

    CREATE FUNCTION on_insert_connector_update_connector_geom() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            INSERT INTO connector_geom (
                    id,
                    project_id,
                    geom)
                VALUES (
                    NEW.id,
                    NEW.project_id,
                    ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z));
            RETURN NEW;
        END;
        $$;


    -- Triggers
    CREATE TRIGGER on_delete_treenode_connector_update_edges
        BEFORE DELETE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_update_edges();
    CREATE TRIGGER on_delete_connector_update_geom
        BEFORE DELETE ON connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_connector_update_geom();

    -- Deletion

    -- Update
    CREATE TRIGGER on_edit_treenode_connector_update_edges
        AFTER UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_connector_update_edges();
    CREATE TRIGGER on_edit_treenode_update_treenode_connector_edges
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_treenode_connector_edges();
    CREATE TRIGGER on_edit_connector_update_treenode_connector_edges
        AFTER UPDATE ON connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit_connector_update_treenode_connector_edges();

    -- Insert
    CREATE TRIGGER on_insert_treenode_connector_update_edges
        AFTER INSERT ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_insert_treenode_connector_update_edges();
    CREATE TRIGGER on_insert_connector_update_connector_geom
        AFTER INSERT ON connector
        FOR EACH ROW EXECUTE PROCEDURE on_insert_connector_update_connector_geom();
"""

remove_treenode_connector_edge_table_and_triggers = """
    -- Triggers

    -- Deletion
    DROP TRIGGER on_delete_treenode_connector_update_edges ON treenode_connector;
    DROP FUNCTION on_delete_treenode_connector_update_edges();
    DROP TRIGGER on_delete_connector_update_geom ON connector;
    DROP FUNCTION on_delete_connector_update_geom();

    -- Update
    DROP TRIGGER on_edit_treenode_connector_update_edges ON treenode_connector;
    DROP FUNCTION on_edit_treenode_connector_update_edges();
    DROP TRIGGER on_edit_treenode_update_treenode_connector_edges ON treenode;
    DROP FUNCTION on_edit_treenode_update_treenode_connector_edges();
    DROP TRIGGER on_edit_connector_update_treenode_connector_edges ON connector;
    DROP FUNCTION on_edit_connector_update_treenode_connector_edges();

    -- Insert
    DROP TRIGGER on_insert_treenode_connector_update_edges ON treenode_connector;
    DROP FUNCTION on_insert_treenode_connector_update_edges();
    DROP TRIGGER on_insert_connector_update_connector_geom ON connector;
    DROP FUNCTION on_insert_connector_update_connector_geom();

    DROP TABLE connector_geom;
    DROP TABLE treenode_connector_edge;

    ALTER TABLE treenode_connector DROP CONSTRAINT treenode_connector_pkey;
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0003_remove_obsolete_pgsql_functions'),
    ]

    operations = [
        migrations.RunSQL(create_treenode_connector_edge_table_and_triggers,
                          remove_treenode_connector_edge_table_and_triggers),
    ]
