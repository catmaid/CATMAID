# A 'tree' is a networkx.DiGraph with a single root node (a node without parents)

from operator import itemgetter
from networkx import Graph
from collections import defaultdict

def find_root(tree):
    """ Search and return the first node that has zero predecessors.
    Will be the root node in directed graphs.
    Avoids one database lookup. """
    for node in tree:
        if 0 == len(tree.predecessors(node)):
            return node

def edge_count_to_root(tree, root_node=None):
    """ Return a map of nodeID vs number of edges from the first node that lacks predecessors (aka the root). If root_id is None, it will be searched for."""
    distances = {}
    count = 1
    current_level = [root_node if root_node else find_root(tree)]
    next_level = []
    while current_level:
        # Consume all elements in current_level
        while current_level:
            node = current_level.pop()
            distances[node] = count
            next_level.extend(tree.successors(node)) # successors is the empty list when none
        # Rotate lists (current_level is now empty)
        current_level, next_level = next_level, current_level
        count += 1
    return distances

def find_common_ancestor(tree, nodes, ds=None):
    """ Return the node in tree that is the nearest common ancestor to all nodes.
    Assumes that nodes contains at least 1 node.
    Assumes that all nodes are present in tree.
    Returns a tuple with the ancestor node and its distance to root. """
    if 1 == len(nodes):
        return nodes[0], 0
    distances = ds if ds else edge_count_to_root(tree)
    # Pick the pair with the shortest edge count to root
    first, second = sorted({node: distances(node) for node in nodes}.iteritems(), key=itemgetter(1))[:2]
    # Start from the second, and bring it to an edge count equal to the first
    while second[1] < first[1]:
        second = (tree.predecessors(second[0])[0], second[1] - 1)
    # Walk parents up for both until finding the common ancestor
    first = first[0]
    second = second[0]
    while first != second:
        first = tree.predecessors(first)[0]
        second = tree.predecessors(second)[0]
    return first, distances[first]

def find_common_ancestors(tree, node_groups):
    distances = edge_count_to_root(tree)
    return [find_common_ancestor(tree, nodes, ds=distances) for nodes in node_groups]

def reroot(tree, new_root):
    """ Reverse in place the direction of the edges from the new_root to root. """
    parents = tree.predecessors(new_root)
    if not parents:
        # new_root is already the root
        return
    child = new_root
    edges = []
    while parents:
        parent = parents[0]
        tree.remove_edge(parent, child)
        edges.append((child, parent))
        parents = tree.predecessors(parent)
        child = parent
    for parent, child in edges:
        tree.add_edge(parent, child)

def simplify(tree, keepers):
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
    children = defaultdict(int)
    seen_branch_nodes = set(keepers) # a copy
    paths = []
    # For all keeper nodes except the root
    for node in keepers:
        path = [node]
        paths.append(path)
        parents = tree.predecessors(node)
        while parents:
            parent = parents[0]
            if parent in mini:
                # Reached one of the keeper nodes
                path.append(parent)
                break
            elif len(tree.successors(parent)) > 1:
                # Reached a branch node
                children[parent] += 1
                path.append(parent)
                if parent in seen_branch_nodes:
                    break
                seen_branch_nodes.add(parent)
            parents = tree.predecessors(parent)
    for path in paths:
        # A path starts and ends with desired nodes for the minified tree.
        # The nodes in the middle of the path are branch nodes
        # that must be added to mini only if they have been visited more than once.
        origin = path[0]
        for i in xrange(1, len(path) -1):
            if children[path[i]] > 1:
                mini.add_edge(origin, path[i])
                origin = path[i]
        mini.add_edge(origin, path[-1])

    return mini

def partition(tree):
    """ Partition the tree as a list of sequences of node IDs,
    with branch nodes repeated as ends of all sequences except the longest
    one that finishes at the root.
    Each sequence runs from an end node to either the root or a branch node. """
    distances = edge_count_to_root(tree, root_node=None) # distance in number of edges from root
    seen = set()
    sequences = []
    # Iterate end nodes sorted from highest to lowest distance to root
    endNodeIDs = (nID for nID in tree.nodes() if 0 == len(tree.successors(nID)))
    for nodeID in sorted(endNodeIDs, key=distances.get, reverse=True):
        sequence = [tree.node[nodeID]]
        parents = tree.predecessors(nodeID)
        while parents:
            parentID = parents[0]
            sequence.append(tree.node[parentID])
            if parentID in seen:
                break
            seen.add(parentID)
            parents = tree.predecessors(parentID)

        if len(sequence) > 1:
            sequences.append(sequence)
    return sequences

