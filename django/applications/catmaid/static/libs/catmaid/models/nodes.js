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
