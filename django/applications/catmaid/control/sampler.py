from collections import defaultdict
from itertools import chain
import json
from typing import Any, DefaultDict, Dict, List

from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.utils.decorators import method_decorator

from catmaid.control.authentication import (requires_user_role, user_can_edit,
        can_edit_or_fail)
from catmaid.control.common import get_request_bool, get_request_list
from catmaid.models import (Class, ClassInstance, Connector, Relation, Sampler,
        SamplerDomain, SamplerDomainType, SamplerDomainEnd, SamplerInterval,
        SamplerIntervalState, SamplerState, SamplerConnector,
        SamplerConnectorState, Treenode, TreenodeClassInstance, UserRole)
from catmaid.util import Point3D, is_collinear

from rest_framework.decorators import api_view
from rest_framework.views import APIView


SAMPLER_CREATED_CLASS = "sampler-created"
epsilon = 0.001
known_leaf_modes = frozenset(('ignore', 'merge', 'short-interval', 'merge-or-create'))

def serialize_sampler(sampler) -> Dict[str, Any]:
    return {
       'id': sampler.id,
       'creation_time': float(sampler.creation_time.strftime('%s')),
       'edition_time': float(sampler.edition_time.strftime('%s')),
       'interval_length': sampler.interval_length,
       'interval_error': sampler.interval_error,
       'leaf_segment_handling': sampler.leaf_segment_handling,
       'merge_limit': sampler.merge_limit,
       'review_required': sampler.review_required,
       'create_interval_boundaries': sampler.create_interval_boundaries,
       'state_id': sampler.sampler_state_id,
       'skeleton_id': sampler.skeleton_id,
       'user_id': sampler.user_id,
    }

def serialize_domain(domain, with_ends=True, with_intervals=True) -> Dict[str, Any]:
    detail = {
        "id": domain.id,
        "sampler_id": domain.sampler_id,
        "type_id": domain.domain_type_id,
        "parent_interval": domain.parent_interval_id,
        "start_node_id": domain.start_node_id,
        "user_id": domain.user_id,
        "project_id": domain.project_id,
    }

    if with_ends:
        domain_ends = domain.samplerdomainend_set.all()
        detail["ends"] = [{
            "id": e.id,
            "node_id": e.end_node_id
        } for e in domain_ends]

    if with_intervals:
        detail['intervals'] = [[
            i.id, i.start_node_id, i.end_node_id, i.interval_state_id
        ] for i in domain.samplerinterval_set.all()]

    return detail


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_samplers(request:HttpRequest, project_id) -> JsonResponse:
    """Get a collection of available samplers.

    Optionally, the "skeleton_ids" parameter can provide a list of skeleton IDs.
    If this is the case, only samplers for the respective skeletons are returned.
    ---
    parameters:
     - name: skeleton_ids
       description: Optional skeleton IDs to constrain result set to.
       type: integer
       paramType: form
       required: false
     - name: with_domains
       description: Optional flag to include all domains of all result sampler results.
       type: boolean
       paramType: form
       required: false
     - name: with_intervals
       description: Optional flag to include all intervals of all domains. Implies with_domains.
       type: boolean
       paramType: form
       required: false
       default: false
    models:
      sampler_entity:
        id: sampler_entity
        description: A result sampler.
        properties:
          id:
            type: integer
            description: Id of sampler
          creation_time:
            type: string
            description: The point in time a sampler the created
            required: true
          edition_time:
            type: string
            description: The last point in time a sampler edited.
            required: true
          interval_length:
            type: integer
            description: The length of individual sampler intervals for this sampler.
            required: true
          interval_error:
            type: float
            description: The maximum allowed error of a single interval.
            required: true
          state_id:
            type: integer
            description: ID of state the sampler is in.
            required: true
          skeleton_id:
            type: integer
            description: Skeleton this sampler belongs to
            required: true
          user_id:
            type: integer
            description: User ID of sampler creator.
            required: true
    type:
      samplers:
        type: array
        items:
          $ref: sampler_entity
        description: Matching samplers
        required: true
    """
    skeleton_ids = get_request_list(request.GET, 'skeleton_ids', map_fn=int)
    with_intervals = get_request_bool(request.GET, 'with_intervals', False)
    with_domains = with_intervals or (get_request_bool(request.GET, 'with_domains', False))

    samplers = Sampler.objects.all()
    if skeleton_ids:
        samplers = samplers.filter(skeleton_id__in=skeleton_ids)

    domains = defaultdict(list) # type: DefaultDict[Any, List]
    if with_domains:
        domain_query = SamplerDomain.objects.filter(sampler__in=samplers) \
                .prefetch_related('samplerdomainend_set')
        if with_intervals:
            domain_query = domain_query.prefetch_related('samplerinterval_set')

        for domain in domain_query:
            domain_data = serialize_domain(domain, with_ends=True,
                    with_intervals=with_intervals)
            domains[domain.sampler_id].append(domain_data)

    def exportSampler(s) -> Dict[str, Any]:
        s = serialize_sampler(s)

        if with_domains:
            s['domains'] = domains.get(s['id'], [])

        return s

    return JsonResponse([exportSampler(s) for s in samplers], safe=False)


class SamplerDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, sampler_id) -> JsonResponse:
        """Get details on a particular sampler.
        ---
        parameters:
         - name: project_id
           description: The project to operate in.
           type: integer
           paramType: path
           required: false
         - name: sampler_id
           description: The sampler to return.
           type: integer
           paramType: path
           required: false
         - name: with_domains
           description: Optional flag to include all domains of all result sampler results.
           type: boolean
           paramType: form
           required: false
           defaultValue: false
         - name: with_intervals
           description: Optional flag to include all intervals of all domains. Implies with_domains.
           type: boolean
           paramType: form
           required: false
           default: false
           defaultValue: false
        """
        sampler_id = int(sampler_id)
        with_intervals = get_request_bool(request.GET, 'with_intervals', False)
        with_domains = get_request_bool(request.GET, 'with_domains', False) or with_intervals

        if with_domains:
            sampler = Sampler.objects.prefetch_related('samplerdomain_set').get(pk=sampler_id)
        else:
            sampler = Sampler.objects.get(pk=sampler_id)

        sampler_detail = serialize_sampler(sampler)

        if with_domains:
            domains = []
            domains_and_ends = SamplerDomain.objects.filter(sampler=sampler_id) \
                    .prefetch_related('samplerdomainend_set')
            if with_intervals:
                domains_and_ends = domains_and_ends.prefetch_related('samplerinterval_set')

            for domain in domains_and_ends:
                domain_data = serialize_domain(domain, with_ends=True,
                        with_intervals=with_intervals)
                domains.append(domain_data)
            sampler_detail['domains'] = domains

        return JsonResponse(sampler_detail)

    @method_decorator(requires_user_role(UserRole.Browse))
    def post(self, request:HttpRequest, project_id, sampler_id) -> JsonResponse:
        """Set fields of a particular sampler.
        ---
        parameters:
         - name: project_id
           description: The project to operate in.
           type: integer
           paramType: path
           required: false
         - name: sampler_id
           description: The sampler to return.
           type: integer
           paramType: path
           required: false
         - name: leaf_handling_mode
           description: Optional flag to include all domains of all result sampler results.
           type: boolean
           paramType: form
           required: false
        """
        sampler_id = int(sampler_id)
        can_edit_or_fail(request.user, sampler_id, 'catmaid_sampler')

        sampler = Sampler.objects.get(pk=sampler_id)

        leaf_handling_mode = request.POST.get('leaf_handling_mode')
        if leaf_handling_mode and leaf_handling_mode in known_leaf_modes:
            sampler.leaf_segment_handling = leaf_handling_mode
            sampler.save()

        return JsonResponse(serialize_sampler(sampler))


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_sampler(request:HttpRequest, project_id) -> JsonResponse:
    """Create a new sampler for a skeleton.
    ---
    parameters:
     - name: skeleton_id
       description: Skeleton this sampelr is for
       type: integer
       paramType: form
       required: true
     - name: interval_length
       description: Length of a intervals with domains (nm).
       type: integer
       paramType: form
       required: true
     - name: interval_error
       description: Maximum allowed error for a single interval.
       type: float
       paramType: form
       required: false
       default: 250
     - name: review_required
       description: Whether reviews should be enforced in this sampler
       type: boolean
       paramType: form
       required: true
     - name: create_interval_boundaries
       description: Whether new nodes for interval boundaries should be created.
       type: boolean
       paramType: form
       required: true
     - name: leaf_segment_handling
       description: How leaf segments should be handled, can be 'ignore', 'merge' or 'short-interval'.
       type: string
       paramType: form
       required: false
       default: ignore
     - name: merge_limit
       description: A leaf handling option for merge-or-create mode. A value between 0 and 1 representing the interval length ratio up to which a merge is allowed.
       type: string
       paramType: form
       required: false
       default: 0
       default: ignore
    """
    skeleton_id = request.POST.get('skeleton_id')
    if skeleton_id:
        skeleton_id = int(skeleton_id)
    else:
        raise ValueError("Need skeleton_id parameter")

    interval_length = request.POST.get('interval_length')
    if interval_length:
        interval_length = int(interval_length)
    else:
        raise ValueError("Need interval_length parameter")

    interval_error = request.POST.get('interval_error')
    if interval_error:
        interval_error = float(interval_error)
    else:
        interval_error = 250.0

    review_required = request.POST.get('review_required')
    if review_required:
        review_required = review_required == 'true'
    else:
        raise ValueError("Need review_required parameter")

    create_interval_boundaries = request.POST.get('create_interval_boundaries')
    if create_interval_boundaries:
        create_interval_boundaries = create_interval_boundaries == 'true'
    else:
        raise ValueError("Need create_interval_boundaries parameter")

    leaf_segment_handling = request.POST.get('leaf_segment_handling')
    if leaf_segment_handling:
        if leaf_segment_handling not in known_leaf_modes:
            raise ValueError("The leaf_segment_handling parameter needs to " +
                    "be one of 'ignore', 'merge' or 'short-interval'")
    else:
        leaf_segment_handling = 'ignore'

    merge_limit = request.POST.get('merge_limit')
    if merge_limit:
        merge_limit = float(merge_limit)
    else:
        merge_limit = 0

    if merge_limit < 0 or merge_limit > 1.0:
        raise ValueError("Merge limit needs to be between 0 and 1")

    sampler_state = SamplerState.objects.get(name="open");

    sampler = Sampler.objects.create(
        skeleton_id=skeleton_id,
        interval_length=interval_length,
        interval_error=interval_error,
        leaf_segment_handling=leaf_segment_handling,
        merge_limit=merge_limit,
        review_required=review_required,
        create_interval_boundaries=create_interval_boundaries,
        sampler_state=sampler_state,
        user=request.user,
        project_id=project_id)

    return JsonResponse({
        "id": sampler.id,
        "skeleton_id": sampler.skeleton_id,
        "interval_length": sampler.interval_length,
        "interval_error": sampler.interval_error,
        "leaf_segment_handling": sampler.leaf_segment_handling,
        "merge_limit": sampler.merge_limit,
        "review_required": sampler.review_required,
        "create_interval_boundaries": sampler.create_interval_boundaries,
        "sampler_state": sampler.sampler_state_id,
        "user_id": sampler.user_id,
        "project_id": sampler.project_id
    })

@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def delete_sampler(request:HttpRequest, project_id, sampler_id) -> JsonResponse:
    """Delete a sampler if permissions allow it.

    If the sampler was created with allowing the creation of new boundary nodes,
    these nodes are removed by default if they have not been modified since
    their insertion. This can optionally be disabled using the
    <delete_created_nodes> parameter.
    ---
    parameters:
     - name: delete_created_nodes
       description: |
         Optional flag to disable automatic removal of untouched
         nodes created for this sampler's intervals.
       type: boolean
       default: true
       paramType: form
       required: false
    """
    can_edit_or_fail(request.user, sampler_id, "catmaid_sampler")
    sampler = Sampler.objects.get(id=sampler_id)

    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')
    label_class = Class.objects.get(project=project_id, class_name='label')
    try:
        label_class_instance = ClassInstance.objects.get(project=project_id,
                class_column=label_class, name=SAMPLER_CREATED_CLASS)
    except ClassInstance.DoesNotExist:
        label_class_instance = None

    n_deleted_nodes = 0
    delete_created_nodes = get_request_bool(request.POST, 'delete_created_nodes', True)
    if label_class_instance and delete_created_nodes and sampler.create_interval_boundaries:
        # If the sampler was parameterized to created interval boundary nodes,
        # these nodes can now be removed if they are still collinear with their
        # child and parent node and have not been touched. These nodes are all
        # nodes that are referenced by intervals of this sampler that have the
        # SAMPLER_CREATED_CLASS tag with their creation time being the same as the
        # edition time. Such nodes can only be sampler interval start/end nodes.
        params = {
            'project_id': project_id,
            'sampler_id': sampler_id,
            'labeled_as_rel': labeled_as_relation.id,
            'label_class': label_class.id,
            'label_class_instance': label_class_instance.id
        }
        cursor = connection.cursor()

        # Get all created sampler interval boundary treenodes that have been
        # created during sampler creation. The result will also contain parent
        # and child locations. We need to set extra_float_digits to get enough
        # precision for the location data to do a collinearity test.
        cursor.execute("""
            SET extra_float_digits = 3;

            WITH sampler_treenode AS (
                -- Get all treenodes linked to intervals of this sampler. Only
                -- select those nodes that are referenced by no other sampler
                -- (using an anti join).
                SELECT DISTINCT all_added_nodes.id
                FROM (
                    SELECT DISTINCT UNNEST(ARRAY[i.start_node_id, i.end_node_id]) AS id
                    FROM catmaid_samplerinterval i
                    JOIN catmaid_samplerdomain d
                        ON i.domain_id = d.id
                    WHERE d.sampler_id = %(sampler_id)s
                ) all_added_nodes
                JOIN catmaid_samplerinterval csi
                    ON csi.start_node_id = all_added_nodes.id
                    OR csi.end_node_id = all_added_nodes.id
                JOIN catmaid_samplerdomain csd
                    ON csd.id = csi.domain_id
                GROUP BY all_added_nodes.id
                HAVING COUNT(DISTINCT csd.sampler_id) = 1
            ), sampler_created_treenode AS (
                -- Find all treenodes that were created by the sampler and are
                -- undmodified.
                SELECT st.id
                FROM sampler_treenode st
                JOIN treenode_class_instance tci
                    ON st.id = tci.treenode_id
                WHERE tci.relation_id = %(labeled_as_rel)s
                AND tci.class_instance_id = %(label_class_instance)s
            )
            SELECT
                t.id, t.location_x, t.location_y, t.location_z,
                c.id, c.location_x, c.location_y, c.location_z,
                p.id, p.location_x, p.location_y, p.location_z
            FROM (
                -- Make sure we look only at nodes that don't have multiple nodes.
                SELECT st.id
                FROM treenode tt
                JOIN sampler_created_treenode st
                    ON tt.parent_id = st.id
                GROUP BY st.id
                HAVING count(*) = 1

            ) non_branch_treenodes(id)
            JOIN treenode t
                ON t.id = non_branch_treenodes.id
            JOIN treenode p
                ON p.id = t.parent_id
            JOIN treenode c
                ON c.parent_id = t.id
            WHERE t.project_id = %(project_id)s;
        """, params)

        created_treenodes = [r for r in cursor.fetchall()]

        if created_treenodes:
            added_node_index = dict((n[0], n) for n in created_treenodes)
            # Find those created treenodes that are collinear with their parent and
            # child node. If they are, remove those nodes. Ideally, we would move
            # the collinearity test into SQL as well.
            nodes_to_remove = []
            parents_to_fix = []
            child, node, parent = Point3D(0, 0, 0), Point3D(0, 0, 0), Point3D(0, 0, 0)
            for n in created_treenodes:
                n_id, node.x, node.y, node.z = n[0], n[1], n[2], n[3]
                c_id, child.x, child.y, child.z = n[4], n[5], n[6], n[7]
                p_id, parent.x, parent.y, parent.z = n[8], n[9], n[10], n[11]

                child_is_original_node = c_id not in added_node_index
                if is_collinear(child, parent, node, True, 1.0):
                    nodes_to_remove.append(n_id)
                    # Only update nodes that don't get deleted anyway
                    if child_is_original_node:
                        parents_to_fix.append((c_id, p_id))
                else:
                    parents_to_fix.append((n_id, p_id))

            # Update parent in formation in parent relation updates. If present
            # parent IDs point to a removed node, the next real parent will be
            # used instead.
            parent_update = []
            for n, (c_id, p_id) in enumerate(parents_to_fix):
                parent_is_persistent = p_id not in added_node_index
                if parent_is_persistent:
                    parent_update.append((c_id, p_id))
                else:
                    # Find next existing node upstream
                    new_parent_id = p_id
                    while not parent_is_persistent:
                        parent_is_persistent = new_parent_id not in nodes_to_remove
                        node_data = added_node_index.get(new_parent_id)
                        # An added node would be used if it is not removed, e.g.
                        # du to not being collinear anymore.
                        if node_data and not parent_is_persistent:
                            new_parent_id = node_data[8]
                        else:
                            parent_update.append((c_id, new_parent_id))

            if nodes_to_remove:
                query_parts = []
                remove_params = [] # type: List
                if parent_update:
                    update_nodes_template = ",".join("(%s, %s)" for _ in parent_update)
                    update_nodes_flattened = list(chain.from_iterable(parent_update))
                    query_parts.append("""
                        UPDATE treenode
                        SET parent_id = nodes_to_update.parent_id
                        FROM (VALUES {}) nodes_to_update(child_id, parent_id)
                        WHERE treenode.id = nodes_to_update.child_id;
                    """.format(update_nodes_template))
                    remove_params = update_nodes_flattened

                delete_nodes_template = ",".join("(%s)" for _ in nodes_to_remove)
                query_parts.append("""
                    DELETE
                    FROM treenode
                    WHERE id IN (
                        SELECT t.id
                        FROM treenode t
                        JOIN (VALUES {}) to_delete(id)
                            ON t.id = to_delete.id
                    )
                    RETURNING id;
                """.format(delete_nodes_template))
                remove_params = remove_params + nodes_to_remove

                cursor.execute("\n".join(query_parts), remove_params)
                deleted_node_ids = [r[0] for r in cursor.fetchall()]
                n_deleted_nodes = len(deleted_node_ids)

    sampler.delete()

    return JsonResponse({
        'deleted_sampler_id': sampler_id,
        'deleted_interval_nodes': n_deleted_nodes
    })

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_sampler_states(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of all available sampler states and their IDs.
    ---
    models:
      sampler_state_entity:
        id: sampler_state_entity
        description: A result sampler state.
        properties:
          id:
            type: integer
            description: Id of sampler state
          name:
            type: string
            description: The name of this sampler state.
            required: true
          description:
            type: string
            description: Description of sampler state.
            required: true
    type:
      sampler_states:
        type: array
        items:
          $ref: sampler_state_entity
        description: Available sampler states
        required: true
    """
    sampler_states = SamplerState.objects.all()
    return JsonResponse([{
        'id': s.id,
        'name': s.name,
        'description': s.description
    } for s in sampler_states], safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_connector_states(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of all available connectors states and their IDs.
    ---
    models:
      connector_state_entity:
        id: connector_state_entity
        description: A sampler connector state.
        properties:
          id:
            type: integer
            description: Id of sampler connector state
          name:
            type: string
            description: The name of this sampler connector state.
            required: true
          description:
            type: string
            description: Description of sampler connector state.
            required: true
    type:
      connector_states:
        type: array
        items:
          $ref: connector_state_entity
        description: Available connector states
        required: true
    """
    connector_states = SamplerConnectorState.objects.all()
    return JsonResponse([{
        'id': s.id,
        'name': s.name,
        'description': s.description
    } for s in connector_states], safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_connectors(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of connectors that already have a state associated with them.

    If a connector is not part of this list it is implicetely assumed to be in
    an "untouched" state.
    ---
    parameters:
     - name: interval_id
       description: The interval all results should be part of
       type: integer
       paramType: form
       required: false
     - name: connector_id
       description: The connector to get sampler information for
       type: integer
       paramType: form
       required: false
     - name: state_id
       description: The state all result sets have to have.
       type: integer
       paramType: form
       required: false
    models:
      sampler_connector_entity:
        id: sampler_connector_entity
        description: A sampler connector.
        properties:
          id:
            type: integer
            description: Id of sampler connector
          interval_id:
            type: integer
            description: The interval this sampler connector is part of
            required: true
          connector_id:
            type: integer
            description: The referenced connector
            required: true
          state_id:
            type: integer
            description: The state of this sampler connector
            required: true
    type:
      connector_states:
        type: array
        items:
          $ref: sampler_connector_entity
        description: Available sampler connectors
        required: true
    """
    interval_id = request.GET.get('interval_id')
    connector_id = request.GET.get('connector_id')
    state_id = request.GET.get('state_id')

    filters = {}
    if interval_id:
        filters['interval'] = interval_id
    if connector_id:
        filters['connector_id'] = connector_id
    if state_id:
        filters['state_id'] = state_id

    sampler_connectors = SamplerConnector.objects.all()
    if filters:
        sampler_connectors = sampler_connectors.filter(**filters)

    return JsonResponse([{
        'id': c.id,
        'interval_id': c.interval_id,
        'connector_id': c.connector_id,
        'state_id': c.connector_state_id
    } for c in sampler_connectors], safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_domain_types(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of all available domain types.
    ---
    models:
      domain_type_entity:
        id: domain_type_entity
        description: A sampler domain type.
        properties:
          id:
            type: integer
            description: Id of domain type
          name:
            type: string
            description: The name of this domain type
            required: true
          description:
            type: string
            description: Description of domain type
            required: true
    type:
      domain_types:
        type: array
        items:
          $ref: domain_type_entity
        description: Available sampler domain types
        required: true
    """
    domain_types = SamplerDomainType.objects.all()
    return JsonResponse([{
        'id': d.id,
        'name': d.name,
        'description': d.description
    } for d in domain_types], safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_sampler_domains(request:HttpRequest, project_id, sampler_id) -> JsonResponse:
    """Get a collection of available sampler domains.
    ---
    parameters:
     - name: sampler_id
       description: Sampler to list domains for
       type: integer
       paramType: form
       required: true
    models:
      domain_entity:
        id: domain_entity
        description: A result sampler domain.
        properties:
          id:
            type: integer
            description: Id of domain
          creation_time:
            type: string
            description: The point in time a domain the created
            required: true
          edition_time:
            type: string
            description: The last point in time a domain edited.
            required: true
          parent_interval_id:
            type: integer
            description: Id of a parent interval or null if there is none.
            required: true
          start_node_id:
            type: integer
            description: Treenode at which this domain starts
            required: true
          type_id:
            type: integer
            description: ID of type of the domain
            required: true
          user_id:
            type: integer
            description: User ID of domain creator.
            required: true
    type:
      domains:
        type: array
        items:
          $ref: domain_entity
        description: Matching domains
        required: true
    """
    sampler_id = int(sampler_id)
    domains = SamplerDomain.objects.filter(sampler_id=sampler_id) \
            .prefetch_related('samplerdomainend_set')

    return JsonResponse([{
       'id': d.id,
       'creation_time': float(d.creation_time.strftime('%s')),
       'edition_time': float(d.edition_time.strftime('%s')),
       'parent_interval_id': d.parent_interval_id,
       'start_node_id': d.start_node_id,
       'type_id': d.domain_type_id,
       'user_id': d.user_id,
       'ends': [{
            'id': e.id,
            'node_id': e.end_node_id,
        } for e in d.samplerdomainend_set.all()]
    } for d in domains], safe=False)


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_sampler_domain(request:HttpRequest, project_id, sampler_id) -> JsonResponse:
    """Create a new domain for a sampler.
    ---
    parameters:
     - name: sampler_id
       description: Sampeler the new domain is part of
       type: integer
       paramType: form
       required: true
     - name: domain_type_id
       description: The type of the new domain
       type: integer
       paramType: form
       required: true
     - name: start_node_id
       description: Start node of domain
       type: integer
       paramType: form
       required: true
     - name: end_node_ids
       description: A list of all end nodes for the new domain
       type: array
       items:
         type: integer
       paramType: form
       required: true
     - name: parent_interval_id
       description: Optional parent inerval ID.
       type: integer
       paramType: form
    """
    sampler_id = int(sampler_id)
    domain_type_id = request.POST.get('domain_type_id')
    if domain_type_id:
        domain_type_id = int(domain_type_id)
    else:
        raise ValueError("Need domain_type_id parameter")

    start_node_id = request.POST.get('start_node_id')
    if start_node_id:
        start_node_id = int(start_node_id)
    else:
        raise ValueError("Need start_node_id parameter")

    end_node_ids = get_request_list(request.POST, 'end_node_ids', map_fn=int)
    if not end_node_ids:
        raise ValueError("Need at least one valid end point")

    parent_interval_id = request.POST.get('parent_interval_id')
    if parent_interval_id:
        parent_interval_id = int(parent_interval_id)

    domain = SamplerDomain.objects.create(
        sampler_id=sampler_id,
        start_node_id=start_node_id,
        domain_type_id=domain_type_id,
        parent_interval_id=parent_interval_id,
        user=request.user,
        project_id=project_id)

    domain_ends = []
    for end_node_id in end_node_ids:
        domain_end = SamplerDomainEnd.objects.create(
            domain=domain, end_node_id=end_node_id)
        domain_ends.append(domain_end)

    return JsonResponse({
        "id": domain.id,
        "sampler_id": domain.sampler_id,
        "type_id": domain.domain_type_id,
        "parent_interval": domain.parent_interval_id,
        "start_node_id": domain.start_node_id,
        "user_id": domain.user_id,
        "project_id": domain.project_id,
        "ends": [{
            "id": e.id,
            "node_id": e.end_node_id
        } for e in domain_ends]
    })


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_multiple_sampler_domains(request:HttpRequest, project_id, sampler_id) -> JsonResponse:
    """Create a new domain for a sampler.
    ---
    parameters:
     - name: domains
       description: List of domains to add
       type: array:
       items:
         type: string
       required: true
    """
    sampler_id = int(sampler_id)
    domains = get_request_list(request.POST, 'domains', map_fn=json.loads)

    result_domains = []
    for domain in domains:
        domain_type_id = domain.get('domain_type_id')
        if domain_type_id:
            domain_type_id = int(domain_type_id)
        else:
            raise ValueError("Need domain_type_id parameter")

        start_node_id = domain.get('start_node_id')
        if start_node_id:
            start_node_id = int(start_node_id)
        else:
            raise ValueError("Need start_node_id parameter")

        end_node_ids = get_request_list(domain, 'end_node_ids', map_fn=int)
        if not end_node_ids:
            raise ValueError("Need at least one valid end point")

        parent_interval_id = domain.get('parent_interval_id')
        if parent_interval_id:
            parent_interval_id = int(parent_interval_id)

        d = SamplerDomain.objects.create(
            sampler_id=sampler_id,
            start_node=start_node_id,
            domain_type=domain_type_id,
            parent_interval_id=parent_interval_id,
            user=request.user,
            project_id=project_id)

        domain_ends = d.samplerdomainend_set.all()

        result_domains.append({
            "id": d.id,
            "sampler_id": d.sampler_id,
            "type_id": d.domain_type_id,
            "parent_interval": d.parent_interval_id,
            "start_node_id": d.start_node_id,
            "user_id": d.user_id,
            "project_id": d.project_id,
            "ends": [{
                "id": e.id,
                "node_id": e.end_node_id
            } for e in domain_ends]
        })

    return JsonResponse(result_domains, safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def get_domain_details(request:HttpRequest, project_id, domain_id) -> JsonResponse:
    """Get details on a particular domain.
    """
    domain_id=int(domain_id)
    domain = SamplerDomain.objects.get(id=domain_id)
    domain_ends = SamplerDomainEnd.objects.filter(domain=domain)
    return JsonResponse({
        "id": domain.id,
        "sampler_id": domain.sampler_id,
        "type_id": domain.domain_type_id,
        "parent_interval": domain.parent_interval_id,
        "start_node_id": domain.start_node_id,
        "user_id": domain.user_id,
        "project_id": domain.project_id,
        "ends": [{
            "id": e.id,
            "node_id": e.end_node_id
        } for e in domain_ends]
    })


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_interval_states(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of all available interval states.
    ---
    models:
      interval_state_entity:
        id: interval_state_entity
        description: A sampler domain interval state.
        properties:
          id:
            type: integer
            description: Id of interval state
          name:
            type: string
            description: Name of interval state
            required: true
          description:
            type: string
            description: Description of interval state
            required: true
    type:
      interval_states:
        type: array
        items:
          $ref: interval_state_entity
        description: Available sampler domain interval states
        required: true
    """
    interval_states = SamplerIntervalState.objects.all()
    return JsonResponse([{
        'id': s.id,
        'name': s.name,
        'description': s.description
    } for s in interval_states], safe=False)

@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def set_connector_state(request:HttpRequest, project_id, interval_id, connector_id) -> JsonResponse:
    """Set state of sampler connector
    ---
    parameters:
     - name: interval_id
       description: Interval the connector is part of
       type: integer
       paramType: form
       required: true
     - name: connector_id
       description: Connector to set state of
       type: integer
       paramType: form
       required: true
     - name: state_id
       description: The new state
       type: integer
       paramType: form
       required: true
    """
    interval = SamplerInterval.objects.get(id=interval_id)
    connector = Connector.objects.get(id=connector_id)

    state_id = request.POST.get('state_id')
    if state_id is None:
        raise ValueError("Need sampler connector state ID")

    state = SamplerConnectorState.objects.get(id=state_id)
    sampler_connector, created = SamplerConnector.objects.get_or_create(project_id=project_id,
            interval=interval, connector=connector, defaults={
                'connector_state': state,
                'user': request.user
            })

    if not created:
        sampler_connector.connector_state = state
        sampler_connector.save()

    return JsonResponse({
        'id': sampler_connector.id,
        'connector_state_id': state.id
    })


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_all_intervals(request:HttpRequest, project_id, domain_id) -> JsonResponse:
    """Create all intervals in a particular domain.
    ---
    parameters:
     - name: domain_id
       description: Domain to add intervals in
       type: integer:
       required: true
     - name: intervals
       description: A list of two-element lists, with start and end node each
       type: array:
       items:
         type: string
       required: true
     - name: added_nodes
       description: |
         A JSON encoded list of lists, each inner list of format: [id, child,
         parent, x,y,z], representing an interval node filter. Matching nodes
         will be created if collinear.
       type: string
       required: false
    """
    domain_id = int(domain_id)
    domain = SamplerDomain.objects.get(id=domain_id)
    skeleton_id = domain.sampler.skeleton_id

    state = SamplerIntervalState.objects.get(name='untouched')

    intervals = [(int(x[0]), int(x[1])) for x in
            get_request_list(request.POST, 'intervals', [], map_fn=lambda x: x)]
    interval_start_index = dict((n[0], n) for n in intervals)
    added_nodes = json.loads(request.POST.get('added_nodes', '[]'))
    for data in added_nodes:
        data[0], data[1], data[2] = int(data[0]), int(data[1]), int(data[2])
    added_node_index = dict((n[0], n) for n in added_nodes)

    label_class = Class.objects.get(project=project_id, class_name='label')
    labeled_as = Relation.objects.get(project=project_id,
            relation_name='labeled_as')

    def create_added_node(data, new_nodes):
        # Try to get parent from newly created nodes. If not available from
        # there, assume the node exists in the database.
        parent = new_nodes.get(data[2])
        if not parent:
            parent = Treenode.objects.get(pk=data[2])
        x, y, z = float(data[3]), float(data[4]), float(data[5])
        n = Treenode.objects.create(project_id=project_id, parent_id=parent.id,
                user=request.user, editor=request.user, location_x=x, location_y=y,
                location_z=z, radius=0, confidence=5, skeleton_id=skeleton_id)

        return n

    def link_added_node(data, new_nodes):
        # The target node has to be a new node
        n = new_nodes[data[0]]
        # Find child and parent of new treenode. Check first if they have been
        # created as newly as well.
        child = new_nodes.get(data[1])
        if not child:
            child = Treenode.objects.get(pk=data[1])
        parent = new_nodes.get(data[2])
        if not parent:
            parent = Treenode.objects.get(pk=data[2])

        # Make sure both nodes are actually child and parent
        if not child.parent == parent:
            raise ValueError('The provided nodes need to be child and parent')

        x, y, z = n.location_x, n.location_y, n.location_z
        new_node_loc = Point3D(x, y, z)
        child_loc = Point3D(child.location_x, child.location_y, child.location_z)
        parent_loc = Point3D(parent.location_x, parent.location_y, parent.location_z)

        if not is_collinear(child_loc, parent_loc, new_node_loc, True, epsilon):
            raise ValueError('New node location has to be collinear with child ' +
                    'and parent. Child: {}, New Node: {}, Parent: {}'.format(
                            child_loc, new_node_loc, parent_loc))

        # Tag new treenode with SAMPLER_CREATED_CLASS
        label, _ = ClassInstance.objects.get_or_create(project_id=project_id,
                name=SAMPLER_CREATED_CLASS, class_column=label_class, defaults={
                    'user': request.user
                })
        TreenodeClassInstance.objects.create(project_id=project_id,
                user=request.user, relation=labeled_as, treenode=n,
                class_instance=label)

        # Update child node. Reviews don't need to be updated, because they are
        # only reset of a node's location changes.
        child.parent_id = n.id
        child.save()

    # Sort intervals so that we create them in reverse. Each node needs to
    # reference a potentially newly created parent node.
    existing_parent_intervals = [i for i in intervals
            if i[0] not in added_node_index]
    # Iterate over root intervals and create child nodes until another existing
    # node is found.
    new_nodes = dict() # type: Dict
    for root_interval in existing_parent_intervals:
        current_interval = root_interval
        while current_interval:
            child_id = current_interval[1]
            new_child_data = added_node_index.get(child_id)
            if new_child_data:
                new_nodes[child_id] = create_added_node(new_child_data, new_nodes)
                current_interval = interval_start_index.get(child_id)
            else:
                break

    # Ensure that all parents of existing children are set correctly to newly
    # createad nodes.
    for data in added_nodes:
        link_added_node(data, new_nodes)

    # Create actual intervals
    result_intervals = []
    for i in intervals:
        start_node = int(i[0])
        end_node = int(i[1])

        added_start_node_data = added_node_index.get(start_node)
        if added_start_node_data:
            start_node = new_nodes[start_node].id

        added_end_node_data = added_node_index.get(end_node)
        if added_end_node_data:
            end_node = new_nodes[end_node].id

        i = SamplerInterval.objects.create(
            domain=domain,
            interval_state=state,
            start_node_id=start_node,
            end_node_id=end_node,
            user=request.user,
            project_id=project_id)

        result_intervals.append({
            "id": i.id,
            "interval_state_id": i.interval_state_id,
            "start_node_id": i.start_node_id,
            "end_node_id": i.end_node_id,
            "user_id": i.user_id,
            "project_id": i.project_id
        })

    return JsonResponse({
        'intervals': result_intervals,
        'n_added_nodes': len(new_nodes)
    })


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_domain_intervals(request:HttpRequest, project_id, domain_id) -> JsonResponse:
    """Get a collection of available sampler domains intervals.
    ---
    parameters:
     - name: domain_id
       description: Domain to list intervals for
       type: integer
       paramType: form
       required: true
    models:
      interval_entity:
        id: interval_entity
        description: A result domain interval.
        properties:
          id:
            type: integer
            description: Id of interval
          creation_time:
            type: string
            description: The point in time the interval was created
            required: true
          edition_time:
            type: string
            description: The last point in time the interval was edited.
            required: true
          state_id:
            type: integer
            description: ID of interval state
            required: true
          user_id:
            type: integer
            description: User ID of interval creator.
            required: true
    type:
      intervals:
        type: array
        items:
          $ref: interval_entity
        description: Matching intervals
        required: true
    """
    domain_id = int(domain_id)
    intervals = SamplerInterval.objects.filter(domain_id=domain_id)

    return JsonResponse([{
       'id': i.id,
       'creation_time': float(i.creation_time.strftime('%s')),
       'edition_time': float(i.edition_time.strftime('%s')),
       'state_id': i.interval_state_id,
       'user_id': i.user_id,
       'start_node_id': i.start_node_id,
       'end_node_id': i.end_node_id
    } for i in intervals], safe=False)


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def set_interval_state(request:HttpRequest, project_id, interval_id) -> JsonResponse:
    """Set state of an interval.
    ---
    parameters:
     - name: interval_id
       description: Interval to update state of
       type: integer
       paramType: form
       required: true
    """
    interval_id = int(interval_id)
    interval = SamplerInterval.objects.get(id=interval_id)

    interval_state_id = int(request.POST.get('state_id'))
    if interval_state_id is None:
        raise ValueError("Need interval state ID")

    interval.interval_state_id = interval_state_id
    interval.save()

    return JsonResponse({
        'id': interval.id,
        'interval_state_id': interval.interval_state_id
    })


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def get_interval_details(request, project_id, interval_id):
    """Get details on a particular interval.
    """
    interval_id=int(interval_id)
    interval = SamplerInterval.objects.get(id=interval_id)
    return JsonResponse({
        "id": interval.id,
        "domain_id": interval.domain_id,
        "interval_state": interval.interval_state_id,
        "start_node_id": interval.start_node_id,
        "end_node_id": interval.start_node_id,
        "user_id": interval.user_id,
        "project_id": interval.project_id
    })
