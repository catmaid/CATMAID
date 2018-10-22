/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Return squared distance between an axis aligned bounding box and a point p.
   */
  let distanceSq = function(aaBb, x, y, z) {
    var dx = Math.max(aaBb.min.x - x, 0, x - aaBb.max.x);
    var dy = Math.max(aaBb.min.y - y, 0, y - aaBb.max.y);
    var dz = Math.max(aaBb.min.z - z, 0, z - aaBb.max.z);
    return dx*dx + dy*dy + dz * dz;
  };

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
    },

    getMlsTransform: function(transformation, landmarkGroupIndex, landmarkIndex, i) {
      if (i === undefined) {
        i = 1;
      }
      let matches = CATMAID.Landmarks.getPointMatches(transformation.fromGroupId,
          transformation.toGroupId, landmarkGroupIndex, landmarkIndex);

      if (!matches || matches.length === 0) {
        throw new CATMAID.ValueError("Found no point matches for " +
            (i+1) + ". transformation");
      }

      let invMatches = CATMAID.Landmarks.getPointMatches(transformation.toGroupId,
          transformation.fromGroupId, landmarkGroupIndex, landmarkIndex);

      if (!invMatches || invMatches.length === 0) {
        throw new CATMAID.ValueError("Found no inverse point matches for " +
            (i+1) + ". transformation");
      }

      var mls = new CATMAID.transform.MovingLeastSquaresTransform();
      var model = new CATMAID.transform.AffineModel3D();
      mls.setModel(model);

      var invMls = new CATMAID.transform.MovingLeastSquaresTransform();
      var invModel = new CATMAID.transform.AffineModel3D();
      invMls.setModel(invModel);

      try {
        mls.setMatches(matches);
      } catch (error) {
        throw new CATMAID.ValueError("Could not fit model for " +
            (i+1) + ". transformation");
      }

      try {
        invMls.setMatches(invMatches);
      } catch (error) {
        throw new CATMAID.ValueError("Could not fit inverse model for " +
            (i+1) + ". transformation");
      }

      return {
        transform: mls,
        invTransform: invMls
      };
    },

    /**
     * Get a list of two-element lists with each sub-list representingn a point
     * match, i.e. two locations annotated with the same landmark
     */
    getPointMatches: function(fromGroupId, toGroupId, landmarkGroupIndex,
        landmarkIndex) {
      if (!landmarkGroupIndex) {
        throw new CATMAID.ValueError('No landmark group information found');
      }
      let fromGroup = landmarkGroupIndex.get(fromGroupId);
      if (!fromGroup) {
        throw new CATMAID.ValueError('Could not find "from" group: ' + fromGroupId);
      }
      let toGroup = landmarkGroupIndex.get(toGroupId);
      if (!toGroup) {
        throw new CATMAID.ValueError('Could not find "to" group: ' + toGroupId);
      }

      // Find landmark overlap between both groups
      let fromLandmarkIds = new Set(fromGroup.members);
      let toLandmarkIds = new Set(toGroup.members);
      let sharedLandmarkIds = new Set();
      for (let toLandmarkId of toLandmarkIds) {
        if (fromLandmarkIds.has(toLandmarkId)) {
          sharedLandmarkIds.add(toLandmarkId);
        }
      }

      let matches = [];

      // Find all members that have a location linked into both groups
      for (let landmarkId of sharedLandmarkIds) {
        let landmark = landmarkIndex.get(landmarkId);
        if (!landmark) {
          throw new CATMAID.ValueError("Could not find landmark " + landmarkId);
        }

        let linkedFromLocationIdxs = CATMAID.Landmarks.getLinkedGroupLocationIndices(fromGroup, landmark);
        let linkedToLocationIdxs = CATMAID.Landmarks.getLinkedGroupLocationIndices(toGroup, landmark);

        if (linkedFromLocationIdxs.length === 0) {
          CATMAID.warn("Landmark " + landmarkId +
              " has no linked location in group " + fromGroupId);
          continue;
        }

        if (linkedToLocationIdxs.length === 0) {
          CATMAID.warn("Landmark " + landmarkId +
              " has no linked location in group " + toGroupId);
          continue;
        }

        if (linkedFromLocationIdxs.length > 1) {
          CATMAID.warn("Landmark " + landmarkId +
              " is linked through locations in group " +
              fromGroupId + " more than once");
          continue;
        }

        if (linkedToLocationIdxs.length > 1) {
          CATMAID.warn("Landmark " + landmarkId +
              " is linked through locations in group " +
              toGroupId + " more than once");
          continue;
        }

        let fLoc = fromGroup.locations[linkedFromLocationIdxs[0]];
        let tLoc = toGroup.locations[linkedToLocationIdxs[0]];

        var p1 = new CATMAID.transform.Point([fLoc.x, fLoc.y, fLoc.z]);
        var p2 = new CATMAID.transform.Point([tLoc.x, tLoc.y, tLoc.z]);

        matches.push(new CATMAID.transform.PointMatch(p1, p2, 1.0));
      }

      return matches;
    },

    getLinkedGroupLocationIndices: function(group, landmark) {
      // These are the possible locations, the ones linked to the landmark
      // itself. Based on this we can find the group linked locations.
      let groupLocations = group.locations;
      let linkedLocations = [];
      for (let i=0, imax=landmark.locations.length; i<imax; ++i) {
        // Check if the landmark location is a member of this group
        var loc = landmark.locations[i];
        var isMember = false;
        for (var j=0, jmax=groupLocations.length; j<jmax; ++j) {
          let groupLocation = groupLocations[j];
          if (groupLocation.id == loc.id) {
            linkedLocations.push(j);
            break;
          }
        }
      }
      return linkedLocations;
    },

    /**
     * Compute the a transformed version of a set of skeletons.
     *
     * @param skeletonTransformation {LandmarkSkeletonTransformation} The
     *                               transformation to compute.
     * @returns Promise which resolves once all transformed skeletons computed.
     */
    transformSkeletons: function(skeletonTransformation, landmarkGroupIndex) {
    },

    /**
     * Add both a landmark provider and a node provider to the passed in
     * transformation. These will allow to read transformed skeletons nodes from
     * the transformation.
     * @param skeletonTransformation {LandmarkSkeletonTransformation} The
     *                               transformation to update.
     */
    addProvidersToTransformation: function(transformation, landmarkGroupIndex,
        landmarkIndex, i) {
      let skeletonModels = Object.keys(transformation.skeletons).reduce(function(o, s) {
        o['transformed-' + s] = transformation.skeletons[s];
        return o;
      }, {});

      let mls;
      try {
        mls = CATMAID.Landmarks.getMlsTransform(transformation,
            landmarkGroupIndex, landmarkIndex, i);
      } catch (error) {
        CATMAID.warn(error ? error.message : "Unknown error");
        return;
      }

      // Landmarks are needed for bounding box computation and visualization.
      transformation.landmarkProvider = {
        get: function(landmarkGroupId) {
          if (transformation.landmarkCache && transformation.landmarkCache[landmarkGroupId]) {
            return Promise.resolve(transformation.landmarkCache[landmarkGroupId]);
          } else {
            return CATMAID.Landmarks.getGroup(project.id, landmarkGroupId, true, true)
              .then(function(landmarkGroup) {
                if (!transformation.landmarkCache) {
                  transformation.landmarkCache = {};
                }
                transformation.landmarkCache[landmarkGroupId] = landmarkGroup;
                return landmarkGroup;
              });
          }
        }
      };

      // Compute source and target landmark group boundaries
      let prepare = Promise.all([
          transformation.landmarkProvider.get(transformation.fromGroupId),
          transformation.landmarkProvider.get(transformation.toGroupId)])
        .then(function(landmarkGroups) {
          let fromGroup = landmarkGroups[0];
          let toGroup = landmarkGroups[1];
          transformation.sourceAaBb = CATMAID.Landmarks.getBoundingBox(fromGroup);
          transformation.targetAaBb = CATMAID.Landmarks.getBoundingBox(toGroup);
        });

      // For each node, check if treenode is outside of source group bounding
      // box. If so, do both a transformation from source to target group and
      // average with respect to distance to bounding box.
      let noInterpolation = !this.interpolateBetweenGroups;
      let treenodeLocation = [0, 0, 0];
      let transformTreenode = function(treenodeRow) {
        // If in boundig box, just apply forward transform. If in target
        // bounding box, use inverse transform. If in-between, use weighted
        // location based on distance.
        let fromDistanceSq = distanceSq(transformation.sourceAaBb, treenodeRow[3],
            treenodeRow[4], treenodeRow[5]);
        // If the node is in the source bounding box, use regular source ->
        // target transformation.
        if (fromDistanceSq === 0 || noInterpolation) {
          treenodeLocation[0] = treenodeRow[3];
          treenodeLocation[1] = treenodeRow[4];
          treenodeLocation[2] = treenodeRow[5];
          mls.transform.applyInPlace(treenodeLocation);
          treenodeRow[3] = treenodeLocation[0];
          treenodeRow[4] = treenodeLocation[1];
          treenodeRow[5] = treenodeLocation[2];
        } else {
          let toDistanceSq = distanceSq(transformation.targetAaBb, treenodeRow[3],
              treenodeRow[4], treenodeRow[5]);
          // If the node is in the target bounding box, use exclusively the
          // inverse transformation target -> source. Otherwise weight the
          // distances.
          if (toDistanceSq === 0) {
            treenodeLocation[0] = treenodeRow[3];
            treenodeLocation[1] = treenodeRow[4];
            treenodeLocation[2] = treenodeRow[5];
            mls.invTransform.applyInPlace(treenodeLocation);
            treenodeRow[3] = treenodeLocation[0];
            treenodeRow[4] = treenodeLocation[1];
            treenodeRow[5] = treenodeLocation[2];
          } else {
            let fromToRatio = toDistanceSq / (fromDistanceSq + toDistanceSq);
            let toFromRatio = 1.0 - fromToRatio;

            // Add source part
            let x = treenodeLocation[0] = treenodeRow[3];
            let y = treenodeLocation[1] = treenodeRow[4];
            let z = treenodeLocation[2] = treenodeRow[5];
            mls.transform.applyInPlace(treenodeLocation);
            treenodeRow[3] = fromToRatio * treenodeLocation[0];
            treenodeRow[4] = fromToRatio * treenodeLocation[1];
            treenodeRow[5] = fromToRatio * treenodeLocation[2];

            // Add target part
            treenodeLocation[0] = x;
            treenodeLocation[1] = y;
            treenodeLocation[2] = z;
            mls.invTransform.applyInPlace(treenodeLocation);
            treenodeRow[3] += toFromRatio * treenodeLocation[0];
            treenodeRow[4] += toFromRatio * treenodeLocation[1];
            treenodeRow[5] += toFromRatio * treenodeLocation[2];
          }
        }
      };

      transformation.nodeProvider = {
        get: function(skeletonId) {
          if (!transformation.loading) {
            if (transformation.skeletonCache && transformation.skeletonCache[skeletonId]) {
              transformation.loading = Promise.resolve(transformation.skeletonCache[skeletonId]);
            } else {
              // Get skeleton data and transform it
              transformation.loading = CATMAID.fetch(project.id + '/skeletons/' + skeletonId + '/compact-detail', 'GET', {
                  with_tags: false,
                  with_connectors: false,
                  with_history: false
                })
                .then(function(response) {
                  // If the source group ID is the same as the target group ID,
                  // don't transform at all.
                  if (transformation.fromGroupId !== transformation.toGroupId) {
                    // Transform points and store in cache
                    response[0].forEach(transformTreenode);
                  }
                  if (!transformation.skeletonCache) {
                    transformation.skeletonCache = {};
                  }
                  transformation.skeletonCache[skeletonId] = response;
                  return response;
                });
            }
          }

          return transformation.loading;
        }
      };
    },


    /**
     * Helper for adding to a map like the landmark group index from an array.
     */
    addToIdIndex: function(index, element) {
      index.set(element.id, element);
      return index;
    },

  };

  let LandmarkSkeletonTransformation = function(skeletons, fromGroupId, toGroupId) {
    this.skeletons = skeletons;
    this.fromGroupId = parseInt(fromGroupId, 10);
    this.toGroupId = parseInt(toGroupId, 10);
    this.id = CATMAID.tools.uuidv4();
  };

  // Provide some basic events
  Landmarks.EVENT_DISPLAY_TRANSFORM_ADDED = "display_transform_added";
  Landmarks.EVENT_DISPLAY_TRANSFORM_REMOVED = "display_transform_removed";
  CATMAID.asEventSource(Landmarks);

  // Export namespace
  CATMAID.Landmarks = Landmarks;
  CATMAID.LandmarkSkeletonTransformation = LandmarkSkeletonTransformation;

})(CATMAID);
