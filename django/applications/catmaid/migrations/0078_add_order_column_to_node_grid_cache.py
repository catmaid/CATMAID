from django.db import migrations, models

forward = """
    ALTER TABLE node_grid_cache ADD COLUMN ordering text DEFAULT NULL;

    ALTER TABLE node_grid_cache ADD CONSTRAINT check_valid_ordering
        CHECK (ordering IS NULL OR ordering IN ('cable-desc', 'cable-asc'));
"""

backward = """
    ALTER TABLE node_grid_cache DROP CONSTRAINT check_valid_ordering;
    ALTER TABLE node_grid_cache DROP COLUMN ordering;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0077_add_edge_update_function'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='nodegridcache',
                name='ordering',
                field=models.TextField(default=None, null=True),
            ),
        ])
    ]
