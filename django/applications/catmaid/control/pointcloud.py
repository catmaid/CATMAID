# -*- coding: utf-8 -*-

from typing import Any, Dict, List, Union
from io import StringIO, BytesIO
import json
import logging
from PIL import Image

from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils.decorators import method_decorator

from guardian.shortcuts import get_perms, get_users_with_perms, assign_perm

from rest_framework.views import APIView
from rest_framework.decorators import api_view

from catmaid.control.authentication import (requires_user_role,
        can_edit_or_fail, check_user_role)
from catmaid.control.common import (insert_into_log, get_class_to_id_map,
        get_relation_to_id_map, _create_relation, get_request_bool,
        get_request_list)
from catmaid.models import (Group, Point, PointCloud, PointCloudPoint, ImageData,
        PointCloudImageData, UserRole)

logger = logging.getLogger('__name__')


def serialize_pointcloud(pointcloud, simple=False) -> Dict[str, Any]:
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


def serialize_point(point, compact=False) -> Union[Dict[str, Any], List]:
    if compact:
        return [point.id, point.location_x, point.location_y, point.location_z]
    else:
        return {
            'id': point.id,
            'x': point.location_x,
            'y': point.location_y,
            'z': point.location_z,
        }


def serialize_image_data(image, simple=False) -> Dict[str, Any]:
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


def list_pointclouds(project_id, user_id, simple, with_images=False,
        with_points=True, sample_ratio=1.0, pointcloud_ids=None, order_by='id') -> List[Dict[str, Any]]:
    extra_select = []
    extra_join = []
    query_params = {
        'project_id': project_id,
        'user_id': user_id
    }

    if with_images:
        extra_select.append('image_data.ids')
        extra_select.append('image_data.names')
        extra_select.append('image_data.descriptions')
        extra_select.append('image_data.source_paths')
        extra_join.append('''
            LEFT JOIN LATERAL (
                SELECT array_agg(i.id), array_agg(i.name),
                    array_agg(i.description), array_agg(i.source_path)
                FROM pointcloud_image_data pci
                JOIN image_data i
                    ON i.id = pci.image_data_id
                WHERE pci.pointcloud_id = pc.id
                GROUP BY pc.id
            ) image_data(ids, names, descriptions, source_paths)
                ON true
        ''')

    if pointcloud_ids:
        extra_join.append('''
            JOIN UNNEST(%(pointcloud_ids)s::bigint[]) query_pointcloud(id)
                ON query_pointcloud.id = pc.id
        ''')
        query_params['pointcloud_ids'] = pointcloud_ids

    if order_by == 'id':
        order = 'ORDER BY pc.id'
    elif order_by == 'name':
        order = 'ORDER BY pc.name'
    else:
        order = ''

    # Check permissions. If there are no permission assigned at all,
    # everyone can read a point cloud.
    cursor = connection.cursor()
    cursor.execute("""
        SELECT pc.id, pc.name, pc.description, pc.user_id, pc.creation_time,
            pc.edition_time
        {extra_select}
        FROM pointcloud pc
        LEFT OUTER JOIN pointcloud_user_object_permission puop
            ON pc.id = puop.content_object_id
        LEFT OUTER JOIN pointcloud_group_object_permission pgop
            ON pc.id = pgop.content_object_id
        LEFT OUTER JOIN auth_permission ap_u
            ON ap_u.id = puop.permission_id
        LEFT OUTER JOIN auth_permission ap_g
            ON ap_g.id = pgop.permission_id
        LEFT OUTER JOIN auth_user_groups ug
            ON ug.group_id = pgop.group_id
        {extra_join}
        WHERE pc.project_id = %(project_id)s AND (
            (puop.id IS NULL AND pgop.id IS NULL) OR
            (puop.user_id = %(user_id)s AND ap_u.codename = 'can_read') OR
            (ug.user_id = %(user_id)s AND ap_g.codename ='can_read'))
        {order}
    """.format(**{
        'extra_select': (', ' + ', '.join(extra_select)) if extra_select else '',
        'extra_join': '\n'.join(extra_join),
        'order': order,
    }), query_params)

    if simple:
        pointcloud_data = [{
            'id': pc[0],
            'name': pc[1],
        } for pc in cursor.fetchall()]
    else:
        pointcloud_data = []
        if with_images:
            for pc in cursor.fetchall():
                if pc[6]:
                    images = [{
                        'id': iid,
                        'name': pc[7][n],
                        'description': pc[8][n],
                        'source_path': pc[9][n],
                    } for n, iid in enumerate(pc[6])]
                else:
                    images = []

                data = {
                    'id': pc[0],
                    'name': pc[1],
                    'description': pc[2],
                    'images': images,
                    'user_id': pc[3],
                    'creation_time': pc[4],
                    'edition_time': pc[5],
                    'project_id': project_id,
                }
                pointcloud_data.append(data)
        else:
            for n, pc in enumerate(cursor.fetchall()):
                data = {
                    'id': pc[0],
                    'name': pc[1],
                    'description': pc[2],
                    'user_id': pc[3],
                    'creation_time': pc[4],
                    'edition_time': pc[5],
                    'project_id': project_id,
                }
                pointcloud_data.append(data)

    return pointcloud_data


class PointCloudList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id) -> JsonResponse:
        """List all available point clouds or optionally a sub set.
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
          - name: sample_ratio
            description: Number in [0,1] to optionally sample point cloud
            type: number
            paramType: form
            required: false
          - name: pointcloud_ids
            description: A list of point cloud IDs to which the query is constrained.
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
        with_images = get_request_bool(request.query_params, 'with_images', False)
        with_points = get_request_bool(request.query_params, 'with_points', False)
        sample_ratio = float(request.query_params.get('sample_ratio', '1.0'))
        simple = get_request_bool(request.query_params, 'simple', False)
        pointcloud_ids = get_request_list(request.query_params,
                'pointcloud_ids', None, map_fn=int)
        order_by = request.query_params.get('order_by', 'id')

        pointclouds = list_pointclouds(project_id, request.user.id, simple,
                with_images, with_points, sample_ratio, pointcloud_ids, order_by)

        return JsonResponse(pointclouds, safe=False)


    @method_decorator(requires_user_role(UserRole.Browse))
    def post(self, request:HttpRequest, project_id) -> JsonResponse:
        """List all available point clouds or optionally a sub set.
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
          - name: sample_ratio
            description: Number in [0,1] to optionally sample point cloud
            type: number
            paramType: form
            required: false
          - name: pointcloud_ids
            description: A list of point cloud IDs to which the query is constrained.
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
        with_images = get_request_bool(request.POST, 'with_images', False)
        with_points = get_request_bool(request.POST, 'with_points', False)
        sample_ratio = float(request.POST.get('sample_ratio', '1.0'))
        simple = get_request_bool(request.POST, 'simple', False)
        pointcloud_ids = get_request_list(request.POST,
                'pointcloud_ids', None, map_fn=int)
        order_by = request.query_params.get('order_by', 'id')

        pointclouds = list_pointclouds(project_id, request.user.id, simple,
                with_images, with_points, sample_ratio, pointcloud_ids, order_by)

        return JsonResponse(pointclouds, safe=False)


    @method_decorator(requires_user_role(UserRole.Annotate))
    def put(self, request:HttpRequest, project_id) -> JsonResponse:
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
          - name: group_id
            description: A group for which this point cloud will be visible exclusivly.
            type: integer
            paramType: form
            required: false
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

        image_names = get_request_list(request.POST, 'image_names')
        image_descriptions = get_request_list(request.POST, 'image_descriptions')
        n_images = len(request.FILES)

        if image_names and len(image_names) != n_images:
            raise ValueError("If image names are passed in, there need to be exactly as many as passed in files ({})".format(n_images))

        if image_descriptions and len(image_descriptions) != n_images:
            raise ValueError("If image descriptions are passed in, there need to be exactly as many as passed in files ({})".format(n_images))

        cursor = connection.cursor()
        for n, image in enumerate(request.FILES.values()):
            if image.size > settings.IMPORTED_IMAGE_FILE_MAXIMUM_SIZE:
                raise ValueError("Image {} is bigger than IMPORTED_IMAGE_FILE_MAXIMUM_SIZE ({} MB)".format(
                        image.name, settings.IMPORTED_IMAGE_FILE_MAXIMUM_SIZE / 1024**2))

            # Transform into JPEG
            img = Image.open(image)
            image_io = BytesIO()
            img.save(image_io, format='JPEG')

            cursor.execute("""
                INSERT INTO image_data(user_id, project_id, name, description,
                        source_path, content_type, image)
                VALUES (%(user_id)s, %(project_id)s, %(name)s, %(description)s,
                        %(source_path)s, %(content_type)s, %(image)s)
                RETURNING id;
            """, {
                'user_id': request.user.id,
                'project_id': project_id,
                'name': image.name,
                'description': image_descriptions[n],
                'source_path': image.name,
                'content_type': 'image/jpeg',
                'image': image_io.getvalue()
            })
            image_data_id = cursor.fetchone()[0]

            pcid = PointCloudImageData(**{
                'project_id': project_id,
                'pointcloud_id': pc.id,
                'image_data_id': image_data_id,
            })
            pcid.save()

        # Find an optional restriction group permission. If a group has no
        # permission assigned, it is considered readable by all.
        group_id = request.POST.get('group_id')
        if group_id is not None:
            group_id = int(group_id)
            group = Group.objects.get(pk=group_id)
            assigned_perm = assign_perm('can_read', group, pc)

        # Add points
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


class PointCloudImageDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, pointcloud_id, image_id) -> HttpResponse:
        """Return a point cloud.
        parameters:
          - name: project_id
            description: Project of the returned point cloud image
            type: integer
            paramType: path
            required: true
          - name: pointcloud_id
            description: Point cloud this image is linked to
            type: integer
            paramType: path
            required: true
          - name: image_id
            description: The image to load
            type: integer
            paramType: path
            required: true
        """
        pointcloud = PointCloud.objects.get(pk=pointcloud_id, project_id=project_id)

        # Check permissions. If there are no read permission assigned at all,
        # everyone can read.
        if 'can_read' not in get_perms(request.user, pointcloud) and \
                len(get_users_with_perms(pointcloud)) > 0:
            raise PermissionError('User "{}" not allowed to read point cloud #{}'.format(
                    request.user.username, pointcloud.id))

        cursor = connection.cursor()
        cursor.execute("""
            SELECT image, content_type, name
            FROM image_data img
            JOIN pointcloud_image_data pcid
                ON img.id = pcid.image_data_id
            WHERE img.project_id = %(project_id)s
            AND pcid.image_data_id = %(image_id)s
            AND pcid.pointcloud_id = %(pointcloud_id)s
        """, {
            'project_id': project_id,
            'pointcloud_id': pointcloud_id,
            'image_id': image_id,
        })

        rows = cursor.fetchall()
        if len(rows) == 0:
            raise ValueError("Could not find image")
        if len(rows) > 1:
            raise ValueError("Found more than one image")

        image_data = rows[0][0]
        content_type = rows[0][1]
        name = rows[0][2]

        response = HttpResponse(image_data.tobytes(), content_type=content_type)
        response['Content-Disposition'] = 'attachment; filename={}'.format(name)
        return response


class PointCloudDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, pointcloud_id) -> JsonResponse:
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
        sample_ratio = float(request.query_params.get('sample_ratio', '1.0'))
        simple = get_request_bool(request.query_params, 'simple', False)

        pointcloud = PointCloud.objects.get(pk=pointcloud_id, project_id=project_id)
        pointcloud_data = serialize_pointcloud(pointcloud, simple)

        # Check permissions. If there are no read permission assigned at all,
        # everyone can read.
        if 'can_read' not in get_perms(request.user, pointcloud) and \
                len(get_users_with_perms(pointcloud)) > 0:
            raise PermissionError('User "{}" not allowed to read point cloud #{}'.format(
                    request.user.username, pointcloud.id))

        if with_images:
            images = [serialize_image_data(i) for i in pointcloud.images.all()]
            pointcloud_data['images'] = images

        if with_points:
            if sample_ratio == 1.0:
                points = [serialize_point(p, compact=True) for p in pointcloud.points.all()]
                pointcloud_data['points'] = points
            else:
                n_points = PointCloudPoint.objects.filter(pointcloud_id=pointcloud.id).count()
                n_sample = int(n_points * sample_ratio)
                cursor = connection.cursor()
                # Select a random sample of N points in a repeatable fashion.
                cursor.execute("""
                    SELECT setseed(0);
                    SELECT id, location_x, location_y, location_z
                    FROM point p
                    JOIN (
                        SELECT pcp.point_id
                        FROM pointcloud_point pcp
                        WHERE pcp.pointcloud_id = %(pointcloud_id)s
                        ORDER BY random()
                    ) ordered_points(id)
                        USING(id)
                    LIMIT %(n_sample)s
                """, {
                    'pointcloud_id': pointcloud.id,
                    'n_sample': n_sample
                })
                pointcloud_data['points'] = cursor.fetchall()

        return JsonResponse(pointcloud_data)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:HttpRequest, project_id, pointcloud_id) -> JsonResponse:
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
