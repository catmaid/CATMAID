import json
import re
import os
import cProfile

from django.http import HttpResponse
from django.contrib.auth.models import User
from django.conf import settings
from traceback import format_exc
from datetime import datetime

class AnonymousAuthenticationMiddleware(object):
    """ This middleware class tests whether the current user is the
    anonymous user. If so, it replaces the request.user object with
    Guardian's anonymous user and monkey patchs it to behave like
    Django's anonymou user.
    """
    def process_request(self, request):
        if request.user.is_anonymous() and settings.ANONYMOUS_USER_ID:
            request.user = User.objects.get(id=settings.ANONYMOUS_USER_ID)
            request.user.is_anonymous = lambda: False
            request.user.is_authenticated = lambda: False
        return None

class AjaxExceptionMiddleware(object):

    def process_exception(self, request, exception):
        response = {
            'error': str(exception),
            'detail': format_exc(),
        }
        if settings.DEBUG:
            import sys, traceback
            (exc_type, exc_info, tb) = sys.exc_info()
            response['type'] = exc_type.__name__
            response['info'] = str(exc_info)
            response['traceback'] = ''.join(traceback.format_tb(tb))
        return HttpResponse(json.dumps(response))

class FlyTEMMiddleware(object):

    stack_info_pattern = re.compile(r'^/.+/stack/.+/info$')
    stacks_pattern = re.compile(r'/.+/stacks')

    def process_request(self, request):
        new_path = (request.path == '/projects') or \
                    self.stack_info_pattern.search(request.path) or \
                    self.stacks_pattern.search(request.path)

        if new_path:
            request.path_info = '/flytem' + request.path_info
            request.path = '/flytem' + request.path


class ProfilingMiddleware(object):
    """This middleware will create a cProfile log file for a view request if
    'profile' is part of the request URL, which can be done by simply attaching
    '?profile' to a regular view URL. The output is written to a file in /tmp,
    with a name following the pattern 'catmaid-hostaddress-timestamp.profile'.
    """

    def process_request(self, request):
        if 'profile' in request.REQUEST:
            request.profiler = cProfile.Profile()
            request.profiler.enable()

    def process_response(self, request, response):
        if hasattr(request, 'profiler'):
            request.profiler.disable()
            labels = (request.META['REMOTE_ADDR'], datetime.now())
            request.profiler.dump_stats('/tmp/catmaid-%s-%s.profile' % labels)
        return response
