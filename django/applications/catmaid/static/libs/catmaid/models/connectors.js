/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with annotations on neurons. All
   * of them return promises.
   */
  var Connectors = {

    /**
     * Create a new connector.
     *
     * @param {integer} projectId  The project space to create the connector in
     * @param {integer} x          The X coordinate of the connector's location
     * @param {integer} y          The Y coordinate of the connector's location
     * @param {integer} z          The Z coordinate of the connector's location
     * @param {integer} confidence Optional confidence in range 1-5
     *
     * @returns a promise that is resolved once the connector is created
     */
    create: function(projectId, x, y, z, confidence) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create connectors');
      var url = projectId + '/connector/create';
      var params = {
          pid: projectId,
          confidence: confidence,
          x: x,
          y: y,
          z: z
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
              result.connector_id, x, y, z);
          return {
            newConnectorId: result.connector_id,
            newConnectorEditTime: result.connector_edition_time
          };
        });
    },

    /**
     * Remove a single connector from a project.
     *
     * @param {integer} projectId  The project space to delete the connector from
     * @param {integer} connectorId The connector to remove
     *
     * @returns a promise that resolves once the connector is removed
     */
    remove: function(state, projectId, connectorId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove connectors');
      var url = projectId + '/connector/delete';
      var params = {
        connector_id: connectorId,
        state: state.makeNeighborhoodState(connectorId, true)
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_CONNECTOR_REMOVED,
              result.connector_id);
          return {
            deletedConnector: result.connector_id,
            confidence: result.confidence,
            x: result.x,
            y: result.y,
            z: result.z,
            partners: result.partners
          };
        });
    },

    /**
     * Get detailed information about a connector. Where it is and to what nodes
     * it connects.
     *
     * @param {integer} projectId  The project space to get the connector from
     * @param {integer} connectorId The connector to get information on
     *
     * @returns a promise that resolves once the connector info is returned
     */
    info: function(projectId, connectorId) {
      CATMAID.requirePermission(projectId, 'can_browse',
          'You don\'t have have permission to get connector details');
      var url = projectId + '/connector/' + connectorId + '/detail';

      return CATMAID.fetch(url, 'GET')
        .then(function(result) {
          return {
            connectorId: result.connector_id,
            x: result.x,
            y: result.y,
            z: result.z,
            confidence: result.confidence,
            partners: result.partners
          };
        });
    },

    /**
     * Create a link between a connector and a node.
     *
     * @param {integer} projectId   The project space of the new link
     * @param {integer} connectorId The connector linked to
     * @param {integer} nodeId      The node linked to
     * @param {string}  linkType    Relation to create
     */
    createLink: function(state, projectId, connectorId, nodeId, linkType) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create links');
      var url = projectId + '/link/create';
      var params = {
        pid: projectId,
        from_id: nodeId,
        link_type: linkType,
        to_id: connectorId,
        state: state.makeMultiNodeState([nodeId, connectorId])
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_LINK_CREATED,
              result.link_id, linkType, nodeId);
          return {
            linkId: result.link_id,
            linkEditTime: result.link_edition_time
          };
        });
    },

    /**
     * Create a link between a connector and a node.
     *
     * @param {integer} projectId   The project space of the new link
     * @param {integer} connectorId The linked connector
     * @param {integer} nodeId      The linked node
     */
    removeLink: function(state, projectId, connectorId, nodeId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove links');
      var url = projectId + '/link/delete';
      var params = {
        pid: projectId,
        connector_id: connectorId,
        treenode_id: nodeId,
        state: state.makeMultiNodeState([nodeId, connectorId])
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_LINK_REMOVED,
              result.link_id, result.link_type, result.link_type_id,
              connectorId, nodeId);
          return {
            linkId: result.link_id,
            linkType: result.link_type,
            linkTypeId: result.link_type_id
          };
        });
    }
  };

  CATMAID.asEventSource(Connectors);
  Connectors.EVENT_CONNECTOR_CREATED = "connector_created";
  Connectors.EVENT_CONNECTOR_REMOVED = "connector_removed";
  Connectors.EVENT_LINK_CREATED = "link_created";
  Connectors.EVENT_LINK_REMOVED = "link_removed";

  // Export connector namespace
  CATMAID.Connectors = Connectors;

  /**
   * Create a new connector with this command. Can be undone.
   *
   * @param {integer} projectId  The project space to create the connector in
   * @param {integer} x          The X coordinate of the connector's location
   * @param {integer} y          The Y coordinate of the connector's location
   * @param {integer} z          The Z coordinate of the connector's location
   * @param {integer} confidence (Optional) confidence in range 1-5
   *
   */
  CATMAID.CreateConnectorCommand = CATMAID.makeCommand(
      function(projectId, x, y, z, confidence) {

    // First execution will set the original connector node that all mappings
    // will refer to.
    var umConnectorId, umConnectorEditTime;

    var exec = function(done, command, map) {
      var create = CATMAID.Connectors.create(projectId, x, y, z, confidence);
      return create.then(function(result) {
        // First execution will remember the added node for redo mapping
        if (!umConnectorId) {
          umConnectorId = result.newConnectorId;
          umConnectorEditTime = result.newConnectorEditTime;
        }
        map.add(map.CONNECTOR, umConnectorId, result.newConnectorId,
            result.newConnectorEditTime);
        command.store('connectorId', result.newConnectorId);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      command.validateForUndo(umConnectorId, umConnectorEditTime);
      var mConnector = map.getWithTime(map.CONNECTOR, umConnectorId,
          umConnectorEditTime, command);
      command.validateForUndo(mConnector);
      // Connector removal requires a complete connector state, including all
      // links (which don't exist for a newly created node).
      var links = [];
      var undoState = new CATMAID.LocalState([mConnector.value, mConnector.timestamp],
          null, null, links);
      var remove = CATMAID.Connectors.remove(undoState, projectId, mConnector.value);
      return remove.then(function(result) {
        done();
      });
    };

    var title = "Create new connector at (" + x + ", " + y + ", " + z + ")";

    this.init(title, exec, undo);
  });

  /**
   * Delete a connector with this command. Can be undone.
   */
  CATMAID.RemoveConnectorCommand = CATMAID.makeCommand(
      function(projectId, connectorId) {
    var exec = function(done, command, map) {
      // Get connector information
      var remove = CATMAID.Connectors.remove(projectId, connectorId);

      return remove.then(function(result) {
        command.store('confidence', result.confidence);
        command.store('x', result.x);
        command.store('y', result.y);
        command.store('z', result.z);
        command.store('partners', result.partners);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var confidence = command.get('confidence');
      var partners = command.get('partners');
      var x = command.get('x'), y = command.get('y'), z = command.get('z');
      command.validateForUndo(confidence, partners, x, y, z);

      var create = CATMAID.Connectors.create(projectId, x, y, z, confidence);
      var linkPartners = create.then(function(result) {
        var connectorId = result.newConnectorId;
        return Promise.all(partners.map(function(p) {
          return CATMAID.Connectors.createLink(projectId,
              connectorId, p.id, p.rel);
        }));
      });
      return linkPartners.then(done);
    };

    var title = "Remove connector #" + connectorId;

    this.init(title, exec, undo);
  });

  CATMAID.LinkConnectorCommand = CATMAID.makeCommand(
      function(state, projectId, connectorId, nodeId, linkType) {

    var umNode = state.getNode(nodeId);
    var umConnector = state.getNode(connectorId);

    var exec = function(done, command, map) {
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var mConnector = map.getWithTime(map.CONNECTOR, umConnector[0], umConnector[1], command);

      var nodes = {};
      nodes[mNode.value] = mNode.timestamp;
      nodes[mConnector.value] = mConnector.timestamp;
      var execState = new CATMAID.SimpleSetState(nodes);

      var link = CATMAID.Connectors.createLink(execState, projectId,
          mConnector.value, mNode.value, linkType);
      return link.then(function(result) {
        map.add(map.LINK, umNode[0], result.linkId, result.linkEditTime);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var mConnector = map.getWithTime(map.CONNECTOR, umConnector[0], umConnector[1], command);
      command.validateForUndo(mConnector, mNode);

      var nodes = {};
      nodes[mNode.value] = mNode.timestamp;
      nodes[mConnector.value] = mConnector.timestamp;
      var undoState = new CATMAID.SimpleSetState(nodes);

      var unlink = CATMAID.Connectors.removeLink(undoState,
          projectId, mConnector.value, mNode.value);
      return unlink.then(function(result) {
        done();
        return result;
      });
    };

    var title = "Link connector " + connectorId + " with node " +
        nodeId + " through relation \"" + linkType + "\"";
    this.init(title, exec, undo);
  });

  CATMAID.UnlinkConnectorCommand = CATMAID.makeCommand(
      function(projectId, connectorId, nodeId) {

    var exec = function(done, command, map) {
      var mConnectorId = map.get(map.CONNECTOR, connectorId, command);
      var mNodeId = map.get(map.NODE, nodeId, command);
      var link = CATMAID.Connectors.removeLink(projectId, mConnector, mNode);
      return link.then(function(result) {
        map.add(map.LINK, result.linkId, result.linkEditTime, command);
        command.store('linkType', result.linkType);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      // Fail if expected undo parameters are not available from command
      var mConnectorId = map.get(map.CONNECTOR, connectorId, command);
      var mNodeId = map.get(map.NODE, nodeId, command);
      var linkType = command.get('linkType');
      command.validateForUndo(mConnectorId, mNodeId, linkType);

      var link = CATMAID.Connectors.createLink(
          projectId, mConnectorId, mNodeId, linkType);
      return link.then(done);
    };

    var title = "Remove link between connector " + connectorId + " and node ";
    this.init(title, exec, undo);
  });

})(CATMAID);
