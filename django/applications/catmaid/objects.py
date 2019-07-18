# -*- coding: utf-8 -*-

from collections import defaultdict
import numpy as np
import networkx as nx
from typing import Any, Dict, DefaultDict, List, Set

from catmaid.models import (ClassInstance, ClassInstanceClassInstance, Relation,
        Review, Treenode, TreenodeConnector, TreenodeClassInstance )


class Neuron(object):

    def __init__(self, neuron_id, project_id):

        self.neuron = ClassInstance.objects.get(pk=neuron_id, project_id = project_id)
        self.neuron_id = neuron_id
        self.project_id = project_id

    def get_contained_skeletons(self):

        qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=self.project_id,
            class_instance_b=self.neuron_id).select_related("class_instance_a")

        return [ele.class_instance_a.id for ele in qs]

class Skeleton(object):

    def __init__(self, skeleton_id, project_id = None):

        if project_id is None:
            self.skeleton = ClassInstance.objects.get(pk=skeleton_id)
            project_id = self.skeleton.project_id
        else:
            self.skeleton = ClassInstance.objects.get(pk=skeleton_id, project_id = project_id)

        self.skeleton_id = skeleton_id
        self.project_id = project_id
        self._edge_length_sum = 0.0

        self.graph = self._create_graph()
        self.connected_connectors = self._fetch_connected_connectors()
        self.downstream_skeletons = self._fetch_downstream_skeletons()
        self.upstream_skeletons = self._fetch_upstream_skeletons()

        self._compute_skeleton_edge_deltatime()

        qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=self.project_id,
            class_instance_a=self.skeleton_id).select_related("class_instance_b")
        self.neuron = qs[0].class_instance_b

    def node_count(self):
        return self.graph.number_of_nodes()

    def presynaptic_sites_count(self):
        """ The number of presynaptic sites """
        count = 0
        for k,v in self.connected_connectors.items():
            count += len(v['presynaptic_to'])
        return count

    def postsynaptic_sites_count(self):
        """ The number of postsynaptic sites """
        count = 0
        for k,v in self.connected_connectors.items():
            count += len(v['postsynaptic_to'])
        return count

    def input_count(self):
        """ Returns the number of unique skeletons upstream of this skeleton """
        n = set()
        for k,v in self.upstream_skeletons.items():
            n.add( k )
        return len(n)

    def output_count(self):
        """ Returns the number of unique skeletons downstream of this skeleton """
        n = set()
        for k,v in self.downstream_skeletons.items():
            n.add( k )
        return len(n)

    def _fetch_connected_connectors(self):
        """
        Example:
        { connector_id: {'presynaptic_to': [node_id1, node_id2],
                         'postsynaptic_to': [node_id3] }
        """

        qs_tc = TreenodeConnector.objects.filter(
            project=self.project_id,
            skeleton=self.skeleton.id
        ).select_related('connector')

        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=self.project_id))
        results = {} # type: Dict

        for tc in qs_tc:
            if not tc.connector_id in results:
                results[tc.connector_id] = {
                    'presynaptic_to': [],
                    'postsynaptic_to': [],
                    # TODO: labels, location etc.
                }

            if tc.relation_id == relations['presynaptic_to']:
                results[tc.connector_id]['presynaptic_to'].append( tc.treenode_id )
            elif tc.relation_id == relations['postsynaptic_to']:
                results[tc.connector_id]['postsynaptic_to'].append( tc.treenode_id )

        return results

    def _fetch_downstream_skeletons(self):
        """ Returns a list of skeleton IDs that this Skeleton synapses onto. """
        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=self.project_id))
        presynaptic_connectors = [k for k,v in self.connected_connectors.items() if len(v['presynaptic_to']) != 0]
        qs_tc = TreenodeConnector.objects.filter( project=self.project_id, connector__in=presynaptic_connectors, relation=relations['postsynaptic_to'] )
        res = {} # type: Dict
        for ele in qs_tc:
            if not ele.skeleton_id in res:
                res[ele.skeleton_id] = 0
            res[ele.skeleton_id] += 1
        return res

    def _fetch_upstream_skeletons(self):
        """ Returns a list of skeleton IDs that synapse onto this Skeleton.  """
        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=self.project_id))
        postsynaptic_connectors = [k for k,v in self.connected_connectors.items() if len(v['postsynaptic_to']) != 0]
        qs_tc = TreenodeConnector.objects.filter( project=self.project_id, connector__in=postsynaptic_connectors, relation=relations['presynaptic_to'] )
        res = {} # type: Dict
        for ele in qs_tc:
            if not ele.skeleton_id in res:
                res[ele.skeleton_id] = 0
            res[ele.skeleton_id] += 1
        return res

    def _create_graph(self):
        # retrieve all nodes of the skeleton
        treenode_qs = Treenode.objects.filter(
            skeleton_id=self.skeleton_id)
        # retrieve all reviews
        tid_to_reviews = defaultdict(list) # type: DefaultDict[Any, List]
        for r in Review.objects.filter(skeleton_id=self.skeleton_id):
            tid_to_reviews[r.id].append(r)
        # build the networkx graph from it
        graph = nx.DiGraph()
        for e in treenode_qs:
            reviews = tid_to_reviews[e.id]
            graph.add_node( e.id )
            # TODO: add attributes
            graph.node[e.id] = {
                'user_id': e.user_id,
                'creation_time': e.creation_time,
                'edition_time': e.edition_time,
                'location': np.array([e.location_x, e.location_y, e.location_z], dtype=np.float32),
                'reviewer_ids': [r.reviewer_id for r in reviews],
                'review_times': [r.review_time for r in reviews],
                'radius': e.radius,
                'tags': []
            }
            if e.parent_id:
                graph.add_edge( e.parent_id, e.id, {'confidence': e.confidence} )

        # add labels
        tci = TreenodeClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            treenode__in=graph.nodes(),
            project=self.project_id).select_related('class_instance')

        for t in tci:
            graph.node[t.treenode_id]['tags'].append( t.class_instance.name )

        return graph

    def cable_length(self):
        """ Compute the sum of the edge lengths which is the total cable length. """
        if self._edge_length_sum != 0.0:
            return self._edge_length_sum
        sum = 0.0
        node = self.graph.node
        for ID_from, ID_to in self.graph.edges(data=False):
            sum += np.linalg.norm(node[ID_to]['location'] - node[ID_from]['location'])
        self._edge_length_sum = sum
        return self._edge_length_sum

    def _compute_skeleton_edge_deltatime(self):
        node = self.graph.node
        edge = self.graph.edge
        for ID_from, ID_to in self.graph.edges(data=False):
            stamp1 = node[ID_from]['creation_time']
            stamp2 = node[ID_to]['creation_time']
            if stamp1 >= stamp2:
                edge[ID_from][ID_to]['delta_creation_time'] = stamp1-stamp2
            else:
                edge[ID_from][ID_to]['delta_creation_time'] = stamp2-stamp1

    def measure_construction_time(self, threshold=300):
        """ Measure the amount of time consumed in creating this Skeleton.
        This will only count edges that were created lower than the given
        threshold value in seconds.
        """
        sum = 0
        for ID_from, ID_to, d  in self.graph.edges(data=True):
            if d['delta_creation_time'].seconds < threshold:
                sum += d['delta_creation_time'].seconds
        return sum

    def percentage_reviewed(self):
        """ Measure the percent of nodes that have been reviewed. """
        node_count_reviewed = 0
        for k,v in self.graph.nodes(data=True):
            if v['reviewer_ids']:
                node_count_reviewed += 1
        if node_count_reviewed:
            return 100.0 * node_count_reviewed / self.node_count()
        else:
            return 0.0

class SkeletonGroup(object):

    def __init__(self, skeleton_id_list, project_id):
        """ A set of skeleton ids """
        self.skeleton_id_list = list(set(skeleton_id_list))
        self.project_id = project_id
        self.skeletons = {} # type: Dict
        for skeleton_id in skeleton_id_list:
            if not skeleton_id in self.skeletons:
                self.skeletons[skeleton_id] = Skeleton(skeleton_id, self.project_id)
        self.graph = self._connectivity_graph()

    def _connectivity_graph(self):
        graph = nx.DiGraph()

        for skeleton_id in self.skeleton_id_list:
            graph.add_node( skeleton_id, {
                'baseName': '%s (SkeletonID: %s)' % (self.skeletons[skeleton_id].neuron.name, str(skeleton_id) ),
                'neuronname': self.skeletons[skeleton_id].neuron.name,
                'skeletonid': str(skeleton_id),
                'node_count': str( self.skeletons[skeleton_id].node_count() ),
                'percentage_reviewed': str( self.skeletons[skeleton_id].percentage_reviewed() ),
                'cable_length': str( self.skeletons[skeleton_id].cable_length() )
            })

        connectors = {} # type: Dict
        for skeleton_id, skeleton in self.skeletons.items():
            for connector_id, v in skeleton.connected_connectors.items():
                if not connector_id in connectors:
                    connectors[connector_id] = {
                        'pre': [], 'post': []
                    }

                if len(v['presynaptic_to']):
                    # add the skeleton id for each treenode that is in v['presynaptic_to']
                    # This can duplicate skeleton id entries which is correct
                    for e in v['presynaptic_to']:
                        connectors[connector_id]['pre'].append( skeleton.skeleton_id )

                if len(v['postsynaptic_to']):
                    for e in v['postsynaptic_to']:
                        connectors[connector_id]['post'].append( skeleton.skeleton_id )

        # merge connectors into graph
        for connector_id, v in connectors.items():
            for from_skeleton in v['pre']:
                for to_skeleton in v['post']:

                    if not graph.has_edge( from_skeleton, to_skeleton ):
                        graph.add_edge( from_skeleton, to_skeleton, {'count': 0, 'connector_ids': set() } )

                    graph.edge[from_skeleton][to_skeleton]['count'] += 1
                    graph.edge[from_skeleton][to_skeleton]['connector_ids'].add( connector_id )

        for u,v,d in graph.edges_iter(data=True):
            d['connector_ids'] = list(d['connector_ids'])

        return graph

    def all_shared_connectors(self):
        """ Returns a set of connector ids that connect skeletons in the group
        """
        resulting_connectors = set() # type: Set
        for u,v,d in self.graph.edges_iter(data=True):
            resulting_connectors.update(d['connector_ids'])
        return resulting_connectors

def confidence_filtering( skeleton, confidence_threshold ):
    for u,v,d in skeleton.graph.edges_iter(data=True):
        if d['confidence'] <= confidence_threshold:
            skeleton.graph.remove_edge( u, v )

def edgecount_filtering( skeleton, edgecount ):
    graph = skeleton.graph
    keep = set() # type: Set

    # init edge count (and compute distance) on the edges
    for ID_from, ID_to in graph.edges(data=False):
        # graph.edge[ID_from][ID_to]['distance'] = np.linalg.norm(graph.node[ID_to]['location'] - graph.node[ID_from]['location'])
        graph.edge[ID_from][ID_to]['edgecount'] = 1

    # list of nodes which are either pre or postsynaptic
    for connector_id, di in skeleton.connected_connectors.items():
        keep.update( di['presynaptic_to'] )
        keep.update( di['postsynaptic_to'] )

    # add nodes that are either branch (deg>2) or leaf (deg==1)
    for nodeid, value in nx.degree(graph).items():
        if value == 1 or value > 2:
            keep.add( nodeid )

    # while loop to collapse nodes with deg==2 not in the set and add physical distances
    # until none is changing anymore
    ends = False
    while not ends:
        ends = True
        for nodeid, d in graph.nodes_iter(data=True):
            if nodeid in keep:
                continue
            fromnode = graph.predecessors(nodeid)[0]
            tonode = graph.successors(nodeid)[0]
            #newdistance = graph.edge[fromnode][nodeid]['distance'] + graph.edge[nodeid][tonode]['distance']
            newedgecount = graph.edge[fromnode][nodeid]['edgecount'] + graph.edge[nodeid][tonode]['edgecount']
            graph.add_edge(fromnode, tonode, {'edgecount': newedgecount}) # 'distance': newdistance,
            graph.remove_edge( fromnode, nodeid )
            graph.remove_edge( nodeid, tonode )
            graph.remove_node( nodeid )
            ends = False
            break

    for u,v,d in graph.edges_iter(data=True):
        if d['edgecount'] >= edgecount:
            skeleton.graph.remove_edge( u, v )

def compartmentalize_skeletongroup_by_confidence( skeleton_id_list, project_id, confidence_threshold = 4):
    """ Splits all skeleton edges lower than the threshold into compartments
    and returns a graph """

    return compartmentalize_skeletongroup( skeleton_id_list, project_id, confidence_threshold = confidence_threshold )

def compartmentalize_skeletongroup_by_edgecount( skeleton_id_list, project_id, edgecount = 10):
    """ Collapses all skeleton edges between leaf, branch and pre- and postsynaptic nodes. Then cut the resulting
    skeleton at edges which have a count of collapsed edges strictly bigger than the edgecount parameters.

    This allows to compartmentalize a skeleton based on 'uninteresting' cable without synaptic sites or branch
    characteristics. """
    # TODO: add XY or XZ projection planes to position the compartment clusters with a proxy of its
    # physical location in the stack

    return compartmentalize_skeletongroup( skeleton_id_list, project_id, edgecount = edgecount )

def compartmentalize_skeletongroup( skeleton_id_list, project_id, **kwargs ):

    skelgroup = SkeletonGroup( skeleton_id_list, project_id )

    compartment_graph_of_skeletons = {}
    resultgraph = nx.DiGraph()

    for skeleton_id, skeleton in skelgroup.skeletons.items():
        if 'confidence_threshold' in kwargs:
            confidence_filtering( skeleton, kwargs['confidence_threshold'] )
        elif 'edgecount' in kwargs:
            edgecount_filtering( skeleton, kwargs['edgecount'] )

        subgraphs = list(nx.weakly_connected_component_subgraphs( skeleton.graph))
        compartment_graph_of_skeletons[ skeleton_id ] = subgraphs

        for i,subg in enumerate(subgraphs):
            for nodeid, d in subg.nodes_iter(data=True):
                d['compartment_index'] = i
                skeleton.graph.node[nodeid]['compartment_index'] = i

            if len(skeleton.neuron.name) > 30:
                neuronname = skeleton.neuron.name[:30] + '...' + ' [{0}]'.format(i)
            else:
                neuronname = skeleton.neuron.name + ' [{0}]'.format(i)

            resultgraph.add_node( '{0}_{1}'.format(skeleton_id, i), {
                    'neuronname': neuronname,
                    'skeletonid': str(skeleton_id),
                    'compartment_index': i,
                    'node_count': subg.number_of_nodes(),
                })

    connectors = {} # type: Dict
    for skeleton_id, skeleton in skelgroup.skeletons.items():
        for connector_id, v in skeleton.connected_connectors.items():
            if not connector_id in connectors:
                connectors[connector_id] = {
                    'pre': [], 'post': []
                }

            if len(v['presynaptic_to']):
                # add the skeleton id for each treenode that is in v['presynaptic_to']
                # This can duplicate skeleton id entries which is correct
                for e in v['presynaptic_to']:
                    skeleton_compartment_id = '{0}_{1}'.format(
                        skeleton_id,
                        skeleton.graph.node[e]['compartment_index'])
                    connectors[connector_id]['pre'].append( skeleton_compartment_id )

            if len(v['postsynaptic_to']):
                for e in v['postsynaptic_to']:
                    skeleton_compartment_id = '{0}_{1}'.format(
                        skeleton_id,
                        skeleton.graph.node[e]['compartment_index'])
                    connectors[connector_id]['post'].append( skeleton_compartment_id )

    # merge connectors into graph
    for connector_id, v in connectors.items():
        for from_skeleton in v['pre']:
            for to_skeleton in v['post']:

                if not resultgraph.has_edge( from_skeleton, to_skeleton ):
                    resultgraph.add_edge( from_skeleton, to_skeleton, {'count': 0, 'connector_ids': set() } )

                resultgraph.edge[from_skeleton][to_skeleton]['count'] += 1
                resultgraph.edge[from_skeleton][to_skeleton]['connector_ids'].add( connector_id )


    return resultgraph
