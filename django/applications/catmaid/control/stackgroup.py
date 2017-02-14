# -*- coding: utf-8 -*-
from __future__ import unicode_literals

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
        .filter(project_id=project_id, stackgroup=stackgroup_id) \
        .order_by('id') \
        .select_related('relation')
    stacks = [l.stack_id for l in stackgroup_links]

    result = {
        'id': stackgroup.id,
        'project_id': stackgroup.project_id,
        'title': stackgroup.title,
        'stacks': [{
            'id': l.stack_id,
            'relation': l.relation.name,
            'position': l.position
        } for l in stackgroup_links]
    }

    return JsonResponse(result)
