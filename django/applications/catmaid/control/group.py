# -*- coding: utf-8 -*-
import logging

from django.db import connection
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.decorators import user_passes_test
from django.http import HttpRequest, JsonResponse
from django.utils.decorators import method_decorator

from rest_framework.views import APIView
from rest_framework.request import Request
from rest_framework.response import Response

from catmaid.control.authentication import requires_user_role, access_check, PermissionError
from catmaid.control.common import get_request_list
from catmaid.models import UserRole
from catmaid.control.project_token import get_token_visible_users, get_token_visible_groups

User = get_user_model()

logger = logging.getLogger('__name__')


class GroupList(APIView):

    def get(self, request:HttpRequest) -> JsonResponse:
        """List all available user groups.
        ---
        parameters:
          - name: member_id
            description: Return only groups this user is member of.
            type: integer
            paramType: form
            required: false
        """
        if not access_check(request.user):
            return JsonResponse([], safe=False)

        member_id = request.query_params.get('member_id')

        if member_id is not None:
            member_id = int(member_id)
            user = User.objects.get(pk=member_id)
            groups = [{
                'id': g.id,
                'name': g.name,
            } for g in user.groups.all()]
        elif settings.PROJECT_TOKEN_USER_VISIBILITY:
            groups = []
        else:
            groups = [{
                'id': g.id,
                'name': g.name,
            } for g in Group.objects.all()]

        return JsonResponse(groups, safe=False)


# Find all users in source groups
def explode_group_into_users(groups, users):
    if groups:
        group_users = User.objects.filter(groups__in=groups) \
            .values_list('id', flat=True)
        users.update(group_users)


def update_group_memberships(action, source_users, source_groups, target_users,
        target_groups):
    if action not in ('add', 'revoke'):
        raise ValueError('Action needs to be "add" or "revoke"')

    explode_group_into_users(source_groups, source_users)
    if not source_users:
        raise ValueError('Need at least one source user or non-empty source group')

    explode_group_into_users(target_groups, target_users)
    if not target_users:
        raise ValueError('Need at least one target user or non-empty target group')

    # We now have a set of source users and a set of target users. This
    # allows us to create the requested group memberships. Each source
    # user is added to each target user group.
    updated = 0
    warnings = []
    for target_user in target_users:
        users = User.objects.filter(id=target_user)
        n_user_instances = len(users)
        if 0 == n_user_instances:
            warnings.append(f'Could not find user with ID {target_user}')
            continue
        if 1 < n_user_instances:
            warnings.append(f'Found more than one user with ID {target_user}')
            continue

        user = users[0]

        group, _ = Group.objects.get_or_create(name=user.username)
        if 'add' == action:
            group.user_set.add(*source_users)
            updated += 1
        elif 'revoke' == action:
            group.user_set.remove(*source_users)
            updated += 1

    return updated, warnings


class GroupMemberships(APIView):
    """
    Update the group membership of multiple users at once.
    """

    @method_decorator(requires_user_role(UserRole.Admin))
    def post(self, request:Request, project_id) -> Response:
        """
        Update the group membership of multiple users at once.

        Users and groups as well as their memberships are global, therefore this
        action requires either superuser status or project tokens need to be in
        use. If the latter is the case, the requesting user is expected to have
        a) admin permission in the current project and is b) only allowed to
        change users and groups visible to them.
        """
        action = request.POST.get('action')
        if action not in ('add', 'revoke'):
            raise ValueError('Action needs to be "add" or "revoke"')

        # Collect user and group information
        source_users =  set(get_request_list(request.POST, 'source_users', [], int))
        source_groups = set(get_request_list(request.POST, 'source_groups', [], int))
        target_users =  set(get_request_list(request.POST, 'target_users', [], int))
        target_groups = set(get_request_list(request.POST, 'target_groups', [], int))

        # Check permissions
        if settings.PROJECT_TOKEN_USER_VISIBILITY and not request.user.is_superuser:
            # Find all visible users and groups
            visible_user_ids = get_token_visible_users(request.user.id)
            visible_group_ids = get_token_visible_groups(request.user.id)


            invisible_user_ids = (set(source_users).union(set(target_users))).difference(set(visible_user_ids))
            if invisible_user_ids:
                raise PermissionError('This request includes users beyond the allowed scope')
        elif not request.user.is_superuser:
            raise PermissionError('Need superuser permission')

        updated, warnings = update_group_memberships(action, source_users, source_groups,
                target_users, target_groups)

        return JsonResponse({
            'updated_users': updated,
            'warnings': warnings,
        })
