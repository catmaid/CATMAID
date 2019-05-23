# -*- coding: utf-8 -*-

from collections import defaultdict
import json
import re
from typing import Any, DefaultDict, Dict, List, Set

from django.conf import settings
from django.db.models import Count
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.template import loader
from django.contrib.contenttypes.models import ContentType

from taggit.models import TaggedItem

from catmaid.control.common import makeJSON_legacy_list
from catmaid.control.project import get_project_qs_for_user
from catmaid.models import (Class, DataView, DataViewType, Project, Stack,
        ProjectStack, StackGroup, StackStackGroup)

class ExProject:
    """ A wrapper around the Project model to include additional
    properties.
    """
    def __init__(self, project, is_catalogueable):
        self.project = project
        self.is_catalogueable = is_catalogueable

    def __getattr__(self, attr):
        """ Return own property when available, otherwise proxy
        to project.
        """
        if attr in self.__dict__:
            return getattr(self,attr)
        return getattr(self.project, attr)

def add_catalogue_info(user, projects) -> List:
    """ Adds the is_catalogueable property to all projects passed.
        XXX Does not use its user parameter
    """
    # Find all the projects that are catalogueable:
    catalogueable_projects = set(x.project.id for x in \
        Class.objects.filter(class_name='driver_line').select_related('project'))

    result = []
    for p in projects:
        ex_p = ExProject(p, id in catalogueable_projects)
        result.append(ex_p)

    return result

def get_data_view_type_comment(request:HttpRequest) -> JsonResponse:
    """ Return the comment of a specific data view type.
    """
    requested_id = request.GET["data_view_type_id"]
    if requested_id == "":
        text = "Please select a valid data view type."
    else:
        try:
            data_view_type_id = int(requested_id)
            text = DataViewType.objects.get(pk=data_view_type_id).comment
        except:
            text = "Sorry, the configuration help text couldn't be retrieved."
    result = { 'comment':text }
    return JsonResponse(result)

def dataview_to_dict(dataview) -> Dict:
    """ Creates a dictionary of the dataviews' properties.
    """
    return {
        'id': dataview.id,
        'title': dataview.title,
        'type': dataview.data_view_type.code_type,
        'config': dataview.config,
        'note': dataview.comment
    }

def get_data_view_type(request:HttpRequest, data_view_id) -> JsonResponse:
    """ Returns the type of a particular data view.
    """
    dv = get_object_or_404(DataView, pk=data_view_id)
    code_type = dv.data_view_type.code_type

    return JsonResponse({'type': code_type})

def get_available_data_views(request:HttpRequest) -> JsonResponse:
    """ Returns a list of all available data views.
    """
    all_views = DataView.objects.order_by("position")
    dataviews = map(dataview_to_dict, all_views)

    return JsonResponse(makeJSON_legacy_list(dataviews), safe=False)

def get_default_properties(request:HttpRequest) -> JsonResponse:
    """ Return the properies of the default data view. If no data view is
    configured as default, the one with the lowest ID will be returned.
    """
    default_views = DataView.objects.filter(is_default=True)
    if len(default_views) > 0:
        result = dataview_to_dict(default_views[0])
    else:
        all_views = DataView.objects.all().order_by('id')
        if all_views.count() > 0:
            result = dataview_to_dict(all_views[0])
        else:
            result = {}

    return JsonResponse(result)

def get_detail(request:HttpRequest, data_view_id) -> JsonResponse:
    """Get details on a particular data view.
    """
    default = DataView.objects.get(id=data_view_id)
    default = dataview_to_dict(default)

    return JsonResponse(default)

def get_default_data_view(request:HttpRequest) -> HttpResponse:
    """ Return the data view that is marked as the default. If there
    is more than one view marked as default, the first one is returned.
    """
    default = DataView.objects.filter(is_default=True)[0]

    return get_data_view(request, default.id)

def natural_sort(l:List, field) -> List:
    """ Natural sorting of a list wrt. to its 'title' attribute.
    Based on: http://stackoverflow.com/questions/4836710
    """
    convert = lambda text: int(text) if text.isdigit() else text.lower()
    alphanum_key = lambda key: [ convert(c) for c in re.split('([0-9]+)', getattr(key, field)) ]
    return sorted(l, key = alphanum_key)

def get_data_view(request:HttpRequest, data_view_id) -> HttpResponse:
    """ Returns a rendered template for the given view.
    """
    # Load the template
    dv = get_object_or_404(DataView, pk=data_view_id)
    code_type = dv.data_view_type.code_type
    template = loader.get_template( "catmaid/" + code_type + ".html" )
    # Get project information and pass all to the template context
    config = json.loads( dv.config )

    # Get all the projects that are visible for the current user
    projects = get_project_qs_for_user(request.user)

    # If requested, filter projects by tags. Otherwise, get all.
    if "filter_tags" in config:
        filter_tags = config["filter_tags"]
        # Only get projects that have all the filter tags set
        # TODO: Improve performande by not using an IN query (but a temp table
        # join) over all filter_tags.
        projects = projects.filter( tags__name__in=filter_tags ).annotate(
            repeat_count=Count("id") ).filter( repeat_count=len(filter_tags) )

    show_stacks = config.get('show_stacks', True)
    show_stackgroups = config.get('show_stackgroups', True)
    show_mirrors = config.get('show_mirrors', True)

    # Make sure we get all needed stacks in the first query
    if show_stacks or show_stackgroups:
        projects = projects.prefetch_related('stacks')

    # Build a stack index
    stack_index = defaultdict(list) # type: DefaultDict[Any, List]
    stacks_of = defaultdict(list) # type: DefaultDict[Any, List]
    stack_set_of = defaultdict(set) # type: DefaultDict[Any, Set]
    projects_of_stack = defaultdict(set) # type: DefaultDict[Any, Set]

    if show_stacks or show_stackgroups:
        for p in projects:
            stacks = p.stacks.all()
            if show_mirrors:
                stacks = stacks.prefetch_related('stackmirror_set')
            for s in stacks:
                stack_index[s.id] = s
                stacks_of[p.id].append(s)
                if show_stackgroups:
                    stack_set_of[p.id].add(s.id)
                    projects_of_stack[s.id].add(p.id)

    # Build a stack group index, if stack groups should be made available
    stackgroup_index = {}
    stackgroups_of = defaultdict(list) # type: DefaultDict[Any, List]
    if show_stackgroups:
        stackgroup_links = StackStackGroup.objects.all().prefetch_related('stack', 'stack_group')
        stackgroup_members = defaultdict(set) # type: DefaultDict[Any, Set]
        for sgl in stackgroup_links:
            stackgroup_index[sgl.stack_group_id] = sgl.stack_group
            stackgroup_members[sgl.stack_group_id].add(sgl.stack.id)
        for sg, members in stackgroup_members.items():
            # Only accept stack groups of which all member stacks are linked to
            # the same project.
            member_project_ids = set() # type: Set
            project_member_ids = defaultdict(set) # type: DefaultDict[Any, Set]
            for m in members:
                project_ids = projects_of_stack.get(m, [])
                member_project_ids.update(project_ids)
                for pid in project_ids:
                    project_member_ids[pid].add(m)
            # Find projects where all stacks are linked to
            for p in member_project_ids:
                project_members = project_member_ids[p]
                # If the stack group members in this project are all stack group
                # members, this stack group is available to the project
                if not members.difference(project_members):
                    stackgroups_of[p].append(stackgroup_index[sg])

    # Extend the project list with catalogue information
    if 'catalogue_link' in config:
        projects = add_catalogue_info( request.user, projects )

    # Sort by default
    if "sort" not in config or config["sort"] is True:
        projects = natural_sort( projects, "title" )

    # Build project index
    project_index = dict([(p.id, p) for p in projects])
    project_ids = set(project_index.keys())

    # Build tag index
    ct = ContentType.objects.get_for_model(Project)
    tag_links = TaggedItem.objects.filter(content_type=ct) \
        .values_list('object_id', 'tag__name')
    tag_index = defaultdict(set) # type: DefaultDict[Any, Set]
    for pid, t in tag_links:
        if pid in project_ids:
            tag_index[t].add(pid)

    context = {
        'data_view': dv,
        'projects': projects,
        'config': config,
        'settings': settings,
        'tag_index': tag_index,
        'project_index': project_index,
        'stack_index': stack_index,
        'stacks_of': stacks_of,
        'stackgroup_index': stackgroup_index,
        'stackgroups_of': stackgroups_of,
        'STATIC_URL': settings.STATIC_URL,
    }

    return HttpResponse(template.render(context))
