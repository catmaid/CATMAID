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
     * @returns A new promise that is resolved once the radius is updated. It
     *          contains all updated nodes along with their old radii.
     */
    updateRadius: function(projectId, nodeId, radius, updateMode) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to update the radius of a node');
      var url = projectId + '/treenode/' + nodeId + '/radius';
      var params = {
        radius: radius,
        option: updateMode
      };

      return CATMAID.fetch(url, 'POST', params).then(function(json) {
        return {
          // An object mapping node IDs to their old and new radius is returned.
          'updatedNodes': json.updated_nodes
        };
      });
    },

    /**
     * Update the radius of a list of nodes.
     *
     * @returns A new promise that is resolved once the radius is updated. It
     *          contains all updated nodes along with their old radii.
     */
    updateRadii: function(projectId, nodesVsRadii) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to update the radius of a node');
      var url = projectId + '/treenodes/radius';
      var treenodeIds = Object.keys(nodesVsRadii);
      var params = {
        treenode_ids: treenodeIds,
        treenode_radii: treenodeIds.map(function(tnid) {
          return nodesVsRadii[tnid];
        })
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
     * Create a new treenode in a skeleton. If no parent is given, a new
     * skeleton is created.
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
    create: function(projectId, x, y, z, parentId, radius, confidence, useNeuron, neuronName) {
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
        neuron_name: neuronName
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id);
          return result;
        });
    },

    /**
     * Insert a new treenode in a skeleton, optionally between two nodes. If no
     * parent is given, a new skeleton is created.
     *
     * @param {integer} projectId  The project space to create the node in
     * @param {number}  x          The X coordinate of the node's location
     * @param {number}  y          The Y coordinate of the node's location
     * @param {number}  z          The Z coordinate of the node's location
     * @param {integer} parentId   (Optional) Id of the parent node of the new node
     * @param {integer} childId    (Optional) Id of child to insert in edge
     * @param {number}  radius     (Optional) Radius of the new node
     * @param {integer} confidence (Optional) Confidence of edge to parent
     *
     * @returns a promise that is resolved once the treenode is created
     */
    insert: function(projectId, x, y, z, parentId, childId, radius, confidence, useNeuron) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create a new node');

      var url = projectId + '/treenode/insert';
      var params = {
        parent_id: node.parent_id,
        child_id: childId,
        x: x,
        y: y,
        z: z,
        radius: node.radius,
        confidence: node.confidence,
        useneuron: node.useneuron
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
              result.skeleton_id);
          return result;
        });
    },

    /**
     * Delete a treenode.
     *
     * @param {integer} projectID  The project the treenode is part of
     * @param {integer} treenodeID The treenode to delete
     *
     * @returns promise deleting the treenode
     */
    remove: function(projectId, nodeId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove a new node');

      var url = projectId + '/treenode/delete';
      var params = {
        treenode_id: nodeId
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
    }

  };

  // If annotations are deleted entirely
  Nodes.EVENT_NODE_CONFIDENCE_CHANGED = "node_confidence_changed";
  CATMAID.asEventSource(Nodes);

  // Export nodes
  CATMAID.Nodes = Nodes;

  CATMAID.UpdateNodeRadiusCommand = CATMAID.makeCommand(function(projectId,
        nodeId, radius, updateMode) {

    var exec = function(done, command) {
      var updateRadius = CATMAID.Nodes.updateRadius(projectId, nodeId,
          radius, updateMode);

      return updateRadius.then(function(result) {
        // The returned updatedNodes list contains objects with a node id and
        // the old radius.
        command._updatedNodes = result.updatedNodes;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._updatedNodes) {
        throw new CATMAID.ValueError('Can\'t undo radius update, history data not available');
      }

      var oldRadii = Object.keys(command._updatedNodes).reduce(function(o, n) {
        o[n] = command._updatedNodes[n].old;
        return o;
      }, {});

      var updateRadii = CATMAID.Nodes.updateRadii(projectId, oldRadii);
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

})(CATMAID);
