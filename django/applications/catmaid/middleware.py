import json
import re
import cProfile
from traceback import format_exc
from datetime import datetime

from django.http import HttpResponse
from django.contrib.auth.models import User
from django.conf import settings

from rest_framework.authentication import TokenAuthentication


class AuthenticationHeaderExtensionMiddleware(object):
    """
    CATMAID uses the `X-Authorization` HTTP header rather than `Authorization`
    to prevent conflicts with, e.g., HTTP server basic authentication.

    Have Django overwrite the `Authorization` header with the `X-Authorization`
    header, if present, so that other middlewares can work normally.
    """
    def process_request(self, request):
        auth = request.META.get('HTTP_X_AUTHORIZATION', b'')
        if auth:
            request.META['HTTP_AUTHORIZATION'] = auth

class CsrfBypassTokenAuthenticationMiddleware(object):
    """
    Authenticate a user using a HTTP_AUTHORIZATION header token provided by
    Django Rest Framework's authtoken. If successful, set a protected request
    property to make Django's CSRF view middleware not enforce the presence
    of a CSRF header.

    This is necessary to have DRF's token authentication work both with its
    API views and normal Django views.
    """
    def process_request(self, request):
        try:
            token_auth = TokenAuthentication().authenticate(request)
            if token_auth:
                request.user = token_auth[0]
                request.auth = token_auth[1]
                request._dont_enforce_csrf_checks = True
        except:
            pass


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


class BasicModelMapMiddleware(object):
    """Redirect requests to stacks and projects to alternative models that will
    fetch information from other sources. If the url_prefix field is set, it is
    prepended to request URLs.
    """

    url_prefix = ''
    stack_info_pattern = re.compile(r'^/.+/stack/.+/info$')
    stacks_pattern = re.compile(r'/.+/stacks')

    def process_request(self, request):
        new_path = (request.path == '/projects/') or \
                    self.stack_info_pattern.search(request.path) or \
                    self.stacks_pattern.search(request.path)

        if new_path:
            request.path_info = self.url_prefix + request.path_info
            request.path = self.url_prefix + request.path


class FlyTEMMiddleware(BasicModelMapMiddleware):
    """Let this middleware redirect requests for stacks and projects to FlyTEM
    render service models.
    """

    url_prefix = '/flytem'


class DVIDMiddleware(BasicModelMapMiddleware):
    url_prefix = '/dvid'


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
