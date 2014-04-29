/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * arbor: an instance of Arbor: each node is a treenode ID.
 * locations: map of treenode ID vs Vector3.
 * synapses: map of treenode ID vs list of connector IDs.
 *
 * Computes and stores as members the Arbor partitions and the distance map.
 */
var SynapseClustering = function(arbor, locations, synapses) {
  this.arbor = arbor;
  this.synapses = synapses;
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

  this.partitions.forEach(function(partition) {
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

      var synapses = this.synapses[prev_treenode_id],
          prev_ds = Ds[prev_treenode_id];

      if (!prev_ds) { // prev_ds may already be defined for a branch node
        prev_ds = [];
        Ds[prev_treenode_id] = prev_ds;
      }

      if (synapses) {
        // Record the distance to the synapse in every downstream node:
        // (which include prev_treenode_id)
        var d = this.distancesToRoot[prev_treenode_id];
        downstream_nodes.forEach(function(child_id) {
          var ds = Ds[child_id],
              distance_child_to_synapse = this.distancesToRoot[child_id] - d;
          for (var k = 0, sl=synapses.length; k<sl; ++k) {
            ds.push(distance_child_to_synapse);
          }
        }, this);
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
        downstream_nodes.forEach(function(child_id) {
          var child_ds = Ds[child_id],
              distance = this.distancesToRoot[child_id] - distance_to_root;
          for (var k=0, cl=current_ds.length; k<cl; ++k) {
            child_ds.push(current_ds[k] + distance);
          }
        }, this);

        // Append to the seen nodes' Ds the distances to synapses collected along the downstream_nodes
        seen.forEach(function(child_id) {
          var child_ds = Ds[child_id],
              distance = this.distancesToRoot[child_id] + distance_prev_to_current - distance_to_root;
          for (var k=0, pl=prev_ds.length; k<pl; ++k) {
            child_ds.push(prev_ds[k] + distance);
          }
        }, this);

        // Update list of children
        downstream_nodes = downstream_nodes.concat(seen);
        // ... and remove it from seen_downstream_nodes: won't be seen again.
        delete seen_downstream_nodes[treenode_id];
      }

      // Assign synapse distances to the current node
      var current_ds = Ds[treenode_id],
          translated_prev_ds = prev_ds.map(function(distance) {
            return distance + distance_prev_to_current;
          });

      Ds[treenode_id] = undefined !== current_ds ? current_ds.concat(translated_prev_ds) : translated_prev_ds;

      // Reset for next iteration of the partition
      prev_treenode_id = treenode_id;
    }

    // Finished traversing the partition
    var last_treenode_id = partition[partition.length -1];
    seen_downstream_nodes[last_treenode_id] = downstream_nodes;

  }, this);

  // Update the last node: the root
  var synapses_at_root = this.synapses[this.arbor.root];
  if (synapses_at_root) {
    Object.keys(Ds).forEach(function(treenode_id) {
      var ds = Ds[treenode_id];
      for (var k=0; k<synapses_at_root.length; ++k) {
        ds.push(this.distancesToRoot[treenode_id]);
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
SynapseClustering.prototype.densityHillMap = function(lambda) {
  // Map of treenode ID vs synapse cluster index.
  // Contains entries for all nodes, and therefore may contain more clusters
  // than the subset of nodes pointing to a synapse.
  var density_hill_map = {};

  var lambda_sq = lambda * lambda,
      density = Object.keys(this.Ds).reduce((function(o, treenode_id) {
    o[treenode_id] = this[treenode_id].reduce(function(sum, d) { // this == Ds
      return sum + Math.exp( - (d*d / lambda_sq) );
    }, 0);
    return o;
  }).bind(this.Ds), {});

  var max_density_index = 0;

  // TODO: to remove one array creation for every node, create new function Arbor.allNeighbors. Later, skip the parent when only wanting to use the children.
  //
  var children = this.arbor.allSuccessors(),
      parents = this.arbor.edges;

  var getNeighbors = function(treenode_id) {
    var c = children[treenode_id],
        p = parents[treenode_id];
    if (p) {
      var a = c.slice(); // clone array
      a.push(p);
      return a;
    }
    return c;
  };

  // Root node will always be in cluster 0.
  density_hill_map[this.arbor.root] = 0;

  // Iterate partitions from longest to shortest: copy and reverse the copy first.
  // This iteration order ensure never working on the same density hill from two directions.
  this.partitions.slice().reverse().forEach(function(partition) {
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
    var density_hill_index = undefined === dhm ? density_hill_map[partition[index]] : dhm;

    for (; index > -1; --index) {
      var treenode_id = partition[index];

      // Give the current node the value of the hill index we are on.
      density_hill_map[treenode_id] = density_hill_index;

      // See if the current node has multiple neighbors, since leaf nodes are trivially maxima.
      var neighbors = getNeighbors(treenode_id);
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
          var successors = children[treenode_id];
          for (var k=0, l=successors.length; k<l; ++k) {
            var id = successors[k];
            if (delta_density[id] < 0) return;
            // if delta_density[id] >= 0:
            ++max_density_index;
            density_hill_map[id] = max_density_index;
          }

          // Gradient: the change in density divided by the change in location
          var distance_to_current = this.distancesToRoot[treenode_id],
              steepest_id;

          for (var k=0, l=neighbors.length, max=Number.MIN_VALUE; k<0; ++k) {
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

  }, this);

  return density_hill_map;
};


SynapseClustering.prototype._clusters = function(density_hill_map, newEntryFn, appendFn) {
  return Object.keys(density_hill_map).reduce(function(o, treenode_id) {
    var cluster_id = density_hill_map[treenode_id],
        cluster = o[cluster_id];
    if (cluster) o[cluster_id] = appendFn(cluster, treenode_id);
    else o[cluster_id] = newEntryFn(treenode_id);
    return o;
  }, {});
};

/** Given a density_hill_map computed with densityHillMap(lambda),
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

/** Given a density_hill_map computed with densityHillMap(lambda),
 * return a map of cluster ID vs cluster size (number of treenode IDs labeled).
 */
SynapseClustering.prototype.clusterSizes = function(density_hill_map) {
  return this._clusters(density_hill_map,
                        function(treenode_id) { return 1; },
                        function(entry, treenode_id) { return entry + 1; });
};
