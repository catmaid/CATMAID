from django.db import migrations, models


forward = """
    ALTER TABLE catmaid_stats_summary
    ADD COLUMN import_cable_length double precision DEFAULT 0 NOT NULL;
"""

backward = """
    ALTER TABLE catmaid_stats_summary
    DROP COLUMN import_cable_length;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0093_add_primary_group_field_to_user_profile'),
    ]

    operations = [
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='statssummary',
                name='import_cable_length',
                field=models.FloatField(default=0),
            ),
        ]),
    ]
