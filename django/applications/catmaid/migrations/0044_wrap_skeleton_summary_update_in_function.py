# -*- coding: utf-8 -*-
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


forward = """
    CREATE FUNCTION refresh_skeleton_summary_table() RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        -- Remove all entries
        TRUNCATE catmaid_skeleton_summary;

        -- Cable length, nodes, creation info, edition info
        WITH node_data AS (
            SELECT creation.skeleton_id, creation.project_id,
                creation.user_id, creation.creation_time,edit.editor_id,
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
            last_edition_time, num_nodes, cable_length)
        (
            SELECT d.skeleton_id, d.project_id, now(), d.creation_time,
                d.edition_time, d.nodes, d.cable_length
            FROM node_data d
        );
    END;
    $$;
"""

backward = """
    DROP FUNCTION refresh_skeleton_summary_table();
"""

class Migration(migrations.Migration):
    """Wrap the functionality to recompute the skeleton summary table in a
    function..
    """

    dependencies = [
        ('catmaid', '0043_fix_summary_update_column_ambiguity'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
