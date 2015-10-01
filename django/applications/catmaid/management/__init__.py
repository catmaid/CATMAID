import catmaid.models

from django.db.models import signals
from catmaid import get_system_user
from catmaid.models import Project, User
from catmaid.conf import settings as catmaid_settings
from catmaid.control import project
from south import signals as south_signals


def init_classification():
    """ Creates a dummy project to store classification graphs in.
    """
    try:
        Project.objects.get(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID)
    except Project.DoesNotExist:
        print("Creating ontology dummy project")
        Project.objects.create(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID,
            title="Classification dummy project")


def validate_projects(app, **kwargs):
    """Make sure all projects have the relations and classes available they
    expect."""
    has_users = User.objects.all().exists()
    has_projects = Project.objects.exclude(
        pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID).exists()
    if not (has_users and has_projects):
        # In case there is no user and only no project except thei ontology
        # dummy project, don't do the check. Otherwise, getting a system user
        # will fail.
        return

    user = get_system_user()
    for p in Project.objects.all():
        project.validate_project_setup(p.id, user.id)


def validate_environment(app, **kwargs):
    """Make sure CATMAID is set up correctly."""
    # Only validate after catmaid was migrated
    if app != catmaid:
        return

    validate_projects()
    init_classification()


# Validate CATMAID environment after all South migrations have been run
south_signals.post_migrate.connect(validate_environment)
