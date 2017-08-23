/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var Sampling = {};

  /**
   * Get a sub-arbor from the passed in arbor that matches the passed in domain
   * model.
   */
  Sampling.domainArborFromModel = function(arbor, domain) {
    return CATMAID.Sampling.domainArbor(arbor, domain.start_node_id,
        domain.ends.map(function(e) { return e.node_id; }));
  };

  /**
   * Get sub-arbor that starts at a start node and is pruned at all domain ends.
   */
  Sampling.domainArbor = function(arbor, startNodeId, endNodeIds) {
    var domainArbor = arbor.subArbor(startNodeId);
    var allSuccessors = domainArbor.allSuccessors();
    domainArbor.pruneAt(endNodeIds.reduce(function(o, endNodeId) {
      // Pruning is inclusive, so we need to prune the potential successors
      // of the end nodes.
      var successors = allSuccessors[endNodeId];
      if (successors) {
        for (var i=0; i<successors.length; ++i) {
          o[successors[i]] = true;
        }
      }
      return o;
    }, {}));

    // Remove edged that are disconnected from component that contains the root
    // node.
    var rootDistance = domainArbor.nodesOrderFrom(domainArbor.root);
    var nodes = Object.keys(domainArbor.edges);
    for (var i=0, max=nodes.length; i<max; ++i) {
      var nodeId = nodes[i];
      if (rootDistance[nodeId] === undefined) {
        delete domainArbor.edges[nodeId];
      }
    }

    return domainArbor;
  };

  /**
   * Intervals are created by traversing a domain downstream and cutting out
   * interval parts continuously. This is done by first splitting a domain into
   * paritions, i.e downstream paths from root or branchpoints to leaves, in
   * order of decreasing length. cutting out individual intervals.
   * Partions are paths from root or branch points to leaves.
   */
  Sampling.intervalsFromModels = function(arbor, positions, domainDetails,
      intervalLength, preferSmallerError, targetEdgeMap) {
    if (!intervalLength) {
      throw new CATMAID.ValueError("Need interval length for interval creation");
    }

    // Get domain arbor, which is then split into slabs, which are then
    // further split into intervals of respective length.
    var domainArbor = CATMAID.Sampling.domainArborFromModel(arbor, domainDetails);

    preferSmallerError = preferSmallerError === undefined ? true : !!preferSmallerError;

    // Create Intervals from partitions
    var intervals = [];
    var currentInterval = 0;
    var partitions = domainArbor.partitionSorted();
    for (var i=0; i<partitions.length; ++i) {
      var partition = partitions[i];
      // Walk partition toward leaves
      var dist = 0, lastDist;
      var intervalStartIdx = partition.length - 1;
      var intervalStartPos = positions[partition[intervalStartIdx]];
      // Traverse partition toward leaves, i.e. from the end of the partition
      // entries to branch points or root.
      for (var j=partition.length - 2; j>=0; --j) {
        lastDist = dist;
        // Calculate new interval length, we can
        var lastPos = positions[partition[j+1]];
        var pos = positions[partition[j]];
        dist += lastPos.distanceTo(pos);
        //  If sum is greater than interval length, create new interval. If
        //  <preferSmalError>, the end/start node is either the current one
        //  or the last one, whichever is closer to the ideal length.
        //  Otherwise this node is used.
        if (dist > intervalLength) {
          var steps = intervalStartIdx - j;
          // Optionally, make the interval smaller if this means being closer to
          // the ideal interval length. This can only be done if the current
          // interval has at least a length of 2.
          if (preferSmallerError && (intervalLength - lastDist) < dist && steps > 1 && j !== 0) {
            intervals.push([partition[intervalStartIdx], partition[j+1]]);
            intervalStartIdx = j + 1;
            j++;
          } else {
            if (targetEdgeMap) {
              targetEdgeMap[partition[j]] = currentInterval;
              targetEdgeMap[partition[j+1]] = currentInterval;
            }
            intervals.push([partition[intervalStartIdx], partition[j]]);
            intervalStartIdx = j;
          }
          currentInterval++;
          dist = 0;
        } else if (targetEdgeMap) {
          targetEdgeMap[partition[j]] = currentInterval;
        }
      }
    }

    return intervals;
  };

  /**
   * Get an edge mapping for all edges in the passed in arbor that are part of
   * one of the domains that are part of the passed in sampler.
   */
  Sampling.samplerEdges = function(arbor, sampler, target) {
    edges = target || {};

    var edges = sampler.domains.reduce(function(o, d) {
      var domainArbor = CATMAID.Sampling.domainArborFromModel(arbor, d);
      // Add all edges of the domain arbor to the sampler wide edge mapping
      for (var parentId in domainArbor.edges) {
        o[parentId] = domainArbor.edges[parentId];
      }
      if (domainArbor.root) {
        o[domainArbor.root] = null;
      }
      return o;
    }, edges);

    return edges;
  };

  /**
   * Get an edge mapping for all edges in the passed in arbor that are part of
   * one of the intervals of the domains of the passed in sampler. Note that
   * the set of interval edges can be smaller than the domain set one.
   */
  Sampling.intervalEdges = function(arbor, positions, sampler, preferSmallerError, target) {
    // Build intervals for each domain, based on the interval length defined in
    // the sampler.
    return sampler.domains.reduce(function(o, d) {
      var intervals = Sampling.intervalsFromModels(arbor, positions, d,
          sampler.interval_length, preferSmallerError, target);
      o[d.id] = intervals;
      return o;
    }, {});
  };

  Sampling.NodeProviders = {
    'active': function(arborParser) {
      var activeNodeId = SkeletonAnnotations.getActiveNodeId();
      return new Promise(function(resolve, reject) {
        if (!activeNodeId) {
          throw new CATMAID.ValueError("No node selected");
        }
        if (!arborParser.arbor.contains(activeNodeId)) {
          throw new CATMAID.ValueError("Active node not part of specified skeleton");
        }

        resolve([activeNodeId]);
      });
    },
    'select': function(arborParser) {
      return new Promise(function(resolve, reject) {
        var dialog = new CATMAID.OptionsDialog("Select node", {
          'Use active node': function() {
            var activeNodeId = SkeletonAnnotations.getActiveNodeId();
            if (!activeNodeId) {
              throw new CATMAID.ValueError("No node selected");
            }
            if (!arborParser.arbor.contains(activeNodeId)) {
              throw new CATMAID.ValueError("Active node not part of specified skeleton");
            }

            CATMAID.msg("Selected node", activeNodeId);

            resolve([activeNodeId]);
          }
        });
        dialog.appendMessage("Please select a node");
        dialog.show('auto', 'auto', false);
      });
    },
    'root': function(arborParser) {
      return new Promise(function(resolve, reject) {
        var arbor = arborParser.arbor;
        if (!arbor.root) {
          throw new CATMAID.ValueError("No root node found");
        }
        resolve([arbor.root]);
      });
    },
    'tag': function(arborParser) {
      return new Promise(function(resolve, reject) {
        var tagInput = null;
        var dialog = new CATMAID.OptionsDialog("Provide tag", {
          'Use tagged nodes': function() {
            var tag = tagInput.value;
            var taggedNodes = arborParser.tags[tag];
            if (!taggedNodes) {
              throw new CATMAID.ValueError("No nodes found with tag \"" + tag + "\"");
            }
            resolve(taggedNodes.slice(0));
          }
        });
        dialog.appendMessage("Please specify a tag to use");
        tagInput = dialog.appendField("Tag", "tag-selection", "", true);
        dialog.show('auto', 'auto', false);
      });
    },
    'downstream': function(arborParser, options) {
      var arbor = arborParser.arbor;
      var referenceNodes = options['referenceNodes'];
      if (!referenceNodes) {
        throw new CATMAID.ValueError("At least one reference node is required");
      }
      return new Promise(function(resolve, reject) {
        var nodes = [];
        for (var i=0; i<referenceNodes.length; ++i) {
          var arbor = arbor.subArbor(referenceNodes[i]);
          nodes = nodes.concat(arbor.findEndNodes());
        }
        resolve(nodes);
      });
    }
  };

  /**
   * Get arbor information on a particular skeleton.
   */
  Sampling.getArbor = function(skeletonId) {
    // Get nodes and tags for skeleton
    return CATMAID.fetch(project.id + '/' + skeletonId + '/1/1/1/compact-arbor', 'POST')
      .then(function(result) {
        var ap = new CATMAID.ArborParser();
        ap.tree(result[0]);

        return {
          arbor: ap.arbor,
          positions: ap.positions,
          tags: result[2]
        };
      });
  };

  Sampling.DomainFactories = {
    'covering': {
      /**
       * Create a single domain for a skeleton ID.
       */
      makeDomains: function(skeletonId, options) {
        return Sampling.getArbor(skeletonId)
          .then(function(arborParser) {
            return {
              domains: [{
                startNodeId: arborParser.arbor.root,
                endNodeIds: arborParser.arbor.findEndNodes()
              }],
              cache: {
                arbor: arborParser
              }
            };
          });
      }
    },
    'regular': {
      /**
       * Let domains grow downstream from a set of start nodes toward a set of end
       * nodes.
       */
      makeDomains: function(skeletonId, options) {
        var startNodeProvider = CATMAID.Sampling.NodeProviders[options.domainStartNodeType];
        var endNodeProvider = CATMAID.Sampling.NodeProviders[options.domainEndNodeType];

        return Sampling.getArbor(skeletonId)
          .then(function(arborParser) {
            // Get start and end nodes and sanitize this selection so that start
            // node IDs are upstream of end nodes. Let domains be greedy, i.e.
            // make them as big as possible.
            var domainStartNodeIds = startNodeProvider(arborParser, options);
            options['referenceNodes'] = domainStartNodeIds;
            return Promise.all([arborParser, domainStartNodeIds]);
          })
          .then(function(results) {
            // Get end nodes only after start nodes have been required, which is
            // mainly important for manual node selection.
            var domainEndNodeIds = endNodeProvider(results[0], options);
            return Promise.all([results[0], results[1], domainEndNodeIds]);
          })
          .then(function(results) {
            var arborParser = results[0];
            var domainStartNodeIds = results[1];
            var domainEndNodeIds = results[2];

            var arbor = arborParser.arbor;
            var rootDistance = arbor.nodesOrderFrom(arbor.root);

            // Sort domain start node IDs by distance to root in ascending order
            domainStartNodeIds.sort(function(a, b) {
              return rootDistance[a] < rootDistance[b];
            });

            // The goal is to find end nodes that are actually downstream of
            // each start node and create domains only for those start nodes
            // along with its downstram domain end nodes. Domains are currently
            // allowed to overlap.
            var seen = new Set();
            var domains = domainStartNodeIds.reduce(function(o, startNodeId) {
              // Create new Arbor instance for domain, pruned at downstream end
              // nodes. All branches in between are implicitely part of the
              // domain. This will also take care of removing end nodes that
              // won't affect the downstream arbor.
              var domainArbor = CATMAID.Sampling.domainArbor(arbor, startNodeId,
                  domainEndNodeIds);

              o.push({
                startNodeId: domainArbor.root,
                endNodeIds: domainArbor.findEndNodes()
              });

              return o;
            }, []);

            return {
              domains: domains,
              cache: {
                arbor: arborParser
              }
            };
          });
      }
    }
  };

  /**
   * Return all nodes on the straight path in then interval [startNodeId,
   * endNodeId], assuming both nodes are connected through a monotone
   * parent-child relationship. The direction doesn't matter as long as <strict>
   * isn't set to true. If this is the case, the start node has to be closer to
   * root than end node. The result can optionally be sorted by setting <sort>
   * to true.
   */
  Sampling.getIntervalBackboneNodes = function(arbor, startNodeId, endNodeId,
      sort, strict) {
    var intervalNodes = [];
    // Assume end node is downstream of start node
    var nodes = arbor.edges;
    var lastNode = endNodeId;
    while (true) {
      lastNode = parseInt(lastNode, 10);
      intervalNodes.push(lastNode);
      if (lastNode == startNodeId) {
        break;
      }

      lastNode = nodes[lastNode];
      if (!lastNode) {
        break;
      }
    }

    if (intervalNodes.length === 0) {
      return null;
    }

    // If the last node is not the interval start node, try reversing start/end
    // node if not in strict mode.
    if (intervalNodes[intervalNodes.length - 1] == startNodeId) {
      return sort ? intervalNodes.reverse() : intervalNodes;
    } else {
      return strict ? null : CATMAID.Sampling.getIntervalBackboneNodes(arbor,
          endNodeId, startNodeId, sort, true);
    }
  };

  /**
   * Return all nodes that are part of the requested interval. This set will not
   * contain any branches starting off the start or end node, as these will be
   * part of other intervals. Additionally a Set instance can be passed in as
   * <boundaryNodes>. The returned interval nodes won't contain any nodes beyond
   * any of those boundary nodes nor the boundary nodes themselves.
   */
  Sampling.getIntervalNodes = function(arbor, startNodeId, endNodeId, boundaryNodes) {
    startNodeId = parseInt(startNodeId, 10);
    endNodeId = parseInt(endNodeId, 10);
    boundaryNodes = boundaryNodes || new Set();
    var intervalBackbone = CATMAID.Sampling.getIntervalBackboneNodes(arbor,
        startNodeId, endNodeId, true);

    if (!intervalBackbone || intervalBackbone.length === 0) {
      throw new CATMAID.ValueError("Could not find interval backbone for between nodes " +
          startNodeId + " and " + endNodeId);
    }

    var edges = arbor.edges;
    var allSuccessors = arbor.allSuccessors();

    // Collect nodes between start and end of the interval back-bone, all
    // branches inbetween will be added. Branches originating from the start or
    // end node will *not* be added, other intervals have to be used for those.
    var workingSet = intervalBackbone.map(function(n) {
      // Make sure we deal with numbers
      return parseInt(n, 10);
    });
    var intervalNodes = new Set(workingSet);
    while (workingSet.length > 0) {
      var currentNodeId = workingSet.pop();
      if (currentNodeId === startNodeId || currentNodeId === endNodeId) {
        continue;
      }

      var children = allSuccessors[currentNodeId];
      for (var i=0; i<children.length; ++i) {
        var childId = parseInt(children[i], 10);
        // Don't include nodes that are off limit
        if (boundaryNodes.has(childId)) {
          continue;
        }
        intervalNodes.add(childId);
        workingSet.push(childId);
      }
    }

    return intervalNodes;
  };


  // Export into CATMAID namespace
  CATMAID.Sampling = Sampling;

})(CATMAID);

