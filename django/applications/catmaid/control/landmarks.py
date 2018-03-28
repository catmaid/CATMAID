# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json
import math

from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.control.common import (get_request_list, get_class_to_id_map,
        get_relation_to_id_map, get_request_list)
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
        Relation, Point, PointClassInstance, UserRole)
from catmaid.serializers import BasicClassInstanceSerializer

from rest_framework.response import Response
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

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id):
        """Delete a list of landmarks including the linked locations, if they
        are not used by other landmarks.
        ---
        parameters:
        - name: project_id
          description: The project the landmark is part of.
          type: integer
          paramType: path
          required: true
        - name: landmark_ids
          description: The landmarks to remove.
          required: true
          type: integer
          paramType: form
        - name: keep_points
          description: Don't delete points.
          required: false
          type: boolean
          defaultValue: false
          paramType: form
        """
        keep_points = request.query_params.get('keep_points', 'false') == 'true'
        landmark_ids = get_request_list(request.query_params, 'landmark_ids', map_fn=int)
        for l in landmark_ids:
            can_edit_or_fail(request.user, l, 'class_instance')

        annotated_with_relation = Relation.objects.get(project_id=project_id,
                relation_name='annotated_with')

        point_ids = set()
        if not keep_points:
            point_landmark_links = PointClassInstance.objects.filter(project_id=project_id,
                    class_instance_id__in=landmark_ids, relation=annotated_with_relation)

            # These are the landmark's lined points
            point_ids = set(pll.point_id for pll in point_landmark_links)

        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmarks = ClassInstance.objects.filter(pk__in=landmark_ids,
                project_id=project_id, class_column=landmark_class)

        if len(landmark_ids) != len(landmarks):
            raise ValueError("Could not find all landmark IDs")

        landmarks.delete()

        if not keep_points:
            remaining_pll = set(PointClassInstance.objects.filter(project_id=project_id,
                    point_id__in=point_ids,
                    relation=annotated_with_relation).values_list('point_id', flat=True))
            points_to_delete = point_ids - remaining_pll
            Point.objects.filter(project_id=project_id,
                    pk__in=points_to_delete).delete()

        serializer = BasicClassInstanceSerializer(landmarks, many=True)
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
            landmarkgroup_ids = [d['id'] for d in data]
            if with_members:
                # Get member information
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
        landmarkgroup_id = int(landmarkgroup_id)
        with_members = request.query_params.get('with_members', 'false') == 'true'
        with_locations = request.query_params.get('with_locations', 'false') == 'true'
        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')
        landmarkgroup = get_object_or_404(ClassInstance, pk=landmarkgroup_id,
                project_id=project_id, class_column=landmarkgroup_class)

        serializer = BasicClassInstanceSerializer(landmarkgroup)
        data = serializer.data

        if data:
            if with_members:
                # Get member information
                member_index = get_landmark_group_members(project_id, [landmarkgroup_id])
                # Append member information
                data['members'] = member_index[landmarkgroup_id]

            if with_locations:
                # Get linked locations, which represent instances of
                # landmark in this landmark group.
                location_index = get_landmark_group_locations(project_id, [landmarkgroup_id])
                # Append location information
                data['locations'] = location_index[landmarkgroup_id]

        return Response(data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request, project_id, landmarkgroup_id):
        """Update an existing landmark group.

        Currently, only the name and group members can be updated. Edit
        permissions are only needed when removing group members.
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
        - name: append_members
          description: |
            Whether the existing members should be extended by the
            passed in members. No members will be removed.
          required: false
          default: false
          type: boolean
          paramType: form
        """
        needs_edit_permissions = False
        project_id = int(project_id)
        if not project_id:
            raise ValueError("Need project ID")
        landmarkgroup_id = int(landmarkgroup_id)
        if not landmarkgroup_id:
            raise ValueError("Need landmark group ID")
        name = request.data.get('name')
        if request.data.get('members') == 'none':
            members = []
        else:
            members = get_request_list(request.data, 'members', map_fn=int)

        append_members = request.data.get('append_members', 'false') == 'true'

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
            to_remove = set() if append_members else current_members - new_members

            part_of = Relation.objects.get(project_id=project_id,
                    relation_name='part_of')

            if to_remove:
                needs_edit_permissions = True

                ClassInstanceClassInstance.objects.filter(project_id=project_id,
                        class_instance_a__in=to_remove,
                        class_instance_b_id=landmarkgroup_id,
                        relation=part_of).delete()

            for landmark_id in to_add:
                ClassInstanceClassInstance.objects.create(project_id=project_id,
                            class_instance_a_id=landmark_id,
                            class_instance_b_id=landmarkgroup_id,
                            relation=part_of, user=request.user)

        if needs_edit_permissions:
            can_edit_or_fail(request.user, landmarkgroup_id, 'class_instance')

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

class LandmarkGroupImport(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request, project_id):
        """Import and link landmarks, landmark groups and locations.

        The passed in <data> parameter is a list of two-element lists, each
        representing a group along with its linked landmark and locations. The
        group is represented by its name and the members are a list of
        four-element lists, containing the landmark name and the location. This
        results in the following format:

        [[group_1_name, [[landmark_1_name, x, y, z], [landmark_2_name, x, y, z]]], ...]

        Note that this parameter has to be transmitted as a JSON encoded string.

        ---
        parameters:
        - name: project_id
          description: The project the landmark group is part of.
          type: integer
          paramType: path
          required: true
        - name: data
          description: The data to import.
          required: true
          type: string
          paramType: form
        - name: reuse_existing_groups
          description: Whether existing groups should be reused.
          type: boolean
          paramType: form
          defaultValue: false
          required: false
        - name: reuse_existing_landmarks
          description: Whether existing landmarks should be reused.
          type: boolean
          paramType: form
          defaultValue: false
          required: false
        - name: create_non_existing_groups
          description: Whether non-existing groups should be created.
          type: boolean
          paramType: form
          defaultValue: true
          required: false
        - name: create_non_existing_landmarks
          description: Whether non-existing landmarks should be created.
          type: boolean
          paramType: form
          defaultValue: true
          required: false
        """
        project_id = int(project_id)
        if not project_id:
            raise ValueError("Need project ID")
        reuse_existing_groups = request.data.get('reuse_existing_groups', 'false') == 'true'
        reuse_existing_landmarks = request.data.get('reuse_existing_landmarks', 'false') == 'true'
        create_non_existing_groups = request.data.get('create_non_existing_groups', 'true') == 'true'
        create_non_existing_landmarks = request.data.get('create_non_existing_landmarks', 'true') == 'true'

        # Make sure the data to import matches our expectations
        data = request.data.get('data')
        if not data:
            raise ValueError("Need data to import")
        data = json.loads(data)
        for n, (group_name, landmarks) in enumerate(data):
            if not group_name:
                raise ValueError("The {}. group doesn't have a name".format(n))
            if not landmarks:
                raise ValueError("Group {} doesn't contain any landmarks".format(group_name))
            for m, link in enumerate(landmarks):
                if not link or len(link) != 4:
                    raise ValueError("The {}. link of the {}. group ({}) " \
                        "doesn't conform to the [ID, X, Y, Z] format.".format(m,
                        n, group_name))
                for ci in (1,2,3):
                    coordinate = link[ci]
                    value = float(coordinate)
                    if math.isnan(value):
                        raise ValueError("The {}. link of the {}. group ({}) " \
                            "doesn't have a valid {}. coordinate: {}.".format(
                            m, n, group_name, ci, coordinate))
                    link[ci] = value

        classes = get_class_to_id_map(project_id)
        relations = get_relation_to_id_map(project_id)
        landmark_class = classes['landmark']
        landmarkgroup_class = classes['landmarkgroup']
        part_of_relation = relations['part_of']
        annotated_with_relation = relations['annotated_with']

        landmarks = dict((k.lower(),v) for k,v in
                ClassInstance.objects.filter(project_id=project_id,
                class_column=landmark_class).values_list('name', 'id'))
        landmarkgroups = dict((k.lower(),v) for k,v in
                ClassInstance.objects.filter(project_id=project_id,
                class_column=landmarkgroup_class).values_list('name', 'id'))

        imported_groups = []

        # Keep track of which landmarks have been seen and were accepted.
        seen_landmarks = set()

        for n, (group_name, linked_landmarks) in enumerate(data):
            # Test if group exists already and raise error if they do and are
            # prevented from being reused (option).
            existing_group_id = landmarkgroups.get(group_name.lower())
            if existing_group_id:
                if n == 0:
                    if not reuse_existing_groups:
                        raise ValueError("Group \"{}\" exists already ({}).  Please" \
                                "remove it or enable group re-use.".format(
                                group_name, existing_group_id))
                    can_edit_or_fail(request.user, existing_group_id, 'class_instance')
            elif create_non_existing_groups:
                group = ClassInstance.objects.create(project_id=project_id,
                        class_column_id=landmarkgroup_class, user=request.user,
                        name=group_name)
                existing_group_id = group.id
                landmarkgroups[group_name.lower()] = group.id
            else:
                raise ValueError("Group \"{}\" does not exist. Please create " \
                        "it or enable automatic creation/".format(group_name))

            imported_landmarks = []
            imported_group = {
                    'id': existing_group_id,
                    'name': group_name,
                    'members': imported_landmarks
            }
            imported_groups.append(imported_group)

            for m, link in enumerate(linked_landmarks):
                landmark_name = link[0]
                x, y, z = link[1], link[2], link[3]
                existing_landmark_id = landmarks.get(landmark_name.lower())
                if existing_landmark_id:
                    # Test only on first look at landmark
                    if existing_landmark_id not in seen_landmarks:
                        if not reuse_existing_landmarks:
                            raise ValueError("Landmark \"{}\" exists already. " \
                                        "Please remove it or enable re-use of " \
                                        "existing landmarks.".format(landmark_name))
                        can_edit_or_fail(request.user, existing_landmark_id, 'class_instance')
                elif create_non_existing_landmarks:
                    landmark = ClassInstance.objects.create(project_id=project_id,
                            class_column_id=landmark_class, user=request.user,
                            name=landmark_name)
                    existing_landmark_id = landmark.id
                    landmarks[landmark_name.lower()] = landmark.id
                else:
                    raise ValueError("Landmark \"{}\" does not exist. Please " \
                            "create it or enable automatic creation.".format(
                            landmark_name))
                seen_landmarks.add(existing_landmark_id)

                # Make sure the landmark is linked to the group
                landmark_link = ClassInstanceClassInstance.objects.get_or_create(
                            project_id=project_id, relation_id=part_of_relation,
                            class_instance_a_id=existing_landmark_id,
                            class_instance_b_id=existing_group_id,
                            defaults={'user': request.user})

                # With an existing group and landmark in place, the location can
                # be linked (to both).
                point = Point.objects.create(project_id=project_id, user=request.user,
                        editor=request.user, location_x=x, location_y=y, location_z=z)
                point_landmark = PointClassInstance.objects.create(point=point,
                        user=request.user, class_instance_id=existing_landmark_id,
                        project_id=project_id, relation_id=annotated_with_relation)
                point_landmark_group = PointClassInstance.objects.create(point=point,
                        user=request.user, class_instance_id=existing_group_id,
                        project_id=project_id, relation_id=annotated_with_relation)

                imported_landmarks.append({
                    'id': existing_landmark_id,
                    'name': landmark_name,
                    'x': x,
                    'y': y,
                    'z': z
                })

        return Response(imported_groups)


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
        x = float(request.data.get('x'))
        y = float(request.data.get('y'))
        z = float(request.data.get('z'))
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
