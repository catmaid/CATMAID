import json

from django.http import HttpResponse
from django.conf import settings


class AjaxExceptionMiddleware(object):

    def process_exception(self, request, exception):
        response = {'error': str(exception)}
        if settings.DEBUG:
            import sys, traceback
            (exc_type, exc_info, tb) = sys.exc_info()
            response['type'] = exc_type.__name__
            response['info'] = str(exc_info)
            response['traceback'] = ''.join(traceback.format_tb(tb))
        return HttpResponse(json.dumps(response))
