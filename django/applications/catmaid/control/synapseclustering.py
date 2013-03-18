import scipy as sp
from scipy import sparse
import numpy as np
from numpy import array
import networkx as nx
from sets import Set
from catmaid.objects import *
from collections import namedtuple, defaultdict

def synapse_clustering( skeleton_id, h_list ):

	Gwud = createSpatialGraphFromSkeletonID( skeleton_id )
	synNodes, connector_ids, relations = synapseNodesFromSkeletonID( skeleton_id )
	
	return tree_max_density(Gwud, synNodes, connector_ids, relations, h_list)


def tree_max_density(Gwud, synNodes, connector_ids, relations, h_list):
	""" Gwud: networkx graph were the edges are weighted by length, and undirected.
	    synNodes: list of node IDs where there is a synapse.
	    connector_ids: list of connector IDs.
	    relations: list of the type of synapse, 'presynaptic_to' or 'postsynaptic_to'.
	    The three lists are synchronized by index.
	"""

	distMat = distanceMatrix( Gwud, synNodes )
	
	SynapseGroup = namedtuple("SynapseGroup", ['node_ids', 'connector_ids', 'relations'])
	synapseGroups = {}

	for h in h_list:
		expDh = np.exp(-1 * np.multiply(distMat['D'],distMat['D']) / (h * h) )
	
		targLoc = dict()			# targLocs hosts the final destination nodes of the hill climbing
		densityField = dict()			# densityField stores the height of the hill to be climbed
		for startNode in synNodes:
			if startNode not in targLoc:	
				currNode = startNode
				allOnPath = list()
				
				if startNode not in densityField:
					densityField[startNode] = 0
					densityField[startNode] = np.sum(expDh[:,distMat['id2index'][startNode]] )
	
				while True:
					allOnPath.append(currNode)
	
					#Make sure I have densityField of all neighbors for comparison
					if currNode in targLoc:
						currNode = targLoc[ currNode ] # Jump right to the end already.
						break
					
					for nn in Gwud.neighbors( currNode ): 
						if nn not in densityField:
							densityField[nn] = 0
							densityField[nn] = np.sum(expDh[:,distMat['id2index'][nn]])
					
					prevNode = currNode
					for nn in Gwud.neighbors( currNode ):
						if densityField[nn] > densityField[currNode]:
							currNode = nn
													
					if currNode == prevNode:
						break
							
				for node in allOnPath:
					targLoc[node] = currNode
						
		uniqueTargs = set([targLoc[node] for node in synNodes])
		
		loc2group = {}
		
		synapseGroups[h] = {}
		for ind, val in enumerate(uniqueTargs):
			loc2group[val] = ind
			synapseGroups[h][ind] = SynapseGroup([], [], [])
		
		for ind, node in enumerate(synNodes):
			gi = loc2group[targLoc[node]]
			synapseGroups[h][ gi ].node_ids.append( node )
			synapseGroups[h][ gi ].connector_ids.append( connector_ids[ind] )
			synapseGroups[h][ gi ].relations.append( relations[ind] )

	return synapseGroups

def distanceMatrix( G, synNodes ):
# Given a nx graph, produce an all to all distance dict via scipy sparse matrix black magic.
# Also, you get in 'id2index' the the mapping from a node id to the index in matrix scaledDistance.
	# 
 	dmat = {}
 	nodeList = tuple(G.nodes())
	synIndices = []
 	for i, node in enumerate(nodeList):
 		if node in synNodes:
 			synIndices.append( i )

 	dmat = sp.sparse.csgraph.dijkstra( nx.to_scipy_sparse_matrix( G, nodeList),
 							directed=False, indices=synIndices)
	
			
	return {'D': dmat,
	        'id2index': {node: i for i,node in enumerate(nodeList)}}

def countTargets( skeleton_id ):
	nTargets = {}
	synNodes, connector_ids, relations = synapseNodesFromSkeletonID( skeleton_id )

	for i, cid in enumerate(connector_ids):
		if relations[i] == 'presynaptic_to':
			outputs = TreenodeConnector.objects.filter(connector_id=cid,relation__relation_name="postsynaptic_to")
			nTargets[cid] = len( outputs )
	return nTargets
	
def createSpatialGraphFromSkeletonID(sid):
	# retrieve all nodes of the skeleton
	treenode_qs = Treenode.objects.filter(skeleton_id=sid).values_list('id', 'location')
	# build the networkx graph from it
	G = nx.Graph()
	for e in treenode_qs:
		G.add_node( e.id )
		# TODO: add attributes
		G.node[e.id] = {
			'location': np.array([e.location.x, e.location.y, e.location.z], dtype=np.float32),
		}
		if e.parent_id:
			G.add_edge( e.parent_id, e.id )
	for iFrom, iTo in G.edges(data=False):
		G[iFrom][iTo]['weight'] = np.linalg.norm(G.node[iFrom]['location']-G.node[iTo]['location'])
	return G

def synapseNodesFromSkeletonID(sid):
	sk = ClassInstance.objects.get(pk=sid)
	pid = sk.project_id
	
	qs_tc = TreenodeConnector.objects.filter(
		project=pid,
		skeleton=sid
	).select_related('connector')

	relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=pid))
	synapse_nodes = []
	connector_ids = []
	synapse_relations = []
	
	for tc in qs_tc:
		synapse_nodes.append(tc.treenode_id)
		connector_ids.append(tc.connector_id)
		if tc.relation_id == relations['presynaptic_to']:
			synapse_relations.append('presynaptic_to')
		elif tc.relation_id == relations['postsynaptic_to']:
			synapse_relations.append('postsynaptic_to')		
	return synapse_nodes, connector_ids, synapse_relations

def segregationIndex( synapseGroups, skeleton_id, weightOutputs=True ):
	nout = np.zeros(len(synapseGroups))
	ngrp = np.zeros(len(synapseGroups))
	
	if weightOutputs:
		nTargets = countTargets( skeleton_id )
		for group in synapseGroups:
			for ind, synDirection in enumerate(synapseGroups[group].relations):
				if synDirection == 'presynaptic_to':
					nout[group] += nTargets[ synapseGroups[group].connector_ids[ind] ]
					ngrp[group] += nTargets[ synapseGroups[group].connector_ids[ind] ]
				else:
					ngrp[group] +=1
	else:
		for group in synapseGroups:
			for synDirection in synapseGroups[group].relations:
				if synDirection == 'presynaptic_to':
					nout[group] += 1
			ngrp[group] = len(synapseGroups[group].relation)
	frac = np.divide(nout,ngrp)
	
	np.seterr(all='ignore')
	h_partial = ngrp * (frac * np.log( frac ) + (1-frac) * np.log( 1 - frac ))
	h_partial[np.isnan(h_partial)] = 0
	frac_unseg = sum(nout)/sum(ngrp)
	h_unseg = sum( ngrp) * ( frac_unseg*np.log(frac_unseg) + (1-frac_unseg)*np.log(1-frac_unseg) )
	return 1 - sum(h_partial)/h_unseg
	

