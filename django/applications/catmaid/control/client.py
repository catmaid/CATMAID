# -*- coding: utf-8 -*-

import json

from django.utils.decorators import method_decorator
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache

from typing import Optional

from guardian.utils import get_anonymous_user

from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer, ValidationError
from rest_framework import status
from rest_framework.views import APIView

from catmaid.control.authentication import check_user_role, \
                                           requires_user_role_for_any_project
from catmaid.control.common import get_request_bool
from catmaid.models import ClientDatastore, ClientData, Project, UserRole


class ClientDatastoreSerializer(ModelSerializer):
    class Meta:
        model = ClientDatastore
        read_only_fields = ('id',)
        fields = '__all__'


class ClientDatastoreList(APIView):
    @method_decorator(requires_user_role_for_any_project([UserRole.Browse, UserRole.Annotate]))
    @never_cache
    def get(self, request:Request, format=None) -> Response:
        """List key-value store datastores used by the client.
        ---
        serializer: ClientDatastoreSerializer
        """
        datastores = ClientDatastore.objects.all()
        serializer = ClientDatastoreSerializer(datastores, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role_for_any_project([UserRole.Browse, UserRole.Annotate]))
    def post(self, request:Request, format=None) -> Response:
        """Create a key-value store datastore for the client.

        The request user must not be anonymous and must have browse, annotate
        or administer permissions for at least one project.
        ---
        parameters:
        - name: name
          description: |
            String key for the datastore. This will be used in URLs so may only
            contain alphanumeric characters and hyphens.
          required: true
          type: string
          paramType: form
        serializer: ClientDatastoreSerializer
        """
        if request.user == get_anonymous_user() or not request.user.is_authenticated:
            raise PermissionDenied('Unauthenticated or anonymous users ' \
                                   'can not create datastores.')
        name = request.POST['name']
        if not name:
            raise ValidationError('A name for the datastore must be provided.')

        datastore = ClientDatastore(name=name)
        datastore.full_clean()
        datastore.save()
        serializer = ClientDatastoreSerializer(datastore)
        return Response(serializer.data)


class ClientDatastoreDetail(APIView):
    def delete(self, request:Request, name=None, format=None) -> Response:
        """Delete a key-value store datastore for the client.

        Must be a super user to perform.
        """
        if not request.user.is_superuser:
            raise PermissionDenied('Only super users can delete datastores.')
        datastore = get_object_or_404(ClientDatastore, name=name)
        ClientData.objects.filter(datastore=datastore).delete()
        datastore.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClientDataSerializer(ModelSerializer):
    class Meta:
        model = ClientData
        read_only_fields = ('id',)
        fields = '__all__'


class ClientDataList(APIView):
    @method_decorator(requires_user_role_for_any_project([UserRole.Browse, UserRole.Annotate]))
    @never_cache
    def get(self, request:Request, name=None, format=None) -> Response:
        """List key-value data in a datastore for the client.

        Returns key-values belong to the request user or no user, optionally
        filtering for those pairs belong to a specific project or no project.
        ---
        parameters:
        - name: name
          description: |
            String key for the **datastore** with which this key-value entry is
            associated.
          required: true
          type: string
          paramType: path
        - name: project_id
          description: |
            ID of a project to associate this data with, if any.
          required: false
          type: integer
          paramType: query
        serializer: ClientDataSerializer
        """
        datastore = get_object_or_404(ClientDatastore, name=name)
        data = ClientData.objects.filter(datastore=datastore,
                                         user_id=request.user.id) | \
               ClientData.objects.filter(datastore=datastore,
                                         user_id=None)

        project_id = request.GET.get('project_id', None)
        if project_id:
            project_id = int(project_id)
            project = get_object_or_404(Project, pk=project_id)
            if not check_user_role(request.user,
                                   project,
                                   [UserRole.Browse, UserRole.Annotate]):
                raise PermissionDenied('User lacks the appropriate ' \
                                       'permissions for this project.')

            data = data.filter(project_id=project_id) | data.filter(project_id=None)
        else:
            data = data.filter(project_id=None)

        serializer = ClientDataSerializer(data, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role_for_any_project([UserRole.Browse, UserRole.Annotate]))
    def put(self, request:Request, name:Optional[int]=None, format=None) -> Response:
        """Create or replace a key-value data entry for the client.

        Each entry is associated with a datastore, an optional project, an
        optional user, and a key. Creating a request that duplicates this
        quadruple will replace rather than create the value in the key-value
        pair.

        Entries associated with neither a project nor user are considered
        global; those associated with a project but no user are project-
        default; those associated with a user but no project are user-default;
        and those associated with both a project and a user are user-project
        specific. When listing key-value data, all four of these values, if
        existing, will be returned.
        ---
        parameters:
        - name: name
          description: |
            String key for the **datastore** with which this key-value entry is
            associated.
          required: true
          type: string
          paramType: path
        - name: project_id
          description: |
            ID of a project to associate this data with, if any.
          required: false
          type: integer
          paramType: form
        - name: ignore_user
          description: |
            Whether to associate this key-value entry with the instance rather
            than the request user. Only project administrators can do this
            for project-associated instance data, and only super users can do
            this for global data (instance data not associated with any
            project).
          required: false
          type: boolean
          default: false
          paramType: form
        - name: key
          description: A key for this entry.
          required: true
          type: string
          paramType: form
        - name: value
          description: A value for this entry. Must be valid JSON.
          required: true
          type: string
          paramType: form
        - name: format
          description: This function parameter is ignored
          required: false
          type: Any
          default: None
        response_serializer: ClientDataSerializer
        """
        if request.user == get_anonymous_user() or not request.user.is_authenticated:
            raise PermissionDenied('Unauthenticated or anonymous users ' \
                                   'can not create data.')
        datastore = get_object_or_404(ClientDatastore, name=name)

        key = request.data.get('key', None)
        if not key:
            raise ValidationError('A key for the data must be provided.')

        value = request.data.get('value', None)
        if not value:
            raise ValidationError('A value for the data must be provided.')
        # Validate JSON by reserializing.
        try:
            value = json.loads(value)
        except ValueError as exc:
            raise ValidationError('Data value is invalid JSON: ' + str(exc))

        project_id = request.data.get('project_id', None)
        project = None
        if project_id:
            project_id = int(project_id)
            project = get_object_or_404(Project, pk=project_id)
            if not check_user_role(request.user,
                                   project,
                                   [UserRole.Browse, UserRole.Annotate]):
                raise PermissionDenied('User lacks the appropriate ' \
                                       'permissions for this project.')

        ignore_user = get_request_bool(request.data, 'ignore_user', False)
        if ignore_user and not project_id:
            if not request.user.is_superuser:
                raise PermissionDenied('Only super users can create instance ' \
                                       'data.')
        if ignore_user:
            if not check_user_role(request.user,
                                   project,
                                   [UserRole.Admin]):
                raise PermissionDenied('Only administrators can create ' \
                                       'project default data.')
        user = None if ignore_user else request.user

        try:
            data = ClientData.objects.get(datastore=datastore,
                                          key=key,
                                          project=project,
                                          user=user)
            data.value = value
            data.full_clean()
            data.save()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ClientData.DoesNotExist:
            data = ClientData(datastore=datastore,
                              key=key,
                              value=value,
                              project=project,
                              user=user)
            data.full_clean()
            data.save()
            serializer = ClientDataSerializer(data)
            return Response(serializer.data)
