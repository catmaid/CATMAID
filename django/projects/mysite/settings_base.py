# General Django settings for mysite project.

import os
import sys
import django.conf.global_settings as DEFAULT_SETTINGS
import utils
from pipelinefiles import *

# A list of people who get code error notifications. They will get an email
# if DEBUG=False and a view raises an exception.
ADMINS = (
    # ('Your Name', 'your_email@domain.com'),
)

# A tuple in the same format as ADMINS of people who get broken-link
# notifications when SEND_BROKEN_LINKS_EMAILS=True.
MANAGERS = ADMINS

# If you set this to False, Django will make some optimizations so as not
# to load the internationalization machinery.
USE_I18N = True

# List of callables that know how to import templates from various sources.
TEMPLATE_LOADERS = (
    'django.template.loaders.filesystem.Loader',
    'django.template.loaders.app_directories.Loader'
)

MIDDLEWARE_CLASSES = (
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'catmaid.middleware.AnonymousAuthenticationMiddleware',
    'catmaid.middleware.AjaxExceptionMiddleware',
)

ROOT_URLCONF = 'mysite.urls'

INSTALLED_APPS = (
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.sites',
    'django.contrib.admin',
    'django.contrib.staticfiles',
    'devserver',
    'djcelery',
    'taggit',
    'adminplus',
    'catmaid',
    'vncbrowser',
    'performancetests',
    'guardian',
    'south',
    'pipeline',
)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '%(levelname)s %(asctime)s %(module)s %(process)d %(thread)d %(message)s'
        },
        'simple': {
            'format': '%(levelname)s %(message)s'
        },
    },
    'handlers': {
        'null': {
            'level': 'DEBUG',
            'class': 'django.utils.log.NullHandler',
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        }
    },
    'loggers': {
        'catmaid.frontend': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}

# Use the default template context processors. If custom ones should be
# added, please append it to the tuple to make sure the default processors
# are still available. See this page for further detail:
# http://blog.madpython.com/2010/04/07/django-context-processors-best-practice/
TEMPLATE_CONTEXT_PROCESSORS = DEFAULT_SETTINGS.TEMPLATE_CONTEXT_PROCESSORS

# The URL requests are redirected after login
LOGIN_REDIRECT_URL = '/'

# The URL where requests are redirected after login
LOGIN_URL = '/accounts/login'

AUTHENTICATION_BACKENDS = (
    'django.contrib.auth.backends.ModelBackend', # default
    'guardian.backends.ObjectPermissionBackend',
)

# User-ID of the anonymous (i.e. not-logged-in) user. This is usualld -1.
ANONYMOUS_USER_ID = -1

# Project ID of a dummy project that will keep all ontologies and
# classifications that are shared between multiple projcts (and are
# thereby project independent).
ONTOLOGY_DUMMY_PROJECT_ID = -1

SOUTH_DATABASE_ADAPTERS = {'default': 'south.db.postgresql_psycopg2'}

# The current site in the django_site database table. This is used so that
# applications can hook into specific site(s) and a single database can manage
# content of multiple sites.
SITE_ID = 1

# Default user profile settings
PROFILE_DEFAULT_INVERSE_MOUSE_WHEEL = False
PROFILE_DISPLAY_STACK_REFERENCE_LINES = False
PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT = False
PROFILE_SHOW_TEXT_LABEL_TOOL = False
PROFILE_SHOW_TAGGING_TOOL = False
PROFILE_SHOW_CROPPING_TOOL = False
PROFILE_SHOW_SEGMENTATION_TOOL = False
PROFILE_SHOW_TRACING_TOOL = False
PROFILE_SHOW_ONTOLOGY_TOOL = False
PROFILE_SHOW_ROI_TOOL = False
PROFILE_TRACING_OVERLAY_SCREEN_SCALING = True
PROFILE_TRACING_OVERLAY_SCALE = 1
PROFILE_PREFER_WEBGL_LAYERS = False
PROFILE_USE_CURSOR_FOLLOWING_ZOOM = True

# Defines if a cropped image of a ROI should be created
# automatically when the ROI is created. If set to False
# such an image will be created when requested.
ROI_AUTO_CREATE_IMAGE = False

# The maximum number of nodes returned by a single spatial query. This
# determines the maximum number of nodes shown in the tracing overlay, so has
# severe worst-case performance implications for the database, web server, and
# client.
NODE_LIST_MAXIMUM_COUNT = 5000

# Default importer tile width and height
IMPORTER_DEFAULT_TILE_WIDTH = 256
IMPORTER_DEFAULT_TILE_HEIGHT = 256

# Some tools and widgets create files (e.g. cropping, ROIs, NeuroHDF5 and
# treenode export). These files will be created in a folder for each tool
# relative to the path defined in Django's MEDIA_ROOT variable. These are
# the default sub-folders, all of them need to be writable:
MEDIA_HDF5_SUBDIRECTORY = 'hdf5'
MEDIA_CROPPING_SUBDIRECTORY = 'cropping'
MEDIA_ROI_SUBDIRECTORY = 'roi'
MEDIA_TREENODE_SUBDIRECTORY = 'treenode_archives'

# The maximum allowed size in Bytes for generated files. The cropping tool, for
# instance, uses this to cancel a request if the generated file grows larger
# than this. This defaults to 50 Megabyte.
GENERATED_FILES_MAXIMUM_SIZE = 52428800

# Specifies if user registration is allowed
USER_REGISTRATION_ALLOWED = False

# A new user's defaul groups
NEW_USER_DEFAULT_GROUPS = []

# A sequence of modules that contain Celery tasks which we want Celery to know
# about automatically.
CELERY_IMPORTS = (
    'catmaid.control.cropping',
    'catmaid.control.roi',
    'catmaid.control.treenodeexport',
)

# We use django-pipeline to compress and reference JavaScript and CSS files. To
# make Pipeline integrate with staticfiles (and therefore collectatic calls)
# the STATICFILES_STORAGE variable has to be set to:
STATICFILES_STORAGE = 'pipeline.storage.PipelineCachedStorage'

# Adding PipelineFinder as asset discovery mechanism allows staticfiles to also
# discover files that were generated by Pipeline.
STATICFILES_FINDERS = (
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
    'pipeline.finders.CachedFileFinder',
    'pipeline.finders.PipelineFinder',
)

# Use CSSMin as django-pipeline's CSS compressor
PIPELINE_CSS_COMPRESSOR = 'pipeline.compressors.cssmin.CSSMinCompressor'
# Use no JS compresor for now
PIPELINE_JS_COMPRESSOR = None
# Don't wrap JS files into anonymous functions. Our code isn't ready for this,
# yet.
PIPELINE_DISABLE_WRAPPER = True

# Make Git based version of CATMAID available as a settings field
VERSION = utils.get_version()

# FlyTEM rendering service. To activate add the following lines to your
# settings.py file:
# MIDDLEWARE_CLASSES += ('catmaid.middleware.FlyTEMMiddleware',)
# FLYTEM_SERVICE_URL = 'http://renderer-2.int.janelia.org:8080/render-ws/v1/owner/flyTEM'
# FLYTEM_STACK_RESOLUTION = (4,4,40)
# FLYTEM_STACK_TILE_WIDTH = 512
# FLYTEM_STACK_TILE_HEIGHT = 512

# Make Django root folder available
PROJECT_ROOT = utils.relative('..', '..')
# Add all subdirectories of project, applications and lib to sys.path
for subdirectory in ('projects', 'applications', 'lib'):
    full_path = os.path.join(PROJECT_ROOT, subdirectory)
    sys.path.insert(0, full_path)

# In order to make Django work with the unmanaged models from djsopnet in tests,
# we use a custom testing runner to detect when running in a testing
# environment. The custom PostgreSQL database wrapper uses this flag to change
# its behavior.
TEST_RUNNER = 'custom_testrunner.TestSuiteRunner'

# To simplify configuration for performance test CATMAID instances, the SCM URL
# used to create commit links is defined here. The {} is used to denote the
# commit name.
PERFORMANCETEST_SCM_URL = "https://github.com/catmaid/CATMAID/commit/{version}"
