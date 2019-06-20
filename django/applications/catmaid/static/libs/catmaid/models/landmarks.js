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
    list: function(projectId, with_locations, api) {
      return CATMAID.fetch({
        url: projectId +  "/landmarks/",
        method: "GET",
        data: {
          with_locations: with_locations
        },
        api: api,
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
     * Update the landmark groups a particular landmark is member of. If
     * <append> is true, the passed in member IDs will be appended if not
     * already present.
     */
    updateLandmarkMemberships: function(projectId, landmarkId, newGroupIds, append) {
      return CATMAID.fetch(projectId + '/landmarks/' + landmarkId + '/', 'POST', {
        group_ids: newGroupIds.length === 0 ? 'none' : newGroupIds,
        append_members: !!append
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
    listGroups: function(projectId, with_members, with_locations, with_links, with_relations, api) {
      return CATMAID.fetch({
          url: projectId +  "/landmarks/groups/",
          method: "GET",
          data: {
            with_members: !!with_members,
            with_locations: !!with_locations,
            with_links: !!with_links,
            with_relations: !!with_relations,
          },
          api: api,
        });
    },

    /**
     * Get details on a landmark group.
     */
    getGroup: function(projectId, groupId, with_members, with_locations, with_names, api) {
      return CATMAID.fetch({
        url: projectId + '/landmarks/groups/' + groupId + '/',
        method: 'GET',
        data: {
          with_members: !!with_members,
          with_locations: !!with_locations,
          with_names: !!with_names
        },
        api: api,
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
    getBoundingBox: function(...landmarkGroups) {
      // Find bounding box around locations
      let min = { x: Infinity, y: Infinity, z: Infinity };
      let max = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (let k=0, kmax=landmarkGroups.length; k<kmax; ++k) {
        let landmarkGroup = landmarkGroups[k];
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
      }
      return {
        min: min,
        max: max
      };
    },

    getMlsTransform: function(transformation, landmarkGroupIndex, landmarkIndex,
        i, sourceLandmarkGroupIndex, sourceLandmarkIndex, byName) {
      // If no dedicated indices for the source landmarks is provided, use the
      // general one.
      sourceLandmarkGroupIndex = sourceLandmarkGroupIndex || landmarkGroupIndex;
      sourceLandmarkIndex = sourceLandmarkIndex || landmarkIndex;

      if (i === undefined) {
        i = 1;
      }
      let matches = [].concat(...transformation.mappings
          .map(m => CATMAID.Landmarks.getPointMatches(m[0], m[1],
              landmarkGroupIndex, landmarkIndex, sourceLandmarkGroupIndex,
              sourceLandmarkIndex, byName, transformation.useReverseMatches)));

      if (!matches || matches.length === 0) {
        throw new CATMAID.ValueError("Found no point matches for " +
            (i+1) + ". transformation");
      }

      var mls = new CATMAID.transform.MovingLeastSquaresTransform();
      var model = new transformation.modelClass();
      mls.setModel(model);

      try {
        mls.setMatches(matches);
      } catch (error) {
        console.warn(error);
        throw new CATMAID.ValueError("Could not fit model for " +
            (i+1) + ". transformation");
      }

      return {
        transform: mls,
      };
    },

    /**
     * Get a list of two-element lists with each sub-list representingn a point
     * match, i.e. two locations annotated with the same landmark
     */
    getPointMatches: function(fromGroupId, toGroupId, landmarkGroupIndex,
        landmarkIndex, sourceLandmarkGroupIndex, sourceLandmarkIndex, byName,
        useReverseMatches) {
      if (!landmarkGroupIndex) {
        throw new CATMAID.ValueError('No source landmark group information found');
      }
      if (!sourceLandmarkGroupIndex) {
        throw new CATMAID.ValueError('No target landmark group information found');
      }
      let fromGroup = sourceLandmarkGroupIndex.get(fromGroupId);
      if (!fromGroup) {
        throw new CATMAID.ValueError('Could not find "from" group: ' + fromGroupId);
      }
      let toGroup = landmarkGroupIndex.get(toGroupId);
      if (!toGroup) {
        throw new CATMAID.ValueError('Could not find "to" group: ' + toGroupId);
      }

      // Find landmark overlap between both groups. If the the source and target
      // landmark index is the same, shared landmarks can be dound using IDs,
      // which is more robust. If the landmark indices differ, the matching is
      // typically done by name, which leaves more room for error, but should be
      // just as fine in most situations.
      let sharedLandmarkIds = new Set();
      if (byName) {
        let fromLandmarkNames = new Map(fromGroup.members.map(
            fromId => [sourceLandmarkIndex.get(fromId).name, fromId]));
        let toLandmarkNames = new Map(toGroup.members.map(
            toId => [landmarkIndex.get(toId).name, toId]));
        for (let [toLandmarkName, toLandmarkId] of toLandmarkNames) {
          if (fromLandmarkNames.has(toLandmarkName)) {
            sharedLandmarkIds.add([fromLandmarkNames.get(toLandmarkName), toLandmarkId]);
          }
        }
      } else {
        let fromLandmarkIds = new Set(fromGroup.members);
        let toLandmarkIds = new Set(toGroup.members);
        for (let toLandmarkId of toLandmarkIds) {
          if (fromLandmarkIds.has(toLandmarkId)) {
            sharedLandmarkIds.add([fromLandmarkIds, toLandmarkId]);
          }
        }
      }

      let matches = [];

      // Find all members that have a location linked into both groups
      for (let landmarkPair of sharedLandmarkIds) {
        let [fromLandmarkId, toLandmarkId] = landmarkPair;
        let fromLandmark = sourceLandmarkIndex.get(fromLandmarkId);
        let toLandmark = landmarkIndex.get(toLandmarkId);
        if (!fromLandmark) {
          throw new CATMAID.ValueError("Could not find from source landmark " + fromLandmarkId);
        }
        if (!toLandmark) {
          throw new CATMAID.ValueError("Could not find from target landmark " + toLandmarkId);
        }

        let linkedFromLocationIdxs = CATMAID.Landmarks.getLinkedGroupLocationIndices(fromGroup, fromLandmark);
        let linkedToLocationIdxs = CATMAID.Landmarks.getLinkedGroupLocationIndices(toGroup, toLandmark);

        if (linkedFromLocationIdxs.length === 0) {
          CATMAID.warn("Landmark " + fromLandmarkId +
              " has no linked location in group " + fromGroupId);
          continue;
        }

        if (linkedToLocationIdxs.length === 0) {
          CATMAID.warn("Landmark " + toLandmarkId +
              " has no linked location in group " + toGroupId);
          continue;
        }

        if (linkedFromLocationIdxs.length > 1) {
          CATMAID.warn("Landmark " + fromLandmarkId +
              " is linked through locations in group " +
              fromGroupId + " more than once");
          continue;
        }

        if (linkedToLocationIdxs.length > 1) {
          CATMAID.warn("Landmark " + toLandmarkId +
              " is linked through locations in group " +
              toGroupId + " more than once");
          continue;
        }

        let fLoc = fromGroup.locations[linkedFromLocationIdxs[0]];
        let tLoc = toGroup.locations[linkedToLocationIdxs[0]];

        var p1 = new CATMAID.transform.Point([fLoc.x, fLoc.y, fLoc.z]);
        var p2 = new CATMAID.transform.Point([tLoc.x, tLoc.y, tLoc.z]);
        matches.push(new CATMAID.transform.PointMatch(p1, p2, 1.0));

        if (useReverseMatches) {
          matches.push(new CATMAID.transform.PointMatch(p2, p1, 1.0));
        }
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
     *
     * @param {LandmarkSkeletonTransformation} transformation The transformation to update
     * @param {Object} landmarkGroupIndex Map of landmark group IDs vs. landmark groups
     * @param {Object} landmarkIndex      Map of landmark IDs vs. landmarks
     * @param {number} i                  (Optional) Index of transformation in a list of
     *                                    transformations, mainly useful for debugging.
     * @param {Object} sourceLandmarkGroupIndex (Optional) Map of landmark group IDs vs.
     *                                          landmark groups for the source landmark groups.
     *                                          Default is to use <landmarkGroupIndex>.
     * @param {Object} sourceLandmarkIndex      (Optional) Map of landmark IDs vs. landmarks
     *                                          for the source landmarks. Default is to use to
     *                                          <landmarkIndex>.
     * @param {Boolean} byName                  (Optional) If true, landmarks are compared by
     *                                          name, otherwise by ID. Default is false.
     */
    addProvidersToTransformation: function(transformation, landmarkGroupIndex,
        landmarkIndex, i, sourceLandmarkGroupIndex, sourceLandmarkIndex, byName) {
      // If no dedicated indices for the source landmarks is provided, use the
      // general one.
      sourceLandmarkGroupIndex = sourceLandmarkGroupIndex || landmarkGroupIndex;
      sourceLandmarkIndex = sourceLandmarkIndex || landmarkIndex;

      let skeletonModels = Object.keys(transformation.skeletons).reduce(function(o, s) {
        o['transformed-' + s] = transformation.skeletons[s];
        return o;
      }, {});

      let mls;
      if (transformation.mappings.length > 0) {
        try {
          mls = CATMAID.Landmarks.getMlsTransform(transformation,
            landmarkGroupIndex, landmarkIndex, i, sourceLandmarkGroupIndex,
            sourceLandmarkIndex, byName);
        } catch (error) {
          CATMAID.warn(error ? error.message : "Unknown error");
          return false;
        }
      }

      // Landmarks are needed for bounding box computation and visualization.
      transformation.landmarkProvider = {
        get: function(landmarkGroupId, sourceProjectId, sourceApi) {
          if (transformation.landmarkCache && transformation.landmarkCache[landmarkGroupId]) {
            return Promise.resolve(transformation.landmarkCache[landmarkGroupId]);
          } else {
            return CATMAID.Landmarks.getGroup(sourceProjectId,
                landmarkGroupId, true, true, undefined, sourceApi)
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
          // Source group ID
          Promise.all(transformation.mappings.map(m =>
              transformation.landmarkProvider.get(m[0],
                  transformation.projectId, transformation.fromApi))),
          // Target group ID
          Promise.all(transformation.mappings.map(m =>
              transformation.landmarkProvider.get(m[1], project.id)))
        ])
        .then(function(landmarkGroups) {
          let fromGroups = landmarkGroups[0];
          let toGroups = landmarkGroups[1];
          transformation.sourceAaBb = CATMAID.Landmarks.getBoundingBox(...fromGroups);
          transformation.targetAaBb = CATMAID.Landmarks.getBoundingBox(...toGroups);
        });

      let treenodeLocation = [0, 0, 0];
      let transformTreenode = function(treenodeRow) {
        treenodeLocation[0] = treenodeRow[3];
        treenodeLocation[1] = treenodeRow[4];
        treenodeLocation[2] = treenodeRow[5];
        mls.transform.applyInPlace(treenodeLocation);
        treenodeRow[3] = treenodeLocation[0];
        treenodeRow[4] = treenodeLocation[1];
        treenodeRow[5] = treenodeLocation[2];
      };

      let areDifferentGroups = m => m[0] !== m[1];

      transformation.skeletonPromises = new Map();
      transformation.nodeProvider = {
        get: function(skeletonId) {
          // If skeleton is still in the loading queue, return promise from
          // there.
          let skeletonPromise = transformation.skeletonPromises.get(skeletonId);
          if (skeletonPromise) {
            return skeletonPromise;
          }

          // Return cached version, if available.
          if (transformation.skeletonCache && transformation.skeletonCache[skeletonId]) {
            return Promise.resolve(transformation.skeletonCache[skeletonId]);
          }

          // Otherwise, load from back-end.
          skeletonPromise = CATMAID.fetch({
              url: transformation.projectId + '/skeletons/' + skeletonId + '/compact-detail',
              method: 'GET',
              data: {
                  with_tags: true,
                  with_connectors: false,
                  with_history: false
              },
              api: transformation.fromApi,
            })
            .then(function(response) {
              // If the source group ID is the same as the target group ID,
              // don't transform at all.
              if (transformation.mappings.some(areDifferentGroups)) {
                // Transform points and store in cache
                // TODO: do this in webworker?
                response[0].forEach(transformTreenode);
              }

              // Store result in transformation cache
              if (!transformation.skeletonCache) {
                transformation.skeletonCache = {};
              }
              transformation.skeletonCache[skeletonId] = response;

              // Remove from loading queue
              transformation.skeletonPromises.delete(skeletonId);

              return response;
            });

          transformation.skeletonPromises.set(skeletonId, skeletonPromise);

          return skeletonPromise;
        }
      };

      return true;
    },


    /**
     * Helper for adding to a map like the landmark group index from an array.
     */
    addToIdIndex: function(index, element) {
      index.set(element.id, element);
      return index;
    },

  };

  /**
   * Describes a skeleton transformation, optionally with the source being a
   * remote CATMAID instance.
   *
   * @param {number}   projectId   The source project, where to find <fromGroupId>
   * @param {object[]} skeletons   A list of skeleton models to transform.
   * @param {int[][]}   mappings   A list of two-element lists, with the first
   *                               element being a source group ID and the
   *                               second element being a target group ID.
   *                               The source landmark group s the group from
   *                               which to transform the skeleton, looked for
   *                               in remote API, if <api> is passed in,
   *                               otherwise in <projectId>. The target landmark
   *                               group is the group to transform skeletons to,
   *                               expected to be the local <projectId>.
   * @param {API}      fromApi     (Optional) API instance to declare to load
   *                               skeletons from.
   * @param {Boolean}  useReverseMatches Add point matches also in their reverse
   *                                     relationship, which can be useful for
   *                                     mirroring operations.
   *
   */
  let LandmarkSkeletonTransformation = function(projectId, skeletons,
      mappings, fromApi = null, color = undefined,
      modelClass = CATMAID.transform.AffineModel3D, useReverseMatches = false) {
    this.projectId = projectId;
    this.skeletons = skeletons;
    let seenSourceIds = new Set(), seenTargetIds = new Set();
    this.mappings = mappings ? mappings.map(m => [parseInt(m[0], 10), parseInt(m[1], 10)])
        .reduce((o, m) => {
          if (!seenSourceIds.has(m[0]) && !seenTargetIds.has(m[1])) {
            seenSourceIds.add(m[0]);
            seenTargetIds.add(m[1]);
            o.push(m);
          }
          return o;
        }, []) : [];
    this.id = CATMAID.tools.uuidv4();
    this.fromApi = fromApi;
    this.color = new THREE.Color(color);
    this.modelClass = modelClass;
    this.useReverseMatches = useReverseMatches;
  };

  // Provide some basic events
  Landmarks.EVENT_DISPLAY_TRANSFORM_ADDED = "display_transform_added";
  Landmarks.EVENT_DISPLAY_TRANSFORM_REMOVED = "display_transform_removed";
  CATMAID.asEventSource(Landmarks);

  // Export namespace
  CATMAID.Landmarks = Landmarks;
  CATMAID.LandmarkSkeletonTransformation = LandmarkSkeletonTransformation;

})(CATMAID);
