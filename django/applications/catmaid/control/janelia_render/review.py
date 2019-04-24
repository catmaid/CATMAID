# -*- coding: utf-8 -*-

import json
from django.http import HttpRequest, JsonResponse

from guardian.utils import get_anonymous_user


def reviewer_whitelist(request:HttpRequest, project_id=None) -> JsonResponse:
    """This is currently only a stub.
    """
    # Ignore anonymous user
    if request.user == get_anonymous_user() or not request.user.is_authenticated:
        return JsonResponse({
            'success': "The reviewer whitelist of the anonymous user won't be updated"
        })

    if request.method == 'GET':
        return JsonResponse([], safe=False)
    else:
        return JsonResponse({
            'success': 'Updating the review whitelist is not ' +
                       'supported for Janelia Render stacks at this time'
        })
