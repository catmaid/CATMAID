from django.http import JsonResponse


def list_annotations(request, project_id=None):
    return JsonResponse({'annotations': []})


def datastore_settings(request, name):
    return JsonResponse([], safe=False)
