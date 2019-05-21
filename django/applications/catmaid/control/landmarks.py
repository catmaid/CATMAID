# -*- coding: utf-8 -*-

from collections import defaultdict
import json
import math
from typing import Any, DefaultDict, Dict, List, Set, Tuple

from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import (requires_user_role, can_edit_or_fail,
        can_edit_all_or_fail)
from catmaid.control.common import (get_request_list, get_class_to_id_map,
        get_relation_to_id_map, get_request_bool, get_request_list)
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
        Relation, Point, PointClassInstance, UserRole)
from catmaid.serializers import BasicClassInstanceSerializer

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class LandmarkList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:Request, project_id) -> Response:
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
        with_locations = get_request_bool(request.query_params, 'with_locations', False)
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

            point_index = defaultdict(list) # type: DefaultDict[Any, List]
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
    def put(self, request:Request, project_id) -> Response:
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
    def delete(self, request:Request, project_id) -> Response:
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
        keep_points = get_request_bool(request.query_params, 'keep_points', False)
        landmark_ids = get_request_list(request.query_params, 'landmark_ids', map_fn=int)
        for l in landmark_ids:
            can_edit_or_fail(request.user, l, 'class_instance')

        annotated_with_relation = Relation.objects.get(project_id=project_id,
                relation_name='annotated_with')

        point_ids = set() # type: Set
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
    def get(self, request:Request, project_id, landmark_id) -> Response:
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
        with_locations = get_request_bool(request.data, 'with_locations', False)
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
    def post(self, request:Request, project_id, landmark_id) -> Response:
        """Update an existing landmark.

        Currently, only the name and group membership can be updated.
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
        - name: group_ids
          description: The groups this landmark is a member of.
          paramType: path
          required: false
          type: array
          items:
            type: integer
        - name: append_memberships
          description: |
            Whether the existing memberships should be extended by the
            passed in memberships. No memberships will be removed.
          required: false
          default: false
          type: boolean
          paramType: form
        """
        can_edit_or_fail(request.user, landmark_id, 'class_instance')
        name = request.data.get('name')
        if request.data.get('group_ids') == 'none':
            group_ids = [] # type: List
        else:
            group_ids = get_request_list(request.data, 'group_ids', map_fn=int)
        append_memberships = get_request_bool(request.data, 'append_memberships', False)

        landmark_class = Class.objects.get(project_id=project_id, class_name="landmark")
        landmark = get_object_or_404(ClassInstance, pk=landmark_id,
                project_id=project_id, class_column=landmark_class)

        if name:
            landmark.name = name
            landmark.save()

        if group_ids is not None:
            # Find out which memberships need to be added and which existing
            # ones need to be removed.
            current_memberships = set(get_landmark_memberships(project_id,
                        [landmark.id]).get(landmark.id, []))
            new_memberships = set(group_ids)
            to_add = new_memberships - current_memberships
            to_remove = set() if append_memberships else current_memberships - new_memberships

            part_of = Relation.objects.get(project_id=project_id,
                    relation_name='part_of')

            if to_remove:
                ClassInstanceClassInstance.objects.filter(project_id=project_id,
                        class_instance_a_id=landmark_id,
                        class_instance_b_id__in=to_remove,
                        relation=part_of).delete()

            for group_id in to_add:
                ClassInstanceClassInstance.objects.create(project_id=project_id,
                            class_instance_a_id=landmark_id,
                            class_instance_b_id=group_id,
                            relation=part_of, user=request.user)

        serializer = BasicClassInstanceSerializer(landmark)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:Request, project_id, landmark_id) -> Response:
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
    def get(self, request:Request, project_id) -> Response:
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
          - name: with_names
            description: Whether to return location with their landmark names
            required: false
            defaultValue: false
            paramType: form
          - name: with_links
            description: Whether to return links to other groups
            required: false
            defaultValue: false
            paramType: form
          - name: with_relations
            description: Whether to return a map of used relation IDs to their names
            required: false
            defaultValue: false
            paramType: form
        """
        with_members = get_request_bool(request.query_params, 'with_members', False)
        with_locations = get_request_bool(request.query_params, 'with_locations', False)
        with_relations = get_request_bool(request.query_params, 'with_relations', False)
        with_links = get_request_bool(request.query_params, 'with_links', False)
        with_names = get_request_bool(request.query_params, 'with_names', False)
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
                        landmarkgroup_ids, with_names)
                # Append location information
                for group in data:
                    group['locations'] = location_index[group['id']]

            if with_relations or with_links:
                # Add a relations field for a list of objects, each having the
                # fields relation_id, relation_name, target_id.
                relation_index, used_relations = make_landmark_relation_index(project_id,
                        landmarkgroup_ids)
                used_relations_list = [[k,v] for k,v in used_relations.items()]
                for group in data:
                    if with_links:
                        group['links'] = relation_index[group['id']]
                    if with_relations:
                        group['used_relations'] = used_relations_list

        return Response(data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request:Request, project_id) -> Response:
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
    def get(self, request:Request, project_id, landmarkgroup_id) -> Response:
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
        - name: with_names
          description: Whether to return linked landmark names
          required: false
          defaultValue: false
          paramType: form
        """
        landmarkgroup_id = int(landmarkgroup_id)
        with_members = get_request_bool(request.query_params, 'with_members', False)
        with_locations = get_request_bool(request.query_params, 'with_locations', False)
        with_names = get_request_bool(request.query_params, 'with_names', False)
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
                location_index = get_landmark_group_locations(project_id,
                        [landmarkgroup_id], with_names)
                # Append location information
                data['locations'] = location_index[landmarkgroup_id]

        return Response(data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request:Request, project_id, landmarkgroup_id) -> Response:
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
            members = [] # type: List
        else:
            members = get_request_list(request.data, 'members', map_fn=int)

        append_members = get_request_bool(request.data, 'append_members', False)

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
    def delete(self, request:Request, project_id, landmarkgroup_id) -> Response:
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
    def post(self, request:Request, project_id) -> Response:
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
        reuse_existing_groups = get_request_bool(request.data, 'reuse_existing_groups', False)
        reuse_existing_landmarks = get_request_bool(request.data, 'reuse_existing_landmarks', False)
        create_non_existing_groups = get_request_bool(request.data, 'create_non_existing_groups', True)
        create_non_existing_landmarks = get_request_bool(request.data, 'create_non_existing_landmarks', True)

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
        seen_landmarks = set() # type: Set

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

            imported_landmarks = [] # type: List
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


def get_landmark_group_members(project_id, landmarkgroup_ids) -> DefaultDict[Any, List]:
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
    member_index = defaultdict(list) # type: DefaultDict[Any, List]
    for r in cursor.fetchall():
        member_index[r[1]].append(r[0])
    return member_index

def get_landmark_memberships(project_id, landmark_ids):
    cursor = connection.cursor()
    cursor.execute("""
        SELECT cici.class_instance_a, cici.class_instance_b
        FROM class_instance_class_instance cici
        JOIN UNNEST(%(landmark_ids)s::bigint[]) landmark(id)
        ON cici.class_instance_a = landmark.id
        WHERE cici.relation_id = (
            SELECT id from relation
            WHERE relation_name = 'part_of' AND project_id = %(project_id)s
        ) AND cici.project_id = %(project_id)s
        ORDER BY cici.class_instance_a
    """, {
        'project_id': project_id,
        'landmark_ids': landmark_ids,
    })
    membership_index = defaultdict(list) # type: DefaultDict[Any, List]
    for r in cursor.fetchall():
        membership_index[r[0]].append(r[1])
    return membership_index

def get_landmark_group_locations(project_id, landmarkgroup_ids, with_names:bool=False) -> DefaultDict[Any, List]:
    cursor = connection.cursor()
    if with_names:
        cursor.execute("""
            SELECT p.id, plg.class_instance_id, p.location_x, p.location_y,
                p.location_z, plg.names
            FROM (
                SELECT pci.point_id, pci.class_instance_id, array_agg(l.name) as names
                FROM point_class_instance pci
                JOIN UNNEST(%(landmarkgroup_ids)s::integer[]) landmarkgroup(id)
                    ON pci.class_instance_id = landmarkgroup.id
                LEFT JOIN point_class_instance pci_l
                    ON pci_l.point_id = pci.point_id
                JOIN class_instance l
                    ON pci_l.class_instance_id = l.id
                JOIN class_instance_class_instance l_lg
                    ON l_lg.class_instance_a = l.id
                    AND l_lg.class_instance_b = pci.class_instance_id
                WHERE pci.relation_id = (
                    SELECT id from relation
                    WHERE relation_name = 'annotated_with'
                    AND project_id = %(project_id)s
                )
                AND pci_l.relation_id = pci.relation_id
                AND pci.project_id = %(project_id)s
                AND pci_l.project_id = %(project_id)s
                AND l.class_id = (
                    SELECT id FROM class
                    WHERE class_name = 'landmark'
                    AND project_id = %(project_id)s
                )
                AND l_lg.relation_id = (
                    SELECT id from relation
                    WHERE relation_name = 'part_of'
                    AND project_id = %(project_id)s
                )
                GROUP BY pci.id
            ) plg
            JOIN point p
                ON p.id = plg.point_id;
        """, {
            'landmarkgroup_ids': landmarkgroup_ids,
            'project_id': project_id
        })
        location_index = defaultdict(list) # type: DefaultDict[Any, List]
        for r in cursor.fetchall():
            location_index[r[1]].append({
                'id': r[0],
                'x': r[2],
                'y': r[3],
                'z': r[4],
                'names': r[5]
            })
        return location_index
    else:
        cursor.execute("""
            SELECT pci.point_id, pci.class_instance_id, p.location_x,
                p.location_y, p.location_z
            FROM point_class_instance pci
            JOIN UNNEST(%(landmarkgroup_ids)s::integer[]) landmarkgroup(id)
                ON pci.class_instance_id = landmarkgroup.id
            JOIN point p
                ON p.id = pci.point_id
            WHERE pci.relation_id = (
                SELECT id from relation
                WHERE relation_name = 'annotated_with'
                AND project_id = %(project_id)s
            ) AND pci.project_id = %(project_id)s
        """, {
            'landmarkgroup_ids': landmarkgroup_ids,
            'project_id': project_id
        })
        location_index = defaultdict(list)
        for r in cursor.fetchall():
            location_index[r[1]].append({
                'id': r[0],
                'x': r[2],
                'y': r[3],
                'z': r[4]
            })
        return location_index

def make_landmark_relation_index(project_id, landmarkgroup_ids) -> Tuple[DefaultDict[Any, List], Dict]:
    cursor = connection.cursor()
    cursor.execute("""
        SELECT cici.id, lg.id, cici.relation_id, r.relation_name,
            cici.class_instance_a, cici.class_instance_b
        FROM class_instance_class_instance cici
        JOIN UNNEST(%(landmarkgroup_ids)s::integer[]) lg(id)
            ON lg.id = cici.class_instance_a
            OR lg.id = cici.class_instance_b
        JOIN relation r
            ON r.id = cici.relation_id
        JOIN class_instance ci_a
            ON cici.class_instance_a = ci_a.id
        JOIN class_instance ci_b
            ON cici.class_instance_b = ci_b.id
        JOIN (
            SELECT id
            FROM class
            WHERE project_id = %(project_id)s
            AND class_name = 'landmarkgroup'
        ) cls(id)
            ON cls.id = ci_a.class_id
            AND cls.id = ci_b.class_id
        WHERE cici.project_id = %(project_id)s
    """, {
        'landmarkgroup_ids': landmarkgroup_ids,
        'project_id': project_id,
    })
    relation_index = defaultdict(list) # type: DefaultDict[Any, List]
    relation_map = dict() # type: Dict
    for r in cursor.fetchall():
        if r[2] not in relation_map:
            relation_map[r[2]] = r[3]
        relation_index[r[1]].append({
            'id': r[0],
            'relation_id': r[2],
            'subject_id': r[4],
            'object_id': r[5]
        })

    return relation_index, relation_map

class LandmarkLocationList(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request:Request, project_id, landmark_id) -> Response:
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
    def put(self, request:Request, project_id, landmarkgroup_id, location_id) -> Response:
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
    def delete(self, request:Request, project_id, landmarkgroup_id, location_id) -> Response:
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
    def delete(self, request:Request, project_id, landmark_id, location_id) -> Response:
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
        location_point = int(location_id)

        pci = PointClassInstance.objects.get(project_id=project_id,
                class_instance=landmark, point_id=location_point,
                relation=Relation.objects.get(project_id=project_id,
                    relation_name='annotated_with'))
        can_edit_or_fail(request.user, pci.id, 'point_class_instance')
        pci_id = pci.id
        pci.delete()

        deleted_point = False
        remaining_pci = PointClassInstance.objects.filter(point_id=location_point)
        if remaining_pci.count() == 0:
            try:
                can_edit_or_fail(request.user, location_point, 'point')
                Point.objects.get(pk=location_point).delete()
                deleted_point = True
            except:
                pass

        return Response({
            'link_id': pci_id,
            'landmark_id': pci.class_instance_id,
            'point_id': pci.point_id,
            'deleted_point': deleted_point
        })


class LandmarkAndGroupkLocationDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:Request, project_id, landmark_id, group_id) -> Response:
        """Delete the link between a location and a landmark and a group and a
        location, if and only if both exist. If the last link to a location is
        deleted, the location is removed as well.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: landmark_id
            description: The landmark to unlink from
            type: integer
            paramType: path
            required: true
          - name: group_id
            description: The group to unlink from
            paramType: path
            type: integer
            required: true
          - name: keep_points
            description: Wheter only links should be deleted and points should be kept.
            paramType: path
            type: boolean
            required: true
        """
        can_edit_or_fail(request.user, landmark_id, 'class_instance')
        landmark = ClassInstance.objects.get(project_id=project_id, pk=int(landmark_id))
        keep_points = get_request_bool(request.data, 'keep_points', False)

        landmarkgroup_class = Class.objects.get(project_id=project_id, class_name='landmarkgroup')
        landmarkgroup = get_object_or_404(ClassInstance, pk=group_id,
                project_id=project_id, class_column=landmarkgroup_class)

        # Get sharead points
        cursor = connection.cursor()
        cursor.execute("""
            SELECT p.id, lm_link.id, lg_link.id
            FROM point p
            JOIN point_class_instance lm_link
                ON lm_link.point_id = p.id
                AND lm_link.class_instance_id = %(landmark_id)s
            JOIN point_class_instance lg_link
                ON lg_link.point_id = p.id
                AND lg_link.class_instance_id = %(group_id)s
            WHERE p.project_id = %(project_id)s
                AND lm_link.project_id = %(project_id)s
                AND lg_link.project_id = %(project_id)s
        """, {
            'landmark_id': landmark.id,
            'group_id': landmarkgroup.id,
            'project_id': project_id
        })
        rows = cursor.fetchall()
        shared_point_ids = [r[0] for r in rows]
        lm_link_ids = [r[1] for r in rows]
        lg_link_ids = [r[2] for r in rows]

        n_deleted_points = 0
        if rows:
            # Make sure the user has the right permissions
            can_edit_all_or_fail(request.user, lm_link_ids, 'point_class_instance')
            can_edit_all_or_fail(request.user, lg_link_ids, 'point_class_instance')

            # Delete links to shared point
            PointClassInstance.objects.filter(id__in=lm_link_ids).delete()
            PointClassInstance.objects.filter(id__in=lg_link_ids).delete()

            # If point isn't referenced by other class instances, remove it as well
            if not keep_points:
                cursor.execute("""
                    DELETE FROM point
                    WHERE id IN (
                        SELECT p.id
                        FROM point p
                        LEFT JOIN point_class_instance pci
                            ON pci.point_id = p.id
                        JOIN UNNEST((%(point_ids)s::bigint[])) q(id)
                            ON q.id = p.id
                        WHERE pci.id IS NULL
                    )
                    RETURNING id;
                """, {
                    'point_ids': shared_point_ids
                })
                n_deleted_points = cursor.fetchone()[0]

        return Response({
            'shared_point_ids': shared_point_ids,
            'landmark_link_ids': lm_link_ids,
            'group_link_ids': lg_link_ids,
            'n_deleted_points': n_deleted_points
        })

class LandmarkGroupLinks(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request:Request, project_id) -> Response:
        """Link a location group to another landmark group. If the passed in
        groups already are in relation to each other using the passed in
        relation, no new link is created. Instead, the existing link will be
        returned. A flag in the result indicates whether the returned object is
        new.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: group_1_id
            description: The first landmark group, has role of subject.
            type: integer
            paramType: form
            required: true
          - name: relation_id
            description: The relation between group 1 and 2, has role of predicate.
            type: integer
            paramType: form
            required: true
          - name: group_2_id
            description: The first landmark group, has role of object.
            type: integer
            paramType: form
            required: true
        """
        group_1_id = request.data.get('group_1_id')
        group_1 = ClassInstance.objects.get(id=group_1_id, project_id=project_id)
        group_2_id = request.data.get('group_2_id')
        group_2 = ClassInstance.objects.get(id=group_2_id, project_id=project_id)
        relation_id = request.data.get('relation_id')

        cici, created = ClassInstanceClassInstance.objects.get_or_create(
                project_id=project_id,
                class_instance_a=group_1,
                class_instance_b=group_2,
                relation_id=relation_id,
                defaults={
                    'user': request.user,
                })

        return Response({
            'id': cici.id,
            'group_1_id': cici.class_instance_a_id,
            'group_2_id': cici.class_instance_b_id,
            'relation_id': cici.relation_id,
            'created': created
        })


class LandmarkGroupLinkDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:Request, project_id, link_id) -> Response:
        """Delete the link between two landmark groups. Won't delete links that
        don't connect to landmark groups.
        ---
        parameters:
          - name: project_id
            description: Project of landmark group
            type: integer
            paramType: path
            required: true
          - name: link_id
            description: The link to delete
            type: integer
            paramType: path
            required: true
        """
        can_edit_or_fail(request.user, link_id, 'class_instance_class_instance')

        cursor = connection.cursor()
        cursor.execute("""
            DELETE FROM class_instance_class_instance
            WHERE id IN (
                WITH landmark_class AS (
                    SELECT id
                    FROM class
                    WHERE project_id = %(project_id)s
                    AND class_name = 'landmarkgroup'
                )
                SELECT cici.id
                FROM landmark_class lc, class_instance_class_instance cici
                JOIN class_instance ci_a
                    ON cici.class_instance_a = ci_a.id
                JOIN class_instance ci_b
                    ON cici.class_instance_b = ci_b.id
                WHERE cici.project_id = %(project_id)s
                AND cici.id = %(link_id)s
                AND ci_a.class_id = lc.id
                AND ci_b.class_id = lc.id
            )
            RETURNING id, class_instance_a, class_instance_b, relation_id
        """, {
            'project_id': project_id,
            'link_id': link_id
        })

        deleted_rows = list(cursor.fetchall())
        if len(deleted_rows) > 1:
            raise ValueError("Would delete more than one link, aborting.")
        if len(deleted_rows) == 0:
            raise ValueError("Could not find any link between groups with ID " + link_id)
        deleted_link = deleted_rows[0]

        return Response({
            'id': deleted_link[0],
            'group_1_id': deleted_link[1],
            'group_2_id': deleted_link[2],
            'relation_id': deleted_link[3],
        })


class LandmarkGroupLinkage(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:Request, project_id, landmarkgroup_id) -> Response:
        """Get a list of landmark groups that are transitively linked to the
        input group with the passed in relation.
        ---
        parameters:
          - name: project_id
            description: Project of landmark groups
            type: integer
            paramType: path
            required: true
          - name: landmarkgroup_id
            description: The starting landmark group
            type: integer
            paramType: path
            required: true
          - name: relation_id
            description: The relation a valid group link has to have
            type: integer
            paramType: form
            required: true
          - name: max_depth
            description: (optional) Maximum number of hops from the source group. 0 to disable.
            type: integer
            paramType: form
            required: false
            defaultValue: 0
        """
        relation_id = request.query_params.get('relation_id')
        if not relation_id:
            raise ValueError("Please provide a relation ID")
        relation = Relation.objects.get(id=relation_id)

        max_depth = int(request.query_params.get('max_depth', 0))
        max_depth_constraint = 'AND %(max_depth)s > depth' if max_depth else ''

        # If the relation is reciprocal, we can't rely on order
        group_ids = None
        cursor = connection.cursor()
        if relation.isreciprocal:
            cursor.execute("""
                -- This assumes a reciprocal relation, direction is ignored.
                WITH RECURSIVE linked_group_paths(leaf, path, depth) AS (
                    SELECT CASE WHEN cici.class_instance_a = %(group_id)s
                        THEN cici.class_instance_b
                        ELSE cici.class_instance_a END AS leaf,
                        ARRAY[ROW(cici.class_instance_a, cici.class_instance_b)] AS path,
                        1 AS depth
                    FROM class_instance_class_instance cici
                    WHERE cici.project_id = %(project_id)s
                        AND cici.relation_id = %(relation_id)s
                        AND (cici.class_instance_a = %(group_id)s
                        OR cici.class_instance_b = %(group_id)s)

                    UNION ALL

                    SELECT CASE WHEN cici.class_instance_a = g.leaf
                        THEN cici.class_instance_b
                        ELSE cici.class_instance_a END,
                        path || ROW(cici.class_instance_a, cici.class_instance_b),
                        depth + 1
                    FROM linked_group_paths g
                    JOIN class_instance_class_instance cici
                        ON g.leaf IN (cici.class_instance_a, cici.class_instance_b)
                        AND ROW(cici.class_instance_a, cici.class_instance_b) <> ALL(path)
                    WHERE cici.project_id = %(project_id)s
                        AND cici.relation_id = %(relation_id)s
                        {}
                )
                SELECT ci.id
                FROM (
                    SELECT id FROM class WHERE project_id = %(project_id)s
                        AND class_name = 'landmarkgroup'
                ) lg(id), class_instance ci
                JOIN (
                    SELECT DISTINCT leaf FROM linked_group_paths
                ) lci(id)
                    ON ci.id = lci.id
                WHERE ci.class_id = lg.id

            """.format(max_depth_constraint), {
                'project_id': project_id,
                'group_id': landmarkgroup_id,
                'relation_id': relation_id,
                'max_depth': max_depth
            })

            group_ids = [r[0] for r in cursor.fetchall()]
        else:
            cursor.execute("""
                -- This assumes a reciprocal relation, direction is ignored.
                WITH RECURSIVE linked_group_paths(leaf, path, depth) AS (
                    SELECT cici.class_instance_b AS leaf,
                        ARRAY[ROW(cici.class_instance_a, cici.class_instance_b)] AS path,
                        1 AS depth
                    FROM class_instance_class_instance cici
                    WHERE cici.project_id = %(project_id)s
                        AND cici.relation_id = %(relation_id)s
                        AND cici.class_instance_a = %(group_id)s

                    UNION ALL

                    SELECT cici.class_instance_b,
                        path || ROW(cici.class_instance_a, cici.class_instance_b),
                        depth + 1
                    FROM linked_group_paths g
                    JOIN class_instance_class_instance cici
                        ON g.leaf = cici.class_instance_a
                        AND ROW(cici.class_instance_a, cici.class_instance_b) <> ALL(path)
                    WHERE cici.project_id = %(project_id)s
                        AND cici.relation_id = %(relation_id)s
                        {}
                )
                SELECT ci.id
                FROM (
                    SELECT id FROM class WHERE project_id = %(project_id)s
                        AND class_name = 'landmarkgroup'
                ) lg(id), class_instance ci
                JOIN (
                    SELECT DISTINCT leaf FROM linked_group_paths
                ) lci(id)
                    ON ci.id = lci.id
                WHERE ci.class_id = lg.id

            """.format(max_depth_constraint), {
                'project_id': project_id,
                'group_id': landmarkgroup_id,
                'relation_id': relation_id,
                'max_depth': max_depth
            })

            group_ids = [r[0] for r in cursor.fetchall()]

        return Response(group_ids)


class LandmarkGroupMaterializer(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request:Request, project_id) -> Response:
        """Create all passed in landmarks along with a set of groups in one go.

        The format for the passed in landmarks is expected to be [name, x1, y1,
        z1, x2, y2, z2], representing a shared landmark at locations (x1, y1,
        z1) for group A and (x2, y2, z2) for group B.

        The format for the optionally passed in links is: [group_name_1,
        relation_name, group_name_2] elements, representing a relation between
        two groups. Whether group A and B map to 1 and 2 or vice versa depends
        on the semantics of the relation.
        ---
        parameters:
        - name: project_id
          description: The project to operate in.
          type: integer
          paramType: path
          required: true
        - name: group_a_name
          description: The name of landmark group A.
          required: true
          type: string
          paramType: form
        - name: group_b_name
          description: The name of landmark group B.
          required: true
          type: string
          paramType: form
        - name: landmarks
          description: A list of landmark definitions for group B.
          required: true
          type: string
          paramType: form
        - name: links
          description: A list of link definitions between group A and B.
          required: false
          type: string
          paramType: form
        - name: reuse_existing_landmarks
          description: If existing landmarks can be reused, no error will be
                       thrown if a landmark with the same name exists alrady.
          required: false
          defaultValue: false
          type: string
          paramType: form
        """
        group_a_name = request.data.get('group_a_name')
        if not group_a_name:
            raise ValueError('Need name for group A')
        group_b_name = request.data.get('group_b_name')
        if not group_b_name:
            raise ValueError('Need name for group B')
        landmarks = get_request_list(request.data, 'landmarks')
        if not landmarks:
            raise ValueError('Need list of landmarks')
        links = get_request_list(request.data, 'links')
        reuse_existing_landmarks = get_request_bool(request.data, 'reuse_existing_landmarks', False)

        classes = get_class_to_id_map(project_id)
        relations = get_relation_to_id_map(project_id)
        landmark_class = classes['landmark']
        landmarkgroup_class = classes['landmarkgroup']
        part_of_rel = relations['part_of']
        annotated_with_rel = relations['annotated_with']

        # Try to create new landmark group A
        group_a, created = ClassInstance.objects.get_or_create(project_id=project_id,
                name=group_a_name, class_column_id=landmarkgroup_class, defaults={
                    'user': request.user
                })
        if not created:
            raise ValueError('A landmark group with name "' + group_a_name + '" exists already')

        # Try to create new landmark group B
        group_b, created = ClassInstance.objects.get_or_create(project_id=project_id,
                name=group_b_name, class_column_id=landmarkgroup_class, defaults={
                    'user': request.user
                })
        if not created:
            raise ValueError('A landmark group with name "' + group_b_name + '" exists already')

        landmark_map = dict() # type: Dict
        link_map = dict() # type: Dict

        n_created_landmarks = 0
        for landmark_name, x1, y1, z1, x2, y2, z2 in landmarks:
            if landmark_name in landmark_map:
                continue

            # Get or create landmark
            landmark, created = ClassInstance.objects.get_or_create(project_id=project_id,
                    name=landmark_name, class_column_id=landmark_class, defaults={
                        'user': request.user
                    })

            if created:
                n_created_landmarks += 1
            elif not reuse_existing_landmarks:
                raise ValueError('A landmark with name "' + landmark_name + '" exists alrady')

            landmark_map[landmark_name] = landmark.id

            # Link landmark to landmark groups
            landmark_group_a_link = ClassInstanceClassInstance.objects.create(
                    project_id=project_id, class_instance_a=landmark,
                    relation_id=part_of_rel, class_instance_b=group_a,
                    user=request.user)
            landmark_group_b_link = ClassInstanceClassInstance.objects.create(
                    project_id=project_id, class_instance_a=landmark,
                    relation_id=part_of_rel, class_instance_b=group_b,
                    user=request.user)

            # Create points for both groups
            point_a = Point.objects.create(project_id=project_id, location_x=x1,
                    location_y=y1, location_z=z1, user=request.user,
                    editor=request.user)
            point_b = Point.objects.create(project_id=project_id, location_x=x2,
                    location_y=y2, location_z=z2, user=request.user,
                    editor=request.user)

            # Link locations to landmark
            location_a_landmark_link = PointClassInstance.objects.create(
                    project_id=project_id, point=point_a, user=request.user,
                    relation_id=annotated_with_rel, class_instance=landmark)
            location_b_landmark_link = PointClassInstance.objects.create(
                    project_id=project_id, point=point_b, user=request.user,
                    relation_id=annotated_with_rel, class_instance=landmark)

            # Link locations to landmark groups
            location_a_landmark_group_link = PointClassInstance.objects.create(
                    project_id=project_id, point=point_a, user=request.user,
                    relation_id=annotated_with_rel, class_instance=group_a)
            location_b_landmark_group_link = PointClassInstance.objects.create(
                    project_id=project_id, point=point_b, user=request.user,
                    relation_id=annotated_with_rel, class_instance=group_b)

        return Response({
            'group_a_id': group_a.id,
            'group_b_id': group_b.id,
            'landmarks': landmark_map,
            'created_landmarks': n_created_landmarks,
            'links': link_map
        })
