import json
import datetime
import random
import numpy as np
import re

from django.db.models import Q
from django.http import HttpResponseRedirect
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.contrib.auth.hashers import check_password, make_password
from django.shortcuts import render
from django.urls import reverse

from guardian.utils import get_anonymous_user

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer, ValidationError
from rest_framework.views import APIView

from catmaid.control.common import get_request_bool, get_request_list
from catmaid.control.authentication import (check_user_role, can_edit_or_fail,
                                           requires_user_role_for_any_project,
                                           PermissionError)
from catmaid.models import DeepLink, DeepLinkStack, DeepLinkStackGroup, UserRole


def make_unique_id():
    """Generate a short (six characters) ID for a new deep link. This method is
    based on the code suggested here: https://stackoverflow.com/a/6248722/1665417.
    It was expanded to seven digits. This should have a chance of 0.06% of
    collission in 10000 IDs. This should be plenty here.
    """
    first_part_raw = int(random.random() * 46656) | 0
    second_part_raw = int(random.random() * 1679616) | 0
    first_part = f'{000}{np.base_repr(first_part_raw, base=36)}'[-3].lower()
    second_part = f'{0000}{np.base_repr(second_part_raw, base=36)}'[-4].lower()
    return first_part + second_part


class DeepLinkStackSerializer(ModelSerializer):

    class Meta:
        model = DeepLinkStack
        read_only_fields = ('id',)
        fields = (
            'stack_id',
            'zoom_level',
        )


class DeepLinkSerializer(ModelSerializer):

    stacks = DeepLinkStackSerializer(read_only=True, many=True) # many=True is required

    class Meta:
        model = DeepLink
        read_only_fields = ('id',)
        fields = (
            'id',
            'alias',
            'is_public',
            'is_exportable',
            'location_x',
            'location_y',
            'location_z',
            'active_treenode',
            'active_connector',
            'active_skeleton',
            'layout',
            'tool',
            'show_help',
            'message',
            'data_view',
            'stacks',
        )


class SimpleDeepLinkSerializer(ModelSerializer):

    class Meta:
        model = DeepLink
        read_only_fields = ('id',)
        fields = '__all__'


class DeepLinkList(APIView):

    @method_decorator(requires_user_role_for_any_project([UserRole.Browse]))
    @never_cache
    def get(self, request:Request, project_id) -> Response:
        """List deep-links available to the client.
        ---
        serializer: SimpleDeepLinkSerializer
        """
        only_own = get_request_bool(request.GET, 'only_own', False)
        only_private = get_request_bool(request.GET, 'only_private', False)

        filter_term = (Q(is_public=True) | Q(user_id=request.user.id)) & Q(project_id=project_id)

        if only_own:
            filter_term = filter_term & Q(user_id=request.user.id)

        if only_private:
            filter_term = filter_term & Q(is_public=False)

        deep_links = DeepLink.objects.filter(filter_term)
        serializer = SimpleDeepLinkSerializer(deep_links, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role_for_any_project([UserRole.Annotate]))
    def post(self, request:Request, project_id) -> Response:
        """Create a deep-link.

        The request user must not be anonymous and must have annotate
        permissions.
        ---
        serializer: DeepLinkSerializer
        """
        if request.user == get_anonymous_user() or not request.user.is_authenticated:
            raise PermissionError('Unauthenticated or anonymous users ' \
                                   'can not create persistent deep links.')

        project_id = int(project_id)

        alias = request.POST.get('alias')
        if alias:
            if not re.match(r'^[a-zA-Z0-9-_\.]+$', alias):
                raise ValueError("Only alphanumeric characters, '-', '_' and '.' allowed")
        else:
            n_links = DeepLink.objects.filter(project_id=project_id).count()
            alias = make_unique_id()

        params = {
            'project_id': project_id,
            'user': request.user,
            'alias': alias,
        }

        if 'is_public' in request.POST:
            params['is_public'] = get_request_bool(request.POST, 'is_public')

        if 'is_exportable' in request.POST:
            params['is_exportable'] = get_request_bool(request.POST, 'is_exportable')

        if 'location_x' in request.POST:
            params['location_x'] = float(request.POST['location_x'])

        if 'location_y' in request.POST:
            params['location_y'] = float(request.POST['location_y'])

        if 'location_z' in request.POST:
            params['location_z'] = float(request.POST['location_z'])

        if 'active_treenode_id' in request.POST:
            params['active_treenode_id'] = int(request.POST['active_treenode_id'])

        if 'active_connector_id' in request.POST:
            params['active_connector_id'] = int(request.POST['active_connector_id'])

        if 'active_skeleton_id' in request.POST:
            params['active_skeleton_id'] = int(request.POST['active_skeleton_id'])

        if 'closest_node_to_location' in request.POST:
            params['closest_node_to_location'] = get_request_bool(request.POST, 'closest_node_to_location')

        if 'follow_id_history' in request.POST:
            params['follow_id_history'] = get_request_bool(request.POST, 'follow_id_history')

        if 'layered_stacks' in request.POST:
            params['layered_stacks'] = get_request_bool(request.POST, 'layered_stacks')

        if 'layout' in request.POST:
            params['layout'] = request.POST['layout']

        if 'tool' in request.POST:
            params['tool'] = request.POST['tool']

        if 'show_help' in request.POST:
            params['show_help'] = get_request_bool(request.POST, 'show_help')

        if 'password' in request.POST:
            params['password'] = make_password(request.POST('password'))

        if 'message' in request.POST:
            params['message'] = request.POST['message']

        # TBA: data_view

        deeplink = DeepLink(**params)
        deeplink.save()
        serializer = DeepLinkSerializer(deeplink)

        # Stacks
        stacks = get_request_list(request.POST, 'stacks', map_fn=float)
        if stacks:
            # Nested lists of 2-tuples: [[stack_id, scale_level]]
            for s in stacks:
                stack_link = DeepLinkStack(**{
                    'project_id': project_id,
                    'user_id': request.user.id,
                    'deep_link': deeplink,
                    'stack_id': int(s[0]),
                    'zoom_level': s[1],
                })
                stack_link.save()

        # Stack groups
        if 'stack_group' in request.POST:
            sg_id = int(request.POST['stack_group'])
            sg_zoom_levels = get_request_list(request.POST,
                'stack_group_scale_levels', map_fn=float)
            sg_link = DeepLinkStackGroup(**{
                'project_id': project_id,
                'user_id': request.user.id,
                'deep_link': deeplink,
                'stack_group_id': sg_id,
                'zoom_levels': sg_zoom_levels,
            })
            sg_link.save()

        return Response(serializer.data)


class DeepLinkSelector(APIView):

    @never_cache
    def get(self, request:Request, project_id, alias) -> Response:
        """Get a deep-links available to the client.

        No specific permissions are needed here, because this just rewrites a
        URL and the client can handle the potential permission error in a more
        user-friendly manner.
        ---
        serializer: DeepLinkSerializer
        """
        params = [f'pid={project_id}', f'link={alias}']
        url = f'{reverse("catmaid:home")}?{"&".join(params)}'
        return HttpResponseRedirect(url)

    @method_decorator(requires_user_role_for_any_project([UserRole.Browse]))
    @never_cache
    def head(self, request:Request, project_id, alias) -> Response:
        """Get a deep-links available to the client.
        ---
        serializer: DeepLinkSerializer
        """
        try:
            deep_link = DeepLink.objects.get(project_id=project_id, alias=alias)
            if not deep_link.is_public and request.user != deep_link.user:
                raise PermissionError('Can not find or access link')
            return Response()
        except DeepLink.DoesNotExist:
            return Response('Link not found', status=status.HTTP_404_NOT_FOUND)

    @method_decorator(requires_user_role_for_any_project([UserRole.Annotate]))
    @never_cache
    def delete(self, request:Request, project_id, alias) -> Response:
        """Delete a deep-links available to the client.
        ---
        serializer: DeepLinkSerializer
        """
        try:
            deep_link = DeepLink.objects.get(project_id=project_id, alias=alias)
            can_edit_or_fail(request.user, deep_link.id, 'catmaid_deep_link')
            deep_link_id = deep_link.id
            deep_link.delete()
            return Response({
                'deleted_id': deep_link_id
            })
        except DeepLink.DoesNotExist:
            return Response('Link not found', status=status.HTTP_404_NOT_FOUND)


class DeepLinkDetails(APIView):

    @method_decorator(requires_user_role_for_any_project([UserRole.Browse]))
    @never_cache
    def get(self, request:Request, project_id, alias) -> Response:
        """Get details on a deep-link.
        ---
        serializer: DeepLinkSerializer
        """
        try:
            deep_link = DeepLink.objects.get(project_id=project_id, alias=alias)
            if not deep_link.is_public and request.user != deep_link.user:
                raise PermissionError('Can not find or access link')
            serializer = DeepLinkSerializer(deep_link)
            return Response(serializer.data)
        except DeepLink.DoesNotExist:
            return Response('Link not found', status=status.HTTP_404_NOT_FOUND)


class DeepLinkByIdSelector(APIView):

    @method_decorator(requires_user_role_for_any_project([UserRole.Annotate]))
    @never_cache
    def delete(self, request:Request, project_id, link_id) -> Response:
        """Delete a deep-links available to the client.
        ---
        serializer: DeepLinkSerializer
        """
        try:
            deep_link = DeepLink.objects.get(project_id=project_id, id=link_id)
            can_edit_or_fail(request.user, deep_link.id, 'catmaid_deep_link')
            deep_link.delete()
            return Response({
                'deleted_id': link_id
            })
        except DeepLink.DoesNotExist:
            return Response('Link not found', status=status.HTTP_404_NOT_FOUND)
