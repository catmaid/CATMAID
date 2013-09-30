import json
from django.db import connection
from django.http import HttpResponse
from catmaid.control.authentication import *
from catmaid.models import Relation
import networkx as nx
from networkx.algorithms import weakly_connected_component_subgraphs
from collections import defaultdict
from itertools import chain, ifilter
from functools import partial
from synapseclustering import tree_max_density
from numpy import subtract
from numpy.linalg import norm
from tree_util import edge_count_to_root, simplify
from operator import attrgetter

def split_by_confidence_and_add_edges(confidence_threshold, digraphs, rows):
    """ dipgrahs is a dictionary of skeleton IDs as keys and DiGraph instances as values,
    where the DiGraph does not have any edges yet.
    WARNING: side effect on contents of digraph: will add the edges
    """
    arbors = {}
    # Define edges, which may result in multiple subgraphs for each skeleton
    # when splitting at low-confidence edges:
    if 0 == confidence_threshold:
        # Do not split skeletons
        for row in rows:
            if row[1]:
                digraphs[row[3]].add_edge(row[1], row[0])
        for skid, digraph in digraphs.iteritems():
            arbors[skid] = [digraph]
    else:
        # The DiGraph representing the skeleton may be disconnected at a low-confidence edge
        to_split = set()
        for row in rows:
            if row[2] < confidence_threshold:
                to_split.add(row[3])
            elif row[1]:
                digraphs[row[3]].add_edge(row[1], row[0])
        for skid, digraph in digraphs.iteritems():
            if skid in to_split:
                arbors[skid] = weakly_connected_component_subgraphs(digraph)
            else:
                arbors[skid] = [digraph]

    return arbors

def split_by_synapse_domain(bandwidth, locations, arbors, treenode_connector, minis):
    """ locations: dictionary of treenode ID vs tuple with x,y,z
        arbors: dictionary of skeleton ID vs list of DiGraph (that were, or not, split by confidence)
        treenode_connectors: dictionary of treenode ID vs list of tuples of connector_id, string of 'presynaptic_to' or 'postsynaptic_to'
    """
    arbors2 = {} # Some arbors will be split further
    for skeleton_id, graphs in arbors.iteritems():
        subdomains = []
        arbors2[skeleton_id] = subdomains
        for graph in graphs:
            treenode_ids = []
            connector_ids =[]
            relation_ids = []
            for treenode_id in ifilter(treenode_connector.has_key, graph.nodes()):
                for c in treenode_connector.get(treenode_id):
                    connector_id, relation = c
                    treenode_ids.append(treenode_id)
                    connector_ids.append(connector_id)
                    relation_ids.append(relation)

            if not connector_ids:
                subdomains.append(graph)
                continue

            for parent_id, treenode_id in graph.edges():
                loc0 = locations[treenode_id]
                loc1 = locations[parent_id]
                graph[parent_id][treenode_id]['weight'] = norm(subtract(loc0, loc1))

            # Invoke Casey's magic
            synapse_group = tree_max_density(graph.to_undirected(), treenode_ids, connector_ids, relation_ids, [bandwidth]).values()[0]
            # The list of nodes of each synapse_group contains only nodes that have connectors
            # A local_max is the skeleton node most central to a synapse_group
            anchors = {}
            for domain in synapse_group.values():
                g = nx.DiGraph()
                g.add_nodes_from(domain.node_ids) # bogus graph, containing treenodes that point to connectors
                subdomains.append(g)
                anchors[domain.local_max] = g
            # Define edges between domains: create a simplified graph
            mini = simplify(graph, anchors.keys())
            # Replace each node by the corresponding graph, or a graph of a single node
            table = {}
            for node in mini.nodes():
                g = anchors.get(node)
                if not g:
                    # A branch node that was not an anchor, i.e. did not represent a synapse group
                    g = nx.Graph()
                    g.add_node(node, {'branch': True})
                    subdomains.append(g)
                # Associate the Graph with treenodes that have connectors
                # with the node in the minified tree
                mini.node[node]['g'] = g
            # Put the mini into a map of skeleton_id and list of minis,
            # to be used later for defining intra-neuron edges in the circuit graph
            minis[skeleton_id].append(mini)

    return arbors2, minis


def _skeleton_graph(project_id, skeleton_ids, confidence_threshold, bandwidth):
    """ Assumes all skeleton_ids belong to project_id. """
    skeletons_string = ",".join(str(int(x)) for x in skeleton_ids)
    cursor = connection.cursor()

    # Fetch all treenodes of all skeletons
    cursor.execute('''
    SELECT id, parent_id, confidence, skeleton_id, location, reviewer_id
    FROM treenode
    WHERE skeleton_id IN (%s)
    ''' % skeletons_string)
    rows = tuple(cursor.fetchall())
    # Each skeleton is represented with a DiGraph
    arbors = defaultdict(nx.DiGraph)

    # Create a DiGraph for every skeleton
    for row in rows:
        arbors[row[3]].add_node(row[0], {'reviewer_id': row[5]})

    # Dictionary of skeleton IDs vs list of DiGraph instances
    arbors = split_by_confidence_and_add_edges(confidence_threshold, arbors, rows)

    # Fetch all synapses
    relations = {'presynaptic_to': -1, 'postsynaptic_to': -1}
    for r in Relation.objects.filter(relation_name__in=('presynaptic_to', 'postsynaptic_to'), project_id=project_id).values_list('relation_name', 'id'):
        relations[r[0]] = r[1]
    cursor.execute('''
    SELECT connector_id, relation_id, treenode_id, skeleton_id
    FROM treenode_connector
    WHERE skeleton_id IN (%s)
    ''' % skeletons_string)
    connectors = defaultdict(partial(defaultdict, list))
    for row in cursor.fetchall():
        connectors[row[0]][row[1]].append((row[2], row[3]))

    # Cluster by synapses
    minis = defaultdict(list) # skeleton_id vs list of minified graphs
    if bandwidth > 0:
        locations = {row[0]: eval(row[4]) for row in rows}
        treenode_connector = defaultdict(list)
        for connector_id, pp in connectors.iteritems():
            for treenode_id in chain.from_iterable(pp[relations['presynaptic_to']]):
                treenode_connector[treenode_id].append((connector_id, "presynaptic_to"))
            for treenode_id in chain.from_iterable(pp[relations['postsynaptic_to']]):
                treenode_connector[treenode_id].append((connector_id, "postsynaptic_to"))
        arbors, minis = split_by_synapse_domain(bandwidth, locations, arbors, treenode_connector, minis)


    # Obtain neuron names
    cursor.execute('''
    SELECT cici.class_instance_a, ci.name
    FROM class_instance ci,
         class_instance_class_instance cici,
         relation r
    WHERE cici.class_instance_a IN (%s)
      AND cici.class_instance_b = ci.id
      AND cici.relation_id = r.id
      AND r.relation_name = 'model_of'
    ''' % skeletons_string)
    names = dict(cursor.fetchall())

    # A DiGraph representing the connections between the arbors (every node is an arbor)
    circuit = nx.DiGraph()

    for skid, digraphs in arbors.iteritems():
        i = 0
        for g in digraphs:
            if g.number_of_nodes() == 0:
                print "no nodes in g, from skeleton ID #%s" % skid
                continue
            circuit.add_node(g, {'id': "%s_%s" % (skid, i+1),
                                 'label': "%s [%s]" % (names[skid], i+1),
                                 'skeleton_id': skid,
                                 'node_count': len(g),
                                 'node_reviewed_count': len([k for k,v in g.nodes(data=True) if v['reviewer_id'] != -1]),
                                 'branch': False})
            i += 1
            
    # Define edges between arbors, with number of synapses as an edge property
    for c in connectors.values():
        for pre_treenode, pre_skeleton in c[relations['presynaptic_to']]:
            for pre_arbor in arbors.get(pre_skeleton, ()):
                if pre_treenode in pre_arbor:
                    # Found the DiGraph representing an arbor derived from the skeleton to which the presynaptic treenode belongs.
                    for post_treenode, post_skeleton in c[relations['postsynaptic_to']]:
                        for post_arbor in arbors.get(post_skeleton, ()):
                            if post_treenode in post_arbor:
                                # Found the DiGraph representing an arbor derived from the skeleton to which the postsynaptic treenode belongs.
                                edge_props = circuit.get_edge_data(pre_arbor, post_arbor)
                                if edge_props:
                                    edge_props['c'] += 1
                                else:
                                    circuit.add_edge(pre_arbor, post_arbor, {'c': 1, 'arrow': 'triangle', 'color': '#444', 'directed': True})
                                break
                    break

    if bandwidth > 0:
        # Add edges between circuit nodes that represent different domains of the same neuron
        for skeleton_id, list_mini in minis.iteritems():
            for mini in list_mini:
                for i,node in enumerate(mini.nodes()):
                    g = mini.node[node]['g']
                    if g not in circuit:
                        # A branch node that was preserved to the minified arbor
                        circuit.add_node(g, {'id': '%s-%s' % (skeleton_id, node),
                                             'skeleton_id': skeleton_id,
                                             'label': "%s [%s]" % (names[skeleton_id], node),
                                             'node_count': 1,
                                             'branch': True})
                for node1, node2 in mini.edges_iter():
                    g1 = mini.node[node1]['g']
                    g2 = mini.node[node2]['g']
                    circuit.add_edge(g1, g2, {'c': 10, 'arrow': 'none', 'color': '#F00', 'directed': False})

    return circuit


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_graph(request, project_id=None):
    project_id = int(project_id)
    skeleton_ids = [int(v) for k,v in request.POST.iteritems() if k.startswith('skeleton_list[')]
    confidence_threshold = int(request.POST.get('confidence_threshold', 0))
    bandwidth = int(request.POST.get('bandwidth', 9000)) # in nanometers
    circuit = _skeleton_graph(project_id, skeleton_ids, confidence_threshold, bandwidth)
    package = {'nodes': [{'data': props} for digraph, props in circuit.nodes_iter(data=True)],
               'edges': []}
    edges = package['edges']
    for g1, g2, props in circuit.edges_iter(data=True):
        id1 = circuit.node[g1]['id']
        id2 = circuit.node[g2]['id']
        edges.append({'data': {'id': '%s_%s' % (id1, id2),
                               'source': id1,
                               'target': id2,
                               'weight': props['c'],
                               'label': str(props['c']) if props['directed'] else None,
                               'directed': props['directed'],
                               'arrow': props['arrow'],
                               'color': props['color']}})

    return HttpResponse(json.dumps(package))

class Counts():
    def __init__(self):
        self.inputs = 0
        self.outputs = 0
        self.seenInputs = 0
        self.seenOutputs = 0
        self.nPossibleIOPaths = 0

def _node_centrality_by_synapse(skeleton_id):
    """ Compute the synapse centraly of every node in a tree.
    Return the dictionary of node ID keys and Count values. """
    cursor = connection.cursor()
    cursor.execute('''
    SELECT t.id, t.parent_id, r.relation_name
    FROM treenode t LEFT OUTER JOIN (treenode_connector tc INNER JOIN relation r ON tc.relation_id = r.id) ON t.skeleton_id = tc.skeleton_id
    WHERE t.skeleton_id = %s
    ''' % skeleton_id)


    nodes = {} # node ID vs list of two numeric values: sum of inputs and sum of outputs
    tree = nx.DiGraph()
    root = None
    parents = set()
    totalInputs = 0
    totalOutputs = 0

    for row in cursor.fetchall():
        counts = nodes[row[0]]
        if not counts:
            counts = Counts()
            nodes[row[0]] = counts
        if row[2]:
            if 14 == len(row[2]): # Same as:  'presynaptic_to' == row[2]
                counts.outputs += 1
                totalOutputs += 1
            else:
                counts.inputs += 1
                totalInputs += 1
        if row[1]:
            parents.add(row[1])
            tree.add_edge(row[0], row[1])
        else:
            root = row[0]
    
    # 1. Ensure the root is an end by checking that it has only one child; otherwise reroot at the first end node found
    if len(tree.successors(root)) > 1:
        # Reroot at the first end node found
        endNode = (nodeID for nodeID in nodes.iterkeys() if nodeID not in parents).next()
        reroot(tree, endNode)
    # 2. Partition into sequences, sorted from small to large
    sequences = sorted(partition(tree), key=len)
    # 3. Traverse all partitions counting synapses seen
    for seq in sequences:
        # Each seq runs from an end node towards the root or a branch node
        seenI = 0
        seenO = 0
        for nodeID in seq:
            counts = nodes[nodeID]
            seenI += counts.inputs + counts.seenInputs
            seenO += counts.outputs + counts.seenOutputs
            counts.seenInputs = seenI
            counts.seenOutputs = seenO
            counts.nPossibleIOPaths = counts.seenInputs * (totalOutputs - counts.seenOutputs) + counts.seenOutputs * (totalInputs - counts.seenInputs)
    
    return nodes

