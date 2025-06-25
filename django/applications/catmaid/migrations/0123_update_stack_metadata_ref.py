from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("catmaid", "0122_add_painting_tool_setting"),
    ]

    operations = [
        migrations.AlterField(
            model_name="stack",
            name="metadata",
            field=models.JSONField(
                blank=True,
                help_text='Optional JSON for a stack. Supported is the boolean field "clamp" which can be set "to "false" to disable tile access clamping as well as the 3-tuple "voxelOffset", which can be used to offset the voxels space of the stack by the respective vector. Some mirror types support reading custom configuration information from this field. For instance the cloud-volume tile source can cache the \'info\' file of a Neuroglancer Precopmuted info file in the \'ngpreInfo\' metadata field.',
                null=True,
            ),
        )
    ]
