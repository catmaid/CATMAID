# -*- coding: utf-8 -*-

from collections import namedtuple
import logging
import networkx as nx
import numpy as np
from numpy import array, float32
from numpy.linalg import norm
from typing import Any, DefaultDict, Dict, List, NamedTuple, Tuple

logger = logging.getLogger(__name__)

try:
    from scipy.sparse.csgraph import dijkstra
except ImportError:
    logger.warning("CATMAID was unable to load the scipy module. "
        "Synapse clustering won't be available")

from catmaid.control.common import get_relation_to_id_map
from catmaid.models import Treenode, TreenodeConnector, ClassInstance, Relation


def synapse_clustering(skeleton_id, h_list) -> Dict:

    Gwud = createSpatialGraphFromSkeletonID( skeleton_id )
    synNodes, connector_ids, relations = synapseNodesFromSkeletonID( skeleton_id )

    return tree_max_density(Gwud, synNodes, connector_ids, relations, h_list)


def tree_max_density(Gwud, synNodes, connector_ids, relations, h_list) -> Dict:
    """ Gwud: networkx graph were the edges are weighted by length, and undirected.
        synNodes: list of node IDs where there is a synapse.
        connector_ids: list of connector IDs.
        relations: list of the type of synapse, 'presynaptic_to' or 'postsynaptic_to'.
        The three lists are synchronized by index.
    """

    D, id2index = distanceMatrix(Gwud, synNodes)

    SynapseGroup = namedtuple("SynapseGroup", ['node_ids', 'connector_ids', 'relations', 'local_max']) # type: NamedTuple
    synapseGroups = {} # type: Dict

    for h in h_list:
        expDh = np.exp(-1 * np.multiply(D, D) / (h * h) )

        targLoc = {} # type: Dict           # targLocs hosts the final destination nodes of the hill climbing
        densityField = {} # type: Dict           # densityField stores the height of the hill to be climbed
        for startNode in synNodes:
            if startNode not in targLoc:
                currNode = startNode
                allOnPath = []

                if startNode not in densityField:
                    densityField[startNode] = 0
                    densityField[startNode] = np.sum(expDh[:,id2index[startNode]])

                while True:
                    allOnPath.append(currNode)

                    #Make sure I have densityField of all neighbors for comparison
                    if currNode in targLoc:
                        currNode = targLoc[ currNode ] # Jump right to the end already.
                        break

                    for nn in Gwud.neighbors( currNode ):
                        if nn not in densityField:
                            densityField[nn] = 0
                            densityField[nn] = np.sum(expDh[:,id2index[nn]])

                    prevNode = currNode
                    for nn in Gwud.neighbors( currNode ):
                        if densityField[nn] > densityField[currNode]:
                            currNode = nn

                    if currNode == prevNode:
                        break

                for node in allOnPath:
                    targLoc[node] = currNode

        uniqueTargs = set(targLoc[node] for node in synNodes)

        loc2group = {}

        synapseGroups[h] = {}
        for ind, val in enumerate(uniqueTargs):
            loc2group[val] = ind
            synapseGroups[h][ind] = SynapseGroup([], [], [], val)

        for ind, node in enumerate(synNodes):
            gi = loc2group[targLoc[node]]
            synapseGroups[h][ gi ].node_ids.append( node )
            synapseGroups[h][ gi ].connector_ids.append( connector_ids[ind] )
            synapseGroups[h][ gi ].relations.append( relations[ind] )

    return synapseGroups

def distanceMatrix(G, synNodes) -> Tuple[Any, Dict]:
    """ Given a nx graph, produce an all to all distance dict via scipy sparse matrix black magic.
     Also, you get in 'id2index' the the mapping from a node id to the index in matrix scaledDistance. """
    dmat = {} # type: Dict
    nodeList = tuple(G.nodes())
    synNodes = set(synNodes)
    synIndices = tuple(i for i,node in enumerate(nodeList) if node in synNodes)

    dmat = dijkstra(nx.to_scipy_sparse_matrix(G, nodeList),
            directed=False, indices=synIndices)

    return dmat, {node: i for i,node in enumerate(nodeList)}

def countTargets(skeleton_id, pid) -> Dict:
    nTargets = {}
    synNodes, connector_ids, relations = synapseNodesFromSkeletonID( skeleton_id )
    PRE = Relation.objects.get(project=pid, relation_name='presynaptic_to').value_list('id')[0]

    for i, cid in enumerate(connector_ids):
        if relations[i] == PRE:
            nTargets[cid] = TreenodeConnector.objects.filter(connector_id=cid,relation_id=PRE).count()
    return nTargets

def createSpatialGraphFromSkeletonID(sid) -> nx.Graph:
    # retrieve all nodes of the skeleton
    treenode_qs = Treenode.objects.filter(skeleton_id=sid).values_list(
        'id', 'parent_id', 'location_x', 'location_y', 'location_z')
    # build the networkx graph from it
    G = nx.Graph()
    locations = {}
    for tnid, parent_id, location_x, location_y, location_z in treenode_qs:
        if parent_id:
            G.add_edge(parent_id, tnid)
        locations[tnid] = array((location_x, location_y, location_z), dtype=float32)
    for iFrom, iTo in G.edges(data=False):
        G[iFrom][iTo]['weight'] = norm(locations[iFrom] - locations[iTo])
    return G

def synapseNodesFromSkeletonID(sid) -> Tuple[List, List, List]:
    sk = ClassInstance.objects.get(pk=sid)
    pid = sk.project_id
    relations = get_relation_to_id_map(pid, ('presynaptic_to', 'postsynaptic_to'))

    qs_tc = TreenodeConnector.objects.filter(
        project=pid,
        skeleton=sid,
        relation__in=(relations['presynaptic_to'], relations['postsynaptic_to'])
    ).select_related('connector')

    synapse_nodes = []
    connector_ids = []
    synapse_relations = []

    for tc in qs_tc:
        synapse_nodes.append(tc.treenode_id)
        connector_ids.append(tc.connector_id)
        synapse_relations.append(tc.relation_id)
    return synapse_nodes, connector_ids, synapse_relations

def segregationIndex(synapseGroups, skeleton_id, pid, weightOutputs:bool=True):
    # XXX Possibly unused
    nout = np.zeros(len(synapseGroups))
    ngrp = np.zeros(len(synapseGroups))

    PRE = Relation.objects.get(project=pid, relation_name='presynaptic_to').value_list('id')[0]

    if weightOutputs:
        nTargets = countTargets(skeleton_id, pid)
        for group in synapseGroups.values():
            for i, synDirection in enumerate(group.relations):
                if synDirection == PRE:
                    nout[group] += nTargets[ group.connector_ids[i] ]
                    ngrp[group] += nTargets[ group.connector_ids[i] ]
                else:
                    ngrp[group] +=1
    else:
        for group in synapseGroups.values():
            for synDirection in group.relations:
                if synDirection == PRE:
                    nout[group] += 1
            ngrp[group] = len(group.relations)

    frac = np.divide(nout,ngrp)

    np.seterr(all='ignore')
    h_partial = ngrp * (frac * np.log( frac ) + (1-frac) * np.log( 1 - frac ))
    h_partial[np.isnan(h_partial)] = 0
    frac_unseg = sum(nout)/sum(ngrp)
    h_unseg = sum( ngrp) * ( frac_unseg*np.log(frac_unseg) + (1-frac_unseg)*np.log(1-frac_unseg) )
    return 1 - sum(h_partial)/h_unseg


