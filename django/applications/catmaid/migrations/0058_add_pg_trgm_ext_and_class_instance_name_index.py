# -*- coding: utf-8 -*-
from django.db import migrations
from django.contrib.postgres.operations import TrigramExtension


forward = """
    CREATE INDEX class_instance_name_trgm_idx
        ON class_instance USING gin (name gin_trgm_ops);
"""


backward = """
    DROP INDEX class_instance_name_trgm_idx;
"""


class Migration(migrations.Migration):
    """This adds a trigram index to the class_instance table to speed up name
    queries that involve wildcards and regular expressions. Since we also allow
    wildcards at the end of a name (e.g. when searching for a neuron name),
    B-tree can't be used. Trigram however works fine with this and is included
    in a regular Postgres setup. It only needs to be enabled through an
    extension. This migration tries to install the extension, but will also try
    to setup the index if extension creation is not allowed for the CATMAID
    user. This is done, because we expect the database administrator to have
    installed this extension separately using "CREATE EXTENSION pg_trgm;"
    """

    dependencies = [
        ('catmaid', '0057_merge_summary_bugfix'),
    ]

    operations = [
        TrigramExtension(),
        migrations.RunSQL(forward, backward),
    ]
