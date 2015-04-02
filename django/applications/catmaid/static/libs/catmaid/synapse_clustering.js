/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * arbor: an instance of Arbor: each node is a treenode ID.
 * locations: map of treenode ID vs Vector3.
 * synapses: map of treenode ID vs list of pairs {type, connector_id}, where type 0 is presynaptic and type 1 is postsynaptic.
 *
 * Computes and stores as members the Arbor partitions and the distance map.
 */
var SynapseClustering = function(arbor, locations, synapses, lambda) {
  this.arbor = arbor;
  this.synapses = synapses;
  this.lambda = lambda;
  // List of lists of treenode IDs, sorted from smaller to larger lists
  this.partitions = arbor.partitionSorted();

  var distanceFn = (function(child, paren) {
    return this[child].distanceTo(this[paren]);
  }).bind(locations);

  // Map of treenode ID vs calibrated distance to the root node
  this.distancesToRoot = arbor.nodesDistanceTo(arbor.root, distanceFn).distances;
  // A map of treenode ID vs list of calibrated distances to synapses. In other words, the return value of function distanceMap.
  this.Ds = this.distanceMap();
};

SynapseClustering.prototype = {};

/**
 * Compute and return a distance map, where each skeleton treenode is a key,
 * and its value is an array of calibrated cable distances to all arbor synapses.
 *
 * Operates in O((3 + 2 + 4 + 2 + 2 + 1)n + nlog(n) + n*m) time,
 * with n being the number of treenodes and m being the number of synapses.
 * A massive improvement over the graph-based approach at ~O(n^3).
 *
 * Algorithm by Casey Schneider-Mizell.
 *
 */
SynapseClustering.prototype.distanceMap = function() {

  // Map of treenode ID vs list of distances to treenodes with synapses
  var Ds = {};

  // Map of treenode ID that is a branch vs list of treenode IDs upstream of it.
  // Entries get removed once the branch treenode has been visited as part of a partition
  // where it is not the last treenode of the partition.
  var seen_downstream_nodes = {};

  var max_distance = 3 * this.lambda;

  for (var pi=0, pil=this.partitions.length; pi<pil; ++pi) {
    var partition = this.partitions[pi];
    // Update synapses for the previous node, and upstream nodes for the current node.
    
    // Treenodes downstream of the current treenode: includes priorly in the partition
    // array plus those of the partitions merging into seen branch points. In other words,
    // all the children, recursively.
    // Represents how far into the partition we are, plus branches.
    var downstream_nodes = [];

    // The first treenode ID
    var prev_treenode_id = partition[0];

    // Iterate the rest
    for (var i=1, l=partition.length; i<l; ++i) {
      var treenode_id = partition[i];

      downstream_nodes.push(prev_treenode_id);

      var n_synapses = this.synapses[prev_treenode_id],
          prev_ds = Ds[prev_treenode_id];

      if (!prev_ds) { // prev_ds may already be defined for a branch node
        prev_ds = [];
        Ds[prev_treenode_id] = prev_ds;
      }

      if (n_synapses > 0) {
        // Record the distance to the synapse in every downstream node:
        // (which include prev_treenode_id)
        var d = this.distancesToRoot[prev_treenode_id];
        for (var di=0, dil=downstream_nodes.length; di<dil; ++di) {
          var child_id = downstream_nodes[di],
              ds = Ds[child_id],
              distance_child_to_synapse = this.distancesToRoot[child_id] - d;
          if (distance_child_to_synapse > max_distance) continue;
          for (var k = 0; k<n_synapses; ++k) {
            ds.push(distance_child_to_synapse);
          }
        }
      }

      // If treenode_id is a branch, append all its children to downstream_nodes.
      // It is a branch if we have already seen it, therefore it is in seen_downstream_nodes
      var seen = seen_downstream_nodes[treenode_id],
          distance_to_root = this.distancesToRoot[treenode_id],
          distance_prev_to_current = this.distancesToRoot[prev_treenode_id] - distance_to_root;

      if (seen) {
        // current_ds will exist, if seen exists
        var current_ds = Ds[treenode_id], // does not yet include prev_ds
            prev_ds = prev_ds.slice(); // clone: original will be modified below

        // Append to downstream nodes' Ds the distances to synapses in the branch just found in treenode_id
        for (var di=0, dil=downstream_nodes.length; di<dil; ++di) {
          var child_id = downstream_nodes[di],
              child_ds = Ds[child_id],
              distance = this.distancesToRoot[child_id] - distance_to_root;
          if (distance > max_distance) continue;
          for (var k=0, cl=current_ds.length; k<cl; ++k) {
            child_ds.push(current_ds[k] + distance);
          }
        }

        // Append to the seen nodes' Ds the distances to synapses collected along the downstream_nodes
        for (var si=0, sil=seen.length; si<sil; ++si) {
          var child_id = seen[si],
              child_ds = Ds[child_id],
              distance = this.distancesToRoot[child_id] + distance_prev_to_current - distance_to_root;
          if (distance > max_distance) continue;
          for (var k=0, pl=prev_ds.length; k<pl; ++k) {
            child_ds.push(prev_ds[k] + distance);
          }
        }

        // Update list of children
        downstream_nodes = downstream_nodes.concat(seen);
        // ... and remove it from seen_downstream_nodes: won't be seen again.
        delete seen_downstream_nodes[treenode_id];
      }

      // Assign synapse distances to the current node
      var current_ds = Ds[treenode_id],
          translated_prev_ds = [];

      for (var k=0; k<prev_ds.length; ++k) {
        var distance = prev_ds[k] + distance_prev_to_current;
        if (distance < max_distance) translated_prev_ds.push(distance);
      }

      Ds[treenode_id] = undefined !== current_ds ? current_ds.concat(translated_prev_ds) : translated_prev_ds;

      // Reset for next iteration of the partition
      prev_treenode_id = treenode_id;
    }

    // Finished traversing the partition
    var last_treenode_id = partition[partition.length -1];
    seen_downstream_nodes[last_treenode_id] = downstream_nodes;

  }

  // Update the last node: the root
  var n_synapses_at_root = this.synapses[this.arbor.root];
  if (n_synapses_at_root > 0) {
    Object.keys(Ds).forEach(function(treenode_id) {
      var ds = Ds[treenode_id];
      for (var k=0; k<n_synapses_at_root; ++k) {
        var distance = this.distancesToRoot[treenode_id];
        if (distance < max_distance) ds.push(distance);
      }
    }, this);
  }
 
  return Ds;
};

/**
 * Return a map of treenode ID vs cluster index, computed from the distance map.
 *
 * lambda: the bandwidth parameter.
 *
 * Algorithm by Casey Schneider-Mizell.
 */
SynapseClustering.prototype.densityHillMap = function() {
  // Map of treenode ID vs synapse cluster index.
  // Contains entries for all nodes, and therefore may contain more clusters
  // than the subset of nodes pointing to a synapse.
  var density_hill_map = {};

  // Key performance hog: n * m (treenodes vs synapses)
  var density = (function(Ds, lambda_sq) {
        var treenode_ids = Object.keys(Ds),
            density = {};
        for (var k=0, kl=treenode_ids.length; k<kl; ++k) {
          var sum = 0.0,
              treenode_id = treenode_ids[k],
              a = Ds[treenode_id];
          for (var i=0, l=a.length; i<l; ++i) {
            sum += Math.exp( - (Math.pow(+a[i], 2) / lambda_sq) );
          }
          density[treenode_id] = sum;
        }
        return density;
      })(this.Ds, this.lambda * this.lambda);

  var max_density_index = 0;

  var all_neighbors = this.arbor.allNeighbors(),
      edges = this.arbor.edges; // child keys and parent values

  // Root node will always be in cluster 0.
  density_hill_map[this.arbor.root] = 0;

  // Iterate partitions from longest to shortest: copy and reverse the copy first.
  // This iteration order ensure never working on the same density hill from two directions.
  var partitions = this.partitions.slice().reverse();
  for (var q=0; q<partitions.length; ++q) {
    var partition = partitions[q];
    // Iterate each partition in reverse, from branch node or root to end node.
    // Branch nodes will always be pre-visited, so just check if their child within
    // the current partition has also been visited. If it hasn't, continue with the
    // existing density hill; otherwise use the value that's already been seeded
    // into the child.
    
    var index = partition.length -1;
 
    // If a partition root has been seen before, it and its immediate child will
    // both already have a density hill index.
    // Note that partitions have at least a length of 2, by definition.
    var dhm = density_hill_map[partition[index -1]];
    var density_hill_index = (undefined === dhm) ? density_hill_map[partition[index]] : dhm;

    for (; index > -1; --index) {
      var treenode_id = partition[index];

      // Give the current node the value of the hill index we are on.
      density_hill_map[treenode_id] = density_hill_index;

      // See if the current node has multiple neighbors, since leaf nodes are trivially maxima.
      var neighbors = all_neighbors[treenode_id];
      if (neighbors.length > 1) {
        // If a pair of neighbors has a higher density than the current node,
        // the current node is a boundary between the domains of each.
        var self_density = density[treenode_id],
            n_over_zero = 0,
            delta_density = {};

        for (var k=0, l=neighbors.length; k<l; ++k) {
          var id = neighbors[k];
          var d = density[id] - self_density;
          if (d > 0) n_over_zero += 1;
          delta_density[id] = d;
        }

        // See if more than one neighbor has a delta density over zero (i.e. the current node has a smaller density than two or more of its neighbors).
        if (n_over_zero > 1) {
            
          // Nodes with delta_density[id] >= 0 will need new hill indices.
          // Nodes with delta_density[id] < 0 will adopt whatever index goes into the current node.

          // First, add as many new indices as needed (usually one, but maybe more)
          // if the node is a minimum at a branch point. Only need them for the
          // children of the current node, since we came from the parent and already gave
          // it an index value.
          var paren = edges[treenode_id];
          for (var k=0, l=neighbors.length; k<l; ++k) {
            var id = neighbors[k];
            if (paren === id || delta_density[id] < 0) continue;
            // if delta_density[id] >= 0:
            ++max_density_index;
            density_hill_map[id] = max_density_index;
          }

          // Gradient: the change in density divided by the change in location
          var distance_to_current = this.distancesToRoot[treenode_id],
              steepest_id;

          for (var k=0, l=neighbors.length, max=Number.MIN_VALUE; k<l; ++k) {
            var id = neighbors[k],
                m = delta_density[id] / Math.abs(this.distancesToRoot[id] - distance_to_current);
            if (m > max) {
              max = m;
              steepest_id = id;
            }
          }

          var steepest = density_hill_map[steepest_id];
          density_hill_map[treenode_id] = steepest;

          for (var k=0, l=neighbors.length; k<l; ++k) {
            var id = neighbors[k];
            if (delta_density[id] < 0) density_hill_map[id] = steepest;
          }

          density_hill_index = density_hill_map[partition[index -1]]; // Array index can't go lower than zero, because the node at 0 is an end node, which does not have more than one neighbors.
        }
      }
    }
  }

  return density_hill_map;
};


SynapseClustering.prototype._clusters = function(density_hill_map, newEntryFn, appendFn) {
  return Object.keys(density_hill_map).reduce(function(o, treenode_id) {
    var cluster_id = density_hill_map[treenode_id],
        cluster = o[cluster_id];
    if (undefined === cluster) o[cluster_id] = newEntryFn(treenode_id);
    else o[cluster_id] = appendFn(cluster, treenode_id);
    return o;
  }, {});
};

/** Given a density_hill_map computed with densityHillMap(),
 * return a map of cluster ID vs array of treenode IDs.
 */
SynapseClustering.prototype.clusters = function(density_hill_map) {
  return this._clusters(density_hill_map,
                        function(treenode_id) { return [treenode_id]; },
                        function(entry, treenode_id) {
                          entry.push(treenode_id);
                          return entry;
                        });
};

/** Given a density_hill_map computed with densityHillMap(),
 * return a map of cluster ID vs map of treenode IDs vs true.
 */
SynapseClustering.prototype.clusterMaps = function(density_hill_map) {
  return this._clusters(density_hill_map,
                        function(treenode_id) { var o = {}; o[treenode_id] = true;  return o; },
                        function(entry, treenode_id) {
                          entry[treenode_id] = true;
                          return entry;
                        });
};

/** Given a density_hill_map computed with densityHillMap(),
 * return a map of cluster ID vs cluster size (number of treenode IDs labeled).
 */
SynapseClustering.prototype.clusterSizes = function(density_hill_map) {
  return this._clusters(density_hill_map,
                        function(treenode_id) { return 1; },
                        function(entry, treenode_id) { return entry + 1; });
};


/** Compute the sum of the entropy of each cluster, measured as a deviation from uniformity (same number of inputs and outputs per cluster), relative to the entropy of the arbor as a whole.
 *
 * clusters: map of cluster ID vs array of nodes, as obtained by this.clusters(density_hill_map)
 *
 * Algorithm by Casey Schneider-Mizell, implemented by Albert Cardona.
 */
SynapseClustering.prototype.segregationIndex = function(clusters, outputs, inputs) {
  // Count the number of inputs and outputs of each cluster
  var synapses = this.synapses,
      cs = Object.keys(clusters).reduce(function(a, clusterID) {

    var m = clusters[clusterID].reduce(function(c, nodeID) {
      var n_pre = outputs[nodeID],
          n_post = inputs[nodeID];
      if (n_pre) c.n_outputs += n_pre;
      if (n_post) c.n_inputs += n_post;
      return c;
    }, {id: clusterID,
        n_inputs: 0,
        n_outputs: 0,
        n_synapses: 0,
        entropy: 0});
    m.n_synapses = m.n_inputs + m.n_outputs;

    // Skip clusters without synapses
    if (0 === m.n_synapses) return a;

    // p cannot be zero, otherwise 0 * -Infinity = NaN !
    if (0 === m.n_inputs || m.n_inputs === m.n_synapses) {
      m.entropy = 0;
    } else {
      var p = m.n_inputs / m.n_synapses;
      m.entropy = -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
    }

    a.push(m);
    return a;
  }, []);

  // Compute total entropy of clusters with synapses
  var n_synapses = 0,
      n_inputs = 0,
      S = cs.reduce(function(sum, c) {
    n_synapses += c.n_synapses;
    n_inputs += c.n_inputs;
    return sum + c.n_synapses * c.entropy;
  }, 0) / n_synapses;

  if (0 === S || 0 === n_inputs || n_inputs === n_synapses) return 1; // fully segregated

  // Compute reference entropy
  var p = n_inputs / n_synapses,
      S_norm = -(p * Math.log(p) + (1 - p) * Math.log(1 - p));

  return 1 - S / S_norm;
};

SynapseClustering.prototype.findArborRegions = function(arbor, fc, fraction) {
  var max = 0,
      nodes = arbor.nodesArray();
  for (var i=0; i<nodes.length; ++i) {
    var c = fc[nodes[i]].centrifugal;
    if (c > max) max = c;
  }

  // Corner case: strangely rooted arbors
  if (0 === max) return null;

  var above = [],
      plateau = [],
      zeros = [],
      threshold =  fraction * max;
  for (var i=0; i<nodes.length; ++i) {
    var node = nodes[i],
        ce = fc[node],
        c = ce.centrifugal;
    if (c > threshold) {
      above.push(node);
      if (c === max) plateau.push(node);
    } else if (0 === ce.sum) zeros.push(node);
  }

  return {above: above,
          plateau: plateau,
          zeros: zeros};
};

/** ap: ArborParser instance
 *  fraction: value between 0 and 1, generally 0.9 works well.
 *  Returns a new Arbor representing the axon. The root of the new Arbor is where the cut was made.
 *  If the flow centrality cannot be computed, returns null. */
SynapseClustering.prototype.findAxon = function(ap, fraction, positions) {
    var fc = ap.arbor.flowCentrality(ap.outputs, ap.inputs, ap.n_outputs, ap.n_inputs);

    if (!fc) return null;

    var regions = SynapseClustering.prototype.findArborRegions(ap.arbor, fc, fraction);

    if (null === regions) return null;
    
    var cut = SynapseClustering.prototype.findAxonCut(ap.arbor, ap.outputs, regions.above, positions);

    if (null === cut) return null;

    var axon = ap.arbor.subArbor(cut);
    axon.fc_max_plateau = regions.plateau;
    axon.fc_zeros = regions.zeros;
    return axon;
};

/** Find a node ID at which is its optimal to cut an arbor so that the downstream
 * sub-arbor is the axon and the rest is the dendrites.
 *
 * The heuristic is fidgety: finds the lowest-order node (relative to root)
 * that contains an output synapse or is a branch where more than one of the downstream branches
 * contains output synapses and is on the lower 50% of the cable for the flow centrality plateau
 * (the "above" array).
 *
 * arbor: an Arbor instance
 * outputs: map of node ID vs non-undefined to signal there are one or more output synapses at the node. There MUST be at least one output.
 * above: array of nodes with e.g. maximum centrifugal flow centrality.
 * positions: the map of node ID vs object with a distanceTo function like THREE.Vector3.
 *
 * The returned node is present in 'above'.
 */
SynapseClustering.prototype.findAxonCut = function(arbor, outputs, above, positions) {
  // Corner case
  if (1 === above.length) return above[0];
  // Arbor with inputs and outputs but no centrifugal flow
  if (0 === above.length) return null;

  var orders = arbor.nodesOrderFrom(arbor.root),
      successors = arbor.allSuccessors(),
      sorted = above.sort(function(a, b) { return orders[b] - orders[a]; }),
      furthest_from_root = sorted[0],
      closest_to_root = sorted[sorted.length -1],
      is_above = above.reduce(function(o, id) { o[id] = true; return o; }, {}),
      distances = {};

  // Compute distances of all nodes in above to the node in above that is closest to root
  var node = closest_to_root,
      open = [node],
      max = 0;
  distances[node] = 0;
  while (open.length > 0) {
    var paren = open.shift(),
        children = successors[paren],
        d = distances[paren],
        p = positions[paren];
    for (var i=0; i<children.length; ++i) {
      var child = children[i];
      if (is_above[child]) {
        var dc = d + p.distanceTo(positions[child]);
        distances[child] = dc;
        if (dc > max) max = dc;
        open.push(child);
      }
    }
  }

  // Select nodes that are at least 50% or beyond the max distance from the node
  // in above that is closest to root.
  var threshold = max / 2;
  var beyond = above.filter(function(node) {
    var d = distances[node]; // can be null if "above" has nodes from disconnected parts
    return d && d > threshold;
  });

  var be = arbor.findBranchAndEndNodes(),
      lowest = null,
      lowest_order = Number.MAX_VALUE;

  for (var i=0; i<beyond.length; ++i) {
    var node = beyond[i];
    var order = orders[node];
    if (outputs[node]) {
      if (order < lowest_order) {
        lowest = node;
        lowest_order = order;
      }
    } else if (be.branches[node]) {
      // Exclude branch points whose parent is not part of above (generally the lowest-order node in the "above" array)
      if (order < lowest_order && is_above[arbor.edges[node]]) {
        // Check if more than one branch has downstream outputs
        var succ = successors[node],
            count = 0;
        for (var k=0; k<succ.length; ++k) {
          var child = succ[k];
          if (is_above[child] || arbor.subArbor(child).nodesArray().filter(function(nid) { return outputs[nid]; }).length > 0) ++count;
        }
        if (count > 1) {
          lowest = node;
          lowest_order = order;
        }
      }
    }
  }

  // If none found, use the highest-order node
  return lowest ? lowest : furthest_from_root;
};
