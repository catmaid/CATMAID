# -*- coding: utf-8 -*-

from itertools import chain
import io
import logging
import json
import os
import re
import struct
import sys
import trimesh
import numpy as np
from typing import Any, Callable, Dict, List, Sequence, Tuple, Union
from xml.etree import ElementTree as ET

from django.conf import settings
from django.db import connection
from django.http import (HttpRequest, HttpResponse, HttpResponseBadRequest,
        JsonResponse, Http404)
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.annotation import get_annotated_entities
from catmaid.control.authentication import requires_user_role, user_can_edit
from catmaid.control.common import get_request_list
from catmaid.control.provenance import get_data_source, normalize_source_url
from catmaid.models import ClassInstance, UserRole, Project, Volume, VolumeOrigin
from catmaid.serializers import VolumeSerializer

from rest_framework import renderers
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


logger = logging.getLogger(__name__)


_num = '[-+]?[0-9]*.?[0-9]+'
_bbox_re = rf'BOX3D\(({_num})\s+({_num})\s+({_num}),\s*({_num})\s+({_num})\s+({_num})\)'


def get_req_coordinate(request_dict, c) -> float:
    """Get a coordinate from a request dictionary or error.
    """
    v = request_dict.get(c, None)
    if not v:
        raise ValueError("Coordinate parameter %s missing." % c)
    return float(v)

def require_option(obj, field) -> Any:
    """Raise an exception if a field is missing
    """
    if field in obj:
        return obj.get(field)
    else:
        raise ValueError(f"Parameter '{field}' is missing")

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
                'templates': ', '.join([f'%({f})s' for f in fields] + ['now()'])
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

        # Make sure volume meta information is correct
        volume_id = cursor.fetchone()[0]
        update_volume_meta_information(self.project_id, [volume_id])

        return volume_id


class TriangleMeshVolume(PostGISVolume):
    """A generic triangle mesh, provided from an external source.
    """
    def __init__(self, project_id, user_id, options):
        super().__init__(project_id, user_id, options)
        input_mesh = options.get("mesh", None)
        if input_mesh:
            mesh_type = type(input_mesh)
            if list == mesh_type:
                self.mesh = input_mesh
            elif mesh_type == str:
                self.mesh = json.loads(input_mesh)
            else:
                raise ValueError(f"Unknown mesh type: {mesh_type}")

            # Ensure that the passed in mesh conforms to our expectation of
            # being a two element tuple.
            if type(self.mesh) not in (list, tuple) or len(self.mesh) != 2:
                raise ValueError("Mesh doesn't conform to expected format: a " \
                        "two-element tuple/list: [points, faces].")
            if len(self.mesh[0]) < 3 or len(self.mesh[1]) < 1:
                raise ValueError("Mesh needs to have at lest three points and one face.")

        else:
            self.mesh = None

    def get_params(self):
        if self.mesh is None:
            return None

        # Expect mesh to be a list of two lists: [[points], [triangles]]. The
        # list of points contains lists of three numbers, each one representing a
        # vertex in the mesh. The array of triangles also contains three element
        # lists as items. Each one represents a triangle based on the points in
        # the other array, that are referenced by the triangle index values.
        points, faces = self.mesh
        BYTEORD = b"\0" if sys.byteorder == "big" else b"\1"
        WKB_TIN_Z = 1016
        WKB_TRIANGLE_Z = 1017
        TIN_HEAD = struct.pack("=cII", BYTEORD, WKB_TIN_Z, len(faces))
        TRI_HEAD = struct.pack("=cIII", BYTEORD, WKB_TRIANGLE_Z, 1, 4)

        def pg_point_into(p, b):
            if not p or len(p) != 3:
                raise ValueError(f'Point "{p}" does not have three elements')
            b.extend(struct.pack("=3d", *p))

        def pg_face_into(points, f, b):
            if not f or len(f) != 3:
                raise ValueError(f'Face "{f}" does not have three elements')
            b.extend(TRI_HEAD)
            for i in (0, 1, 2, 0):
                pg_point_into(points[f[i]], b)

        ewkb = bytearray(TIN_HEAD)

        for f in faces:
            pg_face_into(points, f, ewkb)

        return {"ewkb": ewkb}

    def get_geometry(self):
        return "ST_GeomFromEWKB(%(ewkb)s)" if self.mesh else None

class BoxVolume(PostGISVolume):

    def __init__(self, project_id, user_id, options):
        super().__init__(project_id, user_id, options)
        self.min_x = get_req_coordinate(options, "min_x")
        self.min_y = get_req_coordinate(options, "min_y")
        self.min_z = get_req_coordinate(options, "min_z")
        self.max_x = get_req_coordinate(options, "max_x")
        self.max_y = get_req_coordinate(options, "max_y")
        self.max_z = get_req_coordinate(options, "max_z")

    def get_geometry(self) -> str:
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

    def get_params(self) -> Dict[str, Any]:
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
                raise ValueError(f"Iterable did not have a multiple of {length} items ({len(items)} spare)")
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


def _x3d_to_stl_ascii(x3d) -> str:
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


def _stl_ascii_to_indexed_triangles(stl_str) -> Tuple[List, List]:
    stl_items = stl_str.strip().split()
    if stl_items[0] != "solid" or "endsolid" not in stl_items[-2:]:
        raise InvalidSTLError("Malformed solid header/ footer")
    start = 1 if stl_items[1] == "facet" else 2
    stop = -1 if stl_items[-2] == "endfacet" else -2
    vertices:List = []
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
            raise InvalidSTLError(f"Expected triangle, got {this_triangle} points")
        triangles.append(this_triangle)

    return vertices, triangles


volume_type = {
    "box": BoxVolume,
    "trimesh": TriangleMeshVolume
}

def validate_vtype(vtype) -> str:
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
def volume_collection(request:HttpRequest, project_id) -> JsonResponse:
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

    volume_ids = get_request_list(data, 'volume_ids', [], map_fn=int)

    return JsonResponse(_volume_collection(project_id, volume_ids))


def _volume_collection(project_id, volume_ids, with_meshes=False):
    p = get_object_or_404(Project, pk=project_id)
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

    extra_fields = ''
    if with_meshes:
        extra_fields = ', Box3D(geometry) as bbox, ST_Asx3D(geometry) as mesh'

    cursor = connection.cursor()
    cursor.execute("""
        SELECT v.id, v.name, v.comment, v.user_id, v.editor_id, v.project_id,
            v.creation_time, v.edition_time,
            JSON_AGG(ann.name) FILTER (WHERE ann.name IS NOT NULL) AS annotations,
            area, volume, watertight, meta_computed
            {extra_fields}
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
    """.format(extra_fields=extra_fields, extra_joins='\n'.join(extra_joins)), params)

    return {
        'columns': [r[0] for r in cursor.description],
        'data': cursor.fetchall()
    }

def get_volume_details(project_id, volume_id) -> Dict[str, Any]:
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, project_id, name, comment, user_id, editor_id,
            creation_time, edition_time, Box3D(geometry), ST_Asx3D(geometry)
        FROM catmaid_volume v
        WHERE id=%s and project_id=%s""",
        (volume_id, project_id))
    volume = cursor.fetchone()

    if not volume:
        raise Http404(f"Could not find volume {volume_id}")

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
    def get(self, request:Request, project_id, volume_id) -> Response:
        """Get detailed information on a spatial volume or set its properties.

        The result will contain the bounding box of the volume's geometry and the
        actual geometry encoded in X3D format. The response might might therefore be
        relatively large.
        """
        p = get_object_or_404(Project, pk=project_id)
        volume = get_volume_details(p.id, volume_id)
        return Response(volume)

    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request:Request, project_id, volume_id) -> Response:
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
    def delete(self, request:Request, project_id, volume_id) -> Response:
        """Delete a particular spatial volume.
        """
        return remove_volume(request, project_id=project_id, volume_id=volume_id)


@requires_user_role([UserRole.Annotate])
def remove_volume(request:Request, project_id, volume_id) -> Response:
    """Remove a particular volume, if the user has permission to it.
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT user_id FROM catmaid_volume WHERE id=%s
    """, (volume_id,))
    rows = cursor.fetchall()
    if 0 == len(rows):
        raise ValueError(f"Could not find volume with ID {volume_id}")
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
def update_volume(request:Request, project_id, volume_id) -> Response:
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
def add_volume(request:Request, project_id) -> Response:
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
def import_volumes(request, project_id) -> Union[HttpResponse, JsonResponse]:
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
      - name: source_id
        description: >
            If specified, this source ID will be saved and mapped to the new
            volume ID.
        paramType: form
        type: integer
      - name: source_project_id
        description: >
            If specified, this source project ID will be saved and mapped to the
            new volume ID. This is only valid together with source_id and
            source_url.
        paramType: form
        type: integer
      - name: source_url
        description: >
            If specified, this source URL will be saved and mapped to the new
            volume ID.
        paramType: form
        type: string
      - name: source_type
        description: >
            Can be either 'mesh' or 'segmentation', to further specify of
            what type the origin data is.
        paramType: form
        type: string
    type:
      '{base_filename}':
        description: ID of the volume created from this file
        type: integer
        required: true
    """
    fnames_to_id = dict()
    if request.FILES:
        for uploadedfile in request.FILES.values():
            if uploadedfile.size > settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE:  # todo: use different setting
                return JsonResponse(
                    {"error": f'File too large. Maximum file size is {settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE} bytes.'},
                    status=413)

            filename = uploadedfile.name
            name, extension = os.path.splitext(filename)
            if extension.lower() == ".stl":
                stl = io.BytesIO(uploadedfile.read())
                try:
                    tmesh = trimesh.exchange.stl.load_stl(stl)
                except Exception as e:
                    raise ValueError(f"Invalid STL file ({e})")

                vertices = tmesh["vertices"].tolist()
                faces = tmesh["faces"].tolist()
                mesh = TriangleMeshVolume(
                    project_id, request.user.id,
                    {"type": "trimesh", "title": name, "mesh": [vertices, faces]}
                )
                fnames_to_id[filename] = mesh_id = mesh.save()
            else:
                return JsonResponse(
                    {"error": f'File type "{extension}" not understood. Known file types: stl'},
                    status=415)
    elif 'format' in request.POST:
        fmt = request.POST.get('format')
        if fmt == 'stl':
            try:
                vertices, triangles = _stl_ascii_to_indexed_triangles(request.POST.get('mesh'))
            except InvalidSTLError as e:
                raise ValueError(f"Invalid STL file ({e})")

            name = request.POST.get('name', 'Unnamed volume')
            mesh = TriangleMeshVolume(
                project_id, request.user.id,
                {"type": "trimesh", "title": name, "mesh": [vertices, triangles]}
            )
            fnames_to_id[name] = mesh_id = mesh.save()
        else:
            raise ValueError('No known volume format found')
    else:
        raise ValueError('Need either file or mesh string')

    source_id = request.POST.get('source_id', None)
    source_url = request.POST.get('source_url', None)
    source_project_id = request.POST.get('source_project_id', None)
    source_type = request.POST.get('source_type', 'mesh')

    # Try to track origin of this import.
    if source_id and source_project_id:
        data_source = get_data_source(project_id, source_url, source_project_id,
                request.user.id)
        mesh_entity_id = _get_volume_entities(project_id, [mesh_id])[mesh_id]
        skeleton_origin = VolumeOrigin.objects.create(project_id=project_id,
                user_id=request.user.id, data_source=data_source,
                volume_id=mesh_entity_id, source_id=source_id, source_type=source_type)

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
def export_volume(request, project_id, volume_id, extension) -> HttpResponse:
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
def intersects(request, project_id, volume_id) -> JsonResponse:
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
def get_volume_entities(request, project_id) -> JsonResponse:
    """Retrieve a mapping of volume IDs to entity (class instance) IDs.
    ---
    parameters:
      - name: volume_ids
        description: A list of volume IDs to map
        paramType: query
    """
    volume_ids = get_request_list(request.POST, 'volume_ids', map_fn=int)

    return JsonResponse(_get_volume_entities(project_id, volume_ids))


def _get_volume_entities(project_id, volume_ids) -> JsonResponse:
    """Retrieve a mapping of volume IDs to entity (class instance) IDs.
    """
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

    return dict(cursor.fetchall())


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
        transitive_annotation=True, simple=False) -> List[Dict[str, Any]]:
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
            query_params[f'annotated_with[{n}]'] = a
            if transitive_annotation:
                query_params[f'sub_annotated_with[{n}]'] = a
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
def get_skeleton_innervations(request, project_id) -> JsonResponse:
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
        min_nodes=None, min_cable=None) -> List[Dict[str, Any]]:
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


@api_view(['GET'])
@requires_user_role([UserRole.Annotate])
def update_meta_information(request, project_id, volume_id) -> JsonResponse:
    """Update the meta data on all passed in volumes. This includes: area,
    volume and watertightness.
    ---
    parameters:
        - name: project_id
          required: true
          description: The project to operate in
          type: integer
          paramType: path
        - name: volume_id
          required: true
          description: The volume to update
          type: integer
          paramType: path
    """
    project_id = int(project_id)
    volume_id = int(volume_id)

    update_results = update_volume_meta_information(project_id, [volume_id])
    return JsonResponse(update_results.get(volume_id))


def update_volume_meta_information(project_id, volume_ids=None):
    """Update the meta data on all passed in volumes. This includes: area,
    volume and watertightness.
    """

    if not volume_ids:
        volume_ids = list(Volume.objects.filter(project_id=project_id) \
                .values_list('id', flat=True))

    volumes = get_volume_data(project_id, volume_ids)

    new_data = {}
    for volume_id, v in volumes.items():
        try:
            # Build tri-mesh and get properties
            mesh = trimesh.Trimesh(vertices=v['vertices'], faces=v['faces'])
            new_data[volume_id] = {
                'area': mesh.area,
                'volume': mesh.volume,
                'watertight': mesh.is_watertight,
            }
        except:
            new_data[volume_id] = {
                'area': None,
                'volume': None,
                'watertight': None,
            }

    if new_data:
        volume_template = "(" + "),(".join(["%s, %s, %s, %s"] * len(new_data)) + ")"
        volume_table = list(chain.from_iterable(
                [[k, v['area'], v['volume'], v['watertight']] for k,v in new_data.items()]))

        # Update data in database
        cursor = connection.cursor()
        cursor.execute("""
            UPDATE catmaid_volume v
            SET area = target.area, volume = target.volume,
                watertight = target.watertight,
                meta_computed = TRUE
            FROM (VALUES
                {volume_template}
            ) target(id, area, volume, watertight)
            WHERE v.id = target.id
        """.format(**{
            'volume_template': volume_template
        }), volume_table)

    return new_data

def get_volume_data(project_id, volume_ids):
    """Compute the volume and area for a set of volumes and update them in the
    database.
    """
    volume_data = _volume_collection(project_id, volume_ids, with_meshes=True)
    columns = volume_data['columns']
    data = volume_data['data']

    id_idx = columns.index('id')
    mesh_idx = columns.index('mesh')
    name_idx = columns.index('name')

    # Generate volume(s) from responses
    volumes = {}
    for r in data:
        mesh_str = r[mesh_idx]
        mesh_name = r[name_idx]
        mesh_id = r[id_idx]

        mesh_match = re.search('<(.*?) ', mesh_str)
        if mesh_match is None:
            raise Exception('Malformed input: mesh type not found')
        mesh_type = mesh_match.group(1)

        # Now reverse engineer the mesh
        if mesh_type == 'IndexedTriangleSet':
            index_match = re.search("index='(.*?)'", mesh_str)
            if index_match is None:
                raise Exception('Malformed input: indices not found')
            t = index_match.group(1).split(' ')
            faces: List[Sequence[int]] = [(int(t[i]), int(t[i + 1]), int(t[i + 2]))
                     for i in range(0, len(t) - 2, 3)]

            point_match = re.search("point='(.*?)'", mesh_str)
            if point_match is None:
                raise Exception('Malformed input: points not found')
            v = point_match.group(1).split(' ')
            vertices = [(float(v[i]), float(v[i + 1]), float(v[i + 2]))
                        for i in range(0, len(v) - 2, 3)]

        elif mesh_type == 'IndexedFaceSet':
            # For this type, each face is indexed and an index of -1 indicates
            # the end of this face set
            index_match = re.search("coordIndex='(.*?)'", mesh_str)
            if index_match is None:
                raise Exception('Malformed input: coordinate indices not found')
            t = index_match.group(1).split(' ')
            faces = []
            this_face = []
            for f in t:
                if int(f) != -1:
                    this_face.append(int(f))
                else:
                    faces.append(this_face)
                    this_face = []

            # Make sure the last face is also appended
            faces.append(this_face)

            point_match = re.search("point='(.*?)'", mesh_str)
            if point_match is None:
                raise Exception('Malformed input: points not found')
            v = point_match.group(1).split(' ')
            vertices = [(float(v[i]), float(v[i + 1]), float(v[i + 2]))
                        for i in range(0, len(v) - 2, 3)]

        else:
            logger.error("Unknown volume type: %s" % mesh_type)
            raise Exception("Unknown volume type: %s" % mesh_type)

        # For some reason, in this format vertices occur multiple times - we
        # have to collapse that to get a clean mesh
        dedup_vertices, idx_map = np.unique(np.asarray(vertices), return_inverse=True, axis=0)
        final_vertices: List[Sequence[int]] = list(dedup_vertices)
        vert_idx_map = list(idx_map)
        final_faces = [[vert_idx_map[v] for v in t] for t in faces]

        volumes[mesh_id] = {
            'name': mesh_name,
            'vertices': final_vertices,
            'faces': final_faces,
        }

    return volumes


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def from_origin(request:HttpRequest, project_id=None) -> JsonResponse:
    """Find mappings to existing volumes for potential imports.
    ---
    parameters:
      - name: project_id
        description: Project to operate in
        type: integer
        paramType: path
        required: true
      - name: source_ids[]
        description: IDs of the source IDs to query origin for
        required: true
        type: array
        items:
          type: integer
        paramType: form
      - name: source_url
        description: Source URL of volumes. If not provided, this server is assumed to be the source.
        type: string
        paramType: path
        required: false
      - name: source_project_id
        description: Source project ID of volumes
        type: integer
        paramType: path
        required: true
    """

    if request.method == 'GET':
        data = request.GET
    elif request.method == 'POST':
        data = request.POST
    else:
        raise ValueError("Invalid HTTP method: " + request.method)

    source_ids = get_request_list(data, 'source_ids', map_fn=int)
    if not source_ids:
        raise ValueError('Need at least one source ID')

    # If none, we assume that the source is this server
    source_url = normalize_source_url(data.get('source_url'))

    source_project_id = data.get('source_project_id')
    if source_project_id is None:
        raise ValueError("Need source_project_id for origin lookup")

    cursor = connection.cursor()
    cursor.execute("""
        SELECT so.source_id, so.volume_id
        FROM volume_origin so
        JOIN UNNEST(%(source_ids)s::bigint[]) query(source_id)
            ON query.source_id = so.source_id
        JOIN data_source ds
            ON ds.id = so.data_source_id
        WHERE so.project_id = %(project_id)s
            AND ds.project_id = %(project_id)s
            AND ds.url = %(source_url)s
            AND ds.source_project_id = %(source_project_id)s
    """, {
        'source_ids': source_ids,
        'project_id': project_id,
        'source_url': source_url,
        'source_project_id': source_project_id,
    })

    return JsonResponse(dict(cursor.fetchall()))


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def from_entities(request:HttpRequest, project_id=None) -> JsonResponse:
    """Find mappings to existing volumes for the passed in entity (class
    instance) IDs..
    ---
    parameters:
      - name: project_id
        description: Project to operate in
        type: integer
        paramType: path
        required: true
      - name: entity_ids[]
        description: IDs of the entity IDs to get volumes for
        required: true
        type: array
        items:
          type: integer
        paramType: form
    """

    if request.method == 'GET':
        data = request.GET
    elif request.method == 'POST':
        data = request.POST
    else:
        raise ValueError("Invalid HTTP method: " + request.method)

    entity_ids = get_request_list(data, 'entity_ids', map_fn=int)
    if not entity_ids:
        raise ValueError('Need at least one volume entity ID')

    cursor = connection.cursor()
    cursor.execute("""
        SELECT vci.class_instance_id, vci.volume_id
        FROM volume_class_instance vci
        JOIN UNNEST(%(entity_ids)s::int[]) entity(id)
            ON entity.id = vci.class_instance_id
        WHERE project_id = %(project_id)s
        AND relation_id = (
            SELECT id FROM relation
            WHERE relation_name = 'model_of'
            AND project_id = %(project_id)s
        )
    """, {
        'entity_ids': entity_ids,
        'project_id': project_id
    })

    return JsonResponse(dict(cursor.fetchall()))
