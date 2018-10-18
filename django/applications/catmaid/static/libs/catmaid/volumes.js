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
    this.project_id = options.project_id || null;
    this.user_id = options.user_id || null;
    this.editor_id = options.editor_id || null;
    this.title = options.name || '';
    this.comment = options.comment || '';
    this.edition_time = options.edition_time || null;
    this.creation_time = options.creation_time || null;
    this.selected = options.selected || false;
    this.annotations = options.annotations || [];
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
    this.set("preview", CATMAID.tools.getDefined(options.preview, true));
    this.set("previewColor", CATMAID.tools.getDefined(options.previewColor, '#FFFFFF'));
    this.set("previewOpacity", CATMAID.tools.getDefined(options.previewOpacity, 0.7));
    this.meshNeedsSync = true;
    this._previewMeshManager = null;
  };

  CATMAID.BoxVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.BoxVolume.prototype.constructor = CATMAID.BoxVolume;

  CATMAID.BoxVolume.prototype.init = function() {
    this.updateTriangleMesh();
    return this;
  };

  CATMAID.BoxVolume.prototype.clearPreviewData = function() {
    // If there is an existing removal function, call it.
    if (this._previewMeshManager) {
      CATMAID.tools.callIfFn(this._previewMeshManager.remove());
    }
  };

  CATMAID.BoxVolume.prototype.updateTriangleMesh = function(onSuccess, onError) {
    // Remove existing preview data, if there is any
    this.clearPreviewData();

    let work = this.createMesh();

    if (this.preview) {
      work = work
        .then(mesh =>
          CATMAID.BoxVolume.showCompartment(mesh, this.previewColor,
          this.previewOpacity))
        .then(meshInfo => {
          this._previewMeshManager = meshInfo.meshManager;
          return meshInfo.mesh;
        });
    }

    return work
      .then(mesh => {
        // Mesh is now up to date
        this.meshNeedsSync = false;
        this.set("mesh", mesh);
        if (CATMAID.tools.isFn(onSuccess)) {
          onSuccess(this, mesh);
        }
        return mesh;
      })
      .catch(onError);
  };

  CATMAID.BoxVolume.prototype.createMesh = function() {
    let points = [
      [this.minX, this.minY, this.minZ],
      [this.minX, this.minY, this.maxZ],
      [this.minX, this.maxY, this.minZ],
      [this.minX, this.maxY, this.maxZ],
      [this.maxX, this.minY, this.minZ],
      [this.maxX, this.minY, this.maxZ],
      [this.maxX, this.maxY, this.minZ],
      [this.maxX, this.maxY, this.maxZ],
    ];
    let faces = [
      [1, 0, 2], [1, 2, 3],
      [0, 4, 6], [0, 6, 2],
      [4, 5, 7], [4, 7, 6],
      [5, 1, 3], [5, 3, 7],
      [3, 2, 6], [3, 6, 7],
      [0, 1, 5], [0, 5, 4],
    ];
    return Promise.resolve([points, faces]);
  };

  /**
   * Create a convex hull and display it in the first available 3D viewer.
   */
  CATMAID.BoxVolume.showCompartment = function(mesh, color, opacity) {
    var list = mesh ? [mesh] : [];
    var meshManager = CATMAID.BoxVolume.showMeshesIn3DViewer(
        list, color, opacity);
    return Promise.resolve({
      mesh: mesh,
      meshManager: meshManager
    });
  };

  /**
   * Display meshes in the passed in object in the first opened 3D viewer. Mesh
   * IDs should be mapped to an array following this format:
   * [[points], [[faces]].
   *
   * @returns an object with a setColor() and remove() function function that
   * operate on the addeded meshes.
   */
  CATMAID.BoxVolume.showMeshesIn3DViewer = function(meshes, color, opacity) {
    var w = CATMAID.WebGLApplication.prototype.getFirstInstance();
    if (!w || !w.space) {
      // Silently fail if no 3D viewer is open
      return;
    }

    return w.showTriangleMeshes(meshes, color, opacity);
  };

  CATMAID.BoxVolume.prototype.set = function(field, value, forceOverride, noSyncCheck) {
    // Check parameter for influence on mesh *before* the prototype is called,
    // this makes sure all property change event handlers can already know that
    // the mesh needs to be updated. In case a mesh set directly no sync is
    // needed anymore.
    if (!noSyncCheck) {
      if (field == 'mesh') {
        this.meshNeedsSync = false;
      } else if (field !== "id" && field !== "title" && field !== 'comment' &&
          field !== 'previewColor' && field !== 'previewOpacity') {
        this.meshNeedsSync = true;
      }
    }

    CATMAID.Volume.prototype.set.call(this, field, value, forceOverride);

    if (this.preview && this._previewMeshManager) {
      if (field === 'previewColor' || field === 'previewOpacity') {
        this._previewMeshManager.setColor(this.previewColor, this.previewOpacity);
      }
    }
  };

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
    this.set("previewColor", CATMAID.tools.getDefined(options.previewColor, '#FFFFFF'));
    this.set("previewOpacity", CATMAID.tools.getDefined(options.previewOpacity, 0.7));
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
      } else if (field !== "id" && field !== "title" && field !== 'comment' &&
          field !== 'previewColor' && field !== 'previewOpacity') {
        this.meshNeedsSync = true;
      }
    }

    CATMAID.Volume.prototype.set.call(this, field, value, forceOverride);

    if (this.preview && this._previewMeshManager) {
      if (field === 'previewColor' || field === 'previewOpacity') {
        this._previewMeshManager.setColor(this.previewColor, this.previewOpacity);
      }
    }
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
    var update = (function(mesh, meshManager) {
      // Mesh is now up to date
      this.meshNeedsSync = false;
      this.set("mesh", mesh);
      this._previewMeshManager = meshManager;

      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess(this, mesh);
      }
    }).bind(this);

    // Remove existing preview data, if there is any
    this.clearPreviewData();

    var createMesh = this.createMesh.bind(this);
    if (this.preview) {
      CATMAID.ConvexHullVolume.showCompartment(skeletons, rules, this.respectRadius,
          this.previewColor, this.previewOpacity, createMesh, update);
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
    if (this._previewMeshManager) {
      CATMAID.tools.callIfFn(this._previewMeshManager.remove());
    }
  };

  /**
   * For every compartment, find the synapses from KC onto MBONs of the
   * compartment and generate the convex hull of such synapses, constructed as
   * a mesh.  Returns a map of compartment name vs mesh.
   */
  var createCompartments = function(skeletons, compartments, skeleton_arbors,
      respectRadius, createMesh) {
    // Map location and radius to result node IDs
    var mapResultNode = function(skeletonId, nodeId) {
      var arborInfo = skeleton_arbors[skeletonId];
      var v = arborInfo.positions[nodeId];
      var r = arborInfo.radii[nodeId];
      return [[v.x, v.y, v.z], r];
    };
    var result = {};
    return Promise.all(Object.keys(compartments).map(function(name) {
        var rules = compartments[name];
        var filter = new CATMAID.SkeletonFilter(rules, skeletons);
        return filter.execute(mapResultNode)
          .then(function(filteredNodes) {
            var points = filter.getNodeLocations(filteredNodes.nodes, respectRadius, filteredNodes.nNodes);
            if (0 === points.length) {
              console.log("Found zero points for compartment " + name);
              return;
            }

            // Compute mesh
            var mesh = createMesh(points);

            result[name] = [points, mesh];
          });
      }))
      .then(function() {
        return result;
      });
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
    CATMAID.SkeletonFilter.fetchArbors(Object.keys(skeletons), true, true, true)
        .then(function(arbors) {
          return createCompartments(skeletons, compartments, arbors,
              respectRadius, createMesh);
        })
        .then(function(meshes) {
          onSuccess(meshes);
        })
        .catch(CATMAID.handleError);
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
   * @returns an object with a setColor() and remove() function function that
   * operate on the addeded meshes.
   */
  CATMAID.ConvexHullVolume.showMeshesIn3DViewer = function(meshes, color, opacity) {
    var w = CATMAID.WebGLApplication.prototype.getFirstInstance();
    if (!w || !w.space) {
      // Silently fail if no 3D viewer is open
      return;
    }

    return w.showTriangleMeshes(meshes, color, opacity);
  };

  /**
   * Create and display meshes in the first available 3D viewer.
   */
  CATMAID.ConvexHullVolume.showCompartments = function(skeletons, compartments,
      respectRadius, color, opacity, createMesh, onSuccess) {
    CATMAID.ConvexHullVolume.createTriangleMeshes(skeletons, compartments,
        createMesh, respectRadius,
        function(meshes) {
          var meshManager = CATMAID.ConvexHullVolume.showMeshesIn3DViewer(
              meshes, color, opacity);
          if (CATMAID.tools.isFn(onSuccess)) {
            onSuccess(meshes, meshManager);
          }
        });
  };

  /**
   * Create a convex hull and display it in the first available 3D viewer.
   */
  CATMAID.ConvexHullVolume.showCompartment = function(skeletons, rules, respectRadius,
      color, opacity, createMesh, onSuccess) {
    CATMAID.ConvexHullVolume.createTriangleMesh(skeletons, rules,
        respectRadius, createMesh, function(mesh) {
      var list = mesh ? [mesh] : [];
      var meshManager = CATMAID.ConvexHullVolume.showMeshesIn3DViewer(
          list, color, opacity);
      if (CATMAID.tools.isFn(onSuccess)) {
        onSuccess(mesh, meshManager);
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
        this._previewMeshManager = CATMAID.ConvexHullVolume.showMeshesIn3DViewer(
            list, this.previewColor, this.previewOpacity);
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

