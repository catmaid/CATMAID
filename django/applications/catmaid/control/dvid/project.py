# -*- coding: utf-8 -*-

import json
from django.conf import settings
from django.http import HttpRequest, JsonResponse
from catmaid.control.dvid.models import DVIDProjectStacks


def projects(request:HttpRequest) -> JsonResponse:
    """ Returns a list of project objects that are visible for the requesting
    user and that have at least one stack linked to it.
    """
    project_stacks = DVIDProjectStacks()

    projects = []
    for pid in project_stacks.data:
        p = project_stacks.data[pid]
        dvid_project = {
            'id': p['Root'],
            'title': p['Alias'],
            'comment': p['Description'],
            'stacks': [],
            'stackgroups': []

        }

        for sid in p['DataInstances']:
            s = p['DataInstances'][sid]

            # Only allow image tile instances
            if s['Base']['TypeName'] != 'imagetile':
                continue

            dvid_project['stacks'].append({
                'id': sid,
                'title': sid,
                'comment': ''
            })

        if dvid_project['action'] or settings.DVID_SHOW_NONDISPLAYABLE_REPOS:
            projects.append(dvid_project)

    return JsonResponse(projects, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 2
    })
