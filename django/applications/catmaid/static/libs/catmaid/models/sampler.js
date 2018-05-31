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
   * The passed in interval map will be update with nodes from the arbor that
   * are covered by the passed in interval list.
   */
  Sampling.updateIntervalMap = function(arbor, intervals, targetEdgeMap) {
    for (var i=0, imax=intervals.length; i<imax; ++i) {
      let interval = intervals[i];
      let intervalId = interval[0];
      let startNodeId = interval[1];
      let endNodeId = interval[2];
      // Try to walk from interval end to start, assuming that an interval
      // starts closer to root than it ends.
      let currentNodeId = endNodeId;
      while (true) {
        targetEdgeMap[currentNodeId] = intervalId;
        currentNodeId = arbor.edges[currentNodeId];
        if (currentNodeId == startNodeId) {
          targetEdgeMap[startNodeId] = interval[0];
          break;
        }
        if (!currentNodeId) {
          throw new CATMAID.ValueError("Arrived at root node without finding interval start");
        }
      }
    }
  };

  function addToTargetEdMap(nodeInfo) {
    /* jshint validthis: true */
    this[nodeInfo[0]] = nodeInfo[1];
  }

  /**
   * Intervals are created by traversing a domain downstream and cutting out
   * interval parts continuously. This is done by first splitting a domain into
   * paritions, i.e downstream paths from root or branchpoints to leaves, in
   * order of decreasing length. cutting out individual intervals.
   * Partions are paths from root or branch points to leaves. Returns an object
   * with an <intervals> field and and <addedNodes> field. The former is a list
   * of two-element tuples which are treenodes referencing the beginning and the
   * end of an interval. In <addedNodes> node IDs in <intervals> can be
   * overridden and new nodes created instead. Entries in the <addedNodes> list
   * are of the form [id, childId, parentId, x, y, z]. The new node will be
   * created at x, y, z between the childId and parentId nodes. The location has
   * to be collinear with child and parent locations and between them.
   */
  Sampling.intervalsFromModels = function(arbor, positions, domainDetails,
      intervalLength, intervalError, preferSmallerError, createNewNodes,
      targetEdgeMap) {
    if (!intervalLength) {
      throw new CATMAID.ValueError("Need interval length for interval creation");
    }

    // Get domain arbor, which is then split into slabs, which are then
    // further split into intervals of respective length.
    var domainArbor = CATMAID.Sampling.domainArborFromModel(arbor, domainDetails);

    preferSmallerError = preferSmallerError === undefined ? true : !!preferSmallerError;
    createNewNodes = CATMAID.tools.getDefined(createNewNodes, false);

    // Find an ID number that is higher than all already used ones. This is
    // needed for artificial new nodes with realistic ids without reusing
    // existing IDs of the sampled skeleton.
    let newPointId = Math.max(arbor.root, Math.max.apply(Math,
        (Object.keys(arbor.edges).map(Number)))) + 1;

    // Create Intervals from partitions
    var intervals = [];
    var addedNodes = [];
    var currentInterval = 0;
    var partitions = domainArbor.partitionSorted();
    for (var i=0; i<partitions.length; ++i) {
      var partition = partitions[i];
      // Walk partition toward leaves
      var dist = 0, lastDist;
      var intervalStartIdx = partition.length - 1;
      var intervalStartPos = positions[partition[intervalStartIdx]];
      var intervalNodes = [];
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
        //  or the last one, whichever is closer to the ideal length. If
        //  <createNewNodes> is truthy, new nodes will be created so that the
        //  specified interval length will be matched. Otherwise this node is used.
        let distance = dist - intervalLength;
        if (distance < 0.0001) {
          // Interval length is exactly met or not yet reached
          if (targetEdgeMap) {
            // Rember node for potentially added interval
            intervalNodes.push([
              partition[j],
              currentInterval
            ]);
          }
          // Node is exactly at end of interval
          if (distance > -0.0001) {
            intervals.push([partition[intervalStartIdx], partition[j]]);
            intervalStartIdx = j;
            dist = 0;
            currentInterval++;
            if (targetEdgeMap) {
              intervalNodes.forEach(addToTargetEdMap, targetEdgeMap);
              intervalNodes = [];
            }
          }
        } else {
          // This branch represents the case the current node is already too far
          // away to match the interval length exactly.
          var steps = intervalStartIdx - j;
          let edgeLength = dist - lastDist;
          let distanceToLast = intervalLength - lastDist;
          let distanceToThis = edgeLength - distanceToLast;
          let lastIsFirst = steps === 0;
          let thisIsLast = j === 0;
          let selectedNode = null;

          // If this or the last node is closer
          if (distanceToLast < distanceToThis) {
            if (distanceToLast < intervalError) {
              // Use last node, because it is closer than this node and closer
              // than the allowed interval error.
              selectedNode = partition[j+1];
            }
          } else {
            if (distanceToThis < intervalError) {
              // Use this node, because it is closer than the last node and
              // closer than the allowed interval error.
              selectedNode = partition[j];
            }
          }

          if (!selectedNode) {
            if (createNewNodes) {
              // Optionally, create a new node between this node and the last one.
              // This also requires updating the arbor.
              let dRatio = distanceToLast / edgeLength;
              let newPointPos = lastPos.clone().lerpVectors(lastPos, pos, dRatio);
              // Add new point into arbor
              if (arbor.edges[newPointId]) {
                throw new CATMAID.PreConditionError("The temporary ID for the " +
                    "new interval end location exists already: " + newPointId);
              }

              // Insert new node into arbor
              let childId = partition[j];
              let parentId = partition[j+1];
              arbor.edges[childId] = newPointId;
              arbor.edges[newPointId] = parentId;
              positions[newPointId] = newPointPos;

              addedNodes.push([newPointId, childId, parentId, newPointPos.x,
                  newPointPos.y, newPointPos.z]);

              // Insert element in currently iterated loop and move one step back
              // (remember, we walk backwards).
              partition.splice(j+1, 0, newPointId);

              selectedNode = newPointId;
              j++;

              // We walk the partition from end to front. Inserting the a node
              // into the partition, requires us to go one step back to remain
              // on the same element with our current index.
              intervalStartIdx++;

              // Prepare point ID for next point
              newPointId++;
            } else if (preferSmallerError && distanceToLast < distanceToThis && !lastIsFirst) {
              // Optionally, make the interval smaller if this means being closer to
              // the ideal interval length. This can only be done if the current
              // interval has at least a length of 2.
              selectedNode = partition[j+1];
              // To properly continue from the last node with the next interval,
              // move index back one step.
              j++;
            } else {
              selectedNode = partition[j];
            }
          }

          // If a node was found and an edge map is passed in, add the current
          // interval for the selected node.
          if (!selectedNode) {
            throw new CATMAID.ValueError("Could not select node for interval creation");
          }

          if (targetEdgeMap) {
            targetEdgeMap[selectedNode] = currentInterval;
          }

          if (targetEdgeMap) {
            intervalNodes.forEach(addToTargetEdMap, targetEdgeMap);
            intervalNodes = [];
          }

          intervals.push([partition[intervalStartIdx], selectedNode]);

          intervalStartIdx = j;
          currentInterval++;
          dist = 0;
        }
      }
    }

    return {
      intervals: intervals,
      addedNodes: addedNodes
    };
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
  Sampling.intervalEdges = function(arbor, positions, sampler,
      preferSmallerError, createNewNodes, target) {
    // Build intervals for each domain, based on the interval length defined in
    // the sampler.
    return sampler.domains.reduce(function(o, d) {
      var intervalConfiguration = Sampling.intervalsFromModels(arbor, positions,
          d, sampler.interval_length, sampler.interval_error, preferSmallerError,
          createNewNodes, target);
      o[d.id] = intervalConfiguration.intervals;
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
        // Instead of virtual nodes, their children are used.
        if (!SkeletonAnnotations.isRealNode(activeNodeId)) {
          activeNodeId = SkeletonAnnotations.getChildOfVirtualNode(activeNodeId);
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
            // Instead of virtual nodes, their children are used.
            if (!SkeletonAnnotations.isRealNode(activeNodeId)) {
              activeNodeId = SkeletonAnnotations.getChildOfVirtualNode(activeNodeId);
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

        // Add autocompletetion to tag input
        $(tagInput).autocomplete({
          source: Object.keys(arborParser.tags)
        });
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

      // Don't include children of boundary nodes
      if (boundaryNodes.has(currentNodeId)) {
        continue;
      }

      var children = allSuccessors[currentNodeId];
      for (var i=0; i<children.length; ++i) {
        var childId = parseInt(children[i], 10);
        // Don't include children of boundary nodes
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

