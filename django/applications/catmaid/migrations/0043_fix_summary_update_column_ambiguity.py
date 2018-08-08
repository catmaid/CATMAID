# -*- coding: utf-8 -*-
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


forward = """
    CREATE OR REPLACE FUNCTION on_edit_treenode_connector_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

        IF OLD.treenode_id IS DISTINCT FROM NEW.treenode_id OR
           OLD.connector_id IS DISTINCT FROM NEW.connector_ID THEN

            UPDATE treenode_connector_edge tce
                SET
                    id = NEW.id,
                    edge = ST_MakeLine(
                        ST_MakePoint(t.location_x, t.location_y, t.location_z),
                        ST_MakePoint(c.location_x, c.location_y, c.location_z))
                FROM treenode t, connector c
                WHERE tce.id = OLD.id
                  AND t.id = NEW.treenode_id
                  AND c.id = NEW.connector_id;
        END IF;
        RETURN NEW;
    END;
    $$;
"""

backward = """
    CREATE OR REPLACE FUNCTION on_edit_treenode_connector_update_edges() RETURNS trigger
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
"""

class Migration(migrations.Migration):
    """Fix a problelm when treenode_connecotors are updated. This is mainly an
    issue when importing data and does rarely happen in regular tracing.
    """

    dependencies = [
        ('catmaid', '0042_fix_class_instance_class_instance_constraints'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
