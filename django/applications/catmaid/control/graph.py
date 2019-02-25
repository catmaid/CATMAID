# -*- coding: utf-8 -*-

import json
import logging
import sys

import networkx as nx
from networkx.algorithms import weakly_connected_component_subgraphs

from collections import defaultdict
from functools import partial
from itertools import chain
from math import sqrt
from numpy import subtract
from numpy.linalg import norm
from typing import Any, DefaultDict, Dict, List, Optional, Tuple, Union

from django.db import connection
from django.http import HttpRequest, JsonResponse

from catmaid.models import Relation, UserRole
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map, get_request_list
from catmaid.control.link import KNOWN_LINK_PAIRS
from catmaid.control.review import get_treenodes_to_reviews
from catmaid.control.tree_util import simplify, find_root, reroot, partition, \
        spanning_tree, cable_length
from catmaid.control.synapseclustering import  tree_max_density


def split_by_confidence_and_add_edges(confidence_threshold, digraphs, rows) -> Dict:
    """ dipgraphs is a dictionary of skeleton IDs as keys and DiGraph instances as values,
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
        for skid, digraph in digraphs.items():
            arbors[skid] = [digraph]
    else:
        # The DiGraph representing the skeleton may be disconnected at a low-confidence edge
        to_split = set()
        for row in rows:
            if row[2] < confidence_threshold:
                to_split.add(row[3])
            elif row[1]:
                digraphs[row[3]].add_edge(row[1], row[0])
        for skid, digraph in digraphs.items():
            if skid in to_split:
                arbors[skid] = list(weakly_connected_component_subgraphs(digraph))
            else:
                arbors[skid] = [digraph]

    return arbors

def split_by_synapse_domain(bandwidth, locations, arbors, treenode_connector, minis) -> Tuple[Dict, Any]:
    """ locations: dictionary of treenode ID vs tuple with x,y,z
        arbors: dictionary of skeleton ID vs list of DiGraph (that were, or not, split by confidence)
        treenode_connectors: dictionary of treenode ID vs list of tuples of connector_id, string of 'presynaptic_to' or 'postsynaptic_to'
    """
    arbors2 = {} # type: Dict
                 # Some arbors will be split further
    for skeleton_id, graphs in arbors.items():
        subdomains = [] # type: List
        arbors2[skeleton_id] = subdomains
        for graph in graphs:
            treenode_ids = []
            connector_ids =[]
            relation_ids = []
            for treenode_id in filter(treenode_connector.has_key, graph.nodes_iter()): # type: Tuple
                                                                                       # this is from networkx and returns an iterator over tuples
                for c in treenode_connector.get(treenode_id):
                    connector_id, relation = c
                    treenode_ids.append(treenode_id)
                    connector_ids.append(connector_id)
                    relation_ids.append(relation)

            if not connector_ids:
                subdomains.append(graph)
                continue

            for parent_id, treenode_id in graph.edges_iter():
                loc0 = locations[treenode_id]
                loc1 = locations[parent_id]
                graph[parent_id][treenode_id]['weight'] = norm(subtract(loc0, loc1))

            # Invoke Casey's magic
            max_density = tree_max_density(graph.to_undirected(), treenode_ids,
                    connector_ids, relation_ids, [bandwidth])
            synapse_group = next(max_density.values())
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
            for node in mini.nodes_iter():
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


def _skeleton_graph(project_id, skeleton_ids, confidence_threshold, bandwidth,
        expand, compute_risk, cable_spread, path_confluence,
        pre_rel='presynaptic_to', post_rel='postsynaptic_to') -> nx.DiGraph:
    """ Assumes all skeleton_ids belong to project_id. """
    skeletons_string = ",".join(str(int(x)) for x in skeleton_ids)
    cursor = connection.cursor()

    # Fetch all treenodes of all skeletons
    cursor.execute('''
    SELECT id, parent_id, confidence, skeleton_id,
           location_x, location_y, location_z
    FROM treenode
    WHERE skeleton_id IN (%s)
    ''' % skeletons_string)
    rows = tuple(cursor.fetchall())
    # Each skeleton is represented with a DiGraph
    arbors = defaultdict(nx.DiGraph) # type: Union[DefaultDict[Any, nx.DiGraph], Dict[Any, nx.DiGraph]]

    # Get reviewers for the requested skeletons
    reviews = get_treenodes_to_reviews(skeleton_ids=skeleton_ids)

    # Create a DiGraph for every skeleton
    for row in rows:
        arbors[row[3]].add_node(row[0], {'reviewer_ids': reviews.get(row[0], [])})

    # Dictionary of skeleton IDs vs list of DiGraph instances
    arbors = split_by_confidence_and_add_edges(confidence_threshold, arbors, rows)

    # Fetch all synapses
    relations = get_relation_to_id_map(project_id, cursor=cursor)
    cursor.execute('''
    SELECT connector_id, relation_id, treenode_id, skeleton_id
    FROM treenode_connector
    WHERE skeleton_id IN (%s)
      AND (relation_id = %s OR relation_id = %s)
    ''' % (skeletons_string, relations[pre_rel], relations[post_rel]))
    connectors = defaultdict(partial(defaultdict, list)) # type: DefaultDict
    skeleton_synapses = defaultdict(partial(defaultdict, list)) # type: DefaultDict
    for row in cursor.fetchall():
        connectors[row[0]][row[1]].append((row[2], row[3]))
        skeleton_synapses[row[3]][row[1]].append(row[2])

    # Cluster by synapses
    minis = defaultdict(list) # type: DefaultDict[Any, List]
                              # skeleton_id vs list of minified graphs
    locations = None
    whole_arbors = arbors
    if expand and bandwidth > 0:
        locations = {row[0]: (row[4], row[5], row[6]) for row in rows}
        treenode_connector = defaultdict(list) # type: DefaultDict[Any, List]
        for connector_id, pp in connectors.items():
            for treenode_id in chain.from_iterable(pp[relations[pre_rel]]):
                treenode_connector[treenode_id].append((connector_id, pre_rel))
            for treenode_id in chain.from_iterable(pp[relations[post_rel]]):
                treenode_connector[treenode_id].append((connector_id, post_rel))
        arbors_to_expand = {skid: ls for skid, ls in arbors.items() if skid in expand}
        expanded_arbors, minis = split_by_synapse_domain(bandwidth, locations, arbors_to_expand, treenode_connector, minis)
        arbors.update(expanded_arbors)


    # Obtain neuron names
    cursor.execute('''
    SELECT cici.class_instance_a, ci.name
    FROM class_instance ci,
         class_instance_class_instance cici
    WHERE cici.class_instance_a IN (%s)
      AND cici.class_instance_b = ci.id
      AND cici.relation_id = %s
    ''' % (skeletons_string, relations['model_of']))
    names = dict(cursor.fetchall())

    # A DiGraph representing the connections between the arbors (every node is an arbor)
    circuit = nx.DiGraph()

    for skid, digraphs in arbors.items():
        base_label = names[skid]
        tag = len(digraphs) > 1
        i = 0
        for g in digraphs:
            if g.number_of_nodes() == 0:
                continue
            if tag:
                label = "%s [%s]" % (base_label, i+1)
            else:
                label = base_label
            circuit.add_node(g, {'id': "%s_%s" % (skid, i+1),
                                 'label': label,
                                 'skeleton_id': skid,
                                 'node_count': len(g),
                                 'node_reviewed_count': sum(1 for v in g.node.values() if 0 != len(v.get('reviewer_ids', []))), # TODO when bandwidth > 0, not all nodes are included. They will be included when the bandwidth is computed with an O(n) algorithm rather than the current O(n^2)
                                 'branch': False})
            i += 1

    # Define edges between arbors, with number of synapses as an edge property
    for c in connectors.values():
        for pre_treenode, pre_skeleton in c[relations[pre_rel]]:
            for pre_arbor in arbors.get(pre_skeleton, ()):
                if pre_treenode in pre_arbor:
                    # Found the DiGraph representing an arbor derived from the skeleton to which the presynaptic treenode belongs.
                    for post_treenode, post_skeleton in c[relations[post_rel]]:
                        for post_arbor in arbors.get(post_skeleton, ()):
                            if post_treenode in post_arbor:
                                # Found the DiGraph representing an arbor derived from the skeleton to which the postsynaptic treenode belongs.
                                edge_props = circuit.get_edge_data(pre_arbor, post_arbor)
                                if edge_props:
                                    edge_props['c'] += 1
                                    edge_props['pre_treenodes'].append(pre_treenode)
                                    edge_props['post_treenodes'].append(post_treenode)
                                else:
                                    circuit.add_edge(pre_arbor, post_arbor, {'c': 1, 'pre_treenodes': [pre_treenode], 'post_treenodes': [post_treenode], 'arrow': 'triangle', 'directed': True})
                                break
                    break

    if compute_risk and bandwidth <= 0:
        # Compute synapse risk:
        # Compute synapse centrality of every node in every arbor that has synapses
        for skeleton_id, arbors in whole_arbors.items():
            synapses = skeleton_synapses[skeleton_id]
            pre = synapses[relations[pre_rel]]
            post = synapses[relations[post_rel]]
            for arbor in arbors:
                # The subset of synapses that belong to the fraction of the original arbor
                pre_sub = tuple(treenodeID for treenodeID in pre if treenodeID in arbor)
                post_sub = tuple(treenodeID for treenodeID in post if treenodeID in arbor)

                totalInputs = len(pre_sub)
                totalOutputs = len(post_sub)
                tc = {treenodeID: Counts() for treenodeID in arbor}

                for treenodeID in pre_sub:
                    tc[treenodeID].outputs += 1

                for treenodeID in post_sub:
                    tc[treenodeID].inputs += 1

                # Update the nPossibleIOPaths field in the Counts instance of each treenode
                _node_centrality_by_synapse(arbor, tc, totalOutputs, totalInputs)

                arbor.treenode_synapse_counts = tc

        if not locations:
            locations = {row[0]: (row[4], row[5], row[6]) for row in rows}

        # Estimate the risk factor of the edge between two arbors,
        # as a function of the number of synapses and their location within the arbor.
        # Algorithm by Casey Schneider-Mizell
        # Implemented by Albert Cardona
        for pre_arbor, post_arbor, edge_props in circuit.edges_iter(data=True):
            if pre_arbor == post_arbor:
                # Signal autapse
                edge_props['risk'] = -2
                continue

            try:
                spanning = spanning_tree(post_arbor, edge_props['post_treenodes'])
                #for arbor in whole_arbors[circuit[post_arbor]['skeleton_id']]:
                #    if post_arbor == arbor:
                #        tc = arbor.treenode_synapse_counts
                tc = post_arbor.treenode_synapse_counts
                count = spanning.number_of_nodes()
                if count < 3:
                    median_synapse_centrality = sum(tc[treenodeID].synapse_centrality for treenodeID in spanning.nodes_iter()) / count
                else:
                    median_synapse_centrality = sorted(tc[treenodeID].synapse_centrality for treenodeID in spanning.nodes_iter())[count / 2]
                cable = cable_length(spanning, locations)
                if -1 == median_synapse_centrality:
                    # Signal not computable
                    edge_props['risk'] = -1
                else:
                    edge_props['risk'] = 1.0 / sqrt(pow(cable / cable_spread, 2) + pow(median_synapse_centrality / path_confluence, 2)) # NOTE: should subtract 1 from median_synapse_centrality, but not doing it here to avoid potential divisions by zero
            except Exception as e:
                logging.getLogger(__name__).error(e)
                # Signal error when computing
                edge_props['risk'] = -3


    if expand and bandwidth > 0:
        # Add edges between circuit nodes that represent different domains of the same neuron
        for skeleton_id, list_mini in minis.items():
            for mini in list_mini:
                for node in mini.nodes_iter():
                    g = mini.node[node]['g']
                    if 1 == len(g) and next(g.nodes_iter(data=True))[1].get('branch'):
                        # A branch node that was preserved in the minified arbor
                        circuit.add_node(g, {'id': '%s-%s' % (skeleton_id, node),
                                             'skeleton_id': skeleton_id,
                                             'label': "", # "%s [%s]" % (names[skeleton_id], node),
                                             'node_count': 1,
                                             'branch': True})
                for node1, node2 in mini.edges_iter():
                    g1 = mini.node[node1]['g']
                    g2 = mini.node[node2]['g']
                    circuit.add_edge(g1, g2, {'c': 10, 'arrow': 'none', 'directed': False})

    return circuit


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_graph(request:HttpRequest, project_id=None) -> JsonResponse:
    project_id = int(project_id)
    skeleton_ids = set(int(v) for k,v in request.POST.items() if k.startswith('skeleton_list['))
    confidence_threshold = int(request.POST.get('confidence_threshold', 0))
    bandwidth = float(request.POST.get('bandwidth', 0)) # in nanometers
    cable_spread = float(request.POST.get('cable_spread', 2500)) # in nanometers
    path_confluence = int(request.POST.get('path_confluence', 10)) # a count
    compute_risk = 1 == int(request.POST.get('risk', 0))
    expand = set(int(v) for k,v in request.POST.items() if k.startswith('expand['))
    link_types = get_request_list(request.POST, 'link_types', None)
    by_link_type = bool(link_types)
    if not by_link_type:
        link_types = ['synaptic-connector']

    result = {} # type: ignore
    for link_type in link_types:
        pair = KNOWN_LINK_PAIRS.get(link_type)
        if not pair:
            raise ValueError("Unknown link type: " + link_type)

        source_rel = pair['source']
        target_rel = pair['target']

        circuit = _skeleton_graph(project_id, skeleton_ids,
                confidence_threshold, bandwidth, expand, compute_risk,
                cable_spread, path_confluence, source_rel, target_rel)
        package = {'nodes': [{'data': props} for props in circuit.node.values()],
                   'edges': []} # type: Dict
        edges = package['edges'] # type: List
        for g1, g2, props in circuit.edges_iter(data=True):
            id1 = circuit.node[g1]['id']
            id2 = circuit.node[g2]['id']
            data = {'id': '%s_%s' % (id1, id2),
                    'source': id1,
                    'target': id2,
                    'weight': props['c'],
                    'label': str(props['c']) if props['directed'] else None,
                    'directed': props['directed'],
                    'arrow': props['arrow']}
            if compute_risk:
                data['risk'] = props.get('risk')
            edges.append({'data': data})

        if by_link_type:
            result[link_type] = package
        else:
            result = package

    return JsonResponse(result, safe=False)

class Counts():
    def __init__(self):
        self.inputs = 0
        self.outputs = 0
        self.seenInputs = 0
        self.seenOutputs = 0
        self.nPossibleIOPaths = 0
        self.synapse_centrality = 0

def _node_centrality_by_synapse_db(skeleton_id:Union[int,str]) -> Dict:
    """ Compute the synapse centrality of every node in a tree.
    Return the dictionary of node ID keys and Count values.
    This function is meant for TESTING. """
    cursor = connection.cursor()
    cursor.execute('''
    SELECT t.id, t.parent_id, r.relation_name
    FROM treenode t LEFT OUTER JOIN (treenode_connector tc INNER JOIN relation r ON tc.relation_id = r.id) ON t.skeleton_id = tc.skeleton_id
    WHERE t.skeleton_id = %s
    ''', (skeleton_id))

    nodes = {} # type: Dict
               # node ID vs Counts
    tree = nx.DiGraph()
    root = None
    totalInputs = 0
    totalOutputs = 0

    for row in cursor.fetchall():
        counts = nodes.get(row[0])
        if not counts:
            counts = Counts()
            nodes[row[0]] = counts
        if row[2]:
            if 'presynaptic_to' == row[2]:
                counts.outputs += 1
                totalOutputs += 1
            elif 'postsynaptic_to' == row[2]:
                counts.inputs += 1
                totalInputs += 1
        if row[1]:
            tree.add_edge(row[0], row[1])
        else:
            root = row[0]

    _node_centrality_by_synapse(tree, nodes, totalOutputs, totalInputs)

    return nodes

def _node_centrality_by_synapse(tree, nodes:Dict, totalOutputs:int, totalInputs:int) -> None:
    """ tree: a DiGraph
        nodes: a dictionary of treenode ID vs Counts instance
        totalOutputs: the total number of output synapses of the tree
        totalInputs: the total number of input synapses of the tree
        Returns nothing, the results are an update to the Counts instance of each treenode entry in nodes, namely the nPossibleIOPaths. """
    # 1. Ensure the root is an end by checking that it has only one child; otherwise reroot at the first end node found

    if 0 == totalOutputs:
        # Not computable
        for counts in nodes.values():
            counts.synapse_centrality = -1
        return

    if len(tree.successors(find_root(tree))) > 1:
        # Reroot at the first end node found
        tree = tree.copy()
        endNode = next(nodeID for nodeID in nodes.keys() if not tree.successors(nodeID))
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
            counts.synapse_centrality = counts.nPossibleIOPaths / float(totalOutputs)

