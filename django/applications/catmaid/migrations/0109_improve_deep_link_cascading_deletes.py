import catmaid.fields
import datetime
from django.conf import settings
import django.contrib.postgres.fields.jsonb
import django.contrib.postgres.functions
from django.db import migrations, models
import django.db.models.deletion


forward = """
    ALTER TABLE catmaid_deep_link DROP CONSTRAINT catmaid_deep_link_active_connector_id_fkey;
    ALTER TABLE catmaid_deep_link ADD CONSTRAINT catmaid_deep_link_active_connector_id_fkey
        FOREIGN KEY (active_connector_id) REFERENCES connector(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_deep_link DROP CONSTRAINT catmaid_deep_link_active_treenode_id_fkey;
    ALTER TABLE catmaid_deep_link ADD CONSTRAINT catmaid_deep_link_active_treenode_id_fkey
        FOREIGN KEY (active_treenode_id) REFERENCES treenode(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_deep_link DROP CONSTRAINT catmaid_deep_link_active_skeleton_id_fkey;
    ALTER TABLE catmaid_deep_link ADD CONSTRAINT catmaid_deep_link_active_skeleton_id_fkey
        FOREIGN KEY (active_skeleton_id) REFERENCES class_instance(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
"""

backward = """
    ALTER TABLE catmaid_deep_link DROP CONSTRAINT catmaid_deep_link_active_connector_id_fkey;
    ALTER TABLE catmaid_deep_link ADD CONSTRAINT catmaid_deep_link_active_connector_id_fkey
        FOREIGN KEY (active_connector_id) REFERENCES connector(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_deep_link DROP CONSTRAINT catmaid_deep_link_active_treenode_id_fkey;
    ALTER TABLE catmaid_deep_link ADD CONSTRAINT catmaid_deep_link_active_treenode_id_fkey
        FOREIGN KEY (active_treenode_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_deep_link DROP CONSTRAINT catmaid_deep_link_active_skeleton_id_fkey;
    ALTER TABLE catmaid_deep_link ADD CONSTRAINT catmaid_deep_link_active_skeleton_id_fkey
        FOREIGN KEY (active_skeleton_id) REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED;
"""


class Migration(migrations.Migration):
    """Adjusts the foreign key constraint behavior so that treenodes, connectors
    and skeletons can be deleleted without requiring an explicit deletion of a
    deep link. In these cases, the respective link field will simply be set to
    NULL and the link is kept.
    """
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0108_fix_deep_link_model_trigger'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]

