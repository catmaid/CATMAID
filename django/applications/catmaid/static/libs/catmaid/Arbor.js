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
			this.edges[accessor(edges[i])] = accessor(edges[i+1]);
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
Arbor.prototype.flowCentrality = function(outputs, inputs) {
    var totalOutputs = Object.keys(outputs).reduce(function(sum, node) {
        return sum + outputs[node];
    }, 0);

    var totalInputs = Object.keys(inputs).reduce(function(sum, node) {
        return sum + inputs[node];
    }, 0);

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
