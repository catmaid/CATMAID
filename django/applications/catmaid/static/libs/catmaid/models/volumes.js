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
  };

  // Add events
  CATMAID.asEventSource(Volumes);
  Volumes.EVENT_VOLUME_ADDED = "volume_added";

  // Export voume namespace into CATMAID namespace
  CATMAID.Volumes = Volumes;

})(CATMAID);
