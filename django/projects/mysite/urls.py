from django.conf.urls import patterns, include, url
from django.conf import settings

from catmaid.views import *

import catmaid
import vncbrowser

# Uncomment the next two lines to enable the admin:
from django.contrib import admin
from adminplus.sites import AdminSitePlus
admin.site = AdminSitePlus()
admin.autodiscover()

# CATMAID
urlpatterns = patterns('',
    url(r'^', include('catmaid.urls')),
)

# Neuron Catalog
urlpatterns += patterns('',
    url(r'^vncbrowser/', include('vncbrowser.urls')),
)

# Admin site
urlpatterns += patterns('',
    url(r'^admin/', include(admin.site.urls))
)

if settings.DEBUG:
    urlpatterns += patterns('',
        (r'^static/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.STATIC_ROOT}),
        (r'^%s(?P<path>.*)$' % settings.MEDIA_URL.replace(settings.CATMAID_URL, ''),
            'django.views.static.serve', {'document_root': settings.MEDIA_ROOT}),
    )
