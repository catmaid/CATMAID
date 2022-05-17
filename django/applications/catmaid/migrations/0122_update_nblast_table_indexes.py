import catmaid.fields
import catmaid.models
from django.conf import settings
import django.contrib.postgres.fields
import django.contrib.postgres.functions
from django.db import connection, migrations, models
import django.db.models.deletion
import numpy as np


forward = """
    CREATE INDEX nblast_similarity_score_query_object_id ON
        nblast_similarity_score (query_object_id) INCLUDE (similarity_id);
    CREATE INDEX nblast_similarity_score_target_object_id ON
        nblast_similarity_score (target_object_id) INCLUDE (similarity_id);
"""


backward = """
    DROP INDEX nblast_similarity_score_query_object_id;
    DROP INDEX nblast_similarity_score_target_object_id;
"""

class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0121_update_nblast_tables'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
