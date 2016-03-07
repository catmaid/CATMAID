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
      var url = CATMAID.makeURL(projectId + '/connector/create');
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
            newConnectorId: result.connector_id
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
    remove: function(projectId, connectorId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove connectors');
      var url = CATMAID.makeURL(projectId + '/connector/delete');
      var params = {
        connector_id: connectorId
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_CONNECTOR_REMOVED,
              result.result.connector_id);
          return {
            deletedConnector: result.connector_id
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
          'You don\'t have have permission to remove connectors');
      var url = CATMAID.makeURL(projectId + '/connector/' + connectorId + '/detail');

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
    createLink: function(projectId, connectorId, nodeId, linkType) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create links');
      var url = CATMAID.makeURL(projectId + '/link/create');
      var params = {
        pid: projectId,
        from_id: nodeId,
        link_type: linkType,
        to_id: connectorId,
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_LINK_CREATED,
              result.link_id, linkType, nodeId);
          return {
            linkId: result.link_id,
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
    removeLink: function(projectId, connectorId, nodeId) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove links');
      var url = CATMAID.makeURL(projectId + '/link/delete');
      var params = {
        pid: projectId,
        connector_id: connectorId,
        treenode_id: nodeId,
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
    var exec = function(done, command) {
      var create = CATMAID.Connectors.create(projectId, x, y, z, confidence);

      return create.then(function(result) {
        command._createdConnector = result.connector_id;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._createdConnector) {
        throw new CATMAID.ValueError('Can\'t undo creation of connector, history data not available');
      }

      var remove = CATMAID.Connectors.remove(projectId, command._createdConnector);
      return remove.then(done);
    };

    var title = "Create new connector at (" + x + ", " + y + ", " + z + ")";

    this.init(title, exec, undo);
  });

  /**
   * Delete a connector with this command. Can be undone.
   */
  CATMAID.RemoveConnectorCommand = CATMAID.makeCommand(
      function(projectId, connectorId) {
    var exec = function(done, command) {
      // Get connector information
      var create = CATMAID.Connectors.remove(projectId, connectorId);

      return create.then(function(result) {
        result._createdConnector = result.connector_id;
        // TODO: x, y, z, confidence
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._createdConnector) {
        throw new CATMAID.ValueError('Can\'t undo removal of connector, history data not available');
      }

      var remove = CATMAID.Connectors.remove(projectId, command._createdConnector);
      return remove.then(done);
    };

    var title = "Create new connector at (" + x + ", " + y + ", " + z + ")";

    this.init(title, exec, undo);
  });

  CATMAID.LinkConnectorCommand = CATMAID.makeCommand(
      function(projectId, connectorId, nodeId, linkType) {

    var exec = function(done, command) {
      var link = CATMAID.Connectors.createLink(projectId, connectorId,
          nodeId, linkType);
      return link.then(function(result) {
        command._createdLinkId = result.linkId;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._createdLinkId) {
        throw new CATMAID.ValueError('Can\'t undo linking of connector, history data not available');
      }

      var unlink = CATMAID.Connectors.removeLink(projectId, connectorId, nodeId);
      return unlink.then(done);
    };

    var title = "Link connector " + connectorId + " with node " +
        nodeId + " through relation \"" + linkType + "\"";
    this.init(title, exec, undo);
  });

  CATMAID.UnlinkConnectorCommand = CATMAID.makeCommand(
      function(projectId, connectorId, nodeId) {

    var exec = function(done, command) {
      var link = CATMAID.Connectors.removeLink(projectId, connectorId, nodeId);
      return link.then(function(result) {
        command._removedLink = result.linkId;
        command._removedLinkType = resilt.linkType;
        command._removedLinkTypeId = resilt.linkTypeId;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._createdLinkId) {
        throw new CATMAID.ValueError('Can\'t undo removing a connector link, history data not available');
      }

      var link = CATMAID.Connectors.createLink(projectId,
          command.connectorId, nodeId, command._removedLinkType);
      return result.then(done);
    };

    var title = "Remove link between connector " + connectorId + " and node ";
    this.init(title, exec, undo);
  });

})(CATMAID);
