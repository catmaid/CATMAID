from models import *

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

    def __init__(self, skeleton_id, project_id):

        self.skeleton = ClassInstance.objects.get(pk=skeleton_id, project_id = project_id)
        self.skeleton_id = skeleton_id
        self.project_id = project_id
        self.graph = None
        self.downstream_skeletons = None
        self.upstream_skeletons = None

        qs = ClassInstanceClassInstance.objects.filter(
            relation__relation_name='model_of',
            project=self.project_id,
            class_instance_a=self.skeleton_id).select_related("class_instance_b")
        self.neuron = qs[0].class_instance_b

    def get_number_of_treenodes(self):
        return self.get_skeleton_as_nx_graph().number_of_nodes()

    def get_number_of_incoming_synapses(self):
        n = 0
        for k,v in self.get_upstream_skeletons().items():
            n += v['presynaptic_to']
        return n

    def get_number_of_outgoing_synapses(self):
        n = 0
        for k,v in self.get_downstream_skeletons().items():
            n += v['postsynaptic_to']
        return n

    def get_downstream_skeletons(self):
        if self.downstream_skeletons:
            return self.downstream_skeletons
        else:
            self.downstream_skeletons = self._synaptically_connected_skeletons( ConnectivityDirection.POSTSYNAPTIC_PARTNERS )
        return self.downstream_skeletons

    def get_upstream_skeletons(self):
        if self.upstream_skeletons:
            return self.upstream_skeletons
        else:
            self.upstream_skeletons = self._synaptically_connected_skeletons( ConnectivityDirection.PRESYNAPTIC_PARTNERS )
        return self.upstream_skeletons

    def _synaptically_connected_skeletons(self, direction):

        if direction == ConnectivityDirection.PRESYNAPTIC_PARTNERS:
            this_to_syn = 'post'
            syn_to_con = 'pre'
            direction_name = 'presynaptic_to'
        elif direction == ConnectivityDirection.POSTSYNAPTIC_PARTNERS:
            this_to_syn = 'pre'
            syn_to_con = 'post'
            direction_name = 'postsynaptic_to'
        else:
            raise Exception, "Unknown connectivity direction: "+str(direction)

        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=self.project_id))

        qs_tc = TreenodeConnector.objects.filter(
            project=self.project_id,
            skeleton=self.skeleton.id,
            relation=relations[this_to_syn+'synaptic_to']
        ).select_related('connector')

        # extract all connector ids
        connector_ids=[ tc.connector_id for tc in qs_tc]

        # find all syn_to_con connections
        qs_tc = TreenodeConnector.objects.filter(
            project=self.project_id,
            connector__in=connector_ids,
            relation=relations[syn_to_con+'synaptic_to']
        )
        # keep track of the connectivity count
        result_skeletons = {}
        for tc in qs_tc:
            if tc.skeleton_id in result_skeletons:
                result_skeletons[tc.skeleton_id][direction_name] += 1
            else:
                result_skeletons[tc.skeleton_id] = {
                    direction_name: 1
                }

        return result_skeletons

    def get_skeleton_as_nx_graph(self):

        if self.graph:
            return self.graph

        # retrieve all nodes of the skeleton
        treenode_qs = Treenode.objects.filter(
            skeleton_id=self.skeleton_id,
            project=self.project_id).order_by('id')
        # build the networkx graph from it
        self.graph = nx.DiGraph()
        for e in treenode_qs:
            self.graph.add_node( e.id )
            # TODO: add attributes
            self.graph.node[e.id] = {
                'user_id': e.user_id,
                'creation_time': e.creation_time,
                'edition_time': e.edition_time,
                'x': e.location.x,
                'y': e.location.y,
                'z': e.location.z,
                'reviewer_id': e.reviewer_id,
                'review_time': e.review_time,
                'radius': e.radius,
                'confidence': e.confidence
                # TODO: labels!
            }
            if e.parent_id:
                self.graph.add_edge( e.parent_id, e.id )

        return self.graph

    def compute_skeleton_edge_length(self):
        # location differences
        pass

    def compute_skeleton_edge_deltatime(self):
        # delta_time_created_modified
        pass

    def get_percentage_reviewed(self):
        pass


class SkeletonGroup(object):

    def __init__(self, skeleton_id_list, project_id):
        """ A set of skeleton ids """

        self.skeleton_id_list = skeleton_id_list
        self.project_id = project_id
        self.skeletons = []
        for skeleton_id in skeleton_id_list:
            self.skeletons.append( Skeleton(skeleton_id, self.project_id) )

    def get_connectivity_graph(self):

        self.graph = nx.DiGraph()
        self.graph.add_nodes_from( self.skeleton_id_list )

        # EXPENSIVE
        for skeleton_id in self.skeleton_id_list:
            skeleton = Skeleton(skeleton_id, self.project_id)

            for k,v in skeleton.get_upstream_skeletons().items():
                if k in self.graph:
                    if not self.graph.has_edge(k, skeleton_id):
                        self.graph.add_edge(k, skeleton_id )

                    if hasattr(self.graph[k][skeleton_id], 'presynaptic_to'):
                        self.graph[k][skeleton_id]['presynaptic_to'] += v['presynaptic_to']
                    else:
                        self.graph[k][skeleton_id] = {
                            'presynaptic_to': v['presynaptic_to']
                        }

            for k,v in skeleton.get_downstream_skeletons().items():
                if k in self.graph:
                    if not self.graph.has_edge(k, skeleton_id):
                        self.graph.add_edge(k, skeleton_id )

                    if hasattr(self.graph[k][skeleton_id], 'postsynaptic_to'):
                        self.graph[k][skeleton_id]['postsynaptic_to'] += v['postsynaptic_to']
                    else:
                        self.graph[k][skeleton_id] = {
                            'postsynaptic_to': v['postsynaptic_to']
                        }

        return self.graph

    def get_connectivity_list(self):
        # For table with some constraints, e.g. only check the percentage reviewed for skeletons with >3 nodes
        pass

