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

    def input_count(self):
        """ Returns the number of anatomical synaptic inputs onto this Skeleton. """
        n = 0
        for k,v in self.upstream_skeletons.items():
            n += v
        return n

    def output_count(self):
        """ Returns the number of anatomical synaptic outputs onto other Skeleton instances. """
        n = 0
        for k,v in self.downstream_skeletons.items():
            n += v
        return n

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
        results = {}

        for tc in qs_tc:
            if not tc.skeleton_id in results:
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
        res = {}
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
        res = {}
        for ele in qs_tc:
            if not ele.skeleton_id in res:
                res[ele.skeleton_id] = 0
            res[ele.skeleton_id] += 1
        return res

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
            return 100.0 * node_count_reviewed / self.node_count()
        else:
            return 0.0


class SkeletonGroup(object):

    def __init__(self, skeleton_id_list, project_id):
        """ A set of skeleton ids """
        self.skeleton_id_list = skeleton_id_list
        self.project_id = project_id
        self.skeletons = {}
        for skeleton_id in skeleton_id_list:
            if not skeleton_id in self.skeletons:
                self.skeletons[skeleton_id] = Skeleton(skeleton_id, self.project_id)
        self.graph = self._connectivity_graph()

    def _connectivity_graph(self):
        graph = nx.DiGraph()

        for skeleton_id in self.skeleton_id_list:
            graph.add_node( skeleton_id, {
                'baseName': '%s (SkeletonID: %s)' % (self.skeletons[skeleton_id].neuron.name, str(skeleton_id) )
            })

        connectors = {}
        for skeleton_id, skeleton in self.skeletons.items():
            for connector_id, v in skeleton.connected_connectors.items():
                if not connectors.has_key(connector_id):
                    connectors[connector_id] = {
                        'pre': [], 'post': []
                    }
                if len(v['presynaptic_to']) != 0:
                    connectors[connector_id]['pre'].append( skeleton.skeleton_id )

                if len(v['postsynaptic_to']) != 0:
                    connectors[connector_id]['post'].append( skeleton.skeleton_id )

        # merge connectors into graph
        for connector_id, v in connectors.items():
            for from_skeleton in v['pre']:
                for to_skeleton in v['post']:

                    if not graph.has_edge( from_skeleton, to_skeleton ):
                        graph.add_edge( from_skeleton, to_skeleton, {'count': 0} )

                    graph.edge[from_skeleton][to_skeleton]['count'] += 1

        return graph
