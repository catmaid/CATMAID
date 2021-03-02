# -*- coding: utf-8 -*-

import json
from typing import Any, Dict, List, Optional, Tuple
import yaml
from typing import Set

from guardian.shortcuts import (assign_perm, get_objects_for_user, get_perms_for_model)

from django.db import connection
from django.db.models import Exists, OuterRef
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.models import (BrokenSlice, Class, ClientDatastore, FavoriteProject,
        InterpolatableSection, Location, Project, ProjectStack, ProjectToken,
        Relation, Stack, StackGroup, StackStackGroup, UserRole)
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_request_bool, get_request_list

from rest_framework.request import Request
from rest_framework.decorators import api_view
from rest_framework.views import APIView


# All classes needed by the tracing system alongside their
# descriptions.
needed_classes = {
    'annotation': "An arbitrary annotation",
    'stack_property': 'A property which a stack has',
    'landmark': "A particular type of location",
    "landmarkgroup": "A type of collection that groups landmarks",
    'volume': 'A region of space'
}

# All relations needed by the tracing system alongside their
# descriptions.
needed_relations = {
    'is_a': "A generic is-a relationship",
    'part_of': "One thing is part of something else.",
    'annotated_with': "Something is annotated by something else.",
    'has_property': 'A thing which has an arbitrary property',
    'close_to': 'Something is spatially in the neighborhood of something else',
    'model_of': "Marks something as a model of something else."
}

# All client datastores needed by the tracing system along their descriptions.
needed_datastores = {
    'settings': 'Stores client settings',
    'bookmarks': 'Stores bookmarked client locations',
}


def validate_project_setup(project_id, user_id, fix=False,
        class_model=None, rel_model=None, datastore_model=None) -> Tuple[List, List, List]:
    """Will check if needed classes and relations exist for every project. If
    <fix> is truthy, missing objects will be added.
    """
    missing_classes = []
    missing_relations = []
    missing_datastores = []

    class_model = class_model or Class
    rel_model = rel_model or Relation
    datastore_model = datastore_model or ClientDatastore

    for nc, desc in needed_classes.items():
        try:
            class_model.objects.get(project_id=project_id, class_name=nc)
        except class_model.DoesNotExist:
            missing_classes.append(nc)
            if fix:
                class_model.objects.create(project_id=project_id,
                        class_name=nc, user_id=user_id)

    for nr, desc in needed_relations.items():
        try:
            rel_model.objects.get(project_id=project_id, relation_name=nr)
        except rel_model.DoesNotExist:
            missing_relations.append(nr)
            if fix:
                rel_model.objects.get_or_create(project_id=project_id,
                        relation_name=nr, defaults={'user_id': user_id, 'description': desc})

    for nd, desc in needed_datastores.items():
        exists = datastore_model.objects.filter(name=nd).exists()
        if not exists:
            missing_datastores.append(nd)
            if fix:
                datastore_model.objects.get_or_create(name=nd)

    return missing_classes, missing_relations, missing_datastores


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_project_tags(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Return the tags associated with the project.
    """
    p = get_object_or_404(Project, pk=project_id)
    tags = [ str(t) for t in p.tags.all()]
    result = {'tags':tags}
    return JsonResponse(result, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def update_project_tags(request:HttpRequest, project_id=None, tags=None) -> JsonResponse:
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
    return JsonResponse("", safe=False)

def get_project_qs_for_user(user):
    """ Returns the query set of projects that are administrable and
    browsable by the given user.
    """
    perms=['can_administer', 'can_annotate', 'can_browse']
    return get_objects_for_user(user, perms, Project, any_perm=True,
                                 accept_global_perms=False)

@api_view(['GET'])
def projects(request:HttpRequest) -> JsonResponse:
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
    parameters:
    - name: has_tracing_data
      description: Return only projects that have tracing data
      required: false
      defaultValue: false
      type: boolean
    - name: with_mirrors
      description: Whether to include stack mirror data in the response.
      required: false
      defaultValue: false
      type: boolean
    type:
      projects:
        type: array
        items:
          $ref: project_api_element
        required: true
    """

    # Get all projects that are visisble for the current user
    projects = get_project_qs_for_user(request.user).order_by('title')
    has_tracing_data = get_request_bool(request.GET, 'has_tracing_data', False)
    with_mirrors = get_request_bool(request.GET, 'with_mirrors', False)

    if has_tracing_data:
        projects = projects.annotate(
            no_locations=~Exists(Location.objects.filter(project=OuterRef('pk')))
        ).filter(
            no_locations=False
        )

    if 0 == len(projects):
        return JsonResponse([], safe=False)

    cursor = connection.cursor()
    user_project_ids = [p.id for p in projects]

    tracing_data_join = ''
    extra_where = []
    if has_tracing_data:
        tracing_data_join = '''
            INNER JOIN LATERAL (
                SELECT EXISTS (SELECT 1 FROM location WHERE project_id = ps.project_id)
            ) sub(has_tracing_data)
                ON TRUE
        '''
        extra_where.append('''
            sub.has_tracing_data = True
        ''')

    project_stack_mapping:Dict = dict()
    if with_mirrors:
        cursor.execute("""
            SELECT DISTINCT ON (ps.project_id, ps.stack_id) ps.project_id,
                ps.stack_id, s.title, s.comment, s.dimension, sm.mirrors
            FROM project_stack ps
            JOIN UNNEST(%(user_project_ids)s::integer[]) user_project(id)
                ON ps.project_id = user_project.id
            JOIN stack s
                ON ps.stack_id = s.id
            JOIN LATERAL (
                SELECT COALESCE(json_agg(row_to_json(stack_mirror) ORDER BY position ASC), '[]'::json) AS mirrors
                FROM stack_mirror
                WHERE stack_id = s.id
            ) sm
              ON TRUE;
        """, {
            'user_project_ids': user_project_ids,
        })
    else:
        cursor.execute("""
            SELECT DISTINCT ON (ps.project_id, ps.stack_id) ps.project_id,
            ps.stack_id, s.title, s.comment, s.dimension
            FROM project_stack ps
            JOIN UNNEST(%(user_project_ids)s::integer[]) user_project(id)
                ON ps.project_id = user_project.id
            JOIN stack s
                ON ps.stack_id = s.id
        """, {
            'user_project_ids': user_project_ids,
        })

    for row in cursor.fetchall():
        stacks = project_stack_mapping.get(row[0])
        if not stacks:
            stacks = []
            project_stack_mapping[row[0]] = stacks
        stack_data = {
            'id': row[1],
            'title': row[2],
            'comment': row[3],
            'dimensions': [row[4].x, row[4].y, row[4].z],
        }
        if with_mirrors:
            stack_data['mirrors'] = row[5]
        stacks.append(stack_data)

    # Get all stack groups for this project
    project_stack_groups:Dict = dict()
    cursor.execute("""
        SELECT DISTINCT ps.project_id, sg.id, sg.title, sg.comment
        FROM stack_group sg
        JOIN stack_stack_group ssg
          ON ssg.stack_group_id = sg.id
        JOIN project_stack ps
          ON ps.stack_id = ssg.stack_id
        INNER JOIN UNNEST(%(user_project_ids)s::integer[]) user_project(id)
          ON ps.project_id = user_project.id
    """, {
        'user_project_ids': user_project_ids,
    })
    for row in cursor.fetchall():
        groups = project_stack_groups.get(row[0])
        if not groups:
            groups = []
            project_stack_groups[row[0]] = groups
        groups.append({
            'id': row[1],
            'title': row[2],
            'comment': row[3],
        })

    result:List = []
    empty_tuple:Tuple = tuple()
    fav_project_ids = set(FavoriteProject.objects.filter(user_id=request.user.id).values_list('project_id', flat=True))
    for p in projects:
        stacks = project_stack_mapping.get(p.id, empty_tuple)
        stackgroups = project_stack_groups.get(p.id, empty_tuple)

        response = {
            'id': p.id,
            'title': p.title,
            'stacks': stacks,
            'stackgroups': stackgroups
        }
        if p.id in fav_project_ids:
            response['favorite'] = True

        result.append(response)

    return JsonResponse(result, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })

@api_view(['GET'])
def export_projects(request:HttpRequest) -> JsonResponse:
    """Detailed list of projects visible to the requesting user.
"""
    # Get all projects that are visisble for the current user
    projects = get_project_qs_for_user(request.user).order_by('title')
    result = export_project_data(projects)

    return_content_type = request.META.get('HTTP_ACCEPT', 'application/yaml')
    if 'application/yaml' in return_content_type:
        # YAML return format matches information files discussed in
        # documentation: http://www.catmaid.org/en/stable/importing_data.html
        return HttpResponse(yaml.dump(result),
            content_type="application/yaml")
    else:
        return JsonResponse(result, safe=False, json_dumps_params={
            'sort_keys': True,
            'indent': 4
        })

def export_project_data(projects) -> List:
    """Detailed list of projects visible to the requesting user.
    """
    if 0 == len(projects):
        return []

    cursor = connection.cursor()
    user_project_ids = [p.id for p in projects]

    # Get information on all relevant stack mirrors
    cursor.execute("""
        SELECT sm.id, sm.stack_id, sm.title, sm.image_base, sm.file_extension,
                sm.tile_width, sm.tile_height, sm.tile_source_type, sm.position
        FROM project_stack ps
        JOIN LATERAL (
          SELECT *
          FROM stack_mirror sm
          WHERE sm.stack_id = ps.stack_id
          LIMIT 1
        ) sm
          ON TRUE
        WHERE ps.project_id = ANY(%(user_project_ids)s::integer[])
        ORDER BY sm.id ASC, sm.position ASC
    """, {
        'user_project_ids': user_project_ids,
    })

    # Build a stack mirror index that maps all stack mirrors to their respective
    # stacks.
    stack_mirror_index:Dict = {}
    seen_mirrors:Set[int] = set()
    for row in cursor.fetchall():
        stack_id = row[1]
        mirrors = stack_mirror_index.get(stack_id)
        if not mirrors:
            mirrors = []
            stack_mirror_index[stack_id] = mirrors
        if row[0] in seen_mirrors:
            continue
        seen_mirrors.add(row[0])
        mirrors.append({
            'title': row[2],
            'url': row[3],
            'fileextension': row[4],
            'tile_width': row[5],
            'tile_height': row[6],
            'tile_source_type': row[7],
            'position': row[8]
        })

    # Get all relevant stacks and map the projects they are used in. These are
    # projects that the current user can see.
    project_stack_mapping:Dict = dict()
    cursor.execute("""
        SELECT DISTINCT ON (ps.project_id, ps.stack_id) ps.project_id, ps.stack_id, s.title,
            s.dimension, s.resolution, s.downsample_factors, s.metadata, s.comment,
            s.attribution, s.description, s.canary_location,
            s.placeholder_color,
            ARRAY(SELECT index FROM broken_slice WHERE stack_id = s.id ORDER BY index),
            ps.translation, ps.orientation
        FROM project_stack ps
        JOIN UNNEST(%(user_project_ids)s::integer[]) user_project(id)
            ON ps.project_id = user_project.id
        INNER JOIN stack s
            ON ps.stack_id = s.id
    """, {
        'user_project_ids': user_project_ids,
    })
    for row in cursor.fetchall():
        stacks = project_stack_mapping.get(row[0])
        if not stacks:
            stacks = dict()
            project_stack_mapping[row[0]] = stacks
        stacks[row[1]] = {
            'id': row[1],
            'title': row[2],
            'dimension': str(row[3]),
            'resolution': row[4],
            'downsample_factors': None if row[5] is None else [str(r) for r in row[5]],
            'metadata': row[6],
            'comment': row[7],
            'attribution': row[8],
            'description': row[9],
            'canary_location': str(row[10]),
            'placeholder_color': row[11],
            'mirrors': stack_mirror_index.get(row[1], []),
            'broken_sections': row[12],
            'translation': row[13],
            'orientation': row[14]
        }

    # Add stack group information to stacks
    project_stack_groups:Dict = dict()
    cursor.execute("""
        SELECT sg.id, ps.project_id, sg.title, sg.comment,
               array_agg(ssg.stack_id), array_agg(sgr.name)
        FROM stack_group sg
        JOIN stack_stack_group ssg
          ON ssg.stack_group_id = sg.id
        JOIN project_stack ps
          ON ps.stack_id = ssg.stack_id
        JOIN UNNEST(%(user_project_ids)s::integer[]) user_project(id)
          ON ps.project_id = user_project.id
        INNER JOIN stack_group_relation sgr
          ON ssg.group_relation_id = sgr.id
        GROUP BY sg.id, ps.project_id, sg.title
    """, {
        'user_project_ids': user_project_ids,
    })
    for row in cursor.fetchall():
        groups = project_stack_groups.get(row[1])
        if not groups:
            groups = []
            project_stack_groups[row[1]] = groups
        groups.append({
            'id': row[0],
            'title': row[2],
            'comment': row[3],
        })
        visible_stacks = project_stack_mapping.get(row[1])
        # Add to stacks
        if visible_stacks:
            for stack_id, relation_name in zip(row[4], row[5]):
                visible_stack = visible_stacks.get(stack_id)
                if not visible_stack:
                    # Only add visible stacks
                    continue
                stack_groups = visible_stack.get('stackgroups')
                if not stack_groups:
                    stack_groups = []
                    visible_stack['stackgroups'] = stack_groups
                stack_groups.append({
                    'id': row[0],
                    'title': row[2],
                    'relation': relation_name
                })

    result = []
    empty_tuple:Dict = dict()
    for p in projects:
        stacks = list(project_stack_mapping.get(p.id, empty_tuple).values())
        result.append({
            'project': {
                'id': p.id,
                'title': p.title,
                'stacks': stacks,
            }
        })

    return result

def delete_projects_and_stack_data(projects) -> None:
    """Expects a list of projects (can be a queryset) to be deleted. All stacks
    linked with a project_stack relation to those projects will be deleted as
    well along with stack groups that exclusivelt use the stacks and broken
    sections."""
    for p in projects:
        project_id = p.id

        # Delete only stacks that are not referenced by project-stack links to
        # other projects.
        project_stack_relations = ProjectStack.objects.filter(project_id=project_id)
        stack_ids = set([ps.stack_id for ps in project_stack_relations])
        other_project_relations = ProjectStack.objects \
                .filter(stack_id__in=stack_ids) \
                .exclude(project__in=projects)
        stacks_used_in_other_projects = set([ps.stack_id for ps in other_project_relations])
        exclusive_stack_ids = stack_ids - stacks_used_in_other_projects

        stacks = Stack.objects.filter(id__in=exclusive_stack_ids)
        broken_slices = BrokenSlice.objects.filter(stack__in=stacks)

        # Get all stack groups that only have stacks linked from the set above
        stack_stack_groups = StackStackGroup.objects.filter(stack__in=stacks)
        stack_stack_group_ids = set([ssg.id for ssg in stack_stack_groups])
        all_linked_stack_group_ids = set([ssg.stack_group_id for ssg in stack_stack_groups])
        stack_groups_with_other_stacks = StackStackGroup.objects \
                .filter(stack_group_id__in=stack_stack_group_ids) \
                .exclude(stack__in=stacks)
        stack_groups_with_other_stacks_ids = set([ssg.stack_group_id for ssg in stack_groups_with_other_stacks])
        exclusive_stack_groups = all_linked_stack_group_ids - stack_groups_with_other_stacks_ids
        stack_groups = StackGroup.objects.filter(id__in=exclusive_stack_groups)

        # Delete everything
        broken_slices.delete()
        stacks.delete()
        stack_groups.delete()
        project_stack_relations.delete()
        p.delete()


def delete_projects(project_ids) -> None:
    """Deletes all passed in projects and all data that refer to it. This is a
    potentially dangerous operation.
    """
    cursor = connection.cursor()
    cursor.execute("""
        DELETE FROM project
        WHERE id = ANY(%(project_ids)s::integer[])
    """, {
        'project_ids': project_ids,
    })


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def interpolatable_sections(request:HttpRequest, project_id) -> JsonResponse:
    """Get all section locations for all orientations.
    ---
    type:
      x:
        type: array
        items:
            type: float
        required: true
      y:
        type: array
        items:
            type: float
        required: true
      z:
        type: array
        items:
            type: float
        required: true
    """
    coords:List[List] = [[], [], []]
    for section_data in InterpolatableSection.objects.filter(
            project_id=project_id).values_list('orientation', 'location_coordinate'):
        coords[section_data[0]].append(section_data[1])

    return JsonResponse({
        'x': coords[2],
        'y': coords[1],
        'z': coords[0]
    })


@api_view(['POST'])
@requires_user_role(UserRole.Fork)
def fork(request:HttpRequest, project_id) -> JsonResponse:
    """Attempt to create a new project based on the passed in project ID.
    ---
    parameters:
    - name: name
      description: Name of new project
      required: true
      type: string
    - name: description
      description: Description of new project
      required: false
      type: string
    - name: copy_volumes
      description: Whether volumes will be copied to the new project
      required: false
      type: boolean
      defaultValue: false
    - name: project_token
      description: Whether or not a new project token should be generated
      required: false
      type: boolean
      defaultValue: false
    - name: add_to_favorites
      description: Whether or not the new project is marked as a favorite
      required: false
      type: boolean
      defaultValue: true
    """
    name = request.POST.get('name')
    if not name:
        raise ValueError('Need new project name')

    description = request.POST.get('description')
    copy_volumes = get_request_bool(request.POST, 'copy_volumes', False)
    create_project_token = get_request_bool(request.POST, 'project_token', False)

    project_token_approval_needed = get_request_bool(request.POST, 'project_token_approval_needed', False)
    project_token_default_perms = get_request_list(request.POST, 'project_token_default_permissions', [])
    add_to_favorites = get_request_bool(request.POST, 'add_to_favorites', True)

    current_p = get_object_or_404(Project, pk=project_id)
    new_p = get_object_or_404(Project, pk=project_id)

    new_p.id = None
    new_p.title = name
    new_p.comment = description
    new_p.save()

    # Copy all project-stack links
    ps_links = ProjectStack.objects.filter(project=current_p)
    for ps in ps_links:
        ps.id = None
        ps.project = new_p
        ps.save()

    # Assign read/write/import permissions for new fork
    assign_perm('can_browse', request.user, new_p)
    assign_perm('can_annotate', request.user, new_p)
    assign_perm('can_import', request.user, new_p)
    assign_perm('can_fork', request.user, new_p)
    assign_perm('can_administer', request.user, new_p)
    assign_perm('delete_project', request.user, new_p)

    # Creat basic classes and relations
    validate_project_setup(new_p.id, request.user.id, fix=True)

    # If the source project is a tracing project, make the clone as well one.
    # A local import is used here to avoid a high potential for circular imports.
    from catmaid.control.tracing import check_tracing_setup, setup_tracing
    if check_tracing_setup(project_id):
        setup_tracing(new_p.id)

    if copy_volumes:
        cursor = connection.cursor()
        cursor.execute("""
            INSERT INTO catmaid_volume (user_id, project_id, creation_time,
                    edition_time, editor_id, name, comment, geometry, area,
                    volume, watertight, meta_computed)
            SELECT user_id, %(new_project_id)s, creation_time, edition_time,
                    editor_id, name, comment, geometry, area, volume, watertight,
                    meta_computed
            FROM catmaid_volume
            WHERE project_id = %(project_id)s;
        """, {
            'project_id': project_id,
            'new_project_id': new_p.id
        })

    project_token_str = None
    if create_project_token:
        allowed_permissions = set(get_perms_for_model(Project).values_list('codename', flat=True))
        unknown_permissions = set(project_token_default_perms) - allowed_permissions
        if unknown_permissions:
            raise ValueError(f'Unknown permissions: {", ".join(unknown_permissions)}')
        project_token = ProjectToken.objects.create(**{
            'user_id': request.user.id,
            'project_id': new_p.id,
            'name': "",
            'needs_approval': project_token_approval_needed,
            'default_permissions': project_token_default_perms,
        })
        project_token.name = f'Project token #{project_token.id}'
        project_token.save()

        project_token_str = project_token.token

    if add_to_favorites:
        FavoriteProject.objects.create(**{
            'project_id': new_p.id,
            'user_id': request.user.id,
        })

    return JsonResponse({
        'new_project_id': new_p.id,
        'n_copied_stack_links': len(ps_links),
        'project_token': project_token_str,
    })


class ProjectDetail(APIView):


    def get(self, request:Request, project_id:int) -> JsonResponse:
        """Get details on a project.
        """
        project = get_object_or_404(Project, pk=project_id)

        return JsonResponse({
            'id': project.id,
            'title': project.title,
            'comment': project.comment,
        })


    @method_decorator(requires_user_role('delete_projectt'))
    @method_decorator(requires_user_role(UserRole.Admin))
    def delete(self, request:Request, project_id:int) -> JsonResponse:
        """Delete a project.

        This requires <delete_project> permission on a project.
        """
        delete_projects([project_id])
        return JsonResponse({
            'deleted_project_id': project_id,
        })


    @method_decorator(requires_user_role(UserRole.Admin))
    def post(self, request:Request, project_id:int) -> JsonResponse:
        """Update properties of a project.

        This requires <can_administer> permission on a project.
        """
        project = get_object_or_404(Project, pk=project_id)
        if 'title' in request.data:
            project.title = request.data.get('title')

        project.save()

        return JsonResponse({
            'id': project.id,
            'title': project.title,
            'comment': project.comment,
        })
