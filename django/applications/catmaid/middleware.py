# -*- coding: utf-8 -*-

import re
import cProfile, pstats
import logging

from traceback import format_exc
from datetime import datetime

from django.http import JsonResponse
from django.conf import settings

from guardian.utils import get_anonymous_user

from rest_framework.authentication import TokenAuthentication

from io import StringIO


logger = logging.getLogger(__name__)

class AuthenticationHeaderExtensionMiddleware(object):
    """
    CATMAID uses the `X-Authorization` HTTP header rather than `Authorization`
    to prevent conflicts with, e.g., HTTP server basic authentication.

    Have Django overwrite the `Authorization` header with the `X-Authorization`
    header, if present, so that other middlewares can work normally.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        auth = request.META.get('HTTP_X_AUTHORIZATION', b'')
        if auth:
            request.META['HTTP_AUTHORIZATION'] = auth
        return self.get_response(request)


class CsrfBypassTokenAuthenticationMiddleware(object):
    """
    Authenticate a user using a HTTP_AUTHORIZATION header token provided by
    Django Rest Framework's authtoken. If successful, set a protected request
    property to make Django's CSRF view middleware not enforce the presence
    of a CSRF header.

    This is necessary to have DRF's token authentication work both with its
    API views and normal Django views.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            token_auth = TokenAuthentication().authenticate(request)
            if token_auth:
                request.user = token_auth[0]
                request.auth = token_auth[1]
                request._dont_enforce_csrf_checks = True
                request._is_token_authenticated = True
        except:
            pass

        return self.get_response(request)


class AnonymousAuthenticationMiddleware(object):
    """ This middleware class tests whether the current user is the
    anonymous user. If so, it replaces the request.user object with
    Guardian's anonymous user and monkey patchs it to behave like
    Django's anonymou user.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_anonymous:
            request.user = get_anonymous_user()
        return self.get_response(request)


class AjaxExceptionMiddleware(object):
    """Catch exceptions and wrap it in a JSON response.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        response = {
            'error': str(exception),
            'detail': format_exc(),
            'type': type(exception).__name__,
            'meta': getattr(exception, 'meta', None),
        }
        if settings.DEBUG:
            import sys, traceback
            (exc_type, exc_info, tb) = sys.exc_info()
            response['info'] = str(exc_info)
            response['traceback'] = ''.join(traceback.format_tb(tb))
        return JsonResponse(response)


class BasicModelMapMiddleware(object):
    """Redirect requests to stacks and projects to alternative models that will
    fetch information from other sources. If the url_prefix field is set, it is
    prepended to request URLs.
    """

    url_prefix = ''
    stack_info_pattern = re.compile(r'^/.+/stack/.+/info$')
    stacks_pattern = re.compile(r'/.+/stacks')
    datastores_pattern = re.compile(r'/client/datastores/.*/')
    annotations_patterns = re.compile(r'/.+/annotations/')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        new_path = (request.path == '/projects/') or \
                    self.stack_info_pattern.search(request.path) or \
                    self.stacks_pattern.search(request.path) or \
                    self.datastores_pattern.search(request.path) or \
                    self.annotations_patterns.search(request.path)


        if new_path:
            request.path_info = self.url_prefix + request.path_info
            request.path = self.url_prefix + request.path

        return self.get_response(request)


class JaneliaRenderMiddleware(BasicModelMapMiddleware):
    """Let this middleware redirect requests for stacks and projects to
    Janelia render web service models.
    """

    url_prefix = '/janelia-render'


class DVIDMiddleware(BasicModelMapMiddleware):
    """Let this middleware redirect requests for stacks and projects to a DVID
    instance.
    """

    url_prefix = '/dvid'


class ProfilingMiddleware(object):
    """This middleware will create a cProfile log file for a view request if
    'profile' is part of the request URL, which can be done by simply attaching
    '?profile' to a regular view URL. Returned is a JsonResponse object,
    containing the original data and the profile. Optionally, if the request has
    a field called 'profile-to-disk', the profile is saved to a file in /tmp,
    with a name following the pattern 'catmaid-hostaddress-timestamp.profile'.
    """

    def __init__(self, get_response):
        self.get_response = get_response

        # This middleware conflicts with expected unit test results. Warn about
        # this if this is executed in test mode.
        if getattr(settings, 'TESTING_ENVIRONMENT', False):
            logger.warning("The ProfilingMiddleware is used during testing. "
                    "This will result in boken tests, because of unexpected "
                    "response content.")

    def __call__(self, request):
        profile = 'profile' in request.GET or 'profile' in request.POST

        no_content = False
        if profile:
            no_content = 'profile-no-content' in request.GET or \
                    'profile-no-content' in request.POST
            request.profiler = cProfile.Profile()
            request.profiler.enable()

        response = self.get_response(request)

        if profile:
            request.profiler.disable()
            s = StringIO()
            sortby = getattr(request, 'profile-sorting', 'cumulative')
            ps = pstats.Stats(request.profiler, stream=s).sort_stats(sortby)
            ps.print_stats()
            data = {
                'profile': s.getvalue()
            }
            if not no_content:
                data['content'] = response.content

            response = JsonResponse(data)

            if hasattr(request, 'profile-to-disk'):
                labels = (request.META['REMOTE_ADDR'], datetime.now())
                request.profiler.dump_stats('/tmp/catmaid-%s-%s.profile' % labels)

        return response


class NewRelicMiddleware(object):
    """This middleware will log additional properties to New Relic and expects
    the newrelic python module to be installed.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        # Import this locally, so that we don't clutter general imports and require
        # it only when it is used.
        self.newrelic = __import__('newrelic.agent')

    def __call__(self, request):
        exec_ctx = request.META.get('HTTP_X_CATMAID_EXECUTION_CONTEXT', b'')
        if not exec_ctx:
            exec_ctx = 'unknown'
        self.newrelic.agent.add_custom_parameter('execution_context', exec_ctx)

        return self.get_response(request)
