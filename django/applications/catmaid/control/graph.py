import json
from django.db import connection
from django.http import HttpResponse
from catmaid.control.authentication import *
from catmaid.models import Relation
import networkx as nx
from networkx.algorithms import weakly_connected_component_subgraphs
from collections import defaultdict

def _skeleton_graph(project_id, skeleton_ids, confidence_threshold):
    """ Assumes all skeleton_ids belong to project_id. """
    skeletons_string = ",".join(str(int(x)) for x in skeleton_ids)
    cursor = connection.cursor()

    # Fetch all treenodes of all skeletons
    cursor.execute('''
    SELECT id, parent_id, confidence, skeleton_id
    FROM treenode
    WHERE skeleton_id IN (%s)
    ''' % skeletons_string)
    rows = tuple(cursor.fetchall())
    # Each skeleton is represented with a DiGraph
    skeletons = defaultdict(nx.DiGraph)

    # Create a DiGraph for every skeleton
    for row in rows:
        skeletons[row[3]].add_node(row[0])
    # Define edges, which may result in multiple subgraphs for each skeleton
    # when splitting at low-confidence edges:
    if 0 == confidence_threshold:
        # Do not split skeletons
        for row in rows:
            skeletons[row[3]].add_edge(row[1], row[0])
    else:
        # The DiGraph representing the skeleton may be disconnected at a low-confidence edge
        for row in rows:
            if row[2] >= confidence_threshold:
                skeletons[row[3]].add_edge(row[1], row[0])

    # An 'arbor' is a skeleton, or subset, whose nodes are all connected.
    # Express the skeleton map as a map of skeleton ID vs list of arbors
    fn = list if 0 == confidence_threshold else weakly_connected_component_subgraphs
    arbors = {skid: fn(digraph) for skid, digraph in skeletons.iteritems()}

    # Fetch all synapses
    relations = {'presynaptic_to': -1, 'postsynaptic_to': -1}
    for r in Relation.objects.filter(relation_name__in=('presynaptic_to', 'postsynaptic_to'), project_id=project_id).values_list('relation_name', 'id'):
        relations[r[0]] = r[1]
    cursor.execute('''
    SELECT connector_id, relation_id, treenode_id, skeleton_id
    FROM treenode_connector
    WHERE skeleton_id IN (%s)
    ''' % skeletons_string)
    def container():
        return defaultdict(list)
    connectors = defaultdict(container)
    for row in cursor.fetchall():
        connectors[row[0]][row[1]].append((row[2], row[3]))

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
    skeleton_ids = map(int, request.POST.getlist('skeleton_list[]'))
    confidence_threshold = int(request.POST.get('confidence_threshold', 0))
    circuit = _skeleton_graph(project_id, skeleton_ids, confidence_threshold)
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


