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
      var url = projectId + '/connector/delete';
      var params = {
        connector_id: connectorId
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
    createLink: function(projectId, connectorId, nodeId, linkType) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create links');
      var url = projectId + '/link/create';
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
      var url = projectId + '/link/delete';
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
    var exec = function(done, command, map) {
      var create = CATMAID.Connectors.create(projectId, x, y, z, confidence);

      return create.then(function(result) {
        map.add(map.CONNECTOR, result.newConnectorId, command);
        command.store('connectorId', result.newConnectorId);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      // Fail if expected undo parameters are not available from command
      var createdConnectorId = command.get('connectorId');
      command.validateForUndo(createdConnectorId);

      var remove = CATMAID.Connectors.remove(projectId, createdConnectorId);
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
      function(projectId, connectorId, nodeId, linkType) {

    var exec = function(done, command, map) {
      var link = CATMAID.Connectors.createLink(projectId,
          map.get(map.CONNECTOR, connectorId),
          map.get(map.NODE, nodeId), linkType);
      return link.then(function(result) {
        map.add(map.LINK, result.linkId, command);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var mConnectorId = map.get(map.CONNECTOR, connectorId);
      var mNodeId = map.get(map.NODE, nodeId);
      command.validateForUndo(mConnectorId, mNodeId);

      var unlink = CATMAID.Connectors.removeLink(projectId, mConnectorId, mNodeId);
      return unlink.then(done);
    };

    var title = "Link connector " + connectorId + " with node " +
        nodeId + " through relation \"" + linkType + "\"";
    this.init(title, exec, undo);
  });

  CATMAID.UnlinkConnectorCommand = CATMAID.makeCommand(
      function(projectId, connectorId, nodeId) {

    var exec = function(done, command, map) {
      var link = CATMAID.Connectors.removeLink(projectId,
          map.get(map.CONNECTOR, connectorId),
          map.get(map.NODE, nodeId));
      return link.then(function(result) {
        map.add(map.LINK, result.linkId, command);
        command.store('linkType', result.linkType);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      // Fail if expected undo parameters are not available from command
      var mConnectorId = map.get(map.CONNECTOR, connectorId);
      var mNodeId = map.get(map.NODE, nodeId);
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
