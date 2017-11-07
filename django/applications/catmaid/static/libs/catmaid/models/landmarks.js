/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with labels on nodes. All of them
   * return promises.
   */
  var Landmarks = {

    /**
     * Create a new landmark with the specified name.
     */
    add: function(projectId, name) {
      return CATMAID.fetch(projectId + '/landmarks/', 'PUT', {
          name: name
        });
    },

    /**
     * Delete an existing landmark with the passed in ID.
     */
    delete: function(projectId, landmarkId) {
      return CATMAID.fetch(projectId + '/landmarks/' + landmarkId + '/', 'DELETE');
    },

    /**
     * Create a new group with the specified name.
     */
    addGroup: function(projectId, name) {
      return CATMAID.fetch(projectId + '/landmarks/groups/', 'PUT', {
          name: name
        });
    },

    /**
     * Delete a landmark group. This requires can_edit permissions for the
     * requesting user on that landmark group.
     */
    deleteGroup: function(projectId, groupId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId + '/', 'DELETE');
    },

    /**
     * Update the landmarks linked to a particular landmark group.
     */
    updateGroupMembers: function(projectId, groupId, newMemberIds) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId + '/', 'POST', {
        members: newMemberIds.length === 0 ? 'none' : newMemberIds
      });
    }
  };

  // Export namespace
  CATMAID.Landmarks = Landmarks;

})(CATMAID);
