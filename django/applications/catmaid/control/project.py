import json
import yaml

from guardian.shortcuts import get_objects_for_user

from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404

from catmaid.models import UserRole, Class, Project, Relation, StackGroup
from catmaid.control.authentication import requires_user_role

from rest_framework.decorators import api_view


# All classes needed by the tracing system alongside their
# descriptions.
needed_classes = {
    'stackgroup': "An identifier for a group of stacks",
    'annotation': "An arbitrary annotation",
}

# All relations needed by the tracing system alongside their
# descriptions.
needed_relations = {
    'has_channel': "A stack group can have assosiated channels",
    'has_view': "A stack group can have assosiated orthogonal views",
    'is_a': "A generic is-a relationship",
    'part_of': "One thing is part of something else.",
    'annotated_with': "Something is annotated by something else.",
}


def validate_project_setup(project_id, user_id, fix=False,
        class_model=None, rel_model=None):
    """Will check if needed classes and relations exist for every project. If
    <fix> is truthy, missing objects will be added.
    """
    missing_classes = []
    missing_relations = []

    class_model = class_model or Class
    rel_model = rel_model or Relation

    for nc, desc in needed_classes.iteritems():
        try:
            class_model.objects.get(project_id=project_id, class_name=nc)
        except class_model.DoesNotExist:
            missing_classes.append(nc)
            if fix:
                class_model.objects.create(project_id=project_id,
                        class_name=nc, user_id=user_id)

    for nr, desc in needed_relations.iteritems():
        try:
            rel_model.objects.get(project_id=project_id, relation_name=nr)
        except rel_model.DoesNotExist:
            missing_relations.append(nr)
            if fix:
                rel_model.objects.get_or_create(project_id=project_id,
                        relation_name=nr, user_id=user_id)

    return missing_classes, missing_relations


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

def get_project_qs_for_user(user):
    """ Returns the query set of projects that are administrable and
    browsable by the given user.
    """
    perms=['can_administer', 'can_annotate', 'can_browse']
    return get_objects_for_user(user, perms, Project, any_perm=True,
                                 accept_global_perms=False)

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
    projects = get_project_qs_for_user(request.user).order_by('title')

    if 0 == len(projects):
        return JsonResponse([], safe=False)

    cursor = connection.cursor()
    project_template = ",".join(("(%s)",) * len(projects)) or "()"
    user_project_ids = [p.id for p in projects]

    cursor.execute("""
        SELECT ps.project_id, ps.stack_id, s.title, s.comment FROM project_stack ps
        INNER JOIN (VALUES {}) user_project(id)
        ON ps.project_id = user_project.id
        INNER JOIN stack s
        ON ps.stack_id = s.id
    """.format(project_template), user_project_ids)
    project_stack_mapping = dict()
    for row in cursor.fetchall():
        stacks = project_stack_mapping.get(row[0])
        if not stacks:
            stacks = []
            project_stack_mapping[row[0]] = stacks
        stacks.append({
            'id': row[1],
            'title': row[2],
            'comment': row[3]
        })

    # Get all stack groups for this project
    project_stack_groups = {}
    cursor.execute("""
        SELECT ci.project_id, ci.id, ci.name
        FROM class_instance ci
        INNER JOIN (VALUES {}) user_project(id)
        ON ci.project_id = user_project.id
        INNER JOIN class c
        ON ci.class_id = c.id
        WHERE c.class_name = 'stackgroup'
    """.format(project_template), user_project_ids)
    for row in cursor.fetchall():
        groups = project_stack_groups.get(row[0])
        if not groups:
            groups = []
            project_stack_groups[row[0]] = groups
        groups.append({
            'id': row[1],
            'title': row[2],
            'comment': '',
        })

    result = []
    empty_tuple = tuple()
    for p in projects:
        stacks = project_stack_mapping.get(p.id, empty_tuple)
        stackgroups = project_stack_groups.get(p.id, empty_tuple)

        result.append({
            'id': p.id,
            'title': p.title,
            'stacks': stacks,
            'stackgroups': stackgroups
        })

    return HttpResponse(json.dumps(result, sort_keys=True, indent=4),
            content_type="application/json")

@api_view(['GET'])
def export_projects(request):
    """Detailed list of projects visible to the requesting user.
    """

    # Get all projects that are visisble for the current user
    projects = get_project_qs_for_user(request.user).order_by('title')

    if 0 == len(projects):
        return JsonResponse([], safe=False)

    cursor = connection.cursor()
    project_template = ",".join(("(%s)",) * len(projects)) or "()"
    user_project_ids = [p.id for p in projects]

    cursor.execute("""
        SELECT ps.project_id, ps.stack_id, s.title, s.image_base, s.metadata,
        s.dimension, s.resolution, s.num_zoom_levels, s.file_extension, s.tile_width,
        s.tile_height, s.tile_source_type, s.comment FROM project_stack ps
        INNER JOIN (VALUES {}) user_project(id)
        ON ps.project_id = user_project.id
        INNER JOIN stack s
        ON ps.stack_id = s.id
    """.format(project_template), user_project_ids)
    visible_stacks = dict()
    project_stack_mapping = dict()

    for row in cursor.fetchall():
        stacks = project_stack_mapping.get(row[0])
        if not stacks:
            stacks = []
            project_stack_mapping[row[0]] = stacks
        stack = {
            'id': row[1],
            'name': row[2],
            'url': row[3],
            'metadata': row[4],
            'dimension': row[5],
            'resolution': row[6],
            'zoomlevels': row[7],
            'fileextension': row[8],
            'tile_width': row[9],
            'tile_height': row[10],
            'tile_source_type': row[11],
            'comment': row[3]
        }
        stacks.append(stack)
        visible_stacks[row[1]] = stack

    # Add overlay information
    stack_template = ",".join(("(%s)",) * len(visible_stacks)) or "()"
    cursor.execute("""
        SELECT stack_id, o.id, title, image_base, default_opacity, file_extension,
        tile_width, tile_height, tile_source_type
        FROM overlay o
        INNER JOIN (VALUES {}) visible_stack(id)
        ON o.stack_id = visible_stack.id
    """.format(stack_template), visible_stacks.keys())
    stack_overlay_mapping = dict()
    for row in cursor.fetchall():
        stack = visible_stacks.get(row[0])
        if not stack:
            raise ValueError("Couldn't find stack {} for overlay {}".format(row[0], row[1]))
        overlays = stack.get('overlays')
        if not overlays:
            overlays = []
            stack['overlays'] = overlays
        overlays.append({
            'id': row[1],
            'name': row[2],
            'url': row[3],
            'defaultopacity': row[4],
            'fileextension': row[5],
            'tile_width': row[6],
            'tile_height': row[7],
            'tile_source_type': row[8]
        })

    # Add stack group information to stacks
    project_stack_groups = {}
    cursor.execute("""
        SELECT sci.class_instance_id, ci.project_id, ci.name,
               array_agg(sci.stack_id), array_agg(r.relation_name)
        FROM class_instance ci
        INNER JOIN (VALUES (24)) user_project(id)
        ON ci.project_id = user_project.id
        INNER JOIN class c
        ON ci.class_id = c.id
        INNER JOIN stack_class_instance sci
        ON ci.id = sci.class_instance_id
        INNER JOIN relation r
        ON sci.relation_id = r.id
        WHERE c.class_name = 'stackgroup'
        GROUP BY sci.class_instance_id, ci.project_id, ci.name;
    """.format(project_template), user_project_ids)
    for row in cursor.fetchall():
        groups = project_stack_groups.get(row[1])
        if not groups:
            groups = []
            project_stack_groups[row[1]] = groups
        groups.append({
            'id': row[0],
            'name': row[2],
            'comment': '',
        })
        # Add to stacks
        for stack_id, relation_name in zip(row[3], row[4]):
            stack = visible_stacks.get(stack_id)
            if not stack:
                # Only add visible stacks
                continue
            stack_groups = stack.get('stackgroups')
            if not stack_groups:
                stack_groups = []
                stack['stackgroups'] = stack_groups
            stack_groups.append({
                'id': row[0],
                'name': row[2],
                'relation': relation_name
            })

    result = []
    empty_tuple = tuple()
    for p in projects:
        stacks = project_stack_mapping.get(p.id, empty_tuple)
        stackgroups = project_stack_groups.get(p.id, empty_tuple)

        result.append({
            'project': {
                'id': p.id,
                'name': p.title,
                'stacks': stacks,
            }
        })

    return_content_type = request.META.get('HTTP_ACCEPT', 'application/yaml')
    if 'application/yaml' in return_content_type:
        # YAML return format matches information files discussed in
        # documentation: http://www.catmaid.org/en/stable/importing_data.html
        return HttpResponse(yaml.dump(result),
                content_type="application/yaml")
    else:
        return HttpResponse(json.dumps(result, sort_keys=True, indent=4),
                content_type="application/json")
