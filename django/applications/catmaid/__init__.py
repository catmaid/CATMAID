from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db.utils import ProgrammingError
from catmaid.models import User, Project

# A list of settings that are expected to be available.
required_setting_fields = {
        "VERSION": str,
        "CATMAID_URL": str,
        "ONTOLOGY_DUMMY_PROJECT_ID": int,
        "PROFILE_DEFAULT_INVERSE_MOUSE_WHEEL": bool,
        "PROFILE_DISPLAY_STACK_REFERENCE_LINES": bool,
        "PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT": bool,
        "PROFILE_SHOW_TEXT_LABEL_TOOL": bool,
        "PROFILE_SHOW_TAGGING_TOOL": bool,
        "PROFILE_SHOW_CROPPING_TOOL": bool,
        "PROFILE_SHOW_SEGMENTATION_TOOL": bool,
        "PROFILE_SHOW_TRACING_TOOL": bool,
        "PROFILE_SHOW_ONTOLOGY_TOOL": bool,
        "PROFILE_SHOW_ROI_TOOL": bool,
        "PROFILE_TRACING_OVERLAY_SCREEN_SCALING": bool,
        "PROFILE_TRACING_OVERLAY_SCALE": float,
        "PROFILE_PREFER_WEBGL_LAYERS": bool,
        "PROFILE_USE_CURSOR_FOLLOWING_ZOOM": bool,
        "ROI_AUTO_CREATE_IMAGE": bool,
        "NODE_LIST_MAXIMUM_COUNT": int,
        "IMPORTER_DEFAULT_TILE_WIDTH": int,
        "IMPORTER_DEFAULT_TILE_HEIGHT": int,
        "MEDIA_HDF5_SUBDIRECTORY": str,
        "MEDIA_CROPPING_SUBDIRECTORY": str,
        "MEDIA_ROI_SUBDIRECTORY": str,
        "MEDIA_TREENODE_SUBDIRECTORY": str,
        "GENERATED_FILES_MAXIMUM_SIZE": int,
        "USER_REGISTRATION_ALLOWED": bool,
        "NEW_USER_DEFAULT_GROUPS": list,
        "STATIC_EXTENSION_FILES": list,
        "STATIC_EXTENSION_ROOT": str,
}

def validate_configuration():
    """Make sure CATMAID is configured properly and raise an error if not.
    """
    # Make sure all expected settings are available.
    for field, data_type in required_setting_fields.iteritems():
        if not hasattr(settings, field):
            raise ImproperlyConfigured(
                    "Please add the %s settings field" % field)
        if type(getattr(settings, field)) != data_type:
            raise ImproperlyConfigured("Please make sure settings field %s "
                    "is of type %s" % (field, data_type))

def get_system_user():
    """Return a User instance of a superuser. This is either the superuser
    having the ID configured in SYSTEM_USER_ID or the superuser with the lowest
    ID."""
    if hasattr(settings, "SYSTEM_USER_ID"):
        try:
            return User.objects.get(id=settings.SYSTEM_USER_ID, is_superuser=True)
        except User.DoesNotExist:
            raise ImproperlyConfigured("Could not find any super user with ID "
                                       "configured in SYSTEM_USER_ID (%s), "
                                       "please fix this in settings.py" % settings.SYSTEM_USER_ID)
    else:
        # Find admin user with lowest id
        users = User.objects.filter(is_superuser=True).order_by('id')
        if not len(users):
            raise ImproperlyConfigured("Couldn't find any super user, " +
                                       "please make sure you have one")
        return users[0]


def check_superuser():
    """Make sure there is at least one superuser available and, if configured,
    SYSTEM_USER_ID points to a superuser. Expects database to be set up.
    """
    try:
        has_users = User.objects.all().exists()
        has_projects = Project.objects.exclude(pk=settings.ONTOLOGY_DUMMY_PROJECT_ID).exists()
        if not (has_users and has_projects):
            # In case there is no user and only no project except thei ontology
            # dummy project, don't do the check. Otherwise, setting up CATMAID
            # initially will not be possible without raising the errors below.
            return

        if not User.objects.filter(is_superuser=True).count():
            raise ImproperlyConfigured("You need to have at least one superuser "
                                    "configured to start CATMAID.")

        if hasattr(settings, "SYSTEM_USER_ID"):
            try:
                user = User.objects.get(id=settings.SYSTEM_USER_ID)
            except User.DoesNotExist:
                raise ImproperlyConfigured("Could not find any super user with the "
                                        "ID configured in SYSTEM_USER_ID")
            if not user.is_superuser:
                raise ImproperlyConfigured("The user configured in SYSTEM_USER_ID "
                                        "is no superuser")
    except ProgrammingError:
        # This error is raised if the database is not set up when the code
        # above is executed. This can safely be ignored.
        pass


# Until we use Django >= 1.7 and its AppConfig, this seems to be the best place
# to put this sort of validation. It is run once on startup.
validate_configuration()
check_superuser()
