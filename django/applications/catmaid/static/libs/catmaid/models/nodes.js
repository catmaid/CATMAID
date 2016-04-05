/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

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
        state: state
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
        state: state
      };

      return CATMAID.fetch(url, 'POST', params).then(function(json) {
        return {
          // An object mapping node IDs to their old and new radius is returned.
          'updatedNodes': json.updated_nodes,
        };
      });
    },

    /**
     * Update confidence of a node to its parent.
     *
     * @returns A new promise that is resolved once the confidence has been
     *          successfully updated.
     */
    updateConfidence: function(projectId, nodeId, newConfidence, toConnector, partnerId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to change the node confidence');

      var url = projectId + '/treenodes/' + nodeId + '/confidence';
      var params = {
        to_connector: toConnector,
        new_confidence: newConfidence,
      };
      if (partnerId) {
        params[partner_id] = partnerId;
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

      var url = projectId + '/treenode/' + nodeId + '/parent';
      var params = {
        parent_id: newParentId
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
          CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_CREATED,
              result.treenode_id, x, y, z);
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id);
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

        // If a child Id is given, an edge state is required. Without a child, a
        // parent state suffices.
      var effectiveState = childId ? state.makeEdgeState(childId, parentId) :
        state.makeParentState(parentId);

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
        state: effectiveState
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_CREATED,
              result.treenode_id, x, y, z);
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id);
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
          // Emit deletion event, if the last node was removed and the neuron
          // deleted. Otherwise, trigger a change event for the neuron.
          var neuron_id = null;
          if (result.deleted_neuron) {
            CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
                result.skeleton_id);
          } else {
            CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
                result.skeleton_id);
          }

          return result;
        });
    },

    /**
     * Update location of multiple treenodes and multiple connectors.
     *
     * @param {integer[]} treenodes  The list of four-element list each
     *                               containing a treenode ID and 3D location.
     * @param {integer[]} connectors The list of four-element list each
     *                               containing a connector ID and 3D location.
     *
     * @returns a promise resolving after the update succeeded
     */
    update: function(projectId, treenodes, connectors) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to update nodes');

      var url = projectId + '/node/update';
      var params = {
        t: treenodes,
        c: connectors
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
    }

  };

  function announceNodeUpdate(node) {
    CATMAID.Nodes.trigger(CATMAID.Nodes.EVENT_NODE_UPDATED, node[0]);
  }

  // If annotations are deleted entirely
  Nodes.EVENT_NODE_CONFIDENCE_CHANGED = "node_confidence_changed";
  Nodes.EVENT_NODE_RADIUS_CHANGED = "node_radius_changed";
  Nodes.EVENT_NODE_CREATED = "node_created";
  Nodes.EVENT_NODE_UPDATED = "node_updated";
  CATMAID.asEventSource(Nodes);

  // Export nodes
  CATMAID.Nodes = Nodes;

  CATMAID.UpdateNodeRadiusCommand = CATMAID.makeCommand(function(
        state, projectId, nodeId, radius, updateMode) {

    var exec = function(done, command) {
      var updateRadius = CATMAID.Nodes.updateRadius(state, projectId, nodeId,
          radius, updateMode);

      return updateRadius.then(function(result) {
        // The returned updatedNodes list contains objects with a node id and
        // the old radius.
        command.store("updatedNodes", result.updatedNodes);
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      var updatedNodes = command.get("updatedNodes");
      command.validateForUndo(updatedNodes);

      var updateNodeIds = Object.keys(updatedNodes);
      var oldRadii = updateNodeIds.reduce(function(o, n) {
        o[n] = updatedNodes[n].old;
        return o;
      }, {});
      // Create state that contains information about all modified nodes
      var editionTimes = updateNodeIds.reduce(function(o, n) {
        o[n] = updatedNodes[n].edition_time;
        return o;
      }, {});
      var state = CATMAID.getMultiNodeState(editionTimes);

      var updateRadii = CATMAID.Nodes.updateRadii(state, projectId, oldRadii);
      return updateRadii.then(done);
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
        projectId, nodeId, newConfidence, toConnector) {
    var exec = function(done, command) {
      var updateConfidence = CATMAID.Nodes.updateConfidence(projectId, nodeId,
          newConfidence, toConnector);

      return updateConfidence.then(function(result) {
        // The returned updatedNodes list contains objects with a node id and
        // the old radius.
        command._updatedPartners = result.updatedPartners;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._updatedPartners) {
        throw new CATMAID.ValueError('Can\'t undo confidence update, ' +
            'history data not available');
      }

      var promises = Object.keys(command._updatedPartners).map(function(partnerId) {
        var oldConfidence = command._updatedPartners[partnerId];
        return CATMAID.Nodes.updateConfidence(projectId, nodeId, oldConfidence,
            toConnector, partnerId);
      });

      return Promise.all(promises);
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
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1]);
      var mParent = map.getWithTime(map.NODE, umParent[0], umParent[1]);

      // Formulate expectations for back-end, a state that includes all mapped
      // children, parent and links of the node created originally.
      var mChildren = umChildren.map(function(c) {
        var mChild = map.getWithTime(map.NODE, c[0], c[1]);
        return [mChild.value, mChild.timestamp];
      });
      var mLinks = umLinks.map(function(l) {
        var mLink = map.getWithTime(map.LINK, l[0], l[1]);
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
      var mParent = map.getWithTime(map.NODE, umParent[0], umParent[1]);
      var mParentId = mParent.value;
      var mParentEditTime = mParent.timestamp;

      // Get IDs of previous children and map them to their current values
      var mChildren = command.get('children').map(function(child) {
        return this.getNodeWithTime(child[0], child[1]);
      }, map);

      // Re-create removed conncetions, each list element is a list of this
      // form: [<link_id>, <relation-id>, <connector-id>, <link-confidence>]
      var mLinks = links.map(function(link) {
        // Create result element [<connector-id>, <relation-id>, <confidence>]
        return [this.getNodeId(link[2]), link[1], link[3]];
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
            mPrimaryChildId, radius, confidence, takeOverChildIds, mLinks);
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
    var umParent = state.getNode(parentId);
    var umParentId = umParent[0];
    var umParentEditTime = umParent[1];

    var exec = function(done, command, map) {
      // Get current, mapped version of parent ID as well as its latest
      // timestamp. The alternative would be to get the timestamp from the
      // current state. Since this state might change before the command is
      // executed (like changing a section), a copy of the data is used.
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime);
      var execState = new CATMAID.LocalState(null, [mParent.value, mParent.timestamp]);

      // Create node, error handling has to be done by caller
      var create = CATMAID.Nodes.create(execState, projectId, x, y, z,
          mParent.value, radius, confidence, useNeuron, neuronName);

      return create.then(function(result) {
        // Store ID of new node created by this command
        map.add(map.NODE, null, result.treenode_id, result.edition_time);
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
      var mNode = map.getWithTime(map.NODE, umNodeId, umNodeEditTime);
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime);

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

    var umParent = state.getParent(parentId) || [null, null];
    var umParentId = umParent[0];
    var umParentEditTime = umParent[1];

    var umChild, umChildId, umParentEditTime;
    if (childId) {
      umChildId = childId;
      // Find timestamp for selected c
      var children = state.getChildren(parentId);
      for (var c in children) {
        if (c[0] == childId) {
          umChildEditTime = umChild[1];
        }
      }
    }

    var exec = function(done, command, map) {
      // Get current, mapped version of parent and child ID as well as their
      // last timestamp
      var mParent = map.getWithTime(map.NODE, umParentId, umParentEditTime);
      var mChild = map.getWithTime(map.NODE, umChildId, umChildEditTime);

      var state = CATMAID.getEdgeState(mParent.value, mParent.timestamp,
          mChild.value, mChild.timestamp);
      var insert = CATMAID.Nodes.insert(state, projectId, x, y, z,
          mParent.value, mChild.value, radius, confidence, useNeuron);

      return insert.then(function(result) {
        // Store ID of new node created by this command
        map.add(map.NODE, null, result.treenode_id, result.edition_time);
        command.store('nodeId', result.treenode_id);

        if (childId) {
          map.add(map.NODE, umChildId, mChildId, result.child_edition_time);
        }
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var nodeId = map.get(map.NODE, command.get('nodeId'));
      var state = command.get("state");
      command.validateForUndo(projectId, nodeId, state);

      // Prepare expected state for undo
      var children = [[mChildId, result.child_edition_time]], links = [];
      command.store("state", CATMAID.getNeighborhoodState(result.treenode_id,
            result.edition_time, mParentId, result.parent_edition_time,
            children, links));

      var removeNode = CATMAID.Nodes.remove(state, projectId, nodeId);
      return removeNode.then(done);
    };

    var title = "Inset new node between parent #" + parentId + " and child #" +
        childId + " at (" + x + ", " + y + ", " + z + ")";

    this.init(title, exec, undo);
  });

  /**
   * Map a node update list (list of four-element list with the first being the
   * node ID. The context is expected to be a CommandStore.
   */
  function mapNodeUpdateList(node) {
    /* jshint validthis: true */ // "this" has to be a CommandStore instance
    return [this.get(this.NODE, node[0]), node[1], node[2], node[3]];
  }

  /**
   * Map a connector update list (list of four-element list with the first being
   * the node ID. The context is expected to be a CommandStore.
   */
  function mapConnectorUpdateList(node) {
    /* jshint validthis: true */ // "this" has to be a CommandStore instance
    return [this.get(this.CONNECTOR, node[0]), node[1], node[2], node[3]];
  }

  /**
   * Update one or more treenodes and connectors.
   */
  CATMAID.UpdateNodesCommand = CATMAID.makeCommand(
      function(projectId, treenodes, connectors) {
    var exec = function(done, command, map) {
      var mTreenodes = treenodes ?  treenodes.map(mapNodeUpdateList, map) : undefined;
      var mConnectors = connectors ? connectors.map(mapConnectorUpdateList, map) : undefined;
      var update = CATMAID.Nodes.update(projectId, mTreenodes, mConnectors);
      return update.then(function(result) {
        // Save updated nodes with their old positions
        command.store('old_treenodes', result.old_treenodes);
        command.store('old_connectors', result.old_connectors);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var old_treenodes = command.get('old_treenodes');
      var old_connectors = command.get('old_connectors');
      var mTreenodes = old_treenodes ? old_treenodes.map(mapNodeUpdateList, map) : undefined;
      var mConnectors = old_connectors ? old_connectors.map(mapConnectorUpdateList, map) : undefined;
      var update = CATMAID.Nodes.update(projectId, mTreenodes, mConnectors);
      return update.then(function(result) {
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
