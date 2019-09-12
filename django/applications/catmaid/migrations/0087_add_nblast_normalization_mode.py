from django.db import migrations

forward = """
    ALTER TABLE nblast_similarity DROP CONSTRAINT check_valid_normalization;
    ALTER TABLE nblast_similarity ADD CONSTRAINT check_valid_normalization
        CHECK (normalized IN ('raw', 'normalized', 'mean', 'geometric-mean'));
"""

backward = """
    ALTER TABLE nblast_similarity DROP CONSTRAINT check_valid_normalization;
    ALTER TABLE nblast_similarity ADD CONSTRAINT check_valid_normalization
        CHECK (normalized IN ('raw', 'normalized', 'mean'));
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0086_complete_django_auth_user_update'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
