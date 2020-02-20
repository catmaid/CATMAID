from django.db import migrations


forward = """
    UPDATE client_data
    SET value = jsonb_set(value #- '{entries, remote_catmaid_instances}',
        '{entries, remote_servers}', value->'entries'->'remote_catmaid_instances')
    WHERE key = 'client-settings'
        AND value->'entries' ? 'remote_catmaid_instances';

    UPDATE client_data
    SET value = jsonb_set(value #- '{entries, remote_catmaid_projects}',
        '{entries, remote_projects}', value->'entries'->'remote_catmaid_projects')
    WHERE key = 'client-settings'
        AND value->'entries' ? 'remote_catmaid_projects';
"""

backward = """
    UPDATE client_data
    SET value = jsonb_set(value #- '{entries, remote_servers}',
        '{entries, remote_catmaid_instances}', value->'entries'->'remote_servers')
    WHERE key = 'client-settings'
        AND value->'entries' ? 'remote_servers';

    UPDATE client_data
    SET value = jsonb_set(value #- '{entries, remote_projects}',
        '{entries, remote_catmaid_projects}', value->'entries'->'remote_projects')
    WHERE key = 'client-settings'
        AND value->'entries' ? 'remote_projects';
"""

class Migration(migrations.Migration):
    """This migration will update client_data entries that reference front-end
    client settings with the fields remote_catmaid_instances and
    remote_catmaid_projects. It renames these fields to a more general form:
    remote_servers and remote_projects.
    """

    dependencies = [
        ('catmaid', '0101_optimize_disabled_spatial_update_events'),
    ]

    operations = [
            migrations.RunSQL(forward, backward),
    ]
