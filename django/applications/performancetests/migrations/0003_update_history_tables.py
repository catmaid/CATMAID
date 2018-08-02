# -*- coding: utf-8 -*-

import django.contrib.auth.models
import django.contrib.postgres.fields.jsonb
from django.db import migrations


# DDL triggers aren't yet implemented for CATMAID's history tracking. Therefore,
# the history updates have to be implemented manually. This has not been done
# for a performance test table, but is required for the history view migration
# to apply in all cases.

forward = """
    DO $$
    DECLARE
        history_table regclass;
    BEGIN

    history_table = get_history_table_name('performancetests_testview'::regclass);

    -- Only try to fix the data type if it hasn't been fixed manually already
    IF NOT EXISTS(
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = history_table
        AND a.attname = 'data'
        AND format_type(a.atttypid, a.atttypmod) = 'jsonb')
    THEN
        EXECUTE format(
            'ALTER TABLE %1$s '
            'ALTER COLUMN data '
            'TYPE jsonb '
            'USING data::jsonb',
            history_table);
    END IF;
    END
    $$;
"""

class Migration(migrations.Migration):
    """Make sure the performancetest testview table uses a JSONB type in its
    history table. There is no need to alter the live table or a Django model,
    because this happend already in another migration.
    """

    dependencies = [
        ('catmaid', '0011_fix_transaction_label_typo'),
        ('performancetests', '0002_use_django_1_9_jsonfield')
    ]

    operations = [
        migrations.RunSQL(forward, migrations.RunSQL.noop)
    ]
