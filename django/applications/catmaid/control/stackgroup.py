# -*- coding: utf-8 -*-

import json

from catmaid.control.authentication import requires_user_role
from catmaid.models import StackGroup, StackStackGroup, UserRole
from django.http import JsonResponse


@requires_user_role(UserRole.Browse)
def get_stackgroup_info(request, project_id, stackgroup_id):
    """Get detailed informated about a stack group. This includes the linked
    stacks and what relations they use.
    """
    stackgroup = StackGroup.objects.get(id=stackgroup_id)
    stackgroup_links = StackStackGroup.objects \
        .filter(stack_group=stackgroup_id) \
        .order_by('position') \
        .select_related('group_relation')
    stacks = [l.stack_id for l in stackgroup_links]

    result = {
        'id': stackgroup.id,
        'project_id': project_id,
        'title': stackgroup.title,
        'stacks': [{
            'id': l.stack_id,
            'relation': l.group_relation.name,
            'position': l.position
        } for l in stackgroup_links]
    }

    return JsonResponse(result)
