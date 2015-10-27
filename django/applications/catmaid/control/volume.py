import json
import re

from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.models import UserRole, Project, Volume
from catmaid.serializers import VolumeSerializer

from django.db import connection
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view
from rest_framework.response import Response

num = '[-+]?[0-9]*\.?[0-9]+'
bbox_re = r'BOX3D\(({0})\s+({0})\s+({0}),\s*({0})\s+({0})\s+({0})\)'.format(num)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def volume_collection(request, project_id):
    """Get a collection of all available volumes.
    """
    if request.method == 'GET':
        p = get_object_or_404(Project, pk = project_id)
        volumes = Volume.objects.filter(project_id=project_id)
        serializer = VolumeSerializer(volumes, many=True)
        return Response(serializer.data)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def volume_detail(request, project_id, volume_id):
    """Get detailed information on a spatial volume.

    The result will contain the bounding box of the volume's geometry. The
    response might might therefore be relatively large.
    """
    if request.method != 'GET':
        return

    p = get_object_or_404(Project, pk = project_id)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, project_id, name, comment, user_id, editor_id,
            creation_time, edition_time, Box3D(geometry)
        FROM catmaid_volume v
        WHERE id=%s and project_id=%s""",
        (volume_id, project_id))
    volume = cursor.fetchone()

    # Parse bounding box into dictionary, coming in format "BOX3D(0 0 0,1 1 1)"
    bbox_matches = re.search(bbox_re, volume[8])
    if not bbox_matches or len(bbox_matches.groups()) != 6:
        raise ValueError("Couldn't create bounding box for geometry")
    bbox = map(float, bbox_matches.groups())

    return Response({
        'id': volume[0],
        'project_id': volume[1],
        'name': volume[2],
        'comment': volume[3],
        'user_id': volume[4],
        'editor_id': volume[5],
        'creation_time': volume[6],
        'edition_time': volume[7],
        'bbox': {
          'min': {'x': bbox[0], 'y': bbox[1], 'z': bbox[2]},
          'max': {'x': bbox[3], 'y': bbox[4], 'z': bbox[5]}
        }
    })

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def intersects(request, project_id, volume_id):
    """Test if a point intersects with a given volume.
    ---
    parameters:
      - name: x
        description: X coordinate of point to test
        paramType: query
        type: integer
      - name: y
        description: Y coordinate of point to test
        paramType: query
        type: integer
      - name: z
        description: Z coordinate of point to test
        paramType: query
        type: integer
    type:
      'intersects':
        type: boolean
        required: true
    """
    if request.method != 'GET':
        return

    p = get_object_or_404(Project, pk = project_id)
    x = request.GET.get('x', None)
    y = request.GET.get('y', None)
    z = request.GET.get('z', None)
    if None in (x,y,z):
        raise ValueError("Please provide valid X, Y and Z coordinates")

    x, y, z = int(x), int(y), int(z)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT ST_3DIntersects(pt.geometry, catmaid_volume.geometry)
        FROM (SELECT 'POINT(%s %s %s)'::geometry) AS pt, catmaid_volume
        WHERE catmaid_volume.id=%s""",
        (x, y, z, volume_id))

    result = cursor.fetchone()

    return HttpResponse(json.dumps({
        'intersects': result[0]
    }), content_type='text/json')
