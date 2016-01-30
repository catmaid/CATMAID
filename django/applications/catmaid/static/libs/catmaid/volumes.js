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
   * Set a particular field to a given value. If this changes an existing value,
   * the "property changed" event is triggered.
   */
  CATMAID.Volume.prototype.set = function(field, value) {
    var oldValue = this[field];
    if (oldValue !== value) {
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
      requestQueue.register(CATMAID.makeURL(project.id + "/volumes/add"), "POST",
          this.serialize(), CATMAID.jsonResponseHandler(function(json) {
            if (json.success) {
              CATMAID.msg("Success", "A new volume was created");
            } else {
              CATMAID.warn("Unknown status");
            }
          }));
    } else {
      requestQueue.register(CATMAID.makeURL(project.id + "/volumes/" + this.id + "/"),
          "POST", this.serialize(), CATMAID.jsonResponseHandler(function(json) {
            if (json.success) {
              CATMAID.msg("Changes saved", "The volume has been udpated");
            } else {
              CATMAID.warn("Unknown status");
            }
          }));
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
    this.set("id", options.id || null);
    this.set("title", options.title || "Convex hull volume");
    this.set("comment", options.comment || undefined);
    this.set("neuronSourceName", options.neuronSourceName || undefined);
    this.set("rules", options.rules || []);
    this.set("preview", options.rules || true);
    this.updateTriangleMesh();
  };

  CATMAID.ConvexHullVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.ConvexHullVolume.prototype.constructor = CATMAID.ConvexHullVolume;

  /**
   * Create a triangle mesh from the filtered nodes of the currently selected
   * neuron source. The current filter rules are taken into account.
   */
  CATMAID.ConvexHullVolume.prototype.updateTriangleMesh = function(onSuccess) {
    // If there is no neuron source, there is no point. Return an empty mesh
    // representation (no vertices, no faces).
    var source = this.neuronSourceName ?
      CATMAID.skeletonListSources.getSource(this.neuronSourceName) : undefined;

    if (!source) {
      return [[], []];
    }

    // Collect points based on current source list and current rule set
    var skeletons = source.getSelectedSkeletonModels();
    var rules = this.rules;
    // On successful mesh generation, the mesh will be stored in the volume.
    var update = (function(mesh, removeMesh) {
      this.set("mesh", mesh);
      this._removePreviewMesh = removeMesh;
      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess(this, mesh);
      }
    }).bind(this);

    // Remove existing preview data, if there is any
    this.clearPreviewData();

    if (this.preview) {
      CATMAID.ConvexHullVolume.showCompartment(skeletons, rules, update);
    } else {
      CATMAID.ConvexHullVolume.createTriangleMesh(skeletons, rules, update);
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
   * compartmenr and generate the convex hull of such synapses, constructed as
   * a mesh.  Returns a map of compartment name vs mesh.
   */
  var createCompartments = function(skeletons, compartments, skeleton_arbors) {
    var nns = CATMAID.NeuronNameService.getInstance();
    return Object.keys(compartments).reduce(function(o, name) {
      var rules = compartments[name];
      if (!rules || 0 === rules.length) {
        rules = defaultFilteRuleSet;
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
      var nNodes = 0;
      var mergeNodeCollection = (function(other, positions, mergeMode) {
        var count = 0;
        if (CATMAID.UNION === mergeMode) {
          for (var node in other) {
            var existingNode = this[node];
            if (!existingNode) {
              var v = positions[node];
              this[node] = [v.x, v.y, v.z];
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
              morphology.arbor, morphology.tags, rule.options);
          // Merge all point sets for this rule. How this is done exactly (i.e.
          // OR or AND) is configured separately.
          mergeNodeCollection(nodeCollection, morphology.positions,
              rule.mergeMode);
        });
      });

      // Get a list of node positions. They are used as input for the convex
      // hull creation.
      var points = new Array(nNodes);
      var added = 0;
      for (var nodeId in nodeCollection) {
        points[added] = nodeCollection[nodeId];
        ++added;
      }
      if (0 === points.length) {
        console.log("Found zero points for compartment " + name);
        return o;
      }

      // Compute the convex hull
      var hull = CATMAID.geometryTools.convexHull(points);

      o[name] = [points, hull];
      return o;
    }, {});
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
  CATMAID.ConvexHullVolume.createTriangleMeshes = function(skeletons, compartments, onSuccess) {
    // Stop if there are no skeletons
    if (skeletons.length === 0) {
      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess([[], []]);
      }
    }

    // Create mesh by creating the convex hull around a set of points. These
    // points are collected through a set of rules for an input set of neurons.
    fetchArbors(Object.keys(skeletons), function(arbors) {
      // Create mesh
      var meshes = createCompartments(skeletons, compartments, arbors);
      onSuccess(meshes);
    });
  };

  /**
   * Create a triangle mesh from the filtered nodes of the passed in list of
   * skeletons. This process can be parameterized with a set of rules.
   */
  CATMAID.ConvexHullVolume.createTriangleMesh = function(skeletons, rules, onSuccess) {
    var name = 'compartment';
    var compartments = {};
    compartments[name] = rules;
    CATMAID.ConvexHullVolume.createTriangleMeshes(skeletons, compartments, function(meshes) {
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
    if (!w) {
      // Silently fail if no 3D viewer is open
      return;
    }

    var addedObjects = [];

    Object.keys(meshes).forEach(function(name) {
      var mesh = meshes[name];
      var points = mesh[0];
      var hull = mesh[1];
      // Make the mesh with the faces specified in the hull array
      var geom = new THREE.Geometry();
      points.forEach(function(p) {
        this.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
      }, geom);
      hull.forEach(function(indices) {
        this.faces.push(new THREE.Face3(indices[0], indices[1], indices[2]));
      }, geom);
      geom.computeFaceNormals();
      var mesh = new THREE.Mesh(
          geom,
          new THREE.MeshLambertMaterial(
             {color: 0x0000ff,
              opacity: 1.0,
              transparent: true,
              wireframe: false,
              wireframeLinewidth: 10,
              morphTargets: true,
              morphNormals: true}));

      var wfh = new THREE.WireframeHelper(mesh, 0x000000);
      wfh.material.linewidth = 2;
      w.space.add(mesh);
      w.space.add(wfh);
      this.push(mesh);
      this.push(wfh);
    }, addedObjects);

    w.space.render();

    return function() {
      addedObjects.forEach(function(o) {
          this.remove(o);
      }, w.space);
      w.space.render();
    };
  };

  /**
   * Create and display meshes in the first available 3D viewer.
   */
  CATMAID.ConvexHullVolume.showCompartments = function(skeletons, compartments, onSuccess) {
    CATMAID.ConvexHullVolume.createTriangleMeshes(skeletons, compartments,
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
  CATMAID.ConvexHullVolume.showCompartment = function(skeletons, rules, onSuccess) {
    CATMAID.ConvexHullVolume.createTriangleMesh(skeletons, rules, function(mesh) {
      var removeMeshes = CATMAID.ConvexHullVolume.showMeshesIn3DViewer([mesh]);
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

  /**
   * Node filter strategies can be used in skeletotn filter rules. They select
   * individual nodes fom skeletons/arbors.
   */
  CATMAID.NodeFilterStrategy = {
    "take-all": {
      name: "Take all nodes of each skeleton",
      filter: function(skeletonId, neuron, arbor, tags) {
        return arbor.nodes();
      }
    }
  };

  // A default no-op filter rule that takes all nodes.
  var defaultFilteRuleSet = [
    new CATMAID.SkeletonFilterRule(CATMAID.NodeFilterStrategy['take-all'])
  ];

})(CATMAID);

