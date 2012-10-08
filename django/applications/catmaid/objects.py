from models import *

import numpy as np
import networkx as nx

class Neuron(object):

    def __init__(self, neuron_id, project_id):

        self.neuron = ClassInstance.objects.get(pk=neuron_id, project_id = project_id)
        self.neuron_id = neuron_id
        self.project_id = project_id

    def get_contained_skeletons(self):

        qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=self.project_id,
            class_instance_b=self.neuron_id).select_related("class_instance_b")

        return [ele.class_instance_a.id for ele in qs]

class Skeleton(object):

    def __init__(self, skeleton_id, project_id=None):

        if project_id is None:
            self.skeleton = ClassInstance.objects.get(pk=skeleton_id)
            project_id = self.skeleton.project_id
        else:
            self.skeleton = ClassInstance.objects.get(pk=skeleton_id, project_id = project_id)

        self.skeleton_id = skeleton_id
        self.project_id = project_id
        self.edge_length_sum = 0.0

        self.graph = self._create_graph()
        self.connected_skeletons = self._fetch_connected_skeletons()

        self._compute_skeleton_edge_deltatime()

        qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=self.project_id,
            class_instance_a=self.skeleton_id).select_related("class_instance_b")
        self.neuron = qs[0].class_instance_b

    def node_count(self):
        return self.graph.number_of_nodes()

    def input_count(self):
        """ Returns the number of anatomical synaptic inputs onto this Skeleton. """
        n = 0
        for k,v in self.connected_skeletons.items():
            n += len(v['presynaptic_to'])
        return n

    def output_count(self):
        """ Returns the number of anatomical synaptic outputs onto other Skeleton instances. """
        n = 0
        for k,v in self.connected_skeletons.items():
            n += len(v['postsynaptic_to'])
        return n

    def _fetch_connected_skeletons(self):
        """ Returns a dictionary where keys are Skeleton IDs of Skeletons synaptically related to this Skeleton,
        and values are dictionaries with the keys 'presynaptic_to' and 'postsynaptic_to'.
        For 'presynaptic_to', the values are dictionaries with node IDs (of this Skeleton) as key and connector IDs as values,
        For 'postsynaptic_to', the values are dictionaries with connector IDs (of other Skeleton instances) as keys,
        and node IDs as values."

        Example:
        { skeletonid: {'presynaptic_to': { node_id: connector_id },
                       'postsynaptic_to': { connector_id: node_id } }
        """

        qs_tc = TreenodeConnector.objects.filter(
            project=self.project_id,
            skeleton=self.skeleton.id
        ).select_related('connector')

        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=self.project_id))
        results = {}

        for tc in qs_tc:
            if not tc.skeleton_id in results:
                results[tc.skeleton_id] = {
                    'presynaptic_to': {},
                    'postsynaptic_to': {}
                }

            if tc.relation_id == relations['presynaptic_to']:
                results[tc.skeleton_id]['presynaptic_to'][tc.treenode_id] = tc.connector_id
            elif tc.relation_id == relations['postsynaptic_to']:
                results[tc.skeleton_id]['postsynaptic_to'][tc.connector_id] = tc.treenode_id

        return results

    def downstream_skeletons(self):
        """ Returns a list of Skeleton instances that this Skeleton synapses onto. """
        return [k for k,v in self.connected_skeletons.items() if len(v['presynaptic_to']) != 0]

    def upstream_skeletons(self):
        """ Returns a list of Skeleton instances that synapse onto this Skeleton.  """
        return [k for k,v in self.connected_skeletons.items() if len(v['postsynaptic_to']) != 0]

    def _create_graph(self):
        # retrieve all nodes of the skeleton
        treenode_qs = Treenode.objects.filter(
            skeleton_id=self.skeleton_id,
            project=self.project_id).order_by('id')
        # build the networkx graph from it
        graph = nx.DiGraph()
        for e in treenode_qs:
            graph.add_node( e.id )
            # TODO: add attributes
            graph.node[e.id] = {
                'user_id': e.user_id,
                'creation_time': e.creation_time,
                'edition_time': e.edition_time,
                'location': np.array([e.location.x, e.location.y, e.location.z], dtype=np.float32),
                'reviewer_id': e.reviewer_id,
                'review_time': e.review_time,
                'radius': e.radius,
                'confidence': e.confidence
                # TODO: labels!
            }
            if e.parent_id:
                graph.add_edge( e.parent_id, e.id )
        return graph

    def cable_length(self):
        """ Compute the sum of the edge lengths which is the total cable length. """
        if self.edge_length_sum != 0.0:
            return self.edge_length_sum
        sum = 0.0
        node = self.graph.node
        for ID_from, ID_to in self.graph.edges(data=False):
            sum += np.linalg.norm(node[ID_to]['location'] - node[ID_from]['location'])
        self.edge_length_sum = sum
        return self.edge_length_sum

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

    def measure_construction_time(self, threshold=0):
        """ Measure the amount of time consumed in creating this Skeleton.
        Will discard edges that took longer than the given threshold, in seconds.
        """
        sum = 0
        for ID_from, ID_to, d  in self.graph.edges(data=True):
            print d['delta_creation_time'].seconds
            if d['delta_creation_time'].seconds > threshold:
                sum += d['delta_creation_time'].seconds
        return sum

    def percentage_reviewed(self):
        """ Measure the percent of nodes that have been reviewed. """
        node_count_reviewed = len([k for k,v in self.graph.nodes(data=True) if v['reviewer_id'] != -1])
        if node_count_reviewed:
            return 1.0 * self.node_count() / node_count_reviewed
        else:
            return 0.0


class SkeletonGroup(object):

    def __init__(self, skeleton_id_list, project_id):
        """ A set of skeleton ids """
        self.skeleton_id_list = skeleton_id_list
        self.project_id = project_id
        self.skeletons = []
        for skeleton_id in skeleton_id_list:
            self.skeletons.append( Skeleton(skeleton_id, self.project_id) )
        self.graph = self._connectivity_graph()

    def _connectivity_graph(self):
        graph = nx.DiGraph()
        graph.add_nodes_from( self.skeleton_id_list )
        print grpah.nodes()
        for skeleton in self.skeletons:
            print '----skeleton', skeleton.skeleton_id

            for k,v in skeleton.connected_skeletons.items():

                print k,v

                if graph.has_node( k ):

                    number_of_connections = len(v['presynaptic_to'])
                    if number_of_connections != 0:

                        if not graph.has_edge(k, skeleton.skeleton_id):
                            graph.add_edge(k, skeleton.skeleton_id )

                        if hasattr(graph[k][skeleton.skeleton_id], 'presynaptic_to'):
                            print 'add up', number_of_connections
                            graph[k][skeleton_id]['presynaptic_to'] += number_of_connections
                        else:
                            print 'init edge', number_of_connections
                            graph[k][skeleton.skeleton_id] = {
                                'presynaptic_to': number_of_connections
                            }

        return graph
