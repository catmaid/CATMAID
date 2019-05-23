# -*- coding: utf-8 -*-

import logging
from typing import Any, Dict, List

from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.utils.decorators import method_decorator

from rest_framework.views import APIView
from rest_framework.decorators import api_view

from catmaid.control.authentication import requires_user_role
        
from catmaid.control.common import get_request_bool, get_request_list
from catmaid.models import PointSet, UserRole


logger = logging.getLogger('__name__')


def serialize_pointset(pointset, simple=False) -> Dict[str, Any]:
    if simple:
        return {
            'id': pointset.id,
            'name': pointset.name,
        }
    else:
        return {
            'id': pointset.id,
            'user_id': pointset.user_id,
            'creation_time': pointset.creation_time,
            'edition_time': pointset.edition_time,
            'project_id': pointset.project_id,
            'name': pointset.name,
            'description': pointset.description,
        }


def list_pointsets(project_id, user_id, simple, with_points=True,
        pointset_ids=None, order_by='id') -> List[Dict[str, Any]]:
    extra_select = [] # type: List
    extra_join = []
    query_params = {
        'project_id': project_id,
        'user_id': user_id
    }

    if pointset_ids:
        extra_join.append('''
            JOIN UNNEST(%(pointset_ids)s::bigint[]) query_pointset(id)
                ON query_pointset.id = ps.id
        ''')
        query_params['pointset_ids'] = pointset_ids

    if order_by == 'id':
        order = 'ORDER BY ps.id'
    elif order_by == 'name':
        order = 'ORDER BY ps.name'
    else:
        order = ''

    # Check permissions. If there are no permission assigned at all,
    # everyone can read a point set.
    cursor = connection.cursor()
    cursor.execute("""
        SELECT ps.id, ps.name, ps.description, ps.user_id, ps.creation_time,
            ps.edition_time
        {extra_select}
        FROM point_set ps
        {extra_join}
        WHERE ps.project_id = %(project_id)s
        {order}
    """.format(**{
        'extra_select': (', ' + ', '.join(extra_select)) if extra_select else '',
        'extra_join': '\n'.join(extra_join),
        'order': order,
    }), query_params)

    if simple:
        pointset_data = [{
            'id': ps[0],
            'name': ps[1],
        } for ps in cursor.fetchall()]
    else:
        pointset_data = []
        for n, ps in enumerate(cursor.fetchall()):
            data = {
                'id': ps[0],
                'name': ps[1],
                'description': ps[2],
                'user_id': ps[3],
                'creation_time': ps[4],
                'edition_time': ps[5],
                'project_id': project_id,
            }
            pointset_data.append(data)

    return pointset_data


class PointSetList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id) -> JsonResponse:
        """List all available point sets or optionally a sub set.
        ---
        parameters:
          - name: project_id
            description: Project of the returned point sets
            type: integer
            paramType: path
            required: true
          - name: simple
            description: Wheter or not only ID and name should be returned
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: with_points
            description: Wheter linked points should returned as well.
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: pointset_ids
            description: A list of point set IDs to which the query is constrained.
            type: array
            paramType: path
            required: false
          - name: order_by
            description: The field to order the response list by (name, id).
            type: string
            paramType: path
            required: false
            defaultValue: 'id'
        """
        with_points = get_request_bool(request.query_params, 'with_points', False)
        simple = get_request_bool(request.query_params, 'simple', False)
        pointset_ids = get_request_list(request.query_params,
                'pointset_ids', None, map_fn=int)
        order_by = request.query_params.get('order_by', 'id')

        pointsets = list_pointsets(project_id, request.user.id, simple,
                with_points, pointset_ids, order_by)

        return JsonResponse(pointsets, safe=False)


    @method_decorator(requires_user_role(UserRole.Browse))
    def post(self, request:HttpRequest, project_id) -> JsonResponse:
        """List all available point sets or optionally a sub set.
        ---
        parameters:
          - name: project_id
            description: Project of the returned point sets
            type: integer
            paramType: path
            required: true
          - name: simple
            description: Wheter or not only ID and name should be returned
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: with_points
            description: Wheter linked points should returned as well.
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: pointset_ids
            description: A list of point set IDs to which the query is constrained.
            type: array
            paramType: path
            required: false
          - name: order_by
            description: The field to order the response list by (name, id).
            type: string
            paramType: path
            required: false
            defaultValue: 'id'
        """
        with_points = get_request_bool(request.POST, 'with_points', False)
        simple = get_request_bool(request.POST, 'simple', False)
        pointset_ids = get_request_list(request.POST,
                'pointset_ids', None, map_fn=int)
        order_by = request.query_params.get('order_by', 'id')

        pointsets = list_pointsets(project_id, request.user.id, simple,
                with_points, pointset_ids, order_by)

        return JsonResponse(pointsets, safe=False)


class PointSetDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, pointset_id) -> JsonResponse:
        """Return a point set.
        parameters:
          - name: project_id
            description: Project of the returned point set
            type: integer
            paramType: path
            required: true
          - name: simple
            description: Wheter or not only ID and name should be returned
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: with_points
            description: Wheter linked points should returned as well.
            type: bool
            paramType: form
            required: false
            defaultValue: false
        """
        with_points = get_request_bool(request.query_params, 'with_points', False)
        simple = get_request_bool(request.query_params, 'simple', False)

        pointset = PointSet.objects.get(pk=pointset_id, project_id=project_id)
        pointset_data = serialize_pointset(pointset, simple)

        if with_points:
            pointset_data['points'] = []

        return JsonResponse(pointset_data)
