from django.db import connection
from django.http import JsonResponse

from catmaid.control.authentication import requires_user_role, user_can_edit
from catmaid.control.common import get_request_list
from catmaid.models import (Sampler, SamplerDomain, SamplerDomainType,
        SamplerDomainEnd, SamplerInterval, SamplerIntervalState, SamplerState,
        UserRole)

from rest_framework.decorators import api_view


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_samplers(request, project_id):
    """Get a collection of available samplers.

    Optionally, the "skeleton_id" parameter can provide a skeleton ID. If this
    is the case, only samplers for the respective skeleton are returned.
    ---
    parameters:
     - name: skeleton_id
       description: Optional skeleton ID to constrain result set to.
       type: integer
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
    skeleton_id = request.GET.get('skeleton_id')
    if skeleton_id:
        skeleton_id = int(skeleton_id)

    samplers = Sampler.objects.all()

    if skeleton_id:
        samplers = samplers.filter(skeleton_id=skeleton_id)

    return JsonResponse([{
       'id': s.id,
       'creation_time': float(s.creation_time.strftime('%s')),
       'edition_time': float(s.edition_time.strftime('%s')),
       'interval_length': s.interval_length,
       'state_id': s.sampler_state_id,
       'skeleton_id': s.skeleton_id,
       'user_id': s.user_id,
    } for s in samplers], safe=False)


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

    sampler_state = SamplerState.objects.get(name="open");

    sampler = Sampler.objects.create(
        skeleton_id=skeleton_id,
        interval_length=interval_length,
        sampler_state=sampler_state,
        user=request.user,
        project_id=project_id)

    return JsonResponse({
        "id": sampler.id,
        "skeleton_id": sampler.skeleton_id,
        "interval_length": sampler.interval_length,
        "sampler_state": sampler.sampler_state_id,
        "user_id": sampler.user_id,
        "project_id": sampler.project_id
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
    """
    domain_id = int(domain_id)
    domain = SamplerDomain.objects.get(id=domain_id)

    state = SamplerIntervalState.objects.get(name='untouched')

    intervals = get_request_list(request.POST, 'intervals', [], map_fn=lambda x: x)

    result_intervals = []
    for i in intervals:
        start_node = int(i[0])
        end_node = int(i[1])

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

    return JsonResponse(result_intervals, safe=False)


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

    interval_state_id = request.POST.get('state_id')
    if interval_state_id is None:
        raise ValueError("Need interval state ID")

    interval.interval_state_id = interval_state_id
    interval.save()

    return JsonResponse({
        'id': interval.id,
        'interval_state_id': interval.interval_state_id
    })
