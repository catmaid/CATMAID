# -*- coding: utf-8 -*-

import re

from adminplus.sites import AdminSitePlus

from django.conf import settings
from django.conf.urls import include, url
from django.contrib import admin
from django.views.static import serve

from catmaid.control.authentication import ObtainAuthToken

from rest_framework_swagger.views import get_swagger_view


schema_view = get_swagger_view(title='CATMAID API')

# Administration
admin.site = AdminSitePlus()
admin.autodiscover()

# Customize admin site titles and header
admin.site.site_header = "CATMAID administration"
admin.site.site_title = "CATMAID site admin"
admin.site.index_title = "CATMAID instance"

# CATMAID
urlpatterns = [
    url(r'^', include('catmaid.urls')),
]

# CATMAID extensions
urlpatterns += [
    url(r'^ext/{}/'.format(extension), include('{}.urls'.format(extension)))
    for extension in settings.INSTALLED_EXTENSIONS
]

# Admin site
urlpatterns += [
    url(r'^admin/', admin.site.urls)
]

# API Documentation
urlpatterns += [
    url(r'^apis/', schema_view),
    url(r'^api-token-auth/', ObtainAuthToken.as_view()),
]

# Serve static files in debug mode and if explicitely requested
if settings.DEBUG or settings.SERVE_STATIC:
    def serve_static(prefix, root):
        return url(r'^%s(?P<path>.*)$' % re.escape(prefix), serve,
                kwargs={'document_root': root})

    urlpatterns += [
        # General static files
        serve_static('static/', settings.STATIC_ROOT),
        # Access to static extensions in debug mode, remove leading slash.
        serve_static(settings.STATIC_EXTENSION_URL[1:], settings.STATIC_EXTENSION_ROOT),
        # Media files, i.e. cropped images or exports
        serve_static(settings.MEDIA_URL.replace(settings.CATMAID_URL, ''),
            settings.MEDIA_ROOT)
    ]
