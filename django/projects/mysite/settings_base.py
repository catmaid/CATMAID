# -*- coding: utf-8 -*-
# General Django settings for mysite project.

import os
import sys
import django.conf.global_settings as DEFAULT_SETTINGS
import logging
import mysite.pipelinefiles as pipelinefiles
import mysite.utils as utils
import six

from celery.schedules import crontab

try:
    import psycopg2
except ImportError:
    # If psycopg2 is not installed, expect psycopg2cffi, which can be used with
    # PyP. Make sure psycopg2cffi runs in compatibility mode so that it can be
    # imported as psycopg2.
    try:
        from psycopg2cffi import compat
        compat.register()
    except ImportError:
        raise ImportError("Need either psycopg2 or psycopg2cffi")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Make Django root folder available
PROJECT_ROOT = utils.relative('..', '..')

# Add all subdirectories of project, applications and lib to sys.path
for subdirectory in ('projects', 'applications', 'lib'):
    full_path = os.path.join(PROJECT_ROOT, subdirectory)
    sys.path.insert(0, full_path)

# A list of people who get code error notifications. They will get an email
# if DEBUG=False and a view raises an exception.
ADMINS = (
    # ('Your Name', 'your_email@domain.com'),
)

# At the moment CATMAID doesn't support internationalization and all strings are
# expected to be in English.
LANGUAGE_CODE = 'en-gb'

# A tuple in the same format as ADMINS of people who get broken-link
# notifications when SEND_BROKEN_LINKS_EMAILS=True.
MANAGERS = ADMINS

# If you set this to False, Django will make some optimizations so as not
# to load the internationalization machinery.
USE_I18N = True

MIDDLEWARE = [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # For API tokens. Disable if not using HTTPS:
    'catmaid.middleware.AuthenticationHeaderExtensionMiddleware',
    'catmaid.middleware.CsrfBypassTokenAuthenticationMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'catmaid.middleware.AnonymousAuthenticationMiddleware',
    'catmaid.middleware.AjaxExceptionMiddleware',
]

ROOT_URLCONF = 'mysite.urls'

INSTALLED_APPS = (
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.sites',
    # Instead of 'django.contrib.admin', in order to disable the automatic
    # auto-discovery, which would interfer with django-adminplus.
    'django.contrib.admin.apps.SimpleAdminConfig',
    'django.contrib.staticfiles',
    'django.contrib.gis',
    'taggit',
    'adminplus',
    'guardian',
    'catmaid',
    'pgcompat',
    'performancetests',
    'pipeline',
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_swagger',
    'channels'
)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '%(levelname)s %(asctime)s %(module)s %(process)d %(thread)d %(message)s'
        },
        'simple': {
            'format': '%(levelname)s %(asctime)s %(message)s'
        },
    },
    'handlers': {
        'null': {
            'level': 'DEBUG',
            'class': 'logging.NullHandler',
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        }
    },
    'loggers': {
        'catmaid': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
        'catmaid.frontend': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [ # Extra folders
            os.path.join(BASE_DIR, 'templates'),
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.contrib.auth.context_processors.auth',
                'django.template.context_processors.debug',
                'django.template.context_processors.i18n',
                'django.template.context_processors.media',
                'django.template.context_processors.static',
                'django.template.context_processors.tz',
                'django.contrib.messages.context_processors.messages'
            ],
        }
    },
]

# The URL requests are redirected after login
LOGIN_REDIRECT_URL = '/'

# The URL where requests are redirected after login
LOGIN_URL = '/accounts/login'

AUTHENTICATION_BACKENDS = (
    'django.contrib.auth.backends.ModelBackend', # default
    'guardian.backends.ObjectPermissionBackend',
    # For API tokens. Disable if not using HTTPS:
    'rest_framework.authentication.TokenAuthentication',
)

# If a request is authenticated through an API token permissions are
# required, endpoints that require write/annotate permissions also
# need to have the TokenAnnotate permission. This is enforced also
# for admin accounts.
REQUIRE_EXTRA_TOKEN_PERMISSIONS = True


# Project ID of a dummy project that will keep all ontologies and
# classifications that are shared between multiple projects (and are
# thereby project independent).
ONTOLOGY_DUMMY_PROJECT_ID = -1

# Store datetimes as UTC by default. If stored datetimes have a timezone or
# offset, interpret it.
USE_TZ = True

# The current site in the django_site database table. This is used so that
# applications can hook into specific site(s) and a single database can manage
# content of multiple sites.
SITE_ID = 1

# Defines which type of spatial query should be used for treenodes. The
# available options are 'classic', 'postgis2d' and 'postgis3d'. Additionally,
# cache tables can be populated, which allows to make use of the following node
# providers: cached_json, cached_json_text and cached_msgpack. If multiple are
# provided, node providers are asked one after the other for a result until a
# result is returned. Entries can either be node provider names or tuples of
# the form (name, options) to provide options for a particular node provider.
NODE_PROVIDERS = [
    'postgis3d'
]

# By default, prepared statements are disabled. If connection pooling is used,
# this can further improve performance.
PREPARED_STATEMENTS = False

# History tables are created and populated by default. They keep track of every
# change in all CATMAID tables plus some additional ones. If this is not
# wanted, history tables can be disabled by setting HISTORY_TRACKING to False.
# Note that the tables will still exist, but only not populated.
HISTORY_TRACKING = True

# Default user profile settings
PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT = False
PROFILE_SHOW_TEXT_LABEL_TOOL = False
PROFILE_SHOW_TAGGING_TOOL = False
PROFILE_SHOW_CROPPING_TOOL = False
PROFILE_SHOW_SEGMENTATION_TOOL = False
PROFILE_SHOW_TRACING_TOOL = False
PROFILE_SHOW_ONTOLOGY_TOOL = False
PROFILE_SHOW_ROI_TOOL = False

# Defines if a cropped image of a ROI should be created
# automatically when the ROI is created. If set to False
# such an image will be created when requested.
ROI_AUTO_CREATE_IMAGE = False

# A limit on the size of the result returned by a single spatial query. This
# determines the maximum number of nodes shown in the tracing overlay, so has
# severe worst-case performance implications for the database, web server, and
# client. Note that this is not a direct limit on the number of nodes in the
# result; that will be between 1x and 2x this value.
NODE_LIST_MAXIMUM_COUNT = 3500

# Default importer tile width, tile height and tile source type
IMPORTER_DEFAULT_DATA_SOURCE = 'filesystem'
IMPORTER_DEFAULT_TILE_WIDTH = 512
IMPORTER_DEFAULT_TILE_HEIGHT = 512
IMPORTER_DEFAULT_TILE_SOURCE_TYPE = 1
IMPORTER_DEFAULT_IMAGE_BASE = ''

# Some tools and widgets create files (e.g. cropping, ROIs, NeuroHDF5 and
# treenode export). These files will be created in a folder for each tool
# relative to the path defined in Django's MEDIA_ROOT variable. These are
# the default sub-folders, all of them need to be writable:
MEDIA_HDF5_SUBDIRECTORY = 'hdf5'
MEDIA_CROPPING_SUBDIRECTORY = 'cropping'
MEDIA_ROI_SUBDIRECTORY = 'roi'
MEDIA_TREENODE_SUBDIRECTORY = 'treenode_archives'
MEDIA_EXPORT_SUBDIRECTORY = 'export'
MEDIA_CACHE_SUBDIRECTORY = 'cache'

# Cropping output extension
CROPPING_OUTPUT_FILE_EXTENSION = "tiff"
CROPPING_OUTPUT_FILE_PREFIX = "crop_"
CROPPING_VERIFY_CERTIFICATES = True

# The maximum allowed size in Bytes for generated files. The cropping tool, for
# instance, uses this to cancel a request if the generated file grows larger
# than this. This defaults to 50 Megabyte.
GENERATED_FILES_MAXIMUM_SIZE = 52428800

# The maximum allowed size in bytes for files uploaded for import as skeletons.
# The default is 5 megabytes.
IMPORTED_SKELETON_FILE_MAXIMUM_SIZE = 5242880

# The maximum allowed image size for imported images. The default is 3MB.
IMPORTED_IMAGE_FILE_MAXIMUM_SIZE = 3145728

# The maximum allowd body data size, default is 10 MB.
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 8 * 1024**2

# Specifies if user registration is allowed
USER_REGISTRATION_ALLOWED = False

# A new user's defaul groups
NEW_USER_DEFAULT_GROUPS = []

# While pickle can cause security problems [1], we allow it for now and trust
# that the Celery server will only accept connections from CATMAID. To improve
# security, this should be changed though, see also [2].
# [1] http://docs.celeryproject.org/en/latest/userguide/security.html#serializers
# [2] https://github.com/catmaid/CATMAID/issues/630
CELERY_ACCEPT_CONTENT = ['pickle']
CELERY_TASK_SERIALIZER = 'pickle'

# The default set of periodic tasks
CELERY_BEAT_SCHEDULE = {
    # Clean cropped stack directory every night at 23:30.
    'daily-crop-data-cleanup': {
        'task': 'catmaid.tasks.cleanup_cropped_stacks',
        'schedule': crontab(hour=23, minute=30)
    },
    # Update project statistics every night at 23:45.
    'daily-project-stats-summary-update': {
        'task': 'catmaid.tasks.update_project_statistics_from_scratch',
        'schedule': crontab(hour=23, minute=45)
    },
    'daily-inactive-user-update': {
        'task': 'catmaid.tasks.deactivate_inactive_users',
        'schedule': crontab(hour=00, minute=00)
    },
}

# We use django-pipeline to compress and reference JavaScript and CSS files. To
# make Pipeline integrate with staticfiles (and therefore collecstatic calls)
# the STATICFILES_STORAGE variable has to be set to:
STATICFILES_STORAGE = 'pipeline.storage.PipelineCachedStorage'

# Adding PipelineFinder as asset discovery mechanism allows staticfiles to also
# discover files that were generated by Pipeline.
STATICFILES_FINDERS = (
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
)

PIPELINE = {
    # Use CSSMin as django-pipeline's CSS compressor
    'CSS_COMPRESSOR': 'pipeline.compressors.cssmin.CSSMinCompressor',
    # Use no JS compresor for now
    'JS_COMPRESSOR': None,
    # Don't wrap JS files into anonymous functions. Our code isn't ready for
    # this, yet.
    'DISABLE_WRAPPER': True,
    # All static files that are run through pipeline
    'STYLESHEETS': pipelinefiles.STYLESHEETS,
    'JAVASCRIPT': pipelinefiles.JAVASCRIPT
}

# Make a list of files that should be included directly (bypassing pipeline)
# and a list of pipeline identifiers for all others.
NON_COMPRESSED_FILE_IDS = list(pipelinefiles.non_pipeline_js)
NON_COMPRESSED_FILES = list(pipelinefiles.non_pipeline_js.values())
COPY_ONLY_FILE_IDS = set(pipelinefiles.copy_only_files)
STYLESHEET_IDS = list(pipelinefiles.STYLESHEETS)
COMPRESSED_FILE_IDS = [key for key in pipelinefiles.JAVASCRIPT \
        if key not in NON_COMPRESSED_FILE_IDS \
        and key not in COPY_ONLY_FILE_IDS]

INSTALLED_EXTENSIONS = tuple(pipelinefiles.installed_extensions)

# Make Git based version of CATMAID available as a settings field
VERSION = utils.get_version()

# Janelia rendering service. To activate add the following lines to your
# settings.py file:
# MIDDLEWARE += ('catmaid.middleware.JaneliaRenderMiddleware',)
# JANELIA_RENDER_SERVICE_URL = 'http://renderer.int.janelia.org:8080/render-ws/v1'
# JANELIA_RENDER_DEFAULT_STACK_RESOLUTION = (4,4,35)
# JANELIA_RENDER_STACK_TILE_WIDTH = 1024
# JANELIA_RENDER_STACK_TILE_HEIGHT = 1024

# DVID auto-discovery. To activate add the following lines to your settings.py
# file:
# MIDDLEWARE += ('catmaid.middleware.DVIDMiddleware',)
# DVID_URL = 'http://emdata2.int.janelia.org:7000'
# DVID_FORMAT = 'jpg:80'
# DVID_SHOW_NONDISPLAYABLE_REPOS = True

# In order to make Django work with the unmanaged models from djsopnet in tests,
# we use a custom testing runner to detect when running in a testing
# environment. The custom PostgreSQL database wrapper uses this flag to change
# its behavior.
TEST_RUNNER = 'custom_testrunner.TestSuiteRunner'

# By default, front end tests are disabled.
FRONT_END_TESTS_ENABLED = False

# By default GUI tests are disabled. Enable them by setting GUI_TESTS_ENABLED to
# True (done during CI).
GUI_TESTS_ENABLED = False
GUI_TESTS_REMOTE = False

# To simplify configuration for performance test CATMAID instances, the SCM URL
# used to create commit links is defined here. The {} is used to denote the
# commit name.
PERFORMANCETEST_SCM_URL = "https://github.com/catmaid/CATMAID/commit/{version}"

# This setting allows the WSGI back-end to serve static files. It is highly
# discouraged to use this in production as it is very in-efficient and
# potentially insecure. It is used only to simplify continuous integration.
SERVE_STATIC = False

# Additional static files can be loaded by CATMAID if they are placed in the
# folder defined by STATIC_EXTENSION_ROOT. These files are not respected by
# Pipeline to allow updating them without running collectstatic. To use this
# feature, your webserver has to resolve the STATIC_EXTENSION_URL to this
# folder.
STATIC_EXTENSION_URL = "/staticext/"
STATIC_EXTENSION_ROOT = "/tmp"
STATIC_EXTENSION_FILES = []

# Default cookie suffix, should be customized if multiple CATMAID instances run
# on the same server, e.g. with:
# hashlib.md5(CATMAID_URL.encode('utf-8')).hexdigest()
COOKIE_SUFFIX = 'catmaid'

# The CATMAID web client sends list by sending each list element in its own
# field. Django allows by default 1000 fields. To allow large neuron lists, we
# need to disable this check for now.
DATA_UPLOAD_MAX_NUMBER_FIELDS = None

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    # If no authentication is possible, use guardian's anonymous user
    'UNAUTHENTICATED_USER': 'guardian.utils.get_anonymous_user',
    'VIEW_DESCRIPTION_FUNCTION': 'custom_rest_swagger_googledoc.get_googledocstring',
    # Parser classes priority-wise for Swagger
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.JSONParser',
    ],
    'DEFAULT_SCHEMA_CLASS': 'custom_swagger_schema.CustomSchema',
    'URL_FORMAT_OVERRIDE': None,
}

SWAGGER_SETTINGS = {
    'DOC_EXPANSION': 'list',
    'APIS_SORTER': 'alpha'
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "asgi_ipc.IPCChannelLayer",
        "ROUTING": "mysite.routing.channel_routing",
        "CONFIG": {}
    },
}

# Needed for NRRD export
CATMAID_FULL_URL = ""
CATMAID_HTTP_AUTH_USER = None
CATMAID_HTTP_AUTH_PASS = None

# Whether or not to create default data views in the initial migration. This is
# mainly useful for setups using the JaneliaRender or DVID middleware.
CREATE_DEFAULT_DATAVIEWS = True

# NBLAST support
NBLAST_ALL_BY_ALL_MIN_SIZE = 10
MAX_PARALLEL_ASYNC_WORKERS = 1

# Intersection grid settings, dimensions in project coordinates (nm)
DEFAULT_CACHE_GRID_CELL_WIDTH = 25000
DEFAULT_CACHE_GRID_CELL_HEIGHT = 25000
DEFAULT_CACHE_GRID_CELL_DEPTH = 40

# Whether Postgres should emit "catmaid.spatial-update" events on changes of
# spatial data (e.g. inserts, updates and deletions of treenodes, connectors and
# connector links).
SPATIAL_UPDATE_NOTIFICATIONS = False
