# -*- coding: utf-8 -*-

from django.db import migrations, models

forward = """
    -- Remove constraints if they exist (in case they have been added manually
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT IF EXISTS class_instance_class_instance_project_id_fkey;
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT IF EXISTS class_instance_class_instance_class_instance_a_fkey;
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT IF EXISTS class_instance_class_instance_class_instance_b_fkey;
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT IF EXISTS class_instance_class_instance_relation_id_fkey;

    ALTER TABLE ONLY class_instance
        DROP CONSTRAINT IF EXISTS class_instance_project_id_fkey;
    ALTER TABLE ONLY class_instance
        DROP CONSTRAINT IF EXISTS class_instance_class_id_fkey;

    ALTER TABLE ONLY class
        DROP CONSTRAINT IF EXISTS class_project_id_fkey;

    -- Foreign key constraints for class_instance_class_instance
    ALTER TABLE ONLY class_instance_class_instance
        ADD CONSTRAINT class_instance_class_instance_project_id_fkey FOREIGN KEY
        (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE ONLY class_instance_class_instance
        ADD CONSTRAINT class_instance_class_instance_class_instance_a_fkey FOREIGN KEY
        (class_instance_a) REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE ONLY class_instance_class_instance
        ADD CONSTRAINT class_instance_class_instance_class_instance_b_fkey FOREIGN KEY
        (class_instance_b) REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE ONLY class_instance_class_instance
        ADD CONSTRAINT class_instance_class_instance_relation_id_fkey FOREIGN KEY
        (relation_id) REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED;

    -- Foreign key constraints for class_instance
    ALTER TABLE ONLY class_instance
        ADD CONSTRAINT class_instance_project_id_fkey FOREIGN KEY
        (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE ONLY class_instance
        ADD CONSTRAINT class_instance_class_id_fkey FOREIGN KEY
        (class_id) REFERENCES class(id) DEFERRABLE INITIALLY DEFERRED;

    -- Foreign key constraints for class_instance
    ALTER TABLE ONLY class
        ADD CONSTRAINT class_project_id_fkey FOREIGN KEY
        (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;
"""

backward = """
    -- Foreign key constraints for class_instance_class_instance
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT class_instance_class_instance_project_id_fkey;
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT class_instance_class_instance_class_instance_a_fkey;
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT class_instance_class_instance_class_instance_b_fkey;
    ALTER TABLE ONLY class_instance_class_instance
        DROP CONSTRAINT class_instance_class_instance_relation_id_fkey;

    -- Foreign key constraints for class_instance
    ALTER TABLE ONLY class_instance
        DROP CONSTRAINT class_instance_project_id_fkey;
    ALTER TABLE ONLY class_instance
        DROP CONSTRAINT class_instance_class_id_fkey;

    -- Foreign key constraints for class_instance
    ALTER TABLE ONLY class
        DROP CONSTRAINT class_project_id_fkey;
"""

class Migration(migrations.Migration):
    """Add foreign key constraints for class_instance_class_instance and
    class_instance tables.
    """

    dependencies = [
        ('catmaid', '0041_add_sampler_column_leaf_handling'),
    ]

    operations = [
        migrations.RunSQL(forward, backward)
    ]

