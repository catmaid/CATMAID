# -*- coding: utf-8 -*-

import json
from typing import Union

from django.http import HttpRequest, HttpResponse, JsonResponse
from guardian.utils import get_anonymous_user


def reviewer_whitelist(request:HttpRequest, project_id=None) -> Union[HttpResponse, JsonResponse]: # ignores its second (optional) parameter
    """This is currently only a stub.
    """
    # Ignore anonymous user
    if request.user == get_anonymous_user() or not request.user.is_authenticated:
        return HttpResponse(json.dumps({'success': "The reviewer whitelist " +
                "of  the anonymous user won't be updated"}),
                content_type='application/json')

    if request.method == 'GET':
        return HttpResponse(json.dumps([]), content_type='application/json')
    else:
        return JsonResponse({
            'success': 'Updating the review whitelist is not ' +
                       'supported for DVID stacks at this time'
        })
