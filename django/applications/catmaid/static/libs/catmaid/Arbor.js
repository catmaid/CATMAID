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
	arbor.edges = Object.create(this.edges);
	return arbor;
};

/** edges: an array where every consecutive pair of nodes defines an edge from parent
 * to child. Every edge implictly adds its nodes.
 * Assumes that the newly created edges will somewhere intersect with the existing
 * ones, if any. Otherwise the tree will have multiple disconnected subtrees and
 * not operate according to expectations.
 * Returns this. */
Arbor.prototype.addEdges = function(edges, accessor) {
	var length = edges.length;
	if (accessor) {
		for (var i=0; i<length; i+=2) {
			// Add edge from child to parent
			this.edges[accessor(edges[i])] = accessor(edges[i+1]);
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

/** path: an array of nodes where every node is the child of its predecessor node.
 * Sets the root node to path[0] if the latter doesn't exist in this.edges (i.e. if
 * it does not have a parent node).
 * Assumes that the newly created edges will somewhere intersect with the existing
 * ones, if any. Otherwise the tree will have multiple disconnected subtrees and
 * not operate according to expectations.
 * Returns this. */
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

/** Compare node using == and not ===, allowing for numbers to be nodes. */
Arbor.prototype.contains = function(node) {
	return node == this.root || this.edges.hasOwnProperty(node);
};

/** Assumes there is only one root: one single node without a parent.
 * Returns the root node, or nothing if the tree has a structural error (like a loop)
 * and no root node could be found. */
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

/** Assumes new_root belongs to this Arbor.
 *  Returns this. */
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

/** Returns an array with all end nodes, in O(3*n) time.
 * Does not include the root node. */
Arbor.prototype.findEndNodes = function() {
	var edges = this.edges,
	    children = Object.keys(edges),
	    parents = children.reduce(function(o, child) {
	      o[edges[child]] = true;
	      return o;
	    }, {});

	return children.reduce(function(a, child) {
		if (child in parents) return a;
		a.push(child);
		return a;
	}, []);
};

/** Return an object with parent node as keys and arrays of children as values.
 * End nodes have empty arrays. */
Arbor.prototype.allSuccessors = function() {
	var edges = this.edges,
			children = Object.keys(edges);
	// Handle corner cases
	if (0 === children.length) {
		if (this.root) {
			var a = {};
			a[this.root] = [];
			return a;
		}
		return {};
	}
	return children.reduce(function(o, child) {
		var paren = edges[child],
			  children = o[paren];
	  if (children) children.push(child);
		else o[paren] = [child];
		if (!(child in o)) o[child] = [];
		return o;
	}, {});
};

/** Finds the next branch node, starting at node (inclusive).
 *  Assumes the node belongs to the arbor.
 *  Returns null when no branches are found. */
Arbor.prototype.nextBranchNode = function(node) {
  var all_succ = this.allSuccessors(),
      succ  = all_succ[node];
  while (1 === succ.length) {
    node = succ[0];
    succ = all_succ[node];
  }
  if (all_succ[node].length > 1) return node;
  return null;
};

/** Return an object with each nodes as keys and arrays of children plus the parent as values, or an empty array for an isolated root node. Runs in O(2n) time.*/
Arbor.prototype.allNeighbors = function() {
	var edges = this.edges,
			nodes = Object.keys(edges); // except the root
	// Handle corner cases
	if (0 === nodes.length) {
		if (this.root) {
			var a = {};
			a[this.root] = [];
			return a;
		}
		return {};
	}
	return nodes.reduce(function(o, node) {
		var paren = edges[node], // always exists in well-formed arbors; root node not included in nodes
		    neighbors = o[node],
				paren_neighbors = o[paren];
	  // Add paren as neighbor of node
	  if (neighbors) neighbors.push(paren);
		else o[node] = [paren];
		// Add node as neighbor of parent
		if (paren_neighbors) paren_neighbors.push(node);
		else o[paren] = [node];
		return o;
	}, {});
};

/** Find branch and end nodes in O(4*n) time. */
Arbor.prototype.findBranchAndEndNodes = function() {
	var edges = this.edges,
			children = Object.keys(edges),
			parents = children.reduce(function(o, child) {
				o[edges[child]] = 0;
				return o;
			}, {}),
			ends = [];

	children.forEach(function(node) {
		parents[this.edges[node]] += 1;
		if (!(node in parents)) ends.push(node);
	}, this);

	return {ends: ends,
		branching: Object.keys(parents).filter(function(k) { return parents[k] > 1; })};
};

/** Returns an array with all branch nodes. Runs in O(n + m) time,
 * where n is the number of nodes and m the number of branches. */
Arbor.prototype.findBranchNodes = function() {
	var successors = this.allSuccessors(),
			node_ids = Object.keys(successors);
	// Handle corner case
	if (0 === node_ids.length) return [];
	return node_ids.filter(function(node) {
		return successors[node].length > 1;
	});
};

/** Return a map of node vs topological distance from the given root. Rather than a distance, these are the hierarchical orders, where root has order 0, nodes directly downstream of root have order 1, and so on. Invoke with this.root as argument to get the distances to the root of this Arbor. Invoke with any non-end node to get distances to that node for nodes downstream of it. */
Arbor.prototype.nodesOrderFrom = function(root) {
	return this.nodesDistanceTo(root, function() { return 1; }).distances;
};

/** Measure distance of every node to root in O(2n), by using the given
 * distanceFn which takes two nodes (child and parent) as arguments and returns a number.
 * Returns an object containing the distances and the maximum distance. */
Arbor.prototype.nodesDistanceTo = function(root, distanceFn) {
	var distances = {},
	    r = {distances: distances,
	         max: 0};

	// Handle corner case:
	if (!root) return r;

	var successors = this.allSuccessors(),
			open = [[root, 0]],
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

/** Return an Object with node keys and true values, in O(2n) time. */
Arbor.prototype.nodes = function() {
	var nodes = Object.keys(this.edges).reduce(function(o, child) {
		o[child] = true;
		return o;
	}, {});
	nodes[this.root] = true;
	return nodes;
};

/** Return an Array of all nodes in O(n) time. */
Arbor.prototype.nodesArray = function() {
	var nodes = Object.keys(this.edges);
	nodes.push(this.root);
	return nodes;
};

/** Counts number of nodes in O(n) time. */
Arbor.prototype.countNodes = function() {
	return Object.keys(this.edges).length + (this.root ? 1 : 0);
};

/** Returns an array of arrays, unsorted, where the longest array contains the linear
 * path between the furthest end node and the root node, and all other arrays are shorter
 * paths always starting at an end node and finishing at a node already included in
 * another path. Runs in O(4n + nlog(n)) time. */
Arbor.prototype.partition = function() {
	var ends = this.findEndNodes(),
	    distances = this.nodesOrderFrom(this.root),
	    seen = {};

	// Sort nodes by distance to root, so that the first end node is the furthest
	return ends.sort(function(a, b) {
		var da = distances[a],
		    db = distances[b];
		return da === db ? 0 : (da < db ? 1 : -1);
	}).map(function(child) {
		// Iterate nodes sorted from highest to lowest distance to root
		var sequence = [child],
				paren = this.edges[child];
	  while (paren) {
			sequence.push(paren);
			if (seen[paren]) break;
			seen[paren] = true;
			paren = this.edges[paren];
		}
		return sequence;
	}, this);
};

/** Like this.partition, but returns the arrays sorted by length from small to large. */
Arbor.prototype.partitionSorted = function() {
	return this.partition().sort(function(a, b) {
		var da = a.length,
		    db = b.length;
		return da === db ? 0 : (da < db ? -1 : 1);
	});
};

/** Returns an array of child nodes in O(n) time.
 * See also this.allSuccessors() to get them all in one single shot at O(n) time. */
Arbor.prototype.successors = function(node) {
	var edges = this.edges;
	return Object.keys(edges).reduce(function(a, child) {
		if (edges[child] === node) a.push(child);
		return a;
	}, []);
};

/** Returns an array of child nodes plus the parent node in O(n) time.
 * See also this.allNeighbors() to get them all in one single shot at O(2n) time. */
Arbor.prototype.neighbors = function(node) {
	var edges = this.edges,
			paren = this.edges[node];
	return Object.keys(edges).reduce(function(a, child) {
		if (edges[child] === node) a.push(child);
		return a;
	}, undefined === paren ? [] : [paren]);
};

/** Return a new Arbor that has all nodes in the array of nodes to preserve,
 * rerooted at the node in keepers that has the lowest distance to this arbor's
 * root node. */
Arbor.prototype.spanningTree = function(keepers) {
	var spanning = new Arbor();

	if (1 === keepers.length) {
		spanning.root = keepers[0];
		return spanning;
	}

	var arbor = this;
	if (this.successors(this.root).length > 1) {
		// Root has two children. Reroot a copy at the first end node found
		arbor = this.clone().reroot(this.findEndNodes()[0])
	}

	var n_seen = 0,
			preserve = keepers.reduce(function(o, node) {
				o[node] = true;
				return o;
			}, {}),
			n_preserve = keepers.length;

	// Start from the shortest sequence
	arbor.partitionSorted().some(function(seq) {
		var path = [];
		seq.some(function(node) {
			if (node in preserve) {
				path.push(node);
				if (!spanning.contains(node)) ++n_seen;
				if (n_preserve === n_seen) return true; // terminate 'some node'
			} else if (path.length > 0) path.push(node);
			return false;
		});
		if (path.length > 0) {
			// Add path in reverse: the same orientation as in this arbor,
			// to ensure any one node will only have one parent.
			spanning.addPathReversed(path);
			var last = path[path.length -1];
			if (seq[0] == last) { // == and not ===, in case nodes are numbers, which are turned into strings when used as Object keys. Same performance as === for same type.
				preserve[last] = true;
				++n_preserve;
			}
		}
		return n_preserve === n_seen; // if true, terminate 'some seq'
	});

	return spanning;
};

/** Compute betweenness centrality of a tree in O(5n) time.
 * Note that edges are considered non-directional, that is,
 * this is the betweenness centrality of the equivalent undirected graph of the tree.
 * This implementation relies on trees having non-duplicate directed edges and no loops.
 * All edges are considered equal, and endpoints are included.
 * Returns a map of node vs number of paths traveling through the node. */
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

/** Return a new arbor that preserves only the root, branch and end nodes.
 * Runs in O(2*n) time. */
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

/** Return an array of arrays, each subarray containing the nodes of a slab,
 * including the initial node (root or a branch node ) and the ending node
 * (a branch node or an end node). */
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

/** Compute the centrality of each slab as the average centrality of its starting
 * and ending nodes, when computing the centrality of the topologically reduced
 * arbor (an arbor that only preserves root, branch and end nodes relative to the
 * original).
 * Returns an object with nodes as keys and the centrality as value.
 * At the branch nodes, the centrality is set to that of the parent slab;
 * for root, it is always zero. */
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

/** Return a new Arbor which is a shallow copy of this Arbor, starting at node. */
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
		paren = open.shift(), // faster than pop
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

/** Return a map of node vs amount of arbor downstream of the node,
 * where the amountFn is a function that takes two arguments: parent and child.
 * To obtain a map of node vs number of nodes downstream, amountFn is a function
 * that returns the value 1. For cable, amountFn returns the length of the cable
 * between parent and child.
 * If normalize is defined and true, all values are divided by the maximum value,
 * which is the value at the root node. */
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

/** Return a map of node vs branch index relative to root. Terminal branches
 * have an index of 1, their parent branches of 2, etc., all the way too root.
 * The maximum number is that of the root branch.
 */
Arbor.prototype.strahlerAnalysis = function() {
    var edges = this.edges,
        children = Object.keys(edges),
        parents = children.reduce(function(o, child) {
            var n_children = o[edges[child]];
            o[edges[child]] = undefined === n_children ? 1 : n_children + 1;
            return o;
        }, {}),
        ends = children.filter(function(child) { return !parents[child]; }),
        open = ends,
        strahler = ends.reduce(function(o, node) {
            o[node] = 1;
            return o;
        }, {});

    while (open.length > 0) {
        var node = ends.pop(),
            index = strahler[node],
            paren = edges[node];
        while (undefined !== paren) { // a node could be the number 0, which is falsy
            if (parents[paren] > 1) {
                // is a branch node
                if (strahler[paren]) break; // already seen
                strahler[paren] = index + 1;
                open.push(paren);
                break;
            } else {
                strahler[paren] = index;
                // Next iteration:
                paren = edges[paren];
            }
        }
    }

    return strahler;
};


/**
 * Perform Sholl analysis: returns two arrays, paired by index, of radius length and the corresponding number of cable crossings,
 * sampled every radius_increment.
 *
 * E.g.:
 *
 * {radius:   [0.75, 1.5, 2.25, 3.0],
 *  crossings:[   3,   2,    1,   1]}
 *
 * A segment of cable defined two nodes that hold a parent-child relationship is considered to be crossing a sampling radius if the distance from the center for one of them is beyond the radius, and below for the other.
 *
 * Notice that if parent-child segments are longer than radius-increment in the radial direction, some parent-child segments will be counted more than once, which is correct.
 *
 * radius_increment: distance between two consecutive samplings.
 * distanceToCenterFn: determines the distance of a node from the origin of coordinates, in the same units as the radius_increment.
 */
Arbor.prototype.sholl = function(radius_increment, distanceToCenterFn) {
    // Create map of radius index to number of crossings.
    // (The index, being an integer, is a far safer key for a map than the distance as floating-point.)
    var indexMap = Object.keys(this.edges).reduce((function(sholl, child) {
        // Compute distance of both parent and child to the center
        // and then divide by radius_increment and find out
        // which boundaries are crossed, and accumulate the cross counts in sholl.
        var paren = this.edges[child],
            dc = this.cache[child],
            dp = this.cache[paren];
        if (undefined === dc) this.cache[child] = dc = distanceToCenterFn(child);
        if (undefined === dp) this.cache[paren] = dp = distanceToCenterFn(paren);
        var index = Math.floor(Math.min(dc, dp) / radius_increment) + 1,
            next = Math.round(Math.max(dc, dp) / radius_increment + 0.5); // proper ceil
        while (index < next) {
            var count = sholl[index];
            if (undefined === count) sholl[index] = 1;
            else sholl[index] += 1;
            ++index;
        }
        return sholl;
    }).bind({edges: this.edges,
             cache: {}}), {});

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
 * computing Sholl for e.g. only branch and end nodes, or only for nodes with synapses.
 *
 * center: an object with a distanceTo method, like THREE.Vector3.
 * radius_increment: difference between the radius of a sphere and that of the next sphere.
 * positions: map of node ID vs objects like THREE.Vector3.
 * fnCount: a function to e.g. return 1 when counting, or the length of a segment when measuring cable.
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

/** Return a map of node vs number of paths from any node in the set of inputs to any node in the set of outputs.
 *  outputs: a map of node keys vs number of outputs at the node.
 *  inputs: a map of node keys vs number of inputs at the node. */
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

    // If the root node is a branch, reroot at the first end node found
    var arbor = this,
        be = arbor.findBranchAndEndNodes();
    if (-1 !== be.branching.indexOf(arbor.root)) {
        arbor = arbor.clone();
        arbor.reroot(be.ends[0]);
    }

    var cs = arbor.nodesArray().reduce(function(o, node) {
        var n_inputs = inputs[node],
            n_outputs = outputs[node];
        o[node] = {inputs: undefined === n_inputs ? 0 : n_inputs,
                   outputs: undefined === n_outputs ? 0 : n_outputs,
                   seenInputs: 0,
                   seenOutputs: 0};
        return o;
    }, {});

    var centrality = {};

    // Traverse all partitions counting synapses seen
    arbor.partitionSorted().forEach(function(partition) {
        var seenI = 0,
            seenO = 0;
        partition.forEach(function(node) {
            var counts = cs[node];
            seenI += counts.inputs + counts.seenInputs;
            seenO += counts.outputs + counts.seenOutputs;
            counts.seenInputs = seenI;
            counts.seenOutputs = seenO;
            var nPossibleIOPaths = counts.seenInputs  * (totalOutputs - counts.seenOutputs)
                                 + counts.seenOutputs * (totalInputs - counts.seenInputs);
            centrality[node] = nPossibleIOPaths / totalOutputs;
        });
    });

    return centrality;
};

/**
 * positions: map of node ID vs objects like THREE.Vector3.
 */
Arbor.prototype.cableLength = function(positions) {
    return Object.keys(this.edges).reduce((function(sum, node) {
        return sum += positions[node].distanceTo(positions[this[node]]);
    }).bind(this.edges), 0);
};

/** Sum the cable length by smoothing using a Gaussian convolution.
 * For simplicity, considers the root, all branch and end nodes as fixed points,
 * and will only therefore adjust slab nodes.
 * - positions: map of node ID vs objects like THREE.Vector3.
 * - sigma: for tracing neurons, use e.g. 100 nm
 * - initialValue: initial value for the reduce to accumulate on.
 * - slabInitFn: take the accumulator value, the node and its point, return a new accumulator value.
 * - accumulatorFn: given an accumulated value, the last point, the node ID and its new point, return a new value that will be the next value in the next round.
 */
Arbor.prototype.convolveSlabs = function(positions, sigma, initialValue, slabInitFn, accumulatorFn) {
    // Gaussian:  a * Math.exp(-Math.pow(x - b, 2) / (2 * c * c)) + d 
    // where a=1, d=0, x-b is the distance to the point in space, and c is sigma=0.5.
    // Given that the distance between points is computed as the sqrt of the sum of the squared differences of each dimension, and it is then squared, we can save two ops: one sqrt and one squaring, to great performance gain.
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
            // TODO: or use the _gaussianWeights one-pass computation. Need to measure what is faster: to create a bunch of arrays or to muliply multiple times the same values.
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

Arbor.prototype.smoothCableLength = function(positions, sigma) {
    return this.convolveSlabs(positions, sigma, 0,
            function(sum, id, p) {
                return sum;
            },
            function(sum, p0, id, p1) {
                return sum + p0.distanceTo(p1);
            });
};

Arbor.prototype.smoothPositions = function(positions, sigma) {
    return this.convolveSlabs(positions, sigma, {},
            function(s, id, p) {
                s[id] = p;
                return s;
            },
            function(s, p0, id, p1) {
                s[id] = p1;
                return s;
            });
};

/** Resample the arbor to fix the node interdistance to a specific value.
 * The distance of an edge prior to a slab terminating node (branch or end)
 * will most often be within +/- 50% of the specified delta value, given that
 * branch and end nodes are fixed. The root is also fixed.
 *
 * The resampling is done using a Gaussian convolution with adjacent nodes,
 * weighing them by distance to relevant node to use as the focus for resampling,
 * which is the first node beyond delta from the last resampled node.
 *
 * - positions: map of node ID vs THREE.Vector3, or equivalent object with distanceTo and clone methods.
 * - sigma: value to use for Gaussian convolution to smooth the slabs prior to resampling.
 * - delta: desired new node interdistance.
 * - minNeighbors: minimum number of neighbors to inspect; defaults to zero. Aids in situations of extreme jitter, where otherwise spatially close but not topologically adjancent nodes would not be looked at because the prior node would have a Gaussian weight below 0.01.
 *
 * Returns a new Arbor, with new numeric node IDs that bear no relation to the IDs of this Arbor, and a map of the positions of its nodes.  */
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

/** Helper function for resampleSlabs. */
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

        // NOTE: should check which is closer: k or k-1; but when assuming a Gaussian-smoothed arbor, k will be closer in all reasonable situations. Additionally, k (the node past) is the one to drift towards when nodes are too far apart.

        // Collect all nodes before and after k with a weight under 0.01,
        // as precomputed in gw: only weights > 0.01 exist
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

/** Helper function.
 *
 * Starting at the first node, compute the Gaussian weight
 * towards forward in the slab until it is smaller than 1%. Then do the
 * same for the second node, etc. Store all weights in an array per node
 * that has as first element '1' (weight with itself is 1), and then
 * continues with weights for the next node, etc. until one node's weight
 * falls below 0.01.
 *
 * BEWARE that if nodes are extremely jittery, the computation of weights
 * may terminate earlier than would be appropriate. To overcome this,
 * pass a value of e.g. 3 neighbor nodes minimum to look at.
 *
 * Gaussian as: a * Math.exp(-Math.pow(x - b, 2) / (2 * c * c)) + d
 * ignoring a and d, given that the weights will then be used for normalizing
 * 
 * slab: array of node IDs
 * slabP: array of corresponding THREE.Vector3
 * S: 2 * Math.pow(sigma, 2)
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
    if (stops.hasOwnProperty(paren)) return len;
    loc1 = loc2;
    paren = this.edges[paren];
  }
  // Reached root without having found a stop
  return null;
};

/** Compute the amount of able of all terminal slabs together.
 * Returns both the cable and the number of end nodes (equivalent to the number of terminal segments). */
Arbor.prototype.terminalCableLength = function(positions) {
  var be = this.findBranchAndEndNodes(),
      branches = be.branching.reduce(function(o, node) {
        o[node] = true;
        return o;
      }, {}),
      ends = be.ends,
      cable = 0;
  for (var i=0; i<ends.length; ++i) {
    cable += this.distanceToUpstreamNodeIn(ends[i], positions, branches);
  }
  return {cable: cable,
          n_branches: be.branching.length,
          n_ends: ends.length};
};

/** Find path from node to an upstream node that is in stops.
 * If no node in stops is upstrem of node, then returns null.
 * Will traverse towards upstream regardless of whether the initial node belongs to stops or not. */
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

/** For each branch node, record of a measurement for each of its subtrees.
 *
 *  - initialFn: returns the value to start accumulating on.
 *  - accumFn: can alter its accum parameter.
 *  - mergeFn: merge two accumulated values into a new one; must not alter its parameters.
 *
 *  Returns a map of branch node vs array of measurements, one per subtree.
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
 * At each branch node, measure the amount of cable on each of the 2 or more subtrees.
 *
 * positions: map of node vs THREE.Vector3.
 *
 * Returns a map of branch node vs array of values, one for each subtree.
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
 * At each branch node, count the number of terminal ends on each of the 2 or more subtrees.
 * Returns a map of branch node vs array of values, one for each subtree.
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
 * At each branch node, count the number of associated elemennts on each of the 2 or more subtrees.
 * load: map of node vs number of associated elements (e.g. input synapses). Nodes with a count of zero do not need to be present.
 * Returns a map of branch node vs array of values, of for each subtree.
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

/** Compute the mean and stdDev of the asymmetries of the subtrees at each branch node,
 * assuming binary branches. When branches are trinary or higher, these are considered
 * as nested binary branches, with the smallest subtree as being closest to the soma.
 *
 * m: a map of branch node vs an array of numeric measurements of each of its subtrees.
 * asymmetryFn: given two numeric measurements of two subtrees, compute the asymmetry.
 *
 * return: the mean and standard deviation of the asymmetries, and the histogram with 10 bins and the number of branches (the sum of all bin counts).
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


/** Mean of all "partition asymmetries" at each branch node, as defined by van Pelt et al. 1992.
 * Considers trinary and higher as nested binary branches, with the smallest subtree as being the closest to the soma.
 *
 * Returns the average and standard deviation of the distribution of asymmetries at each branch.
 *
 * After:
 *  - van Pelt et al. 1992. "Tree asymmetry--a sensitive and practical measure for binary topological trees.
 *  - Uylings and van Pelt. 2002. Measures for quantifying dendritic arborizations.
 */
Arbor.prototype.asymmetryIndex = function() {
  return this.asymmetry(
      this.subtreesEndCount(),
      function(sub1, sub2) {
        // Equation 1 in Uylings and van Pelt, 2002:
        return sub1 === sub2 ? 0 : Math.abs(sub1 - sub2) / (sub1 + sub2 - 2);
      });
};

/** Mean of all asymmetries in the measurement of cable lengths of subtrees at each branch node.
 * Considers trinary and higher as nested binary branches, with the smallest subtree as being the closest to the soma.
 * positions: map of node vs THREE.Vector3.
 * Returns the average and standard deviation of the distribution of asymmetries at each branch.
 */
Arbor.prototype.cableAsymmetryIndex = function(positions) {
  return this.asymmetry(
      this.subtreesCable(positions),
      function(sub1, sub2) {
        return sub1 === sub2 ? 0 : Math.abs(sub1 - sub2) / (sub1 + sub2);
      });
};

/** Mean of all asymmetries in the counts of load (e.g. input synapses) of subtres at each branch node.
 * Considers trinary and higher as nested binary branches, with the smallest subtree as being the closest to the soma.
 * load: map of node vs counts at node. Nodes with a count of zero do not need to be present.
 * Returns the average and standard deviation of the distribution of asymmetries at each branch.
 *
 */
Arbor.prototype.loadAsymmetryIndex = function(load) {
  return this.asymmetry(
      this.subtreesLoad(load),
      function(sub1, sub2) {
        return sub1 === sub2 ? 0 : Math.abs(sub1 - sub2) / (sub1 + sub2);
      });
};

// Note: could compute all the asymmetries in one pass, by generalizing the asymmetry function to return the list of asymmetries instead of computing the mean and std. Then, a multipurpose function could do all desired measurements (this would already work with subtreesMeasurements), and the mean and stdDev could be computed for all.


/** Remove terminal segments when none of their nodes carries a load (e.g. a synapse). */
Arbor.prototype.pruneBareTerminalSegments = function(load) {
  var be = this.findBranchAndEndNodes(),
      ends = be.ends,
      branches = be.branching.reduce(function(o, node) { o[node] = true; return o; }, {});
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
