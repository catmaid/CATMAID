# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.models import Class, ClassInstance, UserRole
from catmaid.serializers import BasicClassInstanceSerializer

from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer
from rest_framework.views import APIView


class LandmarkList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """List available landmarks, optionally only the ones in a set of landmark
        groups.
        ---
        parameters:
          - name: project_id
            description: Project of landmark
            type: integer
            paramType: path
            required: true
        """
        with_members = request.data.get('with_members', 'false') == 'true'
        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmarks = ClassInstance.objects.filter(project_id=project_id,
                class_column=landmark_class).order_by('id')
        serializer = BasicClassInstanceSerializer(landmarks, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request, project_id):
        """Add a new landmark. Expect at least the name as parameter.
        ---
        parameters:
          - name: project_id
            description: Project of landmark
            type: integer
            paramType: path
            required: true
          - name: name
            description: Name of new landmark
            type: string
            required: true
        """
        name = request.data.get('name')
        landmark_class = Class.objects.get(project_id=project_id, class_name='landmark')

        # Prevent creation of duplicate landmarks
        existing_landmarks = ClassInstance.objects.filter(project_id=project_id,
                name=name, class_column=landmark_class)
        if existing_landmarks:
            raise ValueError("There is already a landmark with name {}".format(name))

        landmark = ClassInstance.objects.create(project_id=project_id,
                class_column=landmark_class, user=request.user,
                name=name)
        landmark.save()

        serializer = BasicClassInstanceSerializer(landmark)
        return Response(serializer.data)

class LandmarkDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id, landmark_id):
        """Get details on one particular landmark.
        ---
        parameters:
        - name: project_id
          description: The project the landmark is part of.
          type: integer
          paramType: path
          required: true
        - name: landmark_id
          description: The ID of the landmark.
          required: true
          type: integer
          paramType: path
        """
        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmark = get_object_or_404(ClassInstance, pk=landmark_id,
                project_id=project_id, class_column=landmark_class)

        serializer = BasicClassInstanceSerializer(landmark)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request, project_id, landmark_id):
        """Update an existing landmark.

        Currently, only the name can be updated.
        ---
        parameters:
        - name: project_id
          description: The project the landmark is part of.
          type: integer
          paramType: path
          required: true
        - name: landmark_id
          description: The ID of the landmark.
          required: true
          type: integer
          paramType: path
        - name: name
          description: The name of the landmark.
          required: false
          type: string
          paramType: form
        """
        can_edit_or_fail(request.user, landmark_id, 'class_instance')
        name = request.data.get('name')
        if not name:
            raise ValueError('Need name for update')

        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmark = get_object_or_404(ClassInstance, pk=landmark_id,
                project_id=project_id, class_column=landmark_class)
        landmark.name = name
        landmark.save()

        landmark.id = None

        serializer = BasicClassInstanceSerializer(landmark)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, landmark_id):
        """Delete one particular landmark.
        ---
        parameters:
        - name: project_id
          description: The project the landmark is part of.
          type: integer
          paramType: path
          required: true
        - name: landmark_id
          description: The ID of the landmark.
          required: true
          type: integer
          paramType: path
        """
        can_edit_or_fail(request.user, landmark_id, 'class_instance')

        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmark = get_object_or_404(ClassInstance, pk=landmark_id,
                project_id=project_id, class_column=landmark_class)
        landmark.delete()

        landmark.id = None

        serializer = BasicClassInstanceSerializer(landmark)
        return Response(serializer.data)

class LandmarkGroupList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """List available landmark groups.
        ---
        parameters:
          - name: project_id
            description: Project of landmark groups
            type: integer
            paramType: path
            required: true
          - name: with_members
            description: Whether to return group members
            type: boolean
            paramType: form
            defaultValue: false
            required: false
        """
        with_members = request.query_params.get('with_members', 'false') == 'true'
        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name="landmarkgroup")
        landmarkgroups = ClassInstance.objects.filter(project_id=project_id,
                class_column=landmarkgroup_class).order_by('id')

        serializer = BasicClassInstanceSerializer(landmarkgroups, many=True)
        data = serializer.data

        if with_members:
            # Append member information
            for group in data:
                group['members'] = []

        return Response(data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request, project_id):
        """Add a new landmarkgroup. Expect at least the name as parameter.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: name
            description: Name of new landmark group
            type: string
            required: true
        """
        name = request.data.get('name')
        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')

        # Prevent creation of duplicate landmark group classes
        existing_landmarkgroups = ClassInstance.objects.filter(project_id=project_id,
                name=name, class_column=landmarkgroup_class)
        if existing_landmarkgroups:
            raise ValueError("There is already a landmark group with name {}".format(name))

        landmarkgroup = ClassInstance.objects.create(project_id=project_id,
                class_column=landmarkgroup_class, user=request.user,
                name=name)
        landmarkgroup.save()

        serializer = BasicClassInstanceSerializer(landmarkgroup)
        return Response(serializer.data)

class LandmarkGroupDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id, landmarkgroup_id):
        """Get details on one particular landmarkgroup group, including its
        members.
        ---
        parameters:
        - name: project_id
          description: The project the landmark group is part of.
          type: integer
          paramType: path
          required: true
        - name: landmarkgroup_id
          description: The ID of the landmark group.
          required: true
          type: integer
          paramType: path
        """
        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')
        landmarkgroup = get_object_or_404(ClassInstance, pk=landmarkgroup_id,
                project_id=project_id, class_column=landmarkgroup_class)

        serializer = BasicClassInstanceSerializer(landmarkgroup)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request, project_id, landmarkgroup_id):
        """Update an existing landmark group.

        Currently, only the name can be updated.
        ---
        parameters:
        - name: project_id
          description: The project the landmark group is part of.
          type: integer
          paramType: path
          required: true
        - name: landmark_id
          description: The ID of the landmark group.
          required: true
          type: integer
          paramType: path
        - name: name
          description: The new name of the landmark group.
          required: false
          type: string
          paramType: form
        """
        can_edit_or_fail(request.user, landmarkgroup_id, 'class_instance')
        name = request.data.get('name')
        if not name:
            raise ValueError('Need name for update')

        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')
        landmarkgroup = get_object_or_404(ClassInstance, pk=landmarkgroup_id,
                project_id=project_id, class_column=landmarkgroup_class)
        landmarkgroup.name = name
        landmarkgroup.save()

        landmarkgroup.id = None

        serializer = BasicClassInstanceSerializer(landmarkgroup)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, landmarkgroup_id):
        """Delete one particular landmark group.
        ---
        parameters:
        - name: project_id
          description: The project the landmark group is part of.
          type: integer
          paramType: path
          required: true
        - name: landmarkgroup_id
          description: The ID of the landmark group to delete.
          required: true
          type: integer
          paramType: path
        """
        can_edit_or_fail(request.user, landmarkgroup_id, 'class_instance')

        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')
        landmarkgroup = get_object_or_404(ClassInstance, pk=landmarkgroup_id,
                project_id=project_id, class_column=landmarkgroup_class)
        landmarkgroup.delete()

        landmarkgroup.id = None

        serializer = BasicClassInstanceSerializer(landmarkgroup)
        return Response(serializer.data)
