# -*- coding: utf-8 -*-

from django.db import migrations


add_missing_primary_keys = """

    CREATE VIEW primary_keys
    AS
        SELECT a.attname AS column_name, i.indrelid AS rel
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid
                             AND a.attnum = ANY(i.indkey)
        AND    i.indisprimary;

    DO
    $$
    BEGIN

    IF NOT EXISTS (SELECT 1 FROM primary_keys WHERE rel = 'restriction'::regclass) THEN
        ALTER TABLE restriction
        ADD CONSTRAINT restriction_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM primary_keys WHERE rel = 'cardinality_restriction'::regclass) THEN
        ALTER TABLE cardinality_restriction
        ADD CONSTRAINT cardinality_restriction_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM primary_keys WHERE rel = 'concept'::regclass) THEN
        ALTER TABLE concept
        ADD CONSTRAINT concept_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM primary_keys WHERE rel = 'region_of_interest'::regclass) THEN
        ALTER TABLE region_of_interest
        ADD CONSTRAINT region_of_interest_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM primary_keys WHERE rel = 'stack_class_instance'::regclass) THEN
        ALTER TABLE stack_class_instance
        ADD CONSTRAINT stack_class_instance_pkey PRIMARY KEY (id);
    END IF;

    END
    $$;

    DROP VIEW primary_keys;
"""

remove_missing_primary_keys = """
    ALTER TABLE restriction
    DROP CONSTRAINT restriction_pkey;

    ALTER TABLE cardinality_restriction
    DROP CONSTRAINT cardinality_restriction_pkey;

    ALTER TABLE concept
    DROP CONSTRAINT concept_pkey;

    ALTER TABLE region_of_interest
    DROP CONSTRAINT region_of_interest_pkey;

    ALTER TABLE stack_class_instance
    DROP CONSTRAINT stack_class_instance_pkey;
"""

class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0006_require_contenttypes_0002'),
        ('authtoken', '0001_initial'),
        ('catmaid', '0004_add_treenode_connector_edge_table'),
        ('guardian', '0001_initial'),
        ('performancetests', '0001_initial'),
        ('sites', '0001_initial'),
        ('taggit', '0002_auto_20150616_2121')
    ]

    operations = [
        migrations.RunSQL(add_missing_primary_keys, remove_missing_primary_keys),
    ]
