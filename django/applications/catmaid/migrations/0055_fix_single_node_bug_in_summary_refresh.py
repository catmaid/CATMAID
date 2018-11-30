# -*- coding: utf-8 -*-
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


forward = """
    CREATE OR REPLACE FUNCTION refresh_skeleton_summary_table() RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Remove all entries
        TRUNCATE catmaid_skeleton_summary;

        -- Cable length, nodes, creation info, edition info
        WITH node_data AS (
            SELECT creation.skeleton_id, creation.project_id,
                creation.user_id, creation.creation_time, edit.editor_id,
                edit.edition_time, counter.nodes, len.cable_length
            FROM
            (
              SELECT *, row_number() OVER(PARTITION BY skeleton_id ORDER BY edition_time DESC) AS rn
              FROM treenode
            ) edit
            JOIN
            (
              SELECT *, row_number() OVER(PARTITION BY skeleton_id ORDER BY creation_time ASC) AS rn
              FROM treenode
            ) creation
            ON edit.skeleton_id = creation.skeleton_id
            JOIN
            (
              SELECT skeleton_id, COUNT(*) AS nodes FROM treenode GROUP BY skeleton_id
            ) counter
            ON creation.skeleton_id = counter.skeleton_id
            JOIN
            (
              SELECT t1.skeleton_id, SUM(
                ST_3DLength(ST_MakeLine(ARRAY[
                    ST_MakePoint(t1.location_x, t1.location_y, t1.location_z),
                    ST_MakePoint(t2.location_x, t2.location_y, t2.location_z)
                ]::geometry[]))
              ) AS cable_length
              FROM treenode t1
              JOIN treenode t2
              ON t1.parent_id = t2.id OR (t1.parent_id IS NULL AND t1.id = t2.id)
              GROUP BY t1.skeleton_id
            ) len
            ON creation.skeleton_id = len.skeleton_id
            WHERE edit.rn = 1 AND creation.rn = 1
        )
        INSERT INTO catmaid_skeleton_summary (skeleton_id,
            project_id, last_summary_update, original_creation_time,
            last_edition_time, last_editor_id, num_nodes, cable_length)
        (
            SELECT d.skeleton_id, d.project_id, now(), d.creation_time,
                d.edition_time, d.editor_id, d.nodes, d.cable_length
            FROM node_data d
        );
    END;
    $$;
"""

backward = """
    CREATE OR REPLACE FUNCTION refresh_skeleton_summary_table() RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Remove all entries
        TRUNCATE catmaid_skeleton_summary;

        -- Cable length, nodes, creation info, edition info
        WITH node_data AS (
            SELECT creation.skeleton_id, creation.project_id,
                creation.user_id, creation.creation_time, edit.editor_id,
                edit.edition_time, counter.nodes, len.cable_length
            FROM
            (
              SELECT *, row_number() OVER(PARTITION BY skeleton_id ORDER BY edition_time DESC) AS rn
              FROM treenode
            ) edit
            JOIN
            (
              SELECT *, row_number() OVER(PARTITION BY skeleton_id ORDER BY creation_time ASC) AS rn
              FROM treenode
            ) creation
            ON edit.skeleton_id = creation.skeleton_id
            JOIN
            (
              SELECT skeleton_id, COUNT(*) AS nodes FROM treenode GROUP BY skeleton_id
            ) counter
            ON creation.skeleton_id = counter.skeleton_id
            JOIN
            (
              SELECT t1.skeleton_id, SUM(
                ST_3DLength(ST_MakeLine(ARRAY[
                    ST_MakePoint(t1.location_x, t1.location_y, t1.location_z),
                    ST_MakePoint(t2.location_x, t2.location_y, t2.location_z)
                ]::geometry[]))
              ) AS cable_length
              FROM treenode t1
              JOIN treenode t2
              ON t1.parent_id = t2.id
              GROUP BY t1.skeleton_id
            ) len
            ON creation.skeleton_id = len.skeleton_id
            WHERE edit.rn = 1 AND creation.rn = 1
        )
        INSERT INTO catmaid_skeleton_summary (skeleton_id,
            project_id, last_summary_update, original_creation_time,
            last_edition_time, last_editor_id, num_nodes, cable_length)
        (
            SELECT d.skeleton_id, d.project_id, now(), d.creation_time,
                d.edition_time, d.editor_id, d.nodes, d.cable_length
            FROM node_data d
        );
    END;
    $$;
"""

class Migration(migrations.Migration):
    """Updatae the skeleton summary table update function to include the last
    editor.
    """

    dependencies = [
        ('catmaid', '0054_update_skeleton_summary_refresh_function'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]


