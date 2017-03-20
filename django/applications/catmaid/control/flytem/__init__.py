# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.http import JsonResponse


def list_annotations(request, project_id=None):
    return JsonResponse({'annotations': []})


def datastore_settings(request, name):
    return JsonResponse([], safe=False)
