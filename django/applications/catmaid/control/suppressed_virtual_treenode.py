# -*- coding: utf-8 -*-

from django.http import Http404
from django.utils.decorators import method_decorator
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer, ValidationError
from rest_framework import status
from rest_framework.views import APIView

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole, SuppressedVirtualTreenode, Treenode


class SuppressedVirtualTreenodeSerializer(ModelSerializer):
    class Meta:
        model = SuppressedVirtualTreenode
        read_only_fields = ('id', 'user', 'creation_time', 'edition_time', 'project', 'child')
        fields = '__all__'


class SuppressedVirtualTreenodeList(APIView):
    @method_decorator(requires_user_role([UserRole.Browse, UserRole.Annotate]))
    @never_cache
    def get(self, request:Request, project_id=None, treenode_id=None, format=None) -> Response:
        """List suppressed virtual nodes along the edge to this node.
        ---
        serializer: SuppressedVirtualTreenodeSerializer
        """
        suppressed = SuppressedVirtualTreenode.objects.filter(child_id=treenode_id)
        serializer = SuppressedVirtualTreenodeSerializer(suppressed, many=True)
        return Response(serializer.data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request:Request, project_id=None, treenode_id=None, format=None) -> Response:
        """Suppress a virtual treenode along the edge to this node.

        Suppress a virtual treenode along the edge between this treenode
        and its parent from being traversed during normal topology navigation
        and review.
        ---
        parameters:
        - name: orientation
          description: |
            Stack orientation to determine which axis is the coordinate of the
            plane where virtual nodes are suppressed. 0 for z, 1 for y, 2 for x.
          required: true
          type: integer
          paramType: form
        - name: location_coordinate
          description: |
            Coordinate along the edge from this node to its parent where
            virtual nodes are suppressed.
          required: true
          type: number
          format: double
          paramType: form
        serializer: SuppressedVirtualTreenodeSerializer
        """
        child = get_object_or_404(Treenode, pk=treenode_id)
        if not child.parent_id:
            raise ValidationError('Root nodes do not have virtual nodes')
        orientation = int(request.POST['orientation'])
        if not 0 <= orientation <= 2:
            raise ValidationError('Orientation axis must be 0, 1 or 2')
        location_coordinate = float(request.POST['location_coordinate'])
        location_field = 'location_' + ['z', 'y', 'x'][orientation]
        child_c = getattr(child, location_field)
        parent_c = getattr(child.parent, location_field)
        if not min(child_c, parent_c) <= location_coordinate <= max(child_c, parent_c):
            raise ValidationError('Suppressed node must be between child and parent nodes')

        suppressed = SuppressedVirtualTreenode.objects.create(
                project_id=project_id,
                user=request.user,
                child_id=treenode_id,
                orientation=orientation,
                location_coordinate=location_coordinate)
        serializer = SuppressedVirtualTreenodeSerializer(suppressed)
        return Response(serializer.data)


class SuppressedVirtualTreenodeDetail(APIView):
    def get_object(self, project_id, treenode_id, suppressed_id):
        try:
            return SuppressedVirtualTreenode.objects.get(pk=suppressed_id, project_id=project_id, child_id=treenode_id)
        except SuppressedVirtualTreenode.DoesNotExist:
            raise Http404

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:Request, project_id=None, treenode_id=None, suppressed_id=None, format=None) -> Response:
        """Unsuppress a virtual treenode.
        """
        suppressed = self.get_object(project_id, treenode_id, suppressed_id)
        suppressed.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
