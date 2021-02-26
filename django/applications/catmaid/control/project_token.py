from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404

from guardian.shortcuts import assign_perm, get_perms_for_model

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer, ValidationError
from rest_framework.views import APIView

from catmaid.control.authentication import requires_user_role, PermissionError
from catmaid.control.common import get_request_bool, get_request_list
from catmaid.models import (FavoriteProject, Project, ProjectToken, UserRole,
        UserProjectToken)


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
