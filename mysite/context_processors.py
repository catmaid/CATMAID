import sys

# See: http://www.b-list.org/weblog/2006/jun/14/django-tips-template-context-processors/

def staticfiles(request):
    from django.conf import settings
    return { 'static': settings.STATICFILES_URL }
