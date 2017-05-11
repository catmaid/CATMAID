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
    listAll: function(projectId) {
      var url = projectId + '/volumes/';
      return CATMAID.fetch(url, 'GET');
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
      var url = project.id + "/volumes/" + this.id + "/";

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
    }
  };

  // Add events
  CATMAID.asEventSource(Volumes);
  Volumes.EVENT_VOLUME_ADDED = "volume_added";

  // Export voume namespace into CATMAID namespace
  CATMAID.Volumes = Volumes;

})(CATMAID);
