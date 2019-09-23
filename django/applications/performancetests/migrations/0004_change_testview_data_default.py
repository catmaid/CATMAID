import django.contrib.postgres.fields.jsonb
from django.db import migrations


class Migration(migrations.Migration):
    """This only lets Django know that the default value changed from an object
    to a callable."""

    dependencies = [
        ('performancetests', '0003_update_history_tables'),
    ]

    operations = [
        migrations.RunSQL(migrations.RunSQL.noop, migrations.RunSQL.noop, [
            migrations.AlterField(
                model_name='testview',
                name='data',
                field=django.contrib.postgres.fields.jsonb.JSONField(blank=True, default=dict),
            ),
        ]),
    ]
