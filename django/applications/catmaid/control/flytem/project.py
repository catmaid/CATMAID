import json
import urllib2
from django.http import HttpResponse
from django.conf import settings

def projects(request):
    """ Returns a list of project objects that are visible for the requesting
    user and that have at least one stack linked to it.
    """
    # Request JSON from 
    try:
        project_stacks_json = urllib2.urlopen(settings.FLYTEM_PROJECT_URL)
        project_stacks_json = project_stacks_json.read()
    except urllib2.HTTPError as e:
        raise ValueError("Couldn't retrieve FlyTEM project information from %s" % settings.FLYTEM_PROJECT_URL)
    except urllib2.URLError as e:
        raise ValueError("Couldn't retrieve FlyTEM project information from %s" % settings.FLYTEM_PROJECT_URL)

    project_stacks = json.loads(project_stacks_json)

    projects = []
    for p in project_stacks:
        projects.append({
            'note': '',
            'pid': p['stack'],
            'title': '%s: %s' % (p['project'], p['stack']),
            'action': {
                p['stack'] : {
                    'action': 'javascript:openProjectStack("%s", "%s")' % (p['project'], p['stack']),
                    'comment': '<p>Owner: %s</p>' % p['owner'],
                    'note': '',
                    'title': p['stack'],
                }
            }
        })
    
    print projects
    return HttpResponse(json.dumps(projects, sort_keys=True, indent=2), content_type="text/json")

