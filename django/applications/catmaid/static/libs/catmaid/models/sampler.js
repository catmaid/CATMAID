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
          .then(function(arbor) {
            return {
              domains: [{
                startNodeId: arbor.arbor.root,
                endNodeIds: arbor.arbor.findEndNodes()
              }],
              cache: {
                arbor: arbor
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
                arbor: arbor
              }
            };
          });
      }
    }
  };

  // Export into CATMAID namespace
  CATMAID.Sampling = Sampling;

})(CATMAID);

