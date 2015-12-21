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

def get_req_coordinate(request_dict, c):
    """Get a coordinate from a request dictionary or error.
    """
    v = request_dict.get(c, None)
    if not v:
        raise ValueError("Coordinate parameter %s missing." % c)
    return float(v)

def validate_vtype(vtype):
    """Validate the given type or error.
    """
    if not vtype:
        raise ValueError("Type parameter missing. It should have one of the "
                "following options: " + volume_type.keys().join(", "))
    if vtype not in volume_type.keys():
        raise ValueError("Type has to be one of the following: " +
                volume_type.keys().join(", "))
    return vtype

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

@api_view(['GET', 'POST'])
@requires_user_role([UserRole.Browse])
def volume_detail(request, project_id, volume_id):
    """Get detailed information on a spatial volume or set its properties..

    The result will contain the bounding box of the volume's geometry. The
    response might might therefore be relatively large.
    """
    p = get_object_or_404(Project, pk = project_id)
    if request.method == 'GET':
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
    elif request.method == 'POST':
        return update_volume(request, project_id=project_id, volume_id=volume_id)

@requires_user_role([UserRole.Annotate])
def update_volume(request, project_id, volume_id):
    """Update properties of an existing volume
    """
    if request.method != "POST":
        raise ValueError("Volume updates require a POST request")

    vtype = request.POST.get("type", None)
    validate_vtype(vtype)
    title = request.POST.get("title", None)
    if not title:
        raise ValueError("Title parameter missing")

    comment = request.POST.get("comment", None)

    min_x = get_req_coordinate(request.POST, "min_x")
    min_y = get_req_coordinate(request.POST, "min_y")
    min_z = get_req_coordinate(request.POST, "min_z")
    max_x = get_req_coordinate(request.POST, "max_x")
    max_y = get_req_coordinate(request.POST, "max_y")
    max_z = get_req_coordinate(request.POST, "max_z")

    update_volume = volume_type.get(vtype)
    volume_id = update_volume(project_id, request.user, title, comment, min_x,
                         min_y, min_z, max_x, max_y, max_z, volume_id)

    return Response({
        "success": True,
        "volume_id": volume_id
    })


def create_or_update_box(project_id, user, title, comment, minx, miny, minz,
        maxx, maxy, maxz, id=None):
    """Create or update a PostGIS box in project space.

    An existing box is updated, if the ID parameter is provided.
    """
    params = {
        "uid": user.id,
        "pid": project_id,
        "t": title,
        "c": comment,
        "lx": minx,
        "ly": miny,
        "lz": minz,
        "hx": maxx,
        "hy": maxy,
        "hz": maxz,
        "id": id
    }
    surface = """ST_GeomFromEWKT('POLYHEDRALSURFACE (
                  ((%(lx)s %(ly)s %(lz)s, %(lx)s %(hy)s %(lz)s, %(hx)s %(hy)s %(lz)s,
                    %(hx)s %(ly)s %(lz)s, %(lx)s %(ly)s %(lz)s)),
                  ((%(lx)s %(ly)s %(lz)s, %(lx)s %(hy)s %(lz)s, %(lx)s %(hy)s %(hz)s,
                    %(lx)s %(ly)s %(hz)s, %(lx)s %(ly)s %(lz)s)),
                  ((%(lx)s %(ly)s %(lz)s, %(hx)s %(ly)s %(lz)s, %(hx)s %(ly)s %(hz)s,
                    %(lx)s %(ly)s %(hz)s, %(lx)s %(ly)s %(lz)s)),
                  ((%(hx)s %(hy)s %(hz)s, %(hx)s %(ly)s %(hz)s, %(lx)s %(ly)s %(hz)s,
                    %(lx)s %(hy)s %(hz)s, %(hx)s %(hy)s %(hz)s)),
                  ((%(hx)s %(hy)s %(hz)s, %(hx)s %(ly)s %(hz)s, %(hx)s %(ly)s %(lz)s,
                    %(hx)s %(hy)s %(lz)s, %(hx)s %(hy)s %(hz)s)),
                  ((%(hx)s %(hy)s %(hz)s, %(hx)s %(hy)s %(lz)s, %(lx)s %(hy)s %(lz)s,
                    %(lx)s %(hy)s %(hz)s, %(hx)s %(hy)s %(hz)s)))')"""
    cursor = connection.cursor()
    if id:
        cursor.execute("""
            UPDATE catmaid_volume SET (user_id, project_id, editor_id, name,
                    comment, edition_time, geometry) =
            (%(uid)s, %(pid)s, %(uid)s, %(t)s, %(c)s, now(), """ +
                       surface + """)
            WHERE id=%(id)s RETURNING id;""", params)
    else:
        cursor.execute("""
            INSERT INTO catmaid_volume (user_id, project_id, editor_id, name,
                    comment, creation_time, edition_time, geometry)
            VALUES (%(uid)s, %(pid)s, %(uid)s, %(t)s, %(c)s, now(), now(), """ +
                       surface + """)
            RETURNING id;""", params)

    return cursor.fetchone()[0]

volume_type = {
    "box": create_or_update_box
}

@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_volume(request, project_id):
    """Create a new volume

    The ID of the newly created volume is returned. Currently only boxes are
    supported.
    ---
    parameters:
      - name: minx
        description: Minimum x coordinate of box
        paramType: form
        type: integer
        required: true
      - name: miny
        description: Minimum y coordinate of box
        paramType: form
        type: integer
        required: true
      - name: minz
        description: Minimum z coordinate of box
        paramType: form
        type: integer
        required: true
      - name: maxx
        description: Maximum x coordinate of box
        paramType: form
        type: integer
        required: true
      - name: maxy
        description: Maximum y coordinate of box
        paramType: form
        type: integer
        required: true
      - name: maxz
        description: Maximum z coordinate of box
        paramType: form
        type: integer
        required: true
      - name: title
        description: Title of box
        type: string
        required: true
      - name: type
        description: Type of volume (currently only box)
        type: string
        required: true
      - name: comment
        description: An optional comment
        type: string
        required: false
    type:
      'success':
        type: boolean
        required: true
      'volume_id':
        type: integer
        required: true
    """
    vtype = request.POST.get("type", None)
    validate_vtype(vtype)

    title = request.POST.get("title", None)
    if not title:
        raise ValueError("Title parameter missing")

    comment = request.POST.get("comment", None)

    min_x = get_req_coordinate(request.POST, "min_x")
    min_y = get_req_coordinate(request.POST, "min_y")
    min_z = get_req_coordinate(request.POST, "min_z")
    max_x = get_req_coordinate(request.POST, "max_x")
    max_y = get_req_coordinate(request.POST, "max_y")
    max_z = get_req_coordinate(request.POST, "max_z")

    create_volume = volume_type.get(vtype)
    volume_id = create_volume(project_id, request.user, title, comment,
            min_x, min_y, min_z, max_x, max_y, max_z)

    return Response({
        "success": True,
        "volume_id": volume_id
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
        type: number
      - name: y
        description: Y coordinate of point to test
        paramType: query
        type: number
      - name: z
        description: Z coordinate of point to test
        paramType: query
        type: number
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

    x, y, z = float(x), float(y), float(z)

    # This test works only for boxes, because it only checks bouding box
    # overlap (&&& operator).
    cursor = connection.cursor()
    cursor.execute("""
        SELECT pt.geometry &&& catmaid_volume.geometry
        FROM (SELECT 'POINT(%s %s %s)'::geometry) AS pt, catmaid_volume
        WHERE catmaid_volume.id=%s""",
        (x, y, z, volume_id))

    result = cursor.fetchone()

    return HttpResponse(json.dumps({
        'intersects': result[0]
    }), content_type='application/json')
