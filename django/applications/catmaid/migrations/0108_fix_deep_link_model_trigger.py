import catmaid.fields
import datetime
from django.conf import settings
import django.contrib.postgres.fields.jsonb
import django.contrib.postgres.functions
from django.db import migrations, models
import django.db.models.deletion


forward = """
    DROP TRIGGER on_edit_deep_link_stack ON catmaid_deep_link;
    CREATE TRIGGER on_edit_deep_link_stack BEFORE UPDATE ON catmaid_deep_link_stack FOR EACH ROW EXECUTE PROCEDURE on_edit();
"""

backward = """
    DROP TRIGGER on_edit_deep_link_stack ON catmaid_deep_link_stack;
    CREATE TRIGGER on_edit_deep_link_stack BEFORE UPDATE ON catmaid_deep_link FOR EACH ROW EXECUTE PROCEDURE on_edit();
"""


class Migration(migrations.Migration):
    """Fixes a wrong trigger target table of the recently added trigger.
    """
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0107_update_deep_link_model_state'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
