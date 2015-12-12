import json
from django.http import HttpResponse
from catmaid.control.flytem.models import FlyTEMProjectStacks


def projects(request):
    """ Returns a list of project objects that are visible for the requesting
    user and that have at least one stack linked to it.
    """
    project_stacks = FlyTEMProjectStacks()

    projects = {}
    for ps in project_stacks.data:
        pid = ps['project']
        p = projects.get(pid)
        if not p:
            p = {
                'id': pid,
                'title': ps['project'],
                'comment': '<p>Owner: %s</p>' % ps['owner'],
                'stacks': [],
                'stackgroups': []
            }
            projects[pid] = p

        p['stacks'].append({
            'id': ps['stack'],
            'title': ps['stack'],
            'comment': ''
        })

    response = [v for k,v in projects.items()]

    return HttpResponse(json.dumps(response, sort_keys=True, indent=2),
                        content_type="application/json")
