import catmaid.fields
from django.conf import settings
import django.contrib.postgres.fields
import django.contrib.postgres.fields.jsonb
import django.contrib.postgres.functions
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    """This migrations only renders a new Django model state to include new
    deep link reverse lookup names and an update of the stack model help text.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0106_update_tile_source_choices'),
    ]

    operations = [
        migrations.RunSQL(migrations.RunSQL.noop, migrations.RunSQL.noop, [
            # Update deep link reverse foreign key name look-up field names
            migrations.AlterField(
                model_name='deeplinkstack',
                name='deep_link',
                field=models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, related_name='stacks', to='catmaid.DeepLink'),
            ),
            migrations.AlterField(
                model_name='deeplinkstack',
                name='stack',
                field=models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.Stack'),
            ),
            migrations.AlterField(
                model_name='deeplinkstackgroup',
                name='deep_link',
                field=models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, related_name='stack_groups', to='catmaid.DeepLink'),
            ),
            migrations.AlterField(
                model_name='deeplinkstackgroup',
                name='stack_group',
                field=models.ForeignKey(on_delete=django.db.models.deletion.DO_NOTHING, to='catmaid.StackGroup'),
            ),

            # Update help text of stack to include vertex offset.
            migrations.AlterField(
                model_name='stack',
                name='metadata',
                field=django.contrib.postgres.fields.jsonb.JSONField(blank=True, help_text='Optional JSON for a stack. Supported is the boolean field "clamp" which can be set "to "false" to disable tile access clamping as well as the 3-tuple "voxelOffset", which can be used to offset the voxels space of the stack by the respective vector.', null=True),
            ),
        ]),
    ]

