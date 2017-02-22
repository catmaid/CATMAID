from django.db import connection
from django.http import JsonResponse

from catmaid.control.authentication import requires_user_role, user_can_edit
from catmaid.models import (Sampler, SamplerDomain, SamplerInterval,
        SamplerState, UserRole)

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
def list_sampler_domains(request, project_id, sampler_id):
    pass

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def list_domain_intervals(request, project_id, domain_id):
    pass
