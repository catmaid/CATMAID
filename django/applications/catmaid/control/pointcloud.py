# -*- coding: utf-8 -*-
import logging
import json

from django.db import connection
from django.http import JsonResponse
from django.utils.decorators import method_decorator

from rest_framework.views import APIView
from rest_framework.decorators import api_view

from catmaid.control.authentication import (requires_user_role,
        can_edit_or_fail, check_user_role)
from catmaid.control.common import (insert_into_log, get_class_to_id_map,
        get_relation_to_id_map, _create_relation, get_request_bool,
        get_request_list)
from catmaid.models import (Point, PointCloud, PointCloudPoint, ImageData,
        PointCloudImageData, UserRole)


logger = logging.getLogger('__name__')


def serialize_pointcloud(pointcloud, simple=False):
    if simple:
        return {
            'id': pointcloud.id,
            'name': pointcloud.name,
        }
    else:
        return {
            'id': pointcloud.id,
            'user_id': pointcloud.user_id,
            'creation_time': pointcloud.creation_time,
            'edition_time': pointcloud.edition_time,
            'project_id': pointcloud.project_id,
            'name': pointcloud.name,
            'description': pointcloud.description,
        }


def serialize_point(point, compact=False):
    if compact:
        return [point.id, point.location_x, point.location_y, point.location_z]
    else:
        return {
            'id': point.id,
            'x': point.location_x,
            'y': point.location_y,
            'z': point.location_z,
        }


def serialize_image_data(image, simple=False):
    if simple:
        return {
            'id': image.id,
            'name': image.name,
        }
    else:
        return {
            'id': image.id,
            'name': image.name,
            'description': image.description,
            'source_path': image.source_path,
        }


class PointCloudList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """List all available point clouds.
        ---
        parameters:
          - name: project_id
            description: Project of the returned point clouds
            type: integer
            paramType: path
            required: true
          - name: simple
            description: Wheter or not only ID and name should be returned
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: with_images
            description: Wheter linked images should returned as well.
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
        with_images = get_request_bool(request.query_params, 'with_images', False)
        with_points = get_request_bool(request.query_params, 'with_points', False)
        simple = get_request_bool(request.query_params, 'simple', False)
        return JsonResponse([serialize_pointcloud(c, simple) for c in
                PointCloud.objects.filter(project_id=project_id)], safe=False)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request, project_id):
        """Create a new pointcloud by providing.
        ---
        parameters:
          - name: project_id
            description: Project of the new point cloud
            type: integer
            paramType: path
            required: true
          - name: name
            description: Name of the new point cloud
            type: string
            paramType: form
            required: true
          - name: description
            description: Description of the new point cloud
            type: string
            paramType: form
            required: false
          - name: points
            description: Points of point cloud in project space. Can be a stringified JSON array.
            type: array
            paramType: form
            required: true
        """
        name = request.POST.get('name')
        if not name:
            raise ValueError("Need name")
        description = request.POST.get('description', '')
        source_path = request.POST.get('source_path', '')

        # Create new Point instances for each import location and link it to the
        # point cloud.
        if 'points' in request.POST:
            points = json.loads(request.POST['points'])
        else:
            points = get_request_list(request.POST, 'points')
        #        map_fn=lambda x: [float(x[0]), float(x[1]), float(x[2])])
        if not points:
            raise ValueError("Need points to create point cloud")

        pc = PointCloud.objects.create(project_id=project_id,
                name=name, description=description, user=request.user,
                source_path=source_path)
        pc.save()

        cursor = connection.cursor()
        cursor.execute("""
            WITH added_point AS (
                INSERT INTO point (project_id, user_id, editor_id, location_x,
                    location_y, location_z)
                SELECT %(project_id)s, %(user_id)s, %(editor_id)s,
                    p.location[1], p.location[2], p.location[3]
                FROM reduce_dim(%(points)s) p(location)
                RETURNING id
            )
            INSERT INTO pointcloud_point (project_id, pointcloud_id, point_id)
            SELECT %(project_id)s, %(pointcloud_id)s, ap.id
            FROM added_point ap
        """, {
            "project_id": project_id,
            "user_id": request.user.id,
            "editor_id": request.user.id,
            "pointcloud_id": pc.id,
            "points": points,
        })


        # If images are provided, store them in the database and link them to the
        # point cloud.
        images = get_request_list(request.POST, 'images')

        return JsonResponse(serialize_pointcloud(pc))


class PointCloudDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id, pointcloud_id):
        """Return a point cloud.
        parameters:
          - name: project_id
            description: Project of the returned point cloud
            type: integer
            paramType: path
            required: true
          - name: simple
            description: Wheter or not only ID and name should be returned
            type: bool
            paramType: form
            required: false
            defaultValue: false
          - name: with_images
            description: Wheter linked images should returned as well.
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
        with_images = get_request_bool(request.query_params, 'with_images', False)
        with_points = get_request_bool(request.query_params, 'with_points', False)
        simple = get_request_bool(request.query_params, 'simple', False)

        pointcloud = PointCloud.objects.get(pk=pointcloud_id, project_id=project_id)
        pointcloud_data = serialize_pointcloud(pointcloud, simple)

        if with_images:
            images = [serialize_image_data(i) for i in pointcloud.images.all()]
            pointcloud_data['images'] = images

        if with_points:
            points = [serialize_point(p, compact=True) for p in pointcloud.points.all()]
            pointcloud_data['points'] = points

        return JsonResponse(pointcloud_data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, pointcloud_id):
        """Delete a point cloud.
        """
        can_edit_or_fail(request.user, pointcloud_id, 'pointcloud')
        pointcloud = PointCloud.objects.get(pk=pointcloud_id, project_id=project_id)

        cursor = connection.cursor()
        cursor.execute("""
            DELETE FROM pointcloud
            CASCADE
            WHERE project_id=%s AND id = %s
        """, [project_id, pointcloud_id])

        return JsonResponse({
            'deleted': True,
            'pointcloud_id': pointcloud.id
        })
