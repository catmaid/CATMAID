from django.db import migrations


forward = """
  CREATE OR REPLACE FUNCTION refresh_skeleton_edges(skeleton_ids bigint[])
  RETURNS void
  LANGUAGE plpgsql
  AS $$ BEGIN
       INSERT INTO treenode_edge (id, project_id, edge)
       SELECT e.id, e.project_id, e.edge
       FROM (
           SELECT DISTINCT ON (t.id) t.id, t.project_id, ST_MakeLine(
                     ST_MakePoint(t.location_x, t.location_y, t.location_z),
                     ST_MakePoint(p.location_x, p.location_y, p.location_z))
           FROM treenode t
           JOIN UNNEST(skeleton_ids) query(skeleton_id)
               ON query.skeleton_id = t.skeleton_id
           JOIN treenode p
               ON p.id = t.parent_id OR (t.parent_id IS NULL AND t.id = p.id)
       ) e(id, project_id, edge)
       ON CONFLICT (id) DO UPDATE
       SET project_id = EXCLUDED.project_id,
           edge = EXCLUDED.edge;

  END;
  $$;
"""

backward = """
  DROP FUNCTION refresh_skeleton_edges(bigint[]);
"""

class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0076_fix_skeleton_summary_update_fn'),
    ]

    operations = [
      migrations.RunSQL(forward, backward),
    ]
