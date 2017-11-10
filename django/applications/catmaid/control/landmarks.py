# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.control.common import get_request_list
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
        Relation, Point, PointClassInstance, UserRole)
from catmaid.serializers import BasicClassInstanceSerializer

from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer
from rest_framework.views import APIView

from collections import defaultdict


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
          - name: with_locations
            description: Whether to return linked locations
            required: false
            defaultValue: false
            paramType: form
        """
        with_locations = request.query_params.get('with_locations', 'false') == 'true'
        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmarks = ClassInstance.objects.filter(project_id=project_id,
                class_column=landmark_class).order_by('id')

        serializer = BasicClassInstanceSerializer(landmarks, many=True)
        serialized_landmarks = serializer.data

        if with_locations and serialized_landmarks:
            # A landmark class instance's linked locations are points using the
            # "annotated_with" relation.
            landmark_ids = [lm['id'] for lm in serialized_landmarks]
            landmark_template = ",".join("(%s)" for _ in landmark_ids)
            cursor = connection.cursor()
            cursor.execute("""
                SELECT landmark.id, p.id, p.location_x, p.location_y, p.location_z
                FROM point_class_instance pci
                JOIN point p
                    ON pci.point_id = p.id
                JOIN (VALUES {}) landmark(id)
                    ON pci.class_instance_id = landmark.id
                WHERE pci.relation_id = (
                    SELECT id FROM relation
                    WHERE relation_name = 'annotated_with'
                    AND project_id = %s
                )
                AND pci.project_id = %s
            """.format(landmark_template),
                landmark_ids + [project_id, project_id])

            point_index = defaultdict(list)
            for point in cursor.fetchall():
                point_index[point[0]].append({
                    'id': point[1],
                    'x': point[2],
                    'y': point[3],
                    'z': point[4]
                })

            # Append landmark locations to landmarks
            for lm in serialized_landmarks:
                lm['locations'] = point_index[lm['id']]

        return Response(serialized_landmarks)

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

        If locations are returned alongside the landmarks, they are all points
        that are linked to a particular landmark, regardless of which group the
        location is linked to.
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
        - name: with_locations
          description: Whether to return linked locations
          required: false
          defaultValue: false
          paramType: form
        """
        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmark = get_object_or_404(ClassInstance, pk=landmark_id,
                project_id=project_id, class_column=landmark_class)

        serializer = BasicClassInstanceSerializer(landmark)
        serialized_landmark = serializer.data

        # Linked points use the "annotated_with" relation
        with_locations = request.data.get('with_locations', 'false') == 'true'
        if with_locations:
            # A landmark class instance's linked locations are points using the
            # "annotated_with" relation.
            serialized_landmark.locations = []
            cursor = connection.cursor()
            cursor.execute("""
                SELECT p.id, p.location_x, p.location_y, p.location_z
                FROM point_class_instance pci
                JOIN point p
                    ON pci.point_id = p.id
                WHERE pci.relation_id = (
                    SELECT id FROM relation
                    WHERE relation_name = 'annotated_with'
                    AND project_id = %(project_id)s
                )
                AND pci.class_instance_id = %(landmark_id)s
                AND pci.project_id = %(project_id)s
            """, {
                "project_id": project_id,
                "landmark_id": landmark_id
            })
            for point in cursor.fetchall():
                serialized_landmark.locations.append({
                    'id': point[0],
                    'x': point[1],
                    'y': point[2],
                    'z': point[3]
                })

        return Response(serialized_landmark)

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
          - name: with_locations
            description: Whether to return linked locations
            required: false
            defaultValue: false
            paramType: form
        """
        with_members = request.query_params.get('with_members', 'false') == 'true'
        with_locations = request.query_params.get('with_locations', 'false') == 'true'
        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name="landmarkgroup")
        landmarkgroups = ClassInstance.objects.filter(project_id=project_id,
                class_column=landmarkgroup_class).order_by('id')

        serializer = BasicClassInstanceSerializer(landmarkgroups, many=True)
        data = serializer.data

        if data:
            if with_members:
                # Get member information
                landmarkgroup_ids = [d['id'] for d in data]
                member_index = get_landmark_group_members(project_id,
                        landmarkgroup_ids)
                # Append member information
                for group in data:
                    group['members'] = member_index[group['id']]

            if with_locations:
                # Get linked locations, which represent instances of
                # landmark in this landmark group.
                location_index = get_landmark_group_locations(project_id,
                        landmarkgroup_ids)
                # Append location information
                for group in data:
                    group['locations'] = location_index[group['id']]

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
        - name: members
          description: The new members of the landmark group.
          required: false
          type: array
          items:
            type: integer
          paramType: form
        """
        project_id = int(project_id)
        if not project_id:
            raise ValueError("Need project ID")
        landmarkgroup_id = int(landmarkgroup_id)
        if not landmarkgroup_id:
            raise ValueError("Need landmark group ID")
        can_edit_or_fail(request.user, landmarkgroup_id, 'class_instance')
        name = request.data.get('name')
        if request.data.get('members') == 'none':
            members = []
        else:
            members = get_request_list(request.data, 'members', map_fn=int)

        if not name and members == None:
            raise ValueError('Need name or members parameter for update')

        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')
        landmarkgroup = get_object_or_404(ClassInstance, pk=landmarkgroup_id,
                project_id=project_id, class_column=landmarkgroup_class)
        if name:
            landmarkgroup.name = name
            landmarkgroup.save()

        if members is not None:
            # Find out which members need to be added and which existing ones
            # need to be removed.
            current_members = set(get_landmark_group_members(project_id,
                        [landmarkgroup_id]).get(landmarkgroup_id, []))
            new_members = set(members)
            to_add = new_members - current_members
            to_remove = current_members - new_members

            part_of = Relation.objects.get(project_id=project_id,
                    relation_name='part_of')
            ClassInstanceClassInstance.objects.filter(project_id=project_id,
                    class_instance_a__in=to_remove,
                    class_instance_b_id=landmarkgroup_id,
                    relation=part_of).delete()

            for landmark_id in to_add:
                ClassInstanceClassInstance.objects.create(project_id=project_id,
                            class_instance_a_id=landmark_id,
                            class_instance_b_id=landmarkgroup_id,
                            relation=part_of, user=request.user)

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

def get_landmark_group_members(project_id, landmarkgroup_ids):
    cursor = connection.cursor()
    landmarkgroups_template = ','.join(['(%s)' for _ in landmarkgroup_ids])
    cursor.execute("""
        SELECT cici.class_instance_a, cici.class_instance_b
        FROM class_instance_class_instance cici
        JOIN (VALUES {}) landmarkgroup(id)
        ON cici.class_instance_b = landmarkgroup.id
        WHERE cici.relation_id = (
            SELECT id from relation
            WHERE relation_name = 'part_of' AND project_id = %s
        ) AND cici.project_id = %s
        ORDER BY cici.class_instance_a
    """.format(landmarkgroups_template),
        landmarkgroup_ids + [project_id, project_id])
    member_index = defaultdict(list)
    for r in cursor.fetchall():
        member_index[r[1]].append(r[0])
    return member_index

def get_landmark_group_locations(project_id, landmarkgroup_ids):
    cursor = connection.cursor()
    landmarkgroups_template = ','.join(['(%s)' for _ in landmarkgroup_ids])
    cursor.execute("""
        SELECT pci.point_id, pci.class_instance_id, p.location_x,
            p.location_y, p.location_z
        FROM point_class_instance pci
        JOIN (VALUES {}) landmarkgroup(id)
            ON pci.class_instance_id = landmarkgroup.id
        JOIN point p
            ON p.id = pci.point_id
        WHERE pci.relation_id = (
            SELECT id from relation
            WHERE relation_name = 'annotated_with' AND project_id = %s
        ) AND pci.project_id = %s
    """.format(landmarkgroups_template),
        landmarkgroup_ids + [project_id, project_id])
    location_index = defaultdict(list)
    for r in cursor.fetchall():
        location_index[r[1]].append({
            'id': r[0],
            'x': r[2],
            'y': r[3],
            'z': r[4]
        })
    return location_index

class LandmarkLocationList(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request, project_id, landmark_id):
        """Add a new location or use an existing one and link it to a landmark.

        Either (x,y,z) or location_id have to be provided.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: landmark_id
            description: The landmark to link
            type: integer
            paramType: path
            required: true
          - name: location_id
            description: Optional existing location ID
            type: integer
            required: false
          - name: x
            description: Optional new location X coodinate
            type: float
            required: false
          - name: y
            description: Optional new location Y coodinate
            type: float
            required: false
          - name: z
            description: Optional new location Z coodinate
            type: float
            required: false
        """
        location_id = request.data.get('location_id')
        x = request.data.get('x')
        y = request.data.get('y')
        z = request.data.get('z')
        if location_id and (x or y or z):
            raise ValueError("Please provide either location ID or coordinates")
        landmark = ClassInstance.objects.get(project_id=project_id, pk=int(landmark_id))

        if location_id:
            point = Point.objects.get(project_id=project_id, pk=location_id)
        else:
            # Create new point
            point = Point.objects.create(project_id=project_id, user=request.user,
                    editor=request.user, location_x=x, location_y=y, location_z=z)

        pci = PointClassInstance.objects.create(point=point,
                user=request.user, class_instance=landmark,
                project_id=project_id, relation=Relation.objects.get(
                    project_id=project_id,
                    relation_name="annotated_with"))

        return Response({
            'link_id': pci.id,
            'point_id': point.id,
            'landmark_id': landmark.id
        })

class LandmarkGroupLocationList(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request, project_id, landmarkgroup_id, location_id):
        """Link a location to a landmark group.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: landmarkgroup_id
            description: The landmark group to link
            type: integer
            paramType: path
            required: true
          - name: location_id
            description: Existing location ID
            type: integer
            paramType: path
            required: true
        """
        point = Point.objects.get(project_id=project_id, pk=location_id)
        landmarkgroup = ClassInstance.objects.get(project_id=project_id,
                pk=landmarkgroup_id, class_column=Class.objects.get(
                    project_id=project_id, class_name="landmarkgroup"))

        pci = PointClassInstance.objects.create(point=point,
                user=request.user, class_instance=landmarkgroup,
                project_id=project_id, relation=Relation.objects.get(
                    project_id=project_id,
                    relation_name="annotated_with"))

        return Response({
            'link_id': pci.id,
            'point_id': point.id,
            'landmarkgroup_id': landmarkgroup.id
        })

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, landmarkgroup_id, location_id):
        """Remove the link between a location and a landmark group.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: landmarkgroup_id
            description: The landmark group to link
            type: integer
            paramType: path
            required: true
          - name: location_id
            description: Existing location ID
            type: integer
            paramType: path
            required: true
        """
        point = Point.objects.get(project_id=project_id, pk=location_id)
        landmarkgroup = ClassInstance.objects.get(project_id=project_id,
                pk=landmarkgroup_id, class_column=Class.objects.get(
                    project_id=project_id, class_name="landmarkgroup"))

        pci = PointClassInstance.objects.get(point=point,
                user=request.user, class_instance=landmarkgroup,
                project_id=project_id, relation=Relation.objects.get(
                    project_id=project_id,
                    relation_name="annotated_with"))
        can_edit_or_fail(request.user, pci.id, 'point_class_instance')
        pci_id = pci.id
        pci.delete()

        return Response({
            'link_id': pci_id,
            'point_id': point.id,
            'landmarkgroup_id': landmarkgroup.id
        })


class LandmarkLocationDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, landmark_id, location_id):
        """Delete the link between a location and a landmark. If the last link
        to a location is deleted, the location is removed as well.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: landmark_id
            description: The landmark to unlink
            type: integer
            paramType: path
            required: true
          - name: location_id
            description: The location to unlink
            paramType: path
            type: integer
            required: true
        """
        can_edit_or_fail(request.user, landmark_id, 'class_instance')
        landmark = ClassInstance.objects.get(project_id=project_id, pk=int(landmark_id))

        pci = PointClassInstance.objects.get(project_id=project_id,
                class_instance=landmark, point_id=int(location_id),
                relation=Relation.objects.get(project_id=project_id,
                    relation_name='annotated_with'))
        can_edit_or_fail(request.user, pci.id, 'point_class_instance')
        pci_id = pci.id
        pci.delete()

        deleted_point = False
        remaining_pci = PointClassInstance.objects.filter(point_id=int(location_id))
        if remaining_pci.count() == 0:
            try:
                can_edit_or_fail(request.user, point.id, 'point')
                Point.objects.get(pk=int(location_id)).delete()
                deleted_point = True
            except:
                pass

        return Response({
            'link_id': pci_id,
            'landmark_id': pci.class_instance_id,
            'point_id': pci.point_id,
            'deleted_point': deleted_point
        })
