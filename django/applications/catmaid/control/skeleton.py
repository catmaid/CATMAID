import json
import networkx as nx
import pytz
import re
import six

from operator import itemgetter
from datetime import datetime, timedelta
from collections import defaultdict
from itertools import chain

from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest, Http404, \
        JsonResponse
from django.shortcuts import get_object_or_404
from django.db import connection
from django.db.models import Q
from django.views.decorators.cache import never_cache

from rest_framework.decorators import api_view

from catmaid.models import Project, UserRole, Class, ClassInstance, Review, \
        ClassInstanceClassInstance, Relation, Treenode, TreenodeConnector
from catmaid.objects import Skeleton, SkeletonGroup, \
        compartmentalize_skeletongroup_by_edgecount, \
        compartmentalize_skeletongroup_by_confidence
from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail, can_edit_or_fail
from catmaid.control.common import insert_into_log, get_class_to_id_map, \
        get_relation_to_id_map, _create_relation, get_request_list
from catmaid.control.neuron import _delete_if_empty
from catmaid.control.neuron_annotations import create_annotation_query, \
        _annotate_entities, _update_neuron_annotations
from catmaid.control.review import get_review_status
from catmaid.control.tree_util import find_root, reroot, edge_count_to_root


def get_skeleton_permissions(request, project_id, skeleton_id):
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
def open_leaves(request, project_id=None, skeleton_id=None):
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
def find_labels(request, project_id=None, skeleton_id=None):
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
def within_spatial_distance(request, project_id=None):
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
def skeleton_statistics(request, project_id=None, skeleton_id=None):
    p = get_object_or_404(Project, pk=project_id)
    skel = Skeleton( skeleton_id = skeleton_id, project_id = project_id )
    const_time = skel.measure_construction_time()
    construction_time = '{0} minutes {1} seconds'.format( const_time / 60, const_time % 60)
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
def contributor_statistics(request, project_id=None, skeleton_id=None):
    return contributor_statistics_multiple(request, project_id=project_id, skeleton_ids=[int(skeleton_id)])

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def contributor_statistics_multiple(request, project_id=None, skeleton_ids=None):
    contributors = defaultdict(int)
    n_nodes = 0
    # Count the total number of 20-second intervals with at least one treenode in them
    n_time_bins = 0
    n_review_bins = 0
    n_multi_review_bins = 0
    epoch = datetime.utcfromtimestamp(0).replace(tzinfo=pytz.utc)

    if not skeleton_ids:
        skeleton_ids = tuple(int(v) for k,v in six.iteritems(request.POST) if k.startswith('skids['))

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
        seen = set()
        min_review_bins = set()
        multi_review_bins = 0
        for reviewer, treenodes in sorted(six.iteritems(rev), key=itemgetter(1), reverse=True):
            reviewer_bins = set()
            for treenode, timestamp in six.iteritems(treenodes):
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
        rev[row[0]][row[1]] = row[2]

    # Process last one
    if rev:
        a, b = process_reviews(rev)
        n_review_bins += a
        n_multi_review_bins += b


    relations = {row[0]: row[1] for row in Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id').iterator()}

    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    synapses = {}
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
        'n_pre': sum(synapses[relations['presynaptic_to']].itervalues()),
        'n_post': sum(synapses[relations['postsynaptic_to']].itervalues()),
        'pre_contributors': synapses[relations['presynaptic_to']],
        'post_contributors': synapses[relations['postsynaptic_to']]})


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def node_count(request, project_id=None, skeleton_id=None, treenode_id=None):
    # Works with either the skeleton_id or the treenode_id
    p = get_object_or_404(Project, pk=project_id)
    if not skeleton_id:
        skeleton_id = Treenode.objects.get(pk=treenode_id).skeleton_id
    skeleton_id = int(skeleton_id)
    return JsonResponse({
        'count': Treenode.objects.filter(skeleton_id=skeleton_id).count(),
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
def neuronname(request, project_id=None, skeleton_id=None):
    return JsonResponse(_get_neuronname_from_skeletonid(project_id, skeleton_id))

def _neuronnames(skeleton_ids, project_id):
    qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=project_id,
            class_instance_a__in=skeleton_ids).select_related("class_instance_b").values_list("class_instance_a", "class_instance_b__name")
    return dict(qs)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def neuronnames(request, project_id=None):
    """ Returns a JSON object with skeleton IDs as keys and neuron names as values. """
    skeleton_ids = tuple(int(v) for k,v in six.iteritems(request.POST) if k.startswith('skids['))
    return JsonResponse(_neuronnames(skeleton_ids, project_id))

def check_annotations_on_split(project_id, skeleton_id, over_annotation_set,
        under_annotation_set):
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

def check_new_annotations(project_id, user, entity_id, annotation_set):
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
        ann_set):
    """ With respect to annotations, a join is only correct if the user doesn't
    remove annotations for which (s)he has no permissions.
    """
    return check_new_annotations(project_id, user, from_neuron_id, ann_set) and \
           check_new_annotations(project_id, user, to_neuron_id, ann_set)

@requires_user_role(UserRole.Annotate)
def split_skeleton(request, project_id=None):
    """ The split is only possible if the neuron is not locked or if it is
    locked by the current user or if the current user belongs to the group
    of the user who locked it. Of course, the split is also possible if
    the current user is a super-user. Also, all reviews of the treenodes in the
    new neuron are updated to refer to the new skeleton.
    """
    treenode_id = int(request.POST['treenode_id'])
    treenode = Treenode.objects.get(pk=treenode_id)
    skeleton_id = treenode.skeleton_id
    project_id = int(project_id)
    upstream_annotation_map = json.loads(request.POST.get('upstream_annotation_map'))
    downstream_annotation_map = json.loads(request.POST.get('downstream_annotation_map'))
    cursor = connection.cursor()

    # Check if the treenode is root!
    if not treenode.parent:
        return JsonResponse({'error': 'Can\'t split at the root node: it doesn\'t have a parent.'})

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
    _update_neuron_annotations(project_id, request.user, neuron.id,
            upstream_annotation_map)

    # Update annotations of under skeleton
    _annotate_entities(project_id, [new_neuron.id], downstream_annotation_map)

    # Log the location of the node at which the split was done
    location = (treenode.location_x, treenode.location_y, treenode.location_z)
    insert_into_log(project_id, request.user.id, "split_skeleton", location,
                    "Split skeleton with ID {0} (neuron: {1})".format( skeleton_id, neuron.name ) )

    return JsonResponse({'new_skeleton_id': new_skeleton.id, 'existing_skeleton_id': skeleton_id})


@api_view(['GET'])
@never_cache
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def root_for_skeleton(request, project_id=None, skeleton_id=None):
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
def skeleton_ancestry(request, project_id=None):
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

def _connected_skeletons(skeleton_ids, op, relation_id_1, relation_id_2, model_of_id, cursor):
    def newSynapseCounts():
        return [0, 0, 0, 0, 0]

    class Partner:
        def __init__(self):
            self.num_nodes = 0
            self.skids = defaultdict(newSynapseCounts) # skid vs synapse count

    # Dictionary of partner skeleton ID vs Partner
    def newPartner():
        return Partner()
    partners = defaultdict(newPartner)

    # Obtain the synapses made by all skeleton_ids considering the desired direction of the synapse, as specified by relation_id_1 and relation_id_2:
    cursor.execute('''
    SELECT t1.skeleton_id, t2.skeleton_id, LEAST(t1.confidence, t2.confidence)
    FROM treenode_connector t1,
         treenode_connector t2
    WHERE t1.skeleton_id = ANY(%s::integer[])
      AND t1.relation_id = %s
      AND t1.connector_id = t2.connector_id
      AND t1.id != t2.id
      AND t2.relation_id = %s
    ''', (list(skeleton_ids), int(relation_id_1), int(relation_id_2)))

    # Sum the number of synapses
    for srcID, partnerID, confidence in cursor.fetchall():
        partners[partnerID].skids[srcID][confidence - 1] += 1

    # There may not be any synapses
    if not partners:
        return partners, []

    # If op is AND, discard entries where only one of the skids has synapses
    if len(skeleton_ids) > 1 and 'AND' == op:
        for partnerID in partners.keys(): # keys() is a copy of the keys
            if len(skeleton_ids) != len(partners[partnerID].skids):
                del partners[partnerID]

    # With AND it is possible that no common partners exist
    if not partners:
        return partners, []

    # Obtain unique partner skeletons
    partner_skids = list(partners.iterkeys())

    # Count nodes of each partner skeleton
    cursor.execute('''
    SELECT skeleton_id, count(skeleton_id)
    FROM treenode
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

def _skeleton_info_raw(project_id, skeletons, op):
    cursor = connection.cursor()

    # Obtain the IDs of the 'presynaptic_to', 'postsynaptic_to' and 'model_of' relations
    cursor.execute('''
    SELECT relation_name,
           id
    FROM relation
    WHERE project_id=%s
      AND (relation_name='presynaptic_to'
        OR relation_name='postsynaptic_to'
        OR relation_name='gapjunction_with'
        OR relation_name='model_of')''' % project_id)
    relation_ids = dict(cursor.fetchall())

    # Obtain partner skeletons and their info
    incoming, incoming_reviewers = _connected_skeletons(skeletons, op, relation_ids['postsynaptic_to'], relation_ids['presynaptic_to'], relation_ids['model_of'], cursor)
    outgoing, outgoing_reviewers = _connected_skeletons(skeletons, op, relation_ids['presynaptic_to'], relation_ids['postsynaptic_to'], relation_ids['model_of'], cursor)
    gapjunctions, gapjunctions_reviewers = _connected_skeletons(skeletons, op, relation_ids.get('gapjunction_with', -1), relation_ids.get('gapjunction_with', -1), relation_ids['model_of'], cursor)

    def prepare(partners):
        for partnerID in partners.keys():
            partner = partners[partnerID]
            skids = partner.skids
            # jsonize: swap class instance by its dict of members vs values
            if partner.skids:
                partners[partnerID] = partner.__dict__
            else:
                del partners[partnerID]

    prepare(incoming)
    prepare(outgoing)
    prepare(gapjunctions)

    return incoming, outgoing, gapjunctions, incoming_reviewers, outgoing_reviewers, gapjunctions_reviewers

@api_view(['POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_info_raw(request, project_id=None):
    """Retrieve a list of down/up-stream partners of a set of skeletons.

    From a queried set of source skeletons, find all upstream and downstream
    partners, the number of synapses between each source and each partner,
    and a list of reviewers for each partner set. Confidence distributions for
    each synapse count are included. Optionally find only those partners
    that are common between the source skeleton set.
    ---
    parameters:
        - name: source_skeleton_ids[]
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
    skeletons = tuple(int(v) for k,v in six.iteritems(request.POST) if k.startswith('source_skeleton_ids['))
    op = str(request.POST.get('boolean_op')) # values: AND, OR
    op = {'AND': 'AND', 'OR': 'OR'}[op] # sanitize

    incoming, outgoing, gapjunctions, incoming_reviewers, outgoing_reviewers, gapjunctions_reviewers = _skeleton_info_raw(project_id, skeletons, op)

    return JsonResponse({
                'incoming': incoming,
                'outgoing': outgoing,
                'gapjunctions': gapjunctions,
                'incoming_reviewers': incoming_reviewers,
                'outgoing_reviewers': outgoing_reviewers,
                'gapjunctions_reviewers': gapjunctions_reviewers})


@requires_user_role(UserRole.Browse)
def connectivity_matrix(request, project_id=None):
    # sanitize arguments
    project_id = int(project_id)
    rows = tuple(int(v) for k, v in six.iteritems(request.POST) if k.startswith('rows['))
    cols = tuple(int(v) for k, v in six.iteritems(request.POST) if k.startswith('columns['))

    matrix = get_connectivity_matrix(project_id, rows, cols)
    return JsonResponse(matrix)


def get_connectivity_matrix(project_id, row_skeleton_ids, col_skeleton_ids):
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

    # Obtain all synapses made between row skeletons and column skeletons.
    cursor.execute('''
    SELECT t1.skeleton_id, t2.skeleton_id
    FROM treenode_connector t1,
         treenode_connector t2
    WHERE t1.skeleton_id IN (%s)
      AND t2.skeleton_id IN (%s)
      AND t1.connector_id = t2.connector_id
      AND t1.relation_id = %s
      AND t2.relation_id = %s
    ''' % (','.join(map(str, row_skeleton_ids)),
           ','.join(map(str, col_skeleton_ids)),
           pre_rel_id, post_rel_id))

    # Build a sparse connectivity representation. For all skeletons requested
    # map a dictionary of partner skeletons and the number of synapses
    # connecting to each partner.
    outgoing = defaultdict(dict)
    for r in cursor.fetchall():
        source, target = r[0], r[1]
        mapping = outgoing[source]
        count = mapping.get(target, 0)
        mapping[target] = count + 1

    return outgoing


@api_view(['POST'])
@requires_user_role([UserRole.Browse, UserRole.Annotate])
def review_status(request, project_id=None):
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
    skeleton_ids = set(int(v) for k,v in six.iteritems(request.POST) if k.startswith('skeleton_ids['))
    whitelist = bool(json.loads(request.POST.get('whitelist', 'false')))
    whitelist_id = None
    user_ids = None
    if whitelist:
        whitelist_id = request.user.id
    else:
        user_ids = set(int(v) for k,v in six.iteritems(request.POST) if k.startswith('user_ids['))

    status = get_review_status(skeleton_ids, project_id=project_id,
            whitelist_id=whitelist_id, user_ids=user_ids)

    return JsonResponse(status)


@requires_user_role(UserRole.Annotate)
def reroot_skeleton(request, project_id=None):
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
        raise Exception(response_on_error + ':' + str(e))


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
def join_skeleton(request, project_id=None):
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

        join_info = _join_skeleton(request.user, from_treenode_id, to_treenode_id,
                project_id, annotation_set)

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


def _join_skeleton(user, from_treenode_id, to_treenode_id, project_id,
        annotation_map):
    """ Take the IDs of two nodes, each belonging to a different skeleton, and
    make to_treenode be a child of from_treenode, and join the nodes of the
    skeleton of to_treenode into the skeleton of from_treenode, and delete the
    former skeleton of to_treenode. All annotations in annotation_set will be
    linked to the skeleton of to_treenode. It is expected that <annotation_map>
    is a dictionary, mapping an annotation to an annotator ID. Also, all
    reviews of the skeleton that changes ID are changed to refer to the new
    skeleton ID. If annotation_map is None, the resulting skeleton will have
    all annotations available on both skeletons combined.
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

        # Reroot to_skid at to_treenode if necessary
        response_on_error = 'Could not reroot at treenode %s' % to_treenode_id
        _reroot_skeleton(to_treenode_id, project_id)

        # The target skeleton is removed and its treenode assumes
        # the skeleton id of the from-skeleton.

        response_on_error = 'Could not update Treenode table with new skeleton id for joined treenodes.'
        Treenode.objects.filter(skeleton=to_skid).update(skeleton=from_skid)

        response_on_error = 'Could not update TreenodeConnector table.'
        TreenodeConnector.objects.filter(
            skeleton=to_skid).update(skeleton=from_skid)

        # Update reviews from 'losing' neuron to now belong to the new neuron
        response_on_error = 'Couldn not update reviews with new skeleton IDs for joined treenodes.'
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
        _update_neuron_annotations(project_id, user, from_neuron['neuronid'],
                annotation_map, to_neuron['neuronid'])

        # Remove the 'losing' neuron if it is empty
        _delete_if_empty(to_neuron['neuronid'])

        from_location = (from_treenode.location_x, from_treenode.location_y,
                         from_treenode.location_z)
        insert_into_log(project_id, user.id, 'join_skeleton',
                from_location, 'Joined skeleton with ID %s (neuron: ' \
                '%s) into skeleton with ID %s (neuron: %s, annotations: %s)' % \
                (to_skid, to_neuron['neuronname'], from_skid,
                        from_neuron['neuronname'], ', '.join(annotation_map.keys())))

        return {
            'from_skeleton_id': from_skid,
            'to_skeleton_id': to_skid
        }

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@api_view(['POST'])
@requires_user_role(UserRole.Annotate)
def import_skeleton(request, project_id=None):
    """Import a neuron modeled by a skeleton from an uploaded file.

    Currently only SWC representation is supported.
    ---
    consumes: multipart/form-data
    parameters:
      - name: neuron_id
        description: >
            If specified, the imported skeleton will model this existing neuron.
        paramType: form
        type: integer
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

    neuron_id = request.POST.get('neuron_id', None)
    if neuron_id is not None:
        neuron_id = int(neuron_id)

    if len(request.FILES) == 1:
        for uploadedfile in request.FILES.itervalues():
            if uploadedfile.size > settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE:
                return HttpResponse('File too large. Maximum file size is {} bytes.'.format(settings.IMPORTED_SKELETON_FILE_MAXIMUM_SIZE), status=413)

            filename = uploadedfile.name
            extension = filename.split('.')[-1].strip().lower()
            if extension == 'swc':
                swc_string = '\n'.join(uploadedfile)
                return import_skeleton_swc(request.user, project_id, swc_string, neuron_id)
            else:
                return HttpResponse('File type "{}" not understood. Known file types: swc'.format(extension), status=415)

    return HttpResponseBadRequest('No file received.')


def import_skeleton_swc(user, project_id, swc_string, neuron_id=None):
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

    import_info = _import_skeleton(user, project_id, g, neuron_id)
    node_id_map = {n: d['id'] for n, d in import_info['graph'].nodes_iter(data=True)}

    return JsonResponse({
            'neuron_id': import_info['neuron_id'],
            'skeleton_id': import_info['skeleton_id'],
            'node_id_map': node_id_map,
        })


def _import_skeleton(user, project_id, arborescence, neuron_id=None, name=None):
    """Create a skeleton from a networkx directed tree.

    Associate the skeleton to the specified neuron, or a new one if none is
    provided. Returns a dictionary of the neuron and skeleton IDs, and the
    original arborescence with attributes added for treenode IDs.
    """
    # TODO: There is significant reuse here of code from create_treenode that
    # could be DRYed up.
    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    new_skeleton = ClassInstance()
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

    def relate_neuron_to_skeleton(neuron, skeleton):
        return _create_relation(user, project_id,
                relation_map['model_of'], skeleton, neuron)

    if neuron_id is not None:
        # Check that the neuron to use exists
        if 0 == ClassInstance.objects.filter(pk=neuron_id).count():
            neuron_id = None

    if neuron_id is not None:
        # Raise an Exception if the user doesn't have permission to
        # edit the existing neuron.
        can_edit_class_instance_or_fail(user, neuron_id, 'neuron')

    else:
        # A neuron does not exist, therefore we put the new skeleton
        # into a new neuron.
        new_neuron = ClassInstance()
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
        RETURNING treenode.id;
        """ % {
            'project_id': project_id,
            'user_id': user.id,
            'skeleton_id': new_skeleton.id,
            'num_treenodes': arborescence.number_of_nodes()})
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
    arborescence.node[root]['parent_id'] = 'NULL::bigint'
    if not 'radius' in arborescence.node[root]:
        arborescence.node[root]['radius'] = -1
    new_location = tuple([arborescence.node[root][k] for k in ('x', 'y', 'z')])

    treenode_values = \
            '),('.join([','.join(map(str, [d[k] for k in ('id', 'x', 'y', 'z', 'parent_id', 'radius')])) \
            for n, d in arborescence.nodes_iter(data=True)])
    cursor.execute("""
        UPDATE treenode SET
            location_x = v.x,
            location_y = v.y,
            location_z = v.z,
            parent_id = v.parent_id,
            radius = v.radius
        FROM (VALUES (%s)) AS v(id, x, y, z, parent_id, radius)
        WHERE treenode.id = v.id AND treenode.skeleton_id = %s
        """ % (treenode_values, new_skeleton.id)) # Include skeleton ID for index performance.

    # Log import.
    insert_into_log(project_id, user.id, 'create_neuron',
                    new_location, 'Create neuron %d and skeleton '
                    '%d via import' % (new_neuron.id, new_skeleton.id))

    return {'neuron_id': neuron_id, 'skeleton_id': new_skeleton.id, 'graph': arborescence}


@requires_user_role(UserRole.Annotate)
def reset_own_reviewer_ids(request, project_id=None, skeleton_id=None):
    """ Remove all reviews done by the requsting user in the skeleten with ID
    <skeleton_id>.
    """
    skeleton_id = int(skeleton_id) # sanitize
    Review.objects.filter(skeleton_id=skeleton_id, reviewer=request.user).delete()
    insert_into_log(project_id, request.user.id, 'reset_reviews',
                    None, 'Reset reviews for skeleton %s' % skeleton_id)
    return JsonResponse({'status': 'success'})


@requires_user_role(UserRole.Browse)
def annotation_list(request, project_id=None):
    """ Returns a JSON serialized object that contains information about the
    given skeletons.
    """
    skeleton_ids = tuple(int(v) for k,v in six.iteritems(request.POST)
            if k.startswith('skeleton_ids['))
    annotations = bool(int(request.POST.get("annotations", 0)))
    metaannotations = bool(int(request.POST.get("metaannotations", 0)))
    neuronnames = bool(int(request.POST.get("neuronnames", 0)))

    response = get_annotation_info(project_id, skeleton_ids, annotations,
                                   metaannotations, neuronnames)

    return JsonResponse(response)


def get_annotation_info(project_id, skeleton_ids, annotations, metaannotations,
                        neuronnames):
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
    skeletons = {}
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
def list_skeletons(request, project_id):
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
          to_date=None, nodecount_gt=0):
    """ Returns a list of skeleton IDs of which nodes exist that fulfill the
    given constraints (if any). It can be constrained who created nodes in this
    skeleton during a given period of time. Having nodes that are reviewed by
    a certain user is another constraint. And so is the node count that one can
    specify which each result node must exceed.
    """
    if created_by and reviewed_by:
        raise ValueError("Please specify node creator or node reviewer")

    if reviewed_by:
        params = [project_id, reviewed_by]
        query = '''
            SELECT DISTINCT r.skeleton_id
            FROM review r
            WHERE r.project_id=%s AND r.reviewer_id=%s
        '''

        if from_date:
            params.append(from_date.isoformat())
            query += " AND r.review_time >= %s"
        if to_date:
            to_date = to_date + timedelta(days=1)
            params.append(to_date.isoformat())
            query += " AND r.review_time < %s"
    else:
        params = [project_id]
        query = '''
            SELECT DISTINCT skeleton_id
            FROM treenode t
            WHERE t.project_id=%s
        '''

    if created_by:
        params.append(created_by)
        query += " AND t.user_id=%s"

        if from_date:
            params.append(from_date.isoformat())
            query += " AND t.creation_time >= %s"
        if to_date:
            to_date = to_date + timedelta(days=1)
            params.append(to_date.isoformat())
            query += " AND t.creation_time < %s"

    if nodecount_gt > 0:
        params.append(nodecount_gt)
        query = '''
            SELECT sub.skeleton_id
            FROM (
                SELECT t.skeleton_id AS skeleton_id, COUNT(*) AS count
                FROM (%s) q JOIN treenode t ON q.skeleton_id = t.skeleton_id
                GROUP BY t.skeleton_id
            ) AS sub WHERE sub.count > %%s
        ''' % query

    cursor = connection.cursor()
    cursor.execute(query, params)
    return [r[0] for r in cursor.fetchall()]

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def adjacency_matrix(request, project_id=None):
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
def skeletonlist_subgraph(request, project_id=None):
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
def skeletonlist_confidence_compartment_subgraph(request, project_id=None):
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
def skeletonlist_edgecount_compartment_subgraph(request, project_id=None):
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
def all_shared_connectors(request, project_id=None):
    skeletonlist = request.POST.getlist('skeletonlist[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )
    return JsonResponse(dict.fromkeys(skelgroup.all_shared_connectors()))


@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def skeletons_by_node_labels(request, project_id=None):
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
    type:
        - type: array
          items:
          type: integer
          description: array of [label_id, [skel_id1, skel_id2, skel_id3, ...]] tuples
          required: true
    """
    labels = get_request_list(request.POST, 'label_ids', map_fn=int)

    if not labels:
        return JsonResponse([], safe=False)

    interp_lst = ', '.join(['(%s)' for _ in labels])

    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')

    cursor = connection.cursor()
    cursor.execute("""
        SELECT ci.id, array_agg(DISTINCT t.skeleton_id)
          FROM treenode t
          JOIN treenode_class_instance tci
            ON t.id = tci.treenode_id
          JOIN class_instance ci
            ON tci.class_instance_id = ci.id
          JOIN (VALUES {}) label(id)
            ON label.id = ci.id
          WHERE ci.project_id = %s
            AND tci.relation_id = %s
          GROUP BY ci.id;
    """.format(interp_lst), labels + [int(project_id), labeled_as_relation.id])

    return JsonResponse(cursor.fetchall(), safe=False)
