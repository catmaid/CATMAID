# -*- coding: utf-8 -*-

from django.db import migrations

forward = """
    ALTER TABLE ONLY restriction ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
    ALTER TABLE ONLY cardinality_restriction ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
"""


class Migration(migrations.Migration):
    """This migration makes sure that both restriction tables have proper
    default values for their ID field.
    """

    dependencies = [
        ('catmaid', '0013_add_missing_tnci_and_cnci_indices'),
    ]

    operations = [
        migrations.RunSQL(forward, migrations.RunSQL.noop)
    ]
