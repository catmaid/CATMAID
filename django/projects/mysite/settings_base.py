# General Django settings for mysite project.

import django.conf.global_settings as DEFAULT_SETTINGS

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
    'django.middleware.transaction.TransactionMiddleware',
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
    'guardian',
    'south',
)

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

SOUTH_DATABASE_ADAPTERS = {'default': 'south.db.postgresql_psycopg2'}

# The current site in the django_site database table. This is used so that
# applications can hook into specific site(s) and a single database can manage
# content of multiple sites.
SITE_ID = 1
