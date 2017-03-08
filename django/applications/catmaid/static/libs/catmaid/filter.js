/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  'use strict';

  /**
   * A skeleton rule filters accepts or reject a skeleton. Besides a filtering
   * strategy it has an optional list skeletons it is valid for. If this list is
   * not empty the application of this rule will be ignored for all other
   * skeletons.
   */
  CATMAID.SkeletonFilterRule = function(strategy, options, mergeMode, skid, name) {
    this.skip = false;
    this.mergeMode = mergeMode || CATMAID.UNION;
    this.strategy = strategy;
    this.options = options;
    this.validOnlyForSkid = skid;
    this.validOnlyForName = name;
  };

  var addToObject = function(o, key) {
    o[key] = true;
    return o;
  };

  CATMAID.SkeletonFilter= function(rules, skeletonIndex) {
    this.rules = rules;
    this.skeletonIndex = skeletonIndex;
  };


  /**
   * Fetch all arbors as compact arbors and parse them into an Arbor
   * instance, the positions, and the synapses, with the latter sorted in a
   * map of pre and post (0 and 1), and each with a map of partner skeleton ID
   * vs a map of treenode vs the number of times it is pre or post onto that
   * treenode.
   *
   * @params  {Array}   skeletonIds Skeletons to fetch
   * @returns {Promise}             Resolves with fetched arbors
   */
  CATMAID.SkeletonFilter.fetchArbors = function(skeletonIds) {
    return new Promise(function(resolve, reject) {
    var nns = CATMAID.NeuronNameService.getInstance();
    var arbors = {};
    fetchSkeletons(
      skeletonIds,
      function(skid) {
        return django_url + project.id + '/' + skid + '/1/1/1/compact-arbor';
      },
      function(skid) { return {}; }, // POST
      function(skid, json) {
        var ap = new CATMAID.ArborParser();
        ap.tree(json[0]);
        arbors[skid] = {
          arbor: ap.arbor,
          positions: ap.positions,
          radii: json[0].reduce(function(o, row) {
            o[row[0]] = row[6];
            return o;
          }, {}),
          tags: json[2],
          partners: json[1].reduce(function(o, row) {
            // 1: treenode
            // 5: other skeleton ID
            // 6: 0 for pre and 1 for post
            var type = o[row[6]];
            var node = row[0];
            var other_skid = row[5];
            var nodes = type[other_skid];
            if (nodes) {
              var count = nodes[node];
              nodes[node] = count ? count + 1 : 1;
            } else {
              nodes = {};
              nodes[node] = 1;
              type[other_skid] = nodes;
            }
            return o;
          }, {0: {}, 1: {}}) // 0 is pre and 1 is post
        };
      },
      function(skid) {
        console.log("Could not load arbor" + nns.getName(skid) + "  #" + skid);
      },
      function() {
        resolve(arbors);
      });
    });
  };

  /**
   * Run filter set on arbors.
   *
   * @param {Object} skeletonArbors  Maps skeleton IDs to arbor info objects
   * @param {Bool}   addRadiusPoints Whether locations on a radius sphere around
   *                                 a node should be added as artificial points.
   */
  CATMAID.SkeletonFilter.prototype.execute = function(skeletonArbors, addRadiusPoints) {
    var rules = CATMAID.SkeletonFilter.getActiveRules(this.rules, this.skeletonIndex);

    // Collect nodes in an object to allow fast hash based key existence
    // checks. Also collect the location of the node. Whether OR or AND is
    // used for merging is specified as option. For the sake of simplicity, a
    // strict left-associative combination is used.
    var nodeCollection = {};
    var radiiCollection = {};
    var nNodes = 0;
    var mergeNodeCollection = (function(other, positions, payload, mergeMode) {
      var count = 0;
      if (CATMAID.UNION === mergeMode) {
        for (var node in other) {
          var existingNode = this[node];
          if (!existingNode) {
            var v = positions[node];
            var r = payload[node];
            this[node] = [[v.x, v.y, v.z], r];
            ++count;
          }
        }
      } else if (CATMAID.INTERSECTION === mergeMode) {
        // An intersection keeps only nodes that both the target and the
        // other set have.
        for (var node in this) {
          var existingNode = other[node];
          if (!existingNode) {
            delete this[node];
            --count;
          }
        }
      } else {
        throw new CATMAID.ValueError("Unknown merge mode: " + mergeMode);
      }
      nNodes += count;
    }).bind(nodeCollection);

    // Get final set of points by going through all rules and apply them
    // either to all skeletons or a selected sub-set. Results of individual
    // rules are OR-combined.
    var skeletonIndex = this.skeletonIndex;
    rules.forEach(function(rule) {
      // Pick source skeleton(s). If a rule requests to be only applied for
      // a particular skeleton, this working set will be limited to this
      // skeleton only.
      var sourceSkeletons;
      if (rule.validOnlyForSkid) {
        sourceSkeletons = {};
        sourceSkeletons[skid] = skeletons[skid];
      } else {
        sourceSkeletons = skeletonIndex;
      }

      // Apply rules and get back a set of valid nodes for each skeleton
      Object.keys(sourceSkeletons).forEach(function(skid) {
        // Get valid point list from this skeleton with the current filter
        var neuron = skeletonIndex[skid];
        var morphology = skeletonArbors[skid];
        var nodeCollection = rule.strategy.filter(skid, neuron,
            morphology.arbor, morphology.tags, morphology.partners,
            rule.options);
        // Merge all point sets for this rule. How this is done exactly (i.e.
        // OR or AND) is configured separately.
        if (nodeCollection) {
          mergeNodeCollection(nodeCollection, morphology.positions,
              morphology.radii, rule.mergeMode);
        }
      });
    });

    // Get a list of node positions. They are used as input for the convex
    // hull creation.
    var points = new Array(nNodes);
    var added = 0;
    for (var nodeId in nodeCollection) {
      var pr = nodeCollection[nodeId];
      var p = pr[0];
      points[added] = p;
      ++added;
      // Optionally, 12 points on an icosphere with the node's radis around the
      // node itself can be added.
      var radius = pr[1];
      if (addRadiusPoints && radius && radius > 0) {
        var radiusPoints = CATMAID.getIcoSpherePoints(p[0], p[1], p[2], radius);
        for (var i=0; i<radiusPoints.length; ++i) {
          // Will be appended after pre-allocated slots, so that above logic
          // still works.
          points.push(radiusPoints[i]);
        }
      }
    }

    return points;
  };

  CATMAID.SkeletonFilter.getActiveRules = function(rules, skeletonIndex) {
    var nns = CATMAID.NeuronNameService.getInstance();

    if (!rules || 0 === rules.length) {
      rules = defaultFilterRuleSet;
    }
    // Extract the set of rules defining this compartment. Also validate
    // skeleton constraints if there are any.
    return rules.reduce(function(m, rule) {
      var valid = true;

      if (rule.skip) {
        valid = false;
      } else if (rule.validOnlyForSkid || rule.validOnlyForName) {
        var skid = rule.validOnlyForSkid;
        // Validate
        if (skid) {
          if (!skeletonIndex[skid]) {
            valid = false;
          }
          // Consider name only if a skeleton ID is given
          var name = rule.validOnlyForName;
          if (name && nns.getName(skid) !== name) {
            valid = false;
          }
        }
      }

      if (valid) {
        m.push(rule);
      }

      return m;
    }, []);
  };

  /**
   * Node filter strategies can be used in skeletotn filter rules. They select
   * individual nodes fom skeletons/arbors.
   */
  CATMAID.NodeFilterStrategy = {
    "take-all": {
      name: "Take all nodes of each skeleton",
      filter: function(skeletonId, neuron, arbor, tags, partners) {
        return arbor.nodes();
      }
    },
    "endnodes": {
      name: "Only end nodes",
      filter: function(skeletonId, neuron, arbor, tags, partners, options) {
        var endIds = arbor.findBranchAndEndNodes().ends;
        var endNodes = {};
        var nodes = arbor.nodes();
        for (var i=0; i<endIds.length; ++i) {
          var nodeId = endIds[i];
          if (nodes.hasOwnProperty(nodeId)) {
            endNodes[nodeId] = nodes[nodeId];
          }
        }
        if (options.includeRoot) {
          var rootNode = nodes[arbor.root];
          if (rootNode) {
            endNodes[arbor.root] = rootNode;
          }
        }
        return endNodes;
      }
    },
    "branches": {
      name: "Only branch nodes",
      filter: function(skeletonId, neuron, arbor, tags, partners) {
        var branchIds = Object.keys(arbor.findBranchAndEndNodes().branches);
        var branchNodes = {};
        var nodes = arbor.nodes();
        for (var i=0; i<branchIds.length; ++i) {
          var nodeId = branchIds[i];
          if (nodes.hasOwnProperty(nodeId)) {
            branchNodes[nodeId] = nodes[nodeId];
          }
        }
        return branchNodes;
      }
    },
    // Options: tag
    'tags': {
      name: "Only tagged nodes",
      filter: function(skeletonId, neuron, arbor, tags, partners, options) {
        return tags[options.tag].reduce(addToObject, {}) || null;
      }
    },
    // Looks for soma tags on root nodes and make sure there is only one root
    // and only one soma tag in use on a neuron.
    "nuclei": {
      name: "Only nuclei",
      filter: function(skeletonId, neuron, arbor, tags, partnes, options) {
        // Expect only one use of the soma tag
        var somaTaggedNodes = tags["soma"];
        if (!somaTaggedNodes || 1 !== somaTaggedNodes.length) {
          console.log("Skeleton #" + skeletonId +
              " does not have exactly one node tagged with 'soma'");
          return {};
        }
        // Expect only one root
        var nRoots = 0;
        for (var child in arbor.edges) {
          if (!arbor.edges[child]) {
            ++nRoots;
            if (nRoots > 1) {
              console.log("Skeleton #" + skeletonId +
                  " has more than one root node");
              return {};
            }
          }
        }
        return somaTaggedNodes.reduce(addToObject, {}) || null;
      }
    },
    // Options: tag, expected
    "subarbor": {
      name: "Use a sub-arbor starting from a tag",
      filter: function(skeletonId, neuron, arbor, tags, partners, options) {
        var cuts = tags[options.tag];
        if (!cuts || (options.expected && cuts.length !== options.expected)) {
          console.log("CANNOT extract dendrite for " + neuron.name + ", cuts: " + cuts);
          return {};
        }
        return cuts.reduce(function(nodes, cut) {
          return $.extend(nodes, arbor.subArbor(cut).nodes());
        }, {});
      }
    },
    // Options: tagStart, tagEnd
    "single-region": {
      name: "Use a region",
      filter: function(skeletonId, neuron, arbor, tags, partners, options) {
        var start_cuts = tags[options.tagStart];
        var end_cuts = tags[options.tagEnd];
        if (!start_cuts || start_cuts.length !== 1 || !end_cuts || end_cuts.length !== 1) {
          console.log("CANNOT extract dendrite for " + neuron.name + ", wrong cuts: start_cuts: " + start_cuts + ", end_cuts: " + end_cuts);
          return null;
        }
        var order = arbor.nodesOrderFrom(arbor.root);
        var start = start_cuts[0];
        var end = end_cuts[0];
        if (order[start] > order[end] || start === end) {
          console.log("CANNOT extract dendrite for " + neuron.name + ", wrong order of cuts: start_cuts: " + start_cuts + ", end_cuts: " + end_cuts);
          return null;
        }
        var sub1 = arbor.subArbor(start);
        sub1.subArbor(end).nodesArray().forEach(function(node) {
          delete sub1.edges[node];
        });
        return sub1.nodes();
      }
    },
    // Options: tag, region
    "binary-split": {
      name: "Binary split",
      filter: function(skeletonId, neuron, arbor, tags, partners, options) {
        var cuts = tags[options.tag];
        if (!cuts || cuts.length !== 1) {
          console.log("CANNOT extract dendrite for " + neuron.name + ", cuts: " + cuts);
          return null;
        }
        if ("downstream" === options.region) {
          return arbor.subArbor(cuts[0]).nodes();
        } else if ("upstream" === options.region) {
          var dend = arbor.clone();
          arbor.subArbor(cuts[0]).nodesArray().forEach(function(node) {
            delete dend.edges[node];
          });
          return dend.nodes();
        } else {
          console.log("CANNOT extract dendrite for " + neuron.name + ", unknown region: " + neuron.strategy.region);
          return null;
        }
      }
    },
    // Find the positions of the source skeleton nodes pre- or ppostsynaptic to
    // another set of skeletons.
    "synaptic": {
      name: "Synaptic connections to other neurons",
      filter: function(skeletonId, neuron, arbor, tags, partners, options) {
        var selectedPartners;
        if ('pre' === options.relation) {
          selectedPartners = partners[0];
        } else if ('post' === options.relation) {
          selectedPartners = partners[1];
        } else if ('pre-or-post' === options.relation) {
          // Merge both pre and post connections into a new object
          selectedPartners = CATMAID.tools.deepCopy(partners[0]);
          for (var partnerId in partners[1]) {
            var postPartner = partners[1][partnerId];
            var p = selectedPartners[partnerId];
            if (p) {
              for (var treenodeId in postPartner) {
                p[treenodeId] = postPartner[treenodeId];
              }
            } else {
              selectedPartners[partnerId] = postPartner;
            }
          }
        } else {
          throw new CATMAID.ValuError("Unsupported relation: " + options.relation);
        }

        var synapticNodes = {};
        var partnerNeurons = options.otherNeurons;

        for (var partnerId in selectedPartners) {
          // Check if partners in option set are in actual partner set (or if
          // all partners should be used). Collect return all synaptic nodes
          // of the current skeleton
          if (!partnerNeurons || partnerNeurons[partnerId]) {
            var nodes = selectedPartners[partnerId];
            for (var nodeId in nodes) {
              synapticNodes[nodeId] = true;
            }
          }
        }

        return synapticNodes;
      }
    }
  };

  /**
   * A collection of UI creation methods for individual node filtering
   * strategies from CATMAID.NodeFilterStrategy members.
   */
  CATMAID.NodeFilterSettingFactories = {
    'take-all': function(container, options) {
      // Take all has no additional options
    },
    'endnodes': function(container, options) {
      // Option to include root
      var $includeRoot = CATMAID.DOM.createCheckboxSetting(
          "Include root node", false, "If checked, the root node will be treated as an end node.",
          function(e) { options.includeRoot = this.checked; });
      $(container).append($includeRoot);
    },
    'branches': function(container, options) {
      // There are no additional settings for branch node selection
    },
    'tags': function(container, options) {
      var $tag = CATMAID.DOM.createInputSetting("Tag", "",
          "A tag that every used node must have", function() {
            options.tag = this.value;
          });
      $(container).append($tag);
    },
    'nuclei': function(container, options) {
      // Nuclei has no additional options
    },
    'subarbor': function(container, options) {
      var $tag = CATMAID.DOM.createInputSetting("Tag", "",
          "A tag that every used node must have", function() {
            options.tag = this.value;
          });
      var $expected = CATMAID.DOM.createInputSetting("Expected", "",
          "Only take sub-arbor if tag is used the expected number of times",
          function() {
            options.expected = parseInt(this.value, 10);
          });
      $(container).append($tag);
      $(container).append($expected);
    },
    'single-region': function(container, options) {
      var $tagStart = CATMAID.DOM.createInputSetting("Start tag", "",
          "A tag used to find a node in a skeleton. The skelen is cut right before (upstream) this node, the remaining part is taken.", function() {
            options.tagStart = this.value;
          });
      var $tagEnd = CATMAID.DOM.createInputSetting("End tag", "",
          "A tag used to find a node in a skeleton. The skeleton is cut right before (upstream), the remaining part passes through the filter.", function() {
            options.tagEnd = this.value;
          });
      $(container).append($tagStart);
      $(container).append($tagEnd);
    },
    'binary-split': function(container, options) {
      // Default options
      options.region = "downstream";

      var $tag = CATMAID.DOM.createInputSetting("Tag", "",
          "Cut skeleton at tagged node", function() {
            options.tag = this.value;
          });
      var $region = CATMAID.DOM.createSelectSetting("Region",
          { "Downstream": "downstream", "Upstream": "upstream" },
          "Select which region relative to the cuts at tagged nodes should be allowed.",
          function() {
            options.region = this.value;
          }, options.region);

      $(container).append($tag);
      $(container).append($region);
    },
    'synaptic': function(container, options) {
      // Defaults
      options.relation = options.relation || 'post';
      // The skeleton source
      var availableSources = CATMAID.skeletonListSources.getSourceNames();
      var sourceOptions = availableSources.reduce(function(o, name) {
        o[name] = name;
        return o;
      }, {
        'None': 'None' // default to enforce active selection
      });

      var $otherNeurons = CATMAID.DOM.createSelectSetting("Source of synaptic neurons",
          sourceOptions, "Neurons from this source will be checked against having synapses with the working set. If \"None\" is selected, all synaptic nodes will be considered.",
          function(e) {
            // Get models from source to store in option set
            var source = this.value && this.value !== "None" ?
              CATMAID.skeletonListSources.getSource(this.value) : undefined;

            if (!source) {
              options.otherNeurons = null;
              return;
            }

            // Collect points based on current source list and current rule set
            options.otherNeurons = source.getSelectedSkeletonModels();
          }, 'None');

      var $relation = CATMAID.DOM.createSelectSetting("Relation of base set to above partners",
          { "Postsynaptic": "post", "Presynaptic": "pre" , "Pre- or postsynaptic": "pre-or-post"},
          "Select how a valid node of the base set (nodes to generate mesh) is related to partner neurons from other source.",
          function() {
            options.relation = this.value;
          }, options.relation);

      $(container).append($otherNeurons, $relation);
    }
  };

  // A default no-op filter rule that takes all nodes.
  var defaultFilterRuleSet = [
    new CATMAID.SkeletonFilterRule(CATMAID.NodeFilterStrategy['take-all'])
  ];

  var unitIcoSpherePoints = (function() {
    var t = (1.0 + Math.sqrt(5.0)) / 2.0;

    return [
      [-1,  t,  0],
      [ 1,  t,  0],
      [-1, -t,  0],
      [ 1, -t,  0],

      [ 0, -1,  t],
      [ 0,  1,  t],
      [ 0, -1, -t],
      [ 0,  1, -t],

      [ t,  0, -1],
      [ t,  0,  1],
      [-t,  0, -1],
      [-t,  0,  1]
    ];
  })();

  var copyPoint = function(p) {
    return [p[0], p[1], p[2]];
  };

  var addToPoint = function(x, y, z, p) {
    p[0] = p[0] + x;
    p[1] = p[1] + y;
    p[2] = p[2] + z;
    return p;
  };

  var multiplyComponents = function(m, p) {
    p[0] = p[0] * m;
    p[1] = p[1] * m;
    p[2] = p[2] * m;
    return p;
  };

  // create 12 vertices of a icosahedron
  CATMAID.getIcoSpherePoints = function(x, y, z, radius) {
    return unitIcoSpherePoints
      .map(copyPoint)
      .map(multiplyComponents.bind(null, radius))
      .map(addToPoint.bind(null, x, y, z));
  };

})(CATMAID);
