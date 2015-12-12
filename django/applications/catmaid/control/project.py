import json

from guardian.shortcuts import get_objects_for_user

from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import UserRole, Class, Project, Relation, StackGroup
from catmaid.control.authentication import requires_user_role

from rest_framework.decorators import api_view


# All classes needed by the tracing system alongside their
# descriptions.
needed_classes = {
    'stackgroup': "An identifier for a group of stacks",
}

# All relations needed by the tracing system alongside their
# descriptions.
needed_relations = {
    'has_channel': "A stack group can have assosiated channels",
    'has_view': "A stack group can have assosiated orthogonal views",
}

def validate_project_setup(project_id, user_id):
    """Will create needed class and relations if they don't exist.
    """
    for nc, desc in needed_classes.iteritems():
        Class.objects.get_or_create(project_id=project_id,
                class_name=nc, defaults={'user_id': user_id})

    for nr, desc in needed_relations.iteritems():
        Relation.objects.get_or_create(project_id=project_id,
                relation_name=nr, defaults={'user_id': user_id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_project_tags(request, project_id=None):
    """ Return the tags associated with the project.
    """
    p = get_object_or_404(Project, pk=project_id)
    tags = [ str(t) for t in p.tags.all()]
    result = {'tags':tags}
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), content_type="application/json")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def update_project_tags(request, project_id=None, tags=None):
    """ Updates the given project with the supplied tags. All
    existing tags will be replaced.
    """
    p = get_object_or_404(Project, pk=project_id)
    # Create list of sigle stripped tags
    if tags is None:
        tags = []
    else:
        tags = tags.split(",")
        tags = [t.strip() for t in tags]

    # Add tags to the model
    p.tags.set(*tags)

    # Return an empty closing response
    return HttpResponse(json.dumps(""), content_type="application/json")

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

def extend_projects(user, projects):
    """ Adds the is_catalogueable property to all projects passed.
    """
    # Find all the projects that are catalogueable:
    catalogueable_projects = set(x.project.id for x in \
        Class.objects.filter(class_name='driver_line').select_related('project'))

    result = []
    for p in projects:
        ex_p = ExProject(p, id in catalogueable_projects)
        result.append(ex_p)

    return result

def get_project_qs_for_user(user):
    """ Returns the query set of projects that are administrable and
    browsable by the given user.
    """
    perms=['can_administer', 'can_annotate', 'can_browse']
    return get_objects_for_user(user, perms, Project, any_perm=True)

@api_view(['GET'])
def projects(request):
    """ List projects visible to the requesting user.
    ---
    models:
      project_api_stack_element:
        id: project_api_stack_element
        properties:
          id:
            type: integer
            description: Stack ID
            required: true
          title:
            type: string
            description: Stack title
            required: true
          comment:
            type: string
            description: Comment on stack
            required: true
      project_api_stackgroup_element:
        id: project_api_stackgroup_element
        properties:
          id:
            type: integer
            description: Stack group ID
            required: true
          title:
            type: string
            description: Stack group title
            required: true
          comment:
            type: string
            description: Comment on stack group
            required: true
      project_api_element:
        id: project_api_element
        properties:
          id:
            type: integer
            description: Project ID
            required: true
          title:
            type: string
            description: Project title
            required: true
          catalogue:
            type: boolean
            description: Indicates if the project has a catalogue entry
            required: true
          stacks:
            type: array
            items:
              $ref: project_api_stack_element
            required: true
          stackgroups:
            type: array
            items:
              $ref: project_api_stackgroup_element
            required: true
    type:
      projects:
        type: array
        items:
          $ref: project_api_element
        required: true
    """

    # Get all projects that are visisble for the current user
    projects = get_project_qs_for_user(request.user).order_by('title').prefetch_related('stacks')

    # Extend projects with extra catalogueable info
    projects = extend_projects(request.user, projects)

    # Get all stack groups for this project
    project_stack_groups = {}
    for group in StackGroup.objects.all():
        groups = project_stack_groups.get(group.project_id)
        if not groups:
            groups = []
            project_stack_groups[group.project_id] = groups
        groups.append(group)

    result = []
    for p in projects:
        stacks = []
        for s in p.stacks.all():
            stacks.append({
                'id': s.id,
                'title': s.title,
                'comment': s.comment,
            })

        stackgroups = []
        available_stackgroups = project_stack_groups.get(p.id)
        if available_stackgroups:
            for sg in available_stackgroups:
                stackgroups.append({
                    'id': sg.id,
                    'title': sg.name,
                    'comment': '',
                })

        result.append({
            'id': p.id,
            'title': p.title,
            'catalogue': int(p.is_catalogueable),
            'stacks': stacks,
            'stackgroups': stackgroups
        })

    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), content_type="application/json")
