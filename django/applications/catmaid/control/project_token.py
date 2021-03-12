from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404

from guardian.shortcuts import assign_perm, get_perms_for_model, remove_perm
from guardian.utils import get_anonymous_user

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer, ValidationError
from rest_framework.views import APIView

from catmaid.control.authentication import requires_user_role, PermissionError
from catmaid.control.common import get_request_bool, get_request_list
from catmaid.models import (FavoriteProject, Project, ProjectToken, UserRole,
        UserProjectToken)


def get_token_visible_groups(user_id):
    """
    For now it is not possible to get a list of token visible groups.
    """
    return []


def get_token_visible_users(user_id, with_anon_user=True):
    cursor = connection.cursor()
    query = """
        WITH project_tokens AS (
            SELECT DISTINCT project_token_id AS id
            FROM catmaid_user_project_token
            WHERE user_id = %(user_id)s

            UNION

            SELECT id
            FROM catmaid_project_token
            WHERE user_id = %(user_id)s
        )
        SELECT DISTINCT ON (au.id) au.id
        FROM project_tokens pt
        JOIN catmaid_user_project_token upt
            ON pt.id = upt.project_token_id
        JOIN auth_user au
            ON au.id = upt.user_id
        JOIN catmaid_userprofile up
            ON up.user_id = au.id
    """
    params = {
        'user_id': user_id,
    }

    if with_anon_user:
        anon_user = get_anonymous_user()
        query += """
            UNION

            SELECT au.id
            FROM auth_user au
            JOIN catmaid_userprofile up
                ON up.user_id = au.id
            WHERE au.id = %(user_id)s OR au.id = %(anon_user_id)s
        """
        params['anon_user_id'] = anon_user.id

    cursor.execute(query, params)

    return list(map(lambda x: x[0], cursor.fetchall()))


class SimpleProjectTokenSerializer(ModelSerializer):

    class Meta:
        model = ProjectToken
        read_only_fields = ('id',)
        fields = '__all__'


class ProjectTokenList(APIView):

    @method_decorator(requires_user_role([UserRole.Admin]))
    @never_cache
    def get(self, request:Request, project_id) -> Response:
        """List project tokens available for this project, if the user is an
        admin.
        ---
        serializer: SimpleProjectTokenSerializer
        """
        tokens = ProjectToken.objects.filter(project_id=project_id)
        serializer = SimpleProjectTokenSerializer(tokens, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role([UserRole.Admin]))
    def post(self, request:Request, project_id) -> Response:
        """Create a new project token.

        The request requires admin permissions in the project.
        ---
        serializer: SimpleProjectTokenSerializer
        """
        project = get_object_or_404(Project, pk=project_id)

        name = request.POST.get('name', '')
        needs_approval = get_request_bool(request.POST, 'needs_approval', False)
        default_permissions = set(get_request_list(request.POST, 'default_permissions', []))
        allowed_permissions = set(get_perms_for_model(Project).values_list('codename', flat=True))
        unknown_permissions = default_permissions - allowed_permissions
        if unknown_permissions:
            raise ValueError(f'Unknown permissions: {", ".join(unknown_permissions)}')

        token = ProjectToken.objects.create(**{
            'name': name,
            'user_id': request.user.id,
            'project_id': project.id,
            'needs_approval': needs_approval,
            'default_permissions': default_permissions,
        })
        if not name:
            token.name = f'Project token {token.id}'
            token.save()

        serializer = SimpleProjectTokenSerializer(token)
        return Response(serializer.data)


class UserProjectTokenList(APIView):

    @never_cache
    def get(self, request:Request, project_id) -> JsonResponse:
        """List project tokens available for this project and user.
        ---
        serializer: SimpleProjectTokenSerializer
        """
        token_ids = list(ProjectToken.objects.filter(project_id=project_id,
                userprojecttoken__user_id=request.user.id).values_list('id', flat=True))
        return JsonResponse(token_ids, safe=False)


class ProjectTokenApplicator(APIView):

    @method_decorator(login_required)
    def post(self, request:Request) -> Response:
        """Apply a project token.

        serializer: SimpleProjectTokenSerializer
        """
        if request.user.is_anonymous:
            raise PermissionError("Anonymous users can't apply tokens")

        token = get_object_or_404(ProjectToken, token=request.POST.get('token'))
        favorite = get_request_bool(request.POST, 'favorite', True)

        if not token.enabled:
            raise ValueError("Can't apply token")

        for perm in token.default_permissions:
            assign_perm(perm, request.user, token.project)

        upt = UserProjectToken.objects.create(**{
            'user': request.user,
            'project_token': token,
            'enabled': not token.needs_approval,
        })

        if favorite:
            fp = FavoriteProject.objects.create(**{
                'project_id': token.project_id,
                'user_id': request.user.id,
            })

        return Response({
            'project_id': token.project_id,
            'permissions': token.default_permissions,
            'needs_approval': token.needs_approval,
        })


class ProjectTokenRevoker(APIView):

    @method_decorator(login_required)
    def post(self, request:Request, project_id) -> Response:
        """Revoke a project token.
        ---
        parameters:
          - name: token
            required: true

        serializer: SimpleProjectTokenSerializer
        """
        if request.user.is_anonymous:
            raise PermissionError("Anonymous users can't revoke tokens")

        token = get_object_or_404(ProjectToken, pk=request.POST.get('token_id'))

        for perm in token.default_permissions:
            remove_perm(perm, request.user, token.project)

        delete = UserProjectToken.objects.filter(project_token=token,
                user_id=request.user.id).delete()

        return Response({
            'delete': delete,
        })
