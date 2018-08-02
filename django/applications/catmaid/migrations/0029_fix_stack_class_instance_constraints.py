# -*- coding: utf-8 -*-

from django.db import migrations, models

# Drop old constraint created in 0001_initial, but also new constraint if it
# exists to make migration easier for instances that changed this manually.
forward = """
    ALTER TABLE ONLY stack_class_instance
        DROP CONSTRAINT IF EXISTS stack_ci_stack_id_refs_id;
    ALTER TABLE ONLY stack_class_instance
        DROP CONSTRAINT IF EXISTS stack_class_instance_class_instance_id_fkey;
    ALTER TABLE ONLY stack_class_instance
        ADD CONSTRAINT stack_class_instance_class_instance_id_fkey FOREIGN KEY
        (class_instance_id) REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED;
"""

backward = """
    ALTER TABLE ONLY stack_class_instance
        DROP CONSTRAINT stack_class_instance_class_instance_id_fkey;
    ALTER TABLE ONLY stack_class_instance
        ADD CONSTRAINT stack_ci_stack_id_refs_id FOREIGN KEY (stack_id) REFERENCES stack(id) DEFERRABLE INITIALLY DEFERRED;
"""

class Migration(migrations.Migration):
    """Add indices that have a postive effect on performance of import filtering
    related statistics queries.
    """

    dependencies = [
        ('catmaid', '0028_add_point_tables'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]
