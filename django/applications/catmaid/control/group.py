# -*- coding: utf-8 -*-
import logging

from django.db import connection
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.decorators import user_passes_test
from django.http import HttpRequest, JsonResponse
from django.utils.decorators import method_decorator

from rest_framework.views import APIView

from catmaid.control.authentication import requires_user_role, access_check

User = get_user_model()

logger = logging.getLogger('__name__')


class GroupList(APIView):

    def get(self, request:HttpRequest) -> JsonResponse:
        """List all available point clouds.
        ---
        parameters:
          - name: member_id
            description: Return only groups this user is member of.
            type: integer
            paramType: form
            required: false
        """
        if not access_check(request.user):
            return JsonResponse([], safe=False)

        member_id = request.query_params.get('member_id')

        if member_id is not None:
            member_id = int(member_id)
            user = User.objects.get(pk=member_id)
            groups = [{
                'id': g.id,
                'name': g.name,
            } for g in user.groups.all()]
        elif settings.PROJECT_TOKEN_USER_VISIBILITY:
            groups = []
        else:
            groups = Group.objects.all()

            groups = [{
                'id': g.id,
                'name': g.name,
            } for g in groups]

        return JsonResponse(groups, safe=False)
