import json

from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.fields import Double3D
from catmaid.control.authentication import *
from catmaid.control.common import *

import networkx as nx
from tree_util import edge_count_to_root

from itertools import imap
from collections import defaultdict
from math import sqrt

try:
    import neuroml
    import neuroml.writers as writers
except ImportError:
    pass    

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
        swc_row.append(tn.location.x)
        swc_row.append(tn.location.y)
        swc_row.append(tn.location.z)
        swc_row.append(max(tn.radius, 0))
        swc_row.append(-1 if tn.parent_id is None else tn.parent_id)
        all_rows.append(swc_row)
    result = ""
    for row in all_rows:
        result += " ".join(str(x) for x in row) + "\n"
    return result

def export_skeleton_response(request, project_id=None, skeleton_id=None, format=None):
    treenode_qs, labels_qs, labelconnector_qs = get_treenodes_qs(project_id, skeleton_id)

    if format == 'swc':
        return HttpResponse(get_swc_string(treenode_qs), mimetype='text/plain')
    elif format == 'json':
        return HttpResponse(get_json_string(treenode_qs), mimetype='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_skeleton_response" % (format,)


def _skeleton_for_3d_viewer(skeleton_id):
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
    
    # Fetch all nodes, with their tags if any
    cursor.execute(
        '''SELECT t.id, t.user_id, t.location, t.reviewer_id, t.parent_id, t.radius, ci.name
          FROM treenode t LEFT OUTER JOIN (treenode_class_instance tci INNER JOIN class_instance ci ON tci.class_instance_id = ci.id INNER JOIN relation r ON tci.relation_id = r.id AND r.relation_name = 'labeled_as') ON t.id = tci.treenode_id
          WHERE t.skeleton_id = %s
        ''' % skeleton_id)

    nodes = [] # node properties
    tags = defaultdict(list) # node ID vs list of tags
    for row in cursor.fetchall():
        if row[6]:
            tags[row[6]].append(row[0])
        x, y, z = imap(float, row[2][1:-1].split(','))
        # properties: id, parent_id, user_id, reviewer_id, x, y, z, radius
        nodes.append((row[0], row[4], row[1], row[3], x, y, z, row[5]))

    # Fetch all connectors with their partner treenode IDs
    cursor.execute(
        ''' SELECT tc.treenode_id, tc.connector_id, r.relation_name, c.location, c.reviewer_id
            FROM treenode_connector tc,
                 connector c,
                 relation r
            WHERE tc.skeleton_id = %s
              AND tc.connector_id = c.id
              AND tc.relation_id = r.id
        ''' % skeleton_id)
    # Above, purposefully ignoring connector tags. Would require a left outer join on the inner join of connector_class_instance and class_instance, and frankly connector tags are pointless in the 3d viewer.

    # List of (treenode_id, connector_id, relation_id, x, y, z)n with relation_id replaced by 0 (presynaptic) or 1 (postsynaptic)
    # 'presynaptic_to' has an 'r' at position 1:
    connectors = []
    for row in cursor.fetchall():
        x, y, z = imap(float, row[3][1:-1].split(','))
        connectors.append((row[0], row[1], 0 if 'r' == row[2][1] else 1, x, y, z, row[4]))

    return name, nodes, tags, connectors

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_for_3d_viewer(request, project_id=None, skeleton_id=None):
    return HttpResponse(json.dumps(_skeleton_for_3d_viewer(skeleton_id)))


def _measure_skeletons(skeleton_ids):
    if not skeleton_ids:
        raise Exception("Must provide the ID of at least one skeleton.")

    skids_string = ",".join(str(x) for x in skeleton_ids)

    cursor = connection.cursor()
    cursor.execute('''
    SELECT id, parent_id, skeleton_id, location
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
        x, y, z = imap(float, row[3][1:-1].split(','))
        skeleton.nodes[row[0]] = Node(row[1], x, y, z)

    for skeleton in skeletons.itervalues():
        nodes = skeleton.nodes
        # Accumulate children
        for nodeID, node in nodes.iteritems():
            if not node.parent_id:
                # root node
                continue
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
                w = distance / sum_distances
                wx += other.x * w
                wy += other.y * w
                wz += other.z * w
            node.wx = node.x * 0.4 + wx * 0.6
            node.wy = node.y * 0.4 + wy * 0.6
            node.wz = node.z * 0.4 + wz * 0.6
        # Compute smoothed cable length
        for nodeID, node in nodes.iteritems():
            if not node.parent_id:
                # root node
                continue
            parent = nodes[node.parent_id]
            skeleton.smooth_cable += sqrt(  pow(node.wx - parent.wx, 2)
                                          + pow(node.wy - parent.wy, 2)
                                          + pow(node.wz - parent.wz, 2))

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
        return (skid, int(sk.raw_cable), int(sk.smooth_cable), sk.n_pre, sk.n_post, len(sk.nodes), sk.n_ends, sk.n_branch)
    return HttpResponse(json.dumps([asRow(skid, sk) for skid, sk in _measure_skeletons(skeleton_ids).iteritems()]))


def generate_extended_skeleton_data( project_id=None, skeleton_id=None ):

    treenode_qs, labels_as, labelconnector_qs = get_treenodes_qs(project_id, skeleton_id, with_labels=True)

    labels={}
    for tn in labels_as:
        lab = str(tn.class_instance.name).lower()
        if tn.treenode_id in labels:
            labels[tn.treenode_id].append( lab )
        else:
            labels[tn.treenode_id] = [ lab ]
            # whenever the word uncertain is in the tag, add it
            # here. This is used in the 3d webgl viewer
    for cn in labelconnector_qs:
        lab = str(cn.class_instance.name).lower()
        if cn.connector_id in labels:
            labels[cn.connector_id].append( lab )
        else:
            labels[cn.connector_id] = [ lab ]
            # whenever the word uncertain is in the tag, add it
        # here. this is used in the 3d webgl viewer


    # represent the skeleton as JSON
    vertices={}; connectivity={}
    for tn in treenode_qs:
        if tn.id in labels:
            lab = labels[tn.id]
        else:
            # Fake label for WebGL 3d viewer to show a sphere
            if tn.confidence < 5:
                lab = ['uncertain']
            else:
                lab = []

        vertices[tn.id] = {
            'x': tn.location.x,
            'y': tn.location.y,
            'z': tn.location.z,
            'radius': max(tn.radius, 0),
            'type': 'skeleton',
            'labels': lab,
            'user_id': tn.user_id,
            'reviewer_id': tn.reviewer_id
            
            # 'review_time': tn.review_time
            # To submit the review time, we would need to encode the datetime as string
            # http://stackoverflow.com/questions/455580/json-datetime-between-python-and-javascript
        }

        if not tn.parent_id is None:
            if connectivity.has_key(tn.id):
                connectivity[tn.id][tn.parent_id] = {
                    'type': 'neurite'
                }
            else:
                connectivity[tn.id] = {
                    tn.parent_id: {
                        'type': 'neurite'
                    }
                }

    qs_tc = TreenodeConnector.objects.filter(
        project=project_id,
        relation__relation_name__endswith = 'synaptic_to',
        skeleton__in=[skeleton_id]
    ).select_related('treenode', 'connector', 'relation')

    #print >> sys.stderr, 'vertices, connectivity', vertices, connectivity

    for tc in qs_tc:
        #print >> sys.stderr, 'vertex, connector', tc.treenode_id, tc.connector_id
        #print >> sys.stderr, 'relation name', tc.relation.relation_name

        if tc.treenode_id in labels:
            lab1 = labels[tc.treenode_id]
        else:
            lab1 = []
        if tc.connector_id in labels:
            lab2 = labels[tc.connector_id]
        else:
            lab2 = []

        if not vertices.has_key(tc.treenode_id):
            raise Exception('Vertex was not in the result set. This should never happen.')

        if not vertices.has_key(tc.connector_id):
            vertices[tc.connector_id] = {
                'x': tc.connector.location.x,
                'y': tc.connector.location.y,
                'z': tc.connector.location.z,
                'type': 'connector',
                'labels': lab2,
                'reviewer_id': tc.connector.reviewer_id
                #'review_time': tn.review_time
            }

        # if it a single node without connection to anything else,
        # but to a connector, add it
        if not connectivity.has_key(tc.treenode_id):
            connectivity[tc.treenode_id] = {}

        if connectivity[tc.treenode_id].has_key(tc.connector_id):
            # print >> sys.stderr, 'only for postsynaptic to the same skeleton multiple times'
            # print >> sys.stderr, 'for connector', tc.connector_id
            connectivity[tc.treenode_id][tc.connector_id] = {
                'type': tc.relation.relation_name
            }
        else:
            # print >> sys.stderr, 'does not have key', tc.connector_id, connectivity[tc.treenode_id]
            connectivity[tc.treenode_id][tc.connector_id] = {
                'type': tc.relation.relation_name
            }

    # retrieve neuron name
    p = get_object_or_404(Project, pk=project_id)
    sk = get_object_or_404(ClassInstance, pk=skeleton_id, project=project_id)

    neuron = ClassInstance.objects.filter(
        project=p,
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a=sk)
    n = { 'neuronname': neuron[0].name }

    return {'vertices':vertices,'connectivity':connectivity, 'neuron': n }

def export_extended_skeleton_response(request, project_id=None, skeleton_id=None, format=None):

    data=generate_extended_skeleton_data( project_id, skeleton_id )

    if format == 'json':
        json_return = json.dumps(data, sort_keys=True, indent=4)
        return HttpResponse(json_return, mimetype='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_extended_skeleton_response" % (format,)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_neuroml(request, project_id=None, skeleton_id=None):

    p = get_object_or_404(Project, pk=project_id)
    sk = get_object_or_404(ClassInstance, pk=skeleton_id, project=project_id)

    treenode_qs = Treenode.objects.filter(skeleton=sk)
    qs=Treenode.objects.filter(skeleton_id=39350).order_by('-parent')

    if len(qs) < 2:
        return HttpResponse(json.dumps({'error': 'Less than two nodes in skeleton' }))

    def pointwithdia( tn ):
        return neuroml.Point3DWithDiam(x=tn.location.x,
            y=tn.location.y,
            z=tn.location.z,
            diameter=tn.radius)

    current_tn = None
    next_tn = None
    seg_id = 1
    segments_container = []

    for tn in qs:
        if current_tn is None:
            current_tn = tn
            continue
        else:
            if next_tn is None:
                next_tn = tn
                # add soma segment, assuming root node is soma
                p = pointwithdia( current_tn )
                d = pointwithdia( next_tn )
                soma = neuroml.Segment(proximal=p, distal=d)
                soma.name = 'Root'
                soma.id = 0
                segments_container.append( soma )
                parent_segment = soma
                parent = neuroml.SegmentParent(segments=soma.id)
                continue
            else:
                p = pointwithdia( current_tn )
                d = pointwithdia( next_tn )

                new_segment = neuroml.Segment(proximal = p, 
                                               distal = d, 
                                               parent = parent)

                new_segment.id = seg_id
                new_segment.name = 'segment_' + str(new_segment.id)

                parent = neuroml.SegmentParent(segments=new_segment.id)
                parent_segment = new_segment
                seg_id += 1 

                segments_container.append(new_segment)

                current_tn = next_tn

    response = HttpResponse(content_type='text/txt')
    response['Content-Disposition'] = 'attachment; filename="data.neuroml"'

    namespacedef = 'xmlns="http://www.neuroml.org/schema/neuroml2" '
    namespacedef += ' xmlns:xi="http://www.w3.org/2001/XInclude"'
    namespacedef += ' xmlns:xs="http://www.w3.org/2001/XMLSchema"'
    namespacedef += ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    namespacedef += ' xsi:schemaLocation="http://www.w3.org/2001/XMLSchema"'

    test_morphology = neuroml.Morphology()
    test_morphology.segments += segments_container
    test_morphology.id = "Morphology"

    cell = neuroml.Cell()
    cell.name = 'Cell'
    cell.id = 'Cell'
    cell.morphology = test_morphology

    doc = neuroml.NeuroMLDocument()
    doc.cells.append(cell)
    doc.id = "TestNeuroMLDocument"

    doc.export( response, 0, name_="neuroml", namespacedef_=namespacedef)

    return response
    

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_swc(*args, **kwargs):
    kwargs['format'] = 'swc'
    return export_skeleton_response(*args, **kwargs)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_json(*args, **kwargs):
    kwargs['format'] = 'json'
    return export_extended_skeleton_response(*args, **kwargs)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_review_skeleton(request, project_id=None, skeleton_id=None, format=None):
    """
    Export the skeleton as a list of sequences of entries, each entry containing
    an id, a sequence of nodes, the percent of reviewed nodes, and the node count.
    """
    treenodes = Treenode.objects.filter(skeleton_id=skeleton_id).values_list('id', 'location', 'parent_id', 'reviewer_id')

    g = nx.DiGraph()
    reviewed = set()
    for t in treenodes:
        loc = Double3D.from_str(t[1])
        # While at it, send the reviewer ID, which is useful to iterate fwd
        # to the first unreviewed node in the segment.
        g.add_node(t[0], {'id': t[0], 'x': loc.x, 'y': loc.y, 'z': loc.z, 'rid': t[3]})
        if -1 != t[3]:
            reviewed.add(t[0])
        if t[2]: # if parent
            g.add_edge(t[2], t[0]) # edge from parent to child
        else:
            root_id = t[0]

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

    segments = []
    for sequence in sorted(sequences, key=len, reverse=True):
        segments.append({
            'id': len(segments),
            'sequence': sequence,
            'status': '%.2f' % (100.0 * sum(1 for node in sequence if node['id'] in reviewed) / len(sequence)),
            'nr_nodes': len(sequence)
        })

    return HttpResponse(json.dumps(segments))

