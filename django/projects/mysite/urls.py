from django.conf.urls import patterns, include, url
from django.conf import settings

from catmaid.views import *

import catmaid

# Uncomment the next two lines to enable the admin:
from django.contrib import admin
from adminplus.sites import AdminSitePlus
admin.site = AdminSitePlus()
admin.autodiscover()

# CATMAID
urlpatterns = patterns('',
    url(r'^', include('catmaid.urls')),
)

# Admin site
urlpatterns += patterns('',
    url(r'^admin/', include(admin.site.urls))
)

if settings.DEBUG:
    urlpatterns += patterns('',
        (r'^static/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.STATIC_ROOT}),
        # Access to static estensions in debug mode, remove leading slash.
        (r'^%s(?P<path>.*)$' % settings.STATIC_EXTENSION_URL[1:],
            'django.views.static.serve', {'document_root': settings.STATIC_EXTENSION_ROOT}),
        (r'^%s(?P<path>.*)$' % settings.MEDIA_URL.replace(settings.CATMAID_URL, ''),
            'django.views.static.serve', {'document_root': settings.MEDIA_ROOT}),
    )
