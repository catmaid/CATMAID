# -*- coding: utf-8 -*-

# A 'tree' is a networkx.DiGraph with a single root node (a node without parents)

from collections import defaultdict
from itertools import islice
from math import sqrt
from networkx import Graph, DiGraph
from operator import itemgetter
from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple

from catmaid.models import Treenode


def find_root(tree):
    """ Search and return the first node that has zero predecessors.
    Will be the root node in directed graphs.
    Avoids one database lookup. """
    for node in tree:
        if not next(tree.predecessors_iter(node), None):
            return node

def edge_count_to_root(tree, root_node=None) -> Dict:
    """ Return a map of nodeID vs number of edges from the first node that lacks predecessors (aka the root). If root_id is None, it will be searched for."""
    distances = {}
    count = 1
    current_level = [root_node if root_node else find_root(tree)]
    next_level = [] # type: List
    while current_level:
        # Consume all elements in current_level
        while current_level:
            node = current_level.pop()
            distances[node] = count
            next_level.extend(tree.successors_iter(node))
        # Rotate lists (current_level is now empty)
        current_level, next_level = next_level, current_level
        count += 1
    return distances

def find_common_ancestor(tree, nodes, ds=None, root_node=None) -> Tuple[Any, Any]:
    """ Return the node in tree that is the nearest common ancestor to all nodes.
    Assumes that nodes contains at least 1 node.
    Assumes that all nodes are present in tree.
    Returns a tuple with the ancestor node and its distance to root. """
    if 1 == len(nodes):
        return nodes[0], 0
    distances = ds if ds else edge_count_to_root(tree, root_node=root_node)
    # Pick the pair with the shortest edge count to root
    first, second = sorted({node: distances(node) for node in nodes}.items(), key=itemgetter(1))[:2]
    # Start from the second, and bring it to an edge count equal to the first
    while second[1] < first[1]:
        second = (next(tree.predecessors_iter(second[0])), second[1] - 1)
    # Walk parents up for both until finding the common ancestor
    first = first[0]
    second = second[0]
    while first != second:
        first = next(tree.predecessors_iter(first))
        second = next(tree.predecessors_iter(second))
    return first, distances[first]

def find_common_ancestors(tree, node_groups):
    distances = edge_count_to_root(tree)
    return (find_common_ancestor(tree, nodes, ds=distances) for nodes in node_groups)

def reroot(tree, new_root):
    """ Reverse in place the direction of the edges from the new_root to root. """
    parent = next(tree.predecessors_iter(new_root), None)
    if not parent:
        # new_root is already the root
        return
    path = [new_root]
    while parent is not None:
        tree.remove_edge(parent, path[-1])
        path.append(parent)
        parent = next(tree.predecessors_iter(parent), None)
    tree.add_path(path)

def simplify(tree, keepers) -> Graph:
    """ Given a tree and a set of nodes to keep, create a new tree
    where only the nodes to keep and the branch points between them are preserved.
    WARNING: will reroot the tree at the first of the keepers.
    WARNING: keepers can't be empty. """
    # Ensure no repeats
    keepers = set(keepers)
    # Add all keeper nodes to the minified graph
    mini = Graph()
    for node in keepers:
        mini.add_node(node)
    # Pick the first to be the root node of the tree, removing it
    root = keepers.pop()
    reroot(tree, root)
    # For every keeper node, traverse towards the parent until
    # finding one that is in the minified graph, or is a branch node
    children = defaultdict(int) # type: DefaultDict[Any, int]
    seen_branch_nodes = set(keepers) # a copy
    paths = []
    # For all keeper nodes except the root
    for node in keepers:
        path = [node]
        paths.append(path)
        parent = next(tree.predecessors_iter(node), None)
        while parent is not None:
            if parent in mini:
                # Reached one of the keeper nodes
                path.append(parent)
                break
            elif len(tree.succ[parent]) > 1:
                # Reached a branch node
                children[parent] += 1
                path.append(parent)
                if parent in seen_branch_nodes:
                    break
                seen_branch_nodes.add(parent)
            parent = next(tree.predecessors_iter(parent), None)
    for path in paths:
        # A path starts and ends with desired nodes for the minified tree.
        # The nodes in the middle of the path are branch nodes
        # that must be added to mini only if they have been visited more than once.
        origin = path[0]
        for i in range(1, len(path) -1):
            if children[path[i]] > 1:
                mini.add_edge(origin, path[i])
                origin = path[i]
        mini.add_edge(origin, path[-1])

    return mini

def partition(tree, root_node=None):
    """ Partition the tree as a list of sequences of node IDs,
    with branch nodes repeated as ends of all sequences except the longest
    one that finishes at the root.
    Each sequence runs from an end node to either the root or a branch node. """
    distances = edge_count_to_root(tree, root_node=root_node) # distance in number of edges from root
    seen = set() # type: Set
    # Iterate end nodes sorted from highest to lowest distance to root
    endNodeIDs = (nID for nID in tree.nodes() if 0 == len(tree.successors(nID)))
    for nodeID in sorted(endNodeIDs, key=distances.get, reverse=True):
        sequence = [nodeID]
        parentID = next(tree.predecessors_iter(nodeID), None)
        while parentID is not None:
            sequence.append(parentID)
            if parentID in seen:
                break
            seen.add(parentID)
            parentID = next(tree.predecessors_iter(parentID), None)

        if len(sequence) > 1:
            yield sequence


def spanning_tree(tree, preserve) -> DiGraph:
    """ Return a new DiGraph with the spanning tree including the desired nodes.
    preserve: the set of nodes that delimit the spanning tree. """
    spanning = DiGraph()
    preserve = set(preserve) # duplicate, will be altered
    if 1 == len(preserve):
        spanning.add_node(next(iter(preserve)))
        return spanning

    if len(tree.successors(find_root(tree))) > 1:
        tree = tree.copy()
        # First end node found
        endNode = next(node for node in tree if not next(tree.successors_iter(node), None))
        reroot(tree, endNode)

    n_seen = 0

    # Start from shortest sequence
    for seq in sorted(partition(tree), key=len):
        path = []
        for node in seq:
            if node in preserve:
                path.append(node)
                if node not in spanning:
                    n_seen += 1
                if len(preserve) == n_seen:
                    break
            elif path:
                path.append(node)

        if path:
            spanning.add_path(path)
            if seq[-1] == path[-1]:
                preserve.add(path[-1])

        if len(preserve) == n_seen:
            break

    return spanning

def cable_length(tree, locations) -> float:
    """ locations: a dictionary of nodeID vs iterable of node position (1d, 2d, 3d, ...)
    Returns the total cable length. """
    return sum(sqrt(sum(pow(loc2 - loc1, 2) for loc1, loc2 in zip(locations[a], locations[b]))) for a,b in tree.edges_iter())


def lazy_load_trees(skeleton_ids, node_properties):
    """ Return a lazy collection of pairs of (long, DiGraph)
    representing (skeleton_id, tree).
    The node_properties is a list of strings, each being a name of a column
    in the django model of the Treenode table that is not the treenode id, parent_id
    or skeleton_id. """

    values_list = ('id', 'parent_id', 'skeleton_id') # type: Tuple[str, ...]
    props = tuple(set(node_properties) - set(values_list))
    values_list += props

    ts = Treenode.objects.filter(skeleton__in=skeleton_ids) \
            .order_by('skeleton') \
            .values_list(*values_list)
    skid = None
    tree = None # type: Optional[DiGraph]
    for t in ts:
        if t[2] != skid:
            if tree:
                yield (skid, tree)
            # Prepare for the next one
            skid = t[2]
            tree = DiGraph()

        fields = {k: v for k,v in zip(props, islice(t, 3, 3 + len(props)))}
        tree.add_node(t[0], fields) # type: ignore # mypy cannot prove tree will have a value by this point

        if t[1]:
            # From child to parent
            tree.add_edge(t[0], t[1]) # type: ignore # mypy cannot prove tree will have a value by this point

    if tree:
        yield (skid, tree)

