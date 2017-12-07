import json

from collections import defaultdict

from django.db import connection
from django.http import JsonResponse

from catmaid.control.authentication import (requires_user_role, user_can_edit,
        can_edit_or_fail)
from catmaid.control.common import get_request_list
from catmaid.models import (Class, ClassInstance, Connector, Relation, Sampler,
        SamplerDomain, SamplerDomainType, SamplerDomainEnd, SamplerInterval,
        SamplerIntervalState, SamplerState, SamplerConnector,
        SamplerConnectorState, Treenode, TreenodeClassInstance, UserRole)
from catmaid.util import Point3D, is_collinear

from rest_framework.decorators import api_view


SAMPLER_CREATED_CLASS = "sampler-created"

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_samplers(request, project_id):
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
    with_domains = bool(request.GET.get('with_domains', False))

    samplers = Sampler.objects.all()
    if skeleton_ids:
        samplers = samplers.filter(skeleton_id__in=skeleton_ids)

    domains = defaultdict(list)
    if with_domains:
        domain_query = SamplerDomain.objects.filter(sampler__in=samplers) \
                .prefetch_related('samplerdomainend_set')
        for domain in domain_query:
            domain_ends = domain.samplerdomainend_set.all()
            domains[domain.sampler_id].append({
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

    def exportSampler(s):
        s = {
           'id': s.id,
           'creation_time': float(s.creation_time.strftime('%s')),
           'edition_time': float(s.edition_time.strftime('%s')),
           'interval_length': s.interval_length,
           'review_required': s.review_required,
           'state_id': s.sampler_state_id,
           'skeleton_id': s.skeleton_id,
           'user_id': s.user_id,
        }

        if with_domains:
            s['domains'] = domains.get(s['id'], [])

        return s

    return JsonResponse([exportSampler(s) for s in samplers], safe=False)


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_sampler(request, project_id):
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
     - name: review_required
       description: Whether reviews should be enforced in this sampler
       type: boolean
       paramType: form
       required: true
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

    review_required = request.POST.get('review_required')
    if review_required:
        review_required = review_required == 'true'
    else:
        raise ValueError("Need review_required parameter")

    sampler_state = SamplerState.objects.get(name="open");

    sampler = Sampler.objects.create(
        skeleton_id=skeleton_id,
        interval_length=interval_length,
        review_required=review_required,
        sampler_state=sampler_state,
        user=request.user,
        project_id=project_id)

    return JsonResponse({
        "id": sampler.id,
        "skeleton_id": sampler.skeleton_id,
        "interval_length": sampler.interval_length,
        "review_required": sampler.review_required,
        "sampler_state": sampler.sampler_state_id,
        "user_id": sampler.user_id,
        "project_id": sampler.project_id
    })

@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def delete_sampler(request, project_id, sampler_id):
    """Delete a sampler if permissions allow it.
    """
    can_edit_or_fail(request.user, sampler_id, "catmaid_sampler")
    sampler = Sampler.objects.get(id=sampler_id)
    sampler.delete()

    return JsonResponse({
        'deleted_sampler_id': sampler_id
    })

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_sampler_states(request, project_id):
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
def list_connector_states(request, project_id):
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
def list_connectors(request, project_id):
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
def list_domain_types(request, project_id):
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
def list_sampler_domains(request, project_id, sampler_id):
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
    domains = SamplerDomain.objects.filter(sampler_id=sampler_id)

    return JsonResponse([{
       'id': d.id,
       'creation_time': float(d.creation_time.strftime('%s')),
       'edition_time': float(d.edition_time.strftime('%s')),
       'parent_interval_id': d.parent_interval_id,
       'start_node_id': d.start_node_id,
       'type_id': d.domain_type_id,
       'user_id': d.user_id,
    } for d in domains], safe=False)


@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_sampler_domain(request, project_id, sampler_id):
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
def add_multiple_sampler_domains(request, project_id, sampler_id):
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
    domains = get_request_list(request.POST, 'domains', map_fn)

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
            start_node=start_node,
            domain_type=domain_type,
            parent_interval_id=parent_interval_id,
            user=request.user,
            project_id=project_id)

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
def list_domain_intervals(request, project_id, domain_id):
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
    } for i in intervals], safe=False)


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def get_domain_details(request, project_id, domain_id):
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
def list_interval_states(request, project_id):
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
def set_connector_state(request, project_id, interval_id, connector_id):
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
def add_all_intervals(request, project_id, domain_id):
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
        child_loc = Point3D(child.location_x, child.location_y, child.location_z)
        parent_loc = Point3D(parent.location_x, parent.location_y, parent.location_z)

        new_node_loc = Point3D(x, y, z)
        if not is_collinear(child_loc, parent_loc, new_node_loc, True, 0.001):
            raise ValueError('New node location has to be collinear with child and parent')

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
    new_nodes = dict()
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
def list_domain_intervals(request, project_id, domain_id):
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
def set_interval_state(request, project_id, interval_id):
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
