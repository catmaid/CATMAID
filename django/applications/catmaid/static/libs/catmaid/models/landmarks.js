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
     * List all landmarks in a project, optionally with location information.
     */
    list: function(projectId, with_locations) {
      return CATMAID.fetch(project.id +  "/landmarks/", "GET", {
          with_locations: with_locations
        });
    },

    /**
     * Get details on a landmark.
     */
    get: function(projectId, landmarkId, with_locations) {
      return CATMAID.fetch(projectId + '/landmarks/' + landmarkId + '/', 'GET', {
        with_locations: !!with_locations
      });
    },

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
     * Delete all passed in landmarks.
     */
    deleteAll: function(projectId, landmarkIds) {
      return CATMAID.fetch(projectId + '/landmarks/', 'DELETE', {
        landmark_ids: landmarkIds
      });
    },

    /**
     * Delete all locations (including their links) that are shared between a
     * group and a (conceptual) landmark in a project.
     *
     * @param {Number}  projectId  The project to operate in.
     * @param {Number}  groupId    The landmark group locations are linked to.
     * @param {Number}  landmarkId The landmark locations are linked to.
     * @param {Boolean} keepPoints (optional) Whether to keep unlinked points
     *                             after link deletion.
     * @returns {Promise} Resolves when all succeeds.
     */
    deleteSharedLocationLinks: function(projectId, groupId, landmarkId, keepPoints) {
      return CATMAID.fetch(projectId + '/landmarks/' + landmarkId +
          '/groups/' + groupId + '/', 'DELETE', {
            'keep_points': !!keepPoints
          });
    },

    /**
     * List all landmark groups in a project, optionally with location
     * information. Optionally, with member, location and link/relation
     * information.
     */
    listGroups: function(projectId, with_members, with_locations, with_links, with_relations) {
      return CATMAID.fetch(project.id +  "/landmarks/groups/", "GET", {
          with_members: !!with_members,
          with_locations: !!with_locations,
          with_links: !!with_links,
          with_relations: !!with_relations
        });
    },

    /**
     * Get details on a landmark group.
     */
    getGroup: function(projectId, groupId, with_members, with_locations, with_names) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId + '/', 'GET', {
          with_members: !!with_members,
          with_locations: !!with_locations,
          with_names: !!with_names
        });
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
     * Update the landmarks linked to a particular landmark group. If <append>
     * is true, the passed in member IDs will be appended if not already
     * present.
     */
    updateGroupMembers: function(projectId, groupId, newMemberIds, append) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId + '/', 'POST', {
        members: newMemberIds.length === 0 ? 'none' : newMemberIds,
        append_members: !!append
      });
    },

    /**
     * Link a landmark to a particular landmark group.
     */
    addGroupMember: function(projectId, groupId, newMemberId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId + '/', 'POST', {
        members: [newMemberId],
        append_members: true
      });
    },

    /**
     * Link a landmark to a location. Landmarks can be part of multiple landmark
     * groups to represent that as logical entity a landmark is found in
     * multiple places or contextes. Linking a landmark to a location gives a
     * type to the landmark, but its context/group has to be sed separetyle.
     */
    linkNewLocationToLandmark: function(projectId, landmarkId, location) {
      return CATMAID.fetch(projectId + '/landmarks/' + landmarkId + '/locations/', 'PUT', {
          x: location.x,
          y: location.y,
          z: location.z
        });
    },

    /**
     * Link a new location to both a landmark and a group plus making sure the
     * landmark is a member of the group.
     *
     * @param {Number}  projectId  The project of the group.
     * @param {Number}  groupId    The landmark group to update.
     * @param {Number}  landmarkId the landmark to update.
     * @param {Object}  location   The XYZ project space location to use
     * @param {Boolean} clear      (optional) If existing group location links
     *                             and landmark location links to the same
     *                             location should be removed before adding new
     *                             ones. Defaults to false.
     * @returns {Promise} Resolves when all work is done.
     */
    linkNewLocationToLandmarkAndGroup: function(projectId, groupId, landmarkId,
        location, clear) {
      let prepare = [];
      if (clear) {
        // If the landmark to link is already linked to the passed in group and
        // the <clear> flag is set, remove all landmark locations linked to both
        // and only both.
        prepare.push(CATMAID.Landmarks.deleteSharedLocationLinks(projectId,
            groupId, landmarkId));
      }

      return Promise.all(prepare)
        .then(function() {
          return CATMAID.Landmarks.linkNewLocationToLandmark(projectId, landmarkId,
              location, clear);
        })
        .then(function(link) {
          return CATMAID.Landmarks.addLandmarkLocationToGroup(projectId,
              groupId, link.point_id, clear);
        })
        .then(function() {
          return CATMAID.Landmarks.addGroupMember(projectId,
              groupId, landmarkId);
        });
    },

    /**
     * Create a new pair of landmark groups based on a list of landmarks and
     * optionally links.
     *
     * @param {Number}   projectId  The project to operate in.
     * @param {String}   nameGroupA Name of landmark group A.
     * @param {String}   nameGroupB Name of landmark group B.
     * @param {Object[]} landmarks  A list of [name, x, y, z, x, y, z] elements,
     *                              representing a shared landmark at locations
     *                              (in order) for group A and B.
     * @param {Object[]} links      (optional) A list [group_name_1, relation_name,
     *                              group_name_2] elements, representing a
     *                              relation between two groups. Whether group A
     *                              and B map to 1 and 2 or vice versa depends
     *                              on the semantics of the relation.
     * @param {Boolean} reuseExistingLandmarks If existing landmark (names) can
     *                              be reused, no error is thrown, when a
     *                              landmark with the same name exists alrady.
     * @returns {Promise} Resolves with created landmark group information.
     */
    materialize: function(projectId, nameGroupA, nameGroupB, landmarks, links,
        reuseExistingLandmarks) {
      return CATMAID.fetch(projectId + '/landmarks/groups/materialize', 'POST', {
        'group_a_name': nameGroupA,
        'group_b_name': nameGroupB,
        'landmarks': landmarks,
        'links': links,
        'reuse_existing_landmarks': reuseExistingLandmarks
      });
    },

    /**
     * Delete the link between the passed in landmark and location.
     */
    deleteLocationLink: function(projectId, landmarkId, locationId) {
      return CATMAID.fetch(projectId + '/landmarks/' + landmarkId +
        '/locations/' + locationId + '/', 'DELETE');
    },

    /**
     * Add a point location to a landmark group if the location is also linked to
     * by the landmark.
     */
    addLandmarkLocationToGroup: function(projectId, groupId, locationId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId +
          '/locations/' + locationId + '/', 'PUT');
    },

    /**
     * Remove the link between a point location and a landmark group when the
     * location is also linked to the landmark.
     */
    removeLandmarkLocationFromGroup: function(projectId, groupId, locationId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + groupId +
          '/locations/' + locationId + '/', 'DELETE');
    },

    /**
     * Add a new link between two landmark groups using a particular relation.
     * The semantics are determinded by the relation and the fact it follows the
     * pattern <subject> <prediate> <object> is the same as <groupAId>
     * <relationId> <groupBId>. If a particular relation is used already between
     * two groups, the existing one is returned. A flag in the result indicates
     * whether a new link has been created.
     */
    addLandmarkGroupLink: function(projectId, groupAId, groupBId, relationId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/links/', 'PUT', {
        'group_1_id': groupAId,
        'group_2_id': groupBId,
        'relation_id': relationId
      });
    },

    /**
     * Delete a specific landmark group link.
     *
     * @param {integer} projectId The project the link is part of.
     * @param {integer} linkId    The link to delete.
     * @returns {Promise} Resolves with basic properties of the deleted link.
     */
    deleteLandmarkGroupLink: function(projectId, linkId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/links/' + linkId + '/', 'DELETE');
    },

    /**
     * Return a list of landmark groups that are linked through a chain of group
     * links of the passed in relation type.
     *
     * @param {Number} projectId   The project the groups and relation ae part of
     * @param {Number} fromGroupId The source group for initial links.
     * @param {Number} relationId  The relation a valid group links has to have
     * @returns {Promise} Resolves with a list of landmark groups.
     */
    getTransitivelyLinkedGroups: function(projectId, fromGroupId, relationId) {
      return CATMAID.fetch(projectId + '/landmarks/groups/' + fromGroupId + '/transitively-linked', 'GET', {
          'relation_id': relationId
        });
    },

    /**
     * Import and link landmarks, landmark groups and locations. The passed in
     * <data> parameter is a list of two-element lists, each representing a
     * group along with its linked landmark and locations. The group is
     * represented by its name and the members are a list of four-element lists,
     * containing the landmark name and the location. This results in the
     * following format:
     *
     *  [[group_1_name, [[landmark_1_name, x, y, z], [landmark_2_name, x, y, z]]], ...]
     */
    import: function(projectId, data, reuse_existing_groups,
        reuse_existing_landmarks, create_non_existing_groups,
        create_non_existing_landmarks) {
      return CATMAID.fetch(projectId + '/landmarks/groups/import', 'POST', {
        data: JSON.stringify(data),
        reuse_existing_groups: CATMAID.tools.getDefined(reuse_existing_groups, false),
        reuse_existing_landmarks: CATMAID.tools.getDefined(reuse_existing_landmarks, false),
        create_non_existing_groups: CATMAID.tools.getDefined(create_non_existing_groups, true),
        create_non_existing_landmarks: CATMAID.tools.getDefined(create_non_existing_landmarks, true)
      });
    },

    /**
     * Return a bounding box for a passed in landmark group.
     */
    getBoundingBox: function(landmarkGroup) {
      // Find bounding box around locations
      let min = { x: Infinity, y: Infinity, z: Infinity };
      let max = { x: -Infinity, y: -Infinity, z: -Infinity };
      let locations = landmarkGroup.locations;
      for (var i=0, imax=locations.length; i<imax; ++i) {
        let loc = locations[i];
        if (loc.x < min.x) min.x = loc.x;
        if (loc.y < min.y) min.y = loc.y;
        if (loc.z < min.z) min.z = loc.z;
        if (loc.x > max.x) max.x = loc.x;
        if (loc.y > max.y) max.y = loc.y;
        if (loc.z > max.z) max.z = loc.z;
      }
      return {
        min: min,
        max: max
      };
    }

  };

  let LandmarkSkeletonTransformation = function(skeletons, fromGroupId, toGroupId) {
    this.skeletons = skeletons;
    this.fromGroupId = parseInt(fromGroupId, 10);
    this.toGroupId = parseInt(toGroupId, 10);
    this.id = CATMAID.tools.uuidv4();
  };

  // Export namespace
  CATMAID.Landmarks = Landmarks;
  CATMAID.LandmarkSkeletonTransformation = LandmarkSkeletonTransformation;

})(CATMAID);
