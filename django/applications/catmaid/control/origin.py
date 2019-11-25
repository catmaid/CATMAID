# -*- coding: utf-8 -*-

from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role
from catmaid.models import DataSource, UserRole
from catmaid.serializers import DataSourceSerializer

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class OriginCollection(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:Request, project_id) -> Response:
        """List all available data sources / origins.
        ---
        parameters:
          - name: project_id
            description: Project the data sources are registered in
            type: integer
            paramType: path
            required: true
        """
        datasources = DataSource.objects.filter(project_id=project_id)
        serializer = DataSourceSerializer(datasources, many=True)
        return Response(serializer.data)
