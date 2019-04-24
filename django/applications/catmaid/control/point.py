# -*- coding: utf-8 -*-

from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.models import Point, UserRole
from catmaid.serializers import PointSerializer

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class PointList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:Request, project_id) -> Response: # XXX: Why is this an object method when everything else is class methods?
        """List points, optionally constrained by various properties.
        ---
        parameters:
          - name: project_id
            description: Project of points
            type: integer
            paramType: path
            required: true
        """
        points = Point.objects.all()
        serializer = PointSerializer(points, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(request:Request, project_id) -> Response:
        """Add a new point. Expect at least the location as parameters.
        ---
        parameters:
          - name: project_id
            description: Project of points
            type: integer
            paramType: path
            required: true
          - name: location_x
            description: X coordinate
            type: float
            paramType: form
            required: true
          - name: location_y
            description: Y coordinate
            type: float
            paramType: form
            required: true
          - name: location_z
            description: Z coordinate
            type: float
            paramType: form
            required: true
          - name: radius
            description: Optional radius
            type: float
            paramType: form
            required: false
          - name: confidence
            description: Optional confidence in [0,5]
            type: integer
            paramType: form
            required: false
        """
        location_x = float(request.POST.get('x'))
        location_y = float(request.POST.get('y'))
        location_z = float(request.POST.get('z'))
        radius = float(request.POST.get('radius', 0))
        confidence = min(max(int(request.POST.get('confidence'), 0), 0), 5)

        point = Point.objects.create(project_id=project_id, user=request.user,
                editor=request.user, location_x=location_x, location_y=location_y,
                location_z=location_z, radius=radius, confidence=confidence)
        point.save()

        serializer = PointSerializer(point)
        return Response(serializer.data)

class PointDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(request:Request, project_id, point_id) -> Response:
        """Return details on one particular point.
        ---
        parameters:
          - name: project_id
            description: Project point is part of
            type: integer
            paramType: path
            required: true
          - name: point_id
            description: ID of point
            type: integer
            paramType: path
            required: true
        """
        point = get_object_or_404(Point, pk=point_id, project_id=project_id)
        serializer = PointSerializer(point)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(request:Request, project_id, point_id) -> Response:
        """Update one particular point.

        Requires at least one field to change.
        ---
        parameters:
          - name: project_id
            description: Project point is part of
            type: integer
            paramType: path
            required: true
          - name: point_id
            description: ID of point
            type: integer
            paramType: path
            required: true
          - name: location_x
            description: X coordinate
            type: float
            paramType: form
            required: false
          - name: location_y
            description: Y coordinate
            type: float
            paramType: form
            required: false
          - name: location_z
            description: Z coordinate
            type: float
            paramType: form
            required: false
          - name: radius
            description: Optional radius
            type: float
            paramType: form
            required: false
          - name: confidence
            description: Optional confidence in [0,5]
            type: integer
            paramType: form
            required: false
        """
        can_edit_or_fail(request.user, point_id, 'point')

        updated_fields = {}
        if request.POST.has('x'):
            updated_fields['location_x'] = float(request.POST.get('x'))
        if request.POST.has('y'):
            updated_fields['location_y'] = float(request.POST.get('y'))
        if request.POST.has('z'):
            updated_fields['location_z'] = float(request.POST.get('z'))
        if request.POST.has('radius'):
            updated_fields['radius'] = float(request.POST.get('radius'))
        if request.POST.has('confidence'):
            confidence = max(min(int(request.POST.get('confidence')), 5), 0)
            updated_fields['confidence'] = confidence

        if not updated_fields:
            raise ValueError('No field to modify provided')

        point = get_object_or_404(Point, pk=point_id, project_id=project_id)
        point.update(**updated_fields)
        point.save()

        serializer = PointSerializer(point)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(request:Request, project_id, point_id) -> Response:
        """Delete one particular point.
        ---
        parameters:
          - name: project_id
            description: Project point is part of
            type: integer
            paramType: path
            required: true
          - name: point_id
            description: ID of point
            type: integer
            paramType: path
            required: true
        """
        can_edit_or_fail(request.user, point_id, 'point')

        point = get_object_or_404(Point, pk=point_id, project_id=project_id)
        point.delete()

        point.id = None

        serializer = PointSerializer(point)
        return Response(serializer.data)
