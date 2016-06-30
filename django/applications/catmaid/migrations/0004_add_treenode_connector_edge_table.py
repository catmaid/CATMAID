# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models


create_treenode_connector_edge_table_and_triggers = """

    CREATE TABLE treenode_connector_edge (
        project_id integer NOT NULL,
        treenode_id bigint,
        connector_id bigint NOT NULL,
        edge geometry(LineStringZ) NOT NULL,
        -- List project_id first in the tuple so it can be used as a partial
        -- index. UNIQUE rather than PRIMARY KEY because connector_id is
        -- nullable.
        UNIQUE (project_id, treenode_id, connector_id)
    );

    INSERT INTO treenode_connector_edge
        SELECT
            c.project_id,
            NULL,
            c.id,
            ST_MakeLine(
                ST_MakePoint(c.location_x, c.location_y, c.location_z),
                ST_MakePoint(c.location_x, c.location_y, c.location_z))
        FROM connector c;

    INSERT INTO treenode_connector_edge
        SELECT DISTINCT
            tc.project_id,
            tc.treenode_id,
            tc.connector_id,
            ST_MakeLine(
                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                ST_MakePoint(c.location_x, c.location_y, c.location_z))
        FROM treenode_connector tc, treenode t, connector c
        WHERE t.id = tc.treenode_id
          AND c.id = tc.connector_id;

    CREATE INDEX treenode_connector_edge_gix
      ON treenode_connector_edge
      USING gist
      (edge gist_geometry_ops_nd);

    CREATE FUNCTION on_delete_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
            cnt int;
        BEGIN

            cnt := COUNT(*) FROM treenode_connector
                   WHERE treenode_id = OLD.treenode_id
                     AND connector_id = OLD.connector_id
                     AND project_id = OLD.project_id;
            IF cnt = 1 THEN
                DELETE FROM treenode_connector_edge
                    WHERE treenode_id = OLD.treenode_id
                      AND connector_id = OLD.connector_id
                      AND project_id = OLD.project_id;
            END IF;
            RETURN OLD;
        END;
        $$;

    CREATE FUNCTION on_delete_connector_update_treenode_connector_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            DELETE FROM treenode_connector_edge
                WHERE connector_id = OLD.id
                  AND project_id = OLD.project_id;
            RETURN OLD;
        END;
        $$;

    CREATE FUNCTION on_edit_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
            cnt int;
        BEGIN

            IF OLD.treenode_id IS DISTINCT FROM NEW.treenode_id OR
               OLD.connector_id IS DISTINCT FROM NEW.connector_ID THEN

                cnt := COUNT(*) FROM treenode_connector
                       WHERE treenode_id = OLD.treenode_id
                         AND connector_id = OLD.connector_id
                         AND project_id = OLD.project_id;
                IF cnt = 1 THEN
                    UPDATE treenode_connector_edge
                        SET
                            treenode_id = NEW.treenode_id,
                            connector_id = NEW.connector_id,
                            project_id = NEW.project_id,
                            edge = ST_MakeLine(
                                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                                ST_MakePoint(c.location_x, c.location_y, c.location_z))
                        FROM treenode t, connector c
                        WHERE treenode_id = OLD.treenode_id
                          AND connector_id = OLD.connector_id
                          AND project_id = OLD.project_id
                          AND t.id = NEW.treenode_id
                          AND c.id = NEW.connector_id;
                ELSE
                    INSERT INTO treenode_connector_edge (
                            treenode_id,
                            connector_id,
                            project_id,
                            edge)
                        (SELECT
                            NEW.treenode_id,
                            NEW.connector_id,
                            NEW.project_id,
                            ST_MakeLine(
                                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                                ST_MakePoint(c.location_x, c.location_y, c.location_z))
                        FROM treenode t, connector c
                        WHERE t.id = NEW.treenode_id
                          AND c.id = NEW.connector_id);
                END IF;
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
                            tc.connector_id,
                            ST_MakeLine(
                                ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z),
                                ST_MakePoint(c.location_x, c.location_y, c.location_z))
                        FROM
                            treenode_connector tc,
                            connector c
                        WHERE tc.treenode_id = NEW.id
                          AND c.id = tc.connector_id) AS q(cid, edge)
                    WHERE treenode_id = NEW.id
                      AND connector_id = q.cid
                      AND project_id = NEW.project_id;
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
                            tc.treenode_id,
                            ST_MakeLine(
                                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                                ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z))
                        FROM treenode_connector tc, treenode t
                        WHERE tc.connector_id = NEW.id
                          AND t.id = tc.treenode_id

                        UNION

                        SELECT
                            NULL,
                            ST_MakeLine(
                                ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z),
                                ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z))
                        ) AS q(tnid, edge)
                    WHERE treenode_id IS NOT DISTINCT FROM q.tnid
                      AND connector_id = NEW.id
                      AND project_id = NEW.project_id;
            END IF;
            RETURN NEW;
        END;
        $$;

    CREATE FUNCTION on_insert_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            BEGIN
                INSERT INTO treenode_connector_edge (
                        treenode_id,
                        connector_id,
                        project_id,
                        edge)
                    (SELECT
                        NEW.treenode_id,
                        NEW.connector_id,
                        NEW.project_id,
                        ST_MakeLine(
                            ST_MakePoint(t.location_x, t.location_y, t.location_z),
                            ST_MakePoint(c.location_x, c.location_y, c.location_z))
                    FROM treenode t, connector c
                    WHERE t.id = NEW.treenode_id
                      AND c.id = NEW.connector_id);
            EXCEPTION WHEN unique_violation THEN
                -- ON CONFLICT DO NOTHING emulation.
            END;
            RETURN NEW;
        END;
        $$;

    CREATE FUNCTION on_insert_connector_update_treenode_connector_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            INSERT INTO treenode_connector_edge (
                    treenode_id,
                    connector_id,
                    project_id,
                    edge)
                (SELECT
                    NULL,
                    NEW.id,
                    NEW.project_id,
                    ST_MakeLine(
                        ST_MakePoint(c.location_x, c.location_y, c.location_z),
                        ST_MakePoint(c.location_x, c.location_y, c.location_z))
                FROM connector c
                WHERE c.id = NEW.id);
            RETURN NEW;
        END;
        $$;


    -- Triggers

    -- Deletion
    CREATE TRIGGER on_delete_treenode_connector_update_edges
        BEFORE DELETE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_update_edges();
    CREATE TRIGGER on_delete_connector_update_treenode_connector_edges
        BEFORE DELETE ON connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_connector_update_treenode_connector_edges();

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
    CREATE TRIGGER on_insert_connector_update_treenode_connector_edges
        AFTER INSERT ON connector
        FOR EACH ROW EXECUTE PROCEDURE on_insert_connector_update_treenode_connector_edges();
"""

remove_treenode_connector_edge_table_and_triggers = """
    -- Triggers

    -- Deletion
    DROP TRIGGER on_delete_treenode_connector_update_edges ON treenode_connector;
    DROP FUNCTION on_delete_treenode_connector_update_edges();
    DROP TRIGGER on_delete_connector_update_treenode_connector_edges ON connector;
    DROP FUNCTION on_delete_connector_update_treenode_connector_edges();

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
    DROP TRIGGER on_insert_connector_update_treenode_connector_edges ON connector;
    DROP FUNCTION on_insert_connector_update_treenode_connector_edges();

    DROP TABLE treenode_connector_edge;
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0003_remove_obsolete_pgsql_functions'),
    ]

    operations = [
        migrations.RunSQL(create_treenode_connector_edge_table_and_triggers,
                          remove_treenode_connector_edge_table_and_triggers),
    ]
