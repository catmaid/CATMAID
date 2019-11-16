from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0093_add_primary_group_field_to_user_profile'),
    ]

    operations = [
        migrations.AddField(
            model_name='statssummary',
            name='import_cable_length',
            field=models.FloatField(default=0),
        ),
    ]
