from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0116_complete_auth_user_update'),
    ]

    operations = [
        migrations.AlterField(
            model_name='clientdata',
            name='value',
            field=models.JSONField(default=dict),
        ),
        migrations.AlterField(
            model_name='nblastsample',
            name='subset',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='nodegridcachecell',
            name='json_data',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='nodequerycache',
            name='json_data',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='stack',
            name='metadata',
            field=models.JSONField(blank=True, help_text='Optional JSON for a stack. Supported is the boolean field "clamp" which can be set "to "false" to disable tile access clamping as well as the 3-tuple "voxelOffset", which can be used to offset the voxels space of the stack by the respective vector.', null=True),
        ),
    ]
