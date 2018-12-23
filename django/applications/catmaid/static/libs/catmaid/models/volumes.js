/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with volumes. All of them return
   * promises.
   */
  var Volumes = {

    /**
     * Get all volumes in a project.
     *
     * @param {integer} projectId        The project the node is part of
     *
     * @returns {Object} Promise that is resolved with a list of objects
     *                   representing volumes.
     */
    listAll: function(projectId, skeletonIds) {
      var url = projectId + '/volumes/';
      let method = skeletonIds ? 'POST' : 'GET';
      return CATMAID.fetch(url, method, {
        'skeleton_ids': skeletonIds,
      }).then(function (volumes) {
        return volumes.data.map(function (vol) {
          return CATMAID.tools.buildObject(volumes.columns, vol);
        });
      });
    },

    /**
     * Retrieve a specific volume.
     *
     * @param {integer} projectId        The project the volume is part of
     * @param {integer} volumeId         The volume to retrieve
     *
     * @returns {Object} Promise that is resolved with the requested volume
     */
    get: function(projectId, volumeId) {
      var url = projectId + '/volumes/' + volumeId + '/';
      return CATMAID.fetch(url, 'GET');
    },

    /**
     * Update a specific volume with a new representation.
     *
     * @param {integer} projectId        The project the node is part of
     * @param {integer} volumeId         Id of volume to update
     * @param {string}  serializedVolume A serialized volume representation
     *
     * @returns {Object} Promise that is resolved with update information once
     *                   the update request returned successfully.
     */
    update: function(projectId, volumeId, serializedVolume) {
      var url = project.id + "/volumes/" + volumeId + "/";

      return CATMAID.fetch(url, "POST", serializedVolume).then(function(json) {
        return json;
      });
    },

    /**
     * Add a new volume.
     *
     * @param {integer} projectId        The project the node is part of
     * @param {integer} volumeId         Id of volume to update
     * @param {string}  serializedVolume A serialized volume representation
     *
     * @returns {Object} Promise that is resolved with update information once
     *                   the update request returned successfully.
     */
    add: function(projectId, serializedVolume) {
      var url = project.id + "/volumes/add";

      return CATMAID.fetch(url, "POST", serializedVolume).then(function(json) {
        CATMAID.Volumes.trigger(CATMAID.Volumes.EVENT_VOLUME_ADDED, json.volume_id);
        return json;
      });
    },

    /**
     * Converts simple X3D IndexedFaceSet and IndexedTriangleSet nodes to a VRML
     * representation.
     */
    x3dToVrml: function(x3d) {
      var vrml = x3d;
      var shapePrefix = "Shape {\n  geometry IndexedFaceSet {\n     ";

      // Indexed triangle set
      vrml = vrml.replace(/<IndexedTriangleSet[^>]*index='([-\d\s]*)'\s*>/gi,
          function(match, indexGroup) {
            var triIndices = indexGroup.split(" ");
            var nVertices = triIndices.length;
            // Mark end of face after each three points. This wouldn't be
            // required if the Three.js loader would support triangle sets.
            var indices = new Array(nVertices + Math.floor(nVertices / 3));
            var offset = 0;
            for (var i=0; i<triIndices.length; ++i) {
              indices[i + offset] = triIndices[i];
              if (0 === (i + 1) % 3) {
                ++offset;
                indices[i + offset] = "-1";
              }
            }

            return shapePrefix + "    coordIndex [" + indices.join(", ") + "]\n";
          }).replace(/<\/IndexedTriangleSet>/gi, "  }\n}");

      // Indexed face set
      vrml = vrml.replace(/<IndexedFaceSet[^>]*coordIndex='([-\d\s]*)'\s*>/gi,
          function(match, indexGroup) {
            var indices = indexGroup.split(" ");
            return shapePrefix + "    coordIndex [" + indices.join(", ") + "]\n";
          }).replace(/<\/IndexedFaceSet>/gi, "  }\n}");

      // Coordinates
      vrml = vrml.replace(/<Coordinate\s*point='([-.\d\s]*)'\s*\/>/gi,
          function(match, pointGroup) {
            var points = pointGroup.split(" ");
            var groupedPoints = new Array(Math.floor(points.length / 3));
            // Store points in component groups
            for (var i=0; i<groupedPoints.length; ++i) {
              var j = 3 * i;
              groupedPoints[i] = points[j] + " " + points[j+1] + " " + points[j+2];
            }
            return "  coord Coordinate {\n    point [" + groupedPoints.join(", ") + "]\n  }";
          });

      return "#VRML V2.0 utf8\n\n" + vrml;
    },

    /**
     * Convert an X3D volume representation to a list of THREE.js meshes.
     */
    x3dToMeshes: function(x3d) {
      var vrml = CATMAID.Volumes.x3dToVrml(x3d);
      var loader = new THREE.VRMLLoader();
      var scene = loader.parse(vrml);
      return scene.children;
    },

    /**
     * Create an inersector object which can be used to quickly test
     * intersection of a point with a regular THREE.js mesh.
     */
    makeIntersector: function(mesh, cellsPerDimension) {
      // If the cell is a buffer geometry, convert it to a regular geometry
      // first. In the future, we can optimize this to work on buffer geometries
      // directly.
      var geometry = mesh.geometry.isBufferGeometry ?
          (new THREE.Geometry()).fromBufferGeometry(mesh.geometry) : mesh.geometry;

      // Build 2D index of all triangle bounding boxes of the input mesh
      cellsPerDimension = cellsPerDimension === undefined ? 10 : cellsPerDimension;
      var triangleIndex = new Array(cellsPerDimension);
      for (var i=0; i<cellsPerDimension; ++i) {
        var col = triangleIndex[i] = new Array(cellsPerDimension);
        // Add an empty list to each grid cell
        for (var j=0; j<cellsPerDimension; ++j) {
          col[j] = [];
        }
      }
      // Make sure we hava a bounding box available.
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      var min = geometry.boundingBox.min;
      var max = geometry.boundingBox.max;
      var cellXEdgeLength = (max.x - min.x) / cellsPerDimension;
      var cellYEdgeLength = (max.y - min.y) / cellsPerDimension;
      var invCellXEdgeLength = 1 / cellXEdgeLength;
      var invCellYEdgeLength = 1 / cellYEdgeLength;
      // Add each face bounding box into index by splitting the extent of the
      // mesh in each dimension by <cellsPerDimension> and adding triangles into
      // their intersecting
      var faces = geometry.faces;
      var vertexFields = ['a', 'b', 'c'];
      var allVertices = geometry.vertices;
      var bb = new THREE.Box3();
      for (var i=0, max=faces.length; i<max; ++i) {
        // Get face bounding box
        var face = faces[i];
        var vertices = new Array(3);
        for (var j=0; j<3; ++j) {
          var vertex = allVertices[face[vertexFields[j]]];
          vertices[j] = vertex;
        }
        bb.setFromPoints(vertices);

        var cellMinX = Math.max(0, parseInt((bb.min.x - min.x) * invCellXEdgeLength, 10));
        var cellMinY = Math.max(0, parseInt((bb.min.y - min.y) * invCellYEdgeLength, 10));
        var cellMaxX = Math.min(cellsPerDimension - 1, parseInt((bb.max.x - min.x) * invCellXEdgeLength, 10));
        var cellMaxY = Math.min(cellsPerDimension - 1, parseInt((bb.max.y - min.y) * invCellYEdgeLength, 10));
        for (var x=cellMinX; x<=cellMaxX; ++x) {
          for (var y=cellMinY; y<=cellMaxY; ++y) {
            triangleIndex[x][y].push(vertices);
          }
        }
      }

      var direction = new THREE.Vector3(0, 0, 1);
      var ray = new THREE.Ray(undefined, direction);
      var seenDepths = new Set();
      var intersection = new THREE.Vector3();

      return {
        contains: function(point) {
          // Get array of triangles in the index cell of the XY projected point
          var x = parseInt((point.x - min.x) * invCellXEdgeLength);
          var y = parseInt((point.y - min.y) * invCellYEdgeLength);
          if (x < 0 || x >= cellsPerDimension || y < 0 || y >= cellsPerDimension) {
            return false;
          }
          // Shoot ray in Z direction (projected dimension in index) through all
          // found triangles.
          var triangles = triangleIndex[x][y];
          ray.origin.copy(point);
          var intersections = 0;
          seenDepths.clear();
          for (var i=0, max=triangles.length; i<max; ++i) {
            var t = triangles[i];
            var intersectionResult = ray.intersectTriangle(t[0], t[1], t[2], false, intersection);
            // Only count intersections at different distances, otherwise
            // adjacent triangles are hit individually, which skews the
            // counting. We actually want to count surfaces, not triangles.
            if (intersectionResult && !seenDepths.has(intersection.z)) {
              seenDepths.add(intersection.z);
              ++intersections;
            }
          }
          return (intersections % 2) === 1;
        }
      };

    },

    /**
     * Find all skeleton intersecting volumes.
     *
     * @param projetId    {integer}   The project to operate in.
     * @param skeletonIds {integer[]} The skeletons to find intersecting volumes for.
     * @param annotation  {string}    (optional) An annotation that is expected
     *                                on intersecting volumes.
     * @returns Promise resolving with result.
     */
    findSkeletonInnervations: function(projectId, skeletonIds, annotation) {
      return CATMAID.fetch(projectId + '/volumes/skeleton-innervations', 'POST', {
        'skeleton_ids': skeletonIds,
        'annotation': annotation,
      });
    },

    /**
     * Find out if the passed in location intersects with the bounding box of
     * the passed in volume.
     *
     * @param {number} projectId The project to operate in.
     * @param {number} volumeId  The volume to check the boundinx box for.
     * @param {number} x         The X coordinate of the point to check.
     * @param {number} y         The Y coordinate of the point to check.
     * @param {number} z         The Z coordinate of the point to check.
     * @returns Promise resolving in intersection information.
     */
    intersectsBoundingBox: function(projectId, volumeId, x, y, z) {
      let url = project.id + "/volumes/" + volumeId + "/intersect";
      return CATMAID.fetch(url, "GET", {x: x, y: y, z: z});
    },
  };

  // Add events
  CATMAID.asEventSource(Volumes);
  Volumes.EVENT_VOLUME_ADDED = "volume_added";

  // Export voume namespace into CATMAID namespace
  CATMAID.Volumes = Volumes;

})(CATMAID);
