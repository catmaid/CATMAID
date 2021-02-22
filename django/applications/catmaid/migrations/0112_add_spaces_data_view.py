from django.db import migrations

forward = """
    INSERT INTO data_view_type (title, code_type, comment)
    VALUES ('Spaces and Resources', 'spaces_resources',
        'Useful when users should be able to create own projects and work with existing read-only projects.');
"""

backward = """
    DELETE FROM data_view_type WHERE code_type = 'spaces_resources';
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0111_add_favorite_project_model'),
    ]

    operations = [
            migrations.RunSQL(forward, backward),
    ]
