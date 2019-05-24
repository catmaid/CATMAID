# -*- coding: utf-8 -*-

import json
import networkx as nx

from networkx.algorithms import weakly_connected_component_subgraphs
from collections import defaultdict
from itertools import count
from functools import partial
from numpy import subtract
from numpy.linalg import norm
from typing import Any, DefaultDict, Dict, List, Optional, Tuple, Union

from django.db import connection
from django.http import JsonResponse

from rest_framework.decorators import api_view

from catmaid.models import UserRole
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import (get_relation_to_id_map, get_request_bool,
        get_request_list)
from catmaid.control.link import KNOWN_LINK_PAIRS
from catmaid.control.tree_util import simplify
from catmaid.control.synapseclustering import tree_max_density


def make_new_synapse_count_array() -> List[int]:
    return [0, 0, 0, 0, 0]

def basic_graph(project_id, skeleton_ids, relations=None,
        source_link:str="presynaptic_to", target_link:str="postsynaptic_to") -> Dict[str, Tuple]:

    if not skeleton_ids:
        raise ValueError("No skeleton IDs provided")

    cursor = connection.cursor()

    if not relations:
        relations = get_relation_to_id_map(project_id, (source_link, target_link), cursor)
    source_rel_id, target_rel_id = relations[source_link], relations[target_link]

    cursor.execute('''
    SELECT t1.skeleton_id, t2.skeleton_id, LEAST(t1.confidence, t2.confidence)
    FROM treenode_connector t1,
         treenode_connector t2
    WHERE t1.skeleton_id IN (%(skids)s)
      AND t1.relation_id = %(source_rel)s
      AND t1.connector_id = t2.connector_id
      AND t2.skeleton_id IN (%(skids)s)
      AND t2.relation_id = %(target_rel)s
      AND t1.id <> t2.id
    ''' % {'skids': ','.join(map(str, skeleton_ids)),
           'source_rel': source_rel_id,
           'target_rel': target_rel_id})

    edges = defaultdict(partial(defaultdict, make_new_synapse_count_array)) # type: DefaultDict
    for row in cursor.fetchall():
        edges[row[0]][row[1]][row[2] - 1] += 1

    return {
        'edges': tuple((s, t, count)
                for s, edge in edges.items()
                for t, count in edge.items())
    }

    '''
    return {'edges': [{'source': pre,
                       'target': post,
                       'weight': count} for pre, edge in edges.items() for post, count in edge.items()]}
    '''

    """ Can't get the variable to be set with all the skeleton IDs
    cursor.execute('''
    WITH skeletons as (VALUES (%s) UNION ALL)
    SELECT tc1.skeleton_id, tc2.skeleton_id, count(*)
    FROM treenode_connector tc1,
         treenode_connector tc2
    WHERE tc1.project_id = %s
      AND tc1.project_id = tc2.project_id
      AND tc1.connector_id = tc2.connector_id
      AND tc1.relation_id = %s
      AND tc2.relation_id = %s
      AND tc1.skeleton_id IN skeletons
      AND tc2.skeleton_id IN skeletons
      AND tc1.id <> tc2.id
    ''' % (",".join(str(int(skid)) for skid in skeleton_ids), int(project_id), preID, postID))
    """


def confidence_split_graph(project_id, skeleton_ids, confidence_threshold,
        relations=None, source_rel:str="presynaptic_to", target_rel:str="postsynaptic_to") -> Dict[str, Any]:
    """ Assumes 0 < confidence_threshold <= 5. """
    if not skeleton_ids:
        raise ValueError("No skeleton IDs provided")

    cursor = connection.cursor()
    skids = ",".join(str(int(skid)) for skid in skeleton_ids)

    if not relations:
        relations = get_relation_to_id_map(project_id, (source_rel, target_rel), cursor)
    source_rel_id, target_rel_id = relations[source_rel], relations[target_rel]

    # Fetch synapses of all skeletons
    cursor.execute('''
    SELECT skeleton_id, treenode_id, connector_id, relation_id, confidence
    FROM treenode_connector
    WHERE project_id = %s
      AND skeleton_id IN (%s)
      AND (relation_id = %s OR relation_id = %s)
    ''' % (int(project_id), skids, source_rel_id, target_rel_id))

    stc = defaultdict(list) # type: DefaultDict[Any, List]
    for row in cursor.fetchall():
        stc[row[0]].append(row[1:]) # skeleton_id vs (treenode_id, connector_id, relation_id, confidence)

    # Fetch all treenodes of all skeletons
    cursor.execute('''
    SELECT skeleton_id, id, parent_id, confidence
    FROM treenode
    WHERE project_id = %s
      AND skeleton_id IN (%s)
    ORDER BY skeleton_id
    ''' % (project_id, skids))

    # Dictionary of connector_id vs relation_id vs list of sub-skeleton ID
    connectors = defaultdict(partial(defaultdict, list)) # type: DefaultDict

    # All nodes of the graph
    nodeIDs = [] # type: List

    # Read out into memory only one skeleton at a time
    current_skid = None
    tree = None # type: Optional[nx.DiGraph]
    for row in cursor.fetchall():
        if row[0] == current_skid:
            # Build the tree, breaking it at the low-confidence edges
            if row[2] and row[3] >= confidence_threshold:
                    tree.add_edge(row[2], row[1]) # type: ignore
                                                  # mypy cannot prove this will be a DiGraph by here
            continue

        if tree:
            nodeIDs.extend(split_by_confidence(current_skid, tree, stc[current_skid], connectors))

        # Start the next tree
        current_skid = row[0]
        tree = nx.DiGraph()
        if row[2] and row[3] > confidence_threshold:
            tree.add_edge(row[2], row[1])

    if tree:
        nodeIDs.extend(split_by_confidence(current_skid, tree, stc[current_skid], connectors))

    # Create the edges of the graph from the connectors, which was populated as a side effect of 'split_by_confidence'
    edges = defaultdict(partial(defaultdict, make_new_synapse_count_array)) # type: DefaultDict
                                                                            # pre vs post vs count
    for c in connectors.values():
        for pre in c[source_rel_id]:
            for post in c[target_rel_id]:
                edges[pre[0]][post[0]][min(pre[1], post[1]) - 1] += 1

    return {
        'nodes': nodeIDs,
        'edges': [(s, t, count)
                for s, edge in edges.items()
                for t, count in edge.items()]
    }


def dual_split_graph(project_id, skeleton_ids, confidence_threshold, bandwidth,
        expand, relations=None, source_link="presynaptic_to",
        target_link="postsynaptic_to") -> Dict[str, Any]:
    """ Assumes bandwidth > 0 and some skeleton_id in expand. """
    cursor = connection.cursor()
    skeleton_ids = set(skeleton_ids)
    expand = set(expand)

    if not skeleton_ids:
        raise ValueError("No skeleton IDs provided")

    # assumes all skeleton_id in expand are also present in skeleton_ids

    skids = ",".join(str(int(skid)) for skid in skeleton_ids)

    if not relations:
        relations = get_relation_to_id_map(project_id, (source_link, target_link), cursor)
    source_rel_id, target_rel_id = relations[source_link], relations[target_link]

    # Fetch synapses of all skeletons
    cursor.execute('''
    SELECT skeleton_id, treenode_id, connector_id, relation_id, confidence
    FROM treenode_connector
    WHERE project_id = %s
      AND skeleton_id IN (%s)
      AND relation_id IN (%s,%s)
    ''' % (int(project_id), ",".join(str(int(skid)) for skid in skeleton_ids),
           source_rel_id, target_rel_id))

    stc = defaultdict(list) # type: DefaultDict[Any, List]
    for row in cursor.fetchall():
        stc[row[0]].append(row[1:]) # skeleton_id vs (treenode_id, connector_id, relation_id)

    # Dictionary of connector_id vs relation_id vs list of sub-skeleton ID
    connectors = defaultdict(partial(defaultdict, list)) # type: DefaultDict

    # All nodes of the graph (with or without edges. Includes those representing synapse domains)
    nodeIDs = [] # type: List

    not_to_expand = skeleton_ids - expand

    if confidence_threshold > 0 and not_to_expand:
        # Now fetch all treenodes of only skeletons in skeleton_ids (the ones not to expand)
        cursor.execute('''
        SELECT skeleton_id, id, parent_id, confidence
        FROM treenode
        WHERE project_id = %s
          AND skeleton_id IN (%s)
        ORDER BY skeleton_id
        ''' % (project_id, ",".join(str(int(skid)) for skid in not_to_expand)))

        # Read out into memory only one skeleton at a time
        current_skid = None
        tree = None # type: Optional[nx.DiGraph]
        for row in cursor.fetchall():
            if row[0] == current_skid:
                # Build the tree, breaking it at the low-confidence edges
                if row[2] and row[3] >= confidence_threshold:
                        tree.add_edge(row[2], row[1]) # type: ignore
                                                      # mypy cannot prove this will be a nx.DiGraph by here
                continue

            if tree:
                nodeIDs.extend(split_by_confidence(current_skid, tree, stc[current_skid], connectors))

            # Start the next tree
            current_skid = row[0]
            tree = nx.DiGraph()
            if row[2] and row[3] > confidence_threshold:
                tree.add_edge(row[2], row[1])

        if tree:
            nodeIDs.extend(split_by_confidence(current_skid, tree, stc[current_skid], connectors))
    else:
        # No need to split.
        # Populate connectors from the connections among them
        for skid in not_to_expand:
            nodeIDs.append(skid)
            for c in stc[skid]:
                connectors[c[1]][c[2]].append((skid, c[3]))


    # Now fetch all treenodes of all skeletons to expand
    cursor.execute('''
    SELECT skeleton_id, id, parent_id, confidence, location_x, location_y, location_z
    FROM treenode
    WHERE project_id = %s
      AND skeleton_id IN (%s)
    ORDER BY skeleton_id
    ''' % (project_id, ",".join(str(int(skid)) for skid in expand)))

    # list of edges among synapse domains
    intraedges = [] # type: List

    # list of branch nodes, merely structural
    branch_nodeIDs = [] # type: List

    # reset
    current_skid = None
    tree = None
    locations = None # type: Optional[Dict]
    for row in cursor.fetchall():
        if row[0] == current_skid:
            # Build the tree, breaking it at the low-confidence edges
            locations[row[1]] = row[4:] # type: ignore
                                        # mypy cannot prove this will have a value by here
            if row[2] and row[3] >= confidence_threshold:
                    tree.add_edge(row[2], row[1]) # type: ignore
                                                  # mypy cannot prove this will have a value by here
            continue

        if tree:
            ns, bs = split_by_both(current_skid, tree, locations, bandwidth, stc[current_skid], connectors, intraedges)
            nodeIDs.extend(ns)
            branch_nodeIDs.extend(bs)

        # Start the next tree
        current_skid = row[0]
        tree = nx.DiGraph()
        locations = {}
        locations[row[1]] = row[4:]
        if row[2] and row[3] > confidence_threshold:
            tree.add_edge(row[2], row[1])

    if tree:
        ns, bs = split_by_both(current_skid, tree, locations, bandwidth, stc[current_skid], connectors, intraedges)
        nodeIDs.extend(ns)
        branch_nodeIDs.extend(bs)


    # Create the edges of the graph
    edges = defaultdict(partial(defaultdict, make_new_synapse_count_array)) # type: DefaultDict
                                                                            # pre vs post vs count
    for c in connectors.values():
        for pre in c[source_rel_id]:
            for post in c[target_rel_id]:
                edges[pre[0]][post[0]][min(pre[1], post[1]) - 1] += 1

    return {
        'nodes': nodeIDs,
        'edges': [(s, t, count)
                for s, edge in edges.items()
                for t, count in edge.items()],
        'branch_nodes': branch_nodeIDs,
        'intraedges': intraedges
    }


def populate_connectors(chunkIDs, chunks, cs, connectors) -> None:
    # Build up edges via the connectors
    for c in cs:
        # c is (treenode_id, connector_id, relation_id, confidence)
        for chunkID, chunk in zip(chunkIDs, chunks):
            if c[0] in chunk:
                connectors[c[1]][c[2]].append((chunkID, c[3]))
                break


def subgraphs(digraph, skeleton_id) -> Tuple[List, Tuple]:
    chunks = list(weakly_connected_component_subgraphs(digraph))
    if 1 == len(chunks):
        chunkIDs = (str(skeleton_id),) # type: Tuple
                                       # Note: Here we're loosening the implicit type
    else:
        chunkIDs = tuple('%s_%s' % (skeleton_id, (i+1)) for i in range(len(chunks)))
    return chunks, chunkIDs


def split_by_confidence(skeleton_id, digraph, cs, connectors) -> Tuple:
    """ Split by confidence threshold. Populates connectors (side effect). """
    chunks, chunkIDs = subgraphs(digraph, skeleton_id)
    populate_connectors(chunkIDs, chunks, cs, connectors)
    return chunkIDs


def split_by_both(skeleton_id, digraph, locations, bandwidth, cs, connectors, intraedges) -> Tuple[List, List]:
    """ Split by confidence and synapse domain. Populates connectors and intraedges (side effects). """
    nodes = []
    branch_nodes = []

    chunks, chunkIDs = subgraphs(digraph, skeleton_id)

    for i, chunkID, chunk in zip(count(start=1), chunkIDs, chunks):
        # Populate edge properties with the weight
        for parent, child in chunk.edges_iter():
            chunk[parent][child]['weight'] = norm(subtract(locations[child], locations[parent]))

        # Check if need to expand at all
        blob = tuple(c for c in cs if c[0] in chunk) # type: Optional[Tuple]
                                                     # the two different uses of blob in this context
                                                     # (other being in for node in mini.nodes_iter() below )
                                                     # makes typing difficult and may be a maintenance concern
        if 0 == len(blob): # type: ignore
            nodes.append(chunkID)
            continue

        treenode_ids, connector_ids, relation_ids, confidences = list(zip(*blob)) # type: ignore

        if 0 == len(connector_ids):
            nodes.append(chunkID)
            continue

        # Invoke Casey's magic: split by synapse domain
        max_density = tree_max_density(chunk.to_undirected(), treenode_ids,
                connector_ids, relation_ids, [bandwidth])
        # Get first element of max_density
        domains = next(iter(max_density.values()))

        # domains is a dictionary of index vs SynapseGroup instance

        if 1 == len(domains):
            for connector_id, relation_id, confidence in zip(connector_ids, relation_ids, confidences):
                connectors[connector_id][relation_id].append((chunkID, confidence))
            nodes.append(chunkID)
            continue

        # Create edges between domains
        # Pick one treenode from each domain to act as anchor
        anchors = {d.node_ids[0]: (i+k, d) for k, d in domains.items()}

        # Create new Graph where the edges are the edges among synapse domains
        mini = simplify(chunk, anchors.keys())

        # Many side effects:
        # * add internal edges to intraedges
        # * add each domain to nodes
        # * custom-apply populate_connectors with the known synapses of each domain
        #   (rather than having to sift through all in cs)
        mini_nodes = {}
        for node in mini.nodes_iter():
            blob = anchors.get(node)
            if blob:
                index, domain = blob
                domainID = '%s_%s' % (chunkID, index)
                nodes.append(domainID)
                for connector_id, relation_id in zip(domain.connector_ids, domain.relations):
                    confidence = confidences[connector_ids.index(connector_id)]
                    connectors[connector_id][relation_id].append((domainID, confidence))
            else:
                domainID = '%s_%s' % (chunkID, node)
                branch_nodes.append(domainID)
            mini_nodes[node] = domainID

        for a1, a2 in mini.edges_iter():
            intraedges.append((mini_nodes[a1], mini_nodes[a2]))

    return nodes, branch_nodes


def _skeleton_graph(project_id, skeleton_ids, confidence_threshold, bandwidth,
        expand, compute_risk, cable_spread, path_confluence,
        with_overall_counts=False, relation_map=None, link_types=None) -> Optional[Dict]:

    by_link_type = bool(link_types)
    if not by_link_type:
        link_types = ['synaptic-connector']

    if not expand:
        # Prevent expensive operations that will do nothing
        bandwidth = 0

    cursor = connection.cursor()
    relation_map = get_relation_to_id_map(project_id, cursor=cursor)

    result = None # type: Optional[Dict]
    for link_type in link_types:
        pair = KNOWN_LINK_PAIRS.get(link_type)
        if not pair:
            raise ValueError("Unknown link type: " + link_type)

        source_rel = pair['source']
        target_rel = pair['target']

        if 0 == bandwidth:
            if 0 == confidence_threshold:
                graph = basic_graph(project_id, skeleton_ids, relation_map,
                        source_rel, target_rel) # type: Dict[str, Any]
            else:
                graph = confidence_split_graph(project_id, skeleton_ids,
                        confidence_threshold, relation_map, source_rel, target_rel)
        else:
            graph = dual_split_graph(project_id, skeleton_ids, confidence_threshold,
                    bandwidth, expand, relation_map)

        if with_overall_counts:
            preId = relation_map[source_rel]
            postId = relation_map[target_rel]
            query_params = list(skeleton_ids) + [preId, postId, preId, postId]

            skeleton_id_template = ','.join('(%s)' for _ in skeleton_ids)
            cursor.execute('''
            SELECT tc1.skeleton_id, tc2.skeleton_id,
                tc1.relation_id, tc2.relation_id,
                LEAST(tc1.confidence, tc2.confidence)
            FROM treenode_connector tc1
            JOIN (VALUES {}) skeleton(id)
                ON tc1.skeleton_id = skeleton.id
            JOIN treenode_connector tc2
                ON tc1.connector_id = tc2.connector_id
            WHERE tc1.id != tc2.id
                AND tc1.relation_id IN (%s, %s)
                AND tc2.relation_id IN (%s, %s)
            '''.format(skeleton_id_template), query_params)

            query_skeleton_ids = set(skeleton_ids)
            overall_counts = defaultdict(partial(defaultdict, make_new_synapse_count_array)) # type: DefaultDict
            # Iterate through each pre/post connection
            for skid1, skid2, rel1, rel2, conf in cursor.fetchall():
                # Increment number of links to/from skid1 with relation rel1.
                overall_counts[skid1][rel1][conf - 1] += 1

            # Attach counts and a map of relation names to their IDs.
            graph['overall_counts'] = overall_counts
            graph['relation_map'] = {
                source_rel: preId,
                target_rel: postId
            }

        if by_link_type:
            if not result:
                result = {}
            result[link_type] = graph
        else:
            result = graph

    return result


@api_view(['POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_graph(request, project_id=None):
    """Get a synaptic graph between skeletons compartmentalized by confidence.

    Given a set of skeletons, retrieve presynaptic-to-postsynaptic edges
    between them, annotated with count. If a confidence threshold is
    supplied, compartmentalize the skeletons at edges in the arbor
    below that threshold and report connectivity based on these
    compartments.

    When skeletons are split into compartments, nodes in the graph take an
    string ID like ``{skeleton_id}_{compartment #}``.
    ---
    parameters:
        - name: skeleton_ids[]
          description: IDs of the skeletons to graph
          required: true
          type: array
          items:
            type: integer
          paramType: form
        - name: confidence_threshold
          description: Confidence value below which to segregate compartments
          type: integer
          paramType: form
        - name: bandwidth
          description: Bandwidth in nanometers
          type: number
        - name: cable_spread
          description: Cable spread in nanometers
          type: number
        - name: expand[]
          description: IDs of the skeletons to expand
          type: array
          items:
            type: integer
        - name: link_types[]
          description: IDs of link types to respect
          type: array
          items:
            type: string
    models:
      skeleton_graph_edge:
        id: skeleton_graph_edge
        properties:
        - description: ID of the presynaptic skeleton or compartment
          type: integer|string
          required: true
        - description: ID of the postsynaptic skeleton or compartment
          type: integer|string
          required: true
        - description: number of synapses constituting this edge
          $ref: skeleton_graph_edge_count
          required: true
      skeleton_graph_edge_count:
        id: skeleton_graph_edge_count
        properties:
        - description: Number of synapses with confidence 1
          type: integer
          required: true
        - description: Number of synapses with confidence 2
          type: integer
          required: true
        - description: Number of synapses with confidence 3
          type: integer
          required: true
        - description: Number of synapses with confidence 4
          type: integer
          required: true
        - description: Number of synapses with confidence 5
          type: integer
          required: true
      skeleton_graph_intraedge:
        id: skeleton_graph_intraedge
        properties:
        - description: ID of the presynaptic skeleton or compartment
          type: integer|string
          required: true
        - description: ID of the postsynaptic skeleton or compartment
          type: integer|string
          required: true
    type:
      edges:
        type: array
        items:
          $ref: skeleton_graph_edge
        required: true
      nodes:
        type: array
        items:
          type: integer|string
        required: false
      intraedges:
        type: array
        items:
          $ref: skeleton_graph_intraedge
        required: false
      branch_nodes:
        type: array
        items:
          type: integer|string
        required: false
    """
    compute_risk = 1 == int(request.POST.get('risk', 0))
    if compute_risk:
        # TODO port the last bit: computing the synapse risk
        from graph import skeleton_graph as slow_graph
        return slow_graph(request, project_id)

    project_id = int(project_id)
    skeleton_ids = set(int(v) for k,v in request.POST.items() if k.startswith('skeleton_ids['))
    confidence_threshold = min(int(request.POST.get('confidence_threshold', 0)), 5)
    bandwidth = float(request.POST.get('bandwidth', 0)) # in nanometers
    cable_spread = float(request.POST.get('cable_spread', 2500)) # in nanometers
    path_confluence = int(request.POST.get('path_confluence', 10)) # a count
    expand = set(int(v) for k,v in request.POST.items() if k.startswith('expand['))
    with_overall_counts = get_request_bool(request.POST, 'with_overall_counts', False)
    expand = set(int(v) for k,v in request.POST.items() if k.startswith('expand['))
    link_types = get_request_list(request.POST, 'link_types', None)

    graph = _skeleton_graph(project_id, skeleton_ids,
        confidence_threshold, bandwidth, expand, compute_risk, cable_spread,
        path_confluence, with_overall_counts, link_types=link_types)

    if not graph:
        raise ValueError("Could not compute graph")

    return JsonResponse(graph)

