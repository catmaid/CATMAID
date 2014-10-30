import json
import networkx as nx
from itertools import imap
from functools import partial
from collections import defaultdict
from math import sqrt
from datetime import datetime

from django.db import connection
from django.http import HttpResponse

from catmaid.models import UserRole, ClassInstance, Treenode, \
        TreenodeClassInstance, ConnectorClassInstance, Review
from catmaid.control import export_NeuroML_Level3
from catmaid.control.authentication import requires_user_role
from catmaid.control.review import get_treenodes_to_reviews, \
        get_treenodes_to_reviews_with_time

from tree_util import edge_count_to_root, partition
try:
    from exportneuroml import neuroml_single_cell, neuroml_network
except ImportError:
    print "NeuroML is not loading"


def get_treenodes_qs(project_id=None, skeleton_id=None, with_labels=True):
    treenode_qs = Treenode.objects.filter(skeleton_id=skeleton_id)
    if with_labels:
        labels_qs = TreenodeClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            treenode__skeleton_id=skeleton_id).select_related('treenode', 'class_instance')
        labelconnector_qs = ConnectorClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            connector__treenodeconnector__treenode__skeleton_id=skeleton_id).select_related('connector', 'class_instance')
    else:
        labels_qs = []
        labelconnector_qs = []
    return treenode_qs, labels_qs, labelconnector_qs


def get_swc_string(treenodes_qs):
    all_rows = []
    for tn in treenodes_qs:
        swc_row = [tn.id]
        swc_row.append(0)
        swc_row.append(tn.location_x)
        swc_row.append(tn.location_y)
        swc_row.append(tn.location_z)
        swc_row.append(max(tn.radius, 0))
        swc_row.append(-1 if tn.parent_id is None else tn.parent_id)
        all_rows.append(swc_row)
    result = ""
    for row in all_rows:
        result += " ".join(map(str, row)) + "\n"
    return result

def export_skeleton_response(request, project_id=None, skeleton_id=None, format=None):
    treenode_qs, labels_qs, labelconnector_qs = get_treenodes_qs(project_id, skeleton_id)

    if format == 'swc':
        return HttpResponse(get_swc_string(treenode_qs), content_type='text/plain')
    elif format == 'json':
        return HttpResponse(get_json_string(treenode_qs), content_type='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_skeleton_response" % (format,)


@requires_user_role(UserRole.Browse)
def compact_skeleton(request, project_id=None, skeleton_id=None, with_connectors=None, with_tags=None):
    """
        Performance-critical function. Do not edit unless to improve performance.

        Returns, in JSON, [[nodes], [connectors], {nodeID: [tags]}], with connectors and tags being empty when 0 == with_connectors and 0 == with_tags, respectively
    """

    # Sanitize
    project_id = int(project_id)
    skeleton_id = int(skeleton_id)
    with_connectors  = int(with_connectors)
    with_tags = int(with_tags)

    cursor = connection.cursor()

    cursor.execute('''
        SELECT id, parent_id, user_id,
               location_x, location_y, location_z,
               radius, confidence
        FROM treenode
        WHERE skeleton_id = %s
    ''' % skeleton_id)

    nodes = tuple(cursor.fetchall())

    if 0 == len(nodes):
        # Check if the skeleton exists
        if 0 == ClassInstance.objects.filter(pk=skeleton_id).count():
            raise Exception("Skeleton #%s doesn't exist" % skeleton_id)
        # Otherwise returns an empty list of nodes

    connectors = ()
    tags = defaultdict(list)

    if 0 != with_connectors or 0 != with_tags:
        # postgres is caching this query
        cursor.execute("SELECT relation_name, id FROM relation WHERE project_id=%s" % project_id)
        relations = dict(cursor.fetchall())

    if 0 != with_connectors:
        # Fetch all connectors with their partner treenode IDs
        cursor.execute('''
            SELECT tc.treenode_id, tc.connector_id, tc.relation_id,
                   c.location_x, c.location_y, c.location_z
            FROM treenode_connector tc,
                 connector c
            WHERE tc.skeleton_id = %s
              AND tc.connector_id = c.id
        ''' % skeleton_id)

        post = relations['postsynaptic_to']
        connectors = tuple((row[0], row[1], 1 if row[2] == post else 0, row[3], row[4], row[5]) for row in cursor.fetchall())

    if 0 != with_tags:
        # Fetch all node tags
        cursor.execute('''
            SELECT c.name, tci.treenode_id
            FROM treenode t,
                 treenode_class_instance tci,
                 class_instance c
            WHERE t.skeleton_id = %s
              AND t.id = tci.treenode_id
              AND tci.relation_id = %s
              AND c.id = tci.class_instance_id
        ''' % (skeleton_id, relations['labeled_as']))

        for row in cursor.fetchall():
            tags[row[0]].append(row[1])

    return HttpResponse(json.dumps((nodes, connectors, tags), separators=(',', ':')))


@requires_user_role(UserRole.Browse)
def compact_arbor(request, project_id=None, skeleton_id=None, with_nodes=None, with_connectors=None, with_tags=None):
    """
    Performance-critical function. Do not edit unless to improve performance.
    Returns, in JSON, [[nodes], [outputs], [inputs], {nodeID: [tags]}],
    with inputs and outputs being empty when 0 == with_connectors,
    and the dict of node tags being empty 0 == with_tags, respectively.

    The difference between this function and the compact_skeleton function is that
    the connectors contain the whole chain from the skeleton of interest to the
    partner skeleton:
    [treenode_id, confidence, relation_id
     connector_id,
     relation_id, confidence, treenode_id, skeleton_id]
    where the last 4 values correspond to the partner skeleton.
    Notice that the index in the array correponds to the position in the chain:
    (skeleton ->) treenode -> confidence -> relation -> connector -> relation -> confidence -> treenode -> skeleton.
    The relation_id is 0 for pre and 1 for post.
    """

    # Sanitize
    project_id = int(project_id)
    skeleton_id = int(skeleton_id)
    with_nodes = int(with_nodes)
    with_connectors  = int(with_connectors)
    with_tags = int(with_tags)

    cursor = connection.cursor()

    nodes = ()
    connectors = []
    tags = defaultdict(list)

    if 0 != with_nodes:
        cursor.execute('''
            SELECT id, parent_id, user_id,
                location_x, location_y, location_z,
                radius, confidence
            FROM treenode
            WHERE skeleton_id = %s
        ''' % skeleton_id)

        nodes = tuple(cursor.fetchall())

        if 0 == len(nodes):
            # Check if the skeleton exists
            if 0 == ClassInstance.objects.filter(pk=skeleton_id).count():
                raise Exception("Skeleton #%s doesn't exist" % skeleton_id)
            # Otherwise returns an empty list of nodes

    if 0 != with_connectors or 0 != with_tags:
        # postgres is caching this query
        cursor.execute("SELECT relation_name, id FROM relation WHERE project_id=%s" % project_id)
        relations = dict(cursor.fetchall())

    if 0 != with_connectors:
        # Fetch all inputs and outputs

        pre = relations['presynaptic_to']
        post = relations['postsynaptic_to']

        cursor.execute('''
            SELECT tc1.treenode_id, tc1.confidence,
                   tc1.connector_id,
                   tc2.confidence, tc2.treenode_id, tc2.skeleton_id,
                   tc1.relation_id, tc2.relation_id
            FROM treenode_connector tc1,
                 treenode_connector tc2
            WHERE tc1.skeleton_id = %s
              AND tc1.id != tc2.id
              AND tc1.connector_id = tc2.connector_id
              AND (tc1.relation_id = %s OR tc1.relation_id = %s)
        ''' % (skeleton_id, pre, post))

        for row in cursor.fetchall():
            # Ignore all other kinds of relation pairs (there shouldn't be any)
            if row[6] == pre and row[7] == post:
                connectors.append((row[0], row[1], row[2], row[3], row[4], row[5], 0, 1))
            elif row[6] == post and row[7] == pre:
                connectors.append((row[0], row[1], row[2], row[3], row[4], row[5], 1, 0))

    if 0 != with_tags:
        # Fetch all node tags
        cursor.execute('''
            SELECT c.name, tci.treenode_id
            FROM treenode t,
                 treenode_class_instance tci,
                 class_instance c
            WHERE t.skeleton_id = %s
              AND t.id = tci.treenode_id
              AND tci.relation_id = %s
              AND c.id = tci.class_instance_id
        ''' % (skeleton_id, relations['labeled_as']))

        for row in cursor.fetchall():
            tags[row[0]].append(row[1])

    return HttpResponse(json.dumps((nodes, connectors, tags), separators=(',', ':')))


@requires_user_role([UserRole.Browse])
def treenode_time_bins(request, project_id=None, skeleton_id=None):
    """ Return a map of time bins (minutes) vs. list of nodes. """
    minutes = defaultdict(list)
    epoch = datetime.utcfromtimestamp(0)

    for row in Treenode.objects.filter(skeleton_id=int(skeleton_id)).values_list('id', 'creation_time'):
        minutes[int((row[1] - epoch).total_seconds() / 60)].append(row[0])

    return HttpResponse(json.dumps(minutes, separators=(',', ':')))


@requires_user_role([UserRole.Browse])
def compact_arbor_with_minutes(request, project_id=None, skeleton_id=None, with_nodes=None, with_connectors=None, with_tags=None):
    r = compact_arbor(request, project_id=project_id, skeleton_id=skeleton_id, with_nodes=with_nodes, with_connectors=with_connectors, with_tags=with_tags)
    r.content = "%s, %s]" % (r.content[:-1], treenode_time_bins(request, project_id=project_id, skeleton_id=skeleton_id).content)
    return r


# THIS FUNCTION IS HEREBY DECLARED A MESS. Users of this function: split it up
def _skeleton_for_3d_viewer(skeleton_id, project_id, with_connectors=True, lean=0, all_field=False):
    """ with_connectors: when False, connectors are not returned
        lean: when not zero, both connectors and tags are returned as empty arrays. """
    skeleton_id = int(skeleton_id) # sanitize
    cursor = connection.cursor()

    # Fetch the neuron name
    cursor.execute(
        '''SELECT name
           FROM class_instance ci,
                class_instance_class_instance cici
           WHERE cici.class_instance_a = %s
             AND cici.class_instance_b = ci.id
        ''' % skeleton_id)
    row = cursor.fetchone()
    if not row:
        # Check that the skeleton exists
        cursor.execute('''SELECT id FROM class_instance WHERE id=%s''' % skeleton_id)
        if not cursor.fetchone():
            raise Exception("Skeleton #%s doesn't exist!" % skeleton_id)
        else:
            raise Exception("No neuron found for skeleton #%s" % skeleton_id)

    name = row[0]

    if all_field:
        added_fields = ', creation_time, edition_time'
    else:
        added_fields = ''

    # Fetch all nodes, with their tags if any
    cursor.execute(
        '''SELECT id, parent_id, user_id, location_x, location_y, location_z, radius, confidence %s
          FROM treenode
          WHERE skeleton_id = %s
        ''' % (added_fields, skeleton_id) )

    # array of properties: id, parent_id, user_id, x, y, z, radius, confidence
    nodes = tuple(cursor.fetchall())

    tags = defaultdict(list) # node ID vs list of tags
    connectors = []

    # Get all reviews for this skeleton
    if all_field:
        reviews = get_treenodes_to_reviews_with_time(skeleton_ids=[skeleton_id])
    else:
        reviews = get_treenodes_to_reviews(skeleton_ids=[skeleton_id])

    if 0 == lean: # meaning not lean
        # Text tags
        cursor.execute("SELECT id FROM relation WHERE project_id=%s AND relation_name='labeled_as'" % int(project_id))
        labeled_as = cursor.fetchall()[0][0]

        cursor.execute(
             ''' SELECT treenode_class_instance.treenode_id, class_instance.name
                 FROM treenode, class_instance, treenode_class_instance
                 WHERE treenode.skeleton_id = %s
                   AND treenode.id = treenode_class_instance.treenode_id
                   AND treenode_class_instance.class_instance_id = class_instance.id
                   AND treenode_class_instance.relation_id = %s
             ''' % (skeleton_id, labeled_as))

        for row in cursor.fetchall():
            tags[row[1]].append(row[0])

        if with_connectors:
            if all_field:
                added_fields = ', c.creation_time'
            else:
                added_fields = ''

            # Fetch all connectors with their partner treenode IDs
            cursor.execute(
                ''' SELECT tc.treenode_id, tc.connector_id, r.relation_name,
                           c.location_x, c.location_y, c.location_z %s
                    FROM treenode_connector tc,
                         connector c,
                         relation r
                    WHERE tc.skeleton_id = %s
                      AND tc.connector_id = c.id
                      AND tc.relation_id = r.id
                ''' % (added_fields, skeleton_id) )
            # Above, purposefully ignoring connector tags. Would require a left outer join on the inner join of connector_class_instance and class_instance, and frankly connector tags are pointless in the 3d viewer.

            # List of (treenode_id, connector_id, relation_id, x, y, z)n with relation_id replaced by 0 (presynaptic) or 1 (postsynaptic)
            # 'presynaptic_to' has an 'r' at position 1:
            for row in cursor.fetchall():
                x, y, z = imap(float, (row[3], row[4], row[5]))
                connectors.append((row[0], row[1], 0 if 'r' == row[2][1] else 1, x, y, z, row[6]))
            return name, nodes, tags, connectors, reviews

    return name, nodes, tags, connectors, reviews



@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_for_3d_viewer(request, project_id=None, skeleton_id=None):
    return HttpResponse(json.dumps(_skeleton_for_3d_viewer(skeleton_id, project_id, with_connectors=request.POST.get('with_connectors', True), lean=int(request.POST.get('lean', 0)), all_field=request.POST.get('all_fields', False)), separators=(',', ':')))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_with_metadata(request, project_id=None, skeleton_id=None):

    def default(obj):
        """Default JSON serializer."""
        import calendar, datetime

        if isinstance(obj, datetime.datetime):
            if obj.utcoffset() is not None:
                obj = obj - obj.utcoffset()
            millis = int(
                calendar.timegm(obj.timetuple()) * 1000 +
                obj.microsecond / 1000
            )
        return millis

    return HttpResponse(json.dumps(_skeleton_for_3d_viewer(skeleton_id, project_id, \
        with_connectors=True, lean=0, all_field=True), separators=(',', ':'), default=default))

def _measure_skeletons(skeleton_ids):
    if not skeleton_ids:
        raise Exception("Must provide the ID of at least one skeleton.")

    skids_string = ",".join(map(str, skeleton_ids))

    cursor = connection.cursor()
    cursor.execute('''
    SELECT id, parent_id, skeleton_id, location_x, location_y, location_z
    FROM treenode
    WHERE skeleton_id IN (%s)
    ''' % skids_string)

    # TODO should be all done with numpy,
    # TODO  by partitioning the skeleton into sequences of x,y,z representing the slabs
    # TODO  and then convolving them.

    class Skeleton():
        def __init__(self):
            self.nodes = {}
            self.raw_cable = 0
            self.smooth_cable = 0
            self.principal_branch_cable = 0
            self.n_ends = 0
            self.n_branch = 0
            self.n_pre = 0
            self.n_post = 0

    class Node():
        def __init__(self, parent_id, x, y, z):
            self.parent_id = parent_id
            self.x = x
            self.y = y
            self.z = z
            self.wx = x # weighted average of itself and neighbors
            self.wy = y
            self.wz = z
            self.children = {} # node ID vs distance

    skeletons = defaultdict(dict) # skeleton ID vs (node ID vs Node)
    for row in cursor.fetchall():
        skeleton = skeletons.get(row[2])
        if not skeleton:
            skeleton = Skeleton()
            skeletons[row[2]] = skeleton
        skeleton.nodes[row[0]] = Node(row[1], row[3], row[4], row[5])

    for skeleton in skeletons.itervalues():
        nodes = skeleton.nodes
        tree = nx.DiGraph()
        root = None
        # Accumulate children
        for nodeID, node in nodes.iteritems():
            if not node.parent_id:
                root = nodeID
                continue
            tree.add_edge(node.parent_id, nodeID)
            parent = nodes[node.parent_id]
            distance = sqrt(  pow(node.x - parent.x, 2)
                            + pow(node.y - parent.y, 2)
                            + pow(node.z - parent.z, 2))
            parent.children[nodeID] = distance
            # Measure raw cable, given that we have the parent already
            skeleton.raw_cable += distance
        # Utilize accumulated children and the distances to them
        for nodeID, node in nodes.iteritems():
            # Count end nodes and branch nodes
            n_children = len(node.children)
            if not node.parent_id:
                if 1 == n_children:
                    skeleton.n_ends += 1
                    continue
                if n_children > 2:
                    skeleton.n_branch += 1
                    continue
                # Else, if 2 == n_children, the root node is in the middle of the skeleton, being a slab node
            elif 0 == n_children:
                skeleton.n_ends += 1
                continue
            elif n_children > 1:
                skeleton.n_branch += 1
                continue
            # Compute weighted position for slab nodes only
            # (root, branch and end nodes do not move)
            oids = node.children.copy()
            if node.parent_id:
                oids[node.parent_id] = skeleton.nodes[node.parent_id].children[nodeID]
            sum_distances = sum(oids.itervalues())
            wx, wy, wz = 0, 0, 0
            for oid, distance in oids.iteritems():
                other = skeleton.nodes[oid]
                w = distance / sum_distances if sum_distances != 0 else 0
                wx += other.x * w
                wy += other.y * w
                wz += other.z * w
            node.wx = node.x * 0.4 + wx * 0.6
            node.wy = node.y * 0.4 + wy * 0.6
            node.wz = node.z * 0.4 + wz * 0.6
        # Find out nodes that belong to the principal branch
        principal_branch_nodes = set(sorted(partition(tree, root), key=len)[-1])
        # Compute smoothed cable length, also for principal branch
        for nodeID, node in nodes.iteritems():
            if not node.parent_id:
                # root node
                continue
            parent = nodes[node.parent_id]
            length = sqrt(  pow(node.wx - parent.wx, 2)
                          + pow(node.wy - parent.wy, 2)
                          + pow(node.wz - parent.wz, 2))
            skeleton.smooth_cable += length
            if nodeID in principal_branch_nodes:
                skeleton.principal_branch_cable += length

    # Count inputs
    cursor.execute('''
    SELECT tc.skeleton_id, count(tc.skeleton_id)
    FROM treenode_connector tc,
         relation r
    WHERE tc.skeleton_id IN (%s)
      AND tc.relation_id = r.id
      AND r.relation_name = 'postsynaptic_to'
    GROUP BY tc.skeleton_id
    ''' % skids_string)

    for row in cursor.fetchall():
        skeletons[row[0]].n_pre = row[1]

    # Count outputs
    cursor.execute('''
    SELECT tc1.skeleton_id, count(tc1.skeleton_id)
    FROM treenode_connector tc1,
         treenode_connector tc2,
         relation r1,
         relation r2
    WHERE tc1.skeleton_id IN (%s)
      AND tc1.connector_id = tc2.connector_id
      AND tc1.relation_id = r1.id
      AND r1.relation_name = 'presynaptic_to'
      AND tc2.relation_id = r2.id
      AND r2.relation_name = 'postsynaptic_to'
      GROUP BY tc1.skeleton_id
    ''' % skids_string)

    for row in cursor.fetchall():
        skeletons[row[0]].n_post = row[1]

    return skeletons


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def measure_skeletons(request, project_id=None):
    skeleton_ids = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skeleton_ids['))
    def asRow(skid, sk):
        return (skid, int(sk.raw_cable), int(sk.smooth_cable), sk.n_pre, sk.n_post, len(sk.nodes), sk.n_branch, sk.n_ends, sk.principal_branch_cable)
    return HttpResponse(json.dumps([asRow(skid, sk) for skid, sk in _measure_skeletons(skeleton_ids).iteritems()]))


def _skeleton_neuroml_cell(skeleton_id, preID, postID):
    skeleton_id = int(skeleton_id) # sanitize
    cursor = connection.cursor()

    cursor.execute('''
    SELECT id, parent_id, location_x, location_y, location_z, radius
    FROM treenode
    WHERE skeleton_id = %s
    ''' % skeleton_id)
    nodes = {row[0]: (row[1], (row[2], row[3], row[4]), row[5]) for row in cursor.fetchall()}

    cursor.execute('''
    SELECT tc.treenode_id, tc.connector_id, tc.relation_id
    FROM treenode_connector tc
    WHERE tc.skeleton_id = %s
      AND (tc.relation_id = %s OR tc.relation_id = %s)
    ''' % (skeleton_id, preID, postID))
    pre = defaultdict(list) # treenode ID vs list of connector ID
    post = defaultdict(list)
    for row in cursor.fetchall():
        if row[2] == preID:
            pre[row[0]].append(row[1])
        else:
            post[row[0]].append(row[1])

    return neuroml_single_cell(skeleton_id, nodes, pre, post)


@requires_user_role(UserRole.Browse)
def skeletons_neuroml(request, project_id=None):
    """ Export a list of skeletons each as a Cell in NeuroML. """
    project_id = int(project_id) # sanitize
    skeleton_ids = tuple(int(v) for k,v in request.POST.iteritems() if k.startswith('skids['))

    cursor = connection.cursor()

    cursor.execute('''
    SELECT relation_name, id
    FROM relation
    WHERE project_id = %s
      AND (relation_name = 'presynaptic_to' OR relation_name = 'postsynaptic_to')
    ''' % project_id)
    relations = dict(cursor.fetchall())
    preID = relations['presynaptic_to']
    postID = relations['postsynaptic_to']

    # TODO could certainly fetch all nodes and synapses in one single query and then split them up.
    cells = (_skeleton_neuroml_cell(skeleton_id, preID, postID) for skeleton_id in skeleton_ids)

    response = HttpResponse(content_type='text/txt')
    response['Content-Disposition'] = 'attachment; filename="data.neuroml"'

    neuroml_network(cells, response)

    return response


@requires_user_role(UserRole.Browse)
def export_neuroml_level3_v181(request, project_id=None):
    """Export the NeuroML Level 3 version 1.8.1 representation of one or more skeletons.
    Considers synapses among the requested skeletons only. """
    skeleton_ids = tuple(int(v) for v in request.POST.getlist('skids[]'))
    mode = int(request.POST.get('mode'))
    skeleton_strings = ",".join(map(str, skeleton_ids))
    cursor = connection.cursor()

    cursor.execute('''
    SELECT relation_name, id
    FROM relation
    WHERE project_id = %s
      AND (relation_name = 'presynaptic_to'
           OR relation_name = 'postsynaptic_to')
    ''' % int(project_id))

    relations = dict(cursor.fetchall())
    presynaptic_to = relations['presynaptic_to']
    postsynaptic_to = relations['postsynaptic_to']

    cursor.execute('''
    SELECT cici.class_instance_a, ci.name
    FROM class_instance_class_instance cici,
         class_instance ci,
         relation r
    WHERE cici.class_instance_a IN (%s)
      AND cici.class_instance_b = ci.id
      AND cici.relation_id = r.id
      AND r.relation_name = 'model_of'
    ''' % skeleton_strings)

    neuron_names = dict(cursor.fetchall())

    skeleton_query = '''
        SELECT id, parent_id, location_x, location_y, location_z,
               radius, skeleton_id
        FROM treenode
        WHERE skeleton_id IN (%s)
        ORDER BY skeleton_id
        ''' % skeleton_strings

    if 0 == mode:
        cursor.execute('''
        SELECT treenode_id, connector_id, relation_id, skeleton_id
        FROM treenode_connector
        WHERE skeleton_id IN (%s)
        ''' % skeleton_strings)

        # Dictionary of connector ID vs map of relation_id vs list of treenode IDs
        connectors = defaultdict(partial(defaultdict, list))

        for row in cursor.fetchall():
            connectors[row[1]][row[2]].append((row[0], row[3]))

        # Dictionary of presynaptic skeleton ID vs map of postsynaptic skeleton ID vs list of tuples with presynaptic treenode ID and postsynaptic treenode ID.
        connections = defaultdict(partial(defaultdict, list))

        for connectorID, m in connectors.iteritems():
            for pre_treenodeID, skID1 in m[presynaptic_to]:
                for post_treenodeID, skID2 in m[postsynaptic_to]:
                    connections[skID1][skID2].append((pre_treenodeID, post_treenodeID))

        cursor.execute(skeleton_query)

        generator = export_NeuroML_Level3.exportMutual(neuron_names, cursor.fetchall(), connections)

    else:
        if len(skeleton_ids) > 1:
            raise Exception("Expected a single skeleton for mode %s!" % mode)
        input_ids = tuple(int(v) for v in request.POST.getlist('inputs[]', []))
        input_strings = ",".join(map(str, input_ids))
        if 2 == mode:
            constraint = "AND tc2.skeleton_id IN (%s)" % input_strings
        elif 1 == mode:
            constraint = ""
        else:
            raise Exception("Unknown mode %s" % mode)

        cursor.execute('''
        SELECT tc2.skeleton_id, tc1.treenode_id
        FROM treenode_connector tc1,
             treenode_connector tc2
        WHERE tc1.skeleton_id = %s
          AND tc1.connector_id = tc2.connector_id
          AND tc1.treenode_id != tc2.treenode_id
          AND tc1.relation_id = %s
          AND tc2.relation_id = %s
          %s
        ''' % (skeleton_strings, postsynaptic_to, presynaptic_to, constraint))

        # Dictionary of skeleton ID vs list of treenode IDs at which the neuron receives inputs
        inputs = defaultdict(list)
        for row in cursor.fetchall():
            inputs[row[0]].append(row[1])

        cursor.execute(skeleton_query)

        generator = export_NeuroML_Level3.exportSingle(neuron_names, cursor.fetchall(), inputs)

    response = HttpResponse(generator, content_type='text/plain')
    response['Content-Disposition'] = 'attachment; filename=neuronal-circuit.neuroml'

    return response


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_swc(*args, **kwargs):
    kwargs['format'] = 'swc'
    return export_skeleton_response(*args, **kwargs)


def _export_review_skeleton(project_id=None, skeleton_id=None, format=None,
                            subarbor_node_id=None):
    """ Returns a list of segments for the requested skeleton. Each segment
    contains information about the review status of this part of the skeleton.
    If a valid subarbor_node_id is given, only data for the sub-arbor is
    returned that starts at this node.
    """
    # Get all treenodes of the requested skeleton
    treenodes = Treenode.objects.filter(skeleton_id=skeleton_id).values_list(
        'id', 'parent_id', 'location_x', 'location_y', 'location_z')
    # Get all reviews for the requested skeleton
    reviews = get_treenodes_to_reviews(skeleton_ids=[skeleton_id])

    # Add each treenode to a networkx graph and attach reviewer information to
    # it.
    g = nx.DiGraph()
    reviewed = set()
    for t in treenodes:
        # While at it, send the reviewer IDs, which is useful to iterate fwd
        # to the first unreviewed node in the segment.
        g.add_node(t[0], {'id': t[0], 'x': t[2], 'y': t[3], 'z': t[4], 'rids': reviews[t[0]]})
        if reviews[t[0]]:
            reviewed.add(t[0])
        if t[1]: # if parent
            g.add_edge(t[1], t[0]) # edge from parent to child
        else:
            root_id = t[0]

    if subarbor_node_id and subarbor_node_id != root_id:
        # Make sure the subarbor node ID (if any) is part of this skeleton
        if subarbor_node_id not in g:
            raise ValueError("Supplied subarbor node ID (%s) is not part of "
                             "provided skeleton (%s)" % (subarbor_node_id, skeleton_id))

        # Remove connection to parent
        parent = g.predecessors(subarbor_node_id)[0]
        g.remove_edge(parent, subarbor_node_id)
        # Remove all nodes that are upstream from the subarbor node
        to_delete = set()
        to_lookat = [root_id]
        while to_lookat:
            n = to_lookat.pop()
            to_lookat.extend(g.successors(n))
            to_delete.add(n)
        g.remove_nodes_from(to_delete)
        # Replace root id with sub-arbor ID
        root_id=subarbor_node_id

    # Create all sequences, as long as possible and always from end towards root
    distances = edge_count_to_root(g, root_node=root_id) # distance in number of edges from root
    seen = set()
    sequences = []
    # Iterate end nodes sorted from highest to lowest distance to root
    endNodeIDs = (nID for nID in g.nodes() if 0 == len(g.successors(nID)))
    for nodeID in sorted(endNodeIDs, key=distances.get, reverse=True):
        sequence = [g.node[nodeID]]
        parents = g.predecessors(nodeID)
        while parents:
            parentID = parents[0]
            sequence.append(g.node[parentID])
            if parentID in seen:
                break
            seen.add(parentID)
            parents = g.predecessors(parentID)

        if len(sequence) > 1:
            sequences.append(sequence)

    # Calculate status

    segments = []
    for sequence in sorted(sequences, key=len, reverse=True):
        segments.append({
            'id': len(segments),
            'sequence': sequence,
            'status': '%.2f' % (100.0 * sum(1 for node in sequence if node['id'] in reviewed) / len(sequence)),
            'nr_nodes': len(sequence)
        })
    return segments

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_review_skeleton(request, project_id=None, skeleton_id=None, format=None):
    """
    Export the skeleton as a list of sequences of entries, each entry containing
    an id, a sequence of nodes, the percent of reviewed nodes, and the node count.
    """
    try:
        subarbor_node_id = int(request.POST.get('subarbor_node_id', ''))
    except ValueError:
        subarbor_node_id = None

    segments = _export_review_skeleton( project_id, skeleton_id, format,
            subarbor_node_id )
    return HttpResponse(json.dumps(segments))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_connectors_by_partner(request, project_id):
    """ Return a dict of requested skeleton vs relation vs partner skeleton vs list of connectors.
    Connectors lacking a skeleton partner will of course not be included. """
    skeleton_ids = set(int(v) for k,v in request.POST.iteritems() if k.startswith('skids['))
    cursor = connection.cursor()

    cursor.execute('''
    SELECT id, relation_name FROM relation WHERE relation_name = 'postsynaptic_to' OR relation_name = 'presynaptic_to'
    ''')
    relations = dict(cursor.fetchall())

    cursor.execute('''
    SELECT tc1.skeleton_id, tc1.relation_id,
           tc2.skeleton_id, tc1.connector_id
    FROM treenode_connector tc1,
         treenode_connector tc2
    WHERE tc1.skeleton_id IN (%s)
      AND tc1.connector_id = tc2.connector_id
      AND tc1.skeleton_id != tc2.skeleton_id
      AND tc1.relation_id != tc2.relation_id
    ''' % ','.join(map(str, skeleton_ids)))

    # Dict of skeleton vs relation vs skeleton vs list of connectors
    partners = defaultdict(partial(defaultdict, partial(defaultdict, list)))

    for row in cursor.fetchall():
        partners[row[0]][relations[row[1]]][row[2]].append(row[3])

    return HttpResponse(json.dumps(partners))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_skeleton_reviews(request, project_id=None, skeleton_id=None):
    """ Return a map of treenode ID vs list of reviewer IDs,
    without including any unreviewed treenode. """
    m = defaultdict(list)
    for row in Review.objects.filter(skeleton_id=int(skeleton_id)).values_list('treenode_id', 'reviewer_id').iterator():
        m[row[0]].append(row[1])

    return HttpResponse(json.dumps(m, separators=(',', ':')))

