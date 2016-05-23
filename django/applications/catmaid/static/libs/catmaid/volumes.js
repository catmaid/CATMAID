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
      return CATMAID.Volumes.add(project.id, this.serialize())
        .then(function(result) {
          if (result.success) {
            CATMAID.msg("Success", "A new volume was created");
          } else {
            CATMAID.warn("Unknown status");
          }
        });
    } else {
      return CATMAID.Volumes.update(project.id, this.id, this.serialize())
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
  CATMAID.ConvexHullVolume.prototype.set = function(field, value, forceOverride, noSyncCheck) {
    // Check parameter for influence on mesh *before* the prototype is called,
    // this makes sure all property change event handlers can already know that
    // the mesh needs to be updated. In case a mesh set directly no sync is
    // needed anymore.
    if (!noSyncCheck) {
      if (field == 'mesh') {
        this.meshNeedsSync = false;
      } else if (field !== "id" && field !== "title" && field !== 'comment') {
        this.meshNeedsSync = true;
      }
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
      // Mesh is now up to date
      this.meshNeedsSync = false;
      this.set("mesh", mesh);
      this._removePreviewMesh = removeMesh;

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
    options.title = options.title || "Alpha shape volume";

    CATMAID.ConvexHullVolume.call(this, options);
    this.set("alpha", options.alpha || 5000);
    this.set("filterTriangles", false);
    // This field will hold an interval based mesh representation
    this.intervalMesh = null;
  };

  CATMAID.AlphaShapeVolume.prototype = Object.create(CATMAID.ConvexHullVolume.prototype);
  CATMAID.AlphaShapeVolume.prototype.constructor = CATMAID.AlphaShapeVolume;

  CATMAID.AlphaShapeVolume.prototype.init = function() {
    this.updateTriangleMesh();
    return this;
  };

  /**
   * Override property set method to know when the mesh representation needs to
   * be updated.
   */
  CATMAID.AlphaShapeVolume.prototype.set = function(field, value, forceOverride) {
    // If the alpha field was changed and a mesh is already available, there is
    // no update required, because alpha ranges are stored for individual
    // triangles.
    var refreshMesh = this.mesh && field === 'alpha' && value !== this.alpha;

    // If the triangle field was selected and the interval mesh has already
    // 2-simplices available, no mesh update is required. If it is deselected
    // and 3-simplices are available, no mesh update is required either.
    if (this.intervalMesh && this.intervalMesh.cells && field === 'filterTriangles') {
      refreshMesh = this.intervalMesh.cells[2] && true === value ||
                    this.intervalMesh.cells[3] && false === value;

    }

    if (refreshMesh) {
      this.meshNeedsSync = false;
    }
    CATMAID.ConvexHullVolume.prototype.set.call(this, field, value, forceOverride,
        refreshMesh);

    // After the field has been set, refresh display if only alpha changed
    if (refreshMesh) {
      var faces = this.filterMesh();
      var mesh = [this.mesh[0], faces];
      this.set("mesh", mesh, true);
      this.meshNeedsSync = false;
      // Refresh preview
      if (this.preview) {
        this.clearPreviewData();
        var list = this.mesh ? [this.mesh] : [];
        this._removePreviewMesh = CATMAID.ConvexHullVolume.showMeshesIn3DViewer(list);
      }
    }
  };

  /**
   * Update internal mesh representation with current alpha.
   */
  CATMAID.AlphaShapeVolume.prototype.filterMesh = function() {
    if (!this.intervalMesh) {
      return;
    }

    // Our alpha is already the inverse (1/a)
    var faces, alpha = this.alpha;
    if (this.filterTriangles) {
      faces = this.intervalMesh.cells[2].filter(function(c, i) {
        // Allow only faces on the boundary
        return this.b[i] < alpha && this.i[i] > alpha;
      }, this.intervalMesh.meta[2]);
    } else {
      var cells = this.intervalMesh.cells[3].filter(function(c, i) {
        // Allow only tetraheda that have a circumradius < alpha. We can't use
        // the interval based filtering here, because tetrahedrea are (in 3D) by
        // interior to the alpha shape by definition. Therefore all tetraheda
        // are filtered by their radius and the resulting boundary set is
        // computed.
        return this.r[i] < alpha;
      }, this.intervalMesh.meta[3]);
      faces = GeometryTools.simplicialComplexBoundary(cells);
    }

    return faces;
  };

  /**
   * Create the actual mesh from point cloud. This is a separate method to make
   * it easier for sub-types to override.
   */
  CATMAID.AlphaShapeVolume.prototype.createMesh = function(points) {
    // Don't compute 2-simplices if no triangles are needed (i.e. tetrahedra
    // will be looked at.
    var lowestSimplexK = this.filterTriangles ? 2 : 3;
    this.intervalMesh = CATMAID.alphaIntervalComplex(points, lowestSimplexK);
    var mesh = this.filterMesh();
    return mesh;
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

  /**
   * Test if the sphere defined by its center and radius is empty with respect to
   * the passed in points. Test checks squared distance between each point and the
   * sphere center, if it is equal/smaller radius, true is returned. False otherwise.
   */
  CATMAID.sphereIsEmpty = function(center, radiusSq, points) {
    radiusSq -= 0.0001; // Allow points on surface
    var abs = Math.abs;
    var d = center.length;
    for (var i=0, max=points.length; i<max; ++i) {
      var dSq = 0;
      var p = points[i];
      for (var j=0; j < d; ++j) {
        var c = p[j] - center[j];
        dSq += c * c;
      }
      if (dSq < radiusSq) {
        return false;
      }
    }
    return true;
  };

  /**
   * Simply return the value of "this" for the passed in index.
   */
  function indexToContent(i) {
    /* jshint validthis: true */
    return this[i];
  }

  /**
   * Calculate alpha complex.
   *
   * @param {integer} minD Minimum simplex order for which to provide intervals
   */
  CATMAID.alphaIntervalComplex = function(points, minD) {
    var util = GeometryTools.simplicialComplex;
    var circumradius = GeometryTools.circumradius;
    var circumcenter = GeometryTools.circumcenter;
    var sphereIsEmpty = CATMAID.sphereIsEmpty;

    // Get all Delaunay tetrahedrons
    var r = GeometryTools.delaunayTriangulate(points);

    if (0 === r.length) {
      return {
        'simplices': null,
        'intervals': null,
      };
    }

    // The boundary is the delaunay triangulation (i.e. the convex hull)
    var boundary = GeometryTools.simplicialComplexBoundary(r);

    // Order of start simplex, e.g. if there are four points we start with a
    // 3-simplex.
    var d = r[0].length - 1;

    // Simplices will have one entry for each d >= k >= minD, each one being an
    // array of simplices for each dimension.
    var simplices = {};
    // Meta will have one entry for each d >= k >= minD. This entry is an
    // object with two fields, "b" and "i", each one containing a list with
    // intervals, one for each simplex, matching the entries in the simplices
    // object for this dimension. The two field have the following meaning:
    //
    // b: A list of alpha values, one for each simplex, from which on a simplex is
    // part of the alpha complex. If alpha is smaller than the corresponding "i"
    // value, the simplex is part of the boundary.
    //
    // i: A list of alpha, one for each simplex, from which on a simplex is not
    // only part of the alpha complex, but specifically part of its interior.
    // Alpha values lower than this "i" value and at least a value of the
    // corresponding boundary value, indicate that the simplex in question is part
    // of the boundary.
    var meta = {};

    // d-simplices are the trivial case, they are inside the alpha complex by
    // definition.
    simplices[d] = r;
    var bD = [];
    var iD = new Array(r.length);
    var radiiD = new Array(r.length);
    meta[d] = {
      b: bD,
      i: iD,
      r: radiiD
    };
    var tmpDSimplex = new Array(r[0].length);
    for (var t=0, max=r.length; t<max; ++t) {
      var cell = r[t];
      for(var i=0; i<cell.length; ++i) {
        tmpDSimplex[i] = points[cell[i]];
      }
      // Radius of smallest circumsphere
      var sigmaI = circumradius(tmpDSimplex);
      // Boundary intervals are set to undefined by default, because by definition
      // all d-simplices are inside the complex, hence the interior is set to the
      // radius of the current simplex' circumsphere radius.
      iD[t] = sigmaI;
      // Store radius separately, because the i array is constructed differently
      // for lower rang simplices.
      radiiD[t] = sigmaI;
    }

    // Iterate over all lower order simplices until minimum order is reached
    minD = minD || 0;
    for (var k=d-1; k>=minD; --k) {
      // Find all k-simplices
      var kSimplices = util.unique(util.skeleton(simplices[k+1], k));
      simplices[k] = kSimplices;

      // Prepare interval and radii arrays
      var bK = new Array(kSimplices.length);
      var iK = new Array(kSimplices.length);
      var rK = new Array(kSimplices.length);
      meta[k] = {
        b: bK,
        i: iK,
        r: rK
      };

      if (0 === kSimplices.length) {
        break;
      }

      // Map k simplices to d simplices (e.g. triangles to tetrehedra). Also map k
      // simplices to its k+1 simplices (super simplices), which re-uses the d
      // simplex mapping, if k+1 == d.(so there is no need to recompute).
      var dSimplices = simplices[d];
      var dSimplexMap =util.incidence(kSimplices, dSimplices);
      var dMeta = meta[d];
      var superSimplices = simplices[k+1];
      var superSimplexMap =  (k + 1 === d) ? dSimplexMap : util.incidence(kSimplices, superSimplices);
      var superMeta = meta[k+1];
      var convexHullMap = util.incidence(kSimplices, boundary);

      var tmpKSimplex = new Array(kSimplices[0].length);
      for (var t=0, max=kSimplices.length; t<max; ++t) {
        var cell = kSimplices[t];
        // Construct each k-simplex for further inspection
        for(var i=0; i<cell.length; ++i) {
          tmpKSimplex[i] = points[cell[i]];
        }
        // Radius of smallest circumsphere
        var sigmaI = circumradius(tmpKSimplex);
        var centerI = circumcenter(tmpKSimplex);

        var a,b;
        // Find k+1-simplices and their indices
        var superSimplexIndicesT = superSimplexMap[t];
        var superSimplicesT = superSimplexIndicesT.map(indexToContent, superSimplices);
        // The cirumsphere of the k-simplex is empty if sigmaI is smaller than the
        // distance to the closest neighbor. The closest neighbor will be one of
        // the vertices of the current k-simplexes super-simplices (k+1). These in
        // turn are available through the index.
        var superSimplexTPoints = util.unique(util.skeleton(superSimplicesT, 0))
          .map(indexToContent, points);
        // FIXME: Remove k-simplex points from super set
        var circumsphereEmpty = sphereIsEmpty(centerI, sigmaI * sigmaI, superSimplexTPoints);
        if (circumsphereEmpty) {
          a = sigmaI;
        } else {
          // This simplex is only part of the alpha shape, if one of its
          // super-simplices is part of the alpha complex. This is if alpha is
          // bigger than the minimum of the (already computed) super-simplex
          // radii: a = min {aU | BU = (aU , bu), ∆U (k + 1)-Simplex, T ⊂ U}.
          // Find minimum super-simplex radii (already computed):
          var minSsa = superMeta.b[superSimplexIndicesT[0]];
          if (undefined === minSsa) {
            // TODO: Find better solution to have this work if k+1 == d? Currently
            // d-simplices have no boundary information assigned.
            var minSsa = superMeta.r[superSimplexIndicesT[0]];
          }
          for (var ss=1, ssmax=superSimplexIndicesT.length; ss<ssmax; ++ss) {
            var ssa = superMeta.b[superSimplexIndicesT[ss]];
            if (undefined === ssa) {
              // TODO: Find better solution to have this work if k+1 == d? Currently
              // d-simplices have no boundary information assigned.
              ssa = superMeta.r[superSimplexIndicesT[ss]];
            }
            if (ssa < minSsa) {
              minSsa = ssa;
            }
          }
          a = minSsa;
        }

        var isOnConvexHull = (0 !== convexHullMap[t].length);
        if (isOnConvexHull) {
          // If the current simplex is part of the convex hull of the point set,
          // then it is obviously on the boundary of the alpha complex.
          b = Number.POSITIVE_INFINITY;
        } else {
          // The simlex is not part of the convex hull and it lies in the interior
          // if and only if all its d-dimensional super-simplices are part of the
          // alpha-complex.
          var dSimplexIndicesT = dSimplexMap[t];
          var dSimplicesT = dSimplexIndicesT.map(indexToContent, dSimplices);
          var maxDsa = dMeta.r[dSimplexIndicesT[0]];
          for (var ds=1, dsmax=dSimplexIndicesT.length; ds<dsmax; ++ds) {
            var dsa = dMeta.r[dSimplexIndicesT[ds]];
            if (dsa < maxDsa) {
              maxDsa = dsa;
            }
          }
          b = maxDsa;
        }

        // Set new intervals
        bK[t] = a;
        iK[t] = b;
        rK[t] = sigmaI;
      }
    }

    return {
      'cells': simplices,
      'meta': meta,
      'maxD': d,
      'minD': minD
    };
  };

})(CATMAID);

