# -*- coding: utf-8 -*-

from django.http import JsonResponse


def list_annotations(request, project_id=None):
    return JsonResponse({'annotations': []})


def query_annotation_targets(request, project_id=None):
    return JsonResponse({'entities': [], 'totalRecords': 0})


def datastore_settings(request, name):
    return JsonResponse([], safe=False)


def interpolatable_sections(request, project_id=None):
    return JsonResponse({
        'x': [],
        'y': [],
        'z': [],
    })

