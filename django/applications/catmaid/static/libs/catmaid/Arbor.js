/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/** Albert Cardona 2013-10-28
 *
 * Functions for creating, iterating and inspecting trees as represented by CATMAID,
 * which are graphs with directed edges and no loops; properties that afford a
 * number of shortcuts in otherwise performance-expensive algorithms
 * like e.g. betweenness centrality.
 *
 * Each node can only have one edge: to its parent.
 * A node without a parent is the root node, and it is assumed that there is only one.
 */

"use strict";

var Arbor = function() {
	/** The root node, by definition without a parent and not present in this.edges. */
	this.root = null;
	/** Edges from child to parent. */
	this.edges = {};
};

Arbor.prototype = {};

/** Returns a shallow copy of this Arbor. */
Arbor.prototype.clone = function() {
	var arbor = new Arbor();
	arbor.root = this.root;
  var children = this.childrenArray();
  for (var i=0; i<children.length; ++i) {
    var node = children[i];
    arbor.edges[node] = this.edges[node];
  }
	return arbor;
};

/**
 * Assumes that the newly created edges will somewhere intersect with the existing
 * ones, if any. Otherwise the tree will have multiple disconnected subtrees and
 * not operate according to expectations.
 *
 * @param {Number[]]} edges An array where every consecutive pair of nodes
 *                          defines an edge from parent to child. Every edge
 *                          implictly adds its nodes.
 * Returns this.
 */
Arbor.prototype.addEdges = function(edges, accessor) {
	var length = edges.length;
	if (accessor) {
		for (var i=0; i<length; i+=2) {
			// Add edge from child to parent
			this.edges[accessor(edges[i], i)] = accessor(edges[i+1], i+1);
		}
	} else {
		for (var i=0; i<length; i+=2) {
			// Add edge from child to parent
			this.edges[edges[i]] = edges[i+1];
		}
	}

	this.root = this.findRoot();

	return this;
};

/**
 * Sets the root node to path[0] if the latter doesn't exist in this.edges (i.e.
 * if it does not have a parent node).  Assumes that the newly created edges
 * will somewhere intersect with the existing ones, if any. Otherwise the tree
 * will have multiple disconnected subtrees and not operate according to
 * expectations.
 *
 * @param {Number[]} path An array of nodes where every node is the child of its
 * predecessor node.
 *
 * @returns this
 */
Arbor.prototype.addPath = function(path) {
	for (var i=path.length -2; i>-1; --i) {
		this.edges[path[i+1]] = path[i];
	}

	if (!this.edges.hasOwnProperty(path[0])) this.root = path[0];

	return this;
};

Arbor.prototype.addPathReversed = function(path) {
	for (var i=path.length -2; i>-1; --i) {
		this.edges[path[i]] = path[i+1];
	}

	if (!this.edges.hasOwnProperty(path[path.length -1])) this.root = path[path.length -1];

	return this;
};

/**
 * Compare node using == and not ===, allowing for numbers to be nodes.
 */
Arbor.prototype.contains = function(node) {
	return node == this.root || this.edges.hasOwnProperty(node);
};

/**
 * Assumes there is only one root: one single node without a parent.  Returns
 * the root node, or nothing if the tree has a structural error (like a loop)
 * and no root node could be found.
 */
Arbor.prototype.findRoot = function() {
	for (var child in this.edges) {
		if (this.edges.hasOwnProperty(child)) {
			var paren = this.edges[child];
			if (!(paren in this.edges)) {
				return paren;
			}
		}
	}
	// Handle corner case: no edges
	return this.root;
};

/**
 * Assumes new_root belongs to this Arbor. Returns this.
 */
Arbor.prototype.reroot = function(new_root) {
	if (new_root == this.root) return this; // == and not === in case nodes are numbers, which get fooled into strings when they are used as keys in a javascript Object

	var path = [new_root],
			paren = this.edges[new_root];

	while (paren) {
		delete this.edges[path[path.length -1]];
		path.push(paren);
		paren = this.edges[paren];
	}

	return this.addPath(path);
};

/**
 * Returns an array with all end nodes, in O(3*n) time.  Does not include the
 * root node.
 */
Arbor.prototype.findEndNodes = function() {
  var edges = this.edges,
      children = this.childrenArray(),
      parents = {};

  for (var k=0, l=children.length; k<l; ++k) {
    parents[edges[children[k]]] = true;
  }

  var ends = [];
  for (var j=0, l=children.length; j<l; ++j) {
    var child = children[j];
    if (undefined === parents[child]) ends.push(child);
  }
  return ends;
};

/**
 * Return an object with parent node as keys and arrays of children as values.
 * End nodes have empty arrays.
 */
Arbor.prototype.allSuccessors = function() {
  var edges = this.edges,
      children = this.childrenArray();
  // Handle corner cases
  if (0 === children.length) {
    if (this.root) {
      var a = {};
      a[this.root] = [];
      return a;
    }
    return {};
  }
  var successors = {};
  for (var k=0, l=children.length; k<l; ++k) {
    var child = children[k],
        paren = edges[child],
        succ = successors[paren];
    if (succ) succ.push(child);
    else successors[paren] = [child];
    if (undefined === successors[child]) successors[child] = [];
  }
  return successors;
};

/**
 * Return a map of node ID vs number of children.
 */
Arbor.prototype.allSuccessorsCount = function() {
  var edges = this.edges,
      children = this.childrenArray();
  // Handle corner cases
  if (0 === children.length) {
    if (this.root) {
      var a = {};
      a[this.root] = [];
      return a;
    }
    return {};
  }
  var successors = {};
  for (var k=0, l=children.length; k<l; ++k) {
    var child = children[k],
        paren = edges[child],
        succ = successors[paren];
    if (succ) successors[paren] = succ + 1;
    else successors[paren] = 1;
    if (undefined === successors[child]) successors[child] = 0;
  }
  return successors;
};

/**
 * Finds the next branch node, starting at node (inclusive).  Assumes the node
 * belongs to the arbor.  Returns null when no branches are found.
 */
Arbor.prototype.nextBranchNode = function(node) {
  var all_succ = this.allSuccessors(),
      succ  = all_succ[node];
  while (1 === succ.length) {
    node = succ[0];
    succ = all_succ[node];
  }
  if (succ.length > 1) return node;
  return null;
};

/**
 * Return an object with each nodes as keys and arrays of children plus the
 * parent as values, or an empty array for an isolated root node. Runs in O(2n)
 * time.
 */
Arbor.prototype.allNeighbors = function() {
  var edges = this.edges,
      nodes = this.childrenArray();
  // Handle corner cases
  if (0 === nodes.length) {
    if (this.root) {
      var a = {};
      a[this.root] = [];
      return a;
    }
    return {};
  }
  var o = {};
  for (var i=0; i<nodes.length; ++i) {
    var node = nodes[i],
        paren = edges[node], // always exists in well-formed arbors; root node not included in nodes
        neighbors = o[node],
        paren_neighbors = o[paren];
    // Add paren as neighbor of node
    if (neighbors) neighbors.push(paren);
    else o[node] = [paren];
    // Add node as neighbor of parent
    if (paren_neighbors) paren_neighbors.push(node);
    else o[paren] = [node];
  }
  return o;
};

/**
 * Find branch and end nodes in O(3n) time.
 *
 * @returns {ends: array of end nodes,
 *          branches: map of branch node vs count of branches,
 *          n_branches: number of branch nodes}
 */
Arbor.prototype.findBranchAndEndNodes = function() {
  var edges = this.edges,
      children = this.childrenArray(),
      parents = {},
      branches = {},
      n_branches = 0,
      ends = [];

  for (var i=0, l=children.length; i<l; ++i) {
    var paren = edges[children[i]];
    if (parents[paren]) {
      var count = branches[paren];
      if (undefined === count) {
        branches[paren] = 2;
        n_branches += 1;
      } else branches[paren] = count + 1;
    } else {
      parents[paren] = true;
    }
  }

  for (var i=0, l=children.length; i<l; ++i) {
    var node = children[i];
    if (undefined === parents[node]) ends.push(node);
  }

  // Corner case: an Arbor with a root and no children
  if (0 === children.length && this.root) ends.push(this.root);

  return {ends: ends,
          branches: branches,
          n_branches: n_branches};
};

/** Returns a map of branch node vs true.
 * Runs in O(2n) time. */
Arbor.prototype.findBranchNodes = function() {
  var edges = this.edges,
      children = this.childrenArray(),
      parents = {},
      branches = {};

  for (var i=0, l=children.length; i<l; ++i) {
    var paren = edges[children[i]];
    if (parents[paren]) branches[paren] = true;
    else parents[paren] = true;
  }

  return branches;
};

/**
 * Return a map of node vs topological distance from the given root. Rather than
 * a distance, these are the hierarchical orders, where root has order 0, nodes
 * directly downstream of root have order 1, and so on. Invoke with this.root as
 * argument to get the distances to the root of this Arbor. Invoke with any
 * non-end node to get distances to that node for nodes downstream of it.
 */
Arbor.prototype.nodesOrderFrom = function(root) {
	return this.nodesDistanceTo(root, function() { return 1; }).distances;
};

/**
 * Measure distance of every node to root in O(2n), by using the given
 * distanceFn which takes two nodes (child and parent) as arguments and returns
 * a number.  Returns an object containing the distances and the maximum
 * distance.
 */
Arbor.prototype.nodesDistanceTo = function(root, distanceFn) {
	var distances = {},
	    r = {distances: distances,
	         max: 0};

	// Handle corner case:
	if (!root) return r;

	var successors = this.allSuccessors(),
			open = [[root, 0]], // likely faster and more memory efficient with a linked list approach using object literals {node: root, distance: 0, next: null}
			max = 0.000001;

	var next, paren, child, dist, succ;

	while (open.length > 0) {
		next = open.shift();
		paren = next[0];
		dist = next[1];
		distances[paren] = dist;
		succ = successors[paren];
		while (1 === succ.length) {
			child = succ[0];
			dist += distanceFn(child, paren);
			distances[child] = dist;
			paren = child;
			succ = successors[paren];
		}
		if (0 === succ.length) {
			// End node
			max = Math.max(max, dist);
		} else {
			// Branch node
			for (var i=0; i<succ.length; ++i) {
				open.push([succ[i], dist + distanceFn(succ[i], paren)]);
			}
		}
	}

	r.max = max;

	return r;
};

/**
 * Return an array will all nodes that are not the root.
 */
Arbor.prototype.childrenArray = function() {
  return Object.keys(this.edges);
};

/**
 * Return an Object with node keys and true values, in O(2n) time.
 */
Arbor.prototype.nodes = function() {
  var a = this.nodesArray(),
      nodes = {};
  for (var i=0; i<a.length; ++i) nodes[a[i]] = true;
	return nodes;
};

/**
 * Return an Array of all nodes in O(n) time.
 */
Arbor.prototype.nodesArray = function() {
	var nodes = Object.keys(this.edges);
	if (null !== this.root) nodes.push(this.root);
	return nodes;
};

/**
 * Counts number of nodes in O(n) time.
 */
Arbor.prototype.countNodes = function() {
	return this.nodesArray().length;
};

/**
 * Returns an array of arrays, unsorted, where the longest array contains the
 * linear path between the furthest end node and the root node, and all other
 * arrays are shorter paths always starting at an end node and finishing at a
 * node already included in another path. Runs in O(4*n + m) where n is the
 * number of nodes and m the number of ends.
 */
Arbor.prototype.partition = function() {
  var be = this.findBranchAndEndNodes(),
      ends = be.ends,
      branches = be.branches,
      partitions = new Array(ends.length),
      next = 0,
      junctions = {};

  var open = new Array(ends.length);
  for (var k=0; k<ends.length; ++k) open[k] = [ends[k]];

  while (open.length > 0) {
    var seq = open.shift(),
        node = seq[seq.length -1],
        paren,
        n_successors;
    do {
        paren = this.edges[node];
        if (undefined === paren) break; // reached root
        seq.push(paren);
        n_successors = branches[paren];
        node = paren;
    } while (undefined === n_successors);

    if (undefined === paren) {
      // Reached the root
      partitions[next++] = seq;
    } else {
      // Reached a branch node
      var junction = junctions[node];
      if (undefined === junction) {
        junctions[node] = [seq];
      } else {
        junction.push(seq);
        if (junction.length === n_successors) {
          // Append longest to open, and all others to partitions
          var max = 0,
              ith = 0;
          for (var k=0; k<junction.length; ++k) {
            var len = junction[k].length;
            if (len > max) {
              max = len;
              ith = k;
            }
          }
          for (var k=0; k<junction.length; ++k) {
            if (k === ith) open.push(junction[k]);
            else partitions[next++] = junction[k];
          }
        }
      }
    }
  }

  return partitions;
};

/**
 * Like this.partition, but returns the arrays sorted by length from small to
 * large.
 */
Arbor.prototype.partitionSorted = function() {
	return this.partition().sort(function(a, b) {
		var da = a.length,
		    db = b.length;
		return da === db ? 0 : (da < db ? -1 : 1);
	});
};

/**
 * Returns an array of child nodes in O(n) time. See also this.allSuccessors()
 * to get them all in one single shot at O(n) time.
 */
Arbor.prototype.successors = function(node) {
  var edges = this.edges,
      children = this.childrenArray(),
      a = [];
  for (var i=0; i<children.length; ++i) {
    var child = children[i];
    if (edges[child] === node) a.push(child);
  }
  return a;
};

/**
 * Returns an array of child nodes plus the parent node in O(n) time. See also
 * this.allNeighbors() to get them all in one single shot at O(2n) time.
 */
Arbor.prototype.neighbors = function(node) {
  var edges = this.edges,
      children = this.childrenArray(),
      paren = this.edges[node],
      neighbors = (undefined === paren) ? [] : [paren];
  for (var i=0; i<children.length; ++i) {
    var child = children[i];
    if (edges[child] === node) neighbors.push(child);
  }
  return neighbors;
};

/**
 * Return a new Arbor that has all nodes in the array of nodes to preserve,
 * rerooted at the node in keepers that has the lowest distance to this arbor's
 * root node.
 */
Arbor.prototype.spanningTree = function(keepers) {
  var spanning = new Arbor();
  switch (keepers.length) {
    case 0:
      return spanning;
    case 1:
      spanning.root = keepers[0];
      return spanning;
  }

  var partitions = this.partitionSorted(),
      n_seen = 0,
      preserve = {},
      n_keepers = 0;

  for (var i=0; i<keepers.length; ++i) {
    var node = keepers[i];
    if (preserve[node]) continue; // skip repeated entry in keepers
    preserve[keepers[i]] = 1;
    n_keepers += 1;
  }

  for (var k=0; k<partitions.length; ++k) {
    var partition = partitions[k],
        first = -1,
        last = -1;
    for (var i=0; i<partition.length; ++i) {
      var node = partition[i],
          v = preserve[node];
      if (v) {
        if (1 == v) {
          // First time seen
          n_seen += 1;
          preserve[node] = 2; // mark as seen before
        }
        if (-1 == first) {
          first = i;
        } else {
          last = i;
        }
      }
    }
    if (-1 != first) {
      var end;
      if (-1 != last && n_seen == n_keepers) {
        // Add up to the last seen
        end = last + 1;
      } else {
        // Add the rest
        end = partition.length;
        // Add branch node to keepers if not there already
        node = partition[end -1];
        if (!preserve[node]) {
          preserve[node] = 1;
          n_keepers += 1;
        }
      }
      for (var i=first + 1; i<end; ++i) {
        spanning.edges[partition[i-1]] = partition[i];
      }
      spanning.root = partition[end -1];
    }
  }

  return spanning;
};

/**
 * Compute betweenness centrality of a tree in O(5n) time. Note that edges are
 * considered non-directional, that is, this is the betweenness centrality of
 * the equivalent undirected graph of the tree. This implementation relies on
 * trees having non-duplicate directed edges and no loops. All edges are
 * considered equal, and endpoints are included.
 *
 * @returns A map of node vs number of paths traveling through the node. */
Arbor.prototype.betweennessCentrality = function(normalized) {
	var succ_groups = {},
			centrality = {},
			n_nodes = this.countNodes();
	// Handle corner cases
	if (0 === n_nodes) return centrality;
	if (1 === n_nodes) {
		centrality[this.root] = 0;
		return centrality;
	}
	// Iterate from shortest to longest partition, where each partition
	// runs from an end node to a branch node or root,
	// and the last partition is the longest and reaches the root.
	this.partitionSorted().forEach(function(seq) {
		var branch = seq.pop(), // remove the last one, which is a branch node or root
        group = succ_groups[branch];
		if (!group) {
			group = [];
			succ_groups[branch] = group;
		}
		group.push(seq.reduce(function(cumulative, node) {
			var g = succ_groups[node];
			if (g) {
				// Passing through a branch node that had already been reached before
				// by shorter partitions
				// Count nodes accumulated by other partitions
				var other = g.reduce(function(a, b) { return a + b; }, 0);
				// Add the count of nodes downstream of this node within this partition
				g.push(cumulative);
				// Add the count of upstream nodes
				g.push(n_nodes - cumulative - other - 1);
				// Count the paths passing through this node
				var paths = 0,
			      len = g.length;
				for (var i=0; i<len; ++i) {
					for (var k=i+1; k<len; ++k) {
						paths += g[i] * g[k];
					}
				}
				// Update cumulative at this node
				cumulative += other;
				centrality[node] = paths;
			} else {
				// Slab node: the number of paths is the number of successor nodes
				// times the number of predecessor nodes
				centrality[node] = (cumulative * (n_nodes - cumulative -1));
			}
			return cumulative + 1;
		}, 0));
	});

	if (normalized) {
		var K = 2.0 / ((n_nodes -1) * (n_nodes -2));
		Object.keys(centrality).forEach(function(node) {
			centrality[node] *= K;
		});
	}

	centrality[this.root] = 0;

	return centrality;
};

/**
 * Return a new arbor that preserves only the root, branch and end nodes.
 * Runs in O(2*n) time.
 */
Arbor.prototype.topologicalCopy = function() {
	var topo = new Arbor(),
			successors = this.allSuccessors();

	// Handle corner case
	if (!this.root) return topo;
	
	var open = [[this.root, this.root]];

	topo.root = this.root;

	while (open.length > 0) {
		var edge = open.shift(), // faster than pop
			  child = edge[0],
			  paren = edge[1],
			  succ = successors[child];
		while (1 === succ.length) {
			child = succ[0];
			succ = successors[child];
		}
		topo.edges[child] = paren;
		for (var i=0; i<succ.length; ++i) open.push([succ[i], child]);
	}

	// Handle cheaply a potential corner case: single-node arbors
	delete topo.edges[topo.root];

	return topo;
};

/**
 * Return an array of arrays, each subarray containing the nodes of a slab,
 * including the initial node (root or a branch node ) and the ending node (a
 * branch node or an end node).
 */
Arbor.prototype.slabs = function() {
	var slabs = [];

	// Handle corner case
	if (!this.root) return slabs;

	var successors = this.allSuccessors(),
			open = [[this.root]];
	while (open.length > 0) {
		var slab = open.shift(), // faster than pop
			  succ = successors[slab[slab.length -1]],
			  child;
		while (1 === succ.length) {
			child = succ[0];
			slab.push(child);
			succ = successors[child];
		}
		slabs.push(slab);
		if (succ.length > 1) {
			open = open.concat(succ.map(function(s) { return [this.edges[s], s]; }, this));
		}
	}
	return slabs;
};

/**
 * Compute the centrality of each slab as the average centrality of its starting
 * and ending nodes, when computing the centrality of the topologically reduced
 * arbor (an arbor that only preserves root, branch and end nodes relative to
 * the original).
 *
 * @returns An object with nodes as keys and the centrality as value. At the
 * branch nodes, the centrality is set to that of the parent slab; for root, it
 * is always zero.
 */
Arbor.prototype.slabCentrality = function(normalized) {
	var sc = {};
	// Handle corner case
	if (!this.root) return sc;
	var topo = this.topologicalCopy(),
	    tc = topo.betweennessCentrality(normalized);
	sc[this.root] = tc[topo.root];
	this.slabs().forEach(function(slab) {
		var c = (tc[slab[0]] + tc[slab[slab.length -1]]) / 2;
		for (var i=0; i<slab.length; ++i) sc[slab[i]] = c;
	});
	return sc;
};

/**
 * Return a new Arbor which is a shallow copy of this Arbor, starting at node.
 */
Arbor.prototype.subArbor = function(new_root) {
	// Thinking about the way that traverses the arbor the least times
	// Via allSuccessors: 2 traversals for allSuccessors, and one more to read the subtree
	// Via findEndNodes: 3 traversals, then a forth one

	var successors = this.allSuccessors(),
			sub = new Arbor(),
			open = [new_root],
			paren, children, child, i;

	sub.root = new_root;

	while (open.length > 0) {
		paren = open.shift(); // faster than pop
		children = successors[paren];
		while (children.length > 0) {
			child = children[0];
			sub.edges[child] = paren;
			// Add others to the queue
			for (i=1; i<children.length; ++i) {
				sub.edges[children[i]] = paren;
				open.push(children[i]);
			}
			paren = child;
			children = successors[paren];
		}
	}

	return sub;
};

/**
 * Return a map of node vs amount of arbor downstream of the node, where the
 *
 * @param {Function} amountFn Is a function that takes two arguments: parent and
 *                            child. To obtain a map of node vs number of nodes
 *                            downstream, amountFn is a function that returns
 *                            the value 1. For cable, amountFn returns the
 *                            length of the cable between parent and child.
 * @param {Boolean} noramlize (Optional) If normalize is defined and true, all values are
 *                            divided by the maximum value, which is the value
 *                            at the root node.
 */
Arbor.prototype.downstreamAmount = function(amountFn, normalize) {
	// Iterate partitions from smallest to largest
	var values = this.partitionSorted().reduce(function(values, partition) {
		var child = partition[0],
			  val = 0;
		values[child] = 0; // a leaf node by definition
		for (var k=1, l=partition.length; k<l; ++k) {
			var paren = partition[k],
			    amount = amountFn(paren, child),
			    accumulated = values[paren];
			val += amount + (undefined === accumulated ? 0 : accumulated);
	    values[paren] = val;
		}
		return values;
	}, {});

	if (normalize) {
		var max = values[this.root];
		Object.keys(values).forEach(function(node) {
			values[node] = values[node] / max;
		});
	}

	return values;
};

/**
* Return a map of node vs branch index relative to root. Terminal branches
* have an index of 1, their parent branches of 2 if two or more of their
* children are 1 as well as all others have a lower index, or their parent
* branches have and index of 1 if one child is 1 and no child with greater
* index, etc., all the way to root. The maximum number is that of the root
* node.
*/
Arbor.prototype.strahlerAnalysis = function() {
  var strahler = {},
      be = this.findBranchAndEndNodes(),
      branch = be.branches,
      open = be.ends.slice(0), // clone. Never edit return values from internal functions, so that they can be cached
      visited_branches = {}; // branch node vs array of strahler indices

  // All end nodes have by definition an index of 1
  for (var i=0; i<open.length; ++i) strahler[open[i]] = 1;

  while (open.length > 0) {
    var node = open.shift(),
        index = strahler[node],
        n_children = branch[node],
        paren = this.edges[node];
    // Iterate slab towards first branch found
    while (paren) {
      n_children = branch[paren];
      if (n_children) break; // found branch
      strahler[paren] = index;
      paren = this.edges[paren];
    }
    if (paren) {
      // paren is a branch. Are all its branches minus one completed?
      var si = visited_branches[paren];
      if (si && si.length === n_children -1) {
        // Yes: compute strahler:
        //  A. if two or more children share max index, increase Strahler index by one
        //  B. Otherwise pick the largest strahler index of its children
        var v = si.reduce((a, b) => Math.max(a, b), index); // max index of children including current
        var same = index === v ? 1 : 0; // increment same if current index is equal to max
        for (var k=0; k<si.length; k++) {
          if (si[k] === v) ++same;
        }
        strahler[paren] = same >= 2 ? v + 1 : v; // increment strahler number if there are two or more occurances of the max child index
        open.push(paren);
      } else {
        // No: compute later
        if (si) si.push(index);
        else visited_branches[paren] = [index];
      }
    } else {
      // else is the root
      strahler[this.root] = index;
    }
  }


  return strahler;
};

/**
 * Perform Sholl analysis: returns two arrays, paired by index, of radius length
 * and the corresponding number of cable crossings, sampled every
 * radius_increment.
 *
 * E.g.:
 *
 * {
 *  radius:   [0.75, 1.5, 2.25, 3.0],
 *  crossings:[   3,   2,    1,   1]
 * }
 *
 * A segment of cable defined two nodes that hold a parent-child relationship is
 * considered to be crossing a sampling radius if the distance from the center
 * for one of them is beyond the radius, and below for the other.
 *
 * Notice that if parent-child segments are longer than radius-increment in the
 * radial direction, some parent-child segments will be counted more than once,
 * which is correct.
 *
 * @param {Number}   radius_increment   Distance between two consecutive samplings.
 * @param {Function} distanceToCenterFn Determines the distance of a node from the
 *                                      origin of coordinates, in the same units
 *                                      as the radius_increment.
 */
Arbor.prototype.sholl = function(radius_increment, distanceToCenterFn) {
    // Create map of radius index to number of crossings.
    // (The index, being an integer, is a far safer key for a map than the distance as floating-point.)
    var indexMap = {},
        cache = {},
        children = this.childrenArray();
    for (var i=0; i<children.length; ++i) {
      var child = children[i];
      // Compute distance of both parent and child to the center
      // and then divide by radius_increment and find out
      // which boundaries are crossed, and accumulate the cross counts in sholl.
      var paren = this.edges[child],
          dc = cache[child],
          dp = cache[paren];
      if (undefined === dc) cache[child] = dc = distanceToCenterFn(child);
      if (undefined === dp) cache[paren] = dp = distanceToCenterFn(paren);
      var index = Math.floor(Math.min(dc, dp) / radius_increment) + 1,
          next = Math.round(Math.max(dc, dp) / radius_increment + 0.5); // proper ceil
      while (index < next) {
          var count = indexMap[index];
          if (undefined === count) indexMap[index] = 1;
          else indexMap[index] += 1;
          ++index;
      }
    }

    // Convert indices to distances
    return Object.keys(indexMap).reduce(function(o, index) {
        o.radius.push(index * radius_increment);
        o.crossings.push(indexMap[index]);
        return o;
    }, {radius: [], crossings: []});
};


/**
 * Return two correlated arrays, one with bin starting position and the other
 * with the quantity of nodes whose position falls within the bin.
 *
 * Bins have a size of radius_increment.
 *
 * Only nodes included in the map of positions will be measured. This enables
 * computing Sholl for e.g. only branch and end nodes, or only for nodes with
 * synapses.
 *
 * @param {Object} center           An object with a distanceTo method, like
 *                                  THREE.Vector3.
 * @param {Number} radius_increment Difference between the radius of a sphere
 *                                  and that of the next sphere.
 * @param {Object} positions        Map of node ID vs objects like THREE.Vector3.
 * @param {Function} fnCount        A function to e.g. return 1 when counting,
 *                                  or the length of a segment when measuring cable.
 */
Arbor.prototype.radialDensity = function(center, radius_increment, positions, fnCount) {
    var density = this.nodesArray().reduce(function(bins, node) {
        var p = positions[node];
        // Ignore missing nodes
        if (undefined === p) return bins;
        var index = Math.floor(center.distanceTo(p) / radius_increment),
            count = bins[index];
        if (undefined === count) bins[index] = fnCount(node);
        else bins[index] += fnCount(node);
        return bins;
    }, {});

    // Convert indices to distances
    return Object.keys(density).reduce(function(o, index) {
        o.bins.push(index * radius_increment);
        o.counts.push(density[index]);
        return o;
    }, {bins: [], counts: []});
};

/**
 * Return a map of node vs number of paths from any node in the set of inputs to
 * any node in the set of outputs.
 *
 * @param {Object} outputs A map of node keys vs number of outputs at the node.
 * @param {Object} inputs  Aa map of node keys vs number of inputs at the node.
 */
Arbor.prototype.flowCentrality = function(outputs, inputs, totalOutputs, totalInputs) {
    if (undefined === totalOutputs) {
      totalOutputs = Object.keys(outputs).reduce(function(sum, node) {
          return sum + outputs[node];
      }, 0);
    }

    if (undefined === totalInputs) {
      totalInputs = Object.keys(inputs).reduce(function(sum, node) {
          return sum + inputs[node];
      }, 0);
    }

    if (0 === totalOutputs || 0 === totalInputs) {
        // Not computable
        return null;
    }

    // Traverse all partitions counting synapses seen
    var partitions = this.partitionSorted(),
        cs = {},
        centrality = {};
    for (var i=0; i<partitions.length; ++i) {
      var partition = partitions[i],
          seenI = 0,
          seenO = 0;
      for (var k=0, l=partition.length; k<l; ++k) {
        var node = partition[k],
            counts = cs[node];
        if (undefined === counts) {
          var n_inputs = inputs[node],
              n_outputs = outputs[node];
          if (n_inputs) seenI += n_inputs;
          if (n_outputs) seenO += n_outputs;
          // Last node of the partition is a branch or root
          if (k === l -1) cs[node] = {seenInputs: seenI,
                                      seenOutputs: seenO};
        } else {
          seenI += counts.seenInputs;
          seenO += counts.seenOutputs;
          counts.seenInputs = seenI;
          counts.seenOutputs = seenO;
        }
        var centripetal = seenI * (totalOutputs - seenO),
            centrifugal = seenO * (totalInputs  - seenI);
        centrality[node] = {centrifugal: centrifugal,
                            centripetal: centripetal,
                            sum: centrifugal + centripetal};
      }
    }

    return centrality;
};

/**
 * positions: map of node ID vs objects like THREE.Vector3.
 */
Arbor.prototype.cableLength = function(positions) {
  var children = this.childrenArray(),
      sum = 0;
  for (var i=0; i<children.length; ++i) {
    var node = children[i];
    sum += positions[node].distanceTo(positions[this.edges[node]]);
  }
  return sum;
};

/**
 * Return the cable length between nodes A and B in this arbor.
 */
Arbor.prototype.cableLengthBetweenNodes = function(positions, nodeA, nodeB, noReroot) {
  let arbor;
  if (noReroot) {
    // If the order of node A and B are known, rerooting can be omitted.
    arbor = this;
  } else {
    // Reroot arbor to node A for easy upstream traversal from node B.
    arbor = this.clone();
    arbor.reroot(nodeA);
  }

  // Compute distance from node B to upstream node A.
  let distance = 0;
  let childPosition = positions[nodeB];
  let parent = arbor.edges[nodeB];
  while (parent) {
    let parentPosition = positions[parent];
    distance += childPosition.distanceTo(parentPosition);

    // If the current parent node is found, return with the calculated length.
    if (parent == nodeA) {
      return distance;
    }

    parent = arbor.edges[parent];
    childPosition = parentPosition;
  }

  return null;
};

/**
 * Sum the cable length by smoothing using a Gaussian convolution. For
 * simplicity, considers the root, all branch and end nodes as fixed points, and
 * will only therefore adjust slab nodes.
 *
 * @param {Object}   positions     Map of node ID vs objects like THREE.Vector3
 * @param {Number}   sigma         For tracing neurons, use e.g. 100 nm
 * @param {Number}   initialValue  Initial value for the reduce to accumulate on
 * @param {Function} slabInitFn    Take the accumulator value, the node and its
 *                                 point, return a new accumulator value.
 * @param {Function} accumulatorFn Given an accumulated value, the last point,
 *                                 the node ID and its new point, return a new
 *                                 value that will be the next value in the next
 *                                 round.
 * @retruns The accumulated value
 */
Arbor.prototype.convolveSlabs = function(positions, sigma, initialValue, slabInitFn, accumulatorFn) {
    // Gaussian:  a * Math.exp(-Math.pow(x - b, 2) / (2 * c * c)) + d 
    // where a=1, d=0, x-b is the distance to the point in space, and c is sigma=0.5.
    // Given that the distance between points is computed as the sqrt of the sum
    // of the squared differences of each dimension, and it is then squared, we
    // can save two ops: one sqrt and one squaring, to great performance gain.
    var S = 2 * sigma * sigma,
        slabs = this.slabs(),
        threshold = 0.01,
        accum = initialValue;

    for (var j=0, l=slabs.length; j<l; ++j) {
        var slab = slabs[j],
            last = positions[slab[0]];
        accum = slabInitFn(accum, slab[0], last);
        for (var i=1, len=slab.length -1; i<len; ++i) {
            // Estimate new position of the point at i
            // by convolving adjacent points
            var node = slab[i],
                point = positions[node],
                weights = [1],
                points = [point],
                k, w, pk;
            // TODO: could memoize the distances to points for reuse
            // TODO: or use the _gaussianWeights one-pass computation. Need to
            // measure what is faster: to create a bunch of arrays or to muliply
            // multiple times the same values.
            k = i - 1;
            while (k > -1) {
                pk = positions[slab[k]];
                //w = Math.exp(-Math.pow(point.distanceTo(pk), 2) / S);
                //Same as above, saving two ops (sqrt and squaring):
                w = Math.exp(- (point.distanceToSquared(pk) / S));
                if (w < threshold) break;
                points.push(pk);
                weights.push(w);
                --k;
            }
            k = i + 1;
            while (k < slab.length) {
                pk = positions[slab[k]];
                //w = Math.exp(-Math.pow(point.distanceTo(pk), 2) / S);
                //Same as above, saving two ops (sqrt and squaring):
                w = Math.exp(- (point.distanceToSquared(pk) / S));
                if (w < threshold) break;
                points.push(pk);
                weights.push(w);
                ++k;
            }
            var weightSum = 0,
                n = weights.length;
            for (k=0; k<n; ++k) weightSum += weights[k];

            var x = 0,
                y = 0,
                z = 0;
            for (k=0; k<n; ++k) {
                w = weights[k] / weightSum;
                pk = points[k];
                x += pk.x * w;
                y += pk.y * w;
                z += pk.z * w;
            }

            var pos = new THREE.Vector3(x, y, z);
            accum = accumulatorFn(accum, last, slab[i], pos);
            last = pos;
        }
        accum = accumulatorFn(accum, last, slab[slab.length -1], positions[slab[slab.length -1]]);
    }
    return accum;
};

/**
 * Compute the cable length of the arbor after performing a Gaussian
 * convolution.  Does not alter the given positions map. Conceptually equivalent
 * to var cable = arbor.cableLength(arbor.smoothPositions(positions, sigma));
 */
Arbor.prototype.smoothCableLength = function(positions, sigma) {
    return this.convolveSlabs(positions, sigma, 0,
            function(sum, id, p) {
                return sum;
            },
            function(sum, p0, id, p1) {
                return sum + p0.distanceTo(p1);
            });
};

/**
 * Alter the positions map to express the new positions of the nodes after a
 * Gaussian convolution.
 */
Arbor.prototype.smoothPositions = function(positions, sigma, accum) {
    return this.convolveSlabs(positions, sigma, accum ? accum : {},
            function(s, id, p) {
                s[id] = p;
                return s;
            },
            function(s, p0, id, p1) {
                s[id] = p1;
                return s;
            });
};

/**
 * Resample the arbor to fix the node interdistance to a specific value.  The
 * distance of an edge prior to a slab terminating node (branch or end) will
 * most often be within +/- 50% of the specified delta value, given that branch
 * and end nodes are fixed. The root is also fixed.
 *
 * The resampling is done using a Gaussian convolution with adjacent nodes,
 * weighing them by distance to relevant node to use as the focus for
 * resampling, which is the first node beyond delta from the last resampled
 * node.
 *
 * @param {Object} positions    Map of node ID vs THREE.Vector3, or equivalent
 *                              object with distanceTo and clone methods.
 * @param {Number} sigma        Value to use for Gaussian convolution to smooth
 *                              the slabs prior to resampling.
 * @param {Number} delta        Desired new node interdistance.
 * @param {Number} minNeighbors Minimum number of neighbors to inspect; defaults
 *                              to zero. Aids in situations of extreme jitter,
 *                              where otherwise spatially close but not
 *                              topologically adjancent nodes would not be
 *                              looked at because the prior node would have a
 *                              Gaussian weight below 0.01.
 *
 * @returns A new Arbor, with new numeric node IDs that bear no relation to the
 * IDs of this Arbor, and a map of the positions of its nodes.
 */
Arbor.prototype.resampleSlabs = function(positions, sigma, delta, minNeighbors) {
    var arbor = new Arbor(),
        new_positions = {},
        next_id = 0,
        starts = {},
        slabs = this.slabs(),
        S = 2 * sigma * sigma,
        sqDelta = delta * delta,
        minNeighbors = (Number.NaN === Math.min(minNeighbors | 0, 0) ? 0 : minNeighbors) | 0;

    arbor.root = 0;
    new_positions[0] = positions[this.root];

    starts[this.root] = 0;

    // In a slab, the first node is the closest one to the root.
    for (var i=0, l=slabs.length; i<l; ++i) {
        var slab = slabs[i],
            a = this._resampleSlab(slab, positions, S, delta, sqDelta, minNeighbors),
            first = slab[0],
            paren = starts[first];
        if (undefined === paren) {
            paren = ++next_id;
            starts[first] = paren;
            new_positions[paren] = positions[first];
        }
        var child;
        // In the new slab, the first and last nodes have not moved positions.
        for (var k=1, la=a.length-1; k<la; ++k) {
            child = ++next_id;
            arbor.edges[child] = paren;
            new_positions[child] = a[k];
            paren = child;
        }
        // Find the ID of the last node of the slab, which may exist
        var last = slab[slab.length -1];
        child = starts[last];
        if (undefined === child) {
            child = ++next_id;
            starts[last] = child;
            new_positions[child] = positions[last];
        }
        // Set the last edge of the slab
        arbor.edges[child] = paren;
    }

    return {arbor: arbor,
            positions: new_positions};
};

/**
 * Helper function for resampleSlabs.
 */
Arbor.prototype._resampleSlab = function(slab, positions, S, delta, sqDelta, minNeighbors) {
    var slabP = slab.map(function(node) { return positions[node]; }),
        gw = this._gaussianWeights(slab, slabP, S, minNeighbors),
        len = slab.length,
        last = slabP[0].clone(),
        a = [last],
        k,
        i = 1;

    while (i < len) {
        // Find k ahead of i that is just over delta from last
        for (k=i; k<len; ++k) {
            if (last.distanceToSquared(slabP[k]) > sqDelta) break;
        }

        if (k === len) break;

        // NOTE: should check which is closer: k or k-1; but when assuming a
        // Gaussian-smoothed arbor, k will be closer in all reasonable situations.
        // Additionally, k (the node past) is the one to drift towards when nodes
        // are too far apart.

        // Collect all nodes before and after k with a weight under 0.01, as
        // precomputed in gw: only weights > 0.01 exist
        var pivot = slab[k],
            points = [k],
            weights = [1],
            j = k - 1;
        while (j > 0) {
            var w = gw[j][k-j];
            if (undefined === w && (k - j) >= minNeighbors) break;
            points.push(j);
            weights.push(w);
            --j;
        }

        j = k + 1;
        while (j < len) {
            var w = gw[k][j-k];
            if (undefined === w && (j - k) >= minNeighbors) break;
            points.push(j);
            weights.push(w);
            ++j;
        }

        var x = 0,
            y = 0,
            z = 0;

        if (1 === points.length) {
            // All too far: advance towards next node's position
            var pk = slabP[k];
            x = pk.x;
            y = pk.y;
            z = pk.z;
        } else {
            var weightSum = 0,
                n = weights.length;

            for (j=0; j<n; ++j) weightSum += weights[j];

            for (j=0; j<n; ++j) {
                var w = weights[j] / weightSum,
                    pk = slabP[points[j]];
                x += pk.x * w;
                y += pk.y * w;
                z += pk.z * w;
            }
        }

        // Create a direction vector from last to the x,y,z point, scale by delta,
        // and then create the new point by translating the vector to last
        var next = new THREE.Vector3(x - last.x, y - last.y, z - last.z)
            .normalize()
            .multiplyScalar(delta)
            .add(last);
        a.push(next);
        last = next;

        i = k;
    }

    var slabLast = slabP[len -1].clone();
    if (last.distanceToSquared(slabLast) < sqDelta / 2) {
        // Replace last: too close to slabLast
        a[a.length -1] = slabLast;
    } else {
        a.push(slabLast);
    }

    return a;
};

/**
 * Helper function.
 *
 * Starting at the first node, compute the Gaussian weight towards forward in
 * the slab until it is smaller than 1%. Then do the same for the second node,
 * etc. Store all weights in an array per node that has as first element '1'
 * (weight with itself is 1), and then continues with weights for the next node,
 * etc. until one node's weight falls below 0.01.
 *
 * BEWARE that if nodes are extremely jittery, the computation of weights may
 * terminate earlier than would be appropriate. To overcome this, pass a value
 * of e.g. 3 neighbor nodes minimum to look at.
 *
 * Gaussian as: a * Math.exp(-Math.pow(x - b, 2) / (2 * c * c)) + d
 * ignoring a and d, given that the weights will then be used for normalizing
 * 
 * @param {Number[]} slab  Array of node IDs
 * @param {Number[]} slabP Array of corresponding THREE.Vector3
 * @param {NUmber}   S     2 * Math.pow(sigma, 2)
 */
Arbor.prototype._gaussianWeights = function(slab, slabP, S, minNeighbors) {
    var weights = [];
    for (var i=0, l=slab.length; i<l; ++i) {
        var pos1 = slabP[i],
            a = [1.0];
        for (var k=i+1; k<l; ++k) {
            var w = Math.exp(- (pos1.distanceToSquared(slabP[k]) / S));
            if (w < 0.01 && (k - i) >= minNeighbors) break;
            a.push(w);
        }
        weights.push(a);
    }
    return weights;
};

/** Measure cable distance from node to a parent of it that exists in stops.
 * If no node in stops is upstream of node, then returns null.
 * Will traverse towards upstream regardless of whether the initial node belongs to stops or not. */
Arbor.prototype.distanceToUpstreamNodeIn = function(node, positions, stops) {
  var loc1 = positions[node],
      paren = this.edges[node],
      len = 0;
  while (paren) {
    var loc2 = positions[paren];
    len += loc1.distanceTo(loc2);
    if (undefined !== stops[paren]) return len;
    loc1 = loc2;
    paren = this.edges[paren];
  }
  // Reached root without having found a stop
  return null;
};

/**
 * Compute the amount of able of all terminal slabs together.
 *
 * @returns Both the cable and the number of end nodes (equivalent to the number
 * of terminal segments).
 */
Arbor.prototype.terminalCableLength = function(positions) {
  var be = this.findBranchAndEndNodes(),
      branches = be.branches,
      ends = be.ends,
      cable = 0;

  // catch corner case: no branches, perhaps just the root in isolation
  if (ends.length < 2) {
    return {cable: this.cableLength(positions),
            n_branches: 0,
            n_ends: ends.length}; // 1 or 0
  }

  for (var i=0; i<ends.length; ++i) {
    var node = ends[i],
        pos1 = positions[node],
        node = this.edges[node];
    do {
        var pos2 = positions[node];
        cable += pos1.distanceTo(pos2);
        pos1 = pos2;
        node = this.edges[node];
        if (undefined === node) break; // Root node is a branch
    } while (undefined === branches[node]);
  }

  return {cable: cable,
          n_branches: be.n_branches,
          n_ends: ends.length};
};

/**
 * Find path from node to an upstream node that is in stops. If no node in
 * stops is upstrem of node, then returns null. Will traverse towards upstream
 * regardless of whether the initial node belongs to stops or not.
 */
Arbor.prototype.pathToUpstreamNodeIn = function(node, stops) {
  var path = [node],
      paren = this.edges[node];
  while (paren) {
    path.push(paren);
    if (stops.hasOwnProperty(paren)) return path;
    paren = this.edges[paren];
  }
  // Reached root without having found a stop
  return null;
};

/**
 * For each branch node, record a measurement for each of its subtrees.
 *
 * @param {Function} initialFn Returns the value to start accumulating on
 * @param {Function} accumFn   Can alter its accum parameter
 * @param {Function} mergeFn   Merge two accumulated values into a new one; must
 *                             not alter its parameters.
 *
 * @returns A map of branch node vs array of measurements, one per subtree.
 */
Arbor.prototype.subtreesMeasurements = function(initialFn, cummulativeFn, mergeFn) {
  // Iterate partitions from shortest to longest.
  // At the end of each partition, accumulate the cable length onto the ending node
  // (which is a branch, except for root).
  // As shorter branches are traversed, append the cable so far into them.
  var branch = {},
      partitions = this.partitionSorted();

  for (var p=0; p < partitions.length; ++p) {
    var partition = partitions[p],
        node1 = partition[0],
        accum = initialFn(node1),
        node2,
        i=1;
    for (var l=partition.length -1; i<l; ++i) {
      node2 = partition[i];
      accum = cummulativeFn(accum, node1, node2);
      // Check if current node is a branch
      // By design, the branch will already have been seen and contain a list
      var list = branch[node2];
      if (list) {
        var tmp = accum;
        accum = list.reduce(mergeFn, accum);
        list.push(tmp);
      }
      // Prepare next iteration
      node1 = node2;
    }
    // Handle last node separately
    // (there could be issues otherwise with branches that split into more than 2)
    node2 = partition[i];
    accum = cummulativeFn(accum, node1, node2);
    var list = branch[node2];
    if (list) list.push(accum);
    else branch[node2] = [accum];
  }

  // Check if root node was not a branch
  var list = branch[this.root];
  if (1 === list.length) delete branch[this.root];

  return branch;
};

/**
 * At each branch node, measure the amount of cable on each of the 2 or more
 * subtrees.
 *
 * @param {Object} positions Map of node vs THREE.Vector3.
 *
 * @returns A map of branch node vs array of values, one for each subtree.
 */
Arbor.prototype.subtreesCable = function(positions) {
  return this.subtreesMeasurements(
      function(node1) {
        return 0;
      },
      function(accum, node1, node2) {
        return accum + positions[node1].distanceTo(positions[node2]);
      },
      function(accum1, accum2) {
        return accum1 + accum2;
      });
};

/**
 * At each branch node, count the number of terminal ends on each of the 2 or
 * more subtrees.
 *
 * @returns A map of branch node vs array of values, one for each subtree.
 */
Arbor.prototype.subtreesEndCount = function() {
  return this.subtreesMeasurements(
      function(node1) {
        return 1;
      },
      function(accum, node1, node2) {
        return accum;
      },
      function(accum1, accum2) {
        return accum1 + accum2;
      });
};

/**
 * At each branch node, count the number of associated elements on each of the 2
 * or more subtrees.
 *
 * @param {Object} load Map of node vs number of associated elements (e.g. input
 *                      synapses). Nodes with a count of zero do not need to be
 *                      present.
 * @eturns A map of branch node vs array of values, one for each subtree.
 */
Arbor.prototype.subtreesLoad = function(load) {
  return this.subtreesMeasurements(
      function(node1) {
        var count = load[node1];
        return count ? count : 0;
      },
      function(accum, node1, node2) {
        var count = load[node2];
        if (count) return accum + count;
        return accum;
      },
      function(accum1, accum2) {
        return accum1 + accum2;
      });
};

/**
 * Compute the mean and stdDev of the asymmetries of the subtrees at each branch
 * node, assuming binary branches. When branches are trinary or higher, these
 * are considered as nested binary branches, with the smallest subtree as being
 * closest to the soma.
 *
 * @param {Object}   m           A map of branch node vs an array of numeric
 *                               measurements of each of its subtrees.
 * @param {Function} asymmetryFn Given two numeric measurements of two subtrees,
 *                               compute the asymmetry.
 * @returns The mean and standard deviation of the asymmetries, and the
 * histogram with 10 bins and the number of branches (the sum of all bin
 * counts).
 */
Arbor.prototype.asymmetry = function(m, asymmetryFn) {
  var branches = Object.keys(m),
      len = branches.length,
      asym = [],
      sum = 0,
      descending = function(a, b) { return a === b ? 0 : (a < b ? 1 : -1); };

  for (var i=0; i<len; ++i) {
    // Sorted from large to small
    var subtrees = m[branches[i]];
    if (2 === subtrees.length) {
      var value = asymmetryFn(subtrees[0], subtrees[1]);
      sum += value;
      asym.push(value);
    } else {
      // Branch splits into more than 2
      // Sort from large to small
      subtrees.sort(descending);
      var last = subtrees[0];
      for (var k=1; k<subtrees.length; ++k) {
        var sub = subtrees[k];
        // Equation 1 in Uylings and van Pelt, 2002:
        var value = asymmetryFn(last, sub);
        sum += value;
        asym.push(value);
        // Accumulate for next iteration
        last += sub;
      }
    }
  }

  // Beware that asym.length !== len
  var mean = sum / asym.length,
      histogram = new Float64Array(10),
      sumSqDiffs = 0;

  for (var i=0; i<asym.length; ++i) {
    var value = asym[i],
        index = (value * 10) | 0;
    if (10 === index) index = 9 | 0;
    histogram[index] += 1;
    //
    sumSqDiffs += Math.pow(value - mean, 2);
  }

  return {mean: mean,
          histogram: histogram,
          n_branches: asym.length,
          stdDev: Math.sqrt(sumSqDiffs / asym.length)};
};


/**
 * Mean of all "partition asymmetries" at each branch node, as defined by van
 * Pelt et al. 1992.  Considers trinary and higher as nested binary branches,
 * with the smallest subtree as being the closest to the soma.
 *
 * After:
 *  - van Pelt et al. 1992. "Tree asymmetry--a sensitive and practical measure
 *    for binary topological trees.
 *  - Uylings and van Pelt. 2002. Measures for quantifying dendritic
 *    arborizations.
 *
 * @returns the average and standard deviation of the distribution of
 * asymmetries at each branch.
 */
Arbor.prototype.asymmetryIndex = function() {
  return this.asymmetry(
      this.subtreesEndCount(),
      function(sub1, sub2) {
        // Equation 1 in Uylings and van Pelt, 2002:
        return sub1 === sub2 ? 0 : Math.abs(sub1 - sub2) / (sub1 + sub2 - 2);
      });
};

/**
 * Mean of all asymmetries in the measurement of cable lengths of subtrees at
 * each branch node.  Considers trinary and higher as nested binary branches,
 * with the smallest subtree as being the closest to the soma.  positions: map
 * of node vs THREE.Vector3.
 * 
 * @returns the average and standard deviation of the distribution of
 * asymmetries at each branch.
 */
Arbor.prototype.cableAsymmetryIndex = function(positions) {
  return this.asymmetry(
      this.subtreesCable(positions),
      function(sub1, sub2) {
        return sub1 === sub2 ? 0 : Math.abs(sub1 - sub2) / (sub1 + sub2);
      });
};

/**
 * Mean of all asymmetries in the counts of load (e.g. input synapses) of
 * subtres at each branch node.  Considers trinary and higher as nested binary
 * branches, with the smallest subtree as being the closest to the soma.  load:
 * map of node vs counts at node. Nodes with a count of zero do not need to be
 * present.  Returns the average and standard deviation of the distribution of
 * asymmetries at each branch.
 */
Arbor.prototype.loadAsymmetryIndex = function(load) {
  return this.asymmetry(
      this.subtreesLoad(load),
      function(sub1, sub2) {
        return sub1 === sub2 ? 0 : Math.abs(sub1 - sub2) / (sub1 + sub2);
      });
};

// Note: could compute all the asymmetries in one pass, by generalizing the
// asymmetry function to return the list of asymmetries instead of computing the
// mean and std. Then, a multipurpose function could do all desired measurements
// (this would already work with subtreesMeasurements), and the mean and stdDev
// could be computed for all.


/**
 * Remove terminal segments when none of their nodes carries a load (e.g. a
 * synapse).
 */
Arbor.prototype.pruneBareTerminalSegments = function(load) {
  var be = this.findBranchAndEndNodes(),
      ends = be.ends,
      branches = be.branches;
  ends.forEach(function(node) {
    var path = [];
    while (undefined === branches[node]) {
      if (undefined !== load[node]) return;
      path.push(node);
      node = this[node]; // parent
    }
    path.forEach(function(node) { delete this[node]; }, this);
  }, this.edges);
};

/**
 * Prune the arbor at all the given nodes, inclusive.
 * nodes: a map of nodes vs not undefined.
 * Returns a map of removed nodes vs true values.
 */
Arbor.prototype.pruneAt = function(nodes) {
  // Speed-up special case
  if (undefined !== nodes[this.root]) {
    var removed = this.nodes();
    this.root = null;
    this.edges = {};
    return removed;
  }
  
  var up = this.upstreamArbor(nodes),
      cuts = Object.keys(nodes),
      removed = {},
      arr = this.nodesArray();
  for (let i=0; i<cuts.length; ++i) {
    delete up.edges[cuts[i]];
  }
  for (let i=0; i<arr.length; ++i) {
    if (!up.contains(arr[i])) {
      removed[arr[i]] = true;
    }
  }
  this.edges = up.edges;
  return removed;
};

/**
 * Find the nearest upstream node common to all given nodes.  nodes: a map of
 * nodes vs not undefined.  Runs in less than O(n).
 */
Arbor.prototype.nearestCommonAncestor = function(nodes) {
  // Corner cases
  if (null === this.root) return null;
  if (undefined !== nodes[this.root]) return this.root;

  var open = Object.keys(nodes),
      n_nodes = open.length,
      seen = {};

  if (0 === n_nodes) return null;
  if (1 === n_nodes) return open[0];

  for (var i=0; i<n_nodes; ++i) {
    var node = open[i];
    do {
      var count = seen[node];
      if (count) {
        ++count;
        if (count === n_nodes) return node;
        seen[node] = count;
      } else {
        seen[node] = 1;
      }
      node = this.edges[node]; // parent
    } while (undefined !== node);
  }
};

/**
 * Returns an array of Arbor instances.  Each Arbor contains a subset of the
 * given array of nodes.  If all given nodes are connected will return a single
 * Arbor.
 */
Arbor.prototype.connectedFractions = function(nodes) {
  var members = {},
      arbors = {},
      seen = {};

  for (var i=0; i<nodes.length; ++i) {
    members[nodes[i]] = true;
  }

  for (var i=0; i<nodes.length; ++i) {
    var node = nodes[i];
    if (seen[node]) continue;
    if (!this.contains(node)) continue;
    var p = new Arbor(),
        p_root = node;
    p.root = node;
    arbors[node] = p;
    var paren = this.edges[node];
    while (members[paren]) {
      seen[paren] = true;
      var p2 = arbors[paren];
      if (p2) {
        $.extend(p2.edges, p.edges);
        p2.edges[node] = paren;
        delete arbors[p_root];
        p_root = paren;
        p = p2;
      } else {
        p.edges[node] = paren;
        p.root = paren;
      }
      node = paren;
      paren = this.edges[paren];
    }
  }

  return Object.keys(arbors).map(function(node) { return arbors[node]; });
};

/**
 * Return a new Arbor that contains nodes from root all the way to either end
 * nodes or the nodes found in the cuts map.
 */
Arbor.prototype.upstreamArbor = function(cuts) {
  var up = new Arbor(),
      successors = this.allSuccessors(),
      open = successors[this.root].slice(0); // clone
  up.root = this.root;
  while (open.length > 0) {
    var node = open.pop(),
        paren = this.edges[node];
    up.edges[node] = paren;
    if (cuts[node]) continue;
    var succ = successors[node];
    for (var i=0; i<succ.length; ++i) open.push(succ[i]);
  }
  return up;
};

/**
 * Given a set of nodes to keep, create a new Arbor with only the nodes to keep
 * and the branch points between them.
 */
Arbor.prototype.simplify = function(keepers) {
  // Reroot a copy at the first keeper node
  var copy = this.clone(),
      pins = Object.keys(keepers);
  copy.reroot(pins[0]);

  // Find child->parent paths between keeper nodes
  var edges = copy.edges,
      branches = copy.findBranchNodes(),
      seen = {},
      paths = [],
      root = null;

  for (var k=0; k<pins.length; ++k) {
    var node = pins[k],
        paren = edges[node],
        path = [node],
        child = node;
    // Each path starts and ends at a keeper node,
    // and may contain branch nodes in the middle.
    while (paren) {
      if (keepers[paren]) {
        path.push(paren);
        paths.push(path);
        break;
      }
      if (branches[paren]) {
        path.push(paren);
        var s = seen[paren];
        if (!s) {
          s = {};
          seen[paren] = s;
        }
        s[child] = true;
      }
      child = paren;
      paren = edges[paren];
    }
  }

  var simple = new Arbor();
  simple.root = copy.root;

  // Branch nodes are added only if they have been seen
  // from more than one of their child slabs.
  for (var k=0; k<paths.length; ++k) {
    var path = paths[k],
        child = path[0];
    for (var i=1; i<path.length-1; ++i) {
      var branch = path[i];
      if (Object.keys(seen[branch]).length > 1) {
        simple.edges[child] = branch;
        child = branch;
      }
    }
    simple.edges[child] = path[path.length -1];
  }
  return simple;
};

/**
 * Given source nodes and target nodes, find for each source node the nearest
 * target node.
 *
 * @param {Function} distanceFn A function that takes two nodes as arguments and
 *                              returns a number. If targets is empty will
 *                              return Number.MAX_VALUE for each source.
 */
Arbor.prototype.minDistancesFromTo = function(sources, targets, distanceFn) {
  var neighbors = this.allNeighbors(),
      distances = {},
      sourceIDs = Object.keys(sources);

  // Breadth-first search starting from each source node
  for (var i=0; i<sourceIDs.length; ++i) {
    var source = sourceIDs[i];
    // Maybe source and target coincide
    if (targets[source]) {
      distances[source] = 0;
      continue;
    }
    // Else grow breadth-first
    var surround = neighbors[source],
        circle = new Array(surround.length),
        min = Number.MAX_VALUE;
    for (var k=0; k<circle.length; ++k) {
      circle[k] = {child: surround[k],
                   paren: source,
                   dist: 0}; // cummulative distance
    }
    while (true) {
      var next = []; // reset
      // Iterate through nodes of one circle
      for (var k=0; k<circle.length; ++k) {
        var t = circle[k],
            d = t.dist + distanceFn(t.child, t.paren);
        if (d > min) continue; // terminate exploration in this direction
        if (targets[t.child]) {
          if (d < min) min = d;
          // terminate exploration in this direction
          continue;
        }
        // Else, grow the next circle
        var s = neighbors[t.child];
        for (var j=0; j<s.length; ++j) {
          if (t.paren == s[j]) continue; // == and not === so that numbers and "numbers" can be compared properly
          next.push({child: s[j],
                     paren: t.child,
                     dist: d});
        }
      }
      if (!next || 0 === next.length) {
        distances[source] = min;
        break;
      }
      circle = next;
    }
  }

  return distances;
};

/**
 * Return a map of nodes within a max distance of the source node.  The map has
 * node ID as keys and distance to source as values.
 */
Arbor.prototype.findNodesWithin = function(source, distanceFn, max_distance) {
  var neighbors = this.allNeighbors(),
      within = {},
      open = [source, 0];
  while (open.length > 0) {
    var node = open.shift(),
        dist = open.shift(),
        s = neighbors[node];
    within[node] = dist;
    if (s) {
      for (var i=0; i<s.length; ++i) {
        var next = s[i];
        if (within[next]) continue; // seen
        var d = dist + distanceFn(node, next);
        if (d > max_distance) continue;
        open.push(next);
        open.push(d);
      }
    }
  }
  return within;
};

/**
 * Split the arbor into a list of Arbor instances, by cutting at each node in
 * the cuts map (which contains node keys and truthy values).  The cut is done
 * by severing the edge between an node and its parent, so a cut at the root
 * node has no effect, but cuts at end nodes result in single-node Arbor
 * instances (just root, no edges).
 */
Arbor.prototype.split = function(cuts) {
  var be = this.findBranchAndEndNodes(),
      ends = be.ends,
      branches = be.branches,
      junctions = {},
      fragments = [];

  var CountingArbor = function() {
    this.root = null;
    this.edges = {};
    this._n_nodes = 0;
  };

  CountingArbor.prototype = Arbor.prototype;

  var asArbor = function(carbor) {
    var arbor = new Arbor();
    arbor.root = carbor.root;
    arbor.edges = carbor.edges;
    return arbor;
  };

  var open = new Array(ends.length);
  for (var k=0; k<ends.length; ++k) {
    var arbor = new CountingArbor();
    arbor.root = ends[k];
    arbor._n_nodes = 1;
    open[k] = arbor;
  }

  while (open.length > 0) {
    var arbor = open.shift(),
        node = arbor.root,
        paren,
        n_successors;
    do {
      var paren = this.edges[node];
      if (undefined === paren) break; // reached root: cannot cut even if in cuts

      if (cuts[node]) {
        arbor.root = node;
        fragments.push(asArbor(arbor));
        arbor = new CountingArbor();
        arbor.root = paren;
        arbor._n_nodes = 1;
      } else {
        arbor.edges[node] = paren;
        arbor._n_nodes += 1;
        // Note arbor.root is now obsolete
      }
      n_successors = branches[paren];
      node = paren;
    } while (undefined === n_successors);

    arbor.root = node;

    if (undefined === paren && undefined === branches[node]) {
      // Reached root and root is not a branch
      fragments.push(asArbor(arbor));
    } else {
      var junction = junctions[node];
      if (undefined === junction) {
        // First time this branch node has been reached
        junctions[node] = [arbor];
      } else {
        if (junction.length === n_successors -1) {
          // Find largest
          var max_nodes = arbor._n_nodes;
          for (var k=0; k<junction.length; ++k) {
            var a = junction[k];
            if (a._n_nodes > max_nodes) {
              junction[k] = arbor;
              max_nodes = a._n_nodes;
              arbor = a;
            }
          }
          // Merge arbors
          var ae = arbor.edges;
          for (var k=0; k<junction.length; ++k) {
            var a = junction[k];
            var edges = a.edges;
            var children = Object.keys(edges);
            for (var i=0; i<children.length; ++i) {
              var child = children[i];
              ae[child] = edges[child];
            }
            arbor._n_nodes += a._n_nodes -1;
          }
          // Prepare next round of growth if appropriate
          if (node === this.root) {
            // root is branched
            fragments.push(asArbor(arbor));
          } else if (cuts[node]) {
            fragments.push(asArbor(arbor));
            arbor = new CountingArbor();
            arbor.root = this.edges[node];
            arbor._n_nodes = 1;
            open.push(arbor);
          } else {
            open.push(arbor);
          }
        } else {
          junction.push(arbor);
        }
      }
    }
  }

  return fragments;
};

/**
 * Return an array of treenode IDs corresponding each to the first node of a
 * twig that is not part of the backbone, approximating the roots by using the
 * strahler number.
 */
Arbor.prototype.approximateTwigRoots = function(strahler_cut) {
  // Approximate by using Strahler number:
  // the twig root will be at the first parent
  // with a Strahler number larger than strahler_cut
  var strahler = this.strahlerAnalysis(),
      ends = this.findBranchAndEndNodes().ends,
      edges = this.edges,
      roots = [],
      seen = {};
  for (var i=0, l=ends.length; i<l; ++i) {
    var child = ends[i],
        paren = edges[child];
    do {
      if (seen[paren]) break;
      if (strahler[paren] > strahler_cut) {
        roots.push(child);
        break;
      }
      seen[paren] = true;
      child = paren;
      paren = edges[paren];
    } while (paren);
  }
  return roots;
};

/**
 * Modify the passed in positions by walking down the arbor and check each
 * position if it should be interpolated. If so the respective coordinate is
 * updated.
 *
 * @returns A mapping of interpolated nodes to their original locations.
 */
Arbor.prototype.interpolatePositions = function(positions, interpolatableX,
    interpolatableY, interpolatableZ) {
  let successors = this.allSuccessors();
  let nodes = this.childrenArray();
  let averageChildPosition = { 'x': 0, 'y': 0, 'z': 0 };
  let interpolatedNodes = new Map();
  interpolatableX = interpolatableX && interpolatableX.length > 0 ? interpolatableX : false;
  interpolatableY = interpolatableY && interpolatableY.length > 0 ? interpolatableY : false;
  interpolatableZ = interpolatableZ && interpolatableZ.length > 0 ? interpolatableZ : false;

  for (let i=0, imax=nodes.length; i<imax; ++i) {
    let nodeId = Number(nodes[i]);
    let position = positions[nodeId],
        nodeX = position.x, nodeY = position.y,
        nodeZ = position.z;

    let interpolateX = false, interpolateY = false, interpolateZ = false;

    if (interpolatableX) {
      for (let ix=0, ixmax=interpolatableX.length; ix<ixmax; ++ix) {
        let x = interpolatableX[ix];
        if (Math.abs(nodeX - x) < 0.0001) {
          interpolateX = true;
          break;
        }
      }
    }

    if (interpolatableY) {
      for (let iy=0, iymax=interpolatableY.length; iy<iymax; ++iy) {
        let y = interpolatableY[iy];
        if (Math.abs(nodeY - y) < 0.0001) {
          interpolateY = true;
          break;
        }
      }
    }

    if (interpolatableZ) {
      for (let iz=0, izmax=interpolatableZ.length; iz<izmax; ++iz) {
        let z = interpolatableZ[iz];
        if (Math.abs(nodeZ - z) < 0.0001) {
          interpolateZ = true;
          break;
        }
      }
    }

    // If no interpolation needs to be done for this node, continue with next
    // node.
    if (!(interpolateX || interpolateY || interpolateZ)) {
      continue;
    }

    let children = successors[nodeId];
    if (!children || children.length === 0) {
      continue;
    }

    // Find an average child position
    averageChildPosition.x = 0;
    averageChildPosition.y = 0;
    averageChildPosition.z = 0;
    for (let j=0; j<children.length; ++j) {
      let childId = children[j];
      let childPosition = positions[childId];
      averageChildPosition.x += childPosition.x;
      averageChildPosition.y += childPosition.y;
      averageChildPosition.z += childPosition.z;
    }
    averageChildPosition.x = averageChildPosition.x / children.length;
    averageChildPosition.y = averageChildPosition.y / children.length;
    averageChildPosition.z = averageChildPosition.z / children.length;

    // If this node is the root node, use the child information
    let parentId = this.edges[nodeId];
    let parentPosition;
    if (!parentId || parentId == nodeId) {
      parentPosition = averageChildPosition;
    } else {
      parentPosition = positions[parentId];
    }

    // Store original location
    interpolatedNodes.set(nodeId, position.clone());

    if (interpolatableX) {
      position.setY((averageChildPosition.y + parentPosition.y) * 0.5);
      position.setZ((averageChildPosition.z + parentPosition.z) * 0.5);
    }

    if (interpolatableY) {
      position.setX((averageChildPosition.x + parentPosition.x) * 0.5);
      position.setZ((averageChildPosition.z + parentPosition.z) * 0.5);
    }

    if (interpolatableZ) {
      position.setX((averageChildPosition.x + parentPosition.x) * 0.5);
      position.setY((averageChildPosition.y + parentPosition.y) * 0.5);
    }
  }

  return interpolatedNodes;
};

/**
 * Will find terminal branches whose end node is tagged with "not a branch" and
 * remove them from the arbor, providing a callback function for every removed
 * node.  tags: a map of tag name vs array of nodes with that tag, as retrieved by
 * compact-arbor or compact-skeleton.
 */
Arbor.prototype.collapseArtifactualBranches = function(tags, callback) {
  var notabranch = tags['not a branch'];
  if (undefined === notabranch) return;
  var be = this.findBranchAndEndNodes(),
      ends = be.ends,
      branches = be.branches,
      edges = this.edges,
      tagged = {};
  for (var i=0; i<notabranch.length; ++i) {
      tagged[notabranch[i]] = true;
  }
  callback = callback || CATMAID.noop;
  for (var i=0; i<ends.length; ++i) {
      var node = ends[i];
      if (tagged[node]) {
          let removedNodes = [];
          while (node && !branches[node]) {
              removedNodes.push(node);
              // Continue to parent
              var paren = edges[node];
              delete edges[node];
              node = paren;
          }
          // node is now the branch node, or null for a neuron without branches
          if (!node) node = this.root;

          callback(node, removedNodes);
      }
  }
};
