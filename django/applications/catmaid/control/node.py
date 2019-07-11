# -*- coding: utf-8 -*-

from abc import ABCMeta
from aggdraw import Draw, Pen, Brush, Font
from collections import defaultdict
import copy
import json
import math
import msgpack
from PIL import Image, ImageDraw
import psycopg2.extras
import progressbar
import struct
from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union
import ujson

from django.core.serializers.json import DjangoJSONEncoder
from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view

from catmaid import state
from catmaid.models import (ClassInstance, UserRole, Treenode,
        ClassInstanceClassInstance, Review, Project)
from catmaid.control.authentication import requires_user_role, \
        can_edit_all_or_fail
from catmaid.control.common import (get_relation_to_id_map, get_request_bool,
        get_request_list)



ORIENTATIONS = {
    'xy': 0,
    'xz': 1,
    'zy': 2
}

class BasicNodeProvider(object):

    def __init__(self, *args, **kwargs):
        self.enabled = kwargs.get('enabled', True)
        self.project_id = kwargs.get('project_id')
        self.orientation = kwargs.get('orientation')
        self.min_width = kwargs.get('min_width')
        self.min_height = kwargs.get('min_height')
        self.min_depth = kwargs.get('min_depth')
        self.max_width = kwargs.get('max_width')
        self.max_height = kwargs.get('max_height')
        self.max_depth = kwargs.get('max_depth')

    def prepare_db_statements(self, connection:Any):
        pass

    def matches(self, params) -> bool:
        matches = True
        if not self.enabled:
            return False
        if self.project_id:
            matches = matches and params.get('project_id') == self.project_id
        # Orientation means this node provider will only be used if the query
        # bounding box is
        if self.orientation:
            matches = matches and params.get('orientation') == self.orientation
        if self.min_width:
            matches = matches and self.min_width <= params['width']
        if self.min_height:
            matches = matches and self.min_height <= params['height']
        if self.min_depth:
            matches = matches and self.min_depth <= params['depth']
        if self.max_width:
            matches = matches and self.max_width >= params['width']
        if self.max_height:
            matches = matches and self.max_height >= params['height']
        if self.max_depth:
            matches = matches and self.max_depth >= params['depth']

        return matches

    def get_tuples(self, params, project_id, explicit_treenode_ids,
                explicit_connector_ids, include_labels, with_relation_map) -> Tuple[Any, Optional[str]]:
        return _node_list_tuples_query(params, project_id,
                self, explicit_treenode_ids, explicit_connector_ids,
                include_labels, with_relation_map), 'json'


def get_extra_nodes(params, project_id, explicit_treenode_ids,
        explicit_connector_ids, include_labels, with_relation_map):
    explicit_node_params = copy.deepcopy(params)
    # Update params so that we don't query any nodes spatially
    explicit_node_params['left'] = float('inf')
    explicit_node_params['right'] = float('inf')
    explicit_node_params['top'] = float('inf')
    explicit_node_params['bottom'] = float('inf')
    explicit_node_params['z1'] = float('inf')
    explicit_node_params['z2'] = float('inf')
    explicit_node_params['halfz'] = float('inf')

    node_provider = Postgis2dNodeProvider()
    return node_provider.get_tuples(explicit_node_params, project_id,
        explicit_treenode_ids, explicit_connector_ids, include_labels,
        with_relation_map)

class CachedNodeProvider(BasicNodeProvider):
    """A node provider that is based on cached data.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache_id = kwargs.get('cache_id')

class CachedJsonNodeNodeProvder(CachedNodeProvider):
    """Retrieve cached JSON data from the node_query_cache table.
    """

    def get_tuples(self, params, project_id, explicit_treenode_ids,
            explicit_connector_ids, include_labels, with_relation_map) -> Tuple[Any, Optional[str]]:
        cursor = connection.cursor()
        # For JSONB type cache, use ujson to decode, this is roughly 2x faster
        psycopg2.extras.register_default_jsonb(loads=ujson.loads)
        cursor.execute("""
            SELECT json_data FROM node_query_cache
            WHERE project_id = %s AND depth = %s
            LIMIT 1
        """, (project_id, params['z1']))
        rows = cursor.fetchone()

        if rows and rows[0]:
            tuples = rows[0]
            # If there are exta nodes required, query them explicitely using a
            # regular Postgis 2D query. Inject the result into cached data.
            if explicit_treenode_ids or explicit_connector_ids:
                extra_tuples, extra_type = get_extra_nodes(params, project_id,
                    explicit_treenode_ids, explicit_connector_ids, include_labels,
                    with_relation_map)
                if extra_type != 'json':
                    raise ValueError("Unexpected type")

                if len(tuples) == 5:
                    tuples.append([extra_tuples])
                elif len(tuples) == 6:
                    tuples[5].append(extra_tuples)
                else:
                    raise ValueError("Unexpected cached JSON tuple format")

            return tuples, 'json'
        else:
            return None, None


class CachedJsonTextNodeProvder(CachedNodeProvider):
    """Retrieve cached JSON text data from the node_query_cache table.
    """

    def get_tuples(self, params, project_id, explicit_treenode_ids,
                explicit_connector_ids, include_labels, with_relation_map) -> Tuple[Any, Optional[str]]:
        cursor = connection.cursor()
        cursor.execute("""
            SELECT json_text_data FROM node_query_cache
            WHERE project_id = %s AND depth = %s
            LIMIT 1
        """, (project_id, params['z1']))
        rows = cursor.fetchone()

        if rows and rows[0]:
            tuples = rows[0]
            # If there are exta nodes required, query them explicitely using a
            # regular Postgis 2D query. Inject the result into cached data.
            if explicit_treenode_ids or explicit_connector_ids:
                extra_tuples, extra_type = get_extra_nodes(params, project_id,
                    explicit_treenode_ids, explicit_connector_ids, include_labels,
                    with_relation_map)
                if extra_type != 'json':
                    raise ValueError("Unexpected type")

                extra_tuples_json = json.dumps(extra_tuples)
                if tuples[-2] == '}':
                    # If cached response doesn't contain any extra nodes, add a
                    # new field
                    tuples = tuples[0:-1] + ', [' + extra_tuples_json + ']]'
                elif tuples[-2] == ']':
                    tuples = tuples[0:-2] + ', ' + extra_tuples_json + ']]'
                else:
                    raise ValueError("Unexpected cached JSON text tuple format")

            return tuples, 'json_text'
        else:
            return None, None


class CachedMsgpackNodeProvder(CachedNodeProvider):
    """Retrieve cached msgpack data from the node_query_cache table.
    """

    def get_tuples(self, params, project_id, explicit_treenode_ids,
                explicit_connector_ids, include_labels, with_relation_map) -> Tuple[Any, Optional[str]]:
        cursor = connection.cursor()
        cursor.execute("""
            SELECT msgpack_data FROM node_query_cache
            WHERE project_id = %s AND depth = %s
            LIMIT 1
        """, (project_id, params['z1']))
        rows = cursor.fetchone()

        if rows and rows[0]:
            tuples = rows[0]
            # If there are exta nodes required, query them explicitely using a
            # regular Postgis 2D query. Inject the result into cached data.
            if explicit_treenode_ids or explicit_connector_ids:
                extra_tuples, extra_type = get_extra_nodes(params, project_id,
                    explicit_treenode_ids, explicit_connector_ids, include_labels,
                    with_relation_map)
                if extra_type != 'json':
                    raise ValueError("Unexpected type")

                # To inject msgpack data, we expect a five element list, which
                # means the first byte is '\x95'. For now an error is raised if,
                # the first byte is something else.
                if tuples[0] != b'\x95':
                    raise ValueError("Unexpected cached Msgpack tuple format")

                extra_msgpack = msgpack.packb([extra_tuples])

                # Extend the five-element list with extra tuples by making it a
                # six element list and just appending the extra list
                tuples = b'\x96' + tuples[1:] + extra_msgpack

            return bytes(tuples), 'msgpack'
        else:
            return None, None


def get_pack_array_header(n) -> bytes:
    """Return binary header for msgpack conform array header. This is is size
    dependent. See:
    https://github.com/msgpack/msgpack-python/blob/8b6ce53cce40e528af7cce89f358f7dde1a09289/msgpack/fallback.py#L907
    """
    if n <= 0x0f:
        return struct.pack('B', 0x90 + n)
    if n <= 0xffff:
        return struct.pack(">BH", 0xdc, n)
    if n <= 0xffffffff:
        return struct.pack(">BI", 0xdd, n)
    raise ValueError("Array is too large")


class GridCachedNodeProvider(CachedNodeProvider):
    """Find nodes in node grid caches.
    """

    data_type = 'json'

    def update_tuples(self, target, decoded_extra_tuples, encoded_extra_tuples=None) -> bytes:
        if self.data_type == 'json':
            if len(target) == 5:
                target.append([])
            extra_tuples = target[5]
            extra_tuples.extend(encoded_extra_tuples)
            extra_tuples.extend(decoded_extra_tuples)
            return target
        elif self.data_type == 'json_text':
            target_json = json.dumps(decoded_extra_tuples)
            if encoded_extra_tuples:
                for eet in encoded_extra_tuples:
                    if eet:
                        if eet[-1] == ']':
                            target_json = '[' + eet + ', ' + target_json[1:]
                        else:
                            raise ValueError("Unexpected encoded JSON text tuple format")
            if target[-2] == '}':
                # If cached response doesn't contain any extra nodes, add a
                # new field
                return target[0:-1] + ', ' + target_json + ']'
            elif target[-2] == ']':
                return target[0:-2] + ', ' + target_json[1:] + ']'
            else:
                raise ValueError("Unexpected cached JSON text tuple format")
        elif self.data_type == 'msgpack':
            total_extra_tuples = len(decoded_extra_tuples)
            if encoded_extra_tuples:
                total_extra_tuples += len(encoded_extra_tuples)
            # To inject msgpack data, we first check the binary data
            # representing the list length. In the eaiest case, we have five
            # elements (\x95) and we can just append the data and change the
            # list length.
            if target[0] == b'\x95':
                # Construct a new msgpack array manually to not create
                # unnecessary copies.
                extra_msgpack = b''
                if encoded_extra_tuples:
                    extra_msgpack = b''.join(t for t in encoded_extra_tuples if t)
                    total_extra_tuples -= sum(1 for t in encoded_extra_tuples if not t)
                else:
                    extra_msgpack = b''

                for det in decoded_extra_tuples:
                    extra_msgpack += msgpack.packb(det)
                bin_len = get_pack_array_header(total_extra_tuples)

                # Extend the five-element list with extra tuples by making it a
                # six element list and just appending the extra list
                return bytes(b'\x96' + target[1:] + bin_len + extra_msgpack)
            else:
                raise ValueError("Unexpected cached Msgpack tuple format")
        else:
            raise ValueError("Unexpected cached JSON tuple format")

    def get_tuples(self, params, project_id, explicit_treenode_ids,
            explicit_connector_ids, include_labels, with_relation_map) -> Tuple[Any, Optional[str]]:
        # Find a fitting grid index, return empty result if there is none.
        cursor = connection.cursor()
        params['volume'] = (params['right'] - params['left']) * \
                (params['bottom'] - params['top']) * (params['z2'] - params['z1'])

        # For JSONB type cache, use ujson to decode, this is roughly 2x faster
        psycopg2.extras.register_default_jsonb(loads=ujson.loads)
        # Find grid that has a cell configuration closest to what we are looking for.
        cursor.execute("""
            SELECT id, cell_width, cell_height, cell_depth, n_lod_levels
            FROM node_grid_cache g
            WHERE project_id = %(project_id)s
            ORDER BY @((g.cell_width::double precision * g.cell_height::double precision * g.cell_depth::double precision) - %(volume)s::double precision) ASC
            LIMIT 1;
        """, params)

        grid_data = cursor.fetchone()
        if not grid_data:
            return None, None

        grid_id, cell_width, cell_height, cell_depth, lod_levels = grid_data[0], \
                grid_data[1], grid_data[2], grid_data[3], grid_data[4]

        min_w_i = int(params['left'] // cell_width)
        min_h_i = int(params['top'] // cell_height)
        min_d_i = int(params['z1'] // cell_depth)

        max_w_i = int(params['right'] // cell_width)
        max_h_i = int(params['bottom'] // cell_height)
        max_d_i = int(params['z2'] // cell_depth)

        # Get the LOD this query wants to work with. It defines the index in the
        # data array up to which entries will be read for the data returned to
        # the caller. For instance, an LOD of 1 means, only the first entry
        # (index 0) will be read. An LOD of 4 means, the first four entries will
        # be read. What this means exactly in terms of nodes is defined by the
        # grid cache itself in terms of its bucket size and bucket count (levels).
        lod_type = params.get('lod_type', 'percent')
        lod = params.get('lod', 'max')

        lod_min = 1
        if lod_type == 'percent':
            if lod == 'max':
                lod = 1.0
            else:
                lod = max(0.0, min(1.0, float(lod)))
            lod_max = max(1.0, int(lod * lod_levels))
        elif lod_type == 'absolute':
            if lod == 'max' or lod in (0, '0'):
                lod_max = lod_levels
            else:
                lod_max = min(int(lod), lod_levels)
        else:
            raise ValueError("Unknown LOD type: {}".format(lod_type))

        # Do the actual grid cell lookup in a separate query, to only use
        # constant values in the index checks. The Z index condition is slightly
        # special, because the parameter is exclusive
        cursor.execute("""
            SELECT {data_type_column}[%(lod_min)s:%(lod_max)s]
            FROM node_grid_cache_cell c
            LEFT JOIN dirty_node_grid_cache_cell dc
                -- Alternative: use ON dc.id = c.id and have update function
                -- create ID entries in the dirty table.
                ON dc.grid_id = c.grid_id
                AND dc.x_index = c.x_index
                AND dc.y_index = c.y_index
                AND dc.z_index = c.z_index
            WHERE c.grid_id = %(grid_id)s
                AND c.x_index >= %(min_x_index)s AND c.x_index <= %(max_x_index)s
                AND c.y_index >= %(min_y_index)s AND c.y_index <= %(max_y_index)s
                AND c.z_index >= %(min_z_index)s AND c.z_index < %(max_z_index)s
                AND {data_type_column} IS NOT NULL
        """.format(**{
            'data_type_column': self.data_type + '_data',
        }), {
            'grid_id': grid_id,
            'min_x_index': min_w_i,
            'min_y_index': min_h_i,
            'min_z_index': min_d_i,
            'max_x_index': max_w_i,
            'max_y_index': max_h_i,
            'max_z_index': max_d_i,
            'lod_min': lod_min,
            'lod_max': lod_max,
        })
        rows = cursor.fetchall()


        if rows and rows[0]:
            # It is the first LOD of the LOD set of the first result cell.
            first_cell_lods = rows[0][0]
            tuples = first_cell_lods[0]

            # All extra LODs that are included are transmitted as extra tuples.
            extra_lod_cells = first_cell_lods[1:]
            encoded_extra_tuples = [r for r in extra_lod_cells if r]

            # Add all result LODs of each returned grid cell to extra tuples
            for extra_row in rows[1:]:
                encoded_extra_tuples.extend(r for r in extra_row[0])

            # If there are exta nodes required, query them explicitely using a
            # regular Postgis 2D query. Inject the result into cached data.
            decoded_extra_tuples = None
            if explicit_treenode_ids or explicit_connector_ids:
                decoded_extra_tuples, extra_type = get_extra_nodes(params, project_id,
                    explicit_treenode_ids, explicit_connector_ids, include_labels,
                    with_relation_map)
                if extra_type != 'json':
                    raise ValueError("Unexpected type")

            tuples = self.update_tuples(tuples,
                    [decoded_extra_tuples] if decoded_extra_tuples else [],
                    encoded_extra_tuples)

            return tuples, self.data_type
        else:
            return None, None


class GridCachedJsonNodeProvider(GridCachedNodeProvider):
    data_type = 'json'


class GridCachedJsonTextNodeProvider(GridCachedNodeProvider):
    data_type = 'json_text'


class GridCachedMsgpackNodeProvider(GridCachedNodeProvider):
    data_type = 'msgpack'

    def get_tuples(self, *args, **kwargs) -> Tuple[Any, Optional[str]]:
        tuples, dt = super().get_tuples(*args, **kwargs)
        if tuples:
            return bytes(tuples), dt
        else:
            return tuples, dt

class PostgisNodeProvider(BasicNodeProvider, metaclass=ABCMeta):

    CONNECTOR_STATEMENT_NAME = 'get_connectors_postgis'
    connector_query = None # type: Optional[str]

    TREENODE_STATEMENT_NAME = 'get_treenodes_postgis'
    treenode_query = None # type: Optional[str]

    # Allows implementation to handle limit settings on its own
    managed_limit = True

    def __init__(self, connection=None, **kwargs):
        """
        If PREPARED_STATEMENTS is false but you want to override that for a few queries at a time,
        include a django.db.connection in the constructor.
        """
        super(PostgisNodeProvider, self).__init__(**kwargs)

        # If a node limit is set, append the LIMIT clause to both queries
        if self.managed_limit and settings.NODE_LIST_MAXIMUM_COUNT:
            treenode_query_template = self.treenode_query + '\nLIMIT {limit}'
            connector_query_template = self.connector_query + '\nLIMIT {limit}'
        else:
            treenode_query_template = self.treenode_query
            connector_query_template = self.connector_query

        # To execute the queries directly through PsycoPg (i.e. not prepared) a
        # different parameter format is used: {left} -> %(left)s.
        treenode_query_params = ['project_id', 'left', 'top', 'z1', 'right',
                                 'bottom', 'z2', 'halfz', 'halfzdiff', 'limit', 'sanitized_treenode_ids']
        self.treenode_query_psycopg = treenode_query_template.format(
            **{k: '%({})s'.format(k) for k in treenode_query_params})

        connector_query_params = ['project_id', 'left', 'top', 'z1', 'right',
                                  'bottom', 'z2', 'halfz', 'halfzdiff', 'limit', 'sanitized_connector_ids']
        self.connector_query_psycopg = connector_query_template.format(
            **{k: '%({})s'.format(k) for k in connector_query_params})

        # Create prepared statement version
        prepare_var_names = {
            'project_id': '$1',
            'left': '$2',
            'top': '$3',
            'z1': '$4',
            'right': '$5',
            'bottom': '$6',
            'z2': '$7',
            'halfz': '$8',
            'halfzdiff': '$9',
            'limit': '$10',
            'sanitized_connector_ids': '$11',
            'sanitized_treenode_ids': '$11'
        }
        self.treenode_query_prepare = treenode_query_template.format(**prepare_var_names)
        self.connector_query_prepare = connector_query_template.format(**prepare_var_names)

        self.prepared_statements = bool(connection) or settings.PREPARED_STATEMENTS

        self.render_server_side = kwargs.get('server_side', False)

        # If PREPARED_STATEMENTS is true, the statements will have been prepared elsewhere
        if connection and not settings.PREPARED_STATEMENTS:
            self.prepare_db_statements(connection)

    def prepare_db_statements(self, connection) -> None:
        """Create prepared statements on a given connection. This is mainly useful
        for long lived connections.
        """
        cursor = connection.cursor()
        cursor.execute("""
            -- 1 project id, 2 left, 3 top, 4 z1, 5 right, 6 bottom, 7 z2,
            -- 8 halfz, 9 halfzdiff, 10 limit 11 sanitized_treenode_ids
            PREPARE {} (int, real, real, real,
                    real, real, real, real, real, int, bigint[]) AS
            {}
        """.format(self.TREENODE_STATEMENT_NAME, self.treenode_query_prepare))
        cursor.execute("""
            -- 1 project id, 2 left, 3 top, 4 z1, 5 right, 6 bottom, 7 z2,
            -- 8 halfz, 9 halfzdiff, 10 limit, 11 sanitized connector ids
            PREPARE {} (int, real, real, real,
                    real, real, real, real, real, int, bigint[]) AS
            {}
        """.format(self.CONNECTOR_STATEMENT_NAME, self.connector_query_prepare))

    def get_treenode_data(self, cursor, params, extra_treenode_ids=None):
        """ Selects all treenodes of which links to other treenodes intersect
        with the request bounding box. Will optionally fetch additional
        treenodes.
        """
        params['halfzdiff'] = abs(params['z2'] - params['z1']) * 0.5
        params['halfz'] = params['z1'] + (params['z2'] - params['z1']) * 0.5
        params['sanitized_treenode_ids'] = list(map(int, extra_treenode_ids or []))

        if self.prepared_statements:
            # Use a prepared statement to get the treenodes
            cursor.execute('''
                EXECUTE {}(%(project_id)s,
                    %(left)s, %(top)s, %(z1)s, %(right)s, %(bottom)s, %(z2)s,
                    %(halfz)s, %(halfzdiff)s, %(limit)s,
                    %(sanitized_treenode_ids)s)
            '''.format(self.TREENODE_STATEMENT_NAME), params)
        else:
            n_largest_skeletons_limit= params.get('n_largest_skeletons_limit') or 0
            n_last_edited_skeletons_limit = params.get('n_last_edited_skeletons_limit') or 0
            hidden_last_editor_id = params.get('hidden_last_editor_id')
            min_skeleton_length = params.get('min_skeleton_length')
            min_skeleton_nodes = params.get('min_skeleton_nodes')

            limit = n_largest_skeletons_limit + n_last_edited_skeletons_limit

            query = self.treenode_query_psycopg

            if limit:
                # If there is a new limit, strip the old one away
                query = query.rstrip('LIMIT %(limit)s')

            # The parenthesises around the individual filters are needed for the
            # union operator.
            summary = []
            if n_largest_skeletons_limit:
                summary.append("""
                    (SELECT * FROM query
                    JOIN (
                        SELECT skeleton_id
                        FROM catmaid_skeleton_summary css
                        WHERE project_id = %(project_id)s
                        ORDER BY css.cable_length DESC
                    ) sub
                    ON sub.skeleton_id = query.skeleton_id
                    LIMIT %(n_largest_skeletons_limit)s)
                """)
            if n_last_edited_skeletons_limit:
                summary.append("""
                    (SELECT * FROM query
                    JOIN (
                        SELECT skeleton_id
                        FROM catmaid_skeleton_summary css
                        WHERE project_id = %(project_id)s
                        ORDER BY css.last_edition_time DESC
                    ) sub
                    ON sub.skeleton_id = query.skeleton_id
                    LIMIT %(n_last_edited_skeletons_limit)s)
                """)


            extra_join = ''
            # User constraints are joined separately, so they are AND-combined
            if hidden_last_editor_id is not None:
                extra_join = """
                    JOIN (
                        SELECT skeleton_id
                        FROM catmaid_skeleton_summary css
                        WHERE project_id = %(project_id)s
                        AND last_editor_id <> %(hidden_last_editor_id)s
                    ) visible(skeleton_id)
                        ON visible.skeleton_id = basic_query.skeleton_id
                """

            if min_skeleton_length:
                extra_join = """
                    JOIN (
                        SELECT skeleton_id
                        FROM catmaid_skeleton_summary css
                        WHERE project_id = %(project_id)s
                        AND cable_length > %(min_skeleton_length)s
                    ) min_length(skeleton_id)
                        ON min_length.skeleton_id = basic_query.skeleton_id
                """

            if min_skeleton_nodes:
                extra_join = """
                    JOIN (
                        SELECT skeleton_id
                        FROM catmaid_skeleton_summary css
                        WHERE project_id = %(project_id)s
                        AND num_nodes > %(min_skeleton_nodes)s
                    ) min_nodes(skeleton_id)
                        ON min_nodes.skeleton_id = basic_query.skeleton_id
                """

            if summary:
                if extra_join:
                    query = '''
                        WITH basic_query AS (
                            {query}
                        ), query AS (
                            SELECT basic_query.*
                            FROM basic_query
                            {extra_join}
                        )
                        {summary}
                    '''.format(**{
                        'query': query,
                        'summary': ' UNION '.join(summary),
                        'extra_join': extra_join,
                    })
                else:
                    query = '''
                        WITH query AS (
                            {query}
                        )
                        {summary}
                    '''.format(**{
                        'query': query,
                        'summary': ' UNION '.join(summary),
                    })
            elif extra_join:
                query = """
                    SELECT basic_query.* FROM (
                        {query}
                    ) basic_query
                    {extra_join}
                """.format(**{
                    'query': query,
                    'extra_join': extra_join,
                })

            cursor.execute(query, params)

        treenodes = cursor.fetchall()
        treenode_ids = [t[0] for t in treenodes]

        return treenode_ids, treenodes

    def get_connector_data(self, cursor, params, missing_connector_ids=None) -> List:
        """Selects all connectors that are in or have links that intersect the
        bounding box, or that are in missing_connector_ids.
        """
        params['halfz'] = params['z1'] + (params['z2'] - params['z1']) * 0.5
        params['halfzdiff'] = abs(params['z2'] - params['z1']) * 0.5
        params['sanitized_connector_ids'] = list(map(int, missing_connector_ids or []))

        if self.prepared_statements:
            # Use a prepared statement to get connectors
            cursor.execute('''
                EXECUTE {}(%(project_id)s,
                    %(left)s, %(top)s, %(z1)s, %(right)s, %(bottom)s, %(z2)s,
                    %(halfz)s, %(halfzdiff)s, %(limit)s,
                    %(sanitized_connector_ids)s)
            '''.format(self.CONNECTOR_STATEMENT_NAME), params)
        else:
            cursor.execute(self.connector_query_psycopg, params)

        return list(cursor.fetchall())


class Postgis3dNodeProvider(PostgisNodeProvider):
    """
    Fetch treenodes with the help of two PostGIS filters: The &&& operator
    to exclude all edges that don't have a bounding box that intersect with
    the query bounding box. This leads to false positives, because edge
    bounding boxes can intersect without the edge actually intersecting. To
    limit the result set, ST_3DDWithin is used. It allows to limit the result
    set by a distance to another geometry. Here it only allows edges that are
    no farther away than half the height of the query bounding box from a
    plane that cuts the query bounding box in half in Z. There are still false
    positives, but much fewer. Even though ST_3DDWithin is used, it seems to
    be enough to have a n-d index available (the query plan says ST_3DDWithin
    wouldn't use a 2-d index in this query, even if present).
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_3d'
    treenode_query = '''
        WITH bb_edge AS (
            SELECT te.id
             FROM treenode_edge te
             WHERE te.edge &&& ST_MakeLine(ARRAY[
                 ST_MakePoint({left}, {bottom}, {z2}),
                 ST_MakePoint({right}, {top}, {z1})] ::geometry[])
             AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                 ST_MakePoint({left},  {top},    {halfz}),
                 ST_MakePoint({right}, {top},    {halfz}),
                 ST_MakePoint({right}, {bottom}, {halfz}),
                 ST_MakePoint({left},  {bottom}, {halfz}),
                 ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                 {halfzdiff})
             AND te.project_id = {project_id}
        )
        SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id
        FROM (
            SELECT id FROM bb_edge
            UNION
            SELECT t.parent_id
            FROM bb_edge e
            JOIN treenode t
               ON t.id = e.id
            UNION
            SELECT UNNEST({sanitized_treenode_ids}::bigint[])
        ) edges(edge_child_id)
        JOIN treenode t1
          ON edge_child_id = t1.id
    '''

    CONNECTOR_STATEMENT_NAME = PostgisNodeProvider.CONNECTOR_STATEMENT_NAME + '_3d'
    connector_query = '''
      SELECT
          c.id,
          c.location_x,
          c.location_y,
          c.location_z,
          c.confidence,
          EXTRACT(EPOCH FROM c.edition_time),
          c.user_id,
          tc.treenode_id,
          tc.relation_id,
          tc.confidence,
          EXTRACT(EPOCH FROM tc.edition_time),
          tc.id
      FROM (SELECT tce.id AS tce_id
            FROM treenode_connector_edge tce
            WHERE tce.edge &&& ST_MakeLine(ARRAY[
                ST_MakePoint({left}, {bottom}, {z2}),
                ST_MakePoint({right}, {top}, {z1})] ::geometry[])
            AND ST_3DDWithin(tce.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                ST_MakePoint({left},  {top},    {halfz}),
                ST_MakePoint({right}, {top},    {halfz}),
                ST_MakePoint({right}, {bottom}, {halfz}),
                ST_MakePoint({left},  {bottom}, {halfz}),
                ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                {halfzdiff})
            AND tce.project_id = {project_id}
        ) edges(edge_tc_id)
      JOIN treenode_connector tc
        ON (tc.id = edge_tc_id)
      JOIN connector c
        ON (c.id = tc.connector_id)

      UNION

      SELECT
          c.id,
          c.location_x,
          c.location_y,
          c.location_z,
          c.confidence,
          EXTRACT(EPOCH FROM c.edition_time),
          c.user_id,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
      FROM (SELECT cg.id AS cg_id
           FROM connector_geom cg
           WHERE cg.geom &&& ST_MakeLine(ARRAY[
               ST_MakePoint({left}, {bottom}, {z2}),
               ST_MakePoint({right}, {top}, {z1})] ::geometry[])
           AND ST_3DDWithin(cg.geom, ST_MakePolygon(ST_MakeLine(ARRAY[
               ST_MakePoint({left},  {top},    {halfz}),
               ST_MakePoint({right}, {top},    {halfz}),
               ST_MakePoint({right}, {bottom}, {halfz}),
               ST_MakePoint({left},  {bottom}, {halfz}),
               ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
               {halfzdiff})
           AND cg.project_id = {project_id}
          UNION SELECT UNNEST({sanitized_connector_ids}::bigint[])
        ) geoms(geom_connector_id)
      JOIN connector c
        ON (geom_connector_id = c.id)
    '''


class Postgis3dMultiJoinNodeProvider(Postgis3dNodeProvider):
    """Like Postgis3dNodeProvider, but doing different joins for the extra set
    of nodes and the main query.
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_3d'
    treenode_query = '''
          WITH extra_nodes AS (
              SELECT UNNEST({sanitized_treenode_ids}::bigint[]) AS id
          )
          SELECT
              t1.id,
              t1.parent_id,
              t1.location_x,
              t1.location_y,
              t1.location_z,
              t1.confidence,
              t1.radius,
              t1.skeleton_id,
              EXTRACT(EPOCH FROM t1.edition_time),
              t1.user_id
          FROM (
            SELECT DISTINCT ON (id) UNNEST(ARRAY[t2.id, t2.parent_id]) AS id
            FROM treenode_edge te
            JOIN treenode t2
                ON t2.id = te.id
            WHERE te.edge &&& ST_MakeLine(ARRAY[
                ST_MakePoint({left}, {bottom}, {z2}),
                ST_MakePoint({right}, {top}, {z1})] ::geometry[])
            AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                ST_MakePoint({left},  {top},    {halfz}),
                ST_MakePoint({right}, {top},    {halfz}),
                ST_MakePoint({right}, {bottom}, {halfz}),
                ST_MakePoint({left},  {bottom}, {halfz}),
                ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                {halfzdiff})
            AND te.project_id = {project_id}
          ) bb_treenode
          JOIN treenode t1
            ON t1.id = bb_treenode.id
          WHERE NOT EXISTS(SELECT 1 FROM extra_nodes en where en.id=t1.id)

          UNION ALL

          SELECT
              t1.id,
              t1.parent_id,
              t1.location_x,
              t1.location_y,
              t1.location_z,
              t1.confidence,
              t1.radius,
              t1.skeleton_id,
              EXTRACT(EPOCH FROM t1.edition_time),
              t1.user_id
          FROM extra_nodes en
          JOIN treenode t1
          ON en.id = t1.id
          WHERE t1.project_id = {project_id}
    '''


class Postgis3dBlurryNodeProvider(PostgisNodeProvider):
    """
    Fetch treenodes with the help of two PostGIS filters: The &&& operator to
    exclude all edges that don't have a bounding box that intersect with the
    query bounding box. This leads to false positives, because edge bounding
    boxes can intersect without the edge actually intersecting. To further
    limit the result set to avoid false positives use Postgis3dNodeProvider.
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_3d'
    treenode_query = '''
        WITH bb_edge AS (
            SELECT te.id
            FROM treenode_edge te
            WHERE te.edge &&& ST_MakeLine(ARRAY[
                ST_MakePoint({left}, {bottom}, {z2}),
                ST_MakePoint({right}, {top}, {z1})] ::geometry[])
            AND te.project_id = {project_id}
        )
        SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id
        FROM (
            SELECT id from bb_edge
            UNION
            SELECT t.parent_id
            FROM bb_edge e
            JOIN treenode t
              ON t.id = e.id
            UNION
            SELECT UNNEST({sanitized_treenode_ids}::bigint[])
        ) edges(edge_child_id)
        JOIN treenode t1
          ON edge_child_id = t1.id
    '''

    CONNECTOR_STATEMENT_NAME = PostgisNodeProvider.CONNECTOR_STATEMENT_NAME + '_3d'
    connector_query = '''
      SELECT
          c.id,
          c.location_x,
          c.location_y,
          c.location_z,
          c.confidence,
          EXTRACT(EPOCH FROM c.edition_time),
          c.user_id,
          tc.treenode_id,
          tc.relation_id,
          tc.confidence,
          EXTRACT(EPOCH FROM tc.edition_time),
          tc.id
      FROM (SELECT tce.id AS tce_id
            FROM treenode_connector_edge tce
            WHERE tce.edge &&& ST_MakeLine(ARRAY[
                ST_MakePoint({left}, {bottom}, {z2}),
                ST_MakePoint({right}, {top}, {z1})] ::geometry[])
            AND tce.project_id = {project_id}
        ) edges(edge_tc_id)
      JOIN treenode_connector tc
        ON (tc.id = edge_tc_id)
      JOIN connector c
        ON (c.id = tc.connector_id)

      UNION

      SELECT
          c.id,
          c.location_x,
          c.location_y,
          c.location_z,
          c.confidence,
          EXTRACT(EPOCH FROM c.edition_time),
          c.user_id,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
      FROM (SELECT cg.id AS cg_id
           FROM connector_geom cg
           WHERE cg.geom &&& ST_MakeLine(ARRAY[
               ST_MakePoint({left}, {bottom}, {z2}),
               ST_MakePoint({right}, {top}, {z1})] ::geometry[])
           AND cg.project_id = {project_id}
          UNION SELECT UNNEST({sanitized_connector_ids}::bigint[])
        ) geoms(geom_connector_id)
      JOIN connector c
        ON (geom_connector_id = c.id)
    '''


class Postgis3dSpGistNodeProvider(Postgis3dNodeProvider):
    """Like Postgis3dNodeProvider, but doing different joins for the extra set
    of nodes and the main query.
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_3d'
    treenode_query = '''
          WITH extra_nodes AS (
              SELECT UNNEST({sanitized_treenode_ids}::bigint[]) AS id
          )
          SELECT
              t1.id,
              t1.parent_id,
              t1.location_x,
              t1.location_y,
              t1.location_z,
              t1.confidence,
              t1.radius,
              t1.skeleton_id,
              EXTRACT(EPOCH FROM t1.edition_time),
              t1.user_id
          FROM (
            SELECT DISTINCT ON (id) UNNEST(ARRAY[t2.id, t2.parent_id]) AS id
            FROM treenode_edge te
            JOIN treenode t2
                ON t2.id = te.id
            -- The &/& is the SP-GiST supported 3D overlaps operator. We check
            -- for bounding box overlap of the FOV (the line's bounding box) and
            -- each edge.
            WHERE te.edge &/& ST_MakeLine(ARRAY[
                ST_MakePoint({left}, {bottom}, {z2}),
                ST_MakePoint({right}, {top}, {z1})] ::geometry[])
            AND te.project_id = {project_id}
          ) bb_treenode
          JOIN treenode t1
            ON t1.id = bb_treenode.id
          WHERE NOT EXISTS(SELECT 1 FROM extra_nodes en where en.id=t1.id)

          UNION ALL

          SELECT
              t1.id,
              t1.parent_id,
              t1.location_x,
              t1.location_y,
              t1.location_z,
              t1.confidence,
              t1.radius,
              t1.skeleton_id,
              EXTRACT(EPOCH FROM t1.edition_time),
              t1.user_id
          FROM extra_nodes en
          JOIN treenode t1
          ON en.id = t1.id
          WHERE t1.project_id = {project_id}
    '''


class Postgis2dNodeProvider(PostgisNodeProvider):
    """
    Fetch treenodes with the help of two PostGIS filters: First, select all
    edges with a bounding box overlapping the XY-box of the query bounding
    box. This set is then constrained by a particular range in Z. Both filters
    are backed by indices that make these operations very fast. This is
    semantically equivalent with what the &&& does. This, however, leads to
    false positives, because edge bounding boxes can intersect without the
    edge actually intersecting. To limit the result set, ST_3DDWithin is used.
    It allows to limit the result set by a distance to another geometry. Here
    it only allows edges that are no farther away than half the height of the
    query bounding box from a plane that cuts the query bounding box in half
    in Z. There are still false positives, but much fewer. Even though
    ST_3DDWithin is used, it seems to be enough to have a n-d index available
    (the query plan says ST_3DDWithin wouldn't use a 2-d index in this query,
    even if present).
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_2d'
    treenode_query = """
          WITH z_filtered_edge AS (
            SELECT te.id, te.edge
            FROM treenode_edge te
            WHERE floatrange(ST_ZMin(te.edge),
                 ST_ZMax(te.edge), '[]') && floatrange({z1}, {z2}, '[)')
              AND te.project_id = {project_id}
          ), bb_edge AS (
            SELECT e.id
            FROM z_filtered_edge e
            WHERE e.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
              AND ST_3DDWithin(e.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                  ST_MakePoint({left},  {top},    {halfz}),
                  ST_MakePoint({right}, {top},    {halfz}),
                  ST_MakePoint({right}, {bottom}, {halfz}),
                  ST_MakePoint({left},  {bottom}, {halfz}),
                  ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                  {halfzdiff})
          )
          SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id
          FROM (
              SELECT id FROM bb_edge
              UNION
              SELECT t.parent_id
              FROM bb_edge e
              JOIN treenode t
                 ON t.id = e.id
              UNION
              SELECT UNNEST({sanitized_treenode_ids}::bigint[])
          ) edges(edge_child_id)
        JOIN treenode t1
          ON edges.edge_child_id = t1.id
    """

    CONNECTOR_STATEMENT_NAME = PostgisNodeProvider.CONNECTOR_STATEMENT_NAME + '_2d'
    connector_query = """
        SELECT
            c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            EXTRACT(EPOCH FROM c.edition_time),
            c.user_id,
            tc.treenode_id,
            tc.relation_id,
            tc.confidence,
            EXTRACT(EPOCH FROM tc.edition_time),
            tc.id
        FROM (SELECT tce.id AS tce_id
             FROM treenode_connector_edge tce
             WHERE tce.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
               AND floatrange(ST_ZMin(tce.edge), ST_ZMax(tce.edge), '[]') &&
                 floatrange({z1}, {z2}, '[)')
               AND ST_3DDWithin(tce.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                   ST_MakePoint({left},  {top},    {halfz}),
                   ST_MakePoint({right}, {top},    {halfz}),
                   ST_MakePoint({right}, {bottom}, {halfz}),
                   ST_MakePoint({left},  {bottom}, {halfz}),
                   ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                   {halfzdiff})
               AND tce.project_id = {project_id}
          ) edges(edge_tc_id)
        JOIN treenode_connector tc
          ON (tc.id = edge_tc_id)
        JOIN connector c
          ON (c.id = tc.connector_id)

        UNION

        SELECT
            c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            EXTRACT(EPOCH FROM c.edition_time),
            c.user_id,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        FROM (SELECT cg.id AS cg_id
             FROM connector_geom cg
             WHERE cg.geom && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
               AND floatrange(ST_ZMin(cg.geom), ST_ZMax(cg.geom), '[]') &&
                 floatrange({z1}, {z2}, '[)')
               AND ST_3DDWithin(cg.geom, ST_MakePolygon(ST_MakeLine(ARRAY[
                   ST_MakePoint({left},  {top},    {halfz}),
                   ST_MakePoint({right}, {top},    {halfz}),
                   ST_MakePoint({right}, {bottom}, {halfz}),
                   ST_MakePoint({left},  {bottom}, {halfz}),
                   ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                   {halfzdiff})
               AND cg.project_id = {project_id}
            UNION SELECT UNNEST({sanitized_connector_ids}::bigint[])
          ) geoms(geom_connector_id)
        JOIN connector c
          ON (geom_connector_id = c.id)
    """


class Postgis2dMultiJoinNodeProvider(Postgis2dNodeProvider):
    """
    Like Postgis2dNodeProvider, but joining twice into treenode table.
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_2d'
    treenode_query = """
          WITH extra_nodes AS (
              SELECT UNNEST({sanitized_treenode_ids}::bigint[]) AS id
          )
          SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id
          FROM (
            SELECT DISTINCT ON (id) UNNEST(ARRAY[t2.id, t2.parent_id]) AS id
            FROM treenode_edge te
            JOIN treenode t2
                ON t2.id = te.id
            WHERE floatrange(ST_ZMin(te.edge),
                 ST_ZMax(te.edge), '[]') && floatrange({z1}, {z2}, '[)')
              AND te.project_id = {project_id}
              AND te.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
              AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                  ST_MakePoint({left},  {top},    {halfz}),
                  ST_MakePoint({right}, {top},    {halfz}),
                  ST_MakePoint({right}, {bottom}, {halfz}),
                  ST_MakePoint({left},  {bottom}, {halfz}),
                  ST_MakePoint({left},  {top},    {halfz})]::geometry[])),
                  {halfzdiff})
          ) bb_treenode
          JOIN treenode t1
            ON t1.id = bb_treenode.id
          WHERE NOT EXISTS(SELECT 1 FROM extra_nodes en where en.id=t1.id)

          UNION ALL

          SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id
          FROM extra_nodes en
          JOIN treenode t1
          ON en.id = t1.id
          WHERE t1.project_id = {project_id}
    """


class Postgis2dBlurryNodeProvider(PostgisNodeProvider):
    """
    Fetch treenodes with the help of two PostGIS filters: First, select all
    edges with a bounding box overlapping the XY-box of the query bounding
    box. This set is then constrained by a particular range in Z. Both filters
    are backed by indices that make these operations very fast. This is
    semantically equivalent with what the &&& does. This, however, leads to
    false positives, because edge bounding boxes can intersect without the
    edge actually intersecting. To limit the result set further and reduce the
    number of false positives use Postgis2dNodeProvider.
    """

    TREENODE_STATEMENT_NAME = PostgisNodeProvider.TREENODE_STATEMENT_NAME + '_2d_blurry'
    treenode_query = """
          WITH z_filtered_edge AS (
              SELECT te.id, te.edge
              FROM treenode_edge te
              WHERE floatrange(ST_ZMin(te.edge), ST_ZMax(te.edge), '[]') && floatrange({z1}, {z2}, '[)')
                AND te.project_id = {project_id}
          ), bb_edge AS (
              SELECT te.id
              FROM z_filtered_edge te
              WHERE te.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
          )
          SELECT
            t1.id,
            t1.parent_id,
            t1.location_x,
            t1.location_y,
            t1.location_z,
            t1.confidence,
            t1.radius,
            t1.skeleton_id,
            EXTRACT(EPOCH FROM t1.edition_time),
            t1.user_id
          FROM
            (SELECT id FROM bb_edge
              UNION
              SELECT t.parent_id
              FROM bb_edge e
              JOIN treenode t
                ON t.id = e.id
              UNION
              SELECT UNNEST({sanitized_treenode_ids}::bigint[])
        ) edges(edge_child_id)
        JOIN treenode t1
          ON edges.edge_child_id = t1.id
    """

    CONNECTOR_STATEMENT_NAME = PostgisNodeProvider.CONNECTOR_STATEMENT_NAME + '_2d_blurry'
    connector_query = """
        SELECT
            c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            EXTRACT(EPOCH FROM c.edition_time),
            c.user_id,
            tc.treenode_id,
            tc.relation_id,
            tc.confidence,
            EXTRACT(EPOCH FROM tc.edition_time),
            tc.id
        FROM (SELECT tce.id AS tce_id
             FROM treenode_connector_edge tce
             WHERE tce.edge && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
               AND floatrange(ST_ZMin(tce.edge), ST_ZMax(tce.edge), '[]') &&
                 floatrange({z1}, {z2}, '[)')
               AND tce.project_id = {project_id}
          ) edges(edge_tc_id)
        JOIN treenode_connector tc
          ON (tc.id = edge_tc_id)
        JOIN connector c
          ON (c.id = tc.connector_id)

        UNION

        SELECT
            c.id,
            c.location_x,
            c.location_y,
            c.location_z,
            c.confidence,
            EXTRACT(EPOCH FROM c.edition_time),
            c.user_id,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        FROM (SELECT cg.id AS cg_id
             FROM connector_geom cg
             WHERE cg.geom && ST_MakeEnvelope({left}, {top}, {right}, {bottom})
               AND floatrange(ST_ZMin(cg.geom), ST_ZMax(cg.geom), '[]') &&
                 floatrange({z1}, {z2}, '[)')
               AND cg.project_id = {project_id}
            UNION SELECT UNNEST({sanitized_connector_ids}::bigint[])
          ) geoms(geom_connector_id)
        JOIN connector c
          ON (geom_connector_id = c.id)
    """


class ExtraNodesOnlyNodeProvider(BasicNodeProvider):
    """Ignore the field of view and return only extra treenodes and connector
    nodes. This is mainly useful when sourcing node data from different
    locations.
    """

    def get_tuples(self, params, project_id, explicit_treenode_ids,
            explicit_connector_ids, include_labels, with_relation_map) -> Tuple[Any, str]:

        # No regular tracing data lookup needs to be done.
        tuples = [] # type: List
        # If there are exta nodes required, query them explicitely using a
        # regular Postgis 2D query. Inject the result into cached data.
        if explicit_treenode_ids or explicit_connector_ids:
            extra_tuples, extra_type = get_extra_nodes(params, project_id,
                explicit_treenode_ids, explicit_connector_ids, include_labels,
                with_relation_map)
            if extra_type != 'json':
                raise ValueError("Unexpected type")

            return extra_tuples, extra_type
        return tuples, 'json'


# A map of all available node providers that can be used.
AVAILABLE_NODE_PROVIDERS = {
    'postgis3d': Postgis3dNodeProvider,
    'postgis3dblurry': Postgis3dBlurryNodeProvider,
    'postgis3dmultijoin': Postgis3dMultiJoinNodeProvider,
    'postgis3dspgist': Postgis3dSpGistNodeProvider,
    'postgis2d': Postgis2dNodeProvider,
    'postgis2dblurry': Postgis2dBlurryNodeProvider,
    'postgis2dmultijoin': Postgis2dMultiJoinNodeProvider,
    'cached_json': CachedJsonNodeNodeProvder,
    'cached_json_text': CachedJsonTextNodeProvder,
    'cached_msgpack': CachedMsgpackNodeProvder,
    'extra_nodes_only': ExtraNodesOnlyNodeProvider,
    'cached_json_grid': GridCachedJsonNodeProvider,
    'cached_json_text_grid': GridCachedJsonTextNodeProvider,
    'cached_msgpack_grid': GridCachedMsgpackNodeProvider,
}


# The database cache identifier for each cache node provider
CACHE_NODE_PROVIDER_DATA_TYPES = {
    'cached_json': 'json',
    'cached_json_text': 'json_text',
    'cached_msgpack': 'msgpack',
}


def get_node_provider_configs():
    """Get a list of specified node provider configurationss."""
    configs = settings.NODE_PROVIDERS
    if type(configs) == str:
        configs = [configs]
    return configs


def get_configured_node_providers(provider_entries, connection=None,
        enabled_only=False) -> List:
    node_providers = []
    if type(provider_entries) == str:
        provider_entries = [provider_entries]
    for entry in provider_entries:
        options = {} # type: Dict
        # An entry is allowed to be a two-tuple (name, options) to provide
        # options to the constructor call. Otherwise a simple name string is
        # expected.
        if type(entry) in (list, tuple):
            key = entry[0]
            options = entry[1]
        else:
            key = entry

        Provider = AVAILABLE_NODE_PROVIDERS.get(key)
        include = options.get('enabled', True) or not enabled_only
        if Provider:
            if include:
                node_providers.append(Provider(connection, **options))
        else:
            raise ValueError('Unknown node provider: ' + key)

    return node_providers


def update_node_query_cache(node_providers=None, log=print, force=False) -> None:
    if not node_providers:
        node_providers = get_node_provider_configs()

    for np in node_providers:
        log("Checking node provder {}".format(np))
        if type(np) in (list, tuple):
            key = np[0]
            options = np[1]
        else:
            key = np
            options = {}

        project_id = options.get('project_id')
        if project_id:
            project_ids = [project_id]
        else:
            project_ids = list(Project.objects.all().order_by('id').values_list('id', flat=True))

        clean_cache = options.get('clean', False)

        n_largest_skeletons_limit = options.get('n_largest_skeletons_limit', None)
        n_last_edited_skeletons_limit = options.get('n_last_edited_skeletons_limit', None)
        hidden_last_editor_id = options.get('hidden_last_editor_id')
        lod_levels = options.get('lod_levels')
        lod_bucket_size = options.get('lod_bucket_size')
        lod_strategy = options.get('lod_strategy')

        data_type = CACHE_NODE_PROVIDER_DATA_TYPES.get(key)
        if not data_type:
            log("Skipping non-caching node provider: {}".format(key))
            continue

        enabled = options.get('enabled', True)
        if not enabled and not force:
            log("Skipping disabled node provider: {}".format(key))
            continue

        for project_id in project_ids:
            log("Updating cache for project {}".format(project_id))
            orientations = [options.get('orientation', 'xy')]
            steps = [options.get('step')]
            if not steps:
                raise ValueError("Need 'step' parameter in node provider configuration")
            node_limit = options.get('node_limit', None)
            update_cache(project_id, data_type, orientations, steps,
                    node_limit=node_limit,
                    n_largest_skeletons_limit=n_largest_skeletons_limit,
                    n_last_edited_skeletons_limit=n_last_edited_skeletons_limit,
                    hidden_last_editor_id=hidden_last_editor_id, lod_levels=lod_levels,
                    lod_bucket_size=lod_bucket_size, lod_strategy=lod_strategy,
                    delete=clean_cache, log=log)


def get_tracing_bounding_box(project_id, cursor=None, bb_limits=None):
    """Return the tracing data bounding box.
    """
    if not cursor:
        cursor = connection.cursor()

    params = {
        'project_id': project_id,
    }

    extra_filter = ''
    if bb_limits:
        extra_filter = '''
            AND ST_XMin(edge) >= %(min_x)s
            AND ST_YMin(edge) >= %(min_y)s
            AND ST_ZMin(edge) >= %(min_z)s
            AND ST_XMax(edge) <= %(max_x)s
            AND ST_YMax(edge) <= %(max_y)s
            AND ST_ZMax(edge) <= %(max_z)s
        '''
        params.update({
            'min_x': bb_limits[0][0],
            'min_y': bb_limits[0][1],
            'min_z': bb_limits[0][2],
            'max_x': bb_limits[1][0],
            'max_y': bb_limits[1][1],
            'max_z': bb_limits[1][2],
        })

    cursor.execute("""
        SELECT ARRAY[ST_XMin(bb.box), ST_YMin(bb.box), ST_ZMin(bb.box)],
               ARRAY[ST_XMax(bb.box), ST_YMax(bb.box), ST_ZMax(bb.box)]
        FROM (
            SELECT ST_3DExtent(edge) box FROM treenode_edge
            WHERE project_id = %(project_id)s
            {extra_filter}
        ) bb;
    """.format(**{
        'extra_filter': extra_filter,
    }), params)

    row = cursor.fetchone()
    if not row:
        raise ValueError("Could not compute bounding box of project {}".format(project_id))

    return row


def get_lod_buckets(result_tuple, lod_levels, lod_bucket_size, lod_strategy) -> List[List]:
    nodes = result_tuple[0]
    connectors = result_tuple[1]
    n_nodes_to_add = len(nodes)
    n_connectors_to_add = len(connectors)

    # Split data into LOD buckets, assume filtering and sorting has been
    # done in the node provider.
    result_buckets = [[]] * lod_levels # type: List[List]
    half_bucket_size = int(lod_bucket_size / 2)
    connector_slice_end = 0
    node_slice_end = 0
    n_total_imported_nodes = 0
    for lod_level in range(0, lod_levels):
        node_slice_start = node_slice_end
        connector_slice_start = connector_slice_end
        if lod_level == lod_levels - 1:
            # Last log level takes all remaining elements
            node_slice_end = len(result_tuple[0])
            connector_slice_end = len(result_tuple[1])
        elif lod_strategy == 'linear':
            offset = half_bucket_size
        elif lod_strategy == 'quadratic':
            offset = int(half_bucket_size * (lod_level + 1) ** 2)
        elif lod_strategy == 'exponential':
            offset = int(half_bucket_size * 2 ** lod_level)
        else:
            raise ValueError("Unknown LOD strategy: {}".format(lod_strategy))

        node_slice_end = min(n_nodes_to_add, node_slice_end + offset)
        connector_slice_end =  min(n_connectors_to_add, connector_slice_start + offset)

        # Try to reuse unused connector half for nodes and vice versa
        availble_nodes = offset - (node_slice_end - node_slice_start)
        availble_connector_nodes = offset - (connector_slice_end - connector_slice_start)
        if availble_connector_nodes:
            if node_slice_end < n_nodes_to_add:
                node_slice_end = min(node_slice_end, node_slice_end + availble_connector_nodes)
        if availble_nodes:
            if connector_slice_end < n_connectors_to_add:
                connector_slice_end = min(connector_slice_end, connector_slice_end + availble_nodes)

        n_imported_entries = (node_slice_end - node_slice_start) + \
                (connector_slice_end - connector_slice_start)
        n_total_imported_nodes += n_imported_entries
        if n_imported_entries:
            # Format: [[treenodes], [connectors], {labels}, node_limit_reached,
            # {relation_map}, {exstraNodes}]
            result_buckets[lod_level] = [
                result_tuple[0][node_slice_start:node_slice_end],
                result_tuple[1][connector_slice_start:connector_slice_end],
                {}, False, {},
            ]

    # Provide data other than treenodes and connectors in first bucket. In case
    # there was no data in the first place, assign the original result to the
    # first bucket.
    if result_buckets[0]:
        for col in range(2, len(result_tuple)):
            result_buckets[0][col] = result_tuple[col]
    else:
        result_buckets[0] = result_tuple

    return result_buckets


def update_cache(project_id, data_type, orientations, steps, node_limit=None,
        n_largest_skeletons_limit=None, n_last_edited_skeletons_limit=None,
        hidden_last_editor_id=None, lod_levels=1, lod_bucket_size=500,
        lod_strategy='quadratic', delete=False, bb_limits=None, log=print) -> None:
    if data_type not in ('json', 'json_text', 'msgpack'):
        raise ValueError('Type must be one of: json, json_text, msgpack')
    if len(steps) != len(orientations):
        raise ValueError('Need one depth resolution flag per orientation')
    if project_id is None:
        raise ValueError('Need project ID')

    orientation_ids = list(map(lambda x: ORIENTATIONS[x], orientations))

    cursor = connection.cursor()

    log(' -> Finding tracing data bounding box')
    row = get_tracing_bounding_box(project_id, cursor)
    bb = [row[0], row[1]]
    if None in bb[0] or None in bb[1]:
        log(' -> Found no valid bounding box, skipping project: {}'.format(bb))
        return
    else:
        log(' -> Found bounding box: {}'.format(bb))

    if bb_limits:
        bb[0][0] = max(bb[0][0], bb_limits[0][0])
        bb[0][1] = max(bb[0][1], bb_limits[0][1])
        bb[0][2] = max(bb[0][2], bb_limits[0][2])
        bb[1][0] = min(bb[1][0], bb_limits[1][0])
        bb[1][1] = min(bb[1][1], bb_limits[1][1])
        bb[1][2] = min(bb[1][2], bb_limits[1][2])
        log(' -> Applied limits to bounding box: {}'.format(bb))

    if delete:
        for n, o in enumerate(orientations):
            orientation_id = orientation_ids[n]
            log(' -> Deleting existing cache entries in orientation {}'.format(project_id, o))
            cursor.execute("""
                DELETE FROM node_query_cache
                WHERE project_id = %(project_id)s
                AND orientation = %(orientation)s
            """, {
                'project_id': project_id,
                'orientation': orientation_id
            })

    params = {
        'left': bb[0][0],
        'top': bb[0][1],
        'z1': None,
        'right': bb[1][0],
        'bottom': bb[1][1],
        'z2': None,
        'project_id': project_id,
        'limit': node_limit
    }

    if n_largest_skeletons_limit:
        params['n_largest_skeletons_limit'] = int(n_largest_skeletons_limit)
        log((' -> Allowing {} largest skeletons in the field of view in '
                'each section').format(n_largest_skeletons_limit))

    if n_last_edited_skeletons_limit:
        params['n_last_edited_skeletons_limit'] = int(n_last_edited_skeletons_limit)
        log((' -> Allowing {} most recently edited skeletons in the '
                'field of view in each section'). format(n_last_edited_skeletons_limit))

    if hidden_last_editor_id:
        params['hidden_last_editor_id'] = int(hidden_last_editor_id)
        log((' -> Only nodes not edited last by user {} will be allowed'.format(
                hidden_last_editor_id)))

    log(' -> Level-of-detail steps: {}, bucket size: {}, strategy: {}'.format(
            lod_levels, lod_bucket_size, lod_strategy))

    min_z = bb[0][2]
    max_z = bb[1][2]

    data_types = [data_type]
    update_json_cache = 'json' in data_types
    update_json_text_cache = 'json_text' in data_types
    update_msgpack_cache = 'msgpack' in data_types

    # TODO: Use matching settings node provider
    provider = Postgis3dNodeProvider()
    types = ', '.join(data_types)

    for o, step in zip(orientations, steps):
        orientation_id = ORIENTATIONS[o]
        log(' -> Populating cache for orientation {} with depth resolution {} for types: {}'.format(o, step, types))
        z = min_z
        while z < max_z:
            params['z1'] = z
            params['z2'] = z + step
            result_tuple = _node_list_tuples_query(params, project_id, provider)
            result_buckets = get_lod_buckets(result_tuple, lod_levels,
                    lod_bucket_size, lod_strategy)

            if update_json_cache:
                data = ujson.dumps(result_tuple)
                cursor.execute("""
                    INSERT INTO node_query_cache (project_id, orientation, depth,
                        update_time, n_lod_levels, lod_min_bucket_size, json_data)
                    VALUES (%s, %s, %s, now(), %s, %s %s)
                    ON CONFLICT (project_id, orientation, depth)
                    DO UPDATE SET json_data = EXCLUDED.json_data, update_time = EXCLUDED.update_time;
                """, (project_id, orientation_id, z, lod_levels, lod_bucket_size,
                        [None if not v else json.dumps(v) for v in result_buckets]))

            if update_json_text_cache:
                data = ujson.dumps(result_tuple)
                cursor.execute("""
                    INSERT INTO node_query_cache (project_id, orientation, depth,
                        update_time, n_lod_levels, lod_min_bucket_size, json_text_data)
                    VALUES (%s, %s, %s, now(), %s, %s, %s)
                    ON CONFLICT (project_id, orientation, depth)
                    DO UPDATE SET json_text_data = EXCLUDED.json_text_data, update_time = EXCLUDED.update_time;
                """, (project_id, orientation_id, z, lod_levels, lod_bucket_size,
                        [None if not v else json.dumps(v) for v in result_buckets]))

            if update_msgpack_cache:
                cursor.execute("""
                    INSERT INTO node_query_cache (project_id, orientation, depth,
                        update_time, n_lod_levels, lod_bucket_size, msgpack_data)
                    VALUES (%s, %s, %s, now(), %s)
                    ON CONFLICT (project_id, orientation, depth)
                    DO UPDATE SET msgpack_data = EXCLUDED.msgpack_data, update_time = EXCLUDED.update_time;
                """, (project_id, orientation_id, z, lod_levels, lod_bucket_size,
                        [None if not v else psycopg2.Binary(msgpack.packb(v)) for v in result_buckets]))

            z += step


def update_grid_cache(project_id, data_type, orientations,
        cell_width=settings.DEFAULT_CACHE_GRID_CELL_WIDTH,
        cell_height=settings.DEFAULT_CACHE_GRID_CELL_HEIGHT,
        cell_depth=settings.DEFAULT_CACHE_GRID_CELL_DEPTH,
        node_limit=None, n_largest_skeletons_limit=None,
        n_last_edited_skeletons_limit=None, hidden_last_editor_id=None,
        delete=False, bb_limits=None, log=print, progress=True,
        allow_empty=False, lod_levels=1, lod_bucket_size=500,
        lod_strategy='quadratic') -> None:
    if data_type not in ('json', 'json_text', 'msgpack'):
        raise ValueError('Type must be one of: json, json_text, msgpack')
    if project_id is None:
        raise ValueError('Need project ID')
    if not cell_width:
        raise ValueError('Need non-zero cell width information')
    if not cell_height:
        raise ValueError('Need non-zero cell height information')
    if not cell_depth:
        raise ValueError('Need non-zero cell depth information')

    orientation_ids = list(map(lambda x: ORIENTATIONS[x], orientations))

    cursor = connection.cursor()

    log(' -> Finding tracing data bounding box')
    row = get_tracing_bounding_box(project_id, cursor, bb_limits)
    bb = [row[0], row[1]]
    if None in bb[0] or None in bb[1]:
        log(' -> Found no valid bounding box, skipping project: {}'.format(bb))
        return
    if bb_limits:
        bb[0][0] = max(bb[0][0], bb_limits[0][0])
        bb[0][1] = max(bb[0][1], bb_limits[0][1])
        bb[0][2] = max(bb[0][2], bb_limits[0][2])
        bb[1][0] = min(bb[1][0], bb_limits[1][0])
        bb[1][1] = min(bb[1][1], bb_limits[1][1])
        bb[1][2] = min(bb[1][2], bb_limits[1][2])
        log(' -> Found bounding box within limits: {}'.format(bb))
    else:
        log(' -> Found bounding box: {}'.format(bb))

    if delete:
        for n, o in enumerate(orientations):
            orientation_id = orientation_ids[n]
            log(' -> Deleting existing grid cache entries in orientation {}'.format(project_id, o))
            cursor.execute("""
                DELETE FROM node_grid_cache
                WHERE project_id = %(project_id)s
                AND orientation = %(orientation)s
                CASCADE
            """, {
                'project_id': project_id,
                'orientation': orientation_id
            })

    params = {
        'left':   bb[0][0],
        'top':    bb[0][1],
        'z1':     bb[0][2],
        'right':  bb[1][0],
        'bottom': bb[1][1],
        'z2':     bb[1][2],
        'project_id': project_id,
        'limit':  node_limit
    }

    if n_largest_skeletons_limit:
        params['n_largest_skeletons_limit'] = int(n_largest_skeletons_limit)
        log((' -> Allowing {} largest skeletons in the field of view in '
                'each section').format(n_largest_skeletons_limit))

    if n_last_edited_skeletons_limit:
        params['n_last_edited_skeletons_limit'] = int(n_last_edited_skeletons_limit)
        log((' -> Allowing {} most recently edited skeletons in the '
                'field of view in each section'). format(n_last_edited_skeletons_limit))

    if hidden_last_editor_id:
        params['hidden_last_editor_id'] = int(hidden_last_editor_id)
        log((' -> Only nodes not edited last by user {} will be allowed'.format(
                hidden_last_editor_id)))

    data_types = [data_type]
    update_json_cache = 'json' in data_types
    update_json_text_cache = 'json_text' in data_types
    update_msgpack_cache = 'msgpack' in data_types

    provider = Postgis3dNodeProvider()
    types = ', '.join(data_types)

    for o in orientations:
        orientation_id = ORIENTATIONS[o]
        log(' -> Populating grid cache for orientation {} with block size {} (x, y, z) for types: {}'.format(
                o, (cell_width, cell_height, cell_depth), types))

        cursor.execute("""
            SELECT id
            FROM node_grid_cache
            WHERE project_id = %(project_id)s
                AND orientation = %(orientation)s
                AND cell_width = %(cell_width)s
                AND cell_height = %(cell_height)s
                AND cell_depth = %(cell_depth)s
            ORDER BY cell_width, cell_height, cell_depth DESC
        """, {
            'project_id': project_id,
            'orientation': orientation_id,
            'cell_width': cell_width,
            'cell_height': cell_height,
            'cell_depth': cell_depth,
            'n_largest_sk_limit': n_largest_skeletons_limit or None,
            'n_last_edit_limit': n_last_edited_skeletons_limit or None,
            'hidden_last_editor_id': hidden_last_editor_id or None,
        })
        grid_ids = cursor.fetchall()
        if grid_ids:
            grid_id = grid_ids[0]
        else:
            cursor.execute("""
                INSERT INTO node_grid_cache (project_id, orientation,
                    cell_width, cell_height, cell_depth, n_largest_skeletons_limit,
                    n_last_edited_skeletons_limit, hidden_last_editor_id,
                    n_lod_levels, lod_min_bucket_size, lod_strategy, allow_empty,
                    has_json_data, has_json_text_data, has_msgpack_data)
                VALUES (%(project_id)s, %(orientation)s, %(cell_width)s,
                    %(cell_height)s, %(cell_depth)s, %(n_largest_sk_limit)s,
                    %(n_last_edit_limit)s, %(hidden_last_editor_id)s,
                    %(n_lod_levels)s, %(lod_min_bucket_size)s, %(lod_strategy)s,
                    %(allow_empty)s, %(has_json_data)s, %(has_json_text_data)s,
                    %(has_msgpack_data)s)
                RETURNING id;
            """, {
                'project_id': project_id,
                'orientation': orientation_id,
                'cell_width': cell_width,
                'cell_height': cell_height,
                'cell_depth': cell_depth,
                'n_largest_sk_limit': n_largest_skeletons_limit or None,
                'n_last_edit_limit': n_last_edited_skeletons_limit or None,
                'hidden_last_editor_id': hidden_last_editor_id or None,
                'n_lod_levels': lod_levels or None,
                'lod_min_bucket_size': lod_bucket_size or None,
                'lod_strategy': lod_strategy or None,
                'allow_empty': allow_empty,
                'has_json_data': update_json_cache,
                'has_json_text_data': update_json_text_cache,
                'has_msgpack_data': update_msgpack_cache,
            })
            grid_id = cursor.fetchone()[0]

        # Only look at cells that cover the bounding box
        min_w_i = int(params['left'] // cell_width)
        min_h_i = int(params['top'] // cell_height)
        min_d_i = int(params['z1'] // cell_depth)

        max_w_i = int(params['right'] // cell_width)
        max_h_i = int(params['bottom'] // cell_height)
        max_d_i = int(params['z2'] // cell_depth)

        n_cells_w = max_w_i - min_w_i + 1
        n_cells_h = max_h_i - min_h_i + 1
        n_cells_d = max_d_i - min_d_i + 1
        n_cells = n_cells_w * n_cells_h * n_cells_d

        log(' -> Grid dimension (cells per dimension X, Y and Z): {}, {}, {} Total cells: {}'.format(
                n_cells_w, n_cells_h, n_cells_d, n_cells))

        log(' -> Level-of-detail steps: {}, bucket size: {}, strategy: {}'.format(
                lod_levels, lod_bucket_size, lod_strategy))

        if progress:
            bar = progressbar.ProgressBar(max_value=n_cells, redirect_stdout=True).start()

        counter = 0
        created = 0
        for d_i in range(min_d_i, max_d_i + 1):
            for h_i in range(min_h_i, max_h_i + 1):
                for w_i in range(min_w_i, max_w_i + 1):
                    if progress:
                        counter += 1
                        bar.update(counter)

                    added = update_grid_cell(project_id, grid_id, w_i, h_i, d_i,
                            cell_width, cell_height, cell_depth, provider,
                            params, allow_empty, lod_levels, lod_bucket_size,
                            lod_strategy, update_json_cache,
                            update_json_text_cache, update_msgpack_cache, cursor)
                    if added:
                        created += 1
        log(' -> Materialized {} grid cells'.format(created))
        if progress:
            bar.finish()


def update_grid_cell(project_id, grid_id, w_i, h_i, d_i, cell_width,
        cell_height, cell_depth, provider, params, allow_empty, lod_levels,
        lod_bucket_size, lod_strategy, update_json_cache,
        update_json_text_cache, update_msgpack_cache, cursor) -> bool:
    params['left'] = w_i * cell_width
    params['right'] = (w_i + 1) * cell_width
    params['top'] = h_i * cell_height
    params['bottom'] = (h_i + 1) * cell_width
    params['z1'] = d_i * cell_depth
    params['z2'] = (d_i + 1) * cell_depth

    result_tuple = _node_list_tuples_query(params, project_id, provider,
            include_labels=True)

    if not (allow_empty or result_tuple[0] or result_tuple[1]):
        return False

    result_buckets = get_lod_buckets(result_tuple, lod_levels,
            lod_bucket_size, lod_strategy)

    if update_json_cache:
        cursor.execute("""
            INSERT INTO node_grid_cache_cell (grid_id,
                x_index, y_index, z_index, update_time, json_data)
            VALUES (%(grid_id)s, %(x_index)s, %(y_index)s, %(z_index)s,
                now(), %(data)s::jsonb[])
            ON CONFLICT (grid_id, x_index, y_index, z_index)
            DO UPDATE SET json_data = EXCLUDED.json_data, update_time = EXCLUDED.update_time;
        """, {
            'grid_id': grid_id,
            'x_index': w_i,
            'y_index': h_i,
            'z_index': d_i,
            'data': [None if not v else json.dumps(v) for v in result_buckets],
        })

    if update_json_text_cache:
        cursor.execute("""
            INSERT INTO node_grid_cache_cell (grid_id,
                x_index, y_index, z_index, update_time, json_text_data)
            VALUES (%(grid_id)s, %(x_index)s, %(y_index)s, %(z_index)s,
                now(), %(data)s)
            ON CONFLICT (grid_id, x_index, y_index, z_index)
            DO UPDATE SET json_text_data = EXCLUDED.json_text_data, update_time = EXCLUDED.update_time;
        """, {
            'grid_id': grid_id,
            'x_index': w_i,
            'y_index': h_i,
            'z_index': d_i,
            'data': [None if not v else json.dumps(v) for v in result_buckets],
        })

    if update_msgpack_cache:
        cursor.execute("""
            INSERT INTO node_grid_cache_cell (grid_id,
                x_index, y_index, z_index, update_time, msgpack_data)
            VALUES (%(grid_id)s, %(x_index)s, %(y_index)s, %(z_index)s,
                now(), %(data)s)
            ON CONFLICT (grid_id, x_index, y_index, z_index)
            DO UPDATE SET msgpack_data = EXCLUDED.msgpack_data, update_time = EXCLUDED.update_time;
        """, {
            'grid_id': grid_id,
            'x_index': w_i,
            'y_index': h_i,
            'z_index': d_i,
            'data':  [None if not v else psycopg2.Binary(msgpack.packb(v)) for v in result_buckets],
        })

    return True


def prepare_db_statements(connection) -> None:
    node_providers = get_configured_node_providers(get_node_provider_configs(), connection)
    for node_provider in node_providers:
        node_provider.prepare_db_statements(connection)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_list_tuples(request:HttpRequest, project_id=None, provider=None) -> HttpResponse:
    '''Retrieve all nodes intersecting a bounding box

    The intersection bounding box is defined in terms of its minimum and
    maximum project space coordinates. The number of returned nodes can be
    limited to constrain query execution time. Optionally, lists of treenodes
    and connector IDs can be provided to make sure they are included in the
    result set, regardless of intersection.

    Returned is an array with five entries, plus optionally a sixth one

    [[treenodes], [connectors], {labels}, node_limit_reached, {relation_map}, {exstraNodes}]

    The list of treenodes has elements of this form:

    [id, parent_id, location_x, location_y, location_z, confidence, radius, skeleton_id, edition_time, user_id]

    The list connectors has elements of this form:

    [id, location_x, location_y, location_z, confidence, edition_time, user_id, [partners]]

    The partners arrary represents linked partner nodes, each one represented like this:

    [treenode_id, relation_id, link_confidence, link_edition_time, link_id]

    If labels are returned, they are represented as an object of the following
    form, with the labels just being simple strings:

    {treenode_id: [labels]}

    The fourth top level entry, node_limit_reached, is a boolean that
    represents if there are more nodes available than the ones returned.

    With the last top level element returned the present connector linked
    relations are mapped to their textural representations:

    {relation_id: relation_name}
    ---
    parameters:
    - name: treenode_ids
      description: |
        Whether linked connectors should be returned.
      required: false
      type: array
      items:
        type: integer
      paramType: form
    - name: connector_ids
      description: |
        Whether tags should be returned.
      required: false
      type: array
      items:
        type: integer
      paramType: form
    - name: limit
      description: |
        Limit the number of returned nodes.
      required: false
      type: integer
      defaultValue: 3500
      paramType: form
    - name: left
      description: |
        Minimum world space X coordinate
      required: true
      type: float
      paramType: form
    - name: top
      description: |
        Minimum world space Y coordinate
      required: true
      type: float
      paramType: form
    - name: z1
      description: |
        Minimum world space Z coordinate
      required: true
      type: float
      paramType: form
    - name: right
      description: |
        Maximum world space X coordinate
      required: true
      type: float
      paramType: form
    - name: bottom
      description: |
        Maximum world space Y coordinate
      required: true
      type: float
      paramType: form
    - name: z2
      description: |
        Maximum world space Z coordinate
      required: true
      type: float
      paramType: form
    - name: format
      description: |
        Either "json" (default) or "msgpack", optional.
      required: false
      type: string
      paramType: form
    - name: with_relation_map
      description: |
        Whether an ID to name mapping for the used relations should be included
        and which extent it should have.
      required: false
      enum: [none, used, all]
      type: string
      defaultValue: used
      paramType: form
    - name: n_largest_skeletons_limit
      description: |
        Maximum number of the largest skeletons in view
      required: false
      type: integer
      paramType: form
    - name: n_last_edited_skeletons_limit
      description: |
        Maximum number of most recently edited skeletons.
      required: false
      type: integer
      paramType: form
    - name: hidden_last_editor_id
      description: |
        No nodes edited last by this user will be retuned.
      required: false
      type: integer
      paramType: form
    - name: min_skeleton_length
      description: |
        Optional minimum skeleton length, no returned node is of a shorter
        skeleton.
      required: false
      type: float
      paramType: form
    type:
    - type: array
      items:
        type: string
      required: true
    '''
    project_id = int(project_id) # sanitize
    if request.method == 'POST':
        data = request.POST
    elif request.method == 'GET':
        data = request.GET
    else:
        raise ValueError("Unsupported HTTP method: " + request.method)

    params = {} # type: Dict[str, Optional[Union[int, float]]]

    treenode_ids = get_request_list(data, 'treenode_ids', tuple(), int)
    connector_ids = get_request_list(data, 'connector_ids', tuple(), int)
    for p in ('top', 'left', 'bottom', 'right', 'z1', 'z2'):
        params[p] = float(data.get(p, 0))
    # Limit the number of retrieved treenodes within the section
    params['limit'] = settings.NODE_LIST_MAXIMUM_COUNT
    params['n_largest_skeletons_limit'] = int(data.get('n_largest_skeletons_limit', 0))
    params['n_last_edited_skeletons_limit'] = int(data.get('n_last_edited_skeletons_limit', 0))
    params['hidden_last_editor_id'] = int(data['hidden_last_editor_id']) if 'hidden_last_editor_id' in data else None
    params['min_skeleton_length'] = float(data.get('min_skeleton_length', 0))
    params['min_skeleton_nodes'] = int(data.get('min_skeleton_nodes', 0))
    params['project_id'] = project_id
    include_labels = get_request_bool(data, 'labels', False)
    target_format = data.get('format', 'json')
    target_options = {
        'view_width': int(data.get('view_width', 1000)),
        'view_height': int(data.get('view_height', 1000)),
    }
    override_provider = data.get('src')
    with_relation_map = data.get('with_relation_map', 'used')
    if with_relation_map not in ("none", "used", "all"):
        raise ValueError("Relation map can only be 'none', 'used' or 'all'")
    if with_relation_map == 'none':
        with_relation_map = None
    # The orientation parameter is used to override the dominant depth
    # dimension. This dimension is used do some queries.
    orientation = data.get('orientation')
    width = params['width'] = params.get('right') - params.get('left') # type: ignore
    height = params['height'] = params.get('bottom') - params.get('top') # type: ignore
    depth = params['depth'] = params.get('z2') - params.get('z1') # type: ignore
    if not orientation:
        if depth < width:
            if depth < height:
                orientation = 'xy'
            else:
                orientation = 'xz'
        else:
            if depth < height:
                orientation = 'zy'
            elif width < height:
                orientation = 'zy'
            else:
                orientation = 'xz'
    params['orientation'] = orientation
    params['lod'] = data.get('lod', 'max')
    params['lod_type'] = data.get('lod_type', 'absolute')

    if override_provider:
        node_providers = get_configured_node_providers([override_provider])
    else:
        node_providers = get_configured_node_providers(get_node_provider_configs())

    return compile_node_list_result(project_id, node_providers, params,
        treenode_ids, connector_ids, include_labels, target_format,
        target_options, with_relation_map)


def _node_list_tuples_query(params, project_id, node_provider,
        explicit_treenode_ids=tuple(), explicit_connector_ids=tuple(),
        include_labels=False, with_relation_map='used') -> List:
    """The returned JSON data is sensitive to indices in the array, so care
    must be taken never to alter the order of the variables in the SQL
    statements without modifying the accesses to said data both in this
    function and in the client that consumes it.
    """
    try:
        cursor = connection.cursor()

        if with_relation_map or include_labels:
            cursor.execute('''
            SELECT relation_name, id FROM relation WHERE project_id=%s
            ''' % project_id)
            relation_map = dict(cursor.fetchall())
            id_to_relation = {v: k for k, v in relation_map.items()}

        # A set of extra treenode and connector IDs
        missing_treenode_ids = set(n for n in explicit_treenode_ids if n != -1)
        missing_connector_ids = set(c for c in explicit_connector_ids if c != -1)

        # Find connectors in the field of view
        response_on_error = 'Failed to query connector locations.'
        crows = node_provider.get_connector_data(cursor, params,
            missing_connector_ids)

        connectors = []
        # A set of unique connector IDs
        connector_ids = set() # type: Set

        # Collect links to connectors for each treenode. Each entry maps a
        # relation ID to a an object containing the relation name, and an object
        # mapping connector IDs to confidences.
        links = defaultdict(list) # type: DefaultDict[Any, List]
        used_relations = set()
        seen_links = set() # type: Set

        for row in crows:
            # Collect treeenode IDs related to connectors but not yet in treenode_ids
            # because they lay beyond adjacent sections
            cid = row[0] # connector ID
            tnid = row[7] # treenode ID
            tcid = row[11] # treenode connector ID

            if tnid is not None:
                if tcid in seen_links:
                    continue
                missing_treenode_ids.add(tnid)
                seen_links.add(tcid)
                # Collect relations between connectors and treenodes
                # row[7]: treenode_id (tnid above)
                # row[8]: treenode_relation_id
                # row[9]: tc_confidence
                # row[10]: tc_edition_time
                # row[11]: tc_id
                links[cid].append(row[7:12])
                used_relations.add(row[8])

            # Collect unique connectors
            if cid not in connector_ids:
                connectors.append(row[0:7] + (links[cid],))
                connector_ids.add(cid)

        response_on_error = 'Failed to query treenodes'

        treenode_ids, treenodes = node_provider.get_treenode_data(cursor,
                params, missing_treenode_ids)
        n_retrieved_nodes = len(treenode_ids)

        labels = defaultdict(list) # type: DefaultDict[Any, List]
        if include_labels:
            # Avoid dict lookups in loop
            top, left, z1 = params['top'], params['left'], params['z1']
            bottom, right, z2 = params['bottom'], params['right'], params['z2']

            def is_visible(r):
                return left <= r[2] < right and \
                    top <= r[3] < bottom and \
                    z1 <= r[4] < z2

            # Collect treenodes visible in the current section
            visible = [row[0] for row in treenodes if is_visible(row)]
            if visible:
                cursor.execute('''
                SELECT treenode_class_instance.treenode_id,
                       class_instance.name
                FROM class_instance,
                     treenode_class_instance,
                     UNNEST(%s::bigint[]) treenodes(tnid)
                WHERE treenode_class_instance.relation_id = %s
                  AND class_instance.id = treenode_class_instance.class_instance_id
                  AND treenode_class_instance.treenode_id = tnid
                ''', (visible, relation_map['labeled_as']))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

            # Collect connectors visible in the current section
            visible = [row[0] for row in connectors if z1 <= row[3] < z2]
            if visible:
                cursor.execute('''
                SELECT connector_class_instance.connector_id,
                       class_instance.name
                FROM class_instance,
                     connector_class_instance,
                     UNNEST(%s::bigint[]) connectors(cnid)
                WHERE connector_class_instance.relation_id = %s
                  AND class_instance.id = connector_class_instance.class_instance_id
                  AND connector_class_instance.connector_id = cnid
                ''', (visible, relation_map['labeled_as']))
                for row in cursor.fetchall():
                    labels[row[0]].append(row[1])

        if with_relation_map == 'used':
            export_relation_map = {r:id_to_relation[r] for r in used_relations}
        elif with_relation_map == 'all':
            export_relation_map = id_to_relation
        else:
            export_relation_map = {}

        result = [treenodes, connectors, labels,
                n_retrieved_nodes == params['limit'], export_relation_map]

        return result

    except Exception as e:
        import traceback
        raise Exception(response_on_error + ':' + str(e) + '\nOriginal error: ' + str(traceback.format_exc()))

def node_list_tuples_query(params, project_id, node_provider,
        explicit_treenode_ids=tuple(), explicit_connector_ids=tuple(),
        include_labels=False, target_format='json', target_options=None,
        with_relation_map=True) -> HttpResponse:

    result_tuple, data_type = node_provider.get_tuples(params, project_id,
        explicit_treenode_ids, explicit_connector_ids, include_labels,
        with_relation_map)

    return create_node_response(result_tuple, params, target_format, target_options, data_type)

def compile_node_list_result(project_id, node_providers, params,
        explicit_treenode_ids=tuple(), explicit_connector_ids=tuple(),
        include_labels=False, target_format='json', target_options=None,
        with_relation_map=True) -> HttpResponse:
    """Create a valid HTTP response for the provided node query. If
    override_provider is not passed in, the list of node_providers will be
    iterated until a result is found.
    """
    result_tuple, data_type = None, None
    for node_provider in node_providers:
        if node_provider.matches(params):
            result = node_provider.get_tuples(params, project_id,
                explicit_treenode_ids, explicit_connector_ids, include_labels,
                with_relation_map)
            result_tuple, data_type =  result

            if result_tuple and data_type:
                break

    if not (result_tuple and data_type):
        raise ValueError("Could not find matching node provider for request")

    return create_node_response(result_tuple, params, target_format, target_options, data_type)

def create_node_response(result, params, target_format, target_options, data_type) -> HttpResponse:
    if target_format == 'json':
        if data_type == 'json':
            data = ujson.dumps(result)
        elif data_type == 'json_text':
            data = result
        elif data_type == 'msgpack':
            data = ujson.dumps(msgpack.unpackb(result, use_list=False))
        else:
            raise ValueError("Unknown data type: " + data_type)
        return HttpResponse(data, content_type='application/json')
    elif target_format == 'msgpack':
        if data_type == 'json':
            data = msgpack.packb(result)
        elif data_type == 'json_text':
            data = msgpack.packb(ujson.loads(result))
        elif data_type == 'msgpack':
            data = result
        else:
            raise ValueError("Unknown data type: " + data_type)
        return HttpResponse(data, content_type='application/octet-stream')
    elif target_format == 'png' or target_format == 'gif':
        if data_type == 'json':
            data = result
        elif data_type == 'json_text':
            data = ujson.loads(result)
        elif data_type == 'msgpack':
            data = msgpack.unpackb(result, use_list=False)
        else:
            raise ValueError("Unknown data type: " + data_type)
        width = target_options['view_width']
        height = target_options['view_height']
        view_min_x = params['left']
        view_min_y = params['top']
        xscale = width / (params['right'] - params['left'])
        yscale = height / (params['bottom'] - params['top'])
        image = render_nodes_xy(data, params, width, height, view_min_x,
                view_min_y, xscale, yscale)
        # serialize to HTTP response
        if target_format == 'png':
            response = HttpResponse(content_type="image/png")
            image.save(response, "PNG")
        else:
            response = HttpResponse(content_type="image/gif")
            image.save(response, 'GIF', transparency=0, optimize=True)
        return response
    else:
        raise ValueError("Unknown target format: {}".format(target_format))

def render_nodes_xy(node_data, params, width, height, view_min_x=0, view_min_y=0,
        xscale=1.0, yscale=1.0) -> Image:
    """Render the passed in node data to an image.
    """
    import random
    background = (255, 0, 0, 0)
    image = Image.new('RGBA', (width, height), background)

    radius = 4
    hr = radius / 2.0
    node_pen = Pen((255, 0, 255), 1)
    root_pen = Pen('red', 1)
    #leaf_pen = Pen('red', 1)
    node_brush = Brush((255, 0, 255))
    root_brush = Brush('red')
    #leaf_brush = Brush('red')

    virtual_nodes = True

    left, right = params['left'], params['right']
    top, bottom = params['top'], params['bottom']
    z1, z2 = params['z1'], params['z2']

    # Map parents to children
    nodes = dict()
    treenodes = node_data[0]
    for tn in treenodes:
        nodes[tn[0]] = tn

    draw = Draw(image)
    # Add treenodes:
    for tn in treenodes:
        parent_id = tn[1]
        x, y, z = tn[2], tn[3], tn[4]
        xs, ys = None, None
        virtual_node_created = False

        is_outside = x < left or x >= right or y < top \
                or y >= bottom or z < z1 or z >= z2

        # If this node and its parent are outside, create a virtual node
        # location and replace current coordinates.
        if is_outside:
            if virtual_nodes and parent_id:
                parent_node = nodes.get(parent_id)
                if parent_node:
                    px, py, pz = parent_node[2], parent_node[3], parent_node[4]
                    p_is_outside = px < left or px >= right or py < top \
                            or py >= bottom or pz < z1 or pz >= z2

                    # If the parent ist outside, too, find virtual node
                    # location.
                    if p_is_outside:
                        dx, dy, dz = px - x, py - y, pz - z
                        if dz > -0.0001 and dz < 0.0001:
                            continue
                        t = (z1 - z) / dz

                        x = x + t * dx
                        y = y + t * dy
                        z = z1
                        virtual_node_created = True

            if not virtual_node_created:
                continue

        xs = xscale * (x - view_min_x)
        ys = yscale * (y - view_min_y)

        if parent_id:
            pen = node_pen
            brush = node_brush
        else:
            pen = root_pen
            brush = root_brush

        # Render node or virtual node
        draw.ellipse((xs - hr, ys - hr, xs + hr, ys + hr), pen, brush)

    draw.flush()

    return image


@requires_user_role(UserRole.Annotate)
def update_location_reviewer(request:HttpRequest, project_id=None, node_id=None) -> JsonResponse:
    """ Updates the reviewer id and review time of a node """
    try:
        # Try to get the review object. If this fails we create a new one. Doing
        # it in a try/except instead of get_or_create allows us to retrieve the
        # skeleton ID only if needed.
        r = Review.objects.get(treenode_id=node_id, reviewer=request.user)
    except Review.DoesNotExist:
        node = get_object_or_404(Treenode, pk=node_id)
        r = Review(project_id=project_id, treenode_id=node_id,
                   skeleton_id=node.skeleton_id, reviewer=request.user)

    r.review_time = timezone.now()
    r.save()

    return JsonResponse({
        'reviewer_id': request.user.id,
        'review_time': r.review_time.isoformat(),
    })


@api_view(['GET'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def most_recent_treenode(request:HttpRequest, project_id=None) -> JsonResponse:
    """Retrieve the last edited node.

    Without any further parameters, this will retrieve the node last edited on
    any skeleton by any user. This can be further constrained by skeleton and
    user.
    ---
    parameters:
        - name: project_id
          description: The project to operate in.
          required: true
          type: number
          format: integer
          paramType: path
        - name: skeleton_id
          description: |
            (optional) Skeleton for which to retrieve last edited node.
          required: false
          type: number
          format: integer
          paramType: form
        - name: user_id
          description: |
            (optional) User of which to retrieve last edited node.
          required: false
          type: number
          format: integer
          paramType: form
    """
    skeleton_id = request.GET.get('skeleton_id')
    if skeleton_id is not None:
        skeleton_id = int(skeleton_id)
    user_id = request.GET.get('user_id')
    if user_id is not None:
        user_id = int(user_id)

    try:
        params = {
            'project': project_id
        }
        if user_id is not None:
            params['editor'] = user_id
        if skeleton_id is not None:
            params['skeleton_id'] = skeleton_id
        # Select the most recently edited node
        tn = Treenode.objects.filter(**params) \
                .extra(select={'most_recent': 'greatest(treenode.creation_time, treenode.edition_time)'}) \
                .extra(order_by=['-most_recent', '-treenode.id'])[0] # [0] generates a LIMIT 1
    except IndexError:
        # No treenode edited by the user exists in this skeleton.
        return JsonResponse({})

    return JsonResponse({
        'id': tn.id,
        #'skeleton_id': tn.skeleton.id,
        'x': int(tn.location_x),
        'y': int(tn.location_y),
        'z': int(tn.location_z),
        #'most_recent': str(tn.most_recent) + tn.most_recent.strftime('%z'),
        #'most_recent': tn.most_recent.strftime('%Y-%m-%d %H:%M:%S.%f'),
        #'type': 'treenode'
    })


def _update_location(table, nodes, now, user, cursor):
    if not nodes:
        return
    # 0: id
    # 1: X
    # 2: Y
    # 3: Z
    can_edit_all_or_fail(user, (node[0] for node in nodes), table)

    # Sanitize node details
    nodes = [(int(i), float(x), float(y), float(z)) for i,x,y,z in nodes]

    node_template = "(" + "),(".join(["%s, %s, %s, %s"] * len(nodes)) + ")"
    node_table = [v for k in nodes for v in k]

    # Sanitize table name, because we are going to insert it directly into the
    # SQL query below.
    if table not in ('treenode', 'connector'):
        raise ValueError('Expected treenode or connector')

    # If we update the location parent table to update both treenode and connector
    # nodes, statement level triggers would not be run on the respective child
    # tables (treenode and connector).
    cursor.execute("""
        UPDATE {} n
        SET editor_id = %s, location_x = target.x,
            location_y = target.y, location_z = target.z
        FROM (SELECT x.id, x.location_x AS old_loc_x,
                     x.location_y AS old_loc_y, x.location_z AS old_loc_z,
                     y.new_loc_x AS x, y.new_loc_y AS y, y.new_loc_z AS z
              FROM {} x
              INNER JOIN (VALUES {}) y(id, new_loc_x, new_loc_y, new_loc_z)
              ON x.id = y.id FOR NO KEY UPDATE) target
        WHERE n.id = target.id
        RETURNING n.id, n.edition_time, target.old_loc_x, target.old_loc_y,
                  target.old_loc_z
    """.format(table, table, node_template), [user.id] + node_table)

    updated_rows = cursor.fetchall()
    if len(nodes) != len(updated_rows):
        raise ValueError('Coudn\'t update node ' +
                         ','.join(frozenset([str(r[0]) for r in nodes]) -
                                  frozenset([str(r[0]) for r in updated_rows])))
    return updated_rows


@requires_user_role(UserRole.Annotate)
def node_update(request:HttpRequest, project_id=None) -> JsonResponse:
    treenodes = get_request_list(request.POST, "t") or []
    connectors = get_request_list(request.POST, "c") or []

    cursor = connection.cursor()
    nodes = treenodes + connectors
    if nodes:
        node_ids = [int(n[0]) for n in nodes]
        state.validate_state(node_ids, request.POST.get('state'),
                multinode=True, lock=True, cursor=cursor)

    now = timezone.now()
    old_treenodes = _update_location("treenode", treenodes, now, request.user, cursor)
    old_connectors = _update_location("connector", connectors, now, request.user, cursor)

    num_updated_nodes = len(treenodes) + len(connectors)
    return JsonResponse({
        'updated': num_updated_nodes,
        'old_treenodes': old_treenodes,
        'old_connectors': old_connectors
    })


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def node_nearest(request:HttpRequest, project_id=None) -> JsonResponse:
    """Find the closest node in a skeleton relative to a passed in location.

    If a skeleton ID or neuron id is passed in as well, the nearest node in the
    respective skeleton is returned.
    ---
    parameters:
        - name: project_id
          description: The project to operate in.
          required: true
          paramType: path
        - name: x
          description: X coordinate of query location.
          required: true
          type: number
          format: double
          paramType: form
        - name: y
          description: X coordinate of query location.
          required: true
          type: number
          format: double
          paramType: form
        - name: z
          description: Z coordinate of query location.
          required: true
          type: number
          format: double
          paramType: form
        - name: skeleton_id
          description: Result treenode has to be in this skeleton.
          required: false
          type: number
          paramType: form
        - name: neuron_id
          description: |
            Alternative to skeleton_id. Result treenode has to be in
            this neuron
          required: false
          type: number
          paramType: form
    """

    x = float(request.GET.get('x', 0))
    y = float(request.GET.get('y', 0))
    z = float(request.GET.get('z', 0))

    skeleton_id = request.GET.get('skeleton_id')
    if skeleton_id is not None:
        skeleton_id = int(skeleton_id)

    neuron_id = request.GET.get('neuron_id')
    if neuron_id is not None:
        neuron_id = int(neuron_id)

    if None not in (skeleton_id, neuron_id):
        raise ValueError("Only skeleton_id or neuron_id can be provided, not both")

    # Get skeleton ID, if neuron is provided
    if neuron_id:
        skeleton_id = ClassInstance.objects.get(
            cici_via_a__relation__relation_name='model_of',
            cici_via_a__class_instance_b_id=neuron_id).id

    cursor = connection.cursor()

    skeleton_filter = None
    # Separate access methods are needed to convice the Postgres planner to not
    # to distance tests to all treenodes if only a skeleton is looked at.
    if skeleton_id:
        skeleton_filter = """
            WITH skeleton_edge AS (
                SELECT te.id, te.edge
                FROM treenode_edge te

                JOIN (
                    SELECT id
                    FROM treenode t
                    WHERE skeleton_id = %(skeleton_id)s
                ) skeleton_node(id)
                ON skeleton_node.id = te.id

                WHERE project_id = %(project_id)s
            )
            SELECT id, edge
            FROM skeleton_edge
        """
    else:
        skeleton_filter = """
            SELECT id, edge
            FROM treenode_edge
            WHERE project_id = %(project_id)s
        """

    # Find the globally closest treenode among the 100 closest edges. This
    # is done that way so that an index can be used. We just assume that the
    # closest node is among the closest edge bounding box centroids (<<->>
    # operator). Use a CTE to enforce better estimates and guarantee a low
    # number of distance tests.
    cursor.execute("""
        SELECT treenode.id, skeleton_id, location_x, location_y, location_z
        FROM treenode
        JOIN (
            {skeleton_filter}
            ORDER BY edge <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s)
            LIMIT 100
        ) closest_node(id, edge)
        ON closest_node.id = treenode.id
        ORDER BY ST_StartPoint(edge) <<->> ST_MakePoint(%(x)s,%(y)s,%(z)s)
        LIMIT 1
    """.format(**{
        'skeleton_filter': skeleton_filter or '',
    }), {
        'project_id': project_id,
        'skeleton_id': skeleton_id,
        'x': x,
        'y': y,
        'z': z,
    })

    nearest_treenode = cursor.fetchone()

    if nearest_treenode is None:
        if skeleton_id:
            raise Exception('No treenodes were found for skeleton {}'.format(skeleton_id))
        raise Exception('No treenodes were found')

    return JsonResponse({
        'treenode_id': nearest_treenode[0],
        'skeleton_id': nearest_treenode[1],
        'x': nearest_treenode[2],
        'y': nearest_treenode[3],
        'z': nearest_treenode[4],
    })


def _fetch_location(project_id, location_id):
    """Get the locations of the passed in node ID in the passed in project."""
    locations = _fetch_locations(project_id, [location_id])
    if not locations:
        raise ValueError('Could not find location for node {}'.format(location_id))
    return locations[0]


def _fetch_locations(project_id, location_ids):
    """Get the locations of the passed in node IDs in the passed in project."""
    node_template = ",".join("(%s)" for _ in location_ids)
    params = list(location_ids)
    params.append(project_id)
    cursor = connection.cursor()
    cursor.execute('''
        SELECT
          l.id,
          l.location_x AS x,
          l.location_y AS y,
          l.location_z AS z
        FROM location l
        JOIN (VALUES {}) node(id)
            ON l.id = node.id
        WHERE project_id = %s
    '''.format(node_template), params)
    return cursor.fetchall()

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def get_location(request:HttpRequest, project_id=None) -> JsonResponse:
    tnid = int(request.POST['tnid'])
    return JsonResponse(_fetch_location(project_id, tnid), safe=False)

@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def get_locations(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get locations for a particular set of nodes in a project.

    A list of lists is returned. Each inner list represents one location and
    hast the following format: [id, x, y, z].
    ---
    parameters:
        - name: node_ids
          description: A list of node IDs to get the location for
          required: true
          type: array
          items:
            type: number
            format: integer
          required: true
          paramType: form
    models:
      location_element:
        id: location_element
        properties:
        - name: id
          description: ID of the node.
          type: integer
          required: true
        - name: x
          description: X coordinate of the node.
          required: true
          type: number
          format: double
          paramType: form
        - name: y
          description: Y coordinate of the node.
          required: true
          type: number
          format: double
          paramType: form
        - name: z
          description: Z coordinate of the node.
          required: true
          type: number
          format: double
          paramType: form
    type:
    - type: array
      items:
        $ref: location_element
      required: true
    """
    node_ids = get_request_list(request.POST, 'node_ids', map_fn=int)
    locations = _fetch_locations(project_id, node_ids)
    return JsonResponse(locations, safe=False)


@requires_user_role([UserRole.Browse])
def user_info(request:HttpRequest, project_id=None) -> JsonResponse:
    """Return information on a treenode or connector. This function is called
    pretty often (with every node activation) and should therefore be as fast
    as possible.
    """
    node_ids = get_request_list(request.POST, 'node_ids', map_fn=int)
    if not node_ids:
        raise ValueError('Need at least one node ID')

    node_template = ','.join('(%s)' for n in node_ids)

    cursor = connection.cursor()
    cursor.execute('''
        SELECT n.id, n.user_id, n.editor_id, n.creation_time, n.edition_time,
               array_agg(r.reviewer_id), array_agg(r.review_time)
        FROM location n
        JOIN (VALUES {}) req_node(id)
            ON n.id = req_node.id
        LEFT OUTER JOIN review r
            ON r.treenode_id = n.id
        GROUP BY n.id
    '''.format(node_template), node_ids)

    # Build result
    result = {}
    for row in cursor.fetchall():
        result[row[0]] = {
            'user': row[1],
            'editor': row[2],
            'creation_time': str(row[3].isoformat()),
            'edition_time': str(row[4].isoformat()),
            'reviewers': [r for r in row[5] if r],
            'review_times': [str(rt.isoformat()) for rt in row[6] if rt]
        }

    return JsonResponse(result)

@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def find_labels(request:HttpRequest, project_id=None) -> JsonResponse:
    """List nodes with labels matching a query, ordered by distance.

    Find nodes with labels (front-end node tags) matching a regular
    expression, sort them by ascending distance from a reference location, and
    return the result. Returns at most 50 nodes.
    ---
    parameters:
        - name: x
          description: X coordinate of the distance reference in project space.
          required: true
          type: number
          format: double
          paramType: form
        - name: y
          description: Y coordinate of the distance reference in project space.
          required: true
          type: number
          format: double
          paramType: form
        - name: z
          description: Z coordinate of the distance reference in project space.
          required: true
          type: number
          format: double
          paramType: form
        - name: label_regex
          description: Regular expression query to match labels
          required: true
          type: string
          paramType: form
    models:
      find_labels_node:
        id: find_labels_node
        properties:
        - description: ID of a node with a matching label
          type: integer
          required: true
        - description: Node location
          type: array
          items:
            type: number
            format: double
          required: true
        - description: |
            Euclidean distance from the reference location in project space
          type: number
          format: double
          required: true
        - description: Labels on this node matching the query
          type: array
          items:
            type: string
          required: true
    type:
    - type: array
      items:
        $ref: find_labels_node
      required: true
    """
    x = float(request.POST['x'])
    y = float(request.POST['y'])
    z = float(request.POST['z'])
    label_regex = str(request.POST['label_regex'])

    cursor = connection.cursor()
    cursor.execute("""
            (SELECT
                n.id,
                n.location_x,
                n.location_y,
                n.location_z,
                SQRT(POW(n.location_x - %s, 2)
                   + POW(n.location_y - %s, 2)
                   + POW(n.location_z - %s, 2)) AS dist,
                ARRAY_TO_JSON(ARRAY_AGG(l.name)) AS labels
            FROM treenode n, class_instance l, treenode_class_instance nl, relation r
            WHERE r.id = nl.relation_id
              AND r.relation_name = 'labeled_as'
              AND nl.treenode_id = n.id
              AND l.id = nl.class_instance_id
              AND n.project_id = %s
              AND l.name ~ %s
            GROUP BY n.id)

            UNION ALL

            (SELECT
                n.id,
                n.location_x,
                n.location_y,
                n.location_z,
                SQRT(POW(n.location_x - %s, 2)
                   + POW(n.location_y - %s, 2)
                   + POW(n.location_z - %s, 2)) AS dist,
                ARRAY_TO_JSON(ARRAY_AGG(l.name)) AS labels
            FROM connector n, class_instance l, connector_class_instance nl, relation r
            WHERE r.id = nl.relation_id
              AND r.relation_name = 'labeled_as'
              AND nl.connector_id = n.id
              AND l.id = nl.class_instance_id
              AND n.project_id = %s
              AND l.name ~ %s
            GROUP BY n.id)

            ORDER BY dist
            LIMIT 50
            """, (x, y, z, project_id, label_regex,
                  x, y, z, project_id, label_regex,))

    return JsonResponse([
            [row[0],
             [row[1], row[2], row[3]],
             row[4],
             row[5]] for row in cursor.fetchall()], safe=False)
