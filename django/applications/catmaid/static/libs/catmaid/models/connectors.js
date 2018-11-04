/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";


  /**
   * Information on a single connector node.
   */
  var ConnectorModel = function(id, x, y, z, links, confidence, creatorId,
      editionTime, subtype) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.z = z;
    this.links = links;
    this.subtype = subtype;
    this.confidence = confidence;
    this.creatorId = creatorId;
    this.editionTime = editionTime;
    this.subtype = subtype;
  };

  CATMAID.ConnectorModel = ConnectorModel;


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
     * @param {integer[][]} links  (Optional) A list of two-elment list, each
     *                             representing treenode ID and a relation ID
     *                             based on which new links will be created
     * @param {string} subtype     (Optional) A subtype specification
     *
     * @returns a promise that is resolved once the connector is created
     */
    create: function(state, projectId, x, y, z, confidence, links, subtype) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to create connectors');
      var url = projectId + '/connector/create';
      var execState;
      // A state is only required if links should be created
      if (links) {
        var partnerIds = links.map(function(l) { return l[0]; });
        execState = state.makeMultiNodeState(partnerIds);
      }
      var params = {
          pid: projectId,
          confidence: confidence,
          x: x,
          y: y,
          z: z,
          links: links,
          state: execState
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          var newConnector = new CATMAID.ConnectorModel(result.connector_id,
              x, y, z, links, confidence, CATMAID.session.userid,
              result.connector_edition_time, subtype);
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
              newConnector);
          return {
            newConnectorId: result.connector_id,
            newConnectorEditTime: result.connector_edition_time,
            createdLinks: result.created_links
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
      var url = projectId + '/connectors/' + connectorId + '/';

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
          if (result.warning) {
            CATMAID.warn(result.warning);
          }
          CATMAID.Connectors.trigger(CATMAID.Connectors.EVENT_LINK_CREATED,
              result.link_id, linkType, nodeId);
          return {
            linkId: result.link_id,
            linkEditTime: result.link_edition_time,
            relationId: result.relation_id
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
    },

    /**
     * Get a list of connector properties, optionally filtered by pre- or
     * post-skeleton IDs.
     *
     * @param {integer} projectId       The project space to use
     * @param {integer} connectorIds    (Optional) The IDs of connectors to list
     * @param {integer} skeletonIds     (Optional) The IDs of skeletons the
     *                                  result connectors have to connect to.
     * @param {integer} preSkeletonIds  (Optional) The IDs of presynaptic
     *                                  skeletons linked to result connectors.
     * @param {integer} postSkeletonIds (Optional) The IDs of postsynaptic
     *                                  skeletons linked to result connectors.
     */
    list: function(projectId, connectorIds, skeletonIds, preSkeletonIds, postSkeletonIds) {
      CATMAID.requirePermission(projectId, 'can_browse',
          'You don\'t have have permission to list connectors');
      var url = projectId + '/connector/info';
      var params = {
        cids: connectorIds,
        skids: skeletonIds,
        pre: preSkeletonIds,
        post: postSkeletonIds
      };

      return CATMAID.fetch(url, 'POST', params)
        .then(function(result) {
          return {
            connectors: result
          };
        });
    },

    /**
     * Get a list of available connector types. These are retrieved only the
     * first time this function is called. Later calls will use a cached result,
     * because this information is not expected to change often. If this is not
     * wanted, a cache update can be forced.
     */
    linkTypes: function(projectId, forceCacheUpdate) {
      if (forceCacheUpdate || !connectorTypeCache) {
        var url = projectId + '/connectors/types/';
        return CATMAID.fetch(url)
          .then(function(result) {
            // Make sure we know all returned types
            for (var i=0; i<result.length; ++i) {
              var t = result[i];
              t['type_id'] = Connectors.relationToSubtype(t['relation']);
            }

            // Update cache and return a copy
            connectorTypeCache = result;
            return JSON.parse(JSON.stringify(connectorTypeCache));
          });
      } else {
        // Return copy of cached result
        return Promise.resolve(JSON.parse(JSON.stringify(connectorTypeCache)));
      }
    },

    /**
     * Promise inforamtion on a particular link ID. Use cache if no update is
     * enforced.
     */
    linkType: function(projectId, linkId, forceCacheUpdate) {
      return CATMAID.Connectors.linkTypes(projectId, forceCacheUpdate)
        .then(function(result) {
          for (var i=0; i<result.length; ++i) {
            var linkType = result[i];
            if (linkType.relation_id === linkId) {
              return linkType;
            }
          }
          throw new CATMAID.ValueError("Could not find link type with ID " + linkId);
        });
    },

    /**
     * Get a list of available connector types.
     */
    connectorTypes: function(projectId, forceCacheUpdate) {
      return Connectors.linkTypes(projectId, forceCacheUpdate)
        .then(function(linkTypes) {
          var types = {};
          for (var i=0; i<linkTypes.length; ++i) {
            var t = linkTypes[i];
            var type = types[t['type_id']];
            if (!type) {
              type = {
                'type': t['type_id'],
                'name': t['type'],
                'relations': []
              };
              types[t['type_id']] = type;
            }
            type.relations.push(t.relation);
          }

          return Object.keys(types).map(function(t) {
            return types[t];
          });
        });
    },

    /**
     * Get connectors that intersedct with the defined bounding box.
     *
     * @param {number}  projectId      Project space to operte in.
     * @param {numner}  minX           Minimum X coordinate of bounding box.
     * @param {numner}  minY           Minimum Y coordinate of bounding box.
     * @param {numner}  minZ           Minimum Z coordinate of bounding box.
     * @param {numner}  maxX           Maximum X coordinate of bounding box.
     * @param {numner}  maxY           Maximum Y coordinate of bounding box.
     * @param {numner}  maxZ           Maximum Z coordinate of bounding box.
     * @param {numner}  limit          (optional) Maximum number of connectors
     *                                 to return or 0 to disable. Default is 0.
     * @param {boolean} with_locations (optional) Whether to also return the
     *                                 location of each connector. Default is
     *                                 false.
     * @param {boolean} with_links     (optional) Whether all matched partner
     *                                 link information should be returned.
     *                                 Default is false.
     * @param {number[]} skeletonIds   (optional) A list of skeleton IDs to
     *                                 which returned connectors need to be
     *                                 connected.
     *
     * @returns {Promise} Resolves with a list of intersecting skeleton Ids (or
     *                    more info if requested)..
     */
    inBoundingBox: function(projectId, minX, minY, minZ, maxX, maxY, maxZ,
        limit, with_locations, with_links, skeletonIds) {
      let method = skeletonIds ? 'POST' : 'GET';
      return CATMAID.fetch(project.id + '/connectors/in-bounding-box', method, {
        'minx': minX,
        'miny': minY,
        'minz': minZ,
        'maxx': maxX,
        'maxy': maxY,
        'maxz': maxZ,
        'limit': limit,
        'with_locations': with_locations,
        'with_links': with_links,
        'skeleton_ids': skeletonIds,
      });
    },
  };

  // Keeps a copy of the available connector types
  var connectorTypeCache = null;

  CATMAID.asEventSource(Connectors);
  Connectors.EVENT_CONNECTOR_CREATED = "connector_created";
  Connectors.EVENT_CONNECTOR_REMOVED = "connector_removed";
  Connectors.EVENT_LINK_CREATED = "link_created";
  Connectors.EVENT_LINK_REMOVED = "link_removed";

  // Connector nodes can have different subtypes
  Connectors.SUBTYPE_SYNAPTIC_CONNECTOR = "synaptic-connector";
  Connectors.SUBTYPE_ABUTTING_CONNECTOR = "abutting-connector";
  Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR = "gapjunction-connector";
  Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR = "tightjunction-connector";
  Connectors.SUBTYPE_DESMOSOME_CONNECTOR = "desmosome-connector";
  Connectors.SUBTYPE_ATTACHMENT_CONNECTOR = "attachment-connector";

  Connectors.relationToSubtype = function(relationName) {
    if ('presynaptic_to' === relationName || 'postsynaptic_to' === relationName) {
      return Connectors.SUBTYPE_SYNAPTIC_CONNECTOR;
    } else if ('gapjunction_with' === relationName) {
      return Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR;
    } else if ('abutting' === relationName) {
      return Connectors.SUBTYPE_ABUTTING_CONNECTOR;
    } else if ('attached_to' === relationName) {
      return Connectors.SUBTYPE_ATTACHMENT_CONNECTOR;
    } else if ('close_to' === relationName) {
      return Connectors.SUBTYPE_ATTACHMENT_CONNECTOR;
    } else if ('tightjunction_with' === relationName) {
      return Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR;
    } else if ('desmosome_with' === relationName) {
      return Connectors.SUBTYPE_DESMOSOME_CONNECTOR;
    } else {
      throw new CATMAID.ValueError('Unknown connector link relation: ' + relationName);
    }
  };


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
   * @param {integer} subtype    (Optional) A connector subtype
   *
   */
  CATMAID.CreateConnectorCommand = CATMAID.makeCommand(
      function(projectId, x, y, z, confidence, subtype) {

    // First execution will set the original connector node that all mappings
    // will refer to.
    var umConnectorId, umConnectorEditTime;

    var exec = function(done, command, map) {
      // For a regular connector creation, no state is required
      var execState = null;
      var create = CATMAID.Connectors.create(execState, projectId, x, y, z,
          confidence, undefined, subtype);
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
      function(state, projectId, connectorId) {

    // Use passed in state only to extract connector and and link states. A new
    // state will be created for actually executing the command (needed for redo).
    var umConnector = state.getNode(connectorId);
    var umLinks = state.getLinks(connectorId, true);

    var exec = function(done, command, map) {
      // Map nodes to current ID and time
      var mConnector = map.getWithTime(map.CONNECTOR, umConnector[0], umConnector[1], command);
      var mLinks = umLinks.map(function(l) {
        var mLink = map.getWithTime(map.LINK, l[0], l[1], command);
        return [mLink.value, mLink.timestamp];
      });
      var reverseLinkMapping = {};
      for (var i=0; i<mLinks.length; ++i) {
        // They map 1:1, see above
        reverseLinkMapping[mLinks[i][0]] = umLinks[i];
      }

      // Construct effective state
      var execState = new CATMAID.LocalState([mConnector.value, mConnector.timestamp],
          null, null, mLinks);

      // Get connector information
      var remove = CATMAID.Connectors.remove(execState, projectId, mConnector.value);

      return remove.then(function(result) {
        command.store('confidence', result.confidence);
        command.store('x', result.x);
        command.store('y', result.y);
        command.store('z', result.z);
        command.store('partners', result.partners);
        command.store('reverseLinkMapping', reverseLinkMapping);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      var confidence = command.get('confidence');
      var partners = command.get('partners');
      var x = command.get('x'), y = command.get('y'), z = command.get('z');
      var reverseLinkMapping = command.get('reverseLinkMapping');
      command.validateForUndo(confidence, partners, x, y, z, reverseLinkMapping);

      // In case partners where removed during exec(), new initial links have to
      // be creted, which in turn requires a state for each partner.
      var undoState, links;
      if (partners && partners.length > 0) {
        var partnerInfo = partners.reduce(function(o, p) {
          command.validateForUndo(p.id, p.edition_time);
          // Map partners forward
          var mPartner = map.getWithTime(map.NODE, p.id, p.edition_time, command);
          o['links'].push([mPartner.value, p.rel_id, p.confidence]);
          o['state'][mPartner.value] = mPartner.timestamp;
          return o;
        }, {'links': [], 'state': {}});
        links = partnerInfo.links;
        undoState = new CATMAID.SimpleSetState(partnerInfo.state);
      }

      var create = CATMAID.Connectors.create(undoState, projectId, x, y, z, confidence, links);
      return create.then(function(result) {
        // Map new connector and created links
        map.add(map.CONNECTOR, umConnector[0], result.newConnectorId,
            result.newConnectorEditTime);
        var createdLinks = result.createdLinks;
        for (var i=0; i<createdLinks.length; ++i) {
          // A link is a list of the form [<link-id>, <link-edition-time>,
          // <treenode-id>, <relation_id>].
          var link = createdLinks[i];
          var linkId = link[0];
          var treenodeId = link[2];
          var relationId = link[3];

          // Find original partners by looking for matches of mapped target
          // treenode ID and relation ID.
          if (partners) {
            for (var j=0; j<partners.length; ++j) {
              var p = partners[j];
              // Use == to allow also string based comparsion
              if (p.id == treenodeId && p.rel_id == relationId) {
                // p.id might not be the originally mapped value. Make sure to
                // get it, in case it exists.
                var umLinkId = reverseLinkMapping[p.link_id][0];
                map.add(map.LINK, umLinkId, linkId, link[1]);
              }
            }
          } else {
            map.add(map.LINK, link[0], link[0], link[1]);
          }
        }
        done();
      });
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
      function(state, projectId, connectorId, nodeId) {

    var umNode = state.getNode(nodeId);
    var umConnector = state.getNode(connectorId);

    var exec = function(done, command, map) {
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var mConnector = map.getWithTime(map.CONNECTOR, umConnector[0], umConnector[1], command);

      var nodes = {};
      nodes[mNode.value] = mNode.timestamp;
      nodes[mConnector.value] = mConnector.timestamp;
      var execState = new CATMAID.SimpleSetState(nodes);

      var link = CATMAID.Connectors.removeLink(execState, projectId,
          mConnector.value, mNode.value);
      return link.then(function(result) {
        command.store('linkType', result.linkType);
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      // Fail if expected undo parameters are not available from command
      var mNode = map.getWithTime(map.NODE, umNode[0], umNode[1], command);
      var mConnector = map.getWithTime(map.CONNECTOR, umConnector[0], umConnector[1], command);
      var linkType = command.get('linkType');
      command.validateForUndo(mConnector, mNode, linkType);

      var nodes = {};
      nodes[mNode.value] = mNode.timestamp;
      nodes[mConnector.value] = mConnector.timestamp;
      var undoState = new CATMAID.SimpleSetState(nodes);

      var link = CATMAID.Connectors.createLink(
          undoState, projectId, mConnector.value, mNode.value, linkType);
      return link.then(function(result) {
        map.add(map.LINK, umNode[0], result.linkId, result.linkEditTime);
        done();
      });
    };

    var title = "Remove link between connector " + connectorId + " and node ";
    this.init(title, exec, undo);
  });

})(CATMAID);
