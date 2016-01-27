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
    this.set("neuronSource", options.neuronsource || undefined);
    this.set("rules", options.rules || []);
    this.set("mesh", this.createTriangleMesh())
  };

  /**
   * Create a triangle mesh from the filtered nodes of the currently selected
   * neuron source. The current filter rules are taken into account.
   */
  CATMAID.ConvexHullVolume.prototype.createTriangleMesh = function() {
    // If there is no neuron source, there is no point. Return an empty mesh
    // representation (no vertices, no faces).
    if (!this.neuronSource) {
      return [[], []];
    }

    // Collect points
    var skeletons = this.source.getSelectedSkeletonModels();

    // Apply filters to obtain final set of points
    var points = this.rules.reduce(function(points, rule) {
      //
      return points;
    }, []);

    var rules = this.rules;

    var container = CATMAID.ConvexHullVolume.createTriangleMeshes(
        skeletons, rules, function(arbors) {
      var container = CATMAID.ConvexHullVolume.createTriangleMeshes(
          skeletons, arbors, rules);

    });
  };

  /**
   * For every compartment, find the synapses from KC onto MBONs of the
   * compartmenr and generate the convex hull of such synapses, constructed as
   * a mesh.  Returns a map of compartment name vs mesh.
   */
  var createCompartments = function(skeletons, compartments, skeleton_arbors) {
    var nns = CATMAID.NeuronNameService.getInstance();
    return Object.keys(compartments).reduce(function(o, name) {
      // Extract the set of rules defining this compartment. Also validate
      // skeleton constraints if there are any.
      var rules = compartments[name].reduce(function(m, rule) {
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
      // checks.
      var nodeCollection = {};
      var collectNode = (function(node) {
        var existingNode = this[node];
        if (!existingNode) {
          this[node] = true;
        }
      }).bind(nodeCollection);

      // Get final set of points by going through all rules and apply them
      // either to all skeletons or a selected sub-set. Results of individual
      // rules are OR-combined.
      rules.forEach(function(rule) {
        // Pick source skeleton(s). If a rule requests to be only applied for
        // a particular skeleton, this working set will be limited to this
        // skeleton only.
        var souceSkeletons;
        if (rule.validOnlyForSkid) {
          sourceSkeletons = {};
          sourceSkeletons[skid] = skeletons[skid];
        } else {
          sourceSkeletons = skeletons;
        }

        // Apply rules and get back a set of valid nodes for each skeleton
        Object.keys(sourceSkeletons).map(function(skid) {
          // Get valid point list from this skeleton with the current filter
          var neuron = skeletons[skid];
          var morphology = skeleton_arbors[skid];
          return rule.filter(skid, neuron, morphology);
        }).forEach(function(nodes) {
          // Merge all point sets for this rule with OR, i.e. collect all
          // valid points produced by all matching rules over all skeletons.
          nodes.forEach(addNode);
        });
      });

      // Get actual positions of final point set
      var points = Object.keys(nodeCollection).map(function(nodeId) {
        var v = morphology.positions[nodeId];
        return [v.x, v.y, v.z];
      });

      if (0 === points.length) {
        console.log("Found zero points for compartment " + name);
        return o;
      }

      // Compute the convex hull
      var hull = CATMAID.geometryTools.convexHull(points);

      o[name] = hull;
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
  CATMAID.ConvexHullVolume.createTriangleMeshes = function(skeletons, rules, onSuccess) {
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
      var meshes = createCompartments(skeletons, rules, arbors);
      onSuccess(meshes);
    });
  };

  /**
   * Create and display meshes in the first available 3D viewer.
   */
  CATMAID.ConvexHullVolume.showCompartments = function(skeletons, rules, arbors) {
    CATMAID.ConvexHullVolume.createTriangleMeshes(skeletons, rules, function(meshes) {
      var w = CATMAID.WebGLApplication.prototype.getFirstInstance();
      Object.keys(meshes).forEach(function(name) {
          // Make the mesh with the faces specified in the hull array
          var geom = new THREE.Geometry();
          points.forEach(function(p) {
            geom.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
          });
          hull.forEach(function(indices) {
            geom.faces.push(new THREE.Face3(indices[0], indices[1], indices[2]));
          });
          geom.computeFaceNormals();
          var mesh = new THREE.Mesh(
              geom,
              new THREE.MeshBasicMaterial(
                 {color: 0x0000ff,
                  opacity: 1.0,
                  transparent: true,
                  wireframe: false,
                  wireframeLinewidth: 10,
                  morphNormals: true}));

          var wfh = new THREE.WireframeHelper(mesh, 0x000000);
          wfh.material.linewidth = 2
        var pair = meshes[name];
        w.space.add(pair[0]);
        w.space.add(pair[1]);
      });
    });
  };

  /**
   * Get a JSON representation of this object.
   */
  CATMAID.ConvexHullVolume.prototype.serialize = function() {
    this.trimesh = this.createTriangleMesh();

    return {
      type: "trimesh",
      title: this.title,
      comment: this.comment,
      mesh: this.trimesh
    };
  };

  /**
   * A skeleton rule filters accepts or reject a skeleton. Besides a filtering
   * strategy it has an optional list skeletons it is valid for. If this list is
   * not empty the application of this rule will be ignored for all other
   * skeletons.
   */
  CATMAID.SkeletonRule = function(strategies, skid, name) {
    this.skip = false;
    this.strategy = strategies;
    this.validOnlyForSkid = skid;
    this.validOnlyForName = name;
  };

  CATMAID.NodeFilter = {
    'tags': {
      name: "Only tagged nodes",
      filter: function(arbor, node, options) {
        return true;
      }
    },
    // Looks for soma tags on root nodes and make sure there is only one root
    // and only one soma tag in use on a neuron.
    "nuclei": {
      name: "Only nuclei",
    },
    // Apply filters to all input nodes
    "filtered nodes": {
      name: "Only certain filtered nodes",
    },
    "subarbor": {
      name: "Use a sub-arbor starting from a tag",
    },
    "single-region": {
      name: "Use a region",
    },
    "binary-split": {
      name: "Binary split",
    },
    "synapse": {
      name: "Synapses",
      test: function(skeleton, neuron, morphology, options) {
        var post = morphology.partners[1];
        var dendrite = extractDendriticNodes(morphology.arbor, morphology.tags, neuron);
        return Object.keys(post).filter(function(skid) {
          if (options.otherNeurons[skid]) {
            var nodes = post[skid];
            Object.keys(nodes).forEach(function(node) {
              if (dendrite[node]) {
                  targetSet.push(node);
              }
            });
          }
          return false;
        });
      }
    },
    // Return only points that are part of particular skeletons
    "on-skeletons": {
      name: "Points on specific skeletons",
      filter: function(skeleton, neuron, morphology, options) {
        return [];
      }
    },
    "take-all": {
      name: "Take all nodes of each skeleton",
      filter: function(skeletonId, neuron, morphology) {
        // TODO: return all nodes
        return [];
      }
    },
    'postsynaptic-to': {

    }
  };

  CATMAID.ConvexHullVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.ConvexHullVolume.prototype.constructor = CATMAID.ConvexHullVolume;

})(CATMAID);

