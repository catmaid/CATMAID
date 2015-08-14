from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

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

# Until we use Django >= 1.7 and its AppConfig, this seems to be the best place
# to put this sort of validation. It is run once on startup.
validate_configuration()
