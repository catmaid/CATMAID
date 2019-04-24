# -*- coding: utf-8 -*-

from django.http import HttpRequest, JsonResponse
from catmaid.control.janelia_render.models import JaneliaRenderProjectStacks

def projects(request:HttpRequest) -> JsonResponse:
    """ Returns a list of project objects that are visible for the requesting
    user and that have at least one stack linked to it.
    """

    render_projects = JaneliaRenderProjectStacks().get_all_projects()

    catmaid_projects = {}
    for project in render_projects:
        p = {
            'id': project.id,
            'title': project.title,
            'tags': [ project.owner_name ],
            'stacks': [],
            'stackgroups': []
        }
        catmaid_projects[project.id] = p

        for stack_json in project.get_stacks_json():
            stack_name = stack_json['stackId']['stack']
            p['stacks'].append({
                'id': stack_name,
                'title': stack_name,
                'comment': ''
            })

    response = [v for k,v in catmaid_projects.items()]

    return JsonResponse(response, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 2
    })
