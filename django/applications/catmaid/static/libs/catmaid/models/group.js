(function(CATMAID) {

  "use strict";

  let Group = {};

  /**
   * List all groups, optionally only the ones a particular user is member of.
   *
   * @params memberId {Number} (optional) User ID to list groups for.
   * @returns {Promise} Resolves when
   */
  Group.list = function(memberId) {
    return CATMAID.fetch('/groups/', 'GET', {
      member_id: memberId,
    });
  };

  Group.updateGroupCache = function() {
    return Group.list()
      .then(groups => {
        CATMAID.groups.clear();
        for (let entry of groups) {
          CATMAID.groups.set(entry.id, entry.name);
        }
      });
  };

  // Export into namespace
  CATMAID.Group = Group;

  CATMAID.groups = new Map();

})(CATMAID);
