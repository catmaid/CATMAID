# -*- coding: utf-8 -*-

import csv
import json
import networkx as nx
import pytz
import re

from datetime import datetime, timedelta
from collections import defaultdict
from itertools import chain

from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest, Http404, \
        JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.db import connection
from django.db.models import Q
from django.views.decorators.cache import never_cache

from rest_framework.decorators import api_view

from catmaid.models import (Project, UserRole, Class, ClassInstance, Review,
        ClassInstanceClassInstance, Relation, Sampler, Treenode,
        TreenodeConnector, SamplerDomain, SkeletonSummary, SamplerDomainEnd,
        SamplerInterval, SamplerDomainType)
from catmaid.objects import Skeleton, SkeletonGroup, \
        compartmentalize_skeletongroup_by_edgecount, \
        compartmentalize_skeletongroup_by_confidence
from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail, can_edit_or_fail, can_edit_all_or_fail
from catmaid.control.common import (insert_into_log, get_class_to_id_map,
        get_relation_to_id_map, _create_relation, get_request_bool,
        get_request_list, Echo)
from catmaid.control.link import LINK_TYPES
from catmaid.control.neuron import _delete_if_empty
from catmaid.control.annotation import (annotations_for_skeleton,
        create_annotation_query, _annotate_entities, _update_neuron_annotations)
from catmaid.control.review import get_review_status
from catmaid.control.tree_util import find_root, reroot, edge_count_to_root
from catmaid.control.volume import get_volume_details


def get_skeleton_permissions(request:HttpRequest, project_id, skeleton_id) -> JsonResponse:
    """ Tests editing permissions of a user on a skeleton and returns the
    result as JSON object."""
    try:
        nn = _get_neuronname_from_skeletonid( project_id, skeleton_id )
        can_edit = can_edit_class_instance_or_fail(request.user,
                nn['neuronid'])
    except:
        can_edit = False

    permissions = {
      'can_edit': can_edit,
    }

    return JsonResponse(permissions)


@api_view(['POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def open_leaves(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    """List open leaf nodes in a skeleton.

    Return a list of the ID and location of open leaf nodes in a skeleton,
    their path length distance to the specified treenode, and their creation
    time.

    Leaves are considered open if they are not tagged with a tag matching
    a particular regex.

    .. note:: This endpoint is used interactively by the client so performance
              is critical.
    ---
    parameters:
        - name: treenode_id
          description: ID of the origin treenode for path length distances
          required: true
          type: integer
          paramType: form
    models:
      open_leaf_node:
        id: open_leaf_node
        properties:
        - description: ID of an open leaf treenode
          type: integer
          required: true
        - description: Node location
          type: array
          items:
            type: number
            format: double
          required: true
        - description: Distance from the query node
          type: number
          format: double
          required: true
        - description: Node creation time
          type: string
          format: date-time
          required: true
    type:
    - type: array
      items:
        $ref: open_leaf_node
      required: true
    """
    tnid = int(request.POST['treenode_id'])
    cursor = connection.cursor()

    cursor.execute("""
        SELECT id
        FROM relation
        WHERE project_id = %s
        AND relation_name='labeled_as'
        """, (int(project_id),))
    labeled_as = cursor.fetchone()[0]

    # Select all nodes and their tags
    cursor.execute('''
        SELECT t.id, t.parent_id
        FROM treenode t
        WHERE t.skeleton_id = %s
        ''', (int(skeleton_id),))

    # Some entries repeated, when a node has more than one tag
    # Create a graph with edges from parent to child, and accumulate parents
    tree = nx.DiGraph()
    for row in cursor.fetchall():
        node_id = row[0]
        if row[1]:
            # It is ok to add edges that already exist: DiGraph doesn't keep duplicates
            tree.add_edge(row[1], node_id)
        else:
            tree.add_node(node_id)

    if tnid not in tree:
        raise Exception("Could not find %s in skeleton %s" % (tnid, int(skeleton_id)))

    reroot(tree, tnid)
    distances = edge_count_to_root(tree, root_node=tnid)
    leaves = set()

    for node_id, out_degree in tree.out_degree_iter():
        if 0 == out_degree or node_id == tnid and 1 == out_degree:
            # Found an end node
            leaves.add(node_id)

    # Select all nodes and their tags
    cursor.execute('''
        SELECT t.id, t.location_x, t.location_y, t.location_z, t.creation_time, array_agg(ci.name)
        FROM treenode t
        JOIN UNNEST(%s::bigint[]) AS leaves (tnid)
          ON t.id = leaves.tnid
        LEFT OUTER JOIN (
            treenode_class_instance tci
            INNER JOIN class_instance ci
              ON tci.class_instance_id = ci.id
                AND tci.relation_id = %s)
          ON t.id = tci.treenode_id
        GROUP BY t.id
        ''', (list(leaves), labeled_as))

    # Iterate end nodes to find which are open.
    nearest = []
    end_tags = ['uncertain continuation', 'not a branch', 'soma',
                r'^(?i)(really|uncertain|anterior|posterior)?\s?ends?$']
    end_regex = re.compile('(?:' + ')|(?:'.join(end_tags) + ')')

    for row in cursor.fetchall():
        node_id = row[0]
        tags = row[5]
        # Check if not tagged with a tag containing 'end'
        if tags == [None] or not any(end_regex.match(s) for s in tags):
            # Found an open end
            d = distances[node_id]
            nearest.append([node_id, (row[1], row[2], row[3]), d, row[4]])

    return JsonResponse(nearest, safe=False)


@api_view(['POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def find_labels(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    """List nodes in a skeleton with labels matching a query.

    Find all nodes in this skeleton with labels (front-end node tags) matching
    a regular expression, sort them by ascending path distance from a treenode
    in the skeleton, and return the result.
    ---
    parameters:
        - name: treenode_id
          description: ID of the origin treenode for path length distances
          required: true
          type: integer
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
        - description: Path distance from the origin treenode
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
    tnid = int(request.POST['treenode_id'])
    label_regex = str(request.POST['label_regex'])
    cursor = connection.cursor()

    cursor.execute("SELECT id FROM relation WHERE project_id=%s AND relation_name='labeled_as'" % int(project_id))
    labeled_as = cursor.fetchone()[0]

    # Select all nodes in the skeleton and any matching labels
    cursor.execute('''
            SELECT
                t.id,
                t.parent_id,
                t.location_x,
                t.location_y,
                t.location_z,
                ci.name
            FROM treenode t
            LEFT OUTER JOIN (
                treenode_class_instance tci
                INNER JOIN class_instance ci
                  ON (tci.class_instance_id = ci.id AND tci.relation_id = %s AND ci.name ~ %s))
              ON t.id = tci.treenode_id
            WHERE t.skeleton_id = %s
            ''', (labeled_as, label_regex, int(skeleton_id)))

    # Some entries repeated, when a node has more than one matching label
    # Create a graph with edges from parent to child, and accumulate parents
    tree = nx.DiGraph()
    for row in cursor.fetchall():
        nodeID = row[0]
        if row[1]:
            # It is ok to add edges that already exist: DiGraph doesn't keep duplicates
            tree.add_edge(row[1], nodeID)
        else:
            tree.add_node(nodeID)
        tree.node[nodeID]['loc'] = (row[2], row[3], row[4])
        if row[5]:
            props = tree.node[nodeID]
            tags = props.get('tags')
            if tags:
                tags.append(row[5])
            else:
                props['tags'] = [row[5]]

    if tnid not in tree:
        raise Exception("Could not find %s in skeleton %s" % (tnid, int(skeleton_id)))

    reroot(tree, tnid)
    distances = edge_count_to_root(tree, root_node=tnid)

    nearest = []

    for nodeID, props in tree.nodes_iter(data=True):
        if 'tags' in props:
            # Found a node with a matching label
            d = distances[nodeID]
            nearest.append([nodeID, props['loc'], d, props['tags']])

    nearest.sort(key=lambda n: n[2])

    return JsonResponse(nearest, safe=False)


@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def within_spatial_distance(request:HttpRequest, project_id=None) -> JsonResponse:
    """Find skeletons within a given L-infinity distance of a treenode.

    Returns at most 100 results.
    ---
    parameters:
        - name: treenode_id
          description: ID of the origin treenode to search around
          required: true
          type: integer
          paramType: form
        - name: distance
          description: L-infinity distance in nanometers within which to search
          required: false
          default: 0
          type: integer
          paramType: form
        - name: size_mode
          description: |
            Whether to return skeletons with only one node in the search area
            (1) or more than one node in the search area (0).
          required: false
          default: 0
          type: integer
          paramType: form
    type:
      reached_limit:
        description: Whether the limit of at most 100 skeletons was reached
        type: boolean
        required: true
      skeletons:
        description: IDs of skeletons matching the search criteria
        type: array
        required: true
        items:
          type: integer
    """
    project_id = int(project_id)
    tnid = request.POST.get('treenode_id', None)
    if not tnid:
        raise Exception("Need a treenode!")
    tnid = int(tnid)
    distance = int(request.POST.get('distance', 0))
    if 0 == distance:
        return JsonResponse({"skeletons": []})
    size_mode = int(request.POST.get("size_mode", 0))
    having = ""

    if 0 == size_mode:
        having = "HAVING count(*) > 1"
    elif 1 == size_mode:
        having = "HAVING count(*) = 1"
    # else, no constraint

    cursor = connection.cursor()
    cursor.execute('SELECT location_x, location_y, location_z FROM treenode WHERE id=%s' % tnid)
    pos = cursor.fetchone()

    limit = 100
    x0 = pos[0] - distance
    x1 = pos[0] + distance
    y0 = pos[1] - distance
    y1 = pos[1] + distance
    z0 = pos[2] - distance
    z1 = pos[2] + distance

    # Cheap emulation of the distance
    cursor.execute('''
SELECT skeleton_id, count(*)
FROM treenode
WHERE project_id = %s
  AND location_x > %s
  AND location_x < %s
  AND location_y > %s
  AND location_y < %s
  AND location_z > %s
  AND location_z < %s
GROUP BY skeleton_id
%s
LIMIT %s
''' % (project_id, x0, x1, y0, y1, z0, z1, having, limit))


    skeletons = tuple(row[0] for row in cursor.fetchall())

    return JsonResponse({"skeletons": skeletons,
                         "reached_limit": limit == len(skeletons)})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_statistics(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    p = get_object_or_404(Project, pk=project_id)
    skel = Skeleton( skeleton_id = skeleton_id, project_id = project_id )
    const_time = skel.measure_construction_time()
    construction_time = '{0} minutes {1} seconds'.format( int(const_time / 60), const_time % 60)
    return JsonResponse({
        'node_count': skel.node_count(),
        'input_count': skel.input_count(),
        'output_count': skel.output_count(),
        'presynaptic_sites': skel.presynaptic_sites_count(),
        'postsynaptic_sites': skel.postsynaptic_sites_count(),
        'cable_length': int(skel.cable_length()),
        'measure_construction_time': construction_time,
        'percentage_reviewed': "%.2f" % skel.percentage_reviewed()})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def contributor_statistics(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    return contributor_statistics_multiple(request, project_id=project_id, skeleton_ids=[int(skeleton_id)])

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def contributor_statistics_multiple(request:HttpRequest, project_id=None, skeleton_ids=None) -> JsonResponse:
    contributors = defaultdict(int) # type: DefaultDict[Any, int]
    n_nodes = 0
    # Count the total number of 20-second intervals with at least one treenode in them
    n_time_bins = 0
    n_review_bins = 0
    n_multi_review_bins = 0
    epoch = datetime.utcfromtimestamp(0).replace(tzinfo=pytz.utc)

    if not skeleton_ids:
        skeleton_ids = tuple(int(v) for k,v in request.POST.items() if k.startswith('skids['))

    # Count time bins separately for each skeleton
    time_bins = None
    last_skeleton_id = None
    for row in Treenode.objects.filter(skeleton_id__in=skeleton_ids).order_by('skeleton').values_list('skeleton_id', 'user_id', 'creation_time').iterator():
        if last_skeleton_id != row[0]:
            if time_bins:
                n_time_bins += len(time_bins)
            time_bins = set()
            last_skeleton_id = row[0]
        n_nodes += 1
        contributors[row[1]] += 1
        time_bins.add(int((row[2] - epoch).total_seconds() / 20))

    # Process last one
    if time_bins:
        n_time_bins += len(time_bins)


    # Take into account that multiple people may have reviewed the same nodes
    # Therefore measure the time for the user that has the most nodes reviewed,
    # then add the nodes not reviewed by that user but reviewed by the rest
    def process_reviews(rev):
        seen = set() # type: Set
        min_review_bins = set()
        multi_review_bins = 0
        for reviewer, treenodes in sorted(rev.items(), key=lambda x: len(x[1]), reverse=True):
            reviewer_bins = set()
            for treenode, timestamp in treenodes.items():
                time_bin = int((timestamp - epoch).total_seconds() / 20)
                reviewer_bins.add(time_bin)
                if not (treenode in seen):
                    seen.add(treenode)
                    min_review_bins.add(time_bin)
            multi_review_bins += len(reviewer_bins)
        #
        return len(min_review_bins), multi_review_bins

    rev = None
    last_skeleton_id = None
    review_contributors = defaultdict(int) # type: DefaultDict[Any, int]
                                           # reviewer_id vs count of nodes reviewed

    for row in Review.objects.filter(skeleton_id__in=skeleton_ids).order_by('skeleton').values_list('reviewer', 'treenode', 'review_time', 'skeleton_id').iterator():
        if last_skeleton_id != row[3]:
            if rev:
                a, b = process_reviews(rev)
                n_review_bins += a
                n_multi_review_bins += b
            # Reset for next skeleton
            rev = defaultdict(dict)
            last_skeleton_id = row[3]
        #
        rev[row[0]][row[1]] = row[2] # type: ignore
        #
        review_contributors[row[0]] += 1

    # Process last one
    if rev:
        a, b = process_reviews(rev)
        n_review_bins += a
        n_multi_review_bins += b


    relations = {row[0]: row[1] for row in Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id').iterator()}

    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    synapses = {} # type: dict
    synapses[pre] = defaultdict(int)
    synapses[post] = defaultdict(int)

    # This may be succint but unless one knows SQL it makes no sense at all
    for row in TreenodeConnector.objects.filter(
            Q(relation_id=pre) | Q(relation_id=post),
            skeleton_id__in=skeleton_ids
    ).values_list('user_id', 'relation_id').iterator():
        synapses[row[1]][row[0]] += 1

    return JsonResponse({
        'construction_minutes': int(n_time_bins / 3.0),
        'min_review_minutes': int(n_review_bins / 3.0),
        'multiuser_review_minutes': int(n_multi_review_bins / 3.0),
        'n_nodes': n_nodes,
        'node_contributors': contributors,
        'n_pre': sum(synapses[relations['presynaptic_to']].values()),
        'n_post': sum(synapses[relations['postsynaptic_to']].values()),
        'pre_contributors': synapses[relations['presynaptic_to']],
        'post_contributors': synapses[relations['postsynaptic_to']],
        'review_contributors': review_contributors
    })


@requires_user_role(UserRole.Browse)
def node_count(request:HttpRequest, project_id=None, skeleton_id=None, treenode_id=None) -> JsonResponse:
    # Works with either the skeleton_id or the treenode_id
    p = get_object_or_404(Project, pk=project_id)
    if not skeleton_id:
        skeleton_id = Treenode.objects.get(pk=treenode_id).skeleton_id
    skeleton_id = int(skeleton_id)

    return JsonResponse({
        'count': SkeletonSummary.objects.get(skeleton_id=skeleton_id).num_nodes,
        'skeleton_id': skeleton_id})

@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def sampler_count(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    """Get the number of samplers associated with this skeleton.
    ---
    parameters:
      - name: project_id
        description: Project of skeleton
        type: integer
        paramType: path
        required: true
      - name: skeleton_id
        description: ID of the skeleton to get the sampler count for.
        required: true
        type: integer
        paramType: path
    """
    p = get_object_or_404(Project, pk=project_id)
    return JsonResponse({
        'n_samplers': Sampler.objects.filter(project_id=project_id, skeleton_id=skeleton_id).count(),
    })

@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def list_sampler_count(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get the number of samplers associated with each skeleton in the passed in
    last.
    ---
    parameters:
      - name: project_id
        description: Project of skeleton
        type: integer
        paramType: path
        required: true
      - name: skeleton_ids
        description: IDs of the skeleton to get the sampler count for.
        required: true
        type: array
        items:
          type: integer
        paramType: path
    """
    p = get_object_or_404(Project, pk=project_id)
    skeleton_ids = get_request_list(request.POST, 'skeleton_ids', map_fn=int)
    if not skeleton_ids:
        raise ValueError("Need at least one skeleton ID")

    cursor = connection.cursor()
    cursor.execute("""
        SELECT skeleton.id, count(cs.skeleton_id)
        FROM UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
        LEFT JOIN catmaid_sampler cs
            ON cs.skeleton_id = skeleton.id
        WHERE project_id = %(project_id)s OR cs.skeleton_id IS NULL
        GROUP BY skeleton.id
    """, {
        'project_id': p.id,
        'skeleton_ids': skeleton_ids,
    })

    return JsonResponse(dict(cursor.fetchall()))


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def cable_length(request:HttpRequest, project_id=None, skeleton_id=None, treenode_id=None) -> JsonResponse:
    """Get the cable length for a skeleton
    ---
    parameters:
      - name: project_id
        description: Project of landmark
        type: integer
        paramType: path
        required: true
      - name: skeleton_id
        description: IDs of the skeleton to get the cable length for
        required: true
        type: integer
        paramType: path
    """
    p = get_object_or_404(Project, pk=project_id)
    if not skeleton_id:
        if treenode_id:
            skeleton_id = Treenode.objects.get(pk=treenode_id).skeleton_id
        else:
            raise ValueError("Need skeleton ID or treenode ID")

    skeleton_id = int(skeleton_id)

    return JsonResponse({
        'cable_length': SkeletonSummary.objects.get(skeleton_id=skeleton_id).cable_length,
        'skeleton_id': skeleton_id})

def _get_neuronname_from_skeletonid( project_id, skeleton_id ):
    p = get_object_or_404(Project, pk=project_id)
    qs = ClassInstanceClassInstance.objects.filter(
                relation__relation_name='model_of',
                project=p,
                class_instance_a=int(skeleton_id)).select_related("class_instance_b")
    try:
        return {'neuronname': qs[0].class_instance_b.name,
            'neuronid': qs[0].class_instance_b.id }
    except IndexError:
        raise Exception("Couldn't find a neuron linking to a skeleton with " \
                "ID %s" % skeleton_id)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronname(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    return JsonResponse(_get_neuronname_from_skeletonid(project_id, skeleton_id))

def _neuronnames(skeleton_ids, project_id) -> dict:
    qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=project_id,
            class_instance_a__in=skeleton_ids).select_related("class_instance_b").values_list("class_instance_a", "class_instance_b__name")
    return dict(qs)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronnames(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns a JSON object with skeleton IDs as keys and neuron names as values. """
    skeleton_ids = tuple(int(v) for k,v in request.POST.items() if k.startswith('skids['))
    return JsonResponse(_neuronnames(skeleton_ids, project_id))

@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def cable_lengths(request:HttpRequest, project_id=None) -> HttpResponse:
    """Get the cable length of a set of skeletons.

    Returns a mapping from skeleton ID to cable length.
    ---
    parameters:
      - name: project_id
        description: Project to operate in
        type: integer
        paramType: path
        required: true
      - name: skeleton_ids[]
        description: IDs of the skeletons to query cable-length for
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

    skeleton_ids = get_request_list(data, 'skeleton_ids', map_fn=int)
    if not skeleton_ids:
        raise ValueError('Need at least one skeleton ID')

    cursor = connection.cursor()
    cursor.execute("""
        SELECT COALESCE(json_object_agg(css.skeleton_id, css.cable_length), '{}'::json)::text
        FROM catmaid_skeleton_summary css
        JOIN UNNEST(%(query_skeleton_ids)s::bigint[]) query_skeleton(id)
            ON query_skeleton.id = css.skeleton_id
        WHERE project_id = %(project_id)s
    """, {
        'query_skeleton_ids': skeleton_ids,
        'project_id': project_id,
    })

    return HttpResponse(cursor.fetchone()[0], content_type='application/json')


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def validity(request:HttpRequest, project_id=None) -> HttpResponse:
    """Find out if passed skeleton IDs are valid (and represent present
    skeletons).

    Returns all passed in skeletons that are valid.
    ---
    parameters:
      - name: project_id
        description: Project of landmark
        type: integer
        paramType: path
        required: true
      - name: skeleton_ids[]
        description: IDs of the skeletons whose partners to find
        required: true
        type: array
        items:
          type: integer
        paramType: form
      - name: return_invalid
        description: Whether or not to return invalid skeleton IDs rather than valid ones.
        required: false
        type: bool
        default: false
    """

    if request.method == 'GET':
        data = request.GET
    elif request.method == 'POST':
        data = request.POST
    else:
        raise ValueError("Invalid HTTP method: " + request.method)

    skeleton_ids = get_request_list(data, 'skeleton_ids', map_fn=int)
    if not skeleton_ids:
        raise ValueError('Need at least one skeleton ID')

    return_invalid = get_request_bool(data, 'return_invalid', False)

    cursor = connection.cursor()

    if return_invalid:
        cursor.execute("""
            SELECT COALESCE(json_agg(query_skeleton.id), '[]'::json)::text
            FROM UNNEST(%(query_skeleton_ids)s::bigint[]) query_skeleton(id)
            LEFT JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = query_skeleton.id
                AND css.project_id = %(project_id)s
            WHERE css.skeleton_id IS NULL
        """, {
            'query_skeleton_ids': skeleton_ids,
            'project_id': project_id,
        })
    else:
        cursor.execute("""
            SELECT COALESCE(json_agg(query_skeleton.id), '[]'::json)::text
            FROM UNNEST(%(query_skeleton_ids)s::bigint[]) query_skeleton(id)
            JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = query_skeleton.id
            WHERE project_id = %(project_id)s
        """, {
            'query_skeleton_ids': skeleton_ids,
            'project_id': project_id,
        })

    return HttpResponse(cursor.fetchone()[0], content_type='application/json')


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def connectivity_counts(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get the number of synapses per type for r a set of skeletons.

    Returns an object with to fields. The first, `connectivity`, is a mapping
    from skeleton ID to objects that map a relation ID to connectivity count for
    that particular relation. The second field of the returned object,
    `relations`, maps relation IDs used in the first field to relation names.
    ---
    parameters:
      - name: project_id
        description: Project of work in
        type: integer
        paramType: path
        required: true
      - name: count_partner_links
        description: Whether to count partner links or links to a connector.
        type: boolean
        paramType: path
        default: true
        required: false
      - name: source_relations[]
        description: A list of pre-connector relations that have to be used
        default: []
        required: false
        type: array
        items:
          type: string
        paramType: form
      - name: target_relations[]
        description: A list of post-connector relations that have to be used
        default: []
        required: false
        type: array
        items:
          type: string
        paramType: form
      - name: skeleton_ids[]
        description: IDs of the skeletons whose partners to count
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

    skeleton_ids = get_request_list(data, 'skeleton_ids', map_fn=int)
    if not skeleton_ids:
        raise ValueError('Need at least one skeleton ID')

    count_partner_links = get_request_bool(data, 'count_partner_links', True)

    source_relations = get_request_list(data, 'source_relations', default=[])
    target_relations = get_request_list(data, 'target_relations', default=[])

    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    source_relation_ids = map(lambda r: relations[r], source_relations)
    target_relation_ids = map(lambda r: relations[r], target_relations)

    extra_select = []
    if count_partner_links:
        if target_relation_ids:
            extra_target_check = """
                AND tc2.relation_id IN ({})
            """.format(','.join(map(str, target_relation_ids)))
        else:
            extra_target_check = ""

        extra_select.append("""
            JOIN treenode_connector tc2
                ON tc.connector_id = tc2.connector_id
                AND tc.id <> tc2.id
                {extra_target_check}
        """.format(extra_target_check=extra_target_check))

    if source_relation_ids:
        extra_source_check = """
            AND tc.relation_id IN ({})
        """.format(','.join(map(str, source_relation_ids)))
    else:
        extra_source_check = ""

    cursor = connection.cursor()
    cursor.execute("""
        SELECT tc.skeleton_id, tc.relation_id, COUNT(tc)
        FROM treenode_connector tc
        JOIN UNNEST(%(skeleton_ids)s::int[]) skeleton(id)
            ON skeleton.id = tc.skeleton_id
        {extra_select}
        WHERE tc.project_id = %(project_id)s
        {extra_source_check}
        GROUP BY tc.skeleton_id, tc.relation_id
    """.format(**{
        'extra_select': '\n'.join(extra_select),
        'extra_source_check': extra_source_check,
    }), {
        'project_id': project_id,
        'skeleton_ids': skeleton_ids,
    })

    connectivity = {} # type: dict
    seen_relations = set()
    for row in cursor.fetchall():
        skeletton_entry = connectivity.get(row[0])
        if not skeletton_entry:
            skeletton_entry = {}
            connectivity[row[0]] = skeletton_entry
        seen_relations.add(row[1])
        skeletton_entry[row[1]] = row[2]

    if seen_relations:
        relations = dict((v,k) for k,v in relations.items() if v in seen_relations)
    else:
        relations = {}

    return JsonResponse({
        'connectivity': connectivity,
        'relations': dict(relations),
    })


def check_annotations_on_split(project_id, skeleton_id, over_annotation_set,
        under_annotation_set) -> bool:
    """ With respect to annotations, a split is only correct if one part keeps
    the whole set of annotations.
    """
    # Get current annotation set
    annotation_query = create_annotation_query(project_id,
        {'skeleton_id': skeleton_id})

    # Check if current set is equal to under or over set
    current_annotation_set = frozenset(a.name for a in annotation_query)
    if not current_annotation_set.difference(over_annotation_set):
      return True
    if not current_annotation_set.difference(under_annotation_set):
      return True

    return False

def check_new_annotations(project_id, user, entity_id, annotation_set) -> bool:
    """ With respect to annotations, the new annotation set is only valid if the
    user doesn't remove annotations for which (s)he has no permissions.
    """
    # Get current annotation links
    annotation_links = ClassInstanceClassInstance.objects.filter(
            project_id=project_id,
            class_instance_b__class_column__class_name='annotation',
            relation__relation_name='annotated_with',
            class_instance_a_id=entity_id).values_list(
                    'class_instance_b__name', 'id', 'user')

    # Build annotation name indexed dict to the link's id and user
    annotations = {l[0]:(l[1], l[2]) for l in annotation_links}
    current_annotation_set = frozenset(annotations.keys())

    # If the current annotation set is not included completely in the new
    # set, we have to check if the user has permissions to edit the missing
    # annotations.
    removed_annotations = current_annotation_set - annotation_set
    for rl in removed_annotations:
        try:
            can_edit_or_fail(user, annotations[rl][0],
                        'class_instance_class_instance')
        except:
            return False

    # Otherwise, everything is fine
    return True


def check_annotations_on_join(project_id, user, from_neuron_id, to_neuron_id,
        ann_set) -> bool:
    """ With respect to annotations, a join is only correct if the user doesn't
    remove annotations for which (s)he has no permissions.
    """
    return check_new_annotations(project_id, user, from_neuron_id, ann_set) and \
           check_new_annotations(project_id, user, to_neuron_id, ann_set)

@requires_user_role(UserRole.Annotate)
def split_skeleton(request:HttpRequest, project_id=None) -> JsonResponse:
    """ The split is only possible if the neuron is not locked or if it is
    locked by the current user or if the current user belongs to the group of
    the user who locked it. Of course, the split is also possible if the
    current user is a super-user. Also, all reviews of the treenodes in the new
    neuron are updated to refer to the new skeleton.

    If upstream_annotation_map or downstream_annotation_map are not defined,
    this is interpreted as keeping all annotations for the respective skeleton.
    """
    treenode_id = int(request.POST['treenode_id'])
    treenode = Treenode.objects.get(pk=treenode_id)
    skeleton_id = treenode.skeleton_id
    project_id = int(project_id)
    upstream_annotation_map = request.POST.get('upstream_annotation_map')
    downstream_annotation_map = request.POST.get('downstream_annotation_map')
    cursor = connection.cursor()

    # If no annotation map was specified for either winning and losing
    # skeleton, get the current annotation data.
    if not upstream_annotation_map or not downstream_annotation_map:
        current_annotations = annotations_for_skeleton(project_id, skeleton_id)

    if upstream_annotation_map:
        upstream_annotation_map = json.loads(upstream_annotation_map)
    else:
        upstream_annotation_map = current_annotations

    if downstream_annotation_map:
        downstream_annotation_map = json.loads(downstream_annotation_map)
    else:
        downstream_annotation_map = current_annotations

    # Check if the treenode is root!
    if not treenode.parent:
        return JsonResponse({'error': 'Can\'t split at the root node: it doesn\'t have a parent.'})
    treenode_parent = treenode.parent

    # Check if annotations are valid
    if not check_annotations_on_split(project_id, skeleton_id,
            frozenset(upstream_annotation_map.keys()),
            frozenset(downstream_annotation_map.keys())):
        raise Exception("Annotation distribution is not valid for splitting. " \
          "One part has to keep the whole set of annotations!")

    skeleton = ClassInstance.objects.select_related('user').get(pk=skeleton_id)

    # retrieve neuron of this skeleton
    neuron = ClassInstance.objects.get(
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a_id=skeleton_id)

    # Make sure the user has permissions to edit
    can_edit_class_instance_or_fail(request.user, neuron.id, 'neuron')

    # Extend annotation maps with creation time and edition time of the link to
    # neuron to make sure these dates won't change during the split.
    upstream_annotation_map = make_annotation_map(upstream_annotation_map, neuron.id, cursor)
    downstream_annotation_map = make_annotation_map(downstream_annotation_map, neuron.id, cursor)

    # Retrieve the id, parent_id of all nodes in the skeleton. Also
    # pre-emptively lock all treenodes and connectors in the skeleton to prevent
    # race conditions resulting in inconsistent skeleton IDs from, e.g., node
    # creation or update.
    cursor.execute('''
        SELECT 1 FROM treenode_connector tc WHERE tc.skeleton_id = %s
        ORDER BY tc.id
        FOR NO KEY UPDATE OF tc;
        SELECT t.id, t.parent_id FROM treenode t WHERE t.skeleton_id = %s
        ORDER BY t.id
        FOR NO KEY UPDATE OF t
        ''', (skeleton_id, skeleton_id)) # no need to sanitize
    # build the networkx graph from it
    graph = nx.DiGraph()
    for row in cursor.fetchall():
        graph.add_node( row[0] )
        if row[1]:
            # edge from parent_id to id
            graph.add_edge( row[1], row[0] )
    # find downstream nodes starting from target treenode_id
    # and generate the list of IDs to change, starting at treenode_id (inclusive)
    change_list = nx.bfs_tree(graph, treenode_id).nodes()
    if not change_list:
        # When splitting an end node, the bfs_tree doesn't return any nodes,
        # which is surprising, because when the splitted tree has 2 or more nodes
        # the node at which the split is made is included in the list.
        change_list.append(treenode_id)
    # create a new skeleton
    new_skeleton = ClassInstance()
    new_skeleton.name = 'Skeleton'
    new_skeleton.project_id = project_id
    new_skeleton.user = skeleton.user # The same user that owned the skeleton to split
    new_skeleton.class_column = Class.objects.get(class_name='skeleton', project_id=project_id)
    new_skeleton.save()
    new_skeleton.name = 'Skeleton {0}'.format( new_skeleton.id ) # This could be done with a trigger in the database
    new_skeleton.save()
    # Create new neuron
    new_neuron = ClassInstance()
    new_neuron.name = 'Neuron'
    new_neuron.project_id = project_id
    new_neuron.user = skeleton.user
    new_neuron.class_column = Class.objects.get(class_name='neuron',
            project_id=project_id)
    new_neuron.save()
    new_neuron.name = 'Neuron %s' % str(new_neuron.id)
    new_neuron.save()
    # Assign the skeleton to new neuron
    cici = ClassInstanceClassInstance()
    cici.class_instance_a = new_skeleton
    cici.class_instance_b = new_neuron
    cici.relation = Relation.objects.get(relation_name='model_of', project_id=project_id)
    cici.user = skeleton.user # The same user that owned the skeleton to split
    cici.project_id = project_id
    cici.save()

    # Update skeleton IDs for treenodes, treenode_connectors, and reviews.
    cursor.execute("""
        UPDATE treenode
          SET skeleton_id = %(new_skeleton_id)s
          WHERE id = ANY(%(change_list)s::bigint[]);
        UPDATE treenode_connector
          SET skeleton_id = %(new_skeleton_id)s
          WHERE treenode_id = ANY(%(change_list)s::bigint[]);
        UPDATE review
          SET skeleton_id = %(new_skeleton_id)s
          WHERE treenode_id = ANY(%(change_list)s::bigint[]);
        """, {'new_skeleton_id': new_skeleton.id, 'change_list': change_list})

    # setting new root treenode's parent to null
    Treenode.objects.filter(id=treenode_id).update(parent=None, editor=request.user)

    # Update annotations of existing neuron to have only over set
    if upstream_annotation_map:
        _update_neuron_annotations(project_id, neuron.id,
                upstream_annotation_map)

    # Update annotations of under skeleton
    _annotate_entities(project_id, [new_neuron.id], downstream_annotation_map)

    # If samplers reference this skeleton, make sure they are updated as well
    sampler_info = prune_samplers(skeleton_id, graph, treenode_parent, treenode)

    # Log the location of the node at which the split was done
    location = (treenode.location_x, treenode.location_y, treenode.location_z)
    insert_into_log(project_id, request.user.id, "split_skeleton", location,
                    "Split skeleton with ID {0} (neuron: {1})".format( skeleton_id, neuron.name ) )

    response = {
        'new_skeleton_id': new_skeleton.id,
        'existing_skeleton_id': skeleton_id,
        'x': treenode.location_x,
        'y': treenode.location_y,
        'z': treenode.location_z,
    }

    if sampler_info and sampler_info['n_samplers'] > 0:
        response['samplers'] = {
            'n_deleted_intervals': sampler_info['n_deleted_intervals'],
            'n_deleted_domains': sampler_info['n_deleted_domains'],
        }

    return JsonResponse(response)


def create_subgraph(source_graph, target_graph, start_node, end_nodes) -> None:
    """Extract a subgraph out of <source_graph> into <target_graph>.
    """
    working_set = [start_node]

    # Create a graph for the domain
    while working_set:
        current_node = working_set.pop(0)
        for n in source_graph.successors_iter(current_node):
            target_graph.add_path([current_node,n])
            if n not in end_nodes:
                working_set.append(n)


def prune_samplers(skeleton_id, graph, treenode_parent, treenode):
    samplers = Sampler.objects.prefetch_related('samplerdomain_set',
            'samplerdomain_set__samplerdomainend_set',
            'samplerdomain_set__samplerinterval_set').filter(skeleton_id=skeleton_id)
    n_samplers = len(samplers)

    # Return early if there are no samplers
    if not n_samplers:
        return None

    n_deleted_sampler_intervals = 0
    n_deleted_sampler_domains = 0

    for sampler in samplers:
        # Each sampler references the skeleton through domains and
        # intervals. If the split off part intersects with the domain, the
        # domain needs to be adjusted.
        for domain in sampler.samplerdomain_set.all():
            domain_ends = domain.samplerdomainend_set.all()
            domain_end_map = dict(map(lambda de: (de.end_node_id, de.id), domain_ends))
            domain_end_ids = set(domain_end_map.keys())
            # Construct a graph for the domain and split it too.
            domain_graph = nx.DiGraph()
            create_subgraph(graph, domain_graph, domain.start_node_id, domain_end_ids)

            # If the subgraph is empty, this domain doesn't intersect with
            # the split off part. Therefore, this domain needs no update.
            if domain_graph.size() == 0:
                continue

            new_sk_domain_nodes = set(nx.bfs_tree(domain_graph, treenode.id).nodes())

            # At this point, we expect some intersecting domain nodes to be there.
            if not new_sk_domain_nodes:
                raise ValueError("Could not find any split-off domain nodes")

            # Remove all explicit domain ends in split-off part. If the
            # split off part leaves a branch, add a new domain end for it to
            # remaining domain.
            ends_to_remove = filter(lambda nid: nid in new_sk_domain_nodes, domain_end_ids)

            if ends_to_remove:
                domain_end_ids = set(map(lambda x: domain_end_map[x], ends_to_remove)) # type: ignore
                SamplerDomainEnd.objects.filter(domain_id__in=domain_end_ids).delete()

            if treenode_parent.parent_id is not None and \
                    domain_graph.has_node(treenode_parent.parent_id) and \
                    len(domain_graph.successors(treenode_parent.parent_id)) > 1:
                new_domain_end = SamplerDomainEnd.objects.create(
                            domain=domain, end_node=treenode_parent)

            # Delete domain intervals that intersect with split-off part
            domain_intervals = domain.samplerinterval_set.all()
            intervals_to_delete = []
            for di in domain_intervals:
                start_split_off = di.start_node_id in new_sk_domain_nodes
                end_split_off = di.end_node_id in new_sk_domain_nodes
                # If neither start or end of the interval are in split-off
                # part, the interval can be ignored.
                if not start_split_off and not end_split_off:
                    continue
                # If both start and end node are split off, the whole
                # interval can be removed, because the interval is
                # completely in the split off part.
                elif start_split_off and end_split_off:
                    intervals_to_delete.append(di.id)
                # If the start is not split off, but the end is, the
                # interval crosses the split location and has to be
                # adjusted. If this makes the start and end of the remaining
                # part the same, the interval is deleted, too.
                elif not start_split_off and end_split_off:
                    if di.start_node_id == treenode_parent.id:
                        intervals_to_delete.append(di.id)
                    else:
                        di.end_node_id = treenode_parent.id
                        di.save()
                # If the start is split off and the end is not, something is
                # wrong and we raise an error
                else:
                    raise ValueError("Unexpected interval: start is split "
                            "off, end is not")

            if intervals_to_delete:
                SamplerInterval.objects.filter(id__in=intervals_to_delete).delete()
                n_deleted_sampler_intervals += len(intervals_to_delete)

            # If the domain doesn't have any intervals left after this, it
            # can be removed as well.
            if len(domain_intervals) == len(intervals_to_delete):
                domain.delete()
                n_deleted_sampler_domains += 1
    return {
        'n_samplers': len(samplers),
        'n_deleted_domains': n_deleted_sampler_domains,
        'n_deleted_intervals': n_deleted_sampler_intervals,
    }


@api_view(['GET'])
@never_cache
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def root_for_skeleton(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    """Retrieve ID and location of the skeleton's root treenode.
    ---
    type:
      root_id:
        type: integer
        required: true
      x:
        type: number
        format: double
        required: true
      y:
        type: number
        format: double
        required: true
      z:
        type: number
        format: double
        required: true
    """
    tn = Treenode.objects.get(
        project=project_id,
        parent__isnull=True,
        skeleton_id=skeleton_id)
    return JsonResponse({
        'root_id': tn.id,
        'x': tn.location_x,
        'y': tn.location_y,
        'z': tn.location_z})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_ancestry(request:HttpRequest, project_id=None) -> JsonResponse:
    # All of the values() things in this function can be replaced by
    # prefetch_related when we upgrade to Django 1.4 or above
    skeleton_id = int(request.POST.get('skeleton_id', None))
    if skeleton_id is None:
        raise Exception('A skeleton id has not been provided!')

    relation_map = get_relation_to_id_map(project_id)
    for rel in ['model_of', 'part_of']:
        if rel not in relation_map:
            raise Exception(' => "Failed to find the required relation %s' % rel)

    response_on_error = ''
    try:
        response_on_error = 'The search query failed.'
        neuron_rows = ClassInstanceClassInstance.objects.filter(
            class_instance_a=skeleton_id,
            relation=relation_map['model_of']).values(
            'class_instance_b',
            'class_instance_b__name')
        neuron_count = neuron_rows.count()
        if neuron_count == 0:
            raise Exception('No neuron was found that the skeleton %s models' % skeleton_id)
        elif neuron_count > 1:
            raise Exception('More than one neuron was found that the skeleton %s models' % skeleton_id)

        parent_neuron = neuron_rows[0]
        ancestry = []
        ancestry.append({
            'name': parent_neuron['class_instance_b__name'],
            'id': parent_neuron['class_instance_b'],
            'class': 'neuron'})

        # Doing this query in a loop is horrible, but it should be very rare
        # for the hierarchy to be more than 4 deep or so.  (This is a classic
        # problem of not being able to do recursive joins in pure SQL.)
        # Detects erroneous cyclic hierarchy.
        current_ci = parent_neuron['class_instance_b']
        seen = set([current_ci])
        while True:
            response_on_error = 'Could not retrieve parent of class instance %s' % current_ci
            parents = ClassInstanceClassInstance.objects.filter(
                class_instance_a=current_ci,
                relation=relation_map['part_of']).values(
                'class_instance_b__name',
                'class_instance_b',
                'class_instance_b__class_column__class_name')
            parent_count = parents.count()
            if parent_count == 0:
                break  # We've reached the top of the hierarchy.
            elif parent_count > 1:
                raise Exception('More than one class_instance was found that the class_instance %s is part_of.' % current_ci)
            else:
                parent = parents[0]
                ancestry.append({
                    'name': parent['class_instance_b__name'],
                    'id': parent['class_instance_b'],
                    'class': parent['class_instance_b__class_column__class_name']
                })
                current_ci = parent['class_instance_b']
                if current_ci in seen:
                    raise Exception('Cyclic hierarchy detected for skeleton #%s' % skeleton_id)

        return JsonResponse(ancestry, safe=False)

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

def _connected_skeletons(skeleton_ids, op, relation_id_1, relation_id_2,
        model_of_id, cursor, with_nodes=False):
    def newSynapseCounts():
        return [0, 0, 0, 0, 0]

    class Partner:
        def __init__(self):
            self.num_nodes = 0
            self.skids = defaultdict(newSynapseCounts) # type: DefaultDict[Any, List[int]]
                                                       # skid vs synapse count
            if with_nodes:
                self.links = [] # type: List

    # Dictionary of partner skeleton ID vs Partner
    def newPartner():
        return Partner()
    partners = defaultdict(newPartner) # type: DefaultDict[Any, Partner]

    # Obtain the synapses made by all skeleton_ids considering the desired
    # direction of the synapse, as specified by relation_id_1 and relation_id_2:
    cursor.execute('''
    SELECT t1.skeleton_id, t2.skeleton_id, LEAST(t1.confidence, t2.confidence),
        t1.treenode_id, t2.treenode_id
    FROM treenode_connector t1,
         treenode_connector t2
    WHERE t1.skeleton_id = ANY(%s::integer[])
      AND t1.relation_id = %s
      AND t1.connector_id = t2.connector_id
      AND t1.id != t2.id
      AND t2.relation_id = %s
    ''', (list(skeleton_ids), int(relation_id_1), int(relation_id_2)))

    # Sum the number of synapses
    for srcID, partnerID, confidence, tn1, tn2 in cursor.fetchall():
        partner = partners[partnerID]
        partner.skids[srcID][confidence - 1] += 1
        if with_nodes:
            partner.links.append([tn1, tn2, srcID])

    # There may not be any synapses
    if not partners:
        return partners, []

    # If op is AND, discard entries where only one of the skids has synapses
    if len(skeleton_ids) > 1 and 'AND' == op:
        for partnerID in list(partners.keys()): # keys() is a copy of the keys
            if len(skeleton_ids) != len(partners[partnerID].skids):
                del partners[partnerID]

    # With AND it is possible that no common partners exist
    if not partners:
        return partners, []

    # Obtain unique partner skeletons
    partner_skids = list(partners.keys())

    # Count nodes of each partner skeleton
    cursor.execute('''
    SELECT skeleton_id, num_nodes
    FROM catmaid_skeleton_summary
    WHERE skeleton_id = ANY(%s::integer[])
    GROUP BY skeleton_id
    ''', (partner_skids,))
    for row in cursor.fetchall():
        partners[row[0]].num_nodes = row[1]

    # Find which reviewers have reviewed any partner skeletons
    cursor.execute('''
    SELECT DISTINCT reviewer_id
    FROM review
    WHERE skeleton_id = ANY(%s::integer[])
    ''', (partner_skids,))
    reviewers = [row[0] for row in cursor]

    return partners, reviewers

def _skeleton_info_raw(project_id, skeletons, op, with_nodes=False,
        allowed_link_types=None):
    cursor = connection.cursor()

    # Obtain the IDs of the 'presynaptic_to', 'postsynaptic_to' and 'model_of' relations
    relation_ids = get_relation_to_id_map(project_id)

    def prepare(partners):
        for partnerID in partners.keys():
            partner = partners[partnerID]
            skids = partner.skids
            # jsonize: swap class instance by its dict of members vs values
            if partner.skids:
                partners[partnerID] = partner.__dict__
            else:
                del partners[partnerID]
        return partners

    skeleton_info = {}
    for link_type in LINK_TYPES:
        partner_reference = link_type['partner_reference']
        if allowed_link_types and partner_reference not in allowed_link_types:
            continue
        connectivity, reviews = _connected_skeletons(skeletons, op,
            relation_ids[link_type['relation']],
            relation_ids[link_type['partner_relation']],
            relation_ids['model_of'], cursor, with_nodes)
        skeleton_info[partner_reference] = prepare(connectivity)
        skeleton_info[partner_reference + '_reviewers'] = reviews

    return skeleton_info

@api_view(['POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_info_raw(request:HttpRequest, project_id=None) -> JsonResponse:
    """Retrieve a list of down/up-stream partners of a set of skeletons.

    From a queried set of source skeletons, find all upstream and downstream
    partners, the number of synapses between each source and each partner,
    and a list of reviewers for each partner set. Confidence distributions for
    each synapse count are included. Optionally find only those partners
    that are common between the source skeleton set.
    ---
    parameters:
        - name: source_skeleton_ids
          description: IDs of the skeletons whose partners to find
          required: true
          type: array
          items:
            type: integer
          paramType: form
        - name: boolean_op
          description: |
            Whether to find partners of any source skeleton ("OR") or partners
            common to all source skeletons ("AND")
          required: true
          type: string
          paramType: form
        - name: with_nodes
          description: |
            Whether to return detailed connectivity information that includes
            partner sites.
          required: false
          type: voolean
          paramType: form
          default: false
        - name: link_types
          description:  |
            A list of allowed link types: incoming, outgoing, abutting,
            gapjunction, tightjunction, desmosome, attachment, close_object.
          type: array
          items:
            type: string
          required: false
          defaultValue: [incoming, outgoing]
    models:
      skeleton_info_raw_partners:
        id: skeleton_info_raw_partners
        properties:
          '{skeleton_id}':
            $ref: skeleton_info_raw_partner
            description: Map from partners' skeleton IDs to their information
            required: true
      skeleton_info_raw_partner:
        id: skeleton_info_raw_partner
        properties:
          skids:
            $ref: skeleton_info_raw_partner_counts
            required: true
          num_nodes:
            description: The number of treenodes in this skeleton
            required: true
            type: integer
      skeleton_info_raw_partner_counts:
        id: skeleton_info_raw_partner_counts
        properties:
          '{skeleton_id}':
            $ref: skeleton_info_raw_partner_count
            description: |
              Synapse counts between the partner and the source skeleton with
              this ID
            required: true
      skeleton_info_raw_partner_count:
        id: skeleton_info_raw_partner_count
        properties:
        - description: Number of synapses with confidence 1
          type: integer
          required: true
        - description: Number of synapses with confidence 2
          type: integer
          required: true
        - description: Number of synapses with confidence 3
          type: integer
          required: true
        - description: Number of synapses with confidence 4
          type: integer
          required: true
        - description: Number of synapses with confidence 5
          type: integer
          required: true
    type:
      incoming:
        $ref: skeleton_info_raw_partners
        description: Upstream synaptic partners
        required: true
      outgoing:
        $ref: skeleton_info_raw_partners
        description: Downstream synaptic partners
        required: true
      gapjunctions:
        $ref: skeleton_info_raw_partners
        description: Gap junction partners
        required: true
      incoming_reviewers:
        description: IDs of reviewers who have reviewed any upstream partners.
        required: true
        type: array
        items:
          type: integer
      outgoing_reviewers:
        description: IDs of reviewers who have reviewed any downstream partners.
        required: true
        type: array
        items:
          type: integer
      gapjunctions_reviewers:
        description: IDs of reviewers who have reviewed any gap junction partners.
        required: true
        type: array
        items:
          type: integer
    """
    # sanitize arguments
    project_id = int(project_id)
    skeleton_ids = get_request_list(request.POST, 'source_skeleton_ids', map_fn=int)
    op = str(request.POST.get('boolean_op')) # values: AND, OR
    op = {'AND': 'AND', 'OR': 'OR'}[op] # sanitize
    with_nodes = get_request_bool(request.POST, 'with_nodes', False)
    allowed_link_types = get_request_list(request.POST, 'link_types',
            ['incoming', 'outgoing'])

    skeleton_info = _skeleton_info_raw(project_id, skeleton_ids, op, with_nodes,
            allowed_link_types)

    return JsonResponse(skeleton_info)


@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def connectivity_matrix(request:HttpRequest, project_id=None) -> JsonResponse:
    """
    Return a sparse connectivity matrix representation for the given skeleton
    IDs. The returned dictionary has a key for each row skeleton having
    outgoing connections to one or more column skeletons. Each entry stores a
    dictionary that maps the connection partners to the individual outgoing
    synapse counts.
    ---
    parameters:
      - name: project_id
        description: Project of skeletons
        type: integer
        paramType: path
        required: true
      - name: rows
        description: IDs of row skeletons
        required: true
        type: array
        items:
          type: integer
        paramType: form
      - name: columns
        description: IDs of column skeletons
        required: true
        type: array
        items:
          type: integer
        paramType: form
      - name: with_locations
        description: Whether or not to return locations of connectors
        required: false
        default: false
        type: boolean
        paramType: form
    """
    # sanitize arguments
    project_id = int(project_id)
    rows = tuple(get_request_list(request.POST, 'rows', [], map_fn=int))
    cols = tuple(get_request_list(request.POST, 'columns', [], map_fn=int))
    with_locations = get_request_bool(request.POST, 'with_locations', False)

    matrix = get_connectivity_matrix(project_id, rows, cols,
        with_locations=with_locations)
    return JsonResponse(matrix)


@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def connectivity_matrix_csv(request:HttpRequest, project_id) -> StreamingHttpResponse:
    """
    Return a CSV file that represents the connectivity matrix of a set of row
    skeletons and a set of column skeletons.
    ---
    parameters:
      - name: project_id
        description: Project of skeletons
        type: integer
        paramType: path
        required: true
      - name: rows
        description: IDs of row skeletons
        required: true
        type: array
        items:
          type: integer
        paramType: form
      - name: columns
        description: IDs of column skeletons
        required: true
        type: array
        items:
          type: integer
        paramType: form
      - name: names
        description: |
            An optional mapping of skeleton IDs versus names.
            Represented as a list of two-element lists. Each inner list
            follows the form [<skeleton-id>, <name>].
        required: false
        type: array
        items:
            type: string
    """
    # sanitize arguments
    project_id = int(project_id)
    rows = tuple(get_request_list(request.POST, 'rows', [], map_fn=int))
    cols = tuple(get_request_list(request.POST, 'columns', [], map_fn=int))
    names = dict(map(lambda x: [int(x[0]), x[1]], get_request_list(request.POST, 'names', []))) # type: Dict

    matrix = get_connectivity_matrix(project_id, rows, cols)

    csv_data = []
    header = [''] + list(map(lambda x: names.get(x, x), cols))
    csv_data.append(header)

    for n, skid_a in enumerate(rows):
        # Add row header skeleton ID
        row = [names.get(skid_a, skid_a)]
        csv_data.append(row)
        # Add connectivity information
        for m, skid_b in enumerate(cols):
            p = matrix.get(skid_a, {})
            c = p.get(skid_b, 0)
            row.append(c)

    pseudo_buffer = Echo()
    writer = csv.writer(pseudo_buffer, quoting=csv.QUOTE_NONNUMERIC)

    response = StreamingHttpResponse((writer.writerow(row) for row in csv_data), # type: ignore
            content_type='text/csv')

    filename = 'catmaid-connectivity-matrix.csv'
    response['Content-Disposition'] = 'attachment; filename={}'.format(filename)

    return response


def get_connectivity_matrix(project_id, row_skeleton_ids, col_skeleton_ids,
        with_locations=False) -> DefaultDict[Any, Dict]:
    """
    Return a sparse connectivity matrix representation for the given skeleton
    IDS. The returned dictionary has a key for each row skeleton having
    outgoing connections to one or more column skeletons. Each entry stores a
    dictionary that maps the connection partners to the individual outgoing
    synapse counts.
    """
    cursor = connection.cursor()
    relation_map = get_relation_to_id_map(project_id)
    post_rel_id = relation_map['postsynaptic_to']
    pre_rel_id = relation_map['presynaptic_to']

    if with_locations:
      extra_select = ', c.id, c.location_x, c.location_y, c.location_z'
      extra_join = 'JOIN connector c ON c.id = t2.connector_id'
    else:
      extra_select = ''
      extra_join = ''

    # Obtain all synapses made between row skeletons and column skeletons.
    cursor.execute('''
    SELECT t1.skeleton_id, t2.skeleton_id
        {extra_select}
    FROM treenode_connector t1,
         treenode_connector t2
        {extra_join}
    WHERE t1.skeleton_id = ANY(%(row_skeleton_ids)s::integer[])
      AND t2.skeleton_id = ANY(%(col_skeleton_ids)s::integer[])
      AND t1.connector_id = t2.connector_id
      AND t1.relation_id = %(pre_rel_id)s
      AND t2.relation_id = %(post_rel_id)s
    '''.format(**{
      'extra_select': extra_select,
      'extra_join': extra_join,
    }), {
      'row_skeleton_ids': list(row_skeleton_ids),
      'col_skeleton_ids': list(col_skeleton_ids),
      'pre_rel_id': pre_rel_id,
      'post_rel_id': post_rel_id
    })

    # Build a sparse connectivity representation. For all skeletons requested
    # map a dictionary of partner skeletons and the number of synapses
    # connecting to each partner. If locations should be returned as well, an
    # object with the fields 'count' and 'locations' is returned instead of a
    # single count.
    if with_locations:
      outgoing = defaultdict(dict) # type: DefaultDict[Any, Dict]
      for r in cursor.fetchall():
          source, target = r[0], r[1]
          mapping = outgoing[source]
          connector_id = r[2]
          info = mapping.get(target)
          if not info:
            info = { 'count': 0, 'locations': {} }
            mapping[target] = info
          count = info['count']
          info['count'] = count + 1

          if connector_id not in info['locations']:
            location = [r[3], r[4], r[5]]
            info['locations'][connector_id] = {
              'pos': location,
              'count': 1
            }
          else:
            info['locations'][connector_id]['count'] += 1
    else:
      outgoing = defaultdict(dict)
      for r in cursor.fetchall():
          source, target = r[0], r[1]
          mapping = outgoing[source]
          count = mapping.get(target, 0)
          mapping[target] = count + 1

    return outgoing


@api_view(['POST'])
@requires_user_role([UserRole.Browse, UserRole.Annotate])
def review_status(request:HttpRequest, project_id=None) -> JsonResponse:
    """Retrieve the review status for a collection of skeletons.

    The review status for each skeleton in the request is a tuple of total
    nodes and number of reviewed nodes (integers). The reviews of only
    certain users or a reviewer team may be counted instead of all reviews.
    ---
    parameters:
        - name: skeleton_ids[]
          description: IDs of the skeletons to retrieve.
          required: true
          type: array
          items:
            type: integer
          paramType: form
        - name: whitelist
          description: |
            ID of the user whose reviewer team to use to filter reviews
            (exclusive to user_ids)
          type: integer
          paramType: form
        - name: user_ids[]
          description: |
            IDs of the users whose reviews should be counted (exclusive
            to whitelist)
          type: array
          items:
            type: integer
          paramType: form
    models:
      review_status_tuple:
        id: review_status_tuple
        properties:
        - description: Total number of treenodes in the skeleton
          type: integer
          required: true
        - description: |
            Number of reviewed treenodes in the skeleton matching filters
            (if any)
          type: integer
          required: true
    type:
      '{skeleton_id}':
        $ref: review_status_tuple
        required: true
    """
    skeleton_ids = set(int(v) for k,v in request.POST.items() if k.startswith('skeleton_ids['))
    whitelist = get_request_bool(request.POST, 'whitelist', False)
    whitelist_id = None
    user_ids = None
    if whitelist:
        whitelist_id = request.user.id
    else:
        user_ids = set(int(v) for k,v in request.POST.items() if k.startswith('user_ids['))

    status = get_review_status(skeleton_ids, project_id=project_id,
            whitelist_id=whitelist_id, user_ids=user_ids)

    return JsonResponse(status)


@requires_user_role(UserRole.Annotate)
def reroot_skeleton(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Any user with an Annotate role can reroot any skeleton.
    """
    treenode_id = request.POST.get('treenode_id', None)
    treenode = _reroot_skeleton(treenode_id, project_id)
    response_on_error = ''
    try:
        if treenode:
            response_on_error = 'Failed to log reroot.'
            location = (treenode.location_x, treenode.location_y, treenode.location_z)
            insert_into_log(project_id, request.user.id, 'reroot_skeleton',
                            location, 'Rerooted skeleton for '
                            'treenode with ID %s' % treenode.id)
            return JsonResponse({'newroot': treenode.id,
                                 'skeleton_id': treenode.skeleton_id})
        # Else, already root
        return JsonResponse({'error': 'Node #%s is already root!' % treenode_id})
    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _reroot_skeleton(treenode_id, project_id):
    """ Returns the treenode instance that is now root,
    or False if the treenode was root already. """
    if treenode_id is None:
        raise Exception('A treenode id has not been provided!')

    response_on_error = ''
    try:
        response_on_error = 'Failed to select treenode with id %s.' % treenode_id
        rootnode = Treenode.objects.get(id=treenode_id, project=project_id)

        # Make sure this skeleton is not used in a sampler
        n_samplers = Sampler.objects.filter(skeleton=rootnode.skeleton).count()
        response_on_error = 'Neuron is used in a sampler, can\'t reroot'
        if n_samplers > 0:
            raise Exception('Skeleton {} is used in {} sampler(s)'.format(
                    rootnode.skeleton_id, n_samplers))

        # Obtain the treenode from the response
        first_parent = rootnode.parent_id

        # If no parent found it is assumed this node is already root
        if first_parent is None:
            return False

        response_on_error = 'An error occured while rerooting.'
        q_treenode = Treenode.objects.filter(
                skeleton_id=rootnode.skeleton_id,
                project=project_id).values_list('id', 'parent_id', 'confidence')
        nodes = {tnid: (parent_id, confidence) for (tnid, parent_id, confidence) in list(q_treenode)}

        # Traverse up the chain of parents, reversing the parent relationships so
        # that the selected treenode (with ID treenode_id) becomes the root.
        new_parents = []
        new_parent = rootnode.id
        new_confidence = rootnode.confidence
        node = first_parent

        while True:
            # Store current values to be used in next iteration
            parent, confidence = nodes[node]

            # Set new values
            new_parents.append((node, new_parent, new_confidence))

            if parent is None:
                # Root has been reached
                break
            else:
                # Prepare next iteration
                new_parent = node
                new_confidence = confidence
                node = parent

        # Finally make treenode root
        new_parents.append((rootnode.id, 'NULL', 5)) # Reset to maximum confidence.

        cursor = connection.cursor()
        cursor.execute('''
                UPDATE treenode
                SET parent_id = v.parent_id,
                    confidence = v.confidence
                FROM (VALUES %s) v(id, parent_id, confidence)
                WHERE treenode.id = v.id
                ''' % ','.join(['(%s,%s,%s)' % node for node in new_parents]))

        return rootnode

    except Exception as e:
        raise Exception('{}: {}'.format(response_on_error,  str(e)))


def _root_as_parent(oid):
    """ Returns True if the parent group of the given element ID is the root group. """
    cursor = connection.cursor()
    # Try to select the parent group of the parent group;
    # if none, then the parent group is the root group.
    cursor.execute('''
    SELECT count(*)
    FROM class_instance_class_instance cici1,
         class_instance_class_instance cici2,
         relation r
    WHERE cici1.class_instance_a = %s
      AND cici1.class_instance_b = cici2.class_instance_a
      AND cici1.relation_id = r.id
      AND r.relation_name = 'part_of'
      AND cici2.class_instance_a = cici1.class_instance_b
      AND cici2.relation_id = r.id
    ''' % int(oid))
    return 0 == cursor.fetchone()[0]

@requires_user_role(UserRole.Annotate)
def join_skeleton(request:HttpRequest, project_id=None) -> JsonResponse:
    """ An user with an Annotate role can join two skeletons if the neurons
    modeled by these skeletons are not locked by another user or if the current
    user belongs to the group of the user who locked the neurons. A super-user
    can join any skeletons.
    """
    response_on_error = 'Failed to join'
    try:
        from_treenode_id = int(request.POST.get('from_id', None))
        to_treenode_id = int(request.POST.get('to_id', None))
        annotation_set = request.POST.get('annotation_set', None)
        if annotation_set:
            annotation_set = json.loads(annotation_set)
        sampler_handling = request.POST.get('sampler_handling', None)

        join_info = _join_skeleton(request.user, from_treenode_id, to_treenode_id,
                project_id, annotation_set, sampler_handling)

        response_on_error = 'Could not log actions.'

        return JsonResponse({
            'message': 'success',
            'fromid': from_treenode_id,
            'toid': to_treenode_id,
            'result_skeleton_id': join_info['from_skeleton_id'],
            'deleted_skeleton_id': join_info['to_skeleton_id']
        })

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def make_annotation_map(annotation_vs_user_id, neuron_id, cursor=None) -> Dict:
    """ Create a mapping of annotation IDs to dictionaries with 'user_id',
    'edition_time' and 'creation_time' fields.
    """
    cursor = cursor or connection.cursor()
    annotation_map = dict()

    # Update annotation-info mapping
    for annotation_id, annotator_id in annotation_vs_user_id.items():
        annotation_map[annotation_id] = {
            'user_id': annotator_id
        }

    # Extend annotation maps with creation time and edition time of the link to
    # neuron to make sure these dates won't change during the split.
    cursor.execute('''
        SELECT ci.name, MIN(cici.creation_time), MIN(cici.edition_time)
        FROM class_instance ci
        JOIN class_instance_class_instance cici
            ON ci.id = cici.class_instance_b
        WHERE cici.class_instance_a = %s
        GROUP BY ci.id
    ''', (neuron_id,))
    for row in cursor.fetchall():
        entry = annotation_map.get(row[0])
        if entry:
            entry['creation_time'] = row[1]
            entry['edition_time'] = row[2]

    return annotation_map


def _join_skeleton(user, from_treenode_id, to_treenode_id, project_id,
        annotation_map, sampler_handling=None) -> Dict[str, Any]:
    """ Take the IDs of two nodes, each belonging to a different skeleton, and
    make to_treenode be a child of from_treenode, and join the nodes of the
    skeleton of to_treenode into the skeleton of from_treenode, and delete the
    former skeleton of to_treenode. All annotations in annotation_set will be
    linked to the skeleton of to_treenode. It is expected that <annotation_map>
    is a dictionary, mapping an annotation to an annotator ID. Also, all
    reviews of the skeleton that changes ID are changed to refer to the new
    skeleton ID. If annotation_map is None, the resulting skeleton will have
    all annotations available on both skeletons combined.

    If samplers link to one or both ot the input skeletons, a sampler handling
    mode is required. Otherwise, the merge operation is canceled.
    """
    if from_treenode_id is None or to_treenode_id is None:
        raise Exception('Missing arguments to _join_skeleton')

    response_on_error = ''
    try:
        from_treenode_id = int(from_treenode_id)
        to_treenode_id = int(to_treenode_id)

        try:
            from_treenode = Treenode.objects.get(pk=from_treenode_id)
        except Treenode.DoesNotExist:
            raise Exception("Could not find a skeleton for treenode #%s" % from_treenode_id)

        try:
            to_treenode = Treenode.objects.get(pk=to_treenode_id)
        except Treenode.DoesNotExist:
            raise Exception("Could not find a skeleton for treenode #%s" % to_treenode_id)

        from_skid = from_treenode.skeleton_id
        from_neuron = _get_neuronname_from_skeletonid( project_id, from_skid )

        to_skid = to_treenode.skeleton_id
        to_neuron = _get_neuronname_from_skeletonid( project_id, to_skid )

        if from_skid == to_skid:
            raise Exception('Cannot join treenodes of the same skeleton, this would introduce a loop.')

        # Make sure the user has permissions to edit both neurons
        can_edit_class_instance_or_fail(
                user, from_neuron['neuronid'], 'neuron')
        can_edit_class_instance_or_fail(
                user, to_neuron['neuronid'], 'neuron')

        # If samplers reference this skeleton, make sure they are updated as well
        sampler_info = _update_samplers_in_merge(project_id, user.id, from_skid, to_skid,
                from_treenode.id, to_treenode.id, sampler_handling, "delete-samplers")

        cursor = connection.cursor()

        # We are going to change the skeleton ID of the "to" neuron, therefore
        # all its nodes need to be locked to prevent modification from other
        # transactions. To prevent a skeleton ID change of the "from" skeleton
        # (which survives the merge), it is enough to lock the merge target
        # node. The NOWAIT option results in an error if no lock can be
        # obtained.
        cursor.execute('''
            SELECT 1 FROM treenode_connector tc
            WHERE tc.skeleton_id = %(consumed_skeleton_id)s
            ORDER BY tc.id
            FOR NO KEY UPDATE OF tc NOWAIT;

            SELECT 1 FROM treenode t
            WHERE t.skeleton_id = %(consumed_skeleton_id)s
            ORDER BY t.id
            FOR NO KEY UPDATE OF t NOWAIT;

            SELECT 1 FROM treenode t
            WHERE t.id = %(target_node_id)s
            ORDER BY t.id
            FOR NO KEY UPDATE OF t NOWAIT;
        ''', {
            'consumed_skeleton_id': to_skid,
            'target_node_id': from_treenode_id,
        })

        # Check if annotations are valid, if there is a particular selection
        if annotation_map is None:
            # Get all current annotations of both skeletons and merge them for
            # a complete result set.
            from_annotation_info = get_annotation_info(project_id, (from_skid,),
                    annotations=True, metaannotations=False, neuronnames=False)
            to_annotation_info = get_annotation_info(project_id, (to_skid,),
                    annotations=True, metaannotations=False, neuronnames=False)
            # Create a new annotation map with the expected structure of
            # 'annotationname' vs. 'annotator id'.
            def merge_into_annotation_map(source, skid, target):
                skeletons = source['skeletons']
                if skeletons and skid in skeletons:
                    for a in skeletons[skid]['annotations']:
                        annotation = source['annotations'][a['id']]
                        target[annotation] = a['uid']
            # Merge from after to, so that it overrides entries from the merged
            # in skeleton.
            annotation_map = dict()
            merge_into_annotation_map(to_annotation_info, to_skid, annotation_map)
            merge_into_annotation_map(from_annotation_info, from_skid, annotation_map)
        else:
            if not check_annotations_on_join(project_id, user,
                    from_neuron['neuronid'], to_neuron['neuronid'],
                    frozenset(annotation_map.keys())):
                raise Exception("Annotation distribution is not valid for joining. " \
                "Annotations for which you don't have permissions have to be kept!")

        # Find oldest creation_time and edition_time
        winning_map = make_annotation_map(annotation_map, from_neuron['neuronid'])
        losing_map = make_annotation_map(annotation_map, to_neuron['neuronid'])
        for k,v in losing_map.items():
            winning_entry = winning_map.get(k)
            if winning_entry:
                for field in ('creation_time', 'edition_time'):
                    losing_time = v.get(field)
                    winning_time = winning_entry.get(field)
                    if losing_time and winning_time:
                        winning_entry[field] = min(winning_time, losing_time)

        # Reroot to_skid at to_treenode if necessary
        response_on_error = 'Could not reroot at treenode %s' % to_treenode_id
        _reroot_skeleton(to_treenode_id, project_id)

        # The target skeleton is removed and its treenode assumes
        # the skeleton id of the from-skeleton.

        response_on_error = 'Could not update Treenode table with new skeleton id for joined treenodes.'

        Treenode.objects.filter(skeleton=to_skid).update(skeleton=from_skid)
        cursor.execute("""
            -- Set transaction user ID to update skeleton summary more precicely in trigger function.
            SET LOCAL catmaid.user_id=%(user_id)s;
            UPDATE treenode
            SET skeleton_id = %(from_skeleton_id)s
            WHERE skeleton_id = %(to_skeleton_id)s
        """, {
            'user_id': user.id,
            'from_skeleton_id': from_skid,
            'to_skeleton_id': to_skid,
        })

        response_on_error = 'Could not update TreenodeConnector table.'
        TreenodeConnector.objects.filter(
            skeleton=to_skid).update(skeleton=from_skid)

        # Update reviews from 'losing' neuron to now belong to the new neuron
        response_on_error = 'Could not update reviews with new skeleton IDs for joined treenodes.'
        Review.objects.filter(skeleton_id=to_skid).update(skeleton=from_skid)

        # Remove skeleton of to_id (deletes cicic part_of to neuron by cascade,
        # leaving the parent neuron dangling in the object tree).
        response_on_error = 'Could not delete skeleton with ID %s.' % to_skid
        ClassInstance.objects.filter(pk=to_skid).delete()

        # Update the parent of to_treenode.
        response_on_error = 'Could not update parent of treenode with ID %s' % to_treenode_id
        Treenode.objects.filter(id=to_treenode_id).update(parent=from_treenode_id, editor=user)

        # Update linked annotations of neuron
        response_on_error = 'Could not update annotations of neuron ' \
                'with ID %s' % from_neuron['neuronid']
        _update_neuron_annotations(project_id, from_neuron['neuronid'],
                winning_map, to_neuron['neuronid'])

        # Remove the 'losing' neuron if it is empty
        _delete_if_empty(to_neuron['neuronid'])

        from_location = (from_treenode.location_x, from_treenode.location_y,
                         from_treenode.location_z)
        insert_into_log(project_id, user.id, 'join_skeleton',
                from_location, 'Joined skeleton with ID %s (neuron: ' \
                '%s) into skeleton with ID %s (neuron: %s, annotations: %s)' % \
                (to_skid, to_neuron['neuronname'], from_skid,
                        from_neuron['neuronname'], ', '.join(winning_map.keys())))

        response = {
            'from_skeleton_id': from_skid,
            'to_skeleton_id': to_skid
        }

        if sampler_info and sampler_info['n_samplers'] > 0:
            response['samplers'] = {
                'n_deleted_intervals': sampler_info['n_deleted_intervals'],
                'n_deleted_domains': sampler_info['n_deleted_domains'],
                'n_added_domains': sampler_info['n_added_domains'],
                'n_added_intervals': sampler_info['n_added_intervals'],
            }

        return response

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


def _update_samplers_in_merge(project_id, user_id, win_skeleton_id, lose_skeleton_id,
        win_treenode_id, lose_treenode_id, win_sampler_handling,
        lose_sampler_handling) -> Optional[Dict[str, Any]]:
    """Update the sampler configuration for the passed in skeletons under the
    assumption that this is part of a merge operation.
    """
    samplers = Sampler.objects.prefetch_related('samplerdomain_set',
            'samplerdomain_set__samplerdomainend_set',
            'samplerdomain_set__samplerinterval_set').filter(
                    skeleton_id__in=[win_skeleton_id, lose_skeleton_id])
    n_samplers = len(samplers)

    # If there are no samplers linked, return early
    if not n_samplers:
        return None

    sampler_index = defaultdict(list) # type: DefaultDict[Any, List]
    for s in samplers:
        sampler_index[s.skeleton_id].append(s)

    known_win_sampler_handling_modes =("create-intervals", "branch",
            "domain-end", "new-domain")
    known_lose_sampler_handling_modes = ("delete-samplers",)
    if win_sampler_handling not in known_win_sampler_handling_modes:
        raise ValueError("Samplers in use on skeletons. Unknown "
                "(winning) sampler handling mode: {}".format(win_sampler_handling))
    if lose_sampler_handling not in known_lose_sampler_handling_modes:
        raise ValueError("Samplers in use on skeletons. Unknown "
                "(losing) sampler handling mode: {}".format(lose_sampler_handling))

    n_deleted_intervals = 0
    n_deleted_domains = 0
    n_added_intervals = 0
    n_added_domains = 0
    n_added_domain_ends = 0

    # If there are samplers linked to the losing skeleton, delete them if
    # allowed or complain otherwise.
    n_samplers_lose = len(sampler_index[lose_skeleton_id])
    if n_samplers_lose:
        if lose_sampler_handling == "delete-samplers":
            # Delete samplers that link to losing skeleton
            Sampler.objects.filter(project_id=project_id,
                    skeleton_id=lose_skeleton_id).delete()
            # TODO Update n_deleted_*
        else:
            raise ValueError("The losing merge skeleton is referenced "
                    "by {} sampler(s), merge aborted.".format(n_samplers_lose))

    # Construct a networkx graph for the winning skeleton
    cursor = connection.cursor()
    cursor.execute('''
        SELECT t.id, t.parent_id FROM treenode t WHERE t.skeleton_id = %s
        ORDER BY t.id
    ''', [win_skeleton_id])
    # build the networkx graph from it
    graph = nx.DiGraph()
    for row in cursor.fetchall():
        graph.add_node(row[0])
        if row[1]:
            # edge from parent_id to id
            graph.add_edge(row[1], row[0])

    cursor.execute('''
        SELECT t.id, t.parent_id FROM treenode t WHERE t.skeleton_id = %s
        ORDER BY t.id
        ''', [lose_skeleton_id]) # no need to sanitize
    # build the networkx graph from it
    lose_graph = nx.DiGraph()
    for row in cursor.fetchall():
        lose_graph.add_node(row[0])
        if row[1]:
            # edge from parent_id to id
            lose_graph.add_edge(row[1], row[0])

    lose_graph_end_nodes = [x for x in lose_graph.nodes_iter()
            if lose_graph.out_degree(x)==0 and lose_graph.in_degree(x)==1]

    regular_domain_type = SamplerDomainType.objects.get(name='regular')

    # Update each sampler
    n_samplers_win = len(sampler_index[win_skeleton_id])
    for sampler in sampler_index[win_skeleton_id]:
        # Each sampler references the skeleton through domains and
        # intervals. Action is only required if the merge is performed into an
        # existing domain. Therefore, iterate over domains and check if the
        # merge point is in them.
        # TODO What happens when merge is into interval, but into a newly traced
        # branch on that interval.
        matching_domains = []
        for domain in sampler.samplerdomain_set.all():
            domain_ends = domain.samplerdomainend_set.all()
            domain_end_map = dict(map(lambda de: (de.end_node_id, de.id), domain_ends))
            domain_end_ids = set(domain_end_map.keys())
            # Construct a graph for the domain and split it too.
            domain_graph = nx.DiGraph()
            create_subgraph(graph, domain_graph, domain.start_node_id, domain_end_ids)

            # If the subgraph is empty, this domain doesn't intersect with
            # the split off part. Therefore, this domain needs no update.
            if domain_graph.size() == 0:
                continue

            if domain_graph.has_node(win_treenode_id):
                matching_domains.append({
                    'domain': domain,
                    'graph': domain_graph,
                })

        if len(matching_domains) > 1:
            raise ValueError("The merge point is part of multiple sampler "
                    "domains in the same sampler, please pick one of the "
                    "adjecent points.")

        # If the merge point is not part of any domain in this sampler,
        # continue. No update is needed here.
        if len(matching_domains) == 0:
            continue;


        # We expect a single domain at the moment
        domain_info = matching_domains[0]
        domain = domain_info['domain']
        domain_graph = domain_info['graph']

        # Figure out some basic properties about the node
        is_domain_start = win_treenode_id == domain.start_node_id
        is_domain_end = win_treenode_id in domain_end_ids

        # Check if the winning merge treenode is the start of an interval in
        # this sampler.
        cursor.execute("""
            SELECT id
            FROM catmaid_samplerinterval
            WHERE project_id = %(project_id)s
            AND domain_id= %(domain_id)s
            AND (start_node_id = %(treenode_id)s
                OR end_node_id = %(treenode_id)s)
        """, {
            'domain_id': domain.id,
            'project_id': project_id,
            'treenode_id': win_treenode_id,
        })
        start_end_intervals = cursor.fetchall()

        is_interval_start_or_end = len(start_end_intervals) > 0
        #is_in_interval = 
        #is_in_traced_out_part = not is_domain_end




        # For each domain in this sampler in which the winning merging treenode
        # is contained, we need to update the
        new_domain_ends = []
        if win_sampler_handling == "create-intervals":
            raise ValueError("Extending an existing sampler domain using a "
                    "merge is not yet supported")
        elif win_sampler_handling == "branch":
            # Nothing needs to be done here if the winning merge node is not an
            # interval start or end. If it is, an error is raised in this mode,
            # because we don't treat interval start/end branches as part of the
            # interval.
            if is_interval_start_or_end:
                raise ValueError("Please merge into an adjacent node, because "
                        "the current target ({}) is a start or end of an interval".format(win_treenode_id))
            else:
                # It doesn't matter whether this fragment is merged into an
                # interval or not.
                pass
        elif win_sampler_handling == "domain-end" or \
                win_sampler_handling == "new-domain":
            if is_domain_start:
                # If we merge into a domain start and want to keep the domain
                # integrity, we need to add a new end at the losing treenode.
                new_domain_ends.append(lose_treenode_id)
            elif is_domain_end:
                # If we merge into a domain end and want to keep this the end,
                # nothing has to be done. Regardless of whether it is a leaf or
                # not.
                pass
            #elif is_in_interval:
            #    new_domain_ends.append(lose_treenode_id)

                #if is_in_traced_out_part:
                    # A traced out fragment isn't part of the initial interval,
                    # but has been added while tracing out the interval. To
                    # maintain this as a part of this domain, we need to add
                    # regular intervals on this branch (starting from the last
                    # regular interval node and add the losing treenode as
                    # domain end.
                    # TODO
                    #new_domain_ends.append(lose_treenode_id)
            else:
                # If we merge into the domain, but not into an interval, make
                # sure the domain isn't extended here by adding a new domain end
                # ad the merged in node.
                new_domain_ends.append(lose_treenode_id)

            if win_sampler_handling == "new-domain":
                # Add new domain
                new_domain = SamplerDomain.objects.create(project_id=project_id,
                        user_id=user_id, sampler=sampler, start_node_id=lose_treenode_id,
                        domain_type=regular_domain_type)
                n_added_domains += 1
                for leaf in lose_graph_end_nodes:
                    SamplerDomainEnd.objects.create(domain=new_domain,
                            end_node_id=leaf)
                    n_added_domain_ends += 1

        # Add new domain ends
        for end_node in new_domain_ends:
            SamplerDomainEnd.objects.create(domain=domain, end_node_id=end_node)
            n_added_domain_ends += 1

    return {
        'n_samplers': n_samplers_win + n_samplers_lose,
        'n_samplers_win': n_samplers_win,
        'n_samplers_lose': n_samplers_lose,
        'n_deleted_intervals': n_deleted_intervals,
        'n_deleted_domains': n_deleted_domains,
        'n_added_intervals': n_added_intervals,
        'n_added_domains': n_added_domains,
        'n_added_domain_ends': n_added_domain_ends,
    }


@api_view(['POST'])
@requires_user_role(UserRole.Import)
def import_skeleton(request:HttpRequest, project_id=None) -> Union[HttpResponse, HttpResponseBadRequest]:
    """Import a neuron modeled by a skeleton from an uploaded file.

    Currently only SWC representation is supported.
    ---
    consumes: multipart/form-data
    parameters:
      - name: neuron_id
        description: >
            If specified a request for a particular neuron ID is expressed. If
            force = true, this request is enforced and the existing neuron ID
            (and all its skeletons) is replaced (as long as they are in the
            target project). If force = false (default), the neuron ID is only
            used if available and a new one is generated otherwise.
        paramType: form
        type: integer
      - name: skeleton_id
        description: >
            If specified a request for a particular skeleton ID is expressed. If
            force = true, this request is enforced and the existing skeleton ID
            (and all its neurons) is replaced (as long as they are in the target
            project). If force = false (default), the skeleton ID is only used
            if available and a new one is generated otherwise.
        paramType: form
        type: integer
      - name: force
        description: >
            If neuron_id or skeleton_id are passed in, existing neuron/skeleton
            instances in this project are replaced. All their respectively
            linked skeletons and neurons will be removed.
        type: boolean
        required: false
        defaultValue: false
        paramType: form
      - name: auto_id
        description: >
            If a passed in neuron ID or skeleton ID is already in use, a new ID
            will be selected automatically (default). If auto_id is set to false,
            an error is raised in this situation.
        type: boolean
        required: false
        defaultValue: true
        paramType: form
      - name: name
        description: >
            If specified, the name of a new neuron will be set to this.
        paramType: form
        type: string
      - name: file
        required: true
        description: A skeleton representation file to import.
        paramType: body
        dataType: File
    type:
        neuron_id:
            type: integer
            required: true
            description: ID of the neuron used or created.
        skeleton_id:
            type: integer
            required: true
            description: ID of the imported skeleton.
        node_id_map:
            required: true
            description: >
                An object whose properties are node IDs in the import file and
                whose values are IDs of the created nodes.
    """
    project_id = int(project_id)
    neuron_id = request.POST.get('neuron_id', None)
    if neuron_id is not None:
        neuron_id = int(neuron_id)
    skeleton_id = request.POST.get('skeleton_id', None)
    if skeleton_id is not None:
        skeleton_id = int(skeleton_id)
    force = get_request_bool(request.POST, 'force', False)
    auto_id = get_request_bool(request.POST, 'auto_id', True)
    name = request.POST.get('name', None)

    if len(request.FILES) == 1:
        for uploadedfile in request.FILES.values():
            if uploadedfile.size > settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE:
                return HttpResponse('File too large. Maximum file size is {} bytes.'.format(settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE), status=413)

            filename = uploadedfile.name
            extension = filename.split('.')[-1].strip().lower()
            if extension == 'swc':
                swc_string = '\n'.join([line.decode('utf-8') for line in uploadedfile])
                return import_skeleton_swc(request.user, project_id, swc_string,
                        neuron_id, skeleton_id, name, force, auto_id)
            else:
                return HttpResponse('File type "{}" not understood. Known file types: swc'.format(extension), status=415)

    return HttpResponseBadRequest('No file received.')


def import_skeleton_swc(user, project_id, swc_string, neuron_id=None,
        skeleton_id=None, name=None, force=False, auto_id=True) -> JsonResponse:
    """Import a neuron modeled by a skeleton in SWC format.
    """

    g = nx.DiGraph()
    for line in swc_string.splitlines():
        if line.startswith('#') or not line.strip():
            continue
        row = line.strip().split()
        if len(row) != 7:
            raise ValueError('SWC has a malformed line: {}'.format(line))

        node_id = int(row[0])
        parent_id = int(row[6])
        g.add_node(node_id, {'x': float(row[2]),
                             'y': float(row[3]),
                             'z': float(row[4]),
                             'radius': float(row[5])})

        if parent_id != -1:
            g.add_edge(parent_id, node_id)

    if not nx.is_directed_acyclic_graph(g):
        raise ValueError('SWC skeleton is malformed: it contains a cycle.')

    import_info = _import_skeleton(user, project_id, g, neuron_id, skeleton_id,
            name, force, auto_id)
    node_id_map = {n: d['id'] for n, d in import_info['graph'].nodes_iter(data=True)}

    return JsonResponse({
            'neuron_id': import_info['neuron_id'],
            'skeleton_id': import_info['skeleton_id'],
            'node_id_map': node_id_map,
        })


def _import_skeleton(user, project_id, arborescence, neuron_id=None,
        skeleton_id=None, name=None, force=False, auto_id=True) -> Dict[str, Any]:
    """Create a skeleton from a networkx directed tree.

    Associate the skeleton to the specified neuron, or a new one if none is
    provided. Returns a dictionary of the neuron and skeleton IDs, and the
    original arborescence with attributes added for treenode IDs.
    """
    # TODO: There is significant reuse here of code from create_treenode that
    # could be DRYed up.
    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    new_neuron = None
    if neuron_id is not None:
        # Check that the neuron to use exists
        try:
            existing_neuron = ClassInstance.objects.select_related('class_column').get(pk=neuron_id)
            if force:
                if existing_neuron.project_id != project_id:
                    raise ValueError("Target neuron exists, but is part of other project")

                if existing_neuron.class_column.class_name != 'neuron':
                    raise ValueError("Existing object with ID {} is not a neuron, but marked as {}".format(
                            existing_neuron.id, existing_neuron.class_column.class_name))

                # Remove all data linked to this neuron, including skeletons
                cici = ClassInstanceClassInstance.objects.filter(
                        class_instance_b=neuron_id,
                        relation_id=relation_map['model_of'],
                        class_instance_a__class_column_id=class_map['skeleton'])

                # Raise an Exception if the user doesn't have permission to
                # edit the existing neuron.
                can_edit_class_instance_or_fail(user, neuron_id, 'neuron')
                # Raise an Exception if the user doesn't have permission to
                # edit the existing skeleton.
                for skeleton_link in cici:
                    old_skeleton = skeleton_link.class_instance_a
                    can_edit_class_instance_or_fail(user, old_skeleton.id, 'class_instance')
                    # Require users to have edit permission on all treenodes of the
                    # skeleton.
                    treenodes = Treenode.objects.filter(skeleton_id=old_skeleton.id,
                            project_id=project_id)
                    treenode_ids = treenodes.values_list('id', flat=True)
                    can_edit_all_or_fail(user, treenode_ids, 'treenode')

                    # Remove existing skeletons
                    skeleton_link.delete()
                    old_skeleton.delete()
                    treenodes.delete()

                new_neuron = existing_neuron
            elif auto_id:
                # The neuron ID exists already, and with force=False no data
                # will be replaced.
                neuron_id = None
            else:
                raise ValueError("The passed in neuron ID is already in use and "
                        "neither of the parameters force or auto_id are set to true.")
        except ClassInstance.DoesNotExist:
            # The neuron ID is okay to use
            pass

    new_skeleton = None
    if skeleton_id is not None:
        # Check that the skeleton to use exists
        try:
            existing_skeleton = ClassInstance.objects.get(pk=skeleton_id)
            if force:
                if existing_skeleton.project_id != project_id:
                    raise ValueError("Target skeleton exists, but is part of other project")

                if existing_skeleton.class_column.class_name != 'skeleton':
                    raise ValueError("Existing object with ID {} is not a skeleton, but marked as {}".format(
                            existing_skeleton.id, existing_skeleton.class_column.class_name))

                # Remove all data linked to this neuron, including skeletons
                cici = ClassInstanceClassInstance.objects.filter(
                        class_instance_a=skeleton_id,
                        relation_id=relation_map['model_of'],
                        class_instance_b__class_column_id=class_map['neuron'])

                # Raise an Exception if the user doesn't have permission to
                # edit the existing skeleton.
                can_edit_class_instance_or_fail(user, skeleton_id, 'skeleton')
                # Require users to have edit permission on all treenodes of the
                # skeleton.
                treenodes = Treenode.objects.filter(skeleton_id=skeleton_id,
                        project_id=project_id)
                treenode_ids = treenodes.values_list('id', flat=True)
                # Raise an Exception if the user doesn't have permission to
                # edit the existing treenodes.
                can_edit_all_or_fail(user, treenode_ids, 'treenode')
                for link in cici:
                    old_neuron = link.class_instance_b
                    can_edit_class_instance_or_fail(user, old_neuron.id, 'class_instance')

                    # Remove existing skeletons
                    link.delete()
                    old_neuron.delete()
                    treenodes.delete()

                new_skeleton = existing_skeleton
            elif auto_id:
                # The skeleton ID exists already, and with force=False no data
                # will be replaced.
                skeleton_id = None
            else:
                raise ValueError("The passed in skeleton ID is already in use and "
                        "neither of the parameters force or auto_id are set to true.")
        except ClassInstance.DoesNotExist:
            # The skeleton ID is okay to use
            pass

    if not new_skeleton:
        new_skeleton = ClassInstance()
        new_skeleton.id = skeleton_id

    new_skeleton.user = user
    new_skeleton.project_id = project_id
    new_skeleton.class_column_id = class_map['skeleton']
    if name is not None:
        new_skeleton.name = name
    else:
        new_skeleton.name = 'skeleton'
        new_skeleton.save()
        new_skeleton.name = 'skeleton %d' % new_skeleton.id

    new_skeleton.save()
    skeleton_id = new_skeleton.id

    def relate_neuron_to_skeleton(neuron, skeleton):
        return _create_relation(user, project_id,
                relation_map['model_of'], skeleton, neuron)

    if not new_neuron:
        new_neuron = ClassInstance()
        new_neuron.id = neuron_id

    new_neuron.user = user
    new_neuron.project_id = project_id
    new_neuron.class_column_id = class_map['neuron']
    if name is not None:
        new_neuron.name = name
    else:
        new_neuron.name = 'neuron'
        new_neuron.save()
        new_neuron.name = 'neuron %d' % new_neuron.id

    new_neuron.save()
    neuron_id = new_neuron.id

    has_new_neuron_id = new_neuron.id == neuron_id
    has_new_skeleton_id = new_skeleton.id == skeleton_id

    relate_neuron_to_skeleton(neuron_id, new_skeleton.id)

    # For pathological networks this can error, so do it before inserting
    # treenodes.
    root = find_root(arborescence)
    if root is None:
        raise Exception('No root, provided graph is malformed!')

    # Bulk create the required number of treenodes. This must be done in two
    # steps because treenode IDs are not known.
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO treenode (project_id, location_x, location_y, location_z,
            editor_id, user_id, skeleton_id)
        SELECT t.project_id, t.x, t.x, t.x, t.user_id, t.user_id, t.skeleton_id
        FROM (VALUES (%(project_id)s, 0, %(user_id)s, %(skeleton_id)s))
            AS t (project_id, x, user_id, skeleton_id),
            generate_series(1, %(num_treenodes)s)
        RETURNING treenode.id
    """, {
        'project_id': int(project_id),
        'user_id': user.id,
        'skeleton_id': new_skeleton.id,
        'num_treenodes': arborescence.number_of_nodes()
    })
    treenode_ids = cursor.fetchall()
    # Flatten IDs
    treenode_ids = list(chain.from_iterable(treenode_ids))
    nx.set_node_attributes(arborescence, 'id', dict(zip(arborescence.nodes(), treenode_ids)))

    # Set parent node ID
    for n, nbrs in arborescence.adjacency_iter():
        for nbr in nbrs:
            arborescence.node[nbr]['parent_id'] = arborescence.node[n]['id']
            if not 'radius' in arborescence.node[nbr]:
                arborescence.node[nbr]['radius'] = -1
    arborescence.node[root]['parent_id'] = None
    if not 'radius' in arborescence.node[root]:
        arborescence.node[root]['radius'] = -1
    new_location = tuple([arborescence.node[root][k] for k in ('x', 'y', 'z')])

    treenode_template = '(' + '),('.join('%s,%s,%s,%s,%s,%s' for n, d in arborescence.nodes_iter(data=True))  + ')'
    treenode_values = list(chain.from_iterable([d['id'], d['x'], d['y'], d['z'], d['parent_id'], d['radius']] \
            for n, d in arborescence.nodes_iter(data=True)))
    # Include skeleton ID for index performance.
    cursor.execute("""
        UPDATE treenode SET
            location_x = v.x,
            location_y = v.y,
            location_z = v.z,
            parent_id = v.parent_id,
            radius = v.radius
        FROM (VALUES {}) AS v(id, x, y, z, parent_id, radius)
        WHERE treenode.id = v.id
            AND treenode.skeleton_id = %s
    """.format(treenode_template), treenode_values + [new_skeleton.id])

    # Log import.
    insert_into_log(project_id, user.id, 'create_neuron',
                    new_location, 'Create neuron %d and skeleton '
                    '%d via import' % (new_neuron.id, new_skeleton.id))

    if neuron_id or skeleton_id:
        # Reset ID sequence if IDs have been passed in.
        cursor.execute("""
            SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM concept;
            SELECT setval('location_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM location;
        """)

    return {
        'neuron_id': neuron_id,
        'skeleton_id': new_skeleton.id,
        'graph': arborescence,
        'has_new_neuron_id': has_new_neuron_id,
        'has_new_skeleton_id': has_new_skeleton_id,
    }


@requires_user_role(UserRole.Annotate)
def reset_own_reviewer_ids(request:HttpRequest, project_id=None, skeleton_id=None) -> JsonResponse:
    """ Remove all reviews done by the requsting user in the skeleten with ID
    <skeleton_id>.
    """
    skeleton_id = int(skeleton_id) # sanitize
    Review.objects.filter(skeleton_id=skeleton_id, reviewer=request.user).delete()
    insert_into_log(project_id, request.user.id, 'reset_reviews',
                    None, 'Reset reviews for skeleton %s' % skeleton_id)
    return JsonResponse({'status': 'success'})


@requires_user_role(UserRole.Browse)
def annotation_list(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Returns a JSON serialized object that contains information about the
    given skeletons.
    """
    skeleton_ids = tuple(int(v) for k,v in request.POST.items()
            if k.startswith('skeleton_ids['))
    annotations = bool(int(request.POST.get("annotations", 0)))
    metaannotations = bool(int(request.POST.get("metaannotations", 0)))
    neuronnames = bool(int(request.POST.get("neuronnames", 0)))
    ignore_invalid = get_request_bool(request.POST, "ignore_invalid", False)

    response = get_annotation_info(project_id, skeleton_ids, annotations,
                                   metaannotations, neuronnames, ignore_invalid)

    return JsonResponse(response)


def get_annotation_info(project_id, skeleton_ids, annotations, metaannotations,
                        neuronnames, ignore_invalid=False) -> Dict[str, Any]:
    if not skeleton_ids:
        raise ValueError("No skeleton IDs provided")

    classes = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    cursor = connection.cursor()

    # Create a map of skeleton IDs to neuron IDs
    cursor.execute("""
        SELECT cici.class_instance_a, cici.class_instance_b
        FROM class_instance_class_instance cici
        WHERE cici.project_id = %s AND
              cici.relation_id = %s AND
              cici.class_instance_a IN %s
    """, (project_id, relations['model_of'], skeleton_ids))
    n_to_sk_ids = {n:s for s,n in cursor.fetchall()}
    neuron_ids = n_to_sk_ids.keys()

    if not neuron_ids:
        raise Http404('No skeleton or neuron found')

    # Query for annotations of the given skeletons, specifically
    # neuron_id, auid, aid and aname.
    cursor.execute("""
        SELECT cici.class_instance_a AS neuron_id, cici.user_id AS auid,
               cici.class_instance_b AS aid, ci.name AS aname
        FROM class_instance_class_instance cici INNER JOIN
             class_instance ci ON cici.class_instance_b = ci.id
        WHERE cici.relation_id = %s AND
              cici.class_instance_a IN (%s) AND
              ci.class_id = %s
    """ % (relations['annotated_with'],
           ','.join(map(str, neuron_ids)),
           classes['annotation']))

    # Build result dictionaries: one that maps annotation IDs to annotation
    # names and another one that lists annotation IDs and annotator IDs for
    # each skeleton ID.
    annotations = {}
    skeletons = {} # type: Dict
    for row in cursor.fetchall():
        skid, auid, aid, aname = n_to_sk_ids[row[0]], row[1], row[2], row[3]
        if aid not in annotations:
            annotations[aid] = aname
        skeleton = skeletons.get(skid)
        if not skeleton:
            skeleton = {'annotations': []}
            skeletons[skid] = skeleton
        skeleton['annotations'].append({
            'uid': auid,
            'id': aid,
        })

    # Assemble response
    response = {
        'annotations': annotations,
        'skeletons': skeletons,
    }

    # If wanted, get the neuron name of each skeleton
    if neuronnames:
        cursor.execute("""
            SELECT ci.id, ci.name
            FROM class_instance ci
            WHERE ci.id IN (%s)
        """ % (','.join(map(str, neuron_ids))))
        response['neuronnames'] = {n_to_sk_ids[n]:name for n,name in cursor.fetchall()}

    # If wanted, get the meta annotations for each annotation
    if metaannotations and len(annotations):
        # Request only ID of annotated annotations, annotator ID, meta
        # annotation ID, meta annotation Name
        cursor.execute("""
            SELECT cici.class_instance_a AS aid, cici.user_id AS auid,
                   cici.class_instance_b AS maid, ci.name AS maname
            FROM class_instance_class_instance cici INNER JOIN
                 class_instance ci ON cici.class_instance_b = ci.id
            WHERE cici.project_id = %s AND
                  cici.relation_id = %s AND
                  cici.class_instance_a IN (%s) AND
                  ci.class_id = %s
        """ % (project_id, relations['annotated_with'],
               ','.join(map(str, annotations.keys())),
               classes['annotation']))

        # Add this to the response
        metaannotations = {}
        for row in cursor.fetchall():
            aaid, auid, maid, maname = row[0], row[1], row[2], row[3]
            if maid not in annotations:
                annotations[maid] = maname
            annotation = metaannotations.get(aaid)
            if not annotation:
                annotation = {'annotations': []}
                metaannotations[aaid] = annotation
            annotation['annotations'].append({
                'uid': auid,
                'id': maid,
            })
        response['metaannotations'] = metaannotations

    return response


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def list_skeletons(request:HttpRequest, project_id) -> JsonResponse:
    """List skeletons matching filtering criteria.

    The result set is the intersection of skeletons matching criteria (the
    criteria are conjunctive) unless stated otherwise.
    ---
    parameters:
        - name: created_by
          description: Filter for user ID of the skeletons' creator.
          type: integer
          paramType: query
        - name: reviewed_by
          description: Filter for user ID of the skeletons' reviewer.
          type: integer
          paramType: query
        - name: from_date
          description: Filter for skeletons with nodes created after this date.
          type: string
          format: date
          paramType: query
        - name: to_date
          description: Filter for skeletons with nodes created before this date.
          type: string
          format: date
          paramType: query
        - name: nodecount_gt
          description: |
            Filter for skeletons with more nodes than this threshold. Removes
            all other criteria.
          type: integer
          paramType: query
    type:
    - type: array
      items:
        type: integer
        description: ID of skeleton matching the criteria.
      required: true
    """
    created_by = request.GET.get('created_by', None)
    reviewed_by = request.GET.get('reviewed_by', None)
    from_date = request.GET.get('from', None)
    to_date = request.GET.get('to', None)
    nodecount_gt = int(request.GET.get('nodecount_gt', 0))

    # Sanitize
    if reviewed_by:
        reviewed_by = int(reviewed_by)
    if created_by:
        created_by = int(created_by)
    if from_date:
        from_date = datetime.strptime(from_date, '%Y%m%d')
    if to_date:
        to_date = datetime.strptime(to_date, '%Y%m%d')

    response = _list_skeletons(project_id, created_by, reviewed_by, from_date, to_date, nodecount_gt)
    return JsonResponse(response, safe=False)


def _list_skeletons(project_id, created_by=None, reviewed_by=None, from_date=None,
          to_date=None, nodecount_gt=0) -> List:
    """ Returns a list of skeleton IDs of which nodes exist that fulfill the
    given constraints (if any). It can be constrained who created nodes in this
    skeleton during a given period of time. Having nodes that are reviewed by
    a certain user is another constraint. And so is the node count that one can
    specify which each result node must exceed.
    """
    if created_by and reviewed_by:
        raise ValueError("Please specify node creator or node reviewer")

    params = {
        'project_id': project_id,
    }

    if reviewed_by:
        params['reviewed_by'] = reviewed_by
        query = '''
            SELECT DISTINCT r.skeleton_id
            FROM review r
            WHERE r.project_id=%(project_id)s
            AND r.reviewer_id=%(reviewed_by)s
        '''

        if from_date:
            params['from_date'] = from_date.isoformat()
            query += " AND r.review_time >= %(from_date)s"
        if to_date:
            to_date = to_date + timedelta(days=1)
            params['to_date'] = to_date.isoformat()
            query += " AND r.review_time < %(to_date)s"
    else:
        query = '''
            SELECT skeleton_id
            FROM catmaid_skeleton_summary css
            WHERE css.project_id=%(project_id)s
        '''

    if created_by:
        query = '''
            SELECT DISTINCT skeleton_id
            FROM treenode t
            WHERE t.project_id=%(project_id)s
              AND t.user_id=%(created_by)s
        '''
        params['created_by'] = created_by

        if from_date:
            params['from_date'] = from_date.isoformat()
            query += " AND t.creation_time >= %(from_date)s"
        if to_date:
            to_date = to_date + timedelta(days=1)
            params['to_date'] = to_date.isoformat()
            query += " AND t.creation_time < %(to_date)s"

    if nodecount_gt > 0:
        params['nodecount_gt'] = nodecount_gt
        query = '''
            SELECT s.skeleton_id
            FROM ({}) q JOIN catmaid_skeleton_summary s
            ON q.skeleton_id = s.skeleton_id
            WHERE s.num_nodes > %(nodecount_gt)s
        '''.format(query)

    cursor = connection.cursor()
    cursor.execute(query, params)
    return [r[0] for r in cursor.fetchall()]

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def adjacency_matrix(request:HttpRequest, project_id=None) -> JsonResponse:
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )

    nodeslist = [ {'group': 1,
                   'id': k,
                   'name': d['neuronname']} for k,d in skelgroup.graph.nodes_iter(data=True)  ]
    nodesid_list = [ele['id'] for ele in nodeslist]

    data = {
        'nodes': nodeslist,
        'links': [ {'id': '%i_%i' % (u,v),
                    'source': nodesid_list.index(u),
                    'target': nodesid_list.index(v),
                    'value': d['count']} for u,v,d in skelgroup.graph.edges_iter(data=True)  ]
    }

    return JsonResponse(data, json_dumps_params={'sort_keys': True, 'indent': 4})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeletonlist_subgraph(request:HttpRequest, project_id=None) -> JsonResponse:
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )

    data = {
        'nodes': [ {'id': str(k),
                    'label': str(d['baseName']),
                    'skeletonid': str(d['skeletonid']),
                    'node_count': d['node_count']
                    } for k,d in skelgroup.graph.nodes_iter(data=True)  ],
        'edges': [ {'id': '%i_%i' % (u,v),
                    'source': str(u),
                    'target': str(v),
                    'weight': d['count'],
                    'label': str(d['count']),
                    'directed': True} for u,v,d in skelgroup.graph.edges_iter(data=True)  ]
    }

    return JsonResponse(data, json_dumps_params={'sort_keys': True, 'indent': 4})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeletonlist_confidence_compartment_subgraph(request:HttpRequest, project_id=None) -> JsonResponse:
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    confidence = int(request.POST.get('confidence_threshold', 5))
    p = get_object_or_404(Project, pk=project_id)
    # skelgroup = SkeletonGroup( skeletonlist, p.id )
    # split up where conficence bigger than confidence
    resultgraph = compartmentalize_skeletongroup_by_confidence( skeletonlist, p.id, confidence )

    data = {
        'nodes': [ { 'data': {'id': str(k),
                    'label': str(d['neuronname']),
                    'skeletonid': str(d['skeletonid']),
                    'node_count': d['node_count']} } for k,d in resultgraph.nodes_iter(data=True)  ],
        'edges': [ { 'data': {'id': '%s_%s' % (u,v),
                    'source': str(u),
                    'target': str(v),
                    'weight': d['count'],
                    'label': str(d['count']),
                    'directed': True}} for u,v,d in resultgraph.edges_iter(data=True)  ]
    }

    return JsonResponse(data, json_dumps_params={'sort_keys': True, 'indent': 4})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeletonlist_edgecount_compartment_subgraph(request:HttpRequest, project_id=None) -> JsonResponse:
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    edgecount = int(request.POST.get('edgecount', 10))
    p = get_object_or_404(Project, pk=project_id)
    # skelgroup = SkeletonGroup( skeletonlist, p.id )
    # split up where conficence bigger than confidence
    resultgraph = compartmentalize_skeletongroup_by_edgecount( skeletonlist, p.id, edgecount )

    data = {
        'nodes': [ { 'data': {'id': str(k),
                    'label': str(d['neuronname']),
                    'skeletonid': str(d['skeletonid']),
                    'node_count': d['node_count']} } for k,d in resultgraph.nodes_iter(data=True)  ],
        'edges': [ { 'data': {'id': '%s_%s' % (u,v),
                    'source': str(u),
                    'target': str(v),
                    'weight': d['count'],
                    'label': str(d['count']),
                    'directed': True}} for u,v,d in resultgraph.edges_iter(data=True)  ]
    }

    return JsonResponse(data, json_dumps_params={'sort_keys': True, 'indent': 4})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def all_shared_connectors(request:HttpRequest, project_id=None) -> JsonResponse:
    skeletonlist = request.POST.getlist('skeletonlist[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )
    return JsonResponse(dict.fromkeys(skelgroup.all_shared_connectors()))


@api_view(['GET', 'POST'])
@requires_user_role([UserRole.Browse])
def skeletons_by_node_labels(request:HttpRequest, project_id=None) -> JsonResponse:
    """Return relationship between label IDs and skeleton IDs
    ---
    parameters:
        - name: label_ids[]
          description: IDs of the labels to find skeletons associated with
          required: true
          type: array
          items:
            type: integer
          paramType: form
        - name: label_names[]
          description: Alternative to `label_ids` to pass in a list label names.
          required: true
          type: array
          items:
            type: string
          paramType: form
    type:
        - type: array
          items:
          type: integer
          description: array of [label_id, [skel_id1, skel_id2, skel_id3, ...]] tuples
          required: true
    """
    label_ids = get_request_list(request.POST, 'label_ids', default=[], map_fn=int)
    label_names = get_request_list(request.POST, 'label_names', default=[])

    if not label_ids and not label_names:
        return JsonResponse([], safe=False)

    label_class = Class.objects.get(project=project_id, class_name='label')
    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')

    if label_names:
        extra_label_ids = ClassInstance.objects.filter(project_id=project_id,
                class_column=label_class, name__in=label_names).values_list('id', flat=True)
        label_ids.extend(extra_label_ids)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT ci.id, array_agg(DISTINCT t.skeleton_id)
          FROM treenode t
          JOIN treenode_class_instance tci
            ON t.id = tci.treenode_id
          JOIN class_instance ci
            ON tci.class_instance_id = ci.id
          JOIN UNNEST(%(label_ids)s::int[]) label(id)
            ON label.id = ci.id
          WHERE ci.project_id = %(project_id)s
            AND tci.relation_id = %(labeled_as)s
          GROUP BY ci.id;
    """, {
        'label_ids': label_ids,
        'project_id': int(project_id),
        'labeled_as': labeled_as_relation.id
    })

    return JsonResponse(cursor.fetchall(), safe=False)


def get_skeletons_in_bb(params) -> List:
    cursor = connection.cursor()
    extra_joins = []
    extra_where = []

    min_nodes = params.get('min_nodes', 0)
    min_cable = params.get('min_cable', 0)
    needs_summary = min_nodes > 0 or min_cable > 0
    provider = params.get('src', 'postgis2d')
    skeleton_ids = params.get('skeleton_ids')
    node_query = ""

    if needs_summary:
        extra_joins.append("""
            JOIN catmaid_skeleton_summary css
                ON css.skeleton_id = skeleton.id
        """)

    if min_nodes > 1:
        extra_where.append("""
            css.num_nodes >= %(min_nodes)s
        """)

    if min_cable > 0:
        extra_where.append("""
            css.cable_length >= %(min_cable)s
        """)

    if skeleton_ids:
        extra_joins.append("""
            JOIN UNNEST(%(skeleton_ids)s::int[]) query_skeleton(id)
                ON query_skeleton.id = skeleton.id
        """)

    if provider == 'postgis2d':
        node_query = """
            SELECT DISTINCT t.skeleton_id
            FROM (
              SELECT te.id, te.edge
                FROM treenode_edge te
                WHERE floatrange(ST_ZMin(te.edge),
                     ST_ZMax(te.edge), '[]') && floatrange(%(minz)s, %(maxz)s, '[)')
                  AND te.project_id = %(project_id)s
              ) e
              JOIN treenode t
                ON t.id = e.id
              WHERE e.edge && ST_MakeEnvelope(%(minx)s, %(miny)s, %(maxx)s, %(maxy)s)
                AND ST_3DDWithin(e.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                    ST_MakePoint(%(minx)s, %(miny)s, %(halfz)s),
                    ST_MakePoint(%(maxx)s, %(miny)s, %(halfz)s),
                    ST_MakePoint(%(maxx)s, %(maxy)s, %(halfz)s),
                    ST_MakePoint(%(minx)s, %(maxy)s, %(halfz)s),
                    ST_MakePoint(%(minx)s, %(miny)s, %(halfz)s)]::geometry[])),
                    %(halfzdiff)s)
        """
    elif provider == 'postgis3d':
        node_query = """
            SELECT DISTINCT t.skeleton_id
            FROM treenode_edge te
            JOIN treenode t
                ON t.id = te.id
            WHERE te.edge &&& ST_MakeLine(ARRAY[
                ST_MakePoint(%(minx)s, %(maxy)s, %(maxz)s),
                ST_MakePoint(%(maxx)s, %(miny)s, %(minz)s)] ::geometry[])
            AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                ST_MakePoint(%(minx)s, %(miny)s, %(halfz)s),
                ST_MakePoint(%(maxx)s, %(miny)s, %(halfz)s),
                ST_MakePoint(%(maxx)s, %(maxy)s, %(halfz)s),
                ST_MakePoint(%(minx)s, %(maxy)s, %(halfz)s),
                ST_MakePoint(%(minx)s, %(miny)s, %(halfz)s)]::geometry[])),
                %(halfzdiff)s)
            AND te.project_id = %(project_id)s
        """
    else:
        raise ValueError('Need valid node provider (src)')


    if extra_where:
        extra_where_val = 'WHERE ' + '\nAND '.join(extra_where)
    else:
        extra_where_val = ''

    query = """
        SELECT skeleton.id
        FROM (
            {node_query}
        ) skeleton(id)
        {extra_joins}
        {extra_where}
    """.format(**{
        'extra_joins': '\n'.join(extra_joins),
        'extra_where': extra_where_val,
        'node_query': node_query,
    })

    cursor.execute(query, params)

    return [r[0] for r in cursor.fetchall()]


@api_view(['GET', 'POST'])
@requires_user_role(UserRole.Browse)
def skeletons_in_bounding_box(request:HttpRequest, project_id) -> JsonResponse:
    """Get a list of all skeletons that intersect with the passed in bounding
    box. Optionally, only a subsed of passed in skeletons can be tested against.
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
    - name: min_nodes
      description: |
        A minimum number of nodes per result skeleton
      required: false
      required: false
      defaultValue: 0
      type: float
      paramType: form
    - name: min_cable
      description: |
        A minimum number of cable length per result skeleton
      required: false
      defaultValue: 0
      type: float
      paramType: form
    - name: volume_id
      description: |
        Alternative to manual bounding box definition. The bounding box of the
        volume is used.
      required: false
      defaultValue: 0
      type: integer
      paramType: form
    - name: skeleton_ids
      description: |
        An optional list of skeleton IDs that should only be tested againt. If
        used, the result will only contain skeletons of this set.
      required: false
      defaultValue: 0
      type: array
      items:
        type: integer
      paramType: form
    type:
        - type: array
          items:
            type: integer
          description: array of skeleton IDs
          required: true
    """
    project_id = int(project_id)

    if request.method == 'GET':
        data = request.GET
    elif request.method == 'POST':
        data = request.POST
    else:
        raise ValueError("Unsupported HTTP method: " + request.method)

    params = {
        'project_id': project_id,
        'limit': data.get('limit', 0)
    }

    volume_id = data.get('volume_id')
    if volume_id is not None:
        volume = get_volume_details(project_id, volume_id)
        bbmin, bbmax = volume['bbox']['min'], volume['bbox']['max']
        params['minx'] = bbmin['x']
        params['miny'] = bbmin['y']
        params['minz'] = bbmin['z']
        params['maxx'] = bbmax['x']
        params['maxy'] = bbmax['y']
        params['maxz'] = bbmax['z']
    else:
        for p in ('minx', 'miny', 'minz', 'maxx', 'maxy', 'maxz', 'float'):
            params[p] = float(data.get(p, 0))

    params['halfzdiff'] = abs(params['maxz'] - params['minz']) * 0.5
    params['halfz'] = params['minz'] + (params['maxz'] - params['minz']) * 0.5
    params['min_nodes'] = int(data.get('min_nodes', 0))
    params['min_cable'] = int(data.get('min_cable', 0))
    params['skeleton_ids'] = get_request_list(data, 'skeleton_ids', map_fn=int)


    skeleton_ids = get_skeletons_in_bb(params)
    return JsonResponse(skeleton_ids, safe=False)


@api_view(['GET'])
@requires_user_role([UserRole.Browse])
def change_history(request:HttpRequest, project_id=None) -> JsonResponse:
    """Return the history of all skeletons ID changes in project over time.
    Optionally, this can be constrained by a user ID and a time window.
    ---
    parameters:
        - name: project_id
          description: Project to operate in
          required: true
          type: integer
          paramType: path
        - name: initial_user_id
          description: User who caused the first change in all returned skeleton.
          required: false
          type: integer
          paramType: form
        - name: changes_after
          description: |
            Date of format YYYY-MM-DDTHH:mm:ss, only the date part is required.
            Limits returns history to skeleton changes after this date.
          required: false
          type: string
          paramType: form
        - name: changes_before
          description: |
            Date of format YYYY-MM-DDTHH:mm:ss, only the date part is required.
            Limits returns history to skeleton changes before this date.
          required: false
          type: string
          paramType: form
        - name: skeleton_ids
          description: Skeleton IDs of the initial set of treenodes.
          required: false
          type: array
          paramType: form
    type:
        - type: array
          items:
          type: string
          description: |
            array of arrays, each representing a unique skeleton path in
            historic order, newest last.
          required: true
    """
    initial_user_id = request.GET.get('initial_user_id')
    changes_after = request.GET.get('changes_after')
    changes_before = request.GET.get('changes_before')
    skeleton_ids = get_request_list(request.GET, 'skeleton_ids', map_fn=int)

    init_constraints = ['project_id = %(project_id)s']
    constraints = ['project_id = %(project_id)s']

    if initial_user_id is not None:
        init_constraints.append("cti.user_id = %(initial_user_id)s")

    if changes_after:
        init_constraints.append("edition_time > %(changes_after)s")
        constraints.append("execution_time > %(changes_after)s")

    if changes_before:
        init_constraints.append("execution_time > %(changes_before)s")
        constraints.append("execution_time > %(changes_before)s")

    if skeleton_ids:
        init_constraints.append('skeleton_id = ANY(ARRAY[%(skeleton_ids)s])')

    if not init_constraints:
        raise ValueError("Please provide at least one constraint")

    # 1. Get all relevant initial transactions
    # 2. Find treenode IDs modified by those transactions
    # 3. Get all history and live table entries for those treenodes, ordered by
    #    transaction execution time, oldest last. History entries come first, live
    #    entries are last.
    # 4. Collect all referenced skeleton IDs from ordered treenodes. This results in
    #    a skeleton ID path for each treenode. To reduce this to distinct paths, a
    #    textual representation is done for each (id:id:id…) and only distinct values
    #    are selected. This should allow then to get fragment skeleton ID changes
    #    through merges and splits.
    cursor = connection.cursor()
    cursor.execute("""
        WITH skeleton_class AS (
                SELECT id as class_id
                FROM class
                WHERE project_id = %(project_id)s
                    AND class_name = 'skeleton'
        ),
        changed_treenodes AS (
                SELECT t.id, t.skeleton_id, MIN(txid) as txid, MIN(edition_time) as edition_time
                FROM (
                        /* Deleted skeletons from history */
                        select th.id as id, th.skeleton_id as skeleton_id, MIN(th.txid) as txid, MIN(th.edition_time) as edition_time from treenode__history th
                        /* where th.exec_transaction_id = txs.transaction_id */
                        {init_constraints}
                        group by th.id, th.skeleton_id
                        union all
                        /* Current skeletons */
                        select t.id as id, t.skeleton_id as skeleton_id, MIN(t.txid) as txid, MIN(t.edition_time) as edition_time from treenode t
                        /* where t.txid = txs.transaction_id */
                        {init_constraints}
                        GROUP BY t.id, t.skeleton_id
                ) t
                GROUP BY id, t.skeleton_id
        ),
        all_changed_skeletons AS (
                SELECT ct.id, ct.skeleton_id, -1 as pos, ct.edition_time, ct.txid
                FROM changed_treenodes ct
                UNION
                SELECT th.id as treenode_id, th.skeleton_id, 0 as pos, th.edition_time, th.txid as txid
                FROM changed_treenodes ct
                JOIN treenode__history th
                        ON th.id = ct.id
                WHERE th.txid > ct.txid
                UNION
                SELECT t.id, t.skeleton_id, 1 as pos, t.edition_time, t.txid
                FROM changed_treenodes ct
                JOIN treenode t
                        ON t.id = ct.id
                WHERE t.txid > ct.txid
        ),
        agg_skeletons AS (
                SELECT string_agg(skeleton_id::text, ':' ORDER BY pos ASC, txid ASC) as key,
                    array_agg(skeleton_id ORDER BY pos ASC, txid ASC) AS skeleton_ids,
                    array_agg(txid ORDER BY pos ASC, txid ASC) AS txids,
                    max(pos) as present
                    /*array_agg(edition_time ORDER BY pos ASC, txid ASC) AS times*/
                FROM all_changed_skeletons
                GROUP BY id
        )
        /*
        ,agg_treenodes AS (
                SELECT key, skeleton_ids[1]::text || '-' || skeleton_ids[array_length(skeleton_ids, 1)]::text as begin_end, count(*) as c, skeleton_ids, max(present) as present
                FROM agg_skeletons
                GROUP BY key, skeleton_ids
                ORDER BY key
        )
        */
        SELECT skeleton_ids, count(*), max(present) FROM agg_skeletons
        GROUP BY key, skeleton_ids
        ORDER BY skeleton_ids[0], count(*) DESC;
        /*
        SELECT begin_end, SUM(c), max(present) from agg_treenodes
        GROUP BY begin_end, skeleton_ids[1], skeleton_ids[array_length(skeleton_ids, 1)]
        ORDER by skeleton_ids[1], sum(c) desc;
        */
    """.format(**{
        'init_constraints': ('WHERE ' if init_constraints else '') + ' AND '.join(init_constraints),
        'constraints': ('WHERE ' if constraints else '') + ' AND '.join(constraints),
    }), {
        'project_id': project_id,
        'initial_user_id': initial_user_id,
        'changes_after': changes_after,
        'changes_before': changes_before,
        'skeleton_ids': skeleton_ids,
    })

    return JsonResponse(cursor.fetchall(), safe=False)
