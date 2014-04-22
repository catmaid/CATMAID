/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var SynapseClustering = function() {};

SynapseClustering.prototype = {};

/**
 * Compute and return a distance map, where each skeleton treenode is a key,
 * and its value is an array of calibrated cable distances to the root node.
 *
 * arbor: an instance of Arbor, representing the Skeleton.
 * synapses: a map of treenode ID vs list of connector IDs.
 *
 * Operates in O((3 + 2 + 4 + 2 + 2 + 1)n + nlog(n) + n*m) time,
 * with n being the number of treenodes and m being the number of synapses.
 * A massive improvement over the graph-based approach at ~O(n^3).
 *
 * Algorithm by Casey Schneider-Mizell.
 *
 */
SynapseClustering.prototype.distanceMap = function(arbor, all_synapses, vertices) {

  // Map of treenode ID vs list of distances to treenodes with synapses
  var Ds = {};

  // List of lists of treenode IDs, sorted from smaller to larger lists
  var partitions = arbor.partitionSorted();

  var locations = vertices.reduce(function(vs, v) {
    vs[v.node_id] = v;
    return vs;
  }, {});

  var distanceFn = (function(child, paren) {
    return this[child].distanceTo(this[paren]);
  }).bind(locations);
 
  var distancesToRoot = arbor.nodesDistanceTo(arbor.root, distanceFn).distances;

  // Map of treenode ID that is a branch vs list of treenode IDs upstream of it.
  // Entries get removed once the branch treenode has been visited as part of a partition
  // where it is not the last treenode of the partition.
  var seen_downstream_nodes = {};

  partitions.forEach(function(partition) {
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

      var synapses = all_synapses[prev_treenode_id],
          prev_ds = Ds[prev_treenode_id];

      if (!prev_ds) { // prev_ds may already be defined for a branch node
        prev_ds = [];
        Ds[prev_treenode_id] = prev_ds;
      }

      if (synapses) {
        // Record the distance to the synapse in every downstream node:
        // (which include prev_treenode_id)
        var d = distancesToRoot[prev_treenode_id];
        downstream_nodes.forEach(function(child_id) {
          var ds = Ds[child_id],
              distance_child_to_synapse = distancesToRoot[child_id] - d;
          for (var k = 0, sl=synapses.length; k<sl; ++k) {
            ds.push(distance_child_to_synapse);
          }
        });
      }

      // If treenode_id is a branch, append all its children to downstream_nodes.
      // It is a branch if we have already seen it, therefore it is in seen_downstream_nodes
      var seen = seen_downstream_nodes[treenode_id],
          distance_to_root = distancesToRoot[treenode_id],
          distance_prev_to_current = distancesToRoot[prev_treenode_id] - distance_to_root;

      if (seen) {
        // current_ds will exist, if seen exists
        var current_ds = Ds[treenode_id], // does not yet include prev_ds
            prev_ds = prev_ds.slice(); // clone: original will be modified below

        // Append to downstream nodes' Ds the distances to synapses in the branch just found in treenode_id
        downstream_nodes.forEach(function(child_id) {
          var child_ds = Ds[child_id],
              distance = distancesToRoot[child_id] - distance_to_root;
          for (var k=0, cl=current_ds.length; k<cl; ++k) {
            child_ds.push(current_ds[k] + distance);
          }
        });

        // Append to the seen nodes' Ds the distances to synapses collected along the downstream_nodes
        seen.forEach(function(child_id) {
          var child_ds = Ds[child_id],
              distance = distancesToRoot[child_id] + distance_prev_to_current - distance_to_root;
          for (var k=0, pl=prev_ds.length; k<pl; ++k) {
            child_ds.push(prev_ds[k] + distance);
          }
        });

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

      Ds[treenode_id] = current_ds ? current_ds.concat(translated_prev_ds) : translated_prev_ds;

      // Reset for next iteration of the partition
      prev_treenode_id = treenode_id;
    }

    // Finished traversing the partition
    var last_treenode_id = partition[partition.length -1];
    seen_downstream_nodes[last_treenode_id] = downstream_nodes;

  });

  // Update the last node: the root
  var synapses_at_root = all_synapses[arbor.root];
  if (synapses_at_root) {
    Object.keys(Ds).forEach(function(treenode_id) {
      var ds = Ds[treenode_id];
      for (var k=0; k<synapses_at_root.length; ++k) {
        ds.push(distancesToRoot[treenode_id]);
      }
    });
  }
 
  return Ds;
};
