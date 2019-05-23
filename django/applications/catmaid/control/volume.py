# -*- coding: utf-8 -*-

from itertools import chain
import json
import os
import re
from typing import Callable, List
from xml.etree import ElementTree as ET

from django.conf import settings
from django.db import connection
from django.http import JsonResponse, HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.annotation import get_annotated_entities
from catmaid.control.authentication import requires_user_role, user_can_edit
from catmaid.control.common import get_request_list
from catmaid.models import UserRole, Project, Volume
from catmaid.serializers import VolumeSerializer

from rest_framework import renderers
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.response import Response
from rest_framework.views import APIView

_num = '[-+]?[0-9]*.?[0-9]+'
_bbox_re = r'BOX3D\(({0})\s+({0})\s+({0}),\s*({0})\s+({0})\s+({0})\)'.format(_num)

def get_req_coordinate(request_dict, c) -> float:
    """Get a coordinate from a request dictionary or error.
    """
    v = request_dict.get(c, None)
    if not v:
        raise ValueError("Coordinate parameter %s missing." % c)
    return float(v)

def require_option(obj, field):
    """Raise an exception if a field is missing
    """
    if field in obj:
        return obj.get(field)
    else:
        raise ValueError("Parameter '{}' is missing".format(field))

def get_volume_instance(project_id, user_id, options):
    vtype = options.get("type", None)
    validate_vtype(vtype)

    init = volume_type.get(vtype)
    return init(project_id, user_id, options) # type: ignore # theoretically could return None

class PostGISVolume(object):
    """Volumes are supposed to create Volume model compatible data in the volume
    table by using PostGIS volumes.
    """

    def __init__(self, project_id, user_id, options):
        self.id = options.get('id', None)
        self.project_id = project_id
        self.user_id = user_id
        self.title = options.get('title') if self.id else require_option(options, "title")
        self.comment = options.get("comment", None)

    def get_geometry(self):
        return None

    def get_params(self):
        return None

    def save(self):
        surface = self.get_geometry()
        cursor = connection.cursor()
        extra_params = self.get_params() or {}
        if self.id:
            params = {
                "id": self.id,
                "project_id": self.project_id or 'project_id',
            }
            editable_params = {
                "editor_id": self.user_id,
                "name": self.title,
                "comment": self.comment,
                'geometry': surface
            }
            params.update(editable_params)
            params.update(extra_params)
            fields = [k for k in editable_params.keys() if editable_params.get(k)]
            # If surface is none, the old value will be used. This makes it
            # possible to update the volume without overriding its geometry.
            cursor.execute("""
                UPDATE catmaid_volume SET ({fields}) = ({templates})
                WHERE id=%(id)s
                RETURNING id
            """.format(**{
                'fields': ', '.join(fields + ['edition_time']),
                'templates': ', '.join(['%({})s'.format(f) for f in fields] + ['now()'])
            }), params)
        else:
            params = {
                "uid": self.user_id,
                "pid": self.project_id,
                "t": self.title,
                "c": self.comment,
            }
            params.update(extra_params)

            if not surface:
                raise ValueError("Can't create new volume without mesh")

            cursor.execute("""
                WITH v AS (
                    INSERT INTO catmaid_volume (user_id, project_id, editor_id, name,
                            comment, creation_time, edition_time, geometry)
                    VALUES (%(uid)s, %(pid)s, %(uid)s, %(t)s, %(c)s, now(), now(), """ +
                               surface + """)
                    RETURNING user_id, project_id, id
                ), ci AS (
                    INSERT INTO class_instance (user_id, project_id, name, class_id)
                    SELECT %(uid)s, project_id, %(t)s, id
                    FROM class
                    WHERE project_id = %(pid)s AND class_name = 'volume'
                    RETURNING id
                ), r AS (
                    SELECT id FROM relation
                    WHERE project_id = %(pid)s AND relation_name = 'model_of'
                )
                INSERT INTO volume_class_instance
                    (user_id, project_id, relation_id, volume_id, class_instance_id)
                SELECT
                    v.user_id,
                    v.project_id,
                    r.id,
                    v.id,
                    ci.id
                FROM v, ci, r
                RETURNING volume_id
                """, params)

        return cursor.fetchone()[0]

class TriangleMeshVolume(PostGISVolume):
    """A generic triangle mesh, provided from an external source.
    """
    def __init__(self, project_id, user_id, options):
        super(TriangleMeshVolume, self).__init__(project_id, user_id, options)
        input_mesh = options.get("mesh", None)
        if input_mesh:
            mesh_type = type(input_mesh)
            if list == mesh_type:
                self.mesh = input_mesh
            elif mesh_type == str:
                self.mesh = json.loads(input_mesh)
            else:
                raise ValueError("Unknown mesh type: " + str(mesh_type))
        else:
            self.mesh = None

    def get_params(self):
        return None

    def get_geometry(self):
        return TriangleMeshVolume.fromLists(self.mesh) if self.mesh else None

    @classmethod
    def fromLists(cls, mesh):
        """Expect mesh to be a list of two lists: [[points], [triangles]]. The
        list of points contains lists of three numbers, each one representing a
        vertex in the mesh. The array of triangles also contains three element
        lists as items. Each one represents a triangle based on the points in
        the other array, that are referenced by the triangle index values.
        """
        def pg_point(p):
            return '{} {} {}'.format(p[0], p[1], p[2])

        def pg_face(points, f):
            p0 = pg_point(points[f[0]])
            return '(({}, {}, {}, {}))'.format(p0, pg_point(points[f[1]]),
                 pg_point(points[f[2]]), p0)

        points, faces = mesh
        triangles = [pg_face(points, f) for f in faces]
        return "ST_GeomFromEWKT('TIN (%s)')" % ','.join(triangles)

class BoxVolume(PostGISVolume):

    def __init__(self, project_id, user_id, options):
        super(BoxVolume, self).__init__(project_id, user_id, options)
        self.min_x = get_req_coordinate(options, "min_x")
        self.min_y = get_req_coordinate(options, "min_y")
        self.min_z = get_req_coordinate(options, "min_z")
        self.max_x = get_req_coordinate(options, "max_x")
        self.max_y = get_req_coordinate(options, "max_y")
        self.max_z = get_req_coordinate(options, "max_z")

    def get_geometry(self):
        return """ST_GeomFromEWKT('TIN (
            (({0}, {2}, {1}, {0})),
            (({1}, {2}, {3}, {1})),

            (({0}, {1}, {5}, {0})),
            (({0}, {5}, {4}, {0})),

            (({2}, {6}, {7}, {2})),
            (({2}, {7}, {3}, {2})),

            (({4}, {7}, {6}, {4})),
            (({4}, {5}, {7}, {4})),

            (({0}, {6}, {2}, {0})),
            (({0}, {4}, {6}, {0})),

            (({1}, {3}, {5}, {1})),
            (({3}, {7}, {5}, {3})))')
        """.format(*[
            '%({a})s %({b})s %({c})s'.format(**{
                'a': 'hx' if i & 0b001 else 'lx',
                'b': 'hy' if i & 0b010 else 'ly',
                'c': 'hz' if i & 0b100 else 'lz',
            })
            for i in range(8)
        ])

    def get_params(self):
        return {
            "lx": self.min_x,
            "ly": self.min_y,
            "lz": self.min_z,
            "hx": self.max_x,
            "hy": self.max_y,
            "hz": self.max_z,
            "id": self.id
        }


def _chunk(iterable, length, fn=None):
    if not fn:
        fn = lambda x: x

    items = []
    it = iter(iterable)
    while True:
        try:
            items.append(fn(next(it)))
        except StopIteration:
            if items:
                raise ValueError(
                    "Iterable did not have a multiple of {} items ({} spare)".format(length, len(items))
                )
            else:
                return
        else:
            if len(items) == length:
                yield tuple(items)
                items = []


def _x3d_to_points(x3d, fn=None):
    indexed_triangle_set = ET.fromstring(x3d)
    assert indexed_triangle_set.tag == "IndexedTriangleSet"
    assert len(indexed_triangle_set) == 1

    coordinate = indexed_triangle_set[0]
    assert coordinate.tag == "Coordinate"
    assert len(coordinate) == 0
    points_str = coordinate.attrib["point"]

    for item in _chunk(points_str.split(' '), 3, fn):
        yield item


def _x3d_to_stl_ascii(x3d):
    solid_fmt = """
solid
{}
endsolid
            """.strip()
    facet_fmt = """
facet normal 0 0 0
outer loop
{}
endloop
endfacet
            """.strip()
    vertex_fmt = "vertex {} {} {}"

    triangle_strs = []
    for triangle in _chunk(_x3d_to_points(x3d), 3):
        vertices = '\n'.join(vertex_fmt.format(*point) for point in triangle)
        triangle_strs.append(facet_fmt.format(vertices))

    return solid_fmt.format('\n'.join(triangle_strs))


class InvalidSTLError(ValueError):
    pass


def _stl_ascii_to_indexed_triangles(stl_str):
    stl_items = stl_str.strip().split()
    if stl_items[0] != "solid" or "endsolid" not in stl_items[-2:]:
        raise InvalidSTLError("Malformed solid header/ footer")
    start = 1 if stl_items[1] == "facet" else 2
    stop = -1 if stl_items[-2] == "endfacet" else -2
    vertices = [] # type: List
    triangles = []
    for facet in _chunk(stl_items[start:stop], 21):
        if any([
            facet[:2] != ("facet", "normal"),
            facet[5:7] != ("outer", "loop"),
            facet[-2:] != ("endloop", "endfacet")
        ]):
            raise InvalidSTLError("Malformed facet/loop header/footer")

        this_triangle = []
        for vertex in _chunk(facet[7:-2], 4):
            if vertex[0] != "vertex":
                raise InvalidSTLError("Malformed vertex")
            vertex_id = len(vertices)
            vertices.append([float(item) for item in vertex[1:]])
            this_triangle.append(vertex_id)
        if len(this_triangle) != 3:
            raise InvalidSTLError("Expected triangle, got {} points".format(this_triangle))
        triangles.append(this_triangle)

    return vertices, triangles


volume_type = {
    "box": BoxVolume,
    "trimesh": TriangleMeshVolume
}

def validate_vtype(vtype):
    """Validate the given type or error.
    """
    if not vtype:
        raise ValueError("Type parameter missing. It should have one of the "
                "following options: " + ", ".join(volume_type.keys()))
    if vtype not in volume_type.keys():
        raise ValueError("Type has to be one of the following: " +
                ", ".join(volume_type.keys()))
    return vtype

@api_view(['GET', 'POST'])
@requires_user_role([UserRole.Browse])
def volume_collection(request, project_id):
    """Get a collection of all available volumes.
    ---
    parameters:
      - name: project_id
        description: Project to operate in
        type: integer
        paramType: path
        required: true
      - name: volume_ids
        description: Only return specified volumes
        paramType: form
        type: array
        items:
            type: integer
        required: false
    """
    if request.method == 'GET':
        data = request.GET
    elif request.method == 'POST':
        data = request.POST
    else:
        raise ValueError("Unsupported HTTP method" + request.method)

    p = get_object_or_404(Project, pk=project_id)
    volume_ids = get_request_list(data, 'volume_ids', [], map_fn=int)

    params = {
        'project_id': project_id,
    }

    extra_joins = []

    if volume_ids:
        extra_joins.append("""
            JOIN UNNEST(%(volume_ids)s::bigint[]) query_volume(id)
                ON query_volume.id = v.id
        """)
        params['volume_ids'] = volume_ids

    cursor = connection.cursor()
    cursor.execute("""
        SELECT v.id, v.name, v.comment, v.user_id, v.editor_id, v.project_id,
            v.creation_time, v.edition_time,
            JSON_AGG(ann.name) FILTER (WHERE ann.name IS NOT NULL) AS annotations
        FROM catmaid_volume v
        LEFT JOIN volume_class_instance vci ON vci.volume_id = v.id
        LEFT JOIN class_instance_class_instance cici
            ON cici.class_instance_a = vci.class_instance_id
        LEFT JOIN class_instance ann ON ann.id = cici.class_instance_b
        {extra_joins}
        WHERE v.project_id = %(project_id)s
            AND (
                cici.relation_id IS NULL OR
                cici.relation_id = (
                    SELECT id FROM relation
                    WHERE project_id = %(project_id)s AND relation_name = 'annotated_with'
                )
            )
        GROUP BY v.id
        """.format(**{
            'extra_joins': '\n'.join(extra_joins),
        }), params)

    return JsonResponse({
        'columns': [r[0] for r in cursor.description],
        'data': cursor.fetchall()
    })

def get_volume_details(project_id, volume_id):
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, project_id, name, comment, user_id, editor_id,
            creation_time, edition_time, Box3D(geometry), ST_Asx3D(geometry)
        FROM catmaid_volume v
        WHERE id=%s and project_id=%s""",
        (volume_id, project_id))
    volume = cursor.fetchone()

    if not volume:
        raise ValueError("Could not find volume " + volume_id)

    # Parse bounding box into dictionary, coming in format "BOX3D(0 0 0,1 1 1)"
    bbox_matches = re.search(_bbox_re, volume[8])
    if not bbox_matches or len(bbox_matches.groups()) != 6:
        raise ValueError("Couldn't create bounding box for geometry")
    bbox = list(map(float, bbox_matches.groups()))

    return {
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
        },
        'mesh': volume[9]
    }


class VolumeDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id, volume_id):
        """Get detailed information on a spatial volume or set its properties.

        The result will contain the bounding box of the volume's geometry and the
        actual geometry encoded in X3D format. The response might might therefore be
        relatively large.
        """
        p = get_object_or_404(Project, pk=project_id)
        volume = get_volume_details(p.id, volume_id)
        return Response(volume)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request, project_id, volume_id):
        """Update the properties of a spatial volume.

        Only the fields that are provided are updated. If no mesh or bounding
        box parameter is changed, no type has to be provided.
        ---
        parameters:
          - name: type
            description: Type of volume to edit
            paramType: form
            type: string
            enum: ["box", "trimesh"]
            required: false
          - name: title
            description: Title of volume
            type: string
            required: false
          - name: comment
            description: A comment on a volume
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
        return update_volume(request, project_id=project_id, volume_id=volume_id)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, volume_id):
        """Delete a particular spatial volume.
        """
        return remove_volume(request, project_id=project_id, volume_id=volume_id)


@requires_user_role([UserRole.Annotate])
def remove_volume(request, project_id, volume_id):
    """Remove a particular volume, if the user has permission to it.
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT user_id FROM catmaid_volume WHERE id=%s
    """, (volume_id,))
    rows = cursor.fetchall()
    if 0 == len(rows):
        raise ValueError("Could not find volume with ID {}".format(volume_id))
    volume_user_id = rows[0][0]

    if not user_can_edit(connection.cursor(), request.user.id, volume_user_id) and not request.user.is_superuser:
        raise Exception("You don't have permissions to delete this volume")

    cursor.execute("""
        WITH v AS (
            DELETE FROM catmaid_volume WHERE id=%s RETURNING id
        ), vci AS (
            DELETE FROM volume_class_instance
            USING v
            WHERE volume_id = v.id
            RETURNING class_instance_id
        ), ci AS (
            DELETE FROM class_instance
            USING vci
            WHERE id = vci.class_instance_id
            RETURNING id
        )
        DELETE FROM class_instance_class_instance
        USING ci
        WHERE class_instance_a = ci.id OR class_instance_b = ci.id
    """, (volume_id,))

    return Response({
        "success": True,
        "volume_id": volume_id
    })

@requires_user_role([UserRole.Annotate])
def update_volume(request, project_id, volume_id):
    """Update properties of an existing volume

    Only the fields that are provided are updated. If no mesh or bounding box
    parameter is changed, no type has to be provided.
    ---
    parameters:
      - name: type
        description: Type of volume to edit
        paramType: form
        type: string
        enum: ["box", "trimesh"]
        required: false
      - name: title
        description: Title of volume
        type: string
        required: false
      - name: comment
        description: A comment on a volume
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
    if request.method != "POST":
        raise ValueError("Volume updates require a POST request")

    options = {
        "id": volume_id,
        "type": request.POST.get('type'),
        "title": request.POST.get('title'),
        "comment": request.POST.get('comment')
    }
    try:
        instance = get_volume_instance(project_id, request.user.id, options)
    except ValueError as e:
        if volume_id:
            instance = PostGISVolume(project_id, request.user.id, options)
        else:
            raise e
    volume_id = instance.save()

    return Response({
        "success": True,
        "volume_id": volume_id
    })

@api_view(['POST'])
@requires_user_role([UserRole.Annotate])
def add_volume(request, project_id):
    """Create a new volume

    The ID of the newly created volume is returned. Currently, box volumes and
    triangle meshes are supported. Which one is created depends on the "type"
    parameter, which can be either set to "box" or to "trimesh".

    If a triangle mesh should be created, the "mesh" parameter is expected to
    hold the complete volume. It is expected to be a string that encodes two
    lists in JSON format: [[points], [triangles]]. The list of points contains
    lists of three numbers, each one representing a vertex in the mesh. The
    array of triangles also contains three element lists as items. Each one
    represents a triangle based on the points in the other array, that are
    referenced by the triangle index values.
    ---
    parameters:
      - name: type
        description: Type of volume to create
        paramType: form
        type: string
        enum: ["box", "trimesh"]
        required: true
      - name: title
        description: Title of volume
        type: string
        required: true
      - name: comment
        description: An optional comment
        type: string
        required: false
      - name: mesh
        description: Triangle mesh
        paramType: form
        type: string
        required: false
      - name: minx
        description: Minimum x coordinate of box
        paramType: form
        type: integer
        required: false
      - name: miny
        description: Minimum y coordinate of box
        paramType: form
        type: integer
        required: false
      - name: minz
        description: Minimum z coordinate of box
        paramType: form
        type: integer
        required: false
      - name: maxx
        description: Maximum x coordinate of box
        paramType: form
        type: integer
        required: false
      - name: maxy
        description: Maximum y coordinate of box
        paramType: form
        type: integer
        required: false
      - name: maxz
        description: Maximum z coordinate of box
        paramType: form
        type: integer
        required: false
    type:
      'success':
        type: boolean
        required: true
      'volume_id':
        type: integer
        required: true
    """
    # Use DRF's request.data to be able to also be able to parse
    # application/json content type requests. This can be convenient when
    # importing meshes.
    instance = get_volume_instance(project_id, request.user.id, request.data)
    volume_id = instance.save()

    return Response({
        "success": True,
        "volume_id": volume_id
    })


@api_view(['POST'])
@requires_user_role([UserRole.Import])
def import_volumes(request, project_id):
    """Import triangle mesh volumes from an uploaded files.

    Currently only STL representation is supported.
    ---
    consumes: multipart/form-data
    parameters:
      - name: file
        required: true
        description: >
            Triangle mesh file to import. Multiple files can be provided, with
            each being imported as a mesh named by its base filename.
        paramType: body
        dataType: File
    type:
      '{base_filename}':
        description: ID of the volume created from this file
        type: integer
        required: true
    """
    fnames_to_id = dict()
    for uploadedfile in request.FILES.values():
        if uploadedfile.size > settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE:  # todo: use different setting
            return HttpResponse(
                'File too large. Maximum file size is {} bytes.'.format(settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE),
                status=413)

        filename = uploadedfile.name
        name, extension = os.path.splitext(filename)
        if extension.lower() == ".stl":
            stl_str = uploadedfile.read().decode('utf-8')

            try:
                vertices, triangles = _stl_ascii_to_indexed_triangles(stl_str)
            except InvalidSTLError as e:
                raise ValueError("Invalid STL file ({})".format(str(e)))

            mesh = TriangleMeshVolume(
                project_id, request.user.id,
                {"type": "trimesh", "title": name, "mesh": [vertices, triangles]}
            )
            fnames_to_id[filename] = mesh.save()
        else:
            return HttpResponse('File type "{}" not understood. Known file types: stl'.format(extension), status=415)

    return JsonResponse(fnames_to_id)


class AnyRenderer(renderers.BaseRenderer):
    """A DRF renderer that returns the data directly with a wildcard media type.

    This is useful for bypassing response content type negotiation.
    """
    media_type = '*/*'

    def render(self, data, media_type=None, renderer_context=None):
        return data


@api_view(['GET'])
@renderer_classes((AnyRenderer,))
@requires_user_role([UserRole.Browse])
def export_volume(request, project_id, volume_id, extension):
    """Export volume as a triangle mesh file.

    The extension of the endpoint and `ACCEPT` header media type are both used
    to determine the format of the export.

    Supported formats by extension and media type:
    ##### STL
      - `model/stl`, `model/x.stl-ascii`: ASCII STL

    """
    acceptable = {
        'stl': ['model/stl', 'model/x.stl-ascii'],
    }
    if extension.lower() in acceptable:
        media_types = request.META.get('HTTP_ACCEPT', '').split(',')
        for media_type in media_types:
            if media_type in acceptable[extension]:
                details = get_volume_details(project_id, volume_id)
                ascii_details = _x3d_to_stl_ascii(details['mesh'])
                response = HttpResponse(content_type=media_type)
                response.write(ascii_details)
                return response
        return HttpResponse('Media types "{}" not understood. Known types for {}: {}'.format(
            ', '.join(media_types), extension, ', '.join(acceptable[extension])), status=415)
    else:
        return HttpResponse('File type "{}" not understood. Known file types: {}'.format(
            extension, ', '.join(chain.from_iterable(acceptable.values()))), status=415)


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def intersects(request, project_id, volume_id):
    """Test if a point intersects with the bounding box of a given volume.
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

    p = get_object_or_404(Project, pk=project_id)
    x = request.GET.get('x', None)
    y = request.GET.get('y', None)
    z = request.GET.get('z', None)
    if None in (x,y,z):
        raise ValueError("Please provide valid X, Y and Z coordinates")

    x, y, z = float(x), float(y), float(z)

    # This test works only for boxes, because it only checks bounding box
    # overlap (&&& operator).
    cursor = connection.cursor()
    cursor.execute("""
        SELECT pt.geometry &&& catmaid_volume.geometry
        FROM (SELECT 'POINT(%s %s %s)'::geometry) AS pt, catmaid_volume
        WHERE catmaid_volume.id=%s""",
        (x, y, z, volume_id))

    result = cursor.fetchone()

    return JsonResponse({
        'intersects': result[0]
    })


@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def get_volume_entities(request, project_id):
    """Retrieve a mapping of volume IDs to entity (class instance) IDs.
    ---
    parameters:
      - name: volume_ids
        description: A list of volume IDs to map
        paramType: query
    """
    volume_ids = get_request_list(request.POST, 'volume_ids', map_fn=int)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT vci.volume_id, vci.class_instance_id
        FROM volume_class_instance vci
        JOIN UNNEST(%(volume_ids)s::int[]) volume(id)
        ON volume.id = vci.volume_id
        WHERE project_id = %(project_id)s
        AND relation_id = (
            SELECT id FROM relation
            WHERE relation_name = 'model_of'
            AND project_id = %(project_id)s
        )
    """, {
        'volume_ids': volume_ids,
        'project_id': project_id
    })

    return JsonResponse(dict(cursor.fetchall()))


def get_primary_volumes_by_name(project_id):
    """Helper function that returns list of all volumes considered as primary
    neuropils by using the standardized volume naming schema to filter out the
    others - modified version of get_volume_details.
    """
    cursor = connection.cursor()
    cursor.execute('''
        SELECT id, project_id, name, comment, user_id, editor_id, creation_time,
            edition_time, Box3D(geometry), ST_Asx3D(geometry)
        FROM catmaid_volume v
        WHERE v.project_id= %(project_id)s
            AND (name LIKE '%%_R' OR name LIKE '%%_L' OR char_length(name)<5)
            AND char_length(name) <= 10
            AND name NOT LIKE 'v14%%'
    ''', {
        'project_id': project_id
    })
    volume = cursor.fetchall()

    return volume


def find_volumes(project_id, annotation=None,
        transitive_annotation=True, simple=False):
    """Find volumes in the passed in project, optionally require a particular
    annotation or list of annotations. If <transitive_annotation> is True,
    volumes that are transitively annotated by the passed in annotation are
    considered too.
    """
    extra_select = []
    extra_joins = []
    extra_where = []
    extra_params = {}

    if annotation:
        annotations = annotation if type(annotation) in (list, tuple, set) else [annotation]
        query_params = {
            'annotation_reference': 'name',
        }
        for n,a in enumerate(annotations):
            query_params['annotated_with[{}]'.format(n)] = a
            if transitive_annotation:
                query_params['sub_annotated_with[{}]'.format(n)] = a
        query_result, _ = get_annotated_entities(project_id, query_params,
                allowed_classes=['volume'], with_annotations=False,
                with_skeletons=False)
        candidate_volume_ci_ids = [ci['id'] for ci in query_result]

        extra_params['candidate_volume_ids'] = candidate_volume_ci_ids

        extra_joins.append("""
            JOIN volume_class_instance vci
                ON vci.volume_id = v.id
            JOIN UNNEST(%(candidate_volume_ids)s::bigint[]) candidate(id)
                ON candidate.id = vci.class_instance_id
        """)

        extra_where.append("""
            AND vci.relation_id = (
                SELECT id
                FROM relation
                WHERE project_id = %(project_id)s
                    AND relation_name = 'model_of'
            )
        """)

    if not simple:
        extra_select.extend(['v.project_id', 'v.name', 'v.comment',
                'v.user_id', 'v.editor_id', 'v.creation_time',
                'v.edition_time','Box3D(v.geometry)', 'ST_AsText(v.geometry)'])

    params = {
        'project_id': project_id,
    }
    params.update(extra_params)

    cursor = connection.cursor()
    cursor.execute('''
        SELECT v.id
        {extra_select}
        FROM catmaid_volume v
        {extra_joins}
        WHERE v.project_id= %(project_id)s
        {extra_where}
    '''.format(**{
        'extra_select': ','.join([''] + extra_select),
        'extra_joins': '\n'.join(extra_joins),
        'extra_where': '\n'.join(extra_where),
    }), params)

    volume_details = []
    for volume in cursor.fetchall():
        if simple:
            volume_details.append({
                'id': volume[0],
            })
        else:
            # Parse bounding box into dictionary, coming in format "BOX3D(0 0 0,1 1 1)"
            bbox_matches = re.search(_bbox_re, volume[8])
            if not bbox_matches or len(bbox_matches.groups()) != 6:
                raise ValueError("Couldn't create bounding box for geometry")
            bbox = list(map(float, bbox_matches.groups()))
            volume_details.append({
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
                },
                'mesh': volume[9],
            })

    return volume_details


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def get_skeleton_innervations(request, project_id):
    """Test environment only contains two skeletons - based on that, sql query
    always returns list of all SKIDs but all data (about both skeletons) is
    contained in the first SKID in the list - if this changes, write an else
    statement for: len(cleanResults) >1.
    ---
    parameters:
        - name: project_id
          required: true
          description: The project to operate in
          type: integer
          paramType: path
        - name: skeleton_ids
          description: Constrain results to these skeletons
          required: false
          type: array
          items:
            type: integer
          paramType: form
        - name: annotation
          description: An annotation potential target volumes need to have
          type: string
          required: false
        - name: min_nodes
          description: A minimum number of nodes result skeleton need to have.
          required: false
          type: boolean
        - name: min_cable
          description: A minimum number of cable length esult skeleton need to have.
          required: false
          type: boolean
    """
    skeleton_ids = get_request_list(request.POST, 'skeleton_ids', map_fn=int)
    if not skeleton_ids:
        raise ValueError('Need skeleton IDs')
    volume_annotation = request.POST.get('annotation')
    min_nodes = request.POST.get('min_nodes')
    if min_nodes:
        min_nodes = int(min_nodes)
    min_cable = request.POST.get('min_cable')
    if min_cable:
        min_cable = int(min_cable)

    volume_intersections = _get_skeleton_innervations(project_id, skeleton_ids,
            volume_annotation, min_nodes, min_cable)

    return JsonResponse(volume_intersections, safe=False)


def _get_skeleton_innervations(project_id, skeleton_ids, volume_annotation,
        min_nodes=None, min_cable=None):
    # Build an intersection query for each volume bounding box with the passed
    # in set of skeletons.
    query_params = {
        'project_id': project_id,
        'volume_ids': [v['id'] for v in
                find_volumes(project_id, volume_annotation, simple=True)],
        'skeleton_ids': skeleton_ids,
    }

    # First, get the bounding box of each query skeleton and find the ones
    # intersecting the query volume bounding boxess. Next, check if there are
    # infact any edges of those skeltons that intersect with the volume bounding
    # box. If so, these are returned.

    # It is possible to provide extra constraints, based on node count, length
    # and skeleton IDs.
    extra_where = []
    extra_joins = []

    needs_summary = min_nodes or min_cable

    if needs_summary:
        extra_joins.append("""
            JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = sv.id
        """)
    if min_nodes:
        extra_where.append("""
            css.num_nodes >= %(min_nodes)s
        """)
        query_params['min_nodes'] = min_nodes
    if min_cable:
        extra_where.append("""
            css.cable_length >= %(min_cable)s
        """)
        query_params['min_cable'] = min_cable

    cursor = connection.cursor()
    cursor.execute("""
        WITH q_volume AS (
            SELECT v.id,
            Box3D(v.geometry) AS bb
            FROM catmaid_volume v
            JOIN UNNEST(%(volume_ids)s::bigint[]) query_volume(id)
                ON query_volume.id = v.id
        ),
        skeleton_bb AS (
                SELECT skeleton.id AS id,
                        ST_Envelope(ST_Collect(te.edge)) as bb
                FROM UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
                JOIN treenode t
                        ON t.skeleton_id = skeleton.id
                JOIN treenode_edge te
                        ON te. id = t.id
                GROUP BY skeleton.id
        ),
        skeleton_vol AS (
                SELECT sb.id, v_match.id AS volume_id, v_match.bb
                FROM skeleton_bb sb
                CROSS JOIN LATERAL (
                        SELECT v.id, v.bb
                        FROM q_volume v
                        -- Require bounding box intersection
                        WHERE v.bb &&& sb.bb
                ) v_match
        )
        SELECT sv.id AS skeleton_id, array_agg(sv.volume_id)
        FROM skeleton_vol sv
        {extra_joins}
        WHERE EXISTS(
                SELECT 1
                FROM treenode t
                JOIN treenode_edge te
                        ON t.id = te.id
                WHERE t.project_id = %(project_id)s
                AND t.skeleton_id = sv.id
                AND te.edge &&& sv.bb
        )
        {extra_where}
        GROUP BY sv.id
    """.format(**{
        'extra_joins': '\n'.join(extra_joins),
        'extra_where': '\n'.join(extra_where),
    }), query_params)

    skeleton_intersections = list(map(lambda x: {
        'skeleton_id': x[0],
        'volume_ids': x[1]
    }, cursor.fetchall()))
    return skeleton_intersections
