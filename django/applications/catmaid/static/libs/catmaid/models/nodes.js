/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var Treenode = function(id, x, y, z, parentId, childIds, skeletonId, radius,
      confidence, creatorId, editionTime) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.z = z;
    this.radius = radius;
    this.confidence = confidence;
    this.parentId = parentId;
    this.childIds = childIds;
    this.skeletonId = skeletonId;
    this.creatorId = creatorId;
    this.editionTime = editionTime;
  };

  CATMAID.Treenode = Treenode;


  var Treenodes = {
    info: function(projectId, treenodeId) {
      return CATMAID.fetch(`${projectId}/treenodes/${treenodeId}/info`);
    },
  };

  CATMAID.Treenodes = Treenodes;


  /**
   * This namespace provides functions to work with annotations on neurons. All
   * of them return promises.
   */
  var Nodes = {

    /**
     * Update the radius of a node.
     *
     * @param {State}   state      Node state
     * @param {integer} projectId  The project space of the node to change
     *
     * @returns A new promise that is resolved once the radius is updated. It
     *          contains all updated nodes along with their old radii.
     */
    updateRadius: function(state, projectId, nodeId, radius, updateMode) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to update the radius of a node');
      var url = projectId + '/treenode/' + nodeId + '/radius';
      var params = {
        radius: radius,
        option: updateMode,
        state: state.makeNodeState(nodeId)
      };

      return CATMAID.fetch(url, 'POST', params).then((function(json) {
        this.trigger(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED, json.updated_nodes);
        return {
          // An object mapping node IDs to their old and new radius is returned.
          'updatedNodes': json.updated_nodes
        };
      }).bind(this));
    },

    /**
     * Update the radius of a list of nodes.
     *
     * @param {State} state MultiNodeState with info on all nodes
     *
     * @returns A new promise that is resolved once the radius is updated. It
     *          contains all updated nodes along with their old radii.
     */
    updateRadii: function(state, projectId, nodesVsRadii) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to update the radius of a node');
      var url = projectId + '/treenodes/radius';
      var treenodeIds = Object.keys(nodesVsRadii);
      var params = {
        treenode_ids: treenodeIds,
        treenode_radii: treenodeIds.map(function(tnid) {
          return nodesVsRadii[tnid];
        }),
        state: state.makeMultiNodeState(treenodeIds)
      };

      return CATMAID.fetch(url, 'POST', params).then((function(json) {
        this.trigger(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED, json.updated_nodes);
        return {
          // An object mapping node IDs to their old and new radius is returned.
          'updatedNodes': json.updated_nodes,
        };
      }).bind(this));
    },

    /**
     * Update confidence of a node to its parent.
     *
     * @returns A new promise that is resolved once the confidence has been
     *          successfully updated.
     */
    updateConfidence: function(state, projectId, nodeId, newConfidence,
        toConnector, partnerIds, partnerConfidences) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to change the node confidence');

      var url = projectId + '/treenodes/' + nodeId + '/confidence';
      var params = {
        to_connector: toConnector,
        new_confidence: newConfidence,
        state: state.makeNodeState(nodeId)
      };
      if (partnerIds) {
        params["partner_ids"] = partnerIds;
      }
      if (partnerConfidences) {
        params["partner_confidences"] = partnerConfidences;
      }

      return CATMAID.fetch(url, 'POST', params)
        .then((function(result) {
          this.trigger(CATMAID.Nodes.EVENT_NODE_CONFIDENCE_CHANGED, nodeId,
              newConfidence, result.updated_partners);
          return {
            'updatedPartners': result.updated_partners
          };
        }).bind(this));
    },

    /**
     * Override the parent of a particular node.
     */
    updateParent: function(projectId, nodeId, newParentId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to change node');

      var url = projectId + '/treenodes/' + nodeId + '/parent';
      var params = {
        parent_id: newParentId,
        state: state.makeNodeState(nodeId)
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id);
          return result;
        });
    },

    /**
     * Create a new treenode in a skeleton. If no parent is given, a new
     * skeleton is created.
     *
     * @param {State}   state      A client state to generate local state from
     * @param {integer} projectId  The project space to create the node in
     * @param {number}  x          The X coordinate of the node's location
     * @param {number}  y          The Y coordinate of the node's location
     * @param {number}  z          The Z coordinate of the node's location
     * @param {integer} parentId   (Optional) Id of the parent node of the new node
     * @param {number}  radius     (Optional) Radius of the new node
     * @param {integer} confidence (Optional) Confidence of edge to parent
     * @param {integer} useNeuron  (Optional) Target neuron ID to double check
     * @param {string}  neuronName (Optional) Naming pattern for new neuron
     * @param {integer[][]} links  (Optional) A list of two-element lists
     *                             [<connector-id>, <relation-id>] for which new
     *                             connector links will be created.
     *
     * @returns a promise that is resolved once the treenode is created
     */
    create: function(state, projectId, x, y, z, parentId, radius, confidence,
          useNeuron, neuronName, links) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create a new node');

      var url = projectId + '/treenode/create';
      var params = {
        parent_id: parentId,
        x: x,
        y: y,
        z: z,
        radius: radius,
        confidence: confidence,
        useneuron: useNeuron,
        neuron_name: neuronName,
        links: links,
        state: state.makeParentState(parentId)
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          var newNode = new CATMAID.Treenode(result.treenode_id, x, y, z,
              parentId, undefined, result.skeleton_id, radius,
              confidence, CATMAID.session.userid, result.edition_time);
          CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_CREATED, newNode);
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id, [[result.treenode_id, x, y, z]]);
          return result;
        });
    },

    /**
     * Insert a new treenode in a skeleton, optionally between two nodes. If no
     * parent is given, a new skeleton is created.
     *
     * @param {State}  state       Local state: EdgeState if child is passed in,
     *                             ParentState if only parent is available,
     *                             Needs children state with takeoverChildIds
     * @param {integer} projectId  The project space to create the node in
     * @param {number}  x          The X coordinate of the node's location
     * @param {number}  y          The Y coordinate of the node's location
     * @param {number}  z          The Z coordinate of the node's location
     * @param {integer} parentId   Id of the parent node of the new node
     * @param {integer} childId    Id of child to insert in edge
     * @param {number}  radius     (Optional) Radius of the new node
     * @param {integer} confidence (Optional) Confidence of edge to parent
     * @param {integer} useNeuron  (Optional) Target neuron ID to double check
     * @param {integer[]} takeoverChildIds (Optional) A list of child IDs of
     *                                     the current parent that should be
     *                                     taken over by the inserted node
     * @param {integer[][]} links  (Optional) A list of two-element lists
     *                             [<connector-id>, <relation-id>] for which new
     *                             connector links will be created.
     *
     * @returns a promise that is resolved once the treenode is created
     */
    insert: function(state, projectId, x, y, z, parentId, childId, radius,
        confidence, useNeuron, takeoverChildIds, links) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create a new node');

      // Different parameterization requires different state information.
      // Without any children (no childId and no takeOverChildIds), only parent
      // information is required. If there are children, these have to be
      // provided as well.
      var stateOptions = {
        nodeId: parentId,
        childIds: childId ? [childId] : [],
        links: []
      };
      if (takeoverChildIds) {
        Array.prototype.push.apply(stateOptions['childIds'], takeoverChildIds);
      }
      if (links) {
        Array.prototype.push.apply(stateOptions['links'], links);
      }

      var url = projectId + '/treenode/insert';
      var params = {
        parent_id: parentId,
        child_id: childId,
        x: x,
        y: y,
        z: z,
        radius: radius,
        confidence: confidence,
        useneuron: useNeuron,
        takeover_child_ids: takeoverChildIds,
        links: links,
        state: state.makeLocalState(stateOptions)
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          var newNode = new CATMAID.Treenode(result.treenode_id, x, y, z,
              parentId, childId ? [childId] : undefined, result.skeleton_id,
              radius, confidence, CATMAID.session.userid, result.edition_time);
          CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_CREATED, newNode);
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id, [[result.treenode_id, x, y, z]]);
          return result;
        });
    },

    /**
     * Delete a treenode.
     *
     * @param {State}   state      Local state, a complete NodeState is required
     * @param {integer} projectID  The project the treenode is part of
     * @param {integer} treenodeID The treenode to delete
     *
     * @returns promise deleting the treenode
     */
    remove: function(state, projectId, nodeId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove a new node');

      var url = projectId + '/treenode/delete';
      var params = {
        treenode_id: nodeId,
        state: state.makeNeighborhoodState(nodeId)
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_DELETED, nodeId,
              result.parent_id);
          // Emit deletion event, if the last node was removed and the neuron
          // deleted. Otherwise, trigger a change event for the neuron.
          var neuron_id = null;
          if (result.deleted_neuron) {
            CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
                result.skeleton_id);
          } else {
            CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
                result.skeleton_id, [[nodeId, result.x, result.y, result.z]]);
          }

          return result;
        });
    },

    /**
     * Update location of multiple treenodes and multiple connectors.
     *
     * @param {State}     state      A state instance that provides enough
     *                               information for a node state for each treenode.
     * @param {integer[]} treenodes  The list of four-element list each
     *                               containing a treenode ID and 3D location.
     * @param {integer[]} connectors The list of four-element list each
     *                               containing a connector ID and 3D location.
     *
     * @returns a promise resolving after the update succeeded
     */
    update: function(state, projectId, treenodes, connectors) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to update nodes');

      var nodes = treenodes ? treenodes : [];
      if (connectors) {
        nodes = nodes.concat(connectors);
      }

      var url = projectId + '/node/update';
      var params = {
        t: treenodes,
        c: connectors,
        state: state.makeMultiNodeState(nodes.map(function(e) {
          return e[0];
        }))
      };
      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          if (result.old_treenodes) {
            result.old_treenodes.forEach(announceNodeUpdate);
          }
          if (result.old_connectors) {
            result.old_connectors.forEach(announceNodeUpdate);
          }
          return result;
        });
    },

    /**
     * Get location of a node.
     *
     * @param {number} nodeId The node for which the location is retrieved.
     *
     * @return {Promise} A promise that resolves in the location of the node.
     */
    getLocation: function(nodeId) {
      return CATMAID.fetch(project.id + "/node/get_location",
          'POST', {tnid: nodeId});
    },

    /**
     * Get list of suppressed virtual nodes for the passed in node ID.
     *
     * @param {number} projectId Project to operate in.
     * @param {number} nodeId    Treenode to look up supporessed virtual nodes for.
     * @returns Promise resolving in list of suppressed virtual nodes.
     */
    getSuppressdVirtualNodes: function(projectId, nodeId) {
      return CATMAID.fetch(project.id + "/treenodes/" + nodeId + "/suppressed-virtual/");
    },

    /**
     * Suppress virtual nodes of a particular real node.
     *
     * @param {number} projectId   Project to operate in.
     * @param {number} nodeId      Treenode to suppress virtual node for.
     * @param {string} orientation View through data set, either 'x', 'y', or 'z'.
     * @param {array}  coordinate  The location of the virtual node to suppress.
     * @returns Promise resolving in success information.
     */
    addSuppressedVirtualNode: function(projectId, nodeId, orientation, coordinate) {
      return CATMAID.fetch(project.id + '/treenodes/' + nodeId + '/suppressed-virtual/',
          'POST', {
            orientation: orientation,
            location_coordinate: coordinate,
          });
    },

    /**
     * Delete a particular suppressed virtual node marked on a real node.
     *
     * @param {number} projectId    The project to operate in.
     * @param {number} nodeId       Treenode for which a suppressed virtual node
     *                              should be deleted.
     * @param {number} suppressedId Virtual node ID to delete suppressing for.
     * @returns Promise resolving in success information.
     */
    deleteSuppresedVirtualNode: function(projectId, nodeId, suppressedId) {
      let url = projectId + '/treenodes/' + nodeId + '/suppressed-virtual/' + suppressedId;
      return CATMAID.fetch(url, 'DELETE');
    },

    /**
     * Get the closest treenode relative to the passed in location
     *
     * @param {number} projectId  The project to operate in.
     * @param {number} x          X coordinate of query location.
     * @param {number} y          Y coordinate of query location.
     * @param {number} z          Z coordinate of query location.
     * @param {number} targetId   (optional) ID of skeleton or neuron the result
     *                            node should be part of.
     * @param {string} targetType (optional) If <targetId> is provided,
     *                            specifies if it is a 'neuron' or 'skeleton'.
     * @returns Promise resolving in closest treenode.
     */
    nearestNode: function(projectId, x, y, z, targetId, targetType) {
      let params = {
        x: x,
        y: y,
        z: z,
      };
      params[`${targetType}_id`] = targetId;
      return CATMAID.fetch(projectId + "/nodes/nearest", "GET", params);
    },

    /**
     * Get the most recently edited treenode.
     */
    mostRecentlyEditedNode: function(projectId, skeletonId, userId) {
      return CATMAID.fetch(project.id + '/nodes/most-recent', 'GET', {
        'skeleton_id': skeletonId,
        'user_id': userId,
      });
    },

  };

  function announceNodeUpdate(node) {
    CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_UPDATED, node[0]);
  }

  // If annotations are deleted entirely
  Nodes.EVENT_NODE_CONFIDENCE_CHANGED = "node_confidence_changed";
  Nodes.EVENT_NODE_RADIUS_CHANGED = "node_radius_changed";
  Nodes.EVENT_NODE_CREATED = "node_created";
  Nodes.EVENT_NODE_UPDATED = "node_updated";
  Nodes.EVENT_NODE_DELETED = "node_deleted";
  CATMAID.asEventSource(Nodes);

  // Export nodes
  CATMAID.Nodes = Nodes;

  CATMAID.UpdateNodeRadiusCommand = CATMAID.makeCommand(function(
        state, projectId, nodeId, radius, updateMode) {

    var umNode = state.getNode(nodeId);

    var exec = function(done, command, map) {
      // Map nodes to current ID and time
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var execState = new CATMAID.LocalState([mNode.value, mNode.timestamp]);
      var updateRadius = CATMAID.Nodes.updateRadius(execState, projectId, nodeId,
          radius, updateMode);

      return updateRadius.then(function(result) {
        var updatedNodes = result.updatedNodes;
        // The returned updatedNodes list contains objects with a node id and
        // the old radius.
        command.store("updatedNodes", updatedNodes);
        // update stored state of mapped nodes, needed for undo
        for (var n in updatedNodes) {
          var node = updatedNodes[n];
          map.add(map.NODE, n, n, node.edition_time);
        }
        // Add original mapping explicitely
        var updatedNode = result.updatedNodes[mNode.value];
        if (updatedNode) {
          map.add(map.NODE, umNode[0], mNode.value, updatedNode.edition_time);
        }

        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var updatedNodes = command.get("updatedNodes");
      command.validateForUndo(updatedNodes);

      var updateNodeIds = Object.keys(updatedNodes);
      // Create state that contains information about all modified nodes
      var mappedNodes = updateNodeIds.reduce(function(o, n) {
        var mappedNode = map.getWithTime(map.NODE, n, updatedNodes[n].edition_time, command);
        o.radii[mappedNode.value] = updatedNodes[n].old;
        o.state[mappedNode.value] = mappedNode.timestamp;
        return o;
      }, {'radii': {}, 'state': {}});

      var undoState = new CATMAID.SimpleSetState(mappedNodes.state);
      var updateRadii = CATMAID.Nodes.updateRadii(undoState, projectId, mappedNodes.radii);
      return updateRadii.then(function(result) {
        // Map nodes to current ID and time
        var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
        var updatedNodes = result.updatedNodes;
        // update stored state of mapped nodes, needed for undo
        for (var n in updatedNodes) {
          var node = updatedNodes[n];
          map.add(map.NODE, n, n, node.edition_time);
        }
        // Add original mapping explicitely
        var updatedNode = result.updatedNodes[mNode.value];
        if (updatedNode) {
          map.add(map.NODE, umNode[0], mNode.value, node.edition_time);
        }

        done();
        return result;
      });
    };

    var info;
    if (updateMode && 0 !== updateMode) {
      if (1 === updateMode) {
        info = "Update radii of all nodes from " + nodeId +
            " to last branch (including) to be " + radius + "nm";
      } else if (2 === updateMode) {
        info = "Update radii of all nodes from " + nodeId +
            " to last branch (excluding) to be " + radius + "nm";
      } else if (3 === updateMode) {
        info = "Update radii of all nodes before " + nodeId +
            " to last without radius to be " + radius + "nm";
      } else if (4 === updateMode) {
        info = "Update radii of all nodes from " + nodeId +
            " to root to be " + radius + "nm";
      } else if (5 === updateMode) {
        info = "Update radii of all node " + nodeId +
            "'s skeleton to be " + radius + "nm";
      } else {
        info = "Update radius with unknown update mode";
      }
    } else {
      info = "Update radius of node " + nodeId + " to be " + radius + "nm";
    }

    this.init(info, exec, undo);
  });

  CATMAID.UpdateConfidenceCommand = CATMAID.makeCommand(function(
        state, projectId, nodeId, newConfidence, toConnector) {

    var umNode = state.getNode(nodeId);

    var exec = function(done, command, map) {
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var execState = new CATMAID.LocalState([mNode.value, mNode.timestamp]);
      var updateConfidence = CATMAID.Nodes.updateConfidence(execState,
          projectId, mNode.value, newConfidence, toConnector);

      return updateConfidence.then(function(result) {
        var updatedNodes = result.updatedPartners;
        command.store("updatedNodes", updatedNodes);
        // update stored state of mapped nodes, needed for undo
        if (toConnector) {
          for (var n in updatedNodes) {
            var node = updatedNodes[n];
            map.add(map.LINK, n, n, node.edition_time);
          }
        } else {
          // Add original mapping explicitely
          var updatedNodeIds = Object.keys(updatedNodes);
          if (1 === updatedNodeIds.length) {
            var updatedNode = updatedNodes[updatedNodeIds[0]];
            if (updatedNode) {
              map.add(map.NODE, umNode[0], mNode.value, updatedNode.edition_time);
            }
          } else {
            throw new CATMAID.ValueError("Didn't expect more than one updated node for confidence update");
          }
        }

        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var updatedNodes = command.get("updatedNodes");
      command.validateForUndo(updatedNodes);

      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var oldConfidence, partnerIds, partnerConfidences;
      // If the confidence to connectors is changed, the list of partners is a
      // list of treenode-connector links. A regular confidence change returns
      // the changed treenode.
      if (toConnector) {
        partnerIds = [];
        partnerConfidences = [];
        for (var n in updatedNodes) {
          var node = updatedNodes[n];
          var mappedNode = map.get(map.LINK, n, command);
          partnerIds.push(mappedNode);
          partnerConfidences.push(node.old_confidence);
        }
      } else {
        // Expect only a single updated edge, the one to the parent. No need to
        // check parent ID here.
        for (var n in updatedNodes) {
          var node = updatedNodes[n];
          oldConfidence = node.old_confidence;
          break;
        }
        // Check explicitely for undefined and not !oldConfidence to allow also
        // a confidence of zero.
        if (undefined === oldConfidence) {
          throw new CATMAID.ValueError("Can't undo confidence update, missing " +
              "history information");
        }
      }

      var undoState = new CATMAID.LocalState([mNode.value, mNode.timestamp]);
      var updateConfidence = CATMAID.Nodes.updateConfidence(undoState,
          projectId, mNode.value, oldConfidence, toConnector, partnerIds,
          partnerConfidences);

      return updateConfidence.then(function(result) {
        // Update mapping
        var updatedNodes = result.updatedPartners;
        // update stored state of mapped nodes, needed for undo
        if (toConnector) {
          for (var n in updatedNodes) {
            var node = updatedNodes[n];
            map.add(map.LINK, n, n, node.edition_time);
          }
        } else {
          // Add original mapping explicitely
          var updatedNodeIds = Object.keys(updatedNodes);
          if (1 === updatedNodeIds.length) {
            var updatedNode = updatedNodes[updatedNodeIds[0]];
            if (updatedNode) {
              map.add(map.NODE, umNode[0], mNode.value, updatedNode.edition_time);
            }
          } else {
            throw new CATMAID.ValueError("Didn't expect more than one updated node for confidence update");
          }
        }
        done();
      });
    };

    var title;
    if (toConnector) {
      title = "Update confidence between node #" + nodeId +
        " and its linked connectors to " + newConfidence;
    } else {
      title = "Update confidence between node #" + nodeId +
        " and its parent to " + newConfidence;
    }

    this.init(title, exec, undo);
  });

  /**
   * Remove a node in an undoable fashion.
   *
   * @param {State}   state     Neighborhood state of node
   * @param {integer} projectId Project the node to remove is part of
   * @param {integer} nodeId    The node to remove
   */
  CATMAID.RemoveNodeCommand = CATMAID.makeCommand(function(
        state, projectId, nodeId) {

    // Use passed in state only to extract parent ID and edit time. A new state
    // will be constructed for actually executing the command (to cover redo).
    var umNode = state.getNode(nodeId);
    var umParent = state.getParent(nodeId) || [null, null];
    var umChildren = state.getChildren(nodeId);
    var umLinks = state.getLinks(nodeId);

    var exec = function(done, command, map) {

      // Map nodes to current ID and time
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var mParent = map.getWithTime(map.NODE, umParent[0], umParent[1], command);

      // Formulate expectations for back-end, a state that includes all mapped
      // children, parent and links of the node created originally.
      var mChildren = umChildren.map(function(c) {
        var mChild = map.getWithTime(map.NODE, c[0], c[1], command);
        return [mChild.value, mChild.timestamp];
      });
      var mLinks = umLinks.map(function(l) {
        var mLink = map.getWithTime(map.LINK, l[0], l[1], command);
        return [mLink.value, mLink.timestamp];
      });

      // Try to delete node with a new local state
      var execState = new CATMAID.LocalState([mNode.value, mNode.timestamp],
          [mParent.value, mParent.timestamp], mChildren, mLinks);
      var removeNode = CATMAID.Nodes.remove(execState, projectId, mNode.value);

      return removeNode.then(function(result) {
        // Even though the node and potentially some links were removed, the
        // previous node and links IDs need to be stored. The reason being that
        // undo should mep the newly created node to the original values
        map.add(map.NODE, umNode[0], mNode.value, mNode.timestamp);
        if (result.links) {
          result.links.forEach(function(l) {
            // Find removed link in mapped links
            for (var i=0, max=mLinks.length; i<max; ++i) {
              var link = mLinks[i];
              if (link && link[0] == l[0]) {
                var umLink = umLinks[i];
                map.add(map.LINK, umLink[0], link[0], link[1]);
                break;
              }
            }
          });
        }
        // Update mapping of children, their ID shouldn't have changed so that
        // we can let the map reverse-loopkup the original ID.
        if (result.children) {
          result.children.forEach(function(c) {
            map.add(map.NODE, c[0], c[0], c[1]);
          });
        }

        // Store information required for undo
        command.store('x', result.x);
        command.store('y', result.y);
        command.store('z', result.z);
        command.store('children', result.children);
        command.store('links', result.links);
        command.store('radius', result.radius);
        command.store('confidence', result.confidence);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      // Obtain other parameters and validate
      var radius = command.get('radius');
      var confidence = command.get('confidence');
      var x = command.get('x'), y = command.get('y'), z = command.get('z');
      var links = command.get('links');
      command.validateForUndo(confidence, radius, x, y, z, links);

      // Make sure we get the current IDs of the parent and former children,
      // which could have been modified through a redo operation.
      var mParent = map.getWithTime(map.NODE, umParent[0], umParent[1], command);
      var mParentId = mParent.value;
      var mParentEditTime = mParent.timestamp;

      // Get IDs of previous children and map them to their current values
      var mChildren = command.get('children').map(function(child) {
        return this.getNodeWithTime(child[0], child[1], command);
      }, map);

      // Re-create removed conncetions, each list element is a list of this
      // form: [<link_id>, <relation-id>, <connector-id>, <link-confidence>]
      var mLinks = links.map(function(link) {
        // Create result element [<connector-id>, <relation-id>, <confidence>]
        return [this.getNodeId(link[2], command), link[1], link[3]];
      }, map);

      // If there were child nodes before the removal, link to them again. The
      // creation state can be used, because the required creation and insertion
      // states are subsets of the removal state
      var create;
      if (0 === mChildren.length) {
        var undoState = new CATMAID.LocalState(undefined, [mParentId, mParentEditTime]);
        create = CATMAID.Nodes.create(undoState, projectId, x, y, z,
            mParentId, radius, confidence, undefined, undefined, mLinks);
      } else {
        var parentEditionTime = "";
        var undoState = new CATMAID.LocalState([mParentId, mParentEditTime], undefined,
            mChildren.map(function(c) { return [c.value, c.timestamp]; }), links);
        var mPrimaryChildId = mChildren[0].value;
        var takeOverChildIds = mChildren.slice(1).map(function(c) { return c.value; });
        create = CATMAID.Nodes.insert(undoState, projectId, x, y, z, mParentId,
            mPrimaryChildId, radius, confidence, undefined, takeOverChildIds, mLinks);
      }

      return create.then(function(result) {
        // Store ID of new node created by this command
        map.add(map.NODE, umNode[0], result.treenode_id, result.edition_time);
        // Map ID change of children and links
        if (result.child_edition_times) {
          result.child_edition_times.forEach(function(c) {
            map.add(map.NODE, c[0], c[0], c[1]);
          });
        }
        if (result.created_links) {
          result.created_links.forEach(function(l, i) {
            var umLinkId = umLinks[i][0];
            map.add(map.LINK, umLinkId, l[0], l[1]);
          });
        }
        done();
        return result;
      });
    };

    var title = "Remove node #" + nodeId;

    this.init(title, exec, undo);
  });

  /**
   * Create a new treenode in a skeleton. If no parent is given, a new
   * skeleton is created. This command is reversible.
   *
   * @param {integer} projectId  The project space to create the node in
   * @param {number}  x          The X coordinate of the node's location
   * @param {number}  y          The Y coordinate of the node's location
   * @param {number}  z          The Z coordinate of the node's location
   * @param {integer} parentId   (Optional) Id of the parent node of the new node
   * @param {number}  radius     (Optional) Radius of the new node
   * @param {integer} confidence (Optional) Confidence of edge to parent
   * @param {integer} useNeuron  (Optional) Target neuron ID to double check
   * @param {string}  neuronName (Optional) Naming pattern for new neuron
   *
   * @returns a promise that is resolved once the treenode is created
   */
  CATMAID.CreateNodeCommand = CATMAID.makeCommand(function(
        state, projectId, x, y, z, parentId, radius, confidence, useNeuron, neuronName) {

    // Use passed in state only to extract parent ID and edit time. A new state
    // will be constructed for actually executing the command (to cover redo).
    var umParent, umParentId, umParentEditTime;
    if (parentId && -1 != parentId) {
      umParent = state.getNode(parentId);
      umParentId = umParent[0];
      umParentEditTime = umParent[1];
    }

    // First execution will set the original node that all mapping will refer to
    var umNodeId, umNodeEditTime;

    var exec = function(done, command, map) {
      // Get current, mapped version of parent ID as well as its latest
      // timestamp. The alternative would be to get the timestamp from the
      // current state. Since this state might change before the command is
      // executed (like changing a section), a copy of the data is used.
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime, command);
      var execState = new CATMAID.LocalState(null, [mParent.value, mParent.timestamp]);

      // Create node, error handling has to be done by caller
      var create = CATMAID.Nodes.create(execState, projectId, x, y, z,
          mParent.value, radius, confidence, useNeuron, neuronName);

      return create.then(function(result) {
        // First execution will remember the added node for redo mapping
        if (!umNodeId) {
          umNodeId = result.treenode_id;
          umNodeEditTime = result.edition_time;
        }
        // Store ID of new node created by this command
        map.add(map.NODE, umNodeId, result.treenode_id, result.edition_time);
        command.store('nodeId', result.treenode_id);
        command.store('nodeEditTime', result.edition_time);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var umNodeId = command.get('nodeId');
      var umNodeEditTime = command.get("nodeEditTime");
      command.validateForUndo(umNodeId, umNodeEditTime);

      // Map nodes to current ID and time
      var mNode = map.getWithTime(map.NODE, umNodeId, umNodeEditTime, command);
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime, command);

      // Formulate expectations for back-end, a neighborhood state of the mapped
      // children, parent and links of the node created originally.
      var children = [], links = [];
      var undoState = new CATMAID.LocalState([mNode.value, mNode.timestamp],
          [mParent.value, mParent.timestamp], children, links);

      var removeNode = CATMAID.Nodes.remove(undoState, projectId, mNode.value);
      return removeNode.then(done);
    };

    var title = "Create new node with parent " + parentId + " at (" +
        x + ", " + y + ", " + z + ")";

    this.init(title, exec, undo);
  });

  /**
   * Insert a new treenode in a skeleton, optionally between two nodes. If no
   * parent is given, a new skeleton is created. This action is reversible.
   *
   * @param {integer} projectId  The project space to create the node in
   * @param {number}  x          The X coordinate of the node's location
   * @param {number}  y          The Y coordinate of the node's location
   * @param {number}  z          The Z coordinate of the node's location
   * @param {integer} parentId   Id of the parent node of the new node
   * @param {integer} childId    Id of child to insert in edge
   * @param {number}  radius     (Optional) Radius of the new node
   * @param {integer} confidence (Optional) Confidence of edge to parent
   * @param {integer} useNeuron  (Optional) Target neuron ID to double check
   *
   * @returns a promise that is resolved once the treenode is created
   */
  CATMAID.InsertNodeCommand = CATMAID.makeCommand(function(
      state, projectId, x, y, z, parentId, childId, radius, confidence, useNeuron) {

    var umParent = state.getNode(parentId) || [null, null];
    var umParentId = umParent[0];
    var umParentEditTime = umParent[1];

    var umChild, umChildId, umChildEditTime;
    if (childId) {
      umChild = state.getNode(childId);
      umChildId = umChild[0];
      umChildEditTime = umChild[1];
    }

    // First execution will set the original node that all mapping will refer to
    var umNodeId, umNodeEditTime;

    var exec = function(done, command, map) {
      // Get current, mapped version of parent and child ID as well as their
      // last timestamp
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime, command);
      var mChild = map.getWithTime(map.NODE, umChildId, umChildEditTime, command);

      var execState = new CATMAID.LocalState([mParent.value, mParent.timestamp],
          null, [[mChild.value, mChild.timestamp]]);
      var insert = CATMAID.Nodes.insert(execState, projectId, x, y, z,
          mParent.value, mChild.value, radius, confidence, useNeuron);

      return insert.then(function(result) {
        // First execution will remember the added node for redo mapping
        if (!umNodeId) {
          umNodeId = result.treenode_id;
          umNodeEditTime = result.edition_time;
        }
        // Store ID of new node created by this command
        map.add(map.NODE, umNodeId, result.treenode_id, result.edition_time);
        command.store('nodeId', result.treenode_id);
        command.store('nodeEditTime', result.edition_time);

        // Map ID change of children and links
        if (mChild && result.child_edition_times) {
          result.child_edition_times.forEach(function(c) {
            // There should be exactly one updated child having the ID of the
            // mapped child above.
            if (c[0] == mChild.value) {
              map.add(map.NODE, umChildId, c[0], c[1]);
            }
          });
        }

        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var nodeId = command.get('nodeId');
      var nodeEditTime = command.get('nodeEditTime');
      command.validateForUndo(nodeId, nodeEditTime);

      // Map nodes to current ID and time
      var mNode = map.getWithTime(map.NODE, nodeId, nodeEditTime, command);
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime, command);
      var mChild = map.getWithTime(map.NODE, umChildId, umChildEditTime, command);

      // Formulate expectations for back-end, a neighborhood state of the mapped
      // children, parent and links of the node created originally.
      var children = childId ? [[mChild.value, mChild.timestamp]] : [];
      var links = [];
      var undoState = new CATMAID.LocalState([mNode.value, mNode.timestamp],
          [mParent.value, mParent.timestamp], children, links);

      var removeNode = CATMAID.Nodes.remove(undoState, projectId, mNode.value);
      return removeNode.then(function(result) {

        // Map ID change of children and links
        if (mChild && result.children) {
          result.children.forEach(function(c) {
            // There should be exactly one updated child having the ID of the
            // mapped child above.
            if (c[0] == mChild.value) {
              map.add(map.NODE, umChildId, c[0], c[1]);
            }
          });
        }

        done();
      });
    };

    var title = "Inset new node between parent #" + parentId + " and child #" +
        childId + " at (" + x + ", " + y + ", " + z + ")";

    this.init(title, exec, undo);
  });

  /**
   * Map a node update list (list of four-element list with the first being the
   * node ID. The context is expected to be a CommandStore.
   */
  function mapNodeUpdateList(state, type, map, command, node) {
    var nodeState = map.getWithTime(type, node[0], node[1], command);
    state[nodeState.value] = nodeState.timestamp;
    return [nodeState.value, node[2], node[3], node[4]];
  }

  /**
   * Update one or more treenodes and connectors.
   */
  CATMAID.UpdateNodesCommand = CATMAID.makeCommand(
      function(state, projectId, treenodes, connectors) {
    // Expect each treenode to be an array where the first element is the
    // treenode ID. Map to nodes from state. and create array of the following
    // form: [<id>, <edition-time>, <x>, <y>, <z>].
    var toNode = function(e) { return [e[0], state.getNode(e[0])[1], e[1], e[2], e[3]]; };
    var umNodes = treenodes ? treenodes.map(toNode) : [];
    var umConnectors = connectors ? connectors.map(toNode) : [];

    var exec = function(done, command, map) {
      var state = {};
      var mapAndRecordNode = mapNodeUpdateList.bind(null, state, map.NODE, map, command);
      var mapAndRecordConn = mapNodeUpdateList.bind(null, state, map.CONNECTOR, map, command);

      var mTreenodes = umNodes.map(mapAndRecordNode);
      var mConnectors = umConnectors.map(mapAndRecordConn);

      // Create a new mapped local state and call model function, which will
      // create multi node state for all treenodes and connectors.
      var execState = new CATMAID.SimpleSetState(state);
      var update = CATMAID.Nodes.update(execState, projectId, mTreenodes, mConnectors);
      return update.then(function(result) {
        var updatedTreenodes = result.old_treenodes;
        var updatedConnectors = result.old_connectors;
        // Map updated nodes forward
        if (updatedTreenodes) {
          for (var n=0; n<updatedTreenodes.length; ++n) {
            var node = updatedTreenodes[n];
            map.add(map.NODE, umNodes[n][0], node[0], node[1]);
          }
          command.store('updatedTreenodes', updatedTreenodes);
        }
        if (updatedConnectors) {
          for (var n=0; n<updatedConnectors.length; ++n) {
            var ctr = updatedConnectors[n];
            map.add(map.CONNECTOR, umConnectors[n][0], ctr[0], ctr[1]);
          }
          command.store('updatedConnectors', updatedConnectors);
        }
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      // Get updated treenodes and connectors and validate if any
      var updatedTreenodes = command.get('updatedTreenodes');
      var updatedConnectors = command.get('updatedConnectors');
      if (treenodes && treenodes.length > 0) {
        command.validateForUndo(updatedTreenodes);
      }
      if (connectors && connectors.length > 0) {
        command.validateForUndo(updatedConnectors);
      }

      var state = {};
      var mapAndRecordNode = mapNodeUpdateList.bind(null, state, map.NODE, map, command);
      var mapAndRecordConn = mapNodeUpdateList.bind(null, state, map.CONNECTOR, map, command);

      // Expect treenodes and connectors of this form: [<id>, <edition-time>, <x>, <y>, <z>]
      var mTreenodes = updatedTreenodes ? updatedTreenodes.map(mapAndRecordNode) : undefined;
      var mConnectors = updatedConnectors ? updatedConnectors.map(mapAndRecordConn) : undefined;

      // Create a new mapped local state and call model function, which will
      // create multi node state for all treenodes and connectors.
      var undoState = new CATMAID.SimpleSetState(state);
      var update = CATMAID.Nodes.update(undoState, projectId, mTreenodes, mConnectors);
      return update.then(function(result) {
        var updatedTreenodes = result.old_treenodes;
        var updatedConnectors = result.old_connectors;
        // Map updated nodes forward
        if (updatedTreenodes) {
          for (var n=0; n<updatedTreenodes.length; ++n) {
            var node = updatedTreenodes[n];
            map.add(map.NODE, umNodes[n][0], node[0], node[1]);
          }
        }
        if (updatedConnectors) {
          for (var n=0; n<updatedConnectors.length; ++n) {
            var ctr = updatedConnectors[n];
            map.add(map.CONNECTOR, umConnectors[n][0], ctr[0], ctr[1]);
          }
        }
        done();
        return result;
      });
    };

    var nTreenodes = treenodes ? treenodes.length : 0;
    var nConnectors = connectors ? connectors.length : 0;
    var title;
    if (nTreenodes > 0 && nConnectors > 0) {
      title = "Update " + nTreenodes + " treenode(s) and " +
        nConnectors + " connectors";
    } else if (nTreenodes > 0) {
      title = "Update " + nTreenodes + " treenode(s)";
    } else if (nConnectors > 0) {
      title = "Update " + nConnectors + " connector(s)";
    } else {
      title = "No-op: update no treenods and connectors";
    }

    this.init(title, exec, undo);
  });

})(CATMAID);
