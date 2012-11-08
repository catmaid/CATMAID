import json

from collections import defaultdict
from django.contrib import auth
from django.db import transaction, connection
from django.http import HttpResponse

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

from guardian.shortcuts import get_objects_for_user

def projects(request):
    # This is somewhat ridiculous - four queries where one could be
    # used in raw SQL.  The problem here is chiefly that
    # 'select_related' in Django doesn't work through
    # ManyToManyFields.  Development versions of Django have
    # introduced prefetch_related, but this isn't in the stable
    # version that I'm using.  (Another way around this would be to
    # query on ProjectStack, but the legacy CATMAID schema doesn't
    # include a single-column primary key for that table.)

    stacks = dict((x.id, x) for x in Stack.objects.all())

    # Create a dictionary that maps from projects to stacks:
    c = connection.cursor() #@UndefinedVariable
    c.execute("SELECT project_id, stack_id FROM project_stack")
    project_to_stacks = defaultdict(list)
    for project_id, stack_id in c.fetchall():
        project_to_stacks[project_id].append(stacks[stack_id])

    # Find all the projects, and mark those that are editable from the
    # project_user table:
    if request.user.is_authenticated():
        projects = Project.objects.all().order_by('title')

        # Create sets of projects that are administrable and annotatable
        # by the current user and unify them to one set. This will only
        # work for authenticated users (i.e. not AnonymousUser)
        user = auth.get_user(request)
        administrable_projects = set(get_objects_for_user(user, 'can_administer', Project))
        annotatable_projects = set(get_objects_for_user(user, 'can_annotate', Project))
        administrable_projects.union(annotatable_projects)
        # Just for readability, have another reference to the union
        editable_projects = administrable_projects
    else:
        projects = Project.objects.filter(public=True).order_by('title')

        # An anonymous user has no editing permissions
        editable_projects = []

    # Find all the projects that are editable:
    catalogueable_projects = set(x.project.id for x in Class.objects.filter(class_name='driver_line').select_related('project'))

    # Create a dictionary with those results that we can output as JSON:
    result = []
    for p in projects:
        if p.id not in project_to_stacks:
            continue
        stacks_dict = {}
        for s in project_to_stacks[p.id]:
            stacks_dict[s.id] = {
                'title': s.title,
                'comment': s.comment,
                'note': '',
                'action': 'javascript:openProjectStack(%d,%d)' % (p.id, s.id)}
        editable = request.user.is_superuser or p in editable_projects
        result.append( {
            'pid': p.id,
            'title': p.title,
            'public_project': int(p.public),
            'editable': int(editable),
            'catalogue': int(p.id in catalogueable_projects),
            'note': '[ editable ]' if editable else '',
            'action': stacks_dict} )
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), mimetype="text/json")

