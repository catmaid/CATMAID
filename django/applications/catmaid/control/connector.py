# -*- coding: utf-8 -*-

import copy
import json
import logging

from datetime import datetime, timedelta
from collections import defaultdict

from typing import Any, DefaultDict, Dict, List, Tuple, Union

from django.db import connection
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.http import HttpRequest, HttpResponse, Http404, JsonResponse

from rest_framework.decorators import api_view

from catmaid import state
from catmaid.fields import Double3D
from catmaid.models import Project, Stack, ProjectStack, Connector, \
        ConnectorClassInstance, Treenode, TreenodeConnector, UserRole
from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.control.link import (create_treenode_links, LINK_TYPES,
        LINK_RELATION_NAMES, UNDIRECTED_LINK_TYPES)
from catmaid.control.common import (cursor_fetch_dictionary,
        get_relation_to_id_map, get_class_to_id_map, get_request_bool,
        get_request_list)


logger = logging.getLogger(__name__)


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def connector_types(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of available connector types.

    Returns a list of all available connector link types in a project. Each
    list element consists of an object with the following fields: type,
    relation, relation_id.
    """
    relation_map = get_relation_to_id_map(project_id)

    def set_id(t) -> bool:
        relation_id = relation_map.get(t['relation'])
        # If the relation doesn't exist in the database, don't return it. Add it
        # to the log though:
        if relation_id is None:
            logger.info("Tracing relation {} not found in database".format(t['relation']))
            return False
        else:
            t['relation_id'] = relation_id
            return True

    types = list(filter(set_id, copy.deepcopy(LINK_TYPES)))
    return JsonResponse(types, safe=False)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def graphedge_list(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Assumes that first element of skeletonlist is pre, and second is post """
    skeletonlist = get_request_list(request.POST, 'skeletonlist[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    edge = {} # type: Dict
    connectordata = {}

    qs_tc = TreenodeConnector.objects.filter(
        project=p,
        skeleton__in=skeletonlist ).select_related('relation', 'connector')

    for q in qs_tc:
        # Only look at synapse connectors
        if q.relation.relation_name not in ('presynaptic_to', 'postsynaptic_to'):
            continue
        if not q.connector_id in edge:
            # has to be a list, not a set, because we need matching treenode id
            edge[ q.connector_id ] = {'pre': [], 'post': [], 'pretreenode': [], 'posttreenode': []}
            connectordata[ q.connector_id ] = {
                'connector_id': q.connector_id,
                'x': q.connector.location_x,
                'y': q.connector.location_y,
                'z': q.connector.location_z,
                'user': q.connector.user.username }

        if q.relation.relation_name == 'presynaptic_to':
            edge[ q.connector_id ]['pre'].append( q.skeleton_id )
            edge[ q.connector_id ]['pretreenode'].append( q.treenode_id )
        elif q.relation.relation_name == 'postsynaptic_to':
            edge[ q.connector_id ]['post'].append( q.skeleton_id )
            edge[ q.connector_id ]['posttreenode'].append( q.treenode_id )

    result = []
    for k,v in edge.items():
        if skeletonlist[0] in v['pre'] and skeletonlist[1] in v['post']:
            connectordata[k]['pretreenode'] = v['pretreenode'][ v['pre'].index( skeletonlist[0] ) ]
            connectordata[k]['posttreenode'] = v['posttreenode'][ v['post'].index( skeletonlist[1] ) ]
            result.append(connectordata[k])

    return JsonResponse(result, safe=False)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def one_to_many_synapses(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Return the list of synapses of a specific kind between one skeleton and a list of other skeletons. """
    if 'skid' not in request.POST:
        raise ValueError("No skeleton ID for 'one' provided")
    skid = int(request.POST.get('skid'))

    skids = get_request_list(request.POST, 'skids', map_fn=int)
    if not skids:
        raise ValueError("No skeleton IDs for 'many' provided")

    relation_name = request.POST.get('relation')

    rows = _many_to_many_synapses([skid], skids, relation_name, project_id)
    return JsonResponse(rows, safe=False)


@requires_user_role(UserRole.Browse)
def many_to_many_synapses(request:HttpRequest, project_id=None) -> JsonResponse:
    """
    Return the list of synapses of a specific kind between one list of
    skeletons and a list of other skeletons.
    """
    skids1 = get_request_list(request.POST, 'skids1', map_fn=int)
    if not skids1:
        raise ValueError("No skeleton IDs for first list of 'many' provided")
    skids2 = get_request_list(request.POST, 'skids2', map_fn=int)
    if not skids2:
        raise ValueError("No skeleton IDs for second list 'many' provided")

    relation_name = request.POST.get('relation')

    rows = _many_to_many_synapses(skids1, skids2, relation_name, project_id)
    return JsonResponse(rows, safe=False)


def _many_to_many_synapses(skids1, skids2, relation_name, project_id) -> Tuple:
    """
    Return all rows that connect skeletons of one set with another set with a
    specific relation.
    """
    if relation_name not in LINK_RELATION_NAMES:
        raise Exception("Cannot accept a relation named '%s'" % relation_name)

    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, cursor=cursor)
    relation_id = relations[relation_name]
    undirected_link_ids = [relations[l] for l in UNDIRECTED_LINK_TYPES]

    cursor.execute('''
    SELECT tc1.connector_id, c.location_x, c.location_y, c.location_z,
           tc1.treenode_id, tc1.skeleton_id, tc1.confidence, tc1.user_id,
           t1.location_x, t1.location_y, t1.location_z,
           tc2.treenode_id, tc2.skeleton_id, tc2.confidence, tc2.user_id,
           t2.location_x, t2.location_y, t2.location_z
    FROM treenode_connector tc1,
         treenode_connector tc2,
         treenode t1,
         treenode t2,
         connector c
    WHERE tc1.skeleton_id = ANY(%(skeleton_ids_1)s::int[])
      AND tc1.connector_id = c.id
      AND tc2.skeleton_id = ANY(%(skeleton_ids_2)s::int[])
      AND tc1.connector_id = tc2.connector_id
      AND tc1.relation_id = %(relation_id)s
      AND (tc1.relation_id != tc2.relation_id
        OR tc1.relation_id = ANY(%(undir_rel_ids)s::int[]))
      AND tc1.id != tc2.id
      AND tc1.treenode_id = t1.id
      AND tc2.treenode_id = t2.id
    ''', {
        'skeleton_ids_1': skids1,
        'skeleton_ids_2': skids2,
        'relation_id': relation_id,
        'undir_rel_ids': undirected_link_ids,
    })

    return tuple((row[0], (row[1], row[2], row[3]),
                  row[4], row[5], row[6], row[7],
                  (row[8], row[9], row[10]),
                  row[11], row[12], row[13], row[14],
                  (row[15], row[16], row[17])) for row in cursor.fetchall())

@api_view(['POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_connectors(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get a collection of connectors.

    The `connectors` field of the returned object contains a list of all result
    nodes, each represented as a list of the form:

    `[id, x, y, z, confidence, creator_id, editor_id, creation_time, edition_time]`

    Both edition time and creation time are returned as UTC epoch values. If
    tags are requested, the `tags` field of the response object will contain a
    mapping of connector IDs versus tag lists. If partners are requested, the
    `partners` field of the response object will contain a mapping of connector
    IDs versus lists of partner links. Each partner link is an array of the
    following format:

    `[link_id, treenode_id, skeleton_id, relation_id, confidence]`

    If both `skeleton_ids` and `relation_type` are used, the linked skeletons
    need to be linked by the specified relation. Without `relation_type`,
    linked skeletons can have any relation and without `skeleton_ids` a
    connector needs to have a least one link with the specified relation.
    ---
    parameters:
      - name: project_id
        description: Project of connectors
        type: integer
        paramType: path
        required: true
      - name: skeleton_ids
        description: Skeletons linked to connectors
        type: array
        items:
          type: integer
        paramType: form
        required: false
      - name: tags
        description: Require a set of tags
        type: array
        items:
          type: string
        paramType: form
        required: false
      - name: relation_type
        description: Relation of linked skeletons to connector.
        type: string
        paramType: form
        required: false
      - name: with_tags
        description: If connector tags should be fetched
        type: boolean
        paramType: form
        defaultValue: true
        required: false
      - name: with_partners
        description: If partner node and link information should be fetched
        type: boolean
        paramType: form
        defaultValue: false
        required: false
    type:
      connectors:
        type: array
        items:
          type: array
          items:
            type: string
        description: Matching connector links
        required: true
      tags:
         type array
      partners:
         type array
    """
    project_id = int(project_id)
    skeleton_ids = get_request_list(request.POST, 'skeleton_ids', map_fn=int)
    tags = get_request_list(request.POST, 'tags')
    relation_type = request.POST.get('relation_type')
    with_tags = get_request_bool(request.POST, 'with_tags', True)
    with_partners = get_request_bool(request.POST, 'with_partners', False)

    cursor = connection.cursor()
    class_map = get_class_to_id_map(project_id, cursor=cursor)
    relation_map = get_relation_to_id_map(project_id, cursor=cursor)

    if relation_type:
        relation_id = relation_map.get(relation_type)
        if not relation_id:
            raise ValueError("Unknown relation: " + relation_type)

    # Query connectors
    constraints = []
    params = [] # type: List

    if skeleton_ids:
        sk_template = ",".join("(%s)" for _ in skeleton_ids)
        constraints.append('''
            JOIN treenode_connector tc
                ON tc.connector_id = c.id
            JOIN (VALUES {}) q_skeleton(id)
                ON tc.skeleton_id = q_skeleton.id
        '''.format(sk_template))
        params.extend(skeleton_ids)
        if relation_type:
            constraints.append('''
                AND tc.relation_id = %s
            ''')
            params.append(relation_id)
    elif relation_type:
        constraints.append('''
            JOIN treenode_connector tc
                ON tc.connector_id = c.id
                AND tc.relation_id = %s
        ''')
        params.append(relation_id)

    if tags:
        tag_template = ",".join("%s" for _ in tags)
        constraints.append('''
            JOIN connector_class_instance cci
                ON cci.connector_id = c.id
            JOIN class_instance label
                ON label.id = class_instance_id
                AND cci.relation_id = %s
            JOIN (
                SELECT id
                FROM class_instance
                WHERE name IN ({})
                    AND project_id = %s
                    AND class_id = %s
            ) q_label(id) ON label.id = q_label.id
        '''.format(tag_template))
        params.append(relation_map['labeled_as'])
        params.extend(tags)
        params.append(project_id)
        params.append(class_map['label'])

    query = '''
        SELECT DISTINCT c.id, c.location_x, c.location_y, c.location_z, c.confidence,
            c.user_id, c.editor_id, EXTRACT(EPOCH FROM c.creation_time),
            EXTRACT(EPOCH FROM c.edition_time)
        FROM connector c
        {}
        WHERE c.project_id = %s
        ORDER BY c.id
    '''.format('\n'.join(constraints))
    params.append(project_id)

    cursor.execute(query, params)

    connectors = cursor.fetchall()

    connector_ids = [c[0] for c in connectors]
    tags = defaultdict(list)
    if connector_ids and with_tags:
        c_template = ",".join("(%s)" for _ in connector_ids)
        cursor.execute('''
            SELECT cci.connector_id, ci.name
            FROM connector_class_instance cci
            JOIN (VALUES {}) q_connector(id)
                ON cci.connector_id = q_connector.id
            JOIN (VALUES (%s)) q_relation(id)
                ON cci.relation_id = q_relation.id
            JOIN class_instance ci
                ON cci.class_instance_id = ci.id
        '''.format(c_template), connector_ids + [relation_map['labeled_as']])

        for row in cursor.fetchall():
            tags[row[0]].append(row[1])

        # Sort labels by name
        for connector_id, labels in tags.items():
            labels.sort(key=lambda k: k.upper())

    partners = defaultdict(list) # type: DefaultDict[Any, List]
    if connector_ids and with_partners:
        c_template = ",".join("(%s)" for _ in connector_ids)
        cursor.execute('''
            SELECT tc.connector_id, tc.id, tc.treenode_id, tc.skeleton_id,
                tc.relation_id, tc.confidence, tc.user_id,
                EXTRACT(EPOCH FROM tc.creation_time),
                EXTRACT(EPOCH FROM tc.edition_time)
            FROM treenode_connector tc
            JOIN (VALUES {}) c(id)
                ON tc.connector_id = c.id
        '''.format(c_template), connector_ids)

        for row in cursor.fetchall():
            partners[row[0]].append(row[1:])

    return JsonResponse({
        "connectors": connectors,
        "tags": tags,
        "partners": partners
    }, safe=False)

@api_view(['GET', 'POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_connector_links(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get connectors linked to a set of skeletons.

    The result data set includes information about linked connectors on a given
    input set of skeletons. These links are further constrained by relation
    type, with currently support available for: postsynaptic_to,
    presynaptic_to, abutting, gapjunction_with, tightjunction_with,
    desmosome_with.

    Returned is an object containing an array of links to connectors and a set
    of tags for all connectors found (if not disabled). The link array contains
    one array per connector link with the following content: [Linked skeleton ID,
    Connector ID, Connector X, Connector Y, Connector Z, Link confidence, Link
    creator ID, Linked treenode ID, Link edit time].

    A POST handler is able to accept large lists of skeleton IDs.
    ---
    parameters:
      - name: skeleton_ids
        description: Skeletons to list connectors for
        type: array
        items:
          type: integer
        paramType: form
        required: true
      - name: relation_type
        description: Relation of listed connector links
        type: string
        paramType: form
        required: true
      - name: with_tags
        description: If connector tags should be fetched
        type: boolean
        paramType: form
        defaultValue: true
        required: false
    type:
      links:
        type: array
        items:
          type: array
          items:
            type: string
        description: Matching connector links
        required: true
      tags:
         type array
    """
    data = request.POST if request.method == 'POST' else request.GET
    skeleton_ids = get_request_list(data, 'skeleton_ids', map_fn=int)

    if not skeleton_ids:
        raise ValueError("At least one skeleton ID required")

    relation_type = data.get('relation_type', 'presynaptic_to')
    with_tags = get_request_bool(data, 'with_tags', True)

    cursor = connection.cursor()
    relation_map = get_relation_to_id_map(project_id, cursor=cursor)
    relation_id = relation_map.get(relation_type)
    if not relation_id:
        raise ValueError("Unknown relation: " + relation_type)
    sk_template = ",".join(("(%s)",) * len(skeleton_ids))

    cursor.execute('''
        SELECT tc.skeleton_id, c.id, c.location_x, c.location_y, c.location_z,
              tc.confidence, tc.user_id, tc.treenode_id, tc.creation_time,
              tc.edition_time
        FROM treenode_connector tc
        JOIN (VALUES {}) q_skeleton(id)
            ON tc.skeleton_id = q_skeleton.id
        JOIN (VALUES (%s)) q_relation(id)
            ON tc.relation_id = q_relation.id
        JOIN connector c
            ON tc.connector_id = c.id
    '''.format(sk_template), skeleton_ids + [relation_id])

    links = []
    for row in cursor.fetchall():
        l = list(row)
        l[8] = l[8].isoformat()
        l[9] = l[9].isoformat()
        links.append(l)

    connector_ids = [l[1] for l in links]
    tags = defaultdict(list) # type: DefaultDict[Any, List]
    if connector_ids and with_tags:
        c_template = ",".join(("(%s)",) * len(connector_ids))
        cursor.execute('''
            SELECT cci.connector_id, ci.name
            FROM connector_class_instance cci
            JOIN (VALUES {}) q_connector(id)
                ON cci.connector_id = q_connector.id
            JOIN (VALUES (%s)) q_relation(id)
                ON cci.relation_id = q_relation.id
            JOIN class_instance ci
                ON cci.class_instance_id = ci.id
        '''.format(c_template), connector_ids + [relation_map['labeled_as']])

        for row in cursor.fetchall():
            tags[row[0]].append(row[1])

        # Sort labels by name
        for connector_id, labels in tags.items():
            labels.sort(key=lambda k: k.upper())

    return JsonResponse({
        "links": links,
        "tags": tags
    }, safe=False)

def _connector_skeletons(connector_ids, project_id) -> Dict:
    """Return a dictionary of connector ID as keys and a dictionary as value
    containing two entries: 'presynaptic_to' with a skeleton ID or None,
    and 'postsynaptic_to' with a list of skeleton IDs (maybe empty).
    """
    if not connector_ids:
        raise ValueError('No connector IDs provided')

    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    PRE = relations['presynaptic_to']
    POST = relations['postsynaptic_to']

    cursor.execute('''
    SELECT connector_id, relation_id, skeleton_id, treenode_id
    FROM treenode_connector
    WHERE connector_id IN (%s)
      AND (relation_id = %s OR relation_id = %s)
    ''' % (",".join(map(str, connector_ids)), PRE, POST))

    cs = {} # type: Dict
    for row in cursor.fetchall():
        c = cs.get(row[0])
        if not c:
            # Ensure each connector has the two entries at their minimum
            c = {'presynaptic_to': None, 'postsynaptic_to': [],
                 'presynaptic_to_node': None, 'postsynaptic_to_node': []}
            cs[row[0]] = c
        if POST == row[1]:
            c['postsynaptic_to'].append(row[2])
            c['postsynaptic_to_node'].append(row[3])
        elif PRE == row[1]:
            c['presynaptic_to'] = row[2]
            c['presynaptic_to_node'] = row[3]

    return cs

@requires_user_role([UserRole.Browse, UserRole.Annotate])
def connector_skeletons(request:HttpRequest, project_id=None) -> JsonResponse:
    """ See _connector_skeletons """
    connector_ids = get_request_list(request.POST, 'connector_ids', map_fn=int)
    cs = tuple(_connector_skeletons(connector_ids, project_id).items())
    return JsonResponse(cs, safe=False)


def _connector_associated_edgetimes(connector_ids, project_id) -> Dict:
    """ Return a dictionary of connector ID as keys and a dictionary as value
    containing two entries: 'presynaptic_to' with a skeleton ID of None,
    and 'postsynaptic_to' with a list of skeleton IDs (maybe empty) including
    the timestamp of the edge. """
    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    PRE = relations['presynaptic_to']
    POST = relations['postsynaptic_to']

    cursor.execute('''
    SELECT connector_id, relation_id, skeleton_id, treenode_id, creation_time
    FROM treenode_connector
    WHERE connector_id = ANY(%(connector_ids)s::bigint[])
      AND (relation_id = %(pre_id)s OR relation_id = %(post_id)s)
    ''', { 
        'connector_ids': connector_ids,
        'pre_id': PRE,
        'post_id': POST,
    })

    cs = {} # type: Dict
    for row in cursor.fetchall():
        c = cs.get(row[0])
        if not c:
            # Ensure each connector has the two entries at their minimum
            c = {'presynaptic_to': None, 'postsynaptic_to': []}
            cs[row[0]] = c
        if POST == row[1]:
            c['postsynaptic_to'].append( (row[2], row[3], row[4]) )
        elif PRE == row[1]:
            c['presynaptic_to'] = (row[2], row[3], row[4])

    return cs

@requires_user_role([UserRole.Browse, UserRole.Annotate])
def connector_associated_edgetimes(request:HttpRequest, project_id=None) -> JsonResponse:
    """ See _connector_associated_edgetimes """
    connector_ids = get_request_list(request.POST, 'connector_ids', map_fn=int)

    def default(obj):
        """Default JSON serializer."""
        import calendar, datetime

        if isinstance(obj, datetime.datetime):
            if obj.utcoffset() is not None: # type: ignore
                obj = obj - obj.utcoffset() # type: ignore
            millis = int(
                calendar.timegm(obj.timetuple()) * 1000 +
                obj.microsecond / 1000
            )
        return millis

    return JsonResponse(_connector_associated_edgetimes(connector_ids,
        project_id), safe=False, json_dumps_params={'default': default})

@requires_user_role(UserRole.Annotate)
def create_connector(request:HttpRequest, project_id=None) -> JsonResponse:
    query_parameters = {}
    default_values = {'x': 0, 'y': 0, 'z': 0, 'confidence': 5}
    for p in default_values.keys():
        query_parameters[p] = request.POST.get(p, default_values[p])

    project_id = int(project_id)

    parsed_confidence = int(query_parameters['confidence'])
    if parsed_confidence < 1 or parsed_confidence > 5:
        return JsonResponse({'error': 'Confidence not in range 1-5 inclusive.'})

    cursor = connection.cursor()

    # Get optional initial links to connectors, expect each entry to be a list
    # of connector ID, relation ID and confidence.
    links = get_request_list(request.POST, 'links', [], map_fn=int)

    new_connector = Connector(
        user=request.user,
        editor=request.user,
        project=Project.objects.get(id=project_id),
        location_x=float(query_parameters['x']),
        location_y=float(query_parameters['y']),
        location_z=float(query_parameters['z']),
        confidence=parsed_confidence)
    new_connector.save()

    # Create all initial links
    if links:
        created_links = create_treenode_links(project_id, request.user.id,
                new_connector.id, links, cursor)
    else:
        created_links = []

    return JsonResponse({
        'connector_id': new_connector.id,
        'connector_edition_time': new_connector.edition_time,
        'created_links': created_links
    })


@requires_user_role(UserRole.Annotate)
def delete_connector(request:HttpRequest, project_id=None) -> JsonResponse:
    connector_id = int(request.POST.get("connector_id", 0))
    can_edit_or_fail(request.user, connector_id, 'connector')

    # Check provided state
    cursor = connection.cursor()
    state.validate_state(connector_id, request.POST.get('state'),
            node=True, c_links=True, lock=True, cursor=cursor)

    # Get connector and partner information
    connectors = list(Connector.objects.filter(id=connector_id).prefetch_related(
            'treenodeconnector_set', 'treenodeconnector_set__relation'))
    if 1 != len(connectors):
        raise ValueError("Couldn't find exactly one connector with ID #" +
                str(connector_id))
    connector = connectors[0]
    # TODO: Check how many queries here are generated
    partners = [{
        'id': p.treenode_id,
        'edition_time': p.treenode.edition_time,
        'rel': p.relation.relation_name,
        'rel_id': p.relation.id,
        'confidence': p.confidence,
        'link_id': p.id
    } for p in connector.treenodeconnector_set.all()]
    connector.delete()
    return JsonResponse({
        'message': 'Removed connector and class_instances',
        'connector_id': connector_id,
        'confidence': connector.confidence,
        'x': connector.location_x,
        'y': connector.location_y,
        'z': connector.location_z,
        'partners': partners
    })


@requires_user_role(UserRole.Browse)
def list_completed(request:HttpRequest, project_id) -> JsonResponse:
    completed_by = request.GET.get('completed_by', None)
    from_date = request.GET.get('from', None)
    to_date = request.GET.get('to', None)

    # Sanitize
    if completed_by:
        completed_by = int(completed_by)
    if from_date:
        from_date = datetime.strptime(from_date, '%Y%m%d')
    if to_date:
        to_date = datetime.strptime(to_date, '%Y%m%d')

    response = _list_completed(project_id, completed_by, from_date, to_date)
    return JsonResponse(response, safe=False)


def _list_completed(project_id, completed_by=None, from_date=None, to_date=None) -> Tuple:
    """ Get a list of connector links that can be optionally constrained to be
    completed by a certain user in a given time frame. The returned connector
    links are by default only constrained by both sides having different
    relations and the first link was created before the second one.
    """
    cursor = connection.cursor()

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)
    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    params = [project_id, pre, post, pre, post]
    query = '''
        SELECT tc2.connector_id, c.location_x, c.location_y, c.location_z,
            tc2.treenode_id, tc2.skeleton_id, tc2.confidence, tc2.user_id,
            t2.location_x, t2.location_y, t2.location_z,
            tc1.treenode_id, tc1.skeleton_id, tc1.confidence, tc1.user_id,
            t1.location_x, t1.location_y, t1.location_z
        FROM treenode_connector tc1
        JOIN treenode_connector tc2 ON tc1.connector_id = tc2.connector_id
        JOIN connector c ON tc1.connector_id = c.id
        JOIN treenode t1 ON t1.id = tc1.treenode_id
        JOIN treenode t2 ON t2.id = tc2.treenode_id
        WHERE t1.project_id=%s
        AND tc1.relation_id <> tc2.relation_id
        AND tc1.creation_time > tc2.creation_time
        AND (tc1.relation_id = %s OR tc1.relation_id = %s)
        AND (tc2.relation_id = %s OR tc2.relation_id = %s)'''

    if completed_by:
        params.append(completed_by)
        query += " AND tc1.user_id=%s"
    if from_date:
        params.append(from_date.isoformat())
        query += " AND tc1.creation_time >= %s"
    if to_date:
        to_date =  to_date + timedelta(days=1)
        params.append(to_date.isoformat())
        query += " AND tc1.creation_time < %s"

    cursor.execute(query, params)

    return tuple((row[0], (row[1], row[2], row[3]),
                  row[4], row[5], row[6], row[7],
                  (row[8], row[9], row[10]),
                  row[11], row[12], row[13], row[14],
                  (row[15], row[16], row[17])) for row in cursor.fetchall())


@requires_user_role(UserRole.Browse)
def connectors_info(request:HttpRequest, project_id) -> JsonResponse:
    """
    Given a list of connectors, a list of presynaptic skeletons and a list of
    postsynatic skeletons, return a list of rows, one per synaptic connection,
    in the same format as one_to_many_synapses. The list of connectors (cids),
    pre-skeletons (pre) and post-skeletons (post) is optional.
    """

    cids = get_request_list(request.POST, 'cids', map_fn=int)
    skids = get_request_list(request.POST, 'skids', map_fn=int)
    skids_pre = get_request_list(request.POST, 'pre', map_fn=int)
    skids_post = get_request_list(request.POST, 'post', map_fn=int)

    cursor = connection.cursor()

    if skids_pre or skids_post:
        if skids:
            raise ValueError("The skids parameter can't be used together with "
                    "pre and/or post.")

    relations = get_relation_to_id_map(project_id, ('presynaptic_to', 'postsynaptic_to'), cursor)

    # Construct base query
    query_parts = ['''
        SELECT DISTINCT
               tc1.connector_id, c.location_x, c.location_y, c.location_z,
               tc1.treenode_id, tc1.skeleton_id, tc1.confidence, tc1.user_id,
               t1.location_x, t1.location_y, t1.location_z,
               tc2.treenode_id, tc2.skeleton_id, tc2.confidence, tc2.user_id,
               t2.location_x, t2.location_y, t2.location_z
        FROM connector c
    ''']

    query_params = [] # type: List

    # Add connector filter, if requested
    if cids:
        cid_template = ",".join(("(%s)",) * len(cids))
        query_parts.append('''
            JOIN (VALUES {}) rc(id) ON c.id = rc.id
        '''.format(cid_template))
        query_params.extend(cids)

    # Get first partner of connection
    query_parts.append('''
        JOIN treenode_connector tc1 ON tc1.connector_id = c.id
        JOIN treenode t1 ON tc1.treenode_id = t1.id
    ''')

    # Add pre-synaptic skeleton filter, if requested
    if skids_pre:
        pre_skid_template = ",".join(("(%s)",) * len(skids_pre))
        query_parts.append('''
            JOIN (VALUES {}) sk_pre(id) ON tc1.skeleton_id = sk_pre.id
        '''.format(pre_skid_template))
        query_params.extend(skids_pre)

    # Get second partner of connection
    query_parts.append('''
        JOIN treenode_connector tc2 ON tc2.connector_id = c.id
        JOIN treenode t2 ON tc2.treenode_id = t2.id
    ''')

    # Add post-synaptic skeleton filter, if requested
    if skids_post:
        post_skid_template = ",".join(("(%s)",) * len(skids_post))
        query_parts.append('''
            JOIN (VALUES {}) sk_post(id) ON tc2.skeleton_id = sk_post.id
        '''.format(post_skid_template))
        query_params.extend(skids_post)

    # Add generic skeleton filters
    if skids:
        skid_template = ",".join(("(%s)",) * len(skids))
        query_parts.append('''
            JOIN (VALUES {}) sk(id) ON tc1.skeleton_id = sk.id OR tc2.skeleton_id = sk.id
        '''.format(skid_template))
        query_params.extend(skids)

    # Prevent self-joins of connector partners
    query_parts.append('''
        WHERE tc1.id != tc2.id
    ''')

    # The result is expected to be stictly pre-synaptic and post-synaptic at the
    # moment.
    query_parts.append('''
        AND tc1.relation_id = %s
        AND tc2.relation_id = %s
    ''')
    query_params.append(relations['presynaptic_to'])
    query_params.append(relations['postsynaptic_to'])

    if skids:
        query_parts.append('''
            AND tc1.treenode_id < tc2.treenode_id
        ''')

    query_parts.append('''
        ORDER BY tc2.skeleton_id
    ''')

    cursor.execute("\n".join(query_parts), query_params)

    rows = tuple((row[0], (row[1], row[2], row[3]),
                  row[4], row[5], row[6], row[7],
                  (row[8], row[9], row[10]),
                  row[11], row[12], row[13], row[14],
                  (row[15], row[16], row[17])) for row in cursor.fetchall())

    return JsonResponse(rows, safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def connector_user_info(request:HttpRequest, project_id) -> JsonResponse:
    """ Return information on a treenode connector edge.

    Returns a JSON array with elements representing information on the matched
    links. They have the following form:

      { "user": ..., "creaetion_time": ..., "edition_time": ... }

    Developer node: This function is called often (every connector mouseover)
    and should therefore be as fast as possible. Analogous to user_info for
    treenodes and connectors.
    ---
    parameters:
      - name: project_id
        description: Project of connectors
        type: array
        items:
          type: integer
        paramType: form
        required: true
      - name: treenode_id
        description: The treenode, the connector is linked to
        type: integer
        paramType: form
        required: true
      - name: connector_id
        description: The connector, the treenode is linked to
        type: integer
        paramType: form
        defaultValue: true
        required: true
      - name: relation_id
        description: The relation ID of the link, can be used instead of relation_name
        type: integer
        paramType: form
        required: false
      - name: relation_name
        description: The relation name of the link, can be used instead of relation_id
        type: string
        paramType: form
        required: false
    """
    treenode_id = int(request.GET.get('treenode_id'))
    connector_id = int(request.GET.get('connector_id'))
    relation_id = request.GET.get('relation_id')
    cursor = connection.cursor()
    if relation_id == None:
        relations = get_relation_to_id_map(project_id, LINK_RELATION_NAMES, cursor)
        relation_id = relations[request.GET.get('relation_name')]
    else:
        relation_id = int(relation_id)

    cursor.execute('''
        SELECT tc.id, tc.user_id, tc.creation_time, tc.edition_time
        FROM treenode_connector tc
        WHERE tc.treenode_id = %s
          AND tc.connector_id = %s
          AND tc.relation_id = %s
    ''', (treenode_id, connector_id, relation_id))

    # We expect at least one result node.
    if not cursor.rowcount:
        return JsonResponse({
            'error': 'No treenode connector exists for treenode %s, connector %s, relation %s' %
            (treenode_id, connector_id, relation_id)})

    # Build result. Because there is no uniqueness restriction on treenode
    # connector edges, even with the same relation, the response must handle
    # multiple rows.
    return JsonResponse([{
        'user': info[1],
        'creation_time': str(info[2].isoformat()),
        'edition_time': str(info[3].isoformat()),
    } for info in cursor.fetchall()], safe=False)

@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def connector_detail(request:HttpRequest, project_id, connector_id:Union[str,int]) -> JsonResponse:
    """Get detailed information on a connector and its partners
    ---
    models:
      connector_partner_element:
        id: connector_partner_element
        properties:
          link_id:
            type: integer
            description: ID of link between connector and partner
            required: true
          partner_id:
            type: integer
            description: ID of partner
            required: true
          confidence:
            type: integer
            description: Confidence of connection between connector and partner
            required: true
          skeleton_id:
            type: integer
            description: ID of partner skeleton
            required: true
          relation_id:
            type: integer
            description: ID of relation between connector and partner
            required: true
          relation_name:
            type: integer
            description: Name of relation between connector and partner
            required: true
    type:
      connector_id:
        type: integer
        description: ID of connector
        required: true
      x:
        type: number
        description: X coordinate of connector location
        required: true
      y:
        type: number
        description: Y coordinate of connector location
        required: true
      z:
        type: number
        description: Z coordinate of connector location
        required: true
      confidence:
        type: integer
        description: Integer in range 1-5 with 1 being most confident
        required: true
      partners:
        type: array
        description: Partners of this connector
        items:
          $ref: connector_partner_element
    """
    connector_id = int(connector_id)
    cursor = connection.cursor()
    cursor.execute("""
        SELECT c.id, c.location_x, c.location_y, c.location_z, c.confidence,
               json_agg(json_build_object(
                    'link_id', tc.id,
                    'partner_id', tc.treenode_id,
                    'confidence', tc.confidence,
                    'skeleton_id', tc.skeleton_id,
                    'relation_id', tc.relation_id,
                    'relation_name', r.relation_name)) AS partners
        FROM connector c, treenode_connector tc, relation r
        WHERE c.id = %s AND c.id = tc.connector_id AND r.id = tc.relation_id
        GROUP BY c.id
    """, (connector_id, ))
    detail = cursor.fetchone()

    if not detail:
        raise Http404("Connector does not exist: " + str(connector_id))

    return JsonResponse({
        'connector_id': detail[0],
        'x': detail[1],
        'y': detail[2],
        'z': detail[3],
        'confidence': detail[4],
        'partners': [p for p in detail[5]]
    })

def get_connectors_in_bb_postgis3d(params) -> List:
    """Return a list of connector node IDs in a bounding box.
    """
    limit = int(params.get('limit', 0))
    with_locations = params.get('with_locations', False)
    with_links = params.get('with_links', False)
    skeleton_ids = params.get('skeleton_ids', False)

    extra_joins = []
    if skeleton_ids:
        extra_joins.append("""
            JOIN (
                SELECT DISTiNCT tc2.connector_id
                FROM treenode_connector tc2
                JOIN UNNEST(%(skeleton_ids)s::int[]) skeleton(id)
                    ON tc2.skeleton_id = skeleton.id
            ) allowed_connector(id)
                ON allowed_connector.id = c.id
        """)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT {distinct} c.id
            {location_select}
            {link_select}
        FROM treenode_connector_edge tce
        JOIN treenode_connector tc
            ON tce.id = tc.id
        JOIN connector c
            ON c.id = tc.connector_id
        {extra_joins}
        WHERE tce.edge &&& ST_MakeLine(ARRAY[
            ST_MakePoint(%(minx)s, %(maxy)s, %(maxz)s),
            ST_MakePoint(%(maxx)s, %(miny)s, %(minz)s)] ::geometry[])
        AND ST_3DDWithin(tce.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
            ST_MakePoint(%(minx)s, %(miny)s, %(halfz)s),
            ST_MakePoint(%(maxx)s, %(miny)s, %(halfz)s),
            ST_MakePoint(%(maxx)s, %(maxy)s, %(halfz)s),
            ST_MakePoint(%(minx)s, %(maxy)s, %(halfz)s),
            ST_MakePoint(%(minx)s, %(miny)s, %(halfz)s)]::geometry[])),
            %(halfzdiff)s)
        AND tce.project_id = %(project_id)s
        {limit_clause}
    """.format(**{
        'distinct': 'DISTINCT' if not with_links else '',
        'limit_clause': 'LIMIT {}'.format(limit) \
                if limit > 0 else '',
        'location_select': ', c.location_x, c.location_y, c.location_z' \
                if with_locations else '',
        'link_select': ', tc.skeleton_id, tc.confidence, tc.user_id, ' \
                'tc.treenode_id, tc.creation_time, tc.edition_time, ' \
                'tc.relation_id' \
                if with_links else '',
        'extra_joins': '\n'.join(extra_joins),
    }), params)

    return list(cursor.fetchall())


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def connectors_in_bounding_box(request:HttpRequest, project_id:Union[int,str]) -> JsonResponse:
    """Get a list of all connector nodes that intersect with the passed in
    bounding box.
    ---
    parameters:
    - name: limit
      description: |
        Limit the number of returned nodes.
      required: false
      type: integer
      defaultValue: 0
      paramType: form
    - name: minx
      description: |
        Minimum world space X coordinate
      required: true
      type: float
      paramType: form
    - name: miny
      description: |
        Minimum world space Y coordinate
      required: true
      type: float
      paramType: form
    - name: minz
      description: |
        Minimum world space Z coordinate
      required: true
      type: float
      paramType: form
    - name: maxx
      description: |
        Maximum world space X coordinate
      required: true
      type: float
      paramType: form
    - name: maxy
      description: |
        Maximum world space Y coordinate
      required: true
      type: float
      paramType: form
    - name: maxz
      description: |
        Maximum world space Z coordinate
      required: true
      type: float
      paramType: form
    - name: with_locations
      description: |
        Whether to return the location of each connector.
      required: true
      type: float
      paramType: form
    - name: with_links
      description: |
        Whether to return every individual link
      required: true
      type: float
      paramType: form
    - name: skeleton_ids
      description: Skeletons linked to connectors
      type: array
      items:
        type: integer
      paramType: form
      required: false
    type:
        - type: array
          items:
          type: integer
          description: array of skeleton IDs or links
          required: true
    """
    project_id = int(project_id)
    data = request.GET if request.method == 'GET' else request.POST

    params = {
        'project_id': project_id,
        'limit': data.get('limit', 0),
        'with_locations': data.get('with_locations', False),
        'with_links': data.get('with_links', False),
    }
    for p in ('minx', 'miny', 'minz', 'maxx', 'maxy', 'maxz'):
        params[p] = float(data.get(p, 0))
    params['halfzdiff'] = abs(params['maxz'] - params['minz']) * 0.5
    params['halfz'] = params['minz'] + (params['maxz'] - params['minz']) * 0.5

    skeleton_ids = get_request_list(data, 'skeleton_ids', map_fn=int)
    if skeleton_ids:
        params['skeleton_ids'] = skeleton_ids

    connector_ids = get_connectors_in_bb_postgis3d(params)
    return JsonResponse(connector_ids, safe=False)
