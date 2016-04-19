/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* global
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  CATMAID.Volume = function(options) {
    options = options || {};
    this.id = options.id || null;
  };

  CATMAID.Volume.prototype = {};
  CATMAID.asEventSource(CATMAID.Volume.prototype);

  CATMAID.Volume.prototype.EVENT_PROPERTY_CHANGED = "volume_property_changed";

  /**
   * Set a particular field to a given value. If this changes an existing value
   * or forceOverride is truthy, the "property changed" event is triggered.
   */
  CATMAID.Volume.prototype.set = function(field, value, forceOverride) {
    var oldValue = this[field];
    if (oldValue !== value || forceOverride) {
      this[field] = value;
      this.trigger(this.EVENT_PROPERTY_CHANGED, field, value, oldValue);
    }
  };

  /**
   * Store a client-side volume to the server. If the ID field is null, a new
   * volume wil be created.
   */
  CATMAID.Volume.prototype.save = function() {
    if (null === this.id) {
      return CATMAID.fetch(project.id + "/volumes/add", "POST", this.serialize())
        .then(function(result) {
          if (result.success) {
            CATMAID.msg("Success", "A new volume was created");
          } else {
            CATMAID.warn("Unknown status");
          }
        });
    } else {
      return CATMAID.fetch(project.id + "/volumes/" + this.id + "/", "POST", this.serialize())
        .then(function(result) {
          if (result.success) {
            CATMAID.msg("Changes saved", "The volume has been udpated");
          } else {
            CATMAID.warn("Unknown status");
          }
        });
    }
  };

  /**
   * A box volume is a simple axis aligned box in project space.
   */
  CATMAID.BoxVolume = function(options) {
    options = options || {};
    CATMAID.Volume.call(this, options);
    this.set("minX", options.minX || 0);
    this.set("minY", options.minY || 0);
    this.set("minZ", options.minZ || 0);
    this.set("maxX", options.maxX || 1);
    this.set("maxY", options.maxY || 1);
    this.set("maxZ", options.maxZ || 1);
    this.set("title", options.title || "Box volume");
    this.set("comment", options.comment || undefined);
    this.set("id", options.id || null);
  };

  CATMAID.BoxVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.BoxVolume.prototype.constructor = CATMAID.BoxVolume;

  /**
   * Get a JSON representation of this object.
   */
  CATMAID.BoxVolume.prototype.serialize = function() {
    return {
      min_x: this.minX,
      min_y: this.minY,
      min_z: this.minZ,
      max_x: this.maxX,
      max_y: this.maxY,
      max_z: this.maxZ,
      title: this.title,
      comment: this.comment,
      type: "box"
    };
  };

  /**
   * A convex hull volume is a mesh generated around a set of points. These
   * points are not explicitly defined, but generated from a rule set. Such a
   * rule can for instance by a collection of synapse locations based on a tag.
   * could be for instance synapses. Different strategies are possible and
   * therefore they are defined separately. After such a volume has been added,
   * it is stored on the back-end as triangle mesh. Currently the generating
   * rules are not not stored along with them.
   */
  CATMAID.ConvexHullVolume = function(options) {
    options = options || {};
    CATMAID.Volume.call(this, options);
    this.set("id", CATMAID.tools.getDefined(options.id, null));
    this.set("title", options.title || "Convex hull volume");
    this.set("comment", options.comment || undefined);
    this.set("neuronSourceName", options.neuronSourceName || undefined);
    this.set("rules", options.rules || []);
    this.set("preview", CATMAID.tools.getDefined(options.preview, true));
    this.set("respectRadius", options.respectRadius || true);
    // Indicates if the mesh representation needs to be recomputed
    this.meshNeedsSync = true;
  };

  CATMAID.ConvexHullVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.ConvexHullVolume.prototype.constructor = CATMAID.ConvexHullVolume;

  CATMAID.ConvexHullVolume.prototype.init = function() {
    this.updateTriangleMesh();
    return this;
  };

  /**
   * Override property set method to know when the mesh representation needs to
   * be updated.
   */
  CATMAID.ConvexHullVolume.prototype.set = function(field, value, forceOverride) {
    // Check parameter for influence on mesh *before* the prototype is called,
    // this makes sure all property change event handlers can already know that
    // the mesh needs yo be updated.
    if (field !== 'mesh' && field !== "id" && field !== "title" && field !== 'comment') {
      this.meshNeedsSync = true;
    }
    CATMAID.Volume.prototype.set.call(this, field, value, forceOverride);
  };

  /**
   * Create a triangle mesh from the filtered nodes of the currently selected
   * neuron source. The current filter rules are taken into account.
   */
  CATMAID.ConvexHullVolume.prototype.updateTriangleMesh = function(onSuccess, onError) {
    // If there is no neuron source, there is no point. Return an empty mesh
    // representation (no vertices, no faces).
    var source = this.neuronSourceName ?
      CATMAID.skeletonListSources.getSource(this.neuronSourceName) : undefined;

    if (!source) {
      CATMAID.tools.callIfFn(onError, "No skeleton source defined");
      return [[], []];
    }

    // Collect points based on current source list and current rule set
    var skeletons = source.getSelectedSkeletonModels();
    var rules = this.rules;
    // On successful mesh generation, the mesh will be stored in the volume.
    var update = (function(mesh, removeMesh) {
      this.set("mesh", mesh);
      this._removePreviewMesh = removeMesh;
      // Mesh is now up to date
      this.meshNeedsSync = false;

      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess(this, mesh);
      }
    }).bind(this);

    // Remove existing preview data, if there is any
    this.clearPreviewData();

    var createMesh = this.createMesh.bind(this);
    if (this.preview) {
      CATMAID.ConvexHullVolume.showCompartment(skeletons, rules, this.respectRadius,
          createMesh, update);
    } else {
      CATMAID.ConvexHullVolume.createTriangleMesh(skeletons, rules, this.respectRadius,
          createMesh, update);
    }
  };

  /**
   * Since convex hull volumes can be displayed in the 3D viewer, this method
   * allows to remove added meshes from the 3D viewer.
   */
  CATMAID.ConvexHullVolume.prototype.clearPreviewData = function() {
    // If there is an existing removal function, call it.
    CATMAID.tools.callIfFn(this._removePreviewMesh);
  };

  /**
   * For every compartment, find the synapses from KC onto MBONs of the
   * compartment and generate the convex hull of such synapses, constructed as
   * a mesh.  Returns a map of compartment name vs mesh.
   */
  var createCompartments = function(skeletons, compartments, skeleton_arbors,
      respectRadius, createMesh) {
    var nns = CATMAID.NeuronNameService.getInstance();
    return Object.keys(compartments).reduce(function(o, name) {
      var rules = compartments[name];
      if (!rules || 0 === rules.length) {
        rules = defaultFilterRuleSet;
      }
      // Extract the set of rules defining this compartment. Also validate
      // skeleton constraints if there are any.
      rules = rules.reduce(function(m, rule) {
        var valid = true;

        if (rule.skip) {
          valid = false;
        } else if (rule.validOnlyForSkid || rule.validOnlyForName) {
          var skid = rule.validOnlyForSkid;
          // Validate
          if (skid) {
            if (!skeletons[skid]) {
              valid = false;
              console.log("Unmatched skeleton: #" + skid);
            }
            // Consider name only if a skeleton ID is given
            var name = rule.validOnlyForName;
            if (name && nns.getName(skid) !== name) {
              valid = false;
              console.log("Unmatched skeleton: " + rule.name + " # " + skid);
            }
          }
        }

        if (valid) {
          m.push(rule);
        }

        return m;
      }, []);

      // Collect nodes in an object to allow fast hash based key existence
      // checks. Also collect the location of the node. Whether OR or AND is
      // used for merging is specified as option. For the sake of simplicity, a
      // strict left-associative combination is used.
      var nodeCollection = {};
      var radiiCollection = {};
      var nNodes = 0;
      var mergeNodeCollection = (function(other, positions, radii, mergeMode) {
        var count = 0;
        if (CATMAID.UNION === mergeMode) {
          for (var node in other) {
            var existingNode = this[node];
            if (!existingNode) {
              var v = positions[node];
              var r = radii[node];
              this[node] = [[v.x, v.y, v.z], r];
              ++count;
            }
          }
        } else if (CATMAID.INTERSECTION === mergeMode) {
          for (var node in other) {
            var existingNode = this[node];
            // An intersection keeps only nodes that both the target and the
            // other set have.
            if (!existingNode) {
              delete this[node];
              --count;
            }
          }
        } else {
          throw new ValueError("Unknown merge mode: " + mergeMode);
        }
        nNodes += count;
      }).bind(nodeCollection);

      // Get final set of points by going through all rules and apply them
      // either to all skeletons or a selected sub-set. Results of individual
      // rules are OR-combined.
      rules.forEach(function(rule) {
        // Pick source skeleton(s). If a rule requests to be only applied for
        // a particular skeleton, this working set will be limited to this
        // skeleton only.
        var sourceSkeletons;
        if (rule.validOnlyForSkid) {
          sourceSkeletons = {};
          sourceSkeletons[skid] = skeletons[skid];
        } else {
          sourceSkeletons = skeletons;
        }

        // Apply rules and get back a set of valid nodes for each skeleton
        Object.keys(sourceSkeletons).forEach(function(skid) {
          // Get valid point list from this skeleton with the current filter
          var neuron = skeletons[skid];
          var morphology = skeleton_arbors[skid];
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
        if (respectRadius && radius && radius > 0) {
          var radiusPoints = CATMAID.getIcoSpherePoints(p[0], p[1], p[2], radius);
          for (var i=0; i<radiusPoints.length; ++i) {
            // Will be appended after pre-allocated slots, so that above logic
            // still works.
            points.push(radiusPoints[i]);
          }
        }
      }
      if (0 === points.length) {
        console.log("Found zero points for compartment " + name);
        return o;
      }

      // Compute mesh
      var mesh = createMesh(points);

      o[name] = [points, mesh];
      return o;
    }, {});
  };

  /**
   * Create the actual mesh from point cloud. This is a separate method to make
   * it easier for sub-types to override.
   */
  CATMAID.ConvexHullVolume.prototype.createMesh = function(points) {
    // Compute the convex hull
    return GeometryTools.convexHull(points);
  };

  /**
   * Fetch all arbors as compact arbors and parse them into an Arbor
   * instance, the positions, and the synapses, with the latter sorted in a
   * map of pre and post (0 and 1), and each with a map of partner skeleton ID
   * vs a map of treenode vs the number of times it is pre or post onto that
   * treenode.
   */
  var fetchArbors = function(skids, callback) {
    var nns = CATMAID.NeuronNameService.getInstance();
    var arbors = {};
    fetchSkeletons(
      skids,
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
        callback(arbors);
      });
  };

  /**
   * Create a triangle mesh from the filtered nodes of the currently selected
   * neuron source. The current filter rules are taken into account.
   */
  CATMAID.ConvexHullVolume.createTriangleMeshes = function(skeletons, compartments,
      respectRadius, createMesh, onSuccess) {
    // Stop if there are no skeletons
    if (skeletons.length === 0) {
      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess([[], []]);
      }
    }

    // Create mesh by creating the convex hull around a set of points. These
    // points are collected through a set of rules for an input set of neurons.
    var self = this;
    fetchArbors(Object.keys(skeletons), function(arbors) {
      var meshes = createCompartments(skeletons, compartments, arbors,
          respectRadius, createMesh);
      onSuccess(meshes);
    });
  };

  /**
   * Create a triangle mesh from the filtered nodes of the passed in list of
   * skeletons. This process can be parameterized with a set of rules.
   */
  CATMAID.ConvexHullVolume.createTriangleMesh = function(skeletons, rules,
      respectRadius, createMesh, onSuccess) {
    var name = 'compartment';
    var compartments = {};
    compartments[name] = rules;
    CATMAID.ConvexHullVolume.createTriangleMeshes(skeletons, compartments,
        respectRadius, createMesh, function(meshes) {
          if (CATMAID.tools.isFn(onSuccess)) {
            onSuccess(meshes[name]);
          }
        });
  };

  /**
   * Display meshes in the passed in object in the first opened 3D viewer. Mesh
   * IDs should be mapped to an array following this format:
   * [[points], [[faces]].
   *
   * @returns a function that removes the added meshes when called
   */
  CATMAID.ConvexHullVolume.showMeshesIn3DViewer = function(meshes) {
    var w = CATMAID.WebGLApplication.prototype.getFirstInstance();
    if (!w || !w.space) {
      // Silently fail if no 3D viewer is open
      return;
    }

    return w.showTriangleMeshes(meshes);
  };

  /**
   * Create and display meshes in the first available 3D viewer.
   */
  CATMAID.ConvexHullVolume.showCompartments = function(skeletons, compartments,
      respectRadius, createMesh, onSuccess) {
    CATMAID.ConvexHullVolume.createTriangleMeshes(skeletons, compartments,
        createMesh, respectRadius,
        function(meshes) {
          var removeMeshes = CATMAID.ConvexHullVolume.showMeshesIn3DViewer(meshes);
          if (CATMAID.tools.isFn(onSuccess)) {
            onSuccess(meshes, removeMeshes);
          }
        });
  };

  /**
   * Create a convex hull and display it in the first available 3D viewer.
   */
  CATMAID.ConvexHullVolume.showCompartment = function(skeletons, rules, respectRadius,
      createMesh, onSuccess) {
    CATMAID.ConvexHullVolume.createTriangleMesh(skeletons, rules,
        respectRadius, createMesh, function(mesh) {
      var list = mesh ? [mesh] : [];
      var removeMeshes = CATMAID.ConvexHullVolume.showMeshesIn3DViewer(list);
      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess(mesh, removeMeshes);
      }
    });
  };

  /**
   * Get a JSON representation of this object.
   */
  CATMAID.ConvexHullVolume.prototype.serialize = function() {
    // Currently, serialization expects the mesh to be generated already.
    return {
      type: "trimesh",
      title: this.title,
      comment: this.comment,
      mesh: JSON.stringify(this.mesh)
    };
  };

  /** An alpha-shape volume. See:
   *  https://github.com/mikolalysenko/alpha-shape
   *  https://en.wikipedia.org/wiki/Alpha_shape
   */
  CATMAID.AlphaShapeVolume = function(options) {
    // Preview is by default disabled for alpha shapes, they can take longer to
    // compute.
    options = options || {};
    options.preview = false;

    CATMAID.ConvexHullVolume.call(this, options);
    this.set("alpha", options.alpha || 0.000001);
  };

  CATMAID.AlphaShapeVolume.prototype = Object.create(CATMAID.ConvexHullVolume.prototype);
  CATMAID.AlphaShapeVolume.prototype.constructor = CATMAID.AlphaShapeVolume;

  CATMAID.AlphaShapeVolume.prototype.init = function() {
    this.updateTriangleMesh();
    return this;
  };

  /**
   * Create the actual mesh from point cloud. This is a separate method to make
   * it easier for sub-types to override.
   */
  CATMAID.AlphaShapeVolume.prototype.createMesh = function(points) {
    return GeometryTools.alphaShape(this.alpha, points);
  };

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
        } else {
          throw new CATMAID.ValuError("Unsupported relation: " + options.relation);
        }

        var synapticNodes = {};
        var partnerNeurons = options.otherNeurons;

        // Check if partners in option set are in actual partner set and if
        // their connection are of the requested type. Collect return all
        // synaptic nodes of the current skeleton
        Object.keys(selectedPartners).forEach(function(skid) {
          if (partnerNeurons[skid]) {
            var nodes = selectedPartners[skid];
            for (var nodeId in nodes) {
              synapticNodes[nodeId] = true;
            }
          }
        });

        return synapticNodes;
      }
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

