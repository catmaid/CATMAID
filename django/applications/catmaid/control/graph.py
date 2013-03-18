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
import numpy as np

def _skeleton_graph(project_id, skeleton_ids, confidence_threshold, bandwidth):
    """ Assumes all skeleton_ids belong to project_id. """
    skeletons_string = ",".join(str(int(x)) for x in skeleton_ids)
    cursor = connection.cursor()

    # Fetch all treenodes of all skeletons
    cursor.execute('''
    SELECT id, parent_id, confidence, skeleton_id, location
    FROM treenode
    WHERE skeleton_id IN (%s)
    ''' % skeletons_string)
    rows = tuple(cursor.fetchall())
    # Each skeleton is represented with a DiGraph
    arbors = defaultdict(nx.DiGraph)

    # Create a DiGraph for every skeleton
    for row in rows:
        arbors[row[3]].add_node(row[0])
    # Define edges, which may result in multiple subgraphs for each skeleton
    # when splitting at low-confidence edges:
    if 0 == confidence_threshold:
        # Do not split skeletons
        for row in rows:
            if row[1]:
                arbors[row[3]].add_edge(row[1], row[0])
        for skid, digraph in arbors.iteritems():
            arbors[skid] = [digraph]
    else:
        # The DiGraph representing the skeleton may be disconnected at a low-confidence edge
        to_split = set()
        for row in rows:
            if row[2] < confidence_threshold:
                to_split.add(row[3])
            elif row[1]:
                arbors[row[3]].add_edge(row[1], row[0])
        for skid, digraph in arbors.iteritems():
            if skid in to_split:
                arbors[skid] = weakly_connected_component_subgraphs(digraph)
            else:
                arbors[skid] = [digraph]

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
    if bandwidth > 0:
        locations = {row[0]: eval(row[4]) for row in rows}

        treenode_connector = defaultdict(list)
        for connector_id, pp in connectors.iteritems():
            for treenode_id in chain.from_iterable(pp[relations['presynaptic_to']]):
                treenode_connector[treenode_id].append((connector_id, "presynaptic_to"))
            for treenode_id in chain.from_iterable(pp[relations['postsynaptic_to']]):
                treenode_connector[treenode_id].append((connector_id, "postsynaptic_to"))

        for skeleton_id, graphs in arbors.iteritems():
            subdomains = []
            for graph in graphs:
                for parent_id, treenode_id in graph.edges():
                    loc0 = locations[treenode_id]
                    loc1 = locations[parent_id]
                    graph[parent_id][treenode_id]['weight'] = np.linalg.norm(np.subtract(loc0, loc1))
                treenode_ids = []
                connector_ids =[]
                relation_strings = []
                for treenode_id in ifilter(treenode_connector.has_key, graph.nodes()):
                    for c in treenode_connector.get(treenode_id):
                        connector_id, relation = c
                        treenode_ids.append(treenode_id)
                        connector_ids.append(connector_id)
                        relation_strings.append(relation)
                # Invoke Casey's magic
                print "before:", len(graph.nodes()), len(treenode_ids), len(connector_ids)
                synapse_group = tree_max_density(graph.to_undirected(), treenode_ids, connector_ids, relation_strings, [bandwidth]).values()[0]
                print "After:", type(synapse_group), synapse_group
                # The list of nodes contains nodes that have connectors only
                for domain in synapse_group.values():
                    g = nx.DiGraph()
                    g.add_path(domain.node_ids) # bogus graph, containing treenodes that point to connectors
                    subdomains.append(g)
            arbors[skeleton_id] = subdomains
    
    
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
    names = {row[0]: row[1] for row in cursor.fetchall()}

    # A DiGraph representing the connections between the arbors (every node is an arbor)
    circuit = nx.DiGraph()
    for skid, digraphs in arbors.iteritems():
        for i, g in enumerate(sorted(digraphs, key=len, reverse=True)):
            circuit.add_node(g, {'id': "%s_%s" % (skid, i+1),
                                 'label': "%s [%s]" % (names[skid], i+1),
                                 'skeleton_id': skid,
                                 'node_count': len(g)})
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
                                    circuit.add_edge(pre_arbor, post_arbor, {'c': 1})
                                break
                    break
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
                               'label': str(props['c']),
                               'directed': True}})

    return HttpResponse(json.dumps(package))


