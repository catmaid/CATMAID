/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  project,
  user_groups,
  msgpack
*/

/**
 * Contains the current state of skeleton annotations.
 * TODO: Remove global variable
 */
var SkeletonAnnotations = {};

(function(CATMAID) {

  "use strict";

  /**
   * Data of the active Treenode or ConnectorNode. Its position is stored in
   * unscaled stack space coordinates.
   */
  SkeletonAnnotations.atn = {
    id: null,
    type: null,
    subtype: null,
    skeleton_id: null,
    x: null,
    y: null,
    z: null,
    parent_id: null,
    radius: null,
    confidence: null,
    edition_time: null,
    user_id: null,
    stack_viewer_id: null
  };

  SkeletonAnnotations.TYPE_NODE = "treenode";
  SkeletonAnnotations.TYPE_CONNECTORNODE = "connector";

  /**
   * If the active node is deleted, the active node will be changed to the passed
   * in parent (if any). Otherwise, the active node just becomes unselected.
   */
  SkeletonAnnotations.handleDeletedNode = function(nodeId, parentId) {
    // Use == to allow string and integer IDs
    if (nodeId == SkeletonAnnotations.getActiveNodeId() && parentId) {
      SkeletonAnnotations.staticSelectNode(parentId)
        .catch(CATMAID.handleError);
    }
  };

  //Make the skeleton annotation object listen to deleted nodes.
  CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_DELETED,
      SkeletonAnnotations.handleDeletedNode, SkeletonAnnotations);

  SkeletonAnnotations.Settings = new CATMAID.Settings(
      'skeleton-annotations',
      {
        version: 0,
        entries: {
          skip_suppressed_virtual_nodes: {
            default: false
          },
          // Auto-annotation
          auto_annotations: {
            default: []
          },
          personal_tag_set: {
            default: []
          },
          // Don't show merging UI for single node skeletons
          quick_single_node_merge: {
            default: true
          },
          make_last_connector_type_default: {
            default: false
          },
          set_radius_after_node_creation: {
            default: false
          },
          new_neuron_name: {
            default: ''
          },
          fast_merge_mode: {
            default: {universal: 'none'}
          },
          fast_split_mode: {
            default: {universal: 'none'}
          },
          default_connector_type: {
            default: CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR,
          }
        },
        migrations: {}
      });

  /**
   * Raise an error if any essential field is falsy.
   */
  SkeletonAnnotations.atn.validate = (function() {
    var essentialSkeletonFields = ['id', 'skeleton_id', 'x', 'y', 'z'];
    var essentialConnectorFields = ['id', 'x', 'y', 'z'];

    return  function(node) {
      var essentialFields = SkeletonAnnotations.TYPE_NODE === node.type ?
        essentialSkeletonFields : essentialConnectorFields;
      var emptyFields = essentialFields.filter(function(f) {
          return null === node[f] || undefined === node[f];
        });
      if (emptyFields.length > 0) {
        throw new CATMAID.ValueError("Could not set node " + node.id + " active. " +
            "The following input fields are missing: " + emptyFields.join(', '));
      }
    };
  })();

  SkeletonAnnotations.MODES = Object.freeze({SKELETON: 0, SYNAPSE: 1, SELECT: 2, MOVE: 3});
  SkeletonAnnotations.currentmode = SkeletonAnnotations.MODES.SKELETON;

  /**
   * Sets the active node, if node is not null. Otherwise, the active node is
   * cleared. Since the node passed is expected to come in scaled (!) stack space
   * coordinates, its position has to be unscaled.
   */
  SkeletonAnnotations.atn.set = function(node, stack_viewer_id) {
    var changed = false;
    var skeleton_changed = false;

    if (node) {
      // Find out if there was a change
      var stack_viewer = project.getStackViewer(stack_viewer_id);
      skeleton_changed = (this.skeleton_id !== node.skeleton_id);
      changed = (this.id !== node.id) ||
                (skeleton_changed) ||
                (this.type !== node.type) ||
                (this.subtype !== node.subtype) ||
                (this.z !== node.z) ||
                (this.y !== node.y)  ||
                (this.x !== node.x) ||
                (this.parent_id !== node.parent_id) ||
                (this.stack_viewer_id !== stack_viewer_id) ||
                (this.radius !== node.radius) ||
                (this.confidence !== node.confidence) ||
                (this.edition_time !== node.edition_time) ||
                (this.user_id !== node.user_id);

      SkeletonAnnotations.atn.validate(node);

      // Assign new properties
      this.id = node.id;
      this.skeleton_id = node.skeleton_id;
      this.type = node.type;
      this.subtype = node.subtype;
      this.x = node.x;
      this.y = node.y;
      this.z = node.z;
      this.parent_id = node.parent ? node.parent.id : null;
      this.radius = node.radius;
      this.confidence = node.confidence;
      this.edition_time = node.edition_time;
      this.user_id = node.user_id;
      this.stack_viewer_id = stack_viewer_id;
    } else {
      changed = true;
      skeleton_changed = !!this.skeleton_id;
      // Set all to null
      for (var prop in this) {
        if (this.hasOwnProperty(prop)) {
          if (typeof this[prop] === 'function') {
            continue;
          }
          this[prop] = null;
        }
      }
    }

    // Trigger event if node ID or position changed
    if (changed) {
      SkeletonAnnotations.trigger(
            SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED, this, skeleton_changed);
    }
  };

  /**
   * Creates and returns a new node promise for the active node. If the node had
   * to be created, the active node is updated, before the success function is
   * called.
   */
  SkeletonAnnotations.atn.promise = function()
  {
    var overlay = SkeletonAnnotations.getTracingOverlay(this.stack_viewer_id);
    var node = overlay.nodes.get(this.id);
    if (!node) {
      return Promise.reject("Couldn't find node " + this.id + " in tracing layer");
    }
    var nodePromise = overlay.promiseNode(node);
    var isNewSkeleton = !this.skeleton_id;

    return nodePromise.then((function(result) {
      // Set ID of active node, expect ID as result
      if (this.id !== result) {
        this.id = result;
        SkeletonAnnotations.trigger(
            SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED, this, isNewSkeleton);
      }
      return result;
    }).bind(this));
  };

  /**
   * Map a stack viewer to a displayed overlay.
   */
  SkeletonAnnotations.getTracingOverlay = function(stackViewerId) {
    return CATMAID.TracingOverlay.prototype._instances[stackViewerId];
  };

  /**
   * Map a skeleton elements instance to an overlay.
   */
  SkeletonAnnotations.getTracingOverlayBySkeletonElements = function(skeletonElements) {
    var instances = CATMAID.TracingOverlay.prototype._instances;
    for (var stackViewerId in instances) {
      if (instances.hasOwnProperty(stackViewerId)) {
        var s = instances[stackViewerId];
        if (skeletonElements === s.graphics) {
          return s;
        }
      }
    }
    return null;
  };

  /**
   * Select a node in any of the existing TracingOverlay instances, by its ID. By
   * default, if a node is not found in a viewer, the node will be loaded and a
   * resolved promise will return. If, however, <strict> is truthy, this will
   * return a rejected promise if the node could not be selected in all stack
   * viewers. This behavior can be changed using the <singleMatchValid> parameter
   * to require only a single viewer to have the node to return a resolved
   * promise. All stack viewers are asked to select the node.
   */
  SkeletonAnnotations.staticSelectNode = function(nodeId, singleMatchValid, strict) {
    var nFound = 0;
    var incFound = function() { ++nFound; };
    var selections = [];
    var instances = CATMAID.TracingOverlay.prototype._instances;
    for (var stackViewerId in instances) {
      if (instances.hasOwnProperty(stackViewerId)) {
        var select = instances[stackViewerId].selectNode(nodeId, strict);
        selections.push(select.then(incFound));
      }
    }

    // Wait until we tried to select the node in all viewers.
    return Promise.all(selections)
      .catch(function(error) {
        if (nFound === 0) {
          CATMAID.statusBar.replaceLast("Could not find node #" + nodeId);
          throw error;
        }
        if (nFound !== instances.length && !singleMatchValid) {
          throw error;
        }
      });
  };

  /**
   * Move to a location, ensuring that any edits to node coordinates are pushed
   * to the database. After the move, the fn is invoked.
   *
   * @return {Promise}               Promise succeeding after move.
   */
  SkeletonAnnotations.staticMoveTo = function(z, y, x) {
    if (!CATMAID.tools.isNumber(z)) return Promise.reject(new CATMAID.ValueError('Z needs to be a number'));
    if (!CATMAID.tools.isNumber(y)) return Promise.reject(new CATMAID.ValueError('Y needs to be a number'));
    if (!CATMAID.tools.isNumber(z)) return Promise.reject(new CATMAID.ValueError('X needs to be a number'));
    var instances = CATMAID.TracingOverlay.prototype._instances;
    var movePromises = [];
    for (var stackViewerId in instances) {
      if (instances.hasOwnProperty(stackViewerId)) {
        movePromises.push(instances[stackViewerId].moveTo(z, y, x));
      }
    }

    return Promise.all(movePromises);
  };

  /**
   * Move to a location, ensuring that any edits to node coordinates are pushed to
   * the database. After the move, the given node is selected in all stackviewers
   * navigating with the project.
   *
   * @param  {number|string} nodeID  ID of the node to move to and select.
   * @return {Promise}               Promise succeeding after move and selection,
   *                                 yielding an array of the selected node from
   *                                 all open tracing overlays.
   */
  SkeletonAnnotations.staticMoveToAndSelectNode = function(nodeId) {
    var instances = CATMAID.TracingOverlay.prototype._instances;
    var preparePromises = [];
    // Save all changes in each layer
    for (var stackViewerId in instances) {
      if (instances.hasOwnProperty(stackViewerId)) {
        let overlay = instances[stackViewerId];
        // Save changed nodes
        preparePromises.push(overlay.updateNodeCoordinatesInDB);
      }
    }

    // Get node location, try to find it in existing stacks first
    return Promise.all(preparePromises)
      .then(function() {
        var nodeLocation = null;
        // Get node location if not yet found
        for (var stackViewerId in instances) {
          if (instances.hasOwnProperty(stackViewerId)) {
            let overlay = instances[stackViewerId];

            if (nodeLocation) {
              // Only try to get node from overlay, if no location has been found
              // yet.
              nodeLocation = nodeLocation.then(function(loc) {
                return loc ? loc : overlay.getNodeLocation(nodeId);
              }).catch(function() {
                return overlay.getNodeLocation(nodeId);
              });
            } else {
              nodeLocation = overlay.getNodeLocation(nodeId);
            }

            // Save changed nodes
            preparePromises.push(overlay.updateNodeCoordinatesInDB);
          }
        }
        return nodeLocation;
      })
      .then(function(loc) {
        // Move project to new location
        return project.moveTo(loc.z, loc.y, loc.x);
      })
      .then(function() {
        let selectionPromises = [];
        // Select nodes
        for (var stackViewerId in instances) {
          if (instances.hasOwnProperty(stackViewerId)) {
            let overlay = instances[stackViewerId];
            selectionPromises.push(overlay.selectNode(nodeId));
          }
        }
        return Promise.all(selectionPromises);
      });
  };

  /**
   * Move to a location and select the node cloest to the given location,
   * optionally also require a particular skeleton ID.
   *
   * @return {Promise}               Promise succeeding after move and selection,
   *                                 yielding the selected node from the tracing
   *                                 overlay where it was closest.
   */
  SkeletonAnnotations.staticMoveToAndSelectClosestNode = function(z, y, x,
      skeletonId, respectVirtualNodes) {
    if (!CATMAID.tools.isNumber(z)) return Promise.reject(new CATMAID.ValueError('Z needs to be a number'));
    if (!CATMAID.tools.isNumber(y)) return Promise.reject(new CATMAID.ValueError('Y needs to be a number'));
    if (!CATMAID.tools.isNumber(z)) return Promise.reject(new CATMAID.ValueError('X needs to be a number'));
    var instances = CATMAID.TracingOverlay.prototype._instances;
    var locations = [];
    for (var stackViewerId in instances) {
      if (instances.hasOwnProperty(stackViewerId)) {
        var overlay = instances[stackViewerId];
        var location = overlay.findNearestSkeletonPoint(x, y, z,
            skeletonId, undefined, respectVirtualNodes);
        if (location.node) {
          locations.push(location);
        }
      }
    }

    // Find location with lowest distance to the given location
    var closestLocation = locations.reduce(function(closest, loc) {
      if (null === closest || (loc.distsq < closest.distsq)) {
        closest = loc;
      }
      return closest;
    }, null);

    if (closestLocation) {
        return overlay.moveToAndSelectNode(location.node.id);
    }
  };

  /**
   * Get the ID of the active node or null if there is no active node.
   */
  SkeletonAnnotations.getActiveNodeId = function() {
    return this.atn.id;
  };

  /**
   * Get the ID of the active skeleton or null if there is no active skeleton.
   */
  SkeletonAnnotations.getActiveSkeletonId = function() {
    return this.atn.skeleton_id;
  };

  /**
   * Get the type of the active node or null if there is no active node.
   */
  SkeletonAnnotations.getActiveNodeType = function() {
    return this.atn.type;
  };

  SkeletonAnnotations.getActiveNodeSubType = function() {
    return this.atn.subtype;
  };

  /**
   * Returns the positon of the active node in world coordinates. If there is no
   * active node, null is returned.
   */
  SkeletonAnnotations.getActiveNodePositionW = function() {
    if (null === this.atn.id) {
      return null;
    } else {
      return {x: this.atn.x, y: this.atn.y, z: this.atn.z};
    }
  };

  /**
   * Get a THREE.Vector3 representation of the active treenode's location in
   * project coordinates.
   */
  SkeletonAnnotations.getActiveNodeProjectVector3 = function() {
    if (null === this.atn.id) {
      return new THREE.Vector3();
    } else {
      var position = this.getActiveNodePositionW();
      return new THREE.Vector3(position.x, position.y, position.z);
    }
  };

  /**
   * Get the radius, if any, of the active node. This will typically only make
   * sense with treenodes.
   */
  SkeletonAnnotations.getActiveNodeRadius = function() {
    return this.atn.radius;
  };

  /**
   * Get the ID of the stack viewer the active node was selected from or null if
   * there is no active node.
   */
  SkeletonAnnotations.getActiveStackViewerId = function() {
    return this.atn.stack_viewer_id;
  };

  /**
   * Set tracing mode to node or synapse mode. This determines what is created if
   * the user clicks on the canvas.
   */
  SkeletonAnnotations.setTracingMode = function (mode, toggle) {
    let oldMode = this.currentmode;

    if (toggle && this.currentmode === mode) {
      this.currentmode = this.MODES.SELECT;
    } else {
      switch (mode) {
        case this.MODES.MOVE:
          this.currentmode = mode;
          break;
        case this.MODES.SKELETON:
          this.currentmode = mode;
          break;
        case this.MODES.SYNAPSE:
          this.currentmode = mode;
          break;
      }
    }

    if (oldMode !== this.currentmode) {
      SkeletonAnnotations.trigger(
          SkeletonAnnotations.EVENT_INTERACTION_MODE_CHANGED, this.currentmode, oldMode);
    }
  };

  /**
   * Get a valid virtual node ID for a node between child, parent at a specific
   * location in project space. If the child is a virtual node, its real child
   * will be used. If the parent is a vitual node, its real parent will be used.
   */
  SkeletonAnnotations.getVirtualNodeID = function(childID, parentID, x, y, z) {
    if (!SkeletonAnnotations.isRealNode(childID)) {
      childID = SkeletonAnnotations.getChildOfVirtualNode(childID);
    }
    if (!SkeletonAnnotations.isRealNode(parentID)) {
      parentID = SkeletonAnnotations.getParentOfVirtualNode(parentID);
    }
    return SkeletonAnnotations._getVirtualNodeID(childID, parentID, x, y, z);
  };

  /**
   * Get a virtual node ID, expecting childId and parentId to be real nodes. No
   * further checks are attempted.
   */
  SkeletonAnnotations._getVirtualNodeID = function(childId, parentId, x, y, z) {
    return 'vn:' + childId + ':' + parentId + ':' + x.toFixed(3) + ':' +
      y.toFixed(3) + ':' + z.toFixed(3);
  };

  /**
   * Return if the given node ID is the ID of a real treenode.
   */
  SkeletonAnnotations.isRealNode = function(node_id)
  {
    // For now it is enough to test if the given ID *could* be one of a real node,
    // i.e. if it is a number.
    return !isNaN(parseInt(node_id));
  };

  SkeletonAnnotations.vnComponentRegEx = /vn:(\d+):(\d+):(-?\d+\.?\d*):(-?\d+\.?\d*):(-?\d+\.?\d*)/;

  /**
   * Return RegEx match object for a node ID tested against the virtual node
   * naming scheme.
   */
  SkeletonAnnotations.getVirtualNodeComponents = function(nodeID)
  {
    // Add an empty string to also be able to work with numbers.
    return (nodeID + '').match(SkeletonAnnotations.vnComponentRegEx);
  };

  /**
   * Return a specific component of a virtual node.
   */
  SkeletonAnnotations.getVirtualNodeComponent = function(index, nodeID, matches)
  {
    matches = matches || SkeletonAnnotations.getVirtualNodeComponents(nodeID);
    if (!matches || matches.length !== 6 || index < 1 || index > 5) {
      return null;
    }
    return matches[index];
  };

  /**
   * Return the child component of a virtual node ID. If the node passed in, is
   * real, null is returned.
   */
  SkeletonAnnotations.getChildOfVirtualNode = function(nodeId, matches) {
    var childId = SkeletonAnnotations.getVirtualNodeComponent(1, nodeId, matches);
    return childId === null ? null : parseInt(childId, 10);
  };

  /**
   * Return the child component of a virtual node ID. If the node passed in, is
   * real, null is returned.
   */
  SkeletonAnnotations.getParentOfVirtualNode = function(nodeId, matches) {
    var parentId = SkeletonAnnotations.getVirtualNodeComponent(2, nodeId, matches);
    return parentId === null ? null : parseInt(parentId, 10);
  };

  /**
   * Return the X component of a virtual node ID. If the node passed in, is
   * real, null is returned.
   */
  SkeletonAnnotations.getXOfVirtualNode = SkeletonAnnotations.getVirtualNodeComponent.bind(window, 3);

  /**
   * Return the Y component of a virtual node ID. If the node passed in, is
   * real, null is returned.
   */
  SkeletonAnnotations.getYOfVirtualNode = SkeletonAnnotations.getVirtualNodeComponent.bind(window, 4);

  /**
   * Return the Z component of a virtual node ID. If the node passed in, is
   * real, null is returned.
   */
  SkeletonAnnotations.getZOfVirtualNode = SkeletonAnnotations.getVirtualNodeComponent.bind(window, 5);

  // TODO: This IIFE should be moved into the IIFE for all of SkeletonAnnotations,
  // as soon as it is created.
  (function() {

    // The volume new nodes should be tested against
    var newNodeWarningVolumeID = null;

    /**
     * The actual handler checking for volume intersections between a node and a
     * volume. If it exists, a warning is shown.
     */
    var newNodeVolumeWarningHandler = function(node) {
      if (!newNodeWarningVolumeID) {
        return;
      }

      // Test for intersection with the volume
      CATMAID.Volumes.intersectsBoundingBox(project.id, newNodeWarningVolumeID,
          node.x, node.y, node.z)
        .then(function(json) {
          if (!json.intersects) {
            CATMAID.warn("Node #" + node.id +
                " was created outside of volume " + newNodeWarningVolumeID);
          }
        })
        .catch(CATMAID.handleError);
    };


    /**
     * Set ID of volume for new node warnings. If volumeID is falsy, the warning
     * is disabled.
     */
    SkeletonAnnotations.setNewNodeVolumeWarning = function(volumeID) {
      // Disable existing event oversavation, if any.
      CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_CREATED,
          newNodeVolumeWarningHandler);
      CATMAID.Connectors.off(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
          newNodeVolumeWarningHandler);

      if (volumeID) {
        // Add new listener
        newNodeWarningVolumeID = volumeID;
        CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_CREATED,
            newNodeVolumeWarningHandler);
        CATMAID.Connectors.on(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
            newNodeVolumeWarningHandler);
      } else {
        newNodeWarningVolumeID = null;
      }
    };

    /**
     * Get ID of volume currently set up fo new node warnings.
     */
    SkeletonAnnotations.getNewNodeVolumeWarning = function() {
      return newNodeWarningVolumeID;
    };


    // The cable length threshold for an active length warning.
    var skeletonCableLengthLimit = null;

    /*
     * A 'new node created' event handler that checks the length of a skeleton and
     * shows a warning if a threshold is reached.
     */
    var skeletonLengthWarningHandler = function(skeletonId) {
      CATMAID.fetch(project.id + '/skeletons/' + skeletonId + '/cable-length')
        .then(function(result) {
          if (result.cable_length > skeletonCableLengthLimit) {
            CATMAID.warn("With " + result.cable_length +
              "nm, the new cable length of skelton " + result.skeleton_id +
              ' is larger than the limit of ' + skeletonCableLengthLimit + 'nm.');
          }
        })
        .catch(CATMAID.handleError);
    };

    /**
     * Set length threshold for a new skeleton length warnings. If length is
     * falsy, the warning is disabled.
     */
    SkeletonAnnotations.setNewSkeletonLengthWarning = function(lengthLimit) {
      // Disable existing event oversavation, if any.
      CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
          skeletonLengthWarningHandler);

      if (lengthLimit) {
        // Add new listener
        skeletonCableLengthLimit = lengthLimit;
        CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
            skeletonLengthWarningHandler);
      } else {
        skeletonCableLengthLimit = null;
      }
    };

    SkeletonAnnotations.getSkeletonLengthWarning = function() {
      return skeletonCableLengthLimit;
    };

  })();


  // Events for skeleton annotations
  CATMAID.asEventSource(SkeletonAnnotations);
  SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED = "tracing_active_node_changed";
  SkeletonAnnotations.EVENT_INTERACTION_MODE_CHANGED = "interaction_mode_changed";


  /**
   * Maintain a skeleton source for the active skeleton. Widgets can register to
   * it. This needs to be done after events are established.
   */
  SkeletonAnnotations.activeSkeleton = new CATMAID.ActiveSkeleton();

  /**
   * Convert a tracing layer node to a minimal list representation, useful for
   * state generation.
   */
  var nodeToStateList = function(n) {
    return [n.id, n.edition_time_iso_str];
  };

  /**
   * The constructor for TracingOverlay.
   */
  CATMAID.TracingOverlay = function(stackViewer, pixiLayer, options) {
    var options = options || {};

    // The stack viewer is needed in the initial name generation of the Tile Layer
    // as skeleton source.
    this.stackViewer = stackViewer;

    CATMAID.SkeletonSource.call(this, true, true);

    this.pixiLayer = pixiLayer;

    // Register instance
    this.register(stackViewer);

    this.submit = CATMAID.submitterFn();

    /** The ID vs Node or ConnectorNode instance. */
    this.nodes = new Map();
    /** A set of node IDs of nodes that need to be synced to the backend. */
    this.nodeIDsNeedingSync = new Set();
    /** The DOM elements representing node labels. */
    this.labels = new Map();
    /** Toggle for text labels on nodes and connectors. */
    this.show_labels = options.show_labels || false;
    /** Indicate if this overlay is suspended and won't update nodes on redraw. */
    this.suspended = options.suspended || false;
    /** Current connector selection menu, if any */
    this.connectorTypeMenu = null;
    /** Transfer data as msgpack by default.
     * Options: 'json', 'msgpack', 'gif', 'png' */
    this.transferFormat = CATMAID.TracingOverlay.Settings.session.transfer_mode;
    /** Limit the requested skeletons to the N largest in terms of cable length */
    this.nLargestSkeletonsLimit = CATMAID.TracingOverlay.Settings.session.n_largest_skeletons_limit;
    /** Limit the requested skeletons to the N most recently edited ones. */
    this.nLastEditedSkeletonLimit = CATMAID.TracingOverlay.Settings.session.n_last_edited_skeletons_limit;
    /** Optionally, hide all skeletons edited last by a particular user. */
    this.hiddenLastEditorId = CATMAID.TracingOverlay.Settings.session.hidden_last_editor_id;
    /** Optionally, show only skeletons of a minimum length. */
    this.minSkeletonLength = CATMAID.TracingOverlay.Settings.session.min_skeleton_length;
    /** Optionally, show only skeletons of a minimum number of nodes. */
    this.minSkeletonNodes = CATMAID.TracingOverlay.Settings.session.min_skeleton_nodes;
    /** Optional node provider override **/
    this.nodeProviderOverride = 'none';
    /** An optional margin in pixels that is subtracted from the left and right of
     * the node query box, effectively not loading data in this region.*/
    this.tracingWindowWidth = CATMAID.TracingOverlay.Settings.session.tracing_window_width;
    /** An optional margin in pixels that is subtracted from the top and bottom of
     * the node query box, effectively not loading data in this region.*/
    this.tracingWindowHeight = CATMAID.TracingOverlay.Settings.session.tracing_window_height;
    /** The DOM element representing the tracing window */
    this._tracingWindowElement = document.createElement('div');
    this._tracingWindowElement.classList.add('tracing-window');
    /** Whether or not to show lines representing the boundary mask */
    this.applyTracingWindow = CATMAID.TracingOverlay.Settings.session.apply_tracing_window;
    /** Wheter updates can be suspended during a planar panning operation */
    this.updateWhilePanning = CATMAID.TracingOverlay.Settings.session.update_while_panning;
    /** The level of detail (highter = more detail, "max" or 0 = everything).
     * This is only supported if a cache based node provider is used. */
    this.levelOfDetail = 'max';
    this.levelOfDetailMode = CATMAID.TracingOverlay.Settings.session.lod_mode;
    /** A cached copy of the a map from IDs to relation names, set on firt load. **/
    this.relationMap = null;
    /** An optional color source **/
    this._colorSource = null;

    // Keep the ID of the node deleted last, which allows to provide some extra
    // context in some situations.
    this._lastDeletedNodeId = null;

    /** Cache of node list request responses, ideally in a memory aware cache. */
    this.nodeListCache = new CATMAID.CacheBuilder.makeMemoryAwareLRUCache(
        CATMAID.TracingOverlay.NODE_LIST_CACHE_CAPACITY,
        CATMAID.TracingOverlay.NODE_LIST_CACHE_LIFETIME,
        CATMAID.TracingOverlay.NODE_LIST_CACHE_MAX_MEM_FILL_RATE,
        true);

    /** An accessor to the internal nodes array to get information about the
     * layer's current state */
    var self = this;
    this.state = new CATMAID.GenericState({
      getNode: function(nodeId) {
        var node = self.nodes.get(nodeId);
        if (!node) {
          throw new CATMAID.ValueError("Couldn't find node with ID " + nodeId +
              " in tracing layer");
        }
        return nodeToStateList(node);
      },
      getParent: function(nodeId) {
        if (!SkeletonAnnotations.isRealNode(nodeId)) {
          nodeId = SkeletonAnnotations.getParentOfVirtualNode(nodeId);
        }
        var node = self.nodes.get(nodeId);
        if (!node || !node.parent) {
          return undefined;
        }
        var parent = node.parent;
        if (!SkeletonAnnotations.isRealNode(parent.id)) {
          var parentId = SkeletonAnnotations.getParentOfVirtualNode(parent.id);
          parent = self.nodes.get(parentId);
        }
        return nodeToStateList(parent);
      },
      getChildren: function(nodeId) {
        var node = self.nodes.get(nodeId);
        if (!node || !node.children) {
          return undefined;
        }
        var children = [];
        for (var cid of node.children.keys()) {
          if (!SkeletonAnnotations.isRealNode(cid)) {
            cid = SkeletonAnnotations.getChildOfVirtualNode(cid);
          }
          var child = node.children.get(cid);
          children.push(nodeToStateList(child));
        }
        return children;
      },
      getLinks: function(nodeId, isConnector) {
        var node = self.nodes.get(nodeId);
        if (!node) {
          return undefined;
        }
        var links = [];
        if (isConnector) {
          var clinks = node.getLinks();
          for (var i=0; i<clinks.length; ++i) {
            var l = clinks[i];
            links.push([l.id, l.edition_time_iso_str]);
          }
        } else if (node.connectors) {
          for (var link of node.connectors.values()) {
            links.push([link.id, link.edition_time_iso_str]);
          }
        }
        return links;
      },
    });

    /* Variables keeping state for toggling between a terminal and its connector. */
    this.switchingConnectorID = null;
    this.switchingTreenodeID = null;

    /* State for finding nodes matching tags. */
    this.nextNearestMatchingTag = {matches: [], query: null, radius: Infinity};

    /* lastX, lastY: in unscaled stack coordinates, for the 'z' key to know where
     * the pointer was. */
    this.coords = {lastX: null, lastY: null};

    /* Padding beyond screen borders in X and Y for fetching data and updating
     * nodes, in screen space pixel coordinates. */
    this.padding = 256;

    /* old_x and old_y record the x and y position of the stack viewer the
       last time that an updateNodes request was made.  When panning
       the stack viewer, these are used to tell whether the user has panned
       far enough to merit issuing another updateNodes. */
    this.old_x = stackViewer.x;
    this.old_y = stackViewer.y;
    this.old_z = stackViewer.z;

    // Remember the width and height of stack viewer at the time of the last
    // update. When resizing, this is used to tell whether a node update is
    // justified.
    this.old_width = stackViewer.viewWidth;
    this.old_height = stackViewer.viewHeight;

    // By default, active node changes triggered by other stack viewers add a copy
    // of the new active node to this tracing layer's state. This is required to
    // start actions in one viewer and finish them in another one (useful in ortho
    // views).
    this.copyActiveNode = true;

    this._skeletonDisplaySource = new CATMAID.BasicSkeletonSource(
        'Tracing overlay (' + this.stackViewer.primaryStack.title + ')', {
          owner: this,
          register: false
        });
    this._skeletonDisplaySource.ignoreLocal = true;
    this._sourceToggleEl = CATMAID.DOM.addSourceControlsToggle(
        stackViewer.getWindow(),
        this._skeletonDisplaySource,
        'Show and hide skeleton source controls for tracing overlay.',
        {showPullOption: false,
         showIgnoreLocal: false});
    ['EVENT_MODELS_ADDED',
     'EVENT_MODELS_REMOVED',
     'EVENT_MODELS_CHANGED'].forEach(function (event) {
      this._skeletonDisplaySource.on(
          this._skeletonDisplaySource[event],
          this.recolorAllNodes.bind(this),
          this);
    }, this);

    this.view = document.createElement("div");
    this.view.className = "sliceTracingOverlay";
    this.view.id = "sliceTracingOverlayId" + stackViewer.getId();
    this.view.style.zIndex = 5;
    // Custom cursor for tracing
    this.updateCursor();

    //CATMAID.ui.registerEvent("onpointerdown", onpointerdown);
    this._boundPointerDown = this._pointerDown.bind(this);
    this._boundPointerMove = this._pointerMove.bind(this);
    this._boundPointerUp = this._pointerUp.bind(this);
    this.view.addEventListener('pointerdown', this._boundPointerDown);
    this.view.addEventListener('pointermove', this._boundPointerMove);
    this.view.addEventListener('pointerup', this._boundPointerUp);
    // We don't want browser contet menus on the tracing layer
    this.view.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });

    this.paper = d3.select(this.view)
                    .append('svg')
                    .attr({
                        width: stackViewer.viewWidth,
                        height: stackViewer.viewHeight,
                        style: 'overflow: hidden; position: relative;'});

    this.graphics = CATMAID.SkeletonElementsFactory.createSkeletonElements(
        this,
        pixiLayer.batchContainer,
        this._skeletonDisplaySource);
    this.graphics.setNodeRadiiVisibility(CATMAID.TracingOverlay.Settings.session.display_node_radii);

    // Initialize tracing window, if any
    if (this.apply_tracing_window) {
      this.updateTracingWindow();
    }

    // Initialize custom node coloring
    if (CATMAID.TracingOverlay.Settings.session.color_by_length) {
      var source = new CATMAID.ColorSource('length', this);
      this.setColorSource(source);
    }

    // Invalidate the node list cache aggressively.
    CATMAID.Neurons.on(CATMAID.Neurons.EVENT_NEURON_DELETED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_CREATED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_DELETED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_UPDATED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_CONFIDENCE_CHANGED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_CONNECTOR_REMOVED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_LINK_CREATED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_LINK_REMOVED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Labels.on(CATMAID.Labels.EVENT_NODE_LABELS_CHANGED,
      this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.State.on(CATMAID.State.EVENT_STATE_NEEDS_UPDATE,
      this.nodeListCache.evictAll, this.nodeListCache);

    // Listen to change and delete events of skeletons
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
      this.handleChangedSkeleton, this);
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
      this.handleDeletedSkeleton, this);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_CREATED,
        this.handleNewNode, this);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_UPDATED,
        this.handleNodeChange, this);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
        this.handleNewConnectorNode, this);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_CONNECTOR_REMOVED,
        this.handleRemovedConnector, this);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_LINK_CREATED,
        this.simpleUpdateNodes, this);
    CATMAID.Connectors.on(CATMAID.Connectors.EVENT_LINK_REMOVED,
        this.simpleUpdateNodes, this);

    // Listen to active node change events and interaction mode changes
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_INTERACTION_MODE_CHANGED,
        this.handleChangedInteractionMode, this);

    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_CONFIDENCE_CHANGED,
      this.handleNodeChange, this);
    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED,
        this.simpleUpdateNodes, this);

    CATMAID.State.on(CATMAID.State.EVENT_STATE_NEEDS_UPDATE,
        this.simpleUpdateNodes, this);
  };

  CATMAID.TracingOverlay.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  CATMAID.TracingOverlay.prototype.constructor = CATMAID.TracingOverlay;

  CATMAID.TracingOverlay.prototype.EVENT_HIT_NODE_DISPLAY_LIMIT = "tracing_hit_node_display_limit";

  CATMAID.asEventSource(CATMAID.TracingOverlay.prototype);

  CATMAID.TracingOverlay.NODE_LIST_CACHE_CAPACITY = 20;
  CATMAID.TracingOverlay.NODE_LIST_CACHE_LIFETIME = 60 * 1000;
  CATMAID.TracingOverlay.NODE_LIST_CACHE_MAX_MEM_FILL_RATE = 0.75;

  CATMAID.TracingOverlay.Settings = new CATMAID.Settings(
        'tracing-overlay',
        {
          version: 1,
          entries: {
            display_node_radii: {
              // Enum of 'none', 'active-node', 'active-skeleton', 'all'
              default: 'active-node'
            },
            screen_scaling: {
              default: true
            },
            scale: {
              default: 1.0
            },
            // Colors that a node can take
            active_node_color: {
              default: 0x00FF00,
            },
            active_virtual_node_color: {
              default: 0x00C000,
            },
            active_suppressed_virtual_node_color: {
              default: 0x008000,
            },
            active_skeleton_color: {
              default: 0xFFFF00,
            },
            active_skeleton_color_virtual: {
              default: 0xFFFF00,
            },
            inactive_skeleton_color: {
              default: 0xFF00FF,
            },
            inactive_skeleton_color_virtual: {
              default: 0xFF00FF,
            },
            inactive_skeleton_color_above: {
              default: 0x0000FF,
            },
            inactive_skeleton_color_below: {
              default: 0xFF0000,
            },
            root_node_color: {
              default: 0xFF0000,
            },
            leaf_node_color: {
              default: 0x800000,
            },
            // Visibility groups
            visibility_groups: {
              default: [{universal: 'none'}, {universal: 'none'}, {universal: 'none'}]
            },
            extended_status_update: {
              default: false
            },
            subviews_from_cache: {
              default: true
            },
            presynaptic_to_rel_color: {
              default: 0xC80000
            },
            postsynaptic_to_rel_color: {
              default: 0x00D9E8
            },
            gapjunction_rel_color: {
              default: 0x9F25C2
            },
            tightjunction_rel_color: {
              default: 0x2585c2
            },
            desmosome_rel_color: {
              default: 0x46b1c4
            },
            attachment_rel_color: {
              default: 0xDD6602
            },
            close_to_rel_color: {
              default: 0xC5DD22
            },
            other_rel_color: {
              default: 0x00C800
            },
            connector_node_marker: {
              // enum of 'disc', 'crosshair', 'target', 'bullseye', 'ring'
              default: 'disc'
            },
            transfer_mode: {
              default: "msgpack"
            },
            allow_lazy_updates: {
              default: true
            },
            n_largest_skeletons_limit: {
              default: 0
            },
            n_last_edited_skeletons_limit: {
              default: 0
            },
            hidden_last_editor_id: {
              default: 'none',
            },
            min_skeleton_length: {
              default: 0,
            },
            min_skeleton_nodes: {
              default: 0,
            },
            tracing_window_width: {
              default: 300
            },
            tracing_window_height: {
              default: 300
            },
            apply_tracing_window: {
              default: false
            },
            read_only_mirrors: {
              default: []
            },
            read_only_mirror_index: {
              default: -1
            },
            update_while_panning: {
              default: false
            },
            color_by_length: {
              default: false
            },
            length_color_steps: {
              default: [{
                color: 0x12c2e9,
                stop: 100000
              }, {
                color: 0xff00ff,
                stop: 1000000
              }, {
                color: 0xff4e50,
                stop: 5000000
              }]
            },
            lod_mode: {
              default: "adaptive",
            },
            adaptive_lod_scale_range: {
              // A list of two elements defining a range in zoom level space which
              // is mapped to the min and max LOD level, if available, by the
              // back-end. Both represent percentages on the zoom level scale in
              // the range [0,1]. A value of 0 means zoom level 0 (i.e. original
              // size) and a value of 1 means the "max" zoom level, whatever it
              // may be for the current stack. A value of 0.3 means a third from
              // the available zoom range. The default value of [0, 1] maps
              // the whole zoom range to the whole LOD range. The mapping is
              // inverted for the look-up, i.e. the lower percentage (first
              // value) is mapped to the maximum LOD (everything visible) and
              // larger percentage (second value) is mapped to the lowest
              // possible LOD (1).
              default: [0, 1.0],
            },
            lod_mapping: {
              // Map zoom levels to LOD percentages, interpolate percentages
              // inbetween.
              default: [[0,1], [1,0]],
            }
          },
          migrations: {
            0: function (settings) {
              ['active_node_color',
               'active_skeleton_color',
               'active_skeleton_color_virtual',
               'inactive_skeleton_color',
               'inactive_skeleton_color_virtual',
               'inactive_skeleton_color_above',
               'inactive_skeleton_color_below',
               'root_node_color',
               'leaf_node_color'].forEach(function (color) {
                if (settings.hasOwnProperty('entries') && settings.entries.hasOwnProperty(color)) {
                  settings.entries[color].value = new THREE.Color(settings.entries[color].value).getHex();
                }
               });

               settings.version = 1;

               return settings;
            }
          }
        });

  /**
   * Update currently used pointer based on the current tracing tool mode.
   */
  CATMAID.TracingOverlay.prototype.updateCursor = function() {
    if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.MOVE) {
      this.view.style.cursor = "move";
    } else {
      this.view.style.cursor ="url(" + STATIC_URL_JS + "images/svg-circle.cur) 15 15, crosshair";
    }
  };

  /**
   * Creates the node with the given ID, if it is only a virtual node. Otherwise,
   * it is resolved immediately. A node object as well as number (representing a
   * node ID) can be passed in. If only a number is passed, it is expected that
   * the node is available at the moment of the call in the nodes cache. An error
   * is thrown if this is not the case.
   */
  CATMAID.TracingOverlay.prototype.promiseNode = function(node)
  {
    var self = this;

    return new Promise(function(resolve, reject) {

      // If the node is a string or a number, try to find it in the nodes cache.
      var type = typeof node;
      if ("string" === type || "number" === type) {
        node = self.nodes.get(node);
      }

      // Raise error, if no node or a node without ID was passed in
      if (!node || !node.id) {
        reject(Error("Please specify a node object or valid node ID"));
        return;
      }

      // If the node can be parsed as a number, it is assumed to be already there.
      if (!isNaN(parseInt(node.id))) {
        resolve(node.id);
        return;
      }

      // If the node ID is a string matching the pattern vn-<number>, it is
      // considered a virtual node with its child ID encoded.
      var matches = SkeletonAnnotations.getVirtualNodeComponents(node.id);
      if (!matches || matches.length !== 6) {
        // Raise an error, if this pattern was not matched
        reject(Error("Could not handle node ID: " + node.id));
        return;
      }

      var childId = SkeletonAnnotations.getChildOfVirtualNode(node.id, matches);
      var command = new CATMAID.InsertNodeCommand(self.state, project.id, node.x, node.y, node.z,
          node.parent_id, childId, node.radius, node.confidence);
      CATMAID.commands.execute(command)
        .then(function(result) {
          var nid = result.treenode_id;
          CATMAID.statusBar.replaceLast("Created new node node #" + nid +
              " as child of node #" + childId);
          // Update nodes
          var vnid = node.id;
          self.nodes.set(nid, self.nodes.get(vnid));
          self.nodes.get(nid).edition_time_iso_str = result.edition_time;
          self.nodes.delete(vnid);
          // Update node reference, passed in (which *should* be the same as
          // self.nodes[nid] referenced and updated above, but we set it just to
          // be on the safe side).
          node.id = nid;
          node.edition_time_iso_str = result.edition_time;
          // Update edition time of any children
          if (result.child_edition_times) {
            for (var i=0; i<result.child_edition_times.length; ++i) {
              var childEditInfo = result.child_edition_times[i];
              var childNode = self.nodes.get(childEditInfo[0]);
              if (childNode) {
                childNode.edition_time_iso_str = childEditInfo[1];
              }
            }
          }
          // If the virtual node was the active node before, update the active
          // node as well.
          if (SkeletonAnnotations.getActiveNodeId() == vnid) {
            self.activateNode(node);
          }
          // Resolve outer promise
          resolve(nid);
        });
    });
  };

  /**
   * Creates all given nodes, if they are virtual nodes. Otherwise, it is resolved
   * immediately.
   */
  CATMAID.TracingOverlay.prototype.promiseNodes = function()
  {
    var self = this;
    var args = arguments;
    return new Promise(function(resolve, reject) {
      // Resolve immediately, if there are no nodes passed as argument
      if (0 === args.length) {
        resolve();
      }

      // Build a promise chain to resolve one node after the other
      var nodeIds = [];
      var promiseChain = self.promiseNode(args[0]);

      // Queue a promise for every
      for (var i=1; i<args.length; ++i) {
          var node = args[i];
          promiseChain = promiseChain.then(
            function(promisedNid) {
              // Store result of this promise
              nodeIds.push(promisedNid);
              // Create a new promise for the next node
              return self.promiseNode(node);
            },
            function() {
                // In case of rejection, reject also the multi-node promise
                reject(Error("Could not fullfil promise of node " + node.id));
            });
      }

      // Resolve only if promises for individual nodes resolve
      promiseChain.then(function(promisedNid) {
        // Store result of this promise
        nodeIds.push(promisedNid);
        // Resolve the multi node promise
        resolve(nodeIds);
      });
    });
  };

  /**
   * Execute function fn_real, if the node identified by node_id is a real node
   * (i.e not a virtual node).
   */
  CATMAID.TracingOverlay.prototype.executeDependentOnExistence =
      function(node_id, fn_real, fn_notreal)
  {
    if (SkeletonAnnotations.isRealNode(node_id) && fn_real) {
      fn_real();
      return true;
    } else if (fn_notreal) {
      fn_notreal();
    }
    return false;
  };

  /**
  * Execute the function fn if the skeleton has more than one node and the dialog
  * is confirmed, or has a single node (no dialog pops up).  The verb is the
  * action to perform, as written as a question in a dialog to confirm the action
  * if the skeleton has a single node.
  */
  CATMAID.TracingOverlay.prototype.executeDependentOnNodeCount =
      function(node_id, fn_one, fn_more)
  {
    this.submit(
        CATMAID.makeURL(project.id + '/skeleton/node/' + node_id + '/node_count'),
        'POST',
        {},
        function(json) {
          if (json.count > 1) {
            fn_more();
          } else {
            fn_one();
          }
        });
  };

  /**
   * Execute the function fn if the current user has permissions to edit it.
   */
  CATMAID.TracingOverlay.prototype.executeIfSkeletonEditable = function(
      skeleton_id, fn) {
    return CATMAID.Skeletons.getPermissions(project.id, skeleton_id)
      .then(function(permissions) {
        // Check permissions
        if (!permissions.can_edit) {
          new CATMAID.ErrorDialog("This skeleton is locked by another user " +
              "and you are not part of the other user's group. You don't " +
              "have permission to modify it.").show();
          return;
        }
        // Execute continuation
        return fn();
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Ask the user for a new neuron name for the given skeleton and let the name
   * service write it to the skeleton.
   */
  CATMAID.TracingOverlay.prototype.renameNeuron = function(skeletonID) {
    if (!skeletonID) return;
    var self = this;
    this.submit(
        CATMAID.makeURL(project.id + '/skeleton/' + skeletonID + '/neuronname'),
        'POST',
        {},
        function(json) {
            var new_name = prompt("Change neuron name", json.neuronname);
            if (!new_name) return;
            CATMAID.commands.execute(new CATMAID.RenameNeuronCommand(
                  project.id, json.neuronid, new_name));
        });
  };

  /**
   * Register of stack viewer ID vs instances.
   */
  CATMAID.TracingOverlay.prototype._instances = {};

  /**
   * Register a new stack with this instance.
   */
  CATMAID.TracingOverlay.prototype.register = function (stackViewer) {
    this._instances[stackViewer.getId()] = this;
  };

  /**
   * Unregister this overlay from all stack viewers.
   */
  CATMAID.TracingOverlay.prototype.unregister = function () {
    for (var stackViewerId in this._instances) {
      if (this._instances.hasOwnProperty(stackViewerId)) {
        if (this === this._instances[stackViewerId]) {
          delete this._instances[stackViewerId];
        }
      }
    }
  };

  /**
   * The original list of nodes; beware the instance of the list will change, the
   * contents of any one instance may change, and the data of the nodes will
   * change as they are recycled.
   */
  CATMAID.TracingOverlay.prototype.getNodes = function() {
    return this.nodes;
  };

  /**
   * The stack viewer this overlay is registered with.
   */
  CATMAID.TracingOverlay.prototype.getStackViewer = function() {
    return this.stackViewer;
  };

  /**
   * Stores the current pointer coordinates in unscaled stack coordinates in the
   * @coords parameter and updates the status bar with the stack and project
   * coordinates of the pointer.
   */
  CATMAID.TracingOverlay.prototype.setLocationFromEvent = function(e) {
    let stackViewer = this.stackViewer;
    let coords = this.coords;
    let m = CATMAID.ui.getMouse(e, this.stackViewer.getView(), true);
    if (m) {
      let screenPosition = stackViewer.screenPosition();
      coords.lastX = screenPosition.left + m.offsetX / stackViewer.scale / stackViewer.primaryStack.anisotropy(0).x;
      coords.lastY = screenPosition.top  + m.offsetY / stackViewer.scale / stackViewer.primaryStack.anisotropy(0).y;
    }
  };

  /**
   * Update the internal location.
   */
  CATMAID.TracingOverlay.prototype._pointerDown = function(e) {
    this.setLocationFromEvent(e);
    return true; // Bubble pointerdown events.
  };

  /**
   */
  CATMAID.TracingOverlay.prototype._pointerMove = function(e) {
    this.setLocationFromEvent(e);
    return true; // Bubble pointermove events.
  };

  /**
   * Update the internal location.
   */
  CATMAID.TracingOverlay.prototype._pointerUp = function(e) {
    this.setLocationFromEvent(e);
    return true; // Bubble pointerup events.
  };

  /**
   * This returns true if focus had to be switched; typically if the focus had to
   * be switched, you should return from any event handling, otherwise all kinds
   * of surprising bugs happen...
   */
  CATMAID.TracingOverlay.prototype.ensureFocused = function() {
    var win = this.stackViewer.getWindow();
    if (win.hasFocus()) {
      return false;
    } else {
      win.focus();
      return true;
    }
  };

  /**
   * Unregister this layer and destroy all UI elements and event handlers.
   */
  CATMAID.TracingOverlay.prototype.destroy = function() {
    this.updateNodeCoordinatesInDB();
    this.suspended = true;
    this.unregister();
    this.unregisterSource();
    // Show warning in case of pending request

    this.submit = null;
    // Release
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
    if (this.view) {
      this.view.removeEventListener('pointerdown', this._boundPointerDown);
      this.view.removeEventListener('pointermove', this._boundPointerMove);
      this.view.removeEventListener('pointerup', this._boundPointerUp);
      this.view = null;
    }
    if (this._sourceToggleEl && this._sourceToggleEl.parentNode) {
      this._sourceToggleEl.parentNode.removeChild(this._sourceToggleEl);
    }

    // Unregister from models
    CATMAID.Neurons.off(CATMAID.Neurons.EVENT_NEURON_DELETED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_CREATED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_DELETED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_UPDATED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_CONFIDENCE_CHANGED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_CONNECTOR_REMOVED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_LINK_CREATED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_LINK_REMOVED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.Labels.off(CATMAID.Labels.EVENT_NODE_LABELS_CHANGED,
        this.nodeListCache.evictAll, this.nodeListCache);
    CATMAID.State.off(CATMAID.State.EVENT_STATE_NEEDS_UPDATE,
        this.nodeListCache.evictAll, this.nodeListCache);

    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
        this.handleChangedSkeleton, this);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
        this.handleDeletedSkeleton, this);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_CREATED,
        this.handleNewNode, this);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_UPDATED,
        this.handleNodeChange, this);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_CONNECTOR_CREATED,
        this.handleNewConnectorNode, this);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_CONNECTOR_REMOVED,
        this.handleRemovedConnector, this);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_LINK_CREATED,
        this.simpleUpdateNodes, this);
    CATMAID.Connectors.off(CATMAID.Connectors.EVENT_LINK_REMOVED,
        this.simpleUpdateNodes, this);

    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_INTERACTION_MODE_CHANGED,
        this.handleChangedInteractionMode, this);

    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_CONFIDENCE_CHANGED,
        this.handleNodeChange, this);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED,
        this.simpleUpdateNodes, this);

    CATMAID.State.on(CATMAID.State.EVENT_STATE_NEEDS_UPDATE,
        this.simpleUpdateNodes, this);
  };

  /**
   * Tries to activates the given node id if it exists in the current retrieved
   * set of nodes. If the passed in node is not found, it is loaded into the
   * overlay. If the returned promise should instead become rejected, the <strict>
   * argument can be set to true.
   */
  CATMAID.TracingOverlay.prototype.selectNode = function(id, strict) {
    // For the sake of robustness, try parsing the passed in ID as Number. If this
    // yields a valid number, it is used to find the nodes. This is done because
    // the nodes map is typed.
    var numberId = Number(id);
    if (!Number.isNaN(numberId)) {
      id = numberId;
    }

    var node = this.nodes.get(id);
    if (node) {
      this.activateNode(node);
      return Promise.resolve(node);
    } else if (strict) {
      return Promise.reject(new CATMAID.Warning("Could not find node " + id));
    }

    let self = this;
    return this.loadExtraNodes([id])
      .then(function() {
        return self.selectNode(id, true);
      });
  };

  /**
   * Find connectors linked to a treenode. Retruns an object that maps relation
   * names (e.g. presynaptic_to) to a list of connector IDs. Only existing
   * relation types are represented as fields.
   */
  CATMAID.TracingOverlay.prototype.findConnectors = function(node_id) {
    let connectors = {};
    var ConnectorType = SkeletonAnnotations.TYPE_CONNECTORNODE;
    for (var node of this.nodes.values()) {
      if (node.type !== ConnectorType) {
        continue;
      }
      for (var i=0, imax=node.links.length; i<imax; ++i) {
        var link = node.links[i];
        if (link.treenode.id == node_id) {
          var target = connectors[link.relation_name];
          if (!target) {
            target = connectors[link.relation_name] = [];
          }
          target.push(node.id);
        }
      }
    }
    return connectors;
  };

  /**
   * Make sure all currently visible nodes have the correct color.
   */
  CATMAID.TracingOverlay.prototype.recolorAllNodes = function () {
    // Assumes that atn and active_skeleton_id are correct:
    for (var node of this.nodes.values()) {
      node.updateColors();
    }
    this.pixiLayer._renderIfReady();
  };

  /**
   * Make sure all nodes have the correct visibility.
   */
  CATMAID.TracingOverlay.prototype.updateVisibilityForAllNodes = function () {
    // Assumes that atn and active_skeleton_id are correct:
    for (var node of this.nodes.values()) {
      node.updateVisibility(false);
    }
    for (var nodeId of this.labels.keys()) {
      var node = this.nodes.get(nodeId);
      if (node) {
        this.labels.get(nodeId).visibility(node.isVisible());
      }
    }
    this.pixiLayer._renderIfReady();
  };

  /**
   * Set whether the radius of the active node is visible.
   */
  CATMAID.TracingOverlay.prototype.updateNodeRadiiVisibility = function () {
    this.graphics.setNodeRadiiVisibility(CATMAID.TracingOverlay.Settings.session.display_node_radii);
    this.recolorAllNodes(); // Necessary to trigger update of radius graphics.
  };

  /**
   * Select or deselect (if node is falsy) a node. This involves setting the top
   * bar and the status bar as well as updating SkeletonAnnotations.atn. Can
   * handle virtual nodes.
   */
  CATMAID.TracingOverlay.prototype.activateNode = function(node) {
    var atn = SkeletonAnnotations.atn,
        last_skeleton_id = atn.skeleton_id;
    if (node) {
      this.printTreenodeInfo(node.id);
      // Select (doesn't matter if re-select same node)
      atn.set(node, this.getStackViewer().getId());
    } else {
      CATMAID.status('');
      // Deselect
      atn.set(null, null);
      project.setSelectObject( null, null );
    }
  };

  /**
   * Activate the node nearest to the pointer. Optionally, virtual nodes can be
   * respected.
   */
  CATMAID.TracingOverlay.prototype.activateNearestNode = function (respectVirtualNodes) {

    var nearestnode = this.getClosestNode(this.coords.lastX,
                                          this.coords.lastY,
                                          this.stackViewer.z,
                                          Number.MAX_VALUE,
                                          respectVirtualNodes).node;
    var stackZ = this.stackViewer.primaryStack.stackToProjectZ(nearestnode.z, nearestnode.y, nearestnode.x);
    if (nearestnode) {
      if (Math.abs(stackZ - this.stackViewer.z) < 0.5) {
        this.activateNode(nearestnode);
      } else {
        CATMAID.statusBar.replaceLast("No nodes were visible in the current " +
            "section - can't activate the nearest");
      }
    }
    return nearestnode;
  };

  /**
   * Return a method with the signature function(nodes, nodeId) which returns true
   * if @nodes contains a field named @nodeId and is a real node. Optionally,
   * virtual nodes can be respected in this lookup. If this is not requested, the
   * test is not part of the returned function. Otherwise, the returned function
   * returns false.
   */
  SkeletonAnnotations.validNodeTest = function(respectVirtualNodes)
  {
    if (respectVirtualNodes) {
     return function(nodes, nodeId) {
        return nodes.has(nodeId);
      };
    } else {
      return function(nodes, nodeId) {
        return nodes.has(nodeId) &&
          SkeletonAnnotations.isRealNode(nodeId);
      };
    }
  };

  /**
   * Expects x and y in scaled (!) stack coordinates. Can be asked to respect
   * virtual nodes.
   */
  CATMAID.TracingOverlay.prototype.getClosestNode = function (
      xs, ys, zs, radius, respectVirtualNodes)
  {
    var xdiff,
        ydiff,
        zdiff,
        distsq,
        nearestnode = null,
        node,
        nodeid;

    var x = this.stackViewer.primaryStack.stackToProjectX(zs, ys, xs),
        y = this.stackViewer.primaryStack.stackToProjectY(zs, ys, xs),
        z = this.stackViewer.primaryStack.stackToProjectZ(zs, ys, xs),
        r = this.stackViewer.primaryStack.minPlanarRes * radius;

    var mindistsq = r * r;

    if (typeof respectVirtualNodes === 'undefined') respectVirtualNodes = true;

    // Add an virual node check, if wanted
    var nodeIsValid = SkeletonAnnotations.validNodeTest(respectVirtualNodes);

    for (var node of this.nodes.values()) {
      if (nodeIsValid(this.nodes, node.id)) {
        xdiff = x - node.x;
        ydiff = y - node.y;
        zdiff = z - node.z;
        // Must discard those not within current z
        if (!node.isVisible()) continue;
        distsq = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff;
        if (distsq < mindistsq) {
          mindistsq = distsq;
          nearestnode = node;
        }
      }
    }
    return nearestnode ?
        {id: nearestnode.id, node: nearestnode, distsq: mindistsq} :
        null;
  };

  /**
   * Return all node IDs in the overlay within a radius of the given point.
   * Optionally, virtual nodes can be respceted.
   */
  CATMAID.TracingOverlay.prototype.findAllNodesWithinRadius = function (
      x, y, z, radius, respectVirtualNodes, respectHiddenNodes)
  {
    var xdiff, ydiff, zdiff, distsq, radiussq = radius * radius, node, nodeid;

    // respect virual nodes, if wanted
    var nodeIsValid = SkeletonAnnotations.validNodeTest(respectVirtualNodes);

    return Array.from(this.nodes.keys()).filter(function(nodeId) {
      if (nodeIsValid(this.nodes, nodeId)) {
        node = this.nodes.get(nodeId);
        xdiff = x - node.x;
        ydiff = y - node.y;
        zdiff = z - node.z;
        distsq = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff;
        if (distsq < radiussq && (!respectHiddenNodes || node.isVisible()))
          return true;
      }

      return false;
    }, this);
  };

  /**
   * Find the point along the edge from node to node.parent nearest (x, y, z),
   * optionally exluding a radius around the nodes.
   */
  CATMAID.TracingOverlay.prototype.pointEdgeDistanceSq = function (
      x, y, z, node, exclusion)
  {
    var a, b, p, ab, ap, r, ablen;

    exclusion = exclusion || 0;

    a = new THREE.Vector3(node.x, node.y, node.z);
    b = new THREE.Vector3(node.parent.x, node.parent.y, node.parent.z);
    p = new THREE.Vector3(x, y, z);
    ab = new THREE.Vector3().subVectors(b, a);
    ablen = ab.lengthSq();
    if (ablen === 0) return {point: a, distsq: p.distanceToSquared(a)};
    ap = new THREE.Vector3().subVectors(p, a);
    r = ab.dot(ap)/ablen;
    exclusion *= exclusion/ablen;

    // If r is not in [0, 1], the point nearest the line through the node and
    // its parent lies beyond the edge between them, so clamp the point to the
    // edge excluding a radius near the nodes.
    if (r < 0) r = exclusion;
    else if (r > 1) r = 1 - exclusion;

    a.lerp(b, r);
    return  {point: a, distsq: p.distanceToSquared(a)};
  };

  /**
   * Find the point nearest physical coordinates (x, y, z) nearest the specified
   * skeleton, including any nodes in additionalNodes. Virtual nodes can
   * optionally be enabled so that these are respected as well.
   */
  CATMAID.TracingOverlay.prototype.findNearestSkeletonPoint = function (
      x, y, z, skeleton_id, additionalNodes, respectVirtualNodes)
  {
    var nearest = { distsq: Infinity, node: null, point: null };
    var phys_radius = (30.0 / this.stackViewer.scale) *
      Math.max(this.stackViewer.primaryStack.resolution.x, this.stackViewer.primaryStack.resolution.y);

    var self = this;
    // Allow virtual nodes, if wanted
    var nodeIsValid = SkeletonAnnotations.validNodeTest(respectVirtualNodes);

    var nearestReduction = function (nodes, nearest) {
      for (var node of nodes.values()) {
        if (nodeIsValid(nodes, node.id) &&
            node.skeleton_id === skeleton_id &&
            node.parent !== null) {
          var tmp = self.pointEdgeDistanceSq(x, y, z, node, phys_radius);
          if (tmp.distsq < nearest.distsq) {
            nearest = {
              distsq: tmp.distsq,
              node: node,
              point: tmp.point
            };
          }
        }
      }
      return nearest;
    };

    nearest = nearestReduction(this.nodes, nearest);
    if (additionalNodes) nearest = nearestReduction(additionalNodes, nearest);
    return nearest;
  };

  /**
   * Insert a node along the edge in the active skeleton nearest the specified
   * point. Includes the active node (atn), its children, and its parent, even if
   * they are beyond one section away. Can optionally respect virtual nodes.
   */
  CATMAID.TracingOverlay.prototype.insertNodeInActiveSkeleton = function (
      phys_x, phys_y, phys_z, atn, respectVirtualNodes)
  {
    var self = this;

    var insertNode = (function (additionalNodes) {
      var insertion = this.findNearestSkeletonPoint(phys_x, phys_y, phys_z,
          atn.skeleton_id, additionalNodes, respectVirtualNodes);
      if (insertion.node) {
        // Make sure both the insertion node and its parent exist
        this.promiseNodes(insertion.node, insertion.node.parent)
          .then((function(nids) {
            var stack = this.stackViewer.primaryStack;
            this.createNode(nids[1], nids[0], phys_x, phys_y, phys_z, -1, 5);
            }).bind(this));
      }
    }).bind(this);

    atn.promise().then(function(atnId) {
      self.submit(
          CATMAID.makeURL(project.id + '/treenodes/' + atnId + '/next-branch-or-end'),
          'POST',
          undefined,
          function(json) {
            // See goToNextBranchOrEndNode for JSON schema description.
            // Construct a list of child nodes of the active node in case they are
            // not loaded in the overlay nodes.
            var additionalNodes = json.reduce(function (nodes, branch) {
              var child = branch[0];
              nodes.set(child[0], {
                id: child[0],
                x: child[1],
                y: child[2],
                z: child[3],
                skeleton_id: atn.skeleton_id,
                parent: atn
              });
              return nodes;
            }, new Map());
            if (atn.parent_id && (SkeletonAnnotations.isRealNode(atn.parent_id) ||
                                  !self.nodes.has(atn.parent_id)))
            {
              self.promiseNode(self.nodes.get(atn.parent_id))
                .then(function(parentId) {
                  // Need to fetch the parent node first.
                  self.submit(
                      CATMAID.makeURL(project.id + "/node/get_location"),
                      'POST',
                      {tnid: parentId},
                      function(json) {
                        additionalNodes.set(atn.id, {
                          id: atn.id,
                          x: atn.x,
                          y: atn.y,
                          z: atn.z,
                          skeleton_id: atn.skeleton_id,
                          parent: {
                            id: atn.parent_id,
                            x: json[1],
                            y: json[2],
                            z: json[3],
                            skeleton_id: atn.skeleton_id,
                          }
                        });
                        insertNode(additionalNodes);
                      });
                })
                .catch(CATMAID.handleError);
            } else insertNode(additionalNodes); // No need to fetch the parent.
          });
    });
  };

  /**
   * Remove and hide all node labels.
   */
  CATMAID.TracingOverlay.prototype.hideLabels = function() {
    this.removeLabels();
    this.show_labels = false;
  };

  /**
   * Remove all node labels in the view.  Empty the node labels array.
   */
  CATMAID.TracingOverlay.prototype.removeLabels = function() {
    for (var label of this.labels.values()) {
      label.remove();
    }
    this.labels.clear();
  };

  /**
   * Return if labels are displayed.
   */
  CATMAID.TracingOverlay.prototype.getLabelStatus = function() {
    return this.show_labels;
  };

  /**
   * Show all labels.
   */
  CATMAID.TracingOverlay.prototype.showLabels = function() {
    this.show_labels = true;
    this.updateNodes();
  };

  /**
   * Set a coloring source
   */
  CATMAID.TracingOverlay.prototype.setColorSource = function(source) {
    if (this._colorSource && CATMAID.tools.isFn(this._colorSource.unregister)) {
      this._colorSource.unregister();
    }
    this._colorSource = null;
    this._skeletonDisplaySource.removeAllSubscriptions();
    if (source) {
      this._colorSource = source;
      this._skeletonDisplaySource.addSubscription(
          new CATMAID.SkeletonSourceSubscription(source.outputSource, true, false,
              CATMAID.SkeletonSourceSubscription.UNION,
              CATMAID.SkeletonSourceSubscription.ALL_EVENTS),
          true);
    }
  };

  /**
   * Test if the node with the given ID is loaded and display a warning if not.
   * Test also if the node is root and display a message if so. In both cases,
   * false is returned. False, otherwise.
   */
  CATMAID.TracingOverlay.prototype.checkLoadedAndIsNotRoot = function(nodeID) {
    if (null === nodeID || !this.nodes.has(nodeID)) {
      CATMAID.warn("Cannot find node with ID " + nodeID);
      return false;
    }
    if (null === this.nodes.get(nodeID).parent_id) {
      CATMAID.info("Node is already root!");
      return false;
    }
    return true;
  };

  /**
   * Reroots the skeleton to the node with the given ID. If the user confirms that
   * the rerooting should be done, a promise is used to ensure that even virtual
   * nodes are there.
   */
  CATMAID.TracingOverlay.prototype.rerootSkeleton = function(nodeID) {
    if (!this.checkLoadedAndIsNotRoot(nodeID)) return;
    if (!confirm("Do you really want to to reroot the skeleton?")) return;
    var self = this;
    this.promiseNode(this.nodes.get(nodeID)).then(function(nodeID) {
      var command = new CATMAID.RerootSkeletonCommand(self.state, project.id, nodeID);
      CATMAID.commands.execute(command)
        .then(function () { self.updateNodes(); })
        .catch(CATMAID.handleError);
    });
  };

  /**
   * Split the skeleton of the given node (ID). If this node happens to be
   * virtual and the skeleton is editable, the node is created after the user
   * pressed OK in the dialog, canceling will not change the virtual node.
   */
  CATMAID.TracingOverlay.prototype.splitSkeleton = function(nodeId) {
    if (!this.checkLoadedAndIsNotRoot(nodeId)) return Promise.resolve();
    var self = this;
    var node = self.nodes.get(nodeId);
    // Make sure we have permissions to edit the neuron
    return this.executeIfSkeletonEditable(node.skeleton_id, function() {
      // Make sure we reference the correct node and create a model
      var name = CATMAID.NeuronNameService.getInstance().getName(node.skeleton_id);
      var model = new CATMAID.SkeletonModel(node.skeleton_id, name, new THREE.Color(1, 1, 0));

      let split = function(splitNode, upstreamAnnotationSet, downstreamAnnotationSet) {
        // Call backend
        return self.submit.promise()
          .then(function() {
            return self.promiseNode(splitNode);
          }).then(function(splitNodeId) {
            var command = new CATMAID.SplitSkeletonCommand(self.state,
                project.id, splitNodeId, upstreamAnnotationSet,
                downstreamAnnotationSet);
            return CATMAID.commands.execute(command)
              .then(function(result) {
                return self.updateNodes(function () { self.selectNode(splitNodeId); });
              })
              .then(function() {
                return splitNodeId;
              });
          }, CATMAID.handleError, true);
      };

      let noConfirmation = SkeletonAnnotations.FastSplitMode.isNodeMatched(node);
      if (noConfirmation) {
        // Split without confirmation
        return split(node)
          .then(function(splitNodeId) {
            CATMAID.msg('Success', 'Split neuron ' + node.skeleton_id +
                ' at node ' + splitNodeId);
          })
          .catch(CATMAID.handleError);
      } else {
        return new Promise((resolve, reject) => {
          // Show a confirmation dialog before splitting
          var dialog = new CATMAID.SplitMergeDialog({
            model1: model,
            splitNodeId: nodeId,
            split: function() {
              // Get upstream and downstream annotation set
              var upstream_set, downstream_set;
              if (self.upstream_is_small) {
                upstream_set = dialog.get_under_annotation_set();
                downstream_set = dialog.get_over_annotation_set();
              } else {
                upstream_set = dialog.get_over_annotation_set();
                downstream_set = dialog.get_under_annotation_set();
              }
              return split(node, upstream_set, downstream_set)
                .catch(CATMAID.handleError)
                .finally(() => resolve());
            },
            close: () => resolve(),
          });
          dialog.onCancel = () => {
            resolve();
          };
          dialog.show();
        });
      }
    });
  };

  /**
   * Used to join two skeletons together. Permissions are checked at the server
   * side, returning an error if not allowed.
   */
  CATMAID.TracingOverlay.prototype.createTreenodeLink = function (fromid, toid) {
    if (fromid === toid) return;
    if (!this.nodes.has(toid)) return;
    var self = this;
    // Get neuron name and id of the to-skeleton
    this.promiseNodes(this.nodes.get(fromid), this.nodes.get(toid)).then(function(nids) {
      var fromid = nids[0], toid=nids[1];
      self.submit(
        CATMAID.makeURL(project.id + '/treenodes/' + toid + '/info'),
        'GET',
        undefined,
        function(json) {
          var from_model = SkeletonAnnotations.activeSkeleton.createModel();
          var from_skid = from_model.id;
          var to_skid = json.skeleton_id;

          var nodes = {};
          nodes[from_skid] = fromid;
          nodes[to_skid] = toid;

          // Make sure the user has permissions to edit both the from and the to
          // skeleton.
          self.executeIfSkeletonEditable(from_skid, function() {
            self.executeIfSkeletonEditable(to_skid, function() {
              // The function used to instruct the backend to do the merge
              var merge = function(annotation_set, fromId, toId, samplerHandling) {
                return self.submit.then(function() {
                  // Suspend tracing layer during join to avoid unnecessary
                  // reloads.
                  self.suspended = true;
                  // Join skeletons
                  var command = new CATMAID.JoinSkeletonsCommand(self.state, project.id,
                      nodes[fromId], nodes[toId], annotation_set, samplerHandling);
                  return CATMAID.commands.execute(command)
                    .catch(CATMAID.handleError)
                    .then(function(result) {
                      // Activate tracing layer again and update the view
                      // manually.
                      self.suspended = false;
                      if (result) {
                        self.updateNodes(function() {
                          // Wait for updates to finish before updating the active node
                          self.submit.then(self.selectNode.bind(self, result.toid));
                        });
                      }
                    });
                }, CATMAID.handleError, true);
              };

              // A method to use when the to-skeleton has multiple nodes
              var merge_multiple_nodes = function() {
                // If a fast merge mode is enabled, check if this operation
                // matches the settings and don't show the UI if this is the case.
                let noConfirmation = SkeletonAnnotations.FastMergeMode.isNodeMatched(
                    self.nodes.get(toid));

                if (noConfirmation) {
                  // Providing no annotation set, will result in all annotations
                  // to be taken over.
                  merge(undefined, from_skid, to_skid)
                    .then(function() {
                      CATMAID.msg("Success", "Merged skeleton " + to_skid +
                          " into skeleton " + from_skid + " without confirmation");
                    });
                } else {
                  var to_color = new THREE.Color(1, 0, 1);
                  var to_model = new CATMAID.SkeletonModel(
                      to_skid, json.neuron_name, to_color);
                  // Extend the display with the newly created line
                  var extension = {};
                  var p = self.nodes.get(SkeletonAnnotations.getActiveNodeId()),
                      c = self.nodes.get(toid);
                  extension[from_skid] = [
                      new THREE.Vector3(p.x, p.y, p.z),
                      new THREE.Vector3(c.x, c.y, c.z)
                  ];
                  var dialog = new CATMAID.SplitMergeDialog({
                    model1: from_model,
                    model2: to_model,
                    extension: extension,
                    keepOrder: false,
                    merge: function(fromId, toId) {
                      merge(this.get_combined_annotation_set(), fromId, toId,
                          this.samplerHandling);
                    }
                  });
                  dialog.show(extension);
                }
              };

              // A method to use when the to-skeleton has only a single node
              var merge_single_node = function() {
                /* Retrieve annotations for the to-skeleton and show th dialog if
                 * there are some. Otherwise merge the single not without showing
                 * the dialog.
                 */
                var noUI = SkeletonAnnotations.Settings.session.quick_single_node_merge;

                if (noUI) {
                  // Not specifying an annotation map will cause the combined
                  // annotation set of both skeletons to be used.
                  merge(undefined, from_skid, to_skid);
                } else {
                  // Only show a dialog if the merged in neuron is annotated.
                  CATMAID.Annotations.forSkeleton(project.id, to_skid)
                    .then(function(to_annotations) {
                      if (to_annotations.length === 0) {
                        return CATMAID.Annotations.forSkeleton(project.id, from_skid)
                          .then(function(from_annotations) {
                            // Merge annotations from both neurons
                            function collectAnnotations(o, e) {
                              o[e.name] = e.users[0].id; return o;
                            }
                            var annotationMap = from_annotations.reduce(collectAnnotations, {});
                            merge(annotationMap, from_skid, to_skid);
                          });
                      } else {
                        merge_multiple_nodes();
                      }
                    }).catch(CATMAID.handleError);
                }
              };

              /* If the to-node contains more than one node, show the dialog.
               * Otherwise, check if the to-node contains annotations. If so, show
               * the dialog. Otherwise, merge it right away and keep the
               * from-annotations.
               */
              self.executeDependentOnExistence(toid,
                self.executeDependentOnNodeCount.bind(self, toid, merge_single_node,
                  merge_multiple_nodes),
                merge_multiple_nodes);
            });
        });
      });
    });
  };

  SkeletonAnnotations.linkTypePointsOutwards = function(linkType) {
    return linkType === 'presynaptic_to';
  };

  /**
   * Asynchronously, create a link between the nodes @fromid and @toid of type
   * @link_type. It is expected, that both nodes are existent. All nodes are
   * updated after this. If the from-node is virtual, it will be created.
   */
  CATMAID.TracingOverlay.prototype.createLink = function (fromid, toid,
      link_type, afterCreate)
  {
    var self = this;
    var createLink = this.submit.promise()
      .then(function() {
        return self.promiseNode(fromid);
      })
      .then(function(nodeId) {
        var command = new CATMAID.LinkConnectorCommand(self.state,
            project.id, toid, nodeId, link_type);
        return CATMAID.commands.execute(command)
          .then(function(result) {
            if (result.warning) CATMAID.warn(result.warning);
            var node = self.nodes.get(nodeId);
            if (!node) {
              return true;
            }
            var connector = self.nodes.get(toid);
            if (!connector) {
              return true;
            }
            // Add result link to set of display (to not required update)
            var outwards = SkeletonAnnotations.linkTypePointsOutwards(link_type);
            var link = self.graphics.newLinkNode(result.linkId, node,
                result.relationId, link_type, 5, 0, outwards);
            link.edition_time_iso_str = result.linkEditTime;
            connector.links.push(link);
            node.linkConnector(connector.id, link);
            connector.createGraphics();

            // Visibility groups have to be reset to force re-calculation of link
            // based visibility.
            connector.updateVisibility(true);

            self.redraw();
          });
      });

    // Make sure this promise is properly enqueued in the submitter queue, i.e.
    // newly submitted requests happen after the link creation.
    this.submit.then(function() {
      return createLink
        .catch(CATMAID.noop);
    });

    return createLink;
  };

  /**
   * Create a single connector not linked to any treenode. If given a
   * completionCallback function, it is invoked with one argument: the ID of the
   * newly created connector.
   */
  CATMAID.TracingOverlay.prototype.createSingleConnector = function (
      phys_x, phys_y, phys_z, confval, subtype)
  {
    var self = this;
    // Create connector
    var createConnector = CATMAID.commands.execute(
        new CATMAID.CreateConnectorCommand(project.id,
          phys_x, phys_y, phys_z, confval, subtype));
    return createConnector.then(function(result) {
      var newConnectorNode = self.nodes.get(result.newConnectorId);
      if (!newConnectorNode) {
        CATMAID.warn("Could not find new connector node in stack viewer");
        return;
      }
      self.activateNode(newConnectorNode);

      return result.newConnectorId;
    });
  };

  /**
   * Create a new postsynaptic treenode from a connector. We create the treenode
   * first, then we create the link from the connector.
   */
  CATMAID.TracingOverlay.prototype.createPostsynapticTreenode = function (
      connectorID, phys_x, phys_y, phys_z, radius, confidence, afterCreate)
  {
    return this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius,
        confidence, "postsynaptic_to", afterCreate);
  };

  var countRelationNames = function(counts, l) {
    let sum = counts[l.relation_name];
    if (sum === undefined) {
      sum = 0;
    }
    counts[l.relation_name] = sum + 1;
    return counts;
  };

  var collectLinksByRelation = function(target, l) {
    let set = target[l.relation_name];
    if (set === undefined) {
      set = target[l.relation_name] = [];
    }
    set.push(l);
    return target;
  };

  /**
   * Create a new treenode that is postsynaptic to the given @connectorID.
   */
  CATMAID.TracingOverlay.prototype.createPresynapticTreenode = function (
      connectorID, phys_x, phys_y, phys_z, radius, confidence, afterCreate)
  {
    // Check that connectorID doesn't have a presynaptic treenode already (It is
    // also checked in the server on attempting to create a link. Here, it is
    // checked for convenience to avoid creating an isolated treenode for no
    // reason.)
    var connectorNode = this.nodes.get(connectorID);
    if (!connectorNode) {
      return Promise.reject(new CATMAID.ValueError("Connector #" +
          connectorID + " is not loaded. Browse to " +
          "its section and make sure it is selected."));
    }
    var counts = connectorNode.links.reduce(countRelationNames, {});
    if (CATMAID.tools.getDefined(counts['presynaptic_to'], 0) > 0) {
      return Promise.reject(new CATMAID.Warning(
          "The connector already has a presynaptic node!"));
    }
    return this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius,
        confidence, "presynaptic_to", afterCreate);
  };

  /**
   * Create a new treenode that has a gap junction with the given @connectorID.
   */
  CATMAID.TracingOverlay.prototype.createGapjunctionTreenode = function (
      connectorID, phys_x, phys_y, phys_z, radius, confidence, afterCreate)
  {
    // Check that connectorID doesn't already have two gap junction links
    // and that connectorID doesn't have post- or presynaptic links
    // (It is also checked in the server on attempting to create a link.
    // Here, it is checked for convenience to avoid creating an isolated treenode for no reason.)
    var connectorNode = this.nodes.get(connectorID);
    if (!connectorNode) {
      return Promise.reject(new CATMAID.ValueError( "Connector #" +
          connectorID + " is not loaded. Browse to " +
          "its section and make sure it is selected."));
    }
    var counts = connectorNode.links.reduce(countRelationNames, {});

    if (CATMAID.tools.getDefined(counts['gapjunction_with'], 0) > 1) {
      return Promise.reject(new CATMAID.Warning(
          "The connector already has two gap junction nodes!"));
    }
    if (CATMAID.tools.getDefined(counts['presynaptic_to'], 0) > 0 ||
        CATMAID.tools.getDefined(counts['postsynaptic_to'], 0) > 0) {
      return Promise.reject(new CATMAID.Warning(
          "Gap junction can not be added as the connector is part of a synapse!"));
    }
    return this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius,
        confidence, "gapjunction_with", afterCreate);
  };

  /**
   * Create a new treenode that has a tight junction with the given @connectorID.
   */
  CATMAID.TracingOverlay.prototype.createTightjunctionTreenode = function (
      connectorID, phys_x, phys_y, phys_z, radius, confidence, afterCreate)
  {
    // Check that connectorID doesn't already have two tight junction links
    // and that connectorID doesn't have post- or presynaptic links
    // (It is also checked in the server on attempting to create a link.
    // Here, it is checked for convenience to avoid creating an isolated treenode for no reason.)
    var connectorNode = this.nodes.get(connectorID);
    if (!connectorNode) {
      return Promise.reject(new CATMAID.ValueError( "Connector #" +
          connectorID + " is not loaded. Browse to " +
          "its section and make sure it is selected."));
    }
    var counts = connectorNode.links.reduce(countRelationNames, {});

    if (CATMAID.tools.getDefined(counts['tightjunction_with'], 0) > 1) {
      return Promise.reject(new CATMAID.Warning(
          "The connector already has two tight junction nodes!"));
    }
    if (CATMAID.tools.getDefined(counts['presynaptic_to'], 0) > 0 ||
        CATMAID.tools.getDefined(counts['postsynaptic_to'], 0) > 0) {
      return Promise.reject(new CATMAID.Warning(
          "Tight junction can not be added as the connector is part of a synapse!"));
    }
    return this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius,
        confidence, "tightjunction_with", afterCreate);
  };

  /**
   * Create a new treenode that has a desmosome with the given @connectorID.
   */
  CATMAID.TracingOverlay.prototype.createDesmosomeTreenode = function (
      connectorID, phys_x, phys_y, phys_z, radius, confidence, afterCreate)
  {
    // Check that connectorID doesn't already have two tight junction links
    // and that connectorID doesn't have post- or presynaptic links
    // (It is also checked in the server on attempting to create a link.
    // Here, it is checked for convenience to avoid creating an isolated treenode for no reason.)
    var connectorNode = this.nodes.get(connectorID);
    if (!connectorNode) {
      return Promise.reject(new CATMAID.ValueError( "Connector #" +
          connectorID + " is not loaded. Browse to " +
          "its section and make sure it is selected."));
    }
    var counts = connectorNode.links.reduce(countRelationNames, {});

    if (CATMAID.tools.getDefined(counts['desmosome_with'], 0) > 1) {
      return Promise.reject(new CATMAID.Warning(
          "The desmosome connector already has two nodes!"));
    }
    if (CATMAID.tools.getDefined(counts['presynaptic_to'], 0) > 0 ||
        CATMAID.tools.getDefined(counts['postsynaptic_to'], 0) > 0) {
      return Promise.reject(new CATMAID.Warning(
          "Desmosome can not be added as the connector is part of a synapse!"));
    }
    return this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius,
        confidence, "desmosome_with", afterCreate);
  };

  /**
   * Create a new treenode and link it immediately to the given connector with the
   * specified link_type.
   */
  CATMAID.TracingOverlay.prototype.createTreenodeWithLink = function (
      connectorID, phys_x, phys_y, phys_z, radius, confidence,
      link_type, afterCreate)
  {
    var self = this;
    var command = new CATMAID.CreateNodeCommand(this.state,
        project.id, phys_x, phys_y, phys_z, -1, radius, confidence,
        undefined, SkeletonAnnotations.Settings.session.new_neuron_name);
    return CATMAID.commands.execute(command)
      .then(function(jso) {
        var nid = parseInt(jso.treenode_id);
        // always create a new treenode which is the root of a new skeleton
        var nn = self.graphics.newNode(nid, null, null, radius, phys_x, phys_y,
            phys_z, 0, 5 /* confidence */, parseInt(jso.skeleton_id), 0,
            CATMAID.session.userid);
        // Update edition time
        nn.edition_time_iso_str = jso.edition_time;
        // add node to nodes list
        self.nodes.set(nid, nn);
        nn.createGraphics();
        // create link : new treenode postsynaptic_to or presynaptic_to
        // deactivated connectorID
        return self.createLink(nid, connectorID, link_type)
          .then(function() {
            if (afterCreate) {
              // Use a new node reference, because createLink() triggers an update,
              // which potentially re-initializes node objects.
              var node = self.nodes.get(nid);
              afterCreate(self, node);
            }
          });
      });
  };

  /**
   * Create a node and activate it. Expects the parent node to be real or falsy,
   * i.e. not virtual. If a child ID is passed in, a new node is created between
   * this child and the parent node.
   */
  CATMAID.TracingOverlay.prototype.createNode = function (parentID,
      childId, phys_x, phys_y, phys_z, radius, confidence, afterCreate) {
    if (!parentID) { parentID = -1; }

    // Check if we want the newly create node to be a model of an existing empty neuron
    var selneuron = project.selectedObjects.selectedneuron;
    var useneuron = null === selneuron ? -1 : selneuron;
    var neuronname = null === selneuron ? SkeletonAnnotations.Settings.session.new_neuron_name : '';

    var self = this;

    var command = childId ?
      new CATMAID.InsertNodeCommand(this.state, project.id, phys_x, phys_y,
        phys_z, parentID, childId, radius, confidence, useneuron) :
      new CATMAID.CreateNodeCommand(this.state, project.id, phys_x, phys_y,
        phys_z, parentID, radius, confidence, useneuron, neuronname);
    return CATMAID.commands.execute(command)
      .then(function(result) {
        // Set atn to be the newly created node
        var nn = self.nodes.get(result.treenode_id);
        if (!nn) {
          CATMAID.warn("Could not find new node");
          return;
        }
        self.activateNode(nn);

        // Invoke callback if necessary
        if (afterCreate) afterCreate(self, nn);
      });
  };

  /**
   * Invoke the callback function after having pushed updated node coordinates
   * to the database. Virtual nodes are ignored.
   */
  CATMAID.TracingOverlay.prototype.updateNodeCoordinatesInDB = function (callback) {
    /**
     * Create a promise that will update all nodes in the back-end that need to be
     * synced.
     */
    function promiseUpdate() {
      var update = {treenode: [],
                    connector: [],
                    virtual: []};
      /* jshint validthis: true */ // "this" will be bound to the tracing overlay
      for (var nodeID of this.nodeIDsNeedingSync) {
        var node = this.nodes.get(nodeID);
        // only updated nodes that need sync, e.g.  when they changed position
        if (node) {
          if (SkeletonAnnotations.isRealNode(node.id)) {
            update[node.type].push([node.id, node.x, node.y, node.z]);
          } else {
            update.virtual.push(node);
          }
        }
      }

      this.nodeIDsNeedingSync.clear();

      var promise;
      if (update.treenode.length > 0 || update.connector.length > 0) {
        var command = new CATMAID.UpdateNodesCommand(this.state,
            project.id, update.treenode, update.connector);
        promise = CATMAID.commands.execute(command).catch(CATMAID.handleError);
      } else {
        promise = Promise.resolve(0);
      }

      update.virtual.forEach(function (node) {
        promise = promise.then(this.promiseNode.bind(this, node));
      }, this);

      return promise;
    }

    // Queue update of real nodes as a promise
    var promise = this.submit.then(promiseUpdate.bind(this)).promise();

    // Queue callback, if there is any (it will get the results of the node update
    // as arguments automatically).
    if (CATMAID.tools.isFn(callback)) {
      promise = promise.then(callback);
    }

    return promise;
  };

  /**
   * Create and return a virtual node. It is actually non-existant and the given
   * child and parent are connected directly. However, both of them (!) are not
   * part of the current section. The node will be placed on the XY plane of the
   * given Z. If child and parent have the same Z, null is returned.
   *
   * This function expects child and parent to be real nodes and does no further
   * checks in this regard for performance reasons.
   */
  CATMAID.createVirtualNode = function(graphics, child, parent, stackViewer) {
    // Make sure child and parent are at different sections
    if (stackViewer.primaryStack.projectToUnclampedStackZ(child.z, child.y, child.x) ===
        stackViewer.primaryStack.projectToUnclampedStackZ(parent.z, parent.y, parent.x)) {
      console.log('Child and parent have same Z, can\'t create virtual node.');
      return null;
    }

    return CATMAID._createVirtualNode(graphics, child, parent, stackViewer);
  };

  let _virtualNodeCreationTmpVector = new THREE.Vector3();
  let _virtualNodeCreationTmpLine = new THREE.Line3(
      new THREE.Vector3(), new THREE.Vector3());

  /**
   * The actual implementation of createVirtualNode(), without precondition
   * checks to allow faster execution if this was tested before.
   */
  CATMAID._createVirtualNode = function(graphics, child, parent, stackViewer, onlyInView) {
    var z = stackViewer.z;

    // Define X and Y so that they are on the intersection of the line between
    // child and parent and the current section.
    _virtualNodeCreationTmpLine.start.set(child.x, child.y, child.z);
    _virtualNodeCreationTmpLine.end.set(parent.x, parent.y, parent.z);
    let pos = stackViewer.plane.intersectLine(_virtualNodeCreationTmpLine,
        _virtualNodeCreationTmpVector);

    if (!pos) {
      throw new CATMAID.ValueError(`Can not find intersection between node ${child.id} and ${parent.id} at Z = ${z}`);
    }

    // The ID should be different for the the same child and parent in different
    // Z sections to distinguish virtual nodes on different sections. Therefore,
    // the complete location is part of the ID.
    var id = SkeletonAnnotations._getVirtualNodeID(child.id, parent.id, pos.x, pos.y, pos.z);

    if (child.radius && parent.radius) {
      // TODO
      var a = (parent.z - pos.z)/(parent.z - child.z);
      var r = parent.radius + a * (child.radius - parent.radius);
    } else {
      var r = -1;
    }
    var c = 5;

    var vn = graphics.newNode(id, parent, parent.id, r, pos.x, pos.y, pos.z, 0, c,
        child.skeleton_id, child.edition_time, child.user_id);

    return vn;
  };

  CATMAID.TracingOverlay.prototype.getName = function () {
    if (this.stackViewer) {
      return 'Tracing layer (' + this.stackViewer.primaryStack.title + ')';
    } else {
      return "Tracing layer";
    }
  };

  CATMAID.TracingOverlay.prototype.append = CATMAID.noop;
  CATMAID.TracingOverlay.prototype.clear = CATMAID.noop;
  CATMAID.TracingOverlay.prototype.removeSkeletons = CATMAID.noop;
  CATMAID.TracingOverlay.prototype.updateModels = CATMAID.noop;

  /**
   * Get a proxy that dynamically creates skeleton models based on the current
   * state.
   */
  CATMAID.TracingOverlay.prototype.getSkeletonModels = function () {
    let models = {};
    let skeletonIds = new Set(Array.from(this.nodes.values()).filter(getSkeletonId).map(getSkeletonId));
    for (var skeletonId of skeletonIds) {
      models[skeletonId] = new CATMAID.SkeletonModel(skeletonId);
    }
    return models;
  };

  CATMAID.TracingOverlay.prototype.getSelectedSkeletonModels = function () {
    // Return all skeletons, because the active skeleton is taken car of
    // explicitly.
    return this.getSkeletonModels();
  };

  CATMAID.TracingOverlay.prototype.getSkeletons = function () {
    return Array.from(this.nodes.keys());
  };

  CATMAID.TracingOverlay.prototype.getSelectedSkeletons = function () {
    return this.getSkeletons();
  };

  CATMAID.TracingOverlay.prototype.hasSkeleton = function (skeletonId) {
    return this.nodes.has(skeletonId);
  };

  var getSkeletonId = function(node) {
    return node.skeleton_id;
  };

  var makeSkeletonModelAccessor = function(skeletonIds) {
    return new Proxy({}, {
      get: function(target, key) {
        // The passed in key will be a skeleton ID
        if (skeletonIds.has(Number(key))) {
          return new CATMAID.SkeletonModel(key);
        }
      },
      ownKeys: function(target) {
        return Array.from(skeletonIds.keys()).map(String);
      },
      getOwnPropertyDescriptor(k) {
        return {
          enumerable: true,
          configurable: true,
        };
      },
      has: function(target, key) {
        return skeletonIds.has(Number(key));
      },
    });
  };

  /**
   * Recreate all nodes (or reuse existing ones if possible).
   *
   * @param jso is an array of JSON objects, where each object may specify a Node
   *            or a ConnectorNode
   * @param extraNodes is an array of nodes that should be added additionally
   * @returns {Bool} Whether or not a render call has already been queued.
   */
  CATMAID.TracingOverlay.prototype.refreshNodesFromTuples = function (jso, extraNodes) {
    // Due to possible performance implications, the tracing layer won't signal
    // visible node set changes if there are no listeners.
    var triggerEvents = this.hasListeners();
    var lastNodeIds;
    if (triggerEvents) {
      lastNodeIds = new Set(Array.from(this.nodes.values()).filter(getSkeletonId).map(getSkeletonId));
    }

    // Reset nodes and labels
    this.nodes.clear();
    // remove labels, but do not hide them
    this.removeLabels();

    // Prepare existing Node and ConnectorNode instances for reuse
    this.graphics.resetCache();

    // Set currently allowed section distances, to correctly account for broken
    // sections.
    var sv = this.stackViewer;
    var dToSecBefore = sv.validZDistanceBefore(sv.z);
    var dToSecAfter = sv.validZDistanceAfter(sv.z);
    this.graphics.init(dToSecBefore, dToSecAfter);

    // Look-up some frequently used objects
    var primaryStack = this.stackViewer.primaryStack;

    // Add extra nodes first
    if (extraNodes) {
      for (var i=0, max=extraNodes.length; i<max; ++i) {
        var n = extraNodes[i];
        var stackZ = primaryStack.projectToUnclampedStackZ(n.z, n.y, n.x);
        this.nodes.set(n.id, this.graphics.newNode(n.id, null, n.parent_id, n.radius,
            n.x, n.y, n.z, stackZ - this.stackViewer.z, n.confidence, n.skeleton_id,
            n.edition_time, n.user_id));
      }
    }

    var jsonNodes = jso[0];
    var jsonConnectors = jso[1];
    var labelData = jso[2];
    var hitNodeLimit = jso[3];
    var relationMap = jso[4];
    var extraData = jso[5];

    // If extra data was submitted (e.g. to augment cached data), add this data to
    // other fields.
    if (extraData) {
      for (var i=0, imax=extraData.length; i<imax; ++i) {
        let d = extraData[i];
        if (!d) {
          // Ignore invalid entries.
          continue;
        }
        // Exta treenodes
        if (d[0] && d[0].length > 0) {
          Array.prototype.push.apply(jsonNodes, d[0]);
        }
        // Extra connectors
        if (d[1] && d[1].length > 0) {
          Array.prototype.push.apply(jsonConnectors, d[1]);
        }
        // Extra labels
        if (d[2]) {
          for (var l in d[2]) {
            labelData[l] = d[2][l];
          }
        }
        // Extra node limit hit
        hitNodeLimit = hitNodeLimit && d[3];
        // Extra relation map
        if (d[4]) {
          for (var r in d[4]) {
            relationMap[r] = d[4][r];
          }
        }
      }
    }

    if (relationMap && !CATMAID.tools.isEmpty(relationMap)) {
      // Update cached copy
      this.relationMap = relationMap;
    } else if (!this.relationMap) {
      this.relationMap = {};
    }
    var relationMap = this.relationMap;

    // Keetp track of all nodes that have been added
    var addedNodes = [];
    let nAddedTreenodes = 0;
    let nAddedConnectors = 0;

    // Populate Nodes
    for (var i=0, max=jsonNodes.length; i<max; ++i) {
      var a = jsonNodes[i];
      if (this.nodes.has(a[0])) {
        continue;
      }
      // a[0]: ID, a[1]: parent ID, a[2]: x, a[3]: y, a[4]: z, a[5]: confidence
      // a[6]: radius, a[7]: skeleton_id, a[8]: user_id, a[9]: user_id
      var stackZ = primaryStack.projectToUnclampedStackZ(a[4], a[3], a[2]);
      let newNode = this.graphics.newNode(
        a[0], null, a[1], a[6], a[2], a[3], a[4],
        stackZ - this.stackViewer.z, a[5], a[7], a[8], a[9]);
      this.nodes.set(a[0], newNode);
      addedNodes.push(newNode);
      ++nAddedTreenodes;
    }

    // Populate ConnectorNodes
    var attachmentRelId = Object.keys(relationMap).reduce(function(o, rId) {
      var relName = relationMap[rId];
      if (relName === 'attached_to') {
        return rId;
      }
      return o;
    }, null);
    for (var i=0, max=jsonConnectors.length; i<max; ++i) {
      var a = jsonConnectors[i];
      if (this.nodes.has(a[0])) {
        continue;
      }
      var links = a[7];
      // Determine the connector node type. For now eveything with no or only
      // pre or post treenodes is treated as a synapse. If there are only
      // non-directional connectors, an abutting or gap junction connector is
      // assumed. If there is an attachment relation involved, the connector is an
      // attachment connector.
      var isAttachment = false;
      var subtype = CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR;
      var exclusiveRelation = null;
      for (var l=0; l<links.length; ++l) {
        var rid = links[l][1];
        if (0 === l) {
          exclusiveRelation = rid;
        } else if (exclusiveRelation !== rid) {
          exclusiveRelation = false;
        }
        if (attachmentRelId !== null && rid == attachmentRelId) {
          isAttachment = true;
        }
      }
      if (isAttachment) {
        subtype = CATMAID.Connectors.SUBTYPE_ATTACHMENT_CONNECTOR;
      } else if (exclusiveRelation === null) {
        // If no exclusive subtype was found, make the connector type whatever
        // is selected as default connector type.
        subtype = SkeletonAnnotations.Settings.session.default_connector_type;
      } else {
        var relation_name = relationMap[exclusiveRelation];
        if (relation_name == "abutting") {
          subtype = CATMAID.Connectors.SUBTYPE_ABUTTING_CONNECTOR;
        } else if (relation_name == 'gapjunction_with') {
          subtype = CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR;
        } else if (relation_name === 'tightjunction_with') {
          subtype = CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR;
        } else if (relation_name === 'desmosome_with') {
          subtype = CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR;
        } else if (relation_name == 'attached_to') {
          subtype = CATMAID.Connectors.SUBTYPE_ATTACHMENT_CONNECTOR;
        }
      }
      // a[0]: ID, a[1]: x, a[2]: y, a[3]: z, a[4]: confidence,
      // a[5]: edition time, a[6]: user_id
      // a[7]: treenode links
      var stackZ = primaryStack.projectToUnclampedStackZ(a[3], a[2], a[1]);
      // For performance reasons, the edition time is transmitted as epoch time
      let newNode = this.graphics.newConnectorNode(
        a[0], a[1], a[2], a[3],
        stackZ - this.stackViewer.z, a[4], subtype, a[5], a[6]);
      this.nodes.set(a[0], newNode);
      addedNodes.push(newNode);
      ++nAddedConnectors;
    }

    // Now that all Node instances are in place, loop nodes again and link parents
    // and children. If virtual nodes are needed for a particular edge, insert
    // them between parent and child. These are nodes that are not actually on the
    // current section, but are created to represent the connection between a
    // child and a parent node that are not part of this section either.
    let nAddedVirtualNodes = 0;

    for (var i=0, max=jsonNodes.length; i<max; ++i) {
      var a = jsonNodes[i];
      var n = this.nodes.get(a[0]);
      var pn = this.nodes.get(a[1]); // parent Node

      // Neither virtual nodes or other parent/child links need to be created if
      // there is no parent node.
      if (!pn) {
        continue;
      }

      // Virtual nodes can only exists if both parent and child are not on the
      // current section and not both above or below.
      if ((n.zdiff < 0 && pn.zdiff > 0) || (n.zdiff > 0 && pn.zdiff < 0)) {
        var vn = CATMAID._createVirtualNode(this.graphics, n, pn, this.stackViewer);
        if (vn) {
          ++nAddedVirtualNodes;
          n.parent = vn;
          n.parent_id = vn.id;
          pn.addChildNode(vn);
          vn.addChildNode(n);
          this.nodes.set(vn.id, vn);
          addedNodes.push(vn);
          continue;
        }
      }

      // If no virtual node was inserted, link parent and child normally.
      n.parent = pn;
      // update the parent's children
      pn.addChildNode(n);
    }

    // Disable most unused node instances, keeping a small caching buffer.
    var nTreeNodes = nAddedTreenodes + nAddedVirtualNodes +
        (extraNodes ? extraNodes.length : 0);
    this.graphics.disableBeyond(nTreeNodes, nAddedConnectors);

    // Now that ConnectorNode and Node instances are in place,
    // set all relations
    var pointsOutwards = SkeletonAnnotations.linkTypePointsOutwards;
    for (var i=0, max=jsonConnectors.length; i<max; ++i) {
      var a = jsonConnectors[i];
      // a[0] is the ID of the ConnectorNode
      var connector = this.nodes.get(a[0]);
      // a[7]: all relations, an array of arrays, containing treenode_id,
      // relation_id, tc_confidence, tc_edition_time, tc_id
      var relations = a[7];
      for (var j=0, jmax=relations.length; j<jmax; ++j) {
        var r = relations[j];
        // r[0]: tnid, r[1]: relation ID r[2]: tc_confidence
        var tnid = r[0];
        var node = this.nodes.get(tnid);
        if (node) {
          var relation_name = relationMap[r[1]];
          var outwards = pointsOutwards(relation_name);
          var link = this.graphics.newLinkNode(r[4], node, r[1], relation_name, r[2], r[3], outwards);

          connector.linkNode(tnid, link);
          node.linkConnector(connector.id, link);
        }
      }
    }

    // Draw node edges and circles, including the ones for virtual nodes.
    for (var i=0, imax=addedNodes.length; i<imax; ++i) {
      addedNodes[i].createGraphics();
    }

    // Now that all edges have been created, disable unused arrows
    this.graphics.disableRemainingArrows();

    if (this.getLabelStatus()) {
      // For every node ID
      var m = labelData;
      // Scale labels relative to confidence text labels to account for overlay scaling.
      var fontSize = parseFloat(this.graphics.ArrowLine.prototype.scaledConfidenceFontSize) * 0.75;
      var labeledNodes = Object.keys(m);
      for (var i=0, imax=labeledNodes.length; i<imax; ++i) {
        var nid = parseInt(labeledNodes[i], 10);
        if (m.hasOwnProperty(nid)) {
          var node = this.nodes.get(nid);
          // Only add labels for nodes in current section
          if (node && node.shouldDisplay()) {
            this.labels.set(nid, new CATMAID.OverlayLabel(
                nid, this.paper, node[node.planeX], node[node.planeY],
                fontSize, m[nid], node.isVisible()));
          }
        }
      }
    }

    // Provide loading status updated. Warn about nodes not retrieved because of
    // limit.
    let msg = "Loaded " + nAddedTreenodes + " nodes, " + nAddedConnectors +
        " connectors and " + nAddedVirtualNodes + " virtual nodes";
    if (hitNodeLimit) {
      msg = "Warning: Did not retrieve all visible nodes--too many! Zoom in to " +
        "constrain the field of view. " + msg;
      CATMAID.warn(msg);
      this.trigger(this.EVENT_HIT_NODE_DISPLAY_LIMIT);
    }
    CATMAID.statusBar.replaceLast(msg);

    var renderingQueued = false;
    if (triggerEvents) {
      var newNodeIds = new Set(Array.from(this.nodes.values()).filter(getSkeletonId).map(getSkeletonId));
      var addedNodeIds = new Set();
      for (var newNodeId of newNodeIds) {
        if (!lastNodeIds.has(newNodeId)) {
          addedNodeIds.add(newNodeId);
        }
      }
      var removedNodeIds = new Set();
      for (var lastNodeId of lastNodeIds) {
        if (!newNodeIds.has(lastNodeId)) {
          removedNodeIds.add(lastNodeId);
        }
      }
      // Suspend overlay for events to prevent repeated redraws. The final
      // createGraphics() call will update the color and a redraw happens later.
      if (addedNodeIds.size > 0) {
        renderingQueued = true;
        this.trigger(this.EVENT_MODELS_ADDED, makeSkeletonModelAccessor(addedNodeIds));
      }
      if (removedNodeIds.size > 0) {
        renderingQueued = true;
        this.trigger(this.EVENT_MODELS_REMOVED, makeSkeletonModelAccessor(removedNodeIds));
      }
    }

    return renderingQueued;
  };

  /**
   * This loads additional nodes into the current overlay.
   *
   * @returns Promise resolves when nodes are loaded
   */
  CATMAID.TracingOverlay.prototype.loadExtraNodes = function(extraNodes) {
    if (!extraNodes || !extraNodes.length) {
      throw new CATMAID.ValueError("No nodes provided");
    }
    let nodes = this.nodes;
    let nodeIdsToLoad = extraNodes.reduce(function(target, nodeId) {
      if (SkeletonAnnotations.isRealNode(nodeId)) {
        if (!nodes.has(nodeId)) {
          target.push(nodeId);
        }
      } else {
         let parentId = SkeletonAnnotations.getParentOfVirtualNode(nodeId);
         let childId = SkeletonAnnotations.getChildOfVirtualNode(nodeId);
         if (nodes.has(parentId)) {
           target.push(parentId);
         }
         if (nodes.has(childId)) {
           target.push(childId);
         }
      }
      return target;
    }, []);
    if (nodeIdsToLoad.length === 0) {
      return Promise.resolve();
    }
    let self = this;
    return CATMAID.fetch(project.id + '/treenodes/compact-detail', 'POST', {
        treenode_ids: nodeIdsToLoad
      })
      .then(function(data) {
        // Add to nodes array
        let primaryStack = self.stackViewer.primaryStack;
        let addedNodes = new Array(data.length);
        for (let i=0, imax=data.length; i<imax; ++i) {
          let a = data[i];
          var stackZ = primaryStack.projectToUnclampedStackZ(a[4], a[3], a[2]);
          let newNode = self.graphics.newNode(
            a[0], null, a[1], a[6], a[2], a[3], a[4],
            stackZ - self.stackViewer.z, a[5], a[7], a[8], a[9]);
          self.nodes.set(a[0], newNode);
          addedNodes[i] = newNode;
          newNode.createGraphics();
        }

        // Add virtual nodes if needed
        for (let i=0, imax=addedNodes.length; i<imax; ++i) {
          var n = self.nodes.get(addedNodes[i].id);
          var p = n.parent_id ? self.nodes.get(n.parent_id) : null;

          if (n && p && ((n.zdiff < 0 && p.zdiff > 0) || (n.zdiff > 0 && p.zdiff < 0))) {
            var vn = CATMAID.createVirtualNode(self.graphics, n, p, self.stackViewer);
            if (vn) {
              n.parent = vn;
              n.parent_id = vn.id;
              p.addChildNode(vn);
              vn.addChildNode(n);
              self.nodes.set(vn.id, vn);
              addedNodes.push(vn);
              continue;
            }

            // If no virtual node was inserted, link parent and child normally.
            n.parent = p;
            // update the parent's children
            p.addChildNode(n);
          }
        }

        self.redraw();
      });
  };

  /**
   * When we pass a completedCallback to redraw, it's essentially always because
   * we want to know that, if any fetching of nodes was required for the redraw,
   * those nodes have now been fetched.  So, if we *do* need to call updateNodes,
   * we should pass it the completionCallback.  Otherwise, just fire the
   * completionCallback at the end of this method.
   *
   * @params {Bool} skipRendering Whether or not node rendering can be skipped.
   */
  CATMAID.TracingOverlay.prototype.redraw = function(force, completionCallback, skipRendering) {
    var stackViewer = this.stackViewer;

    // Don't udpate if the stack's current section or scale wasn't changed
    var doNotUpdate = stackViewer.old_z === stackViewer.z &&
                      stackViewer.old_s === stackViewer.s &&
                      this.old_z === stackViewer.z;
    if ( doNotUpdate ) {
      var padS = this.applyTracingWindow ? 0 : this.padding / stackViewer.scale;
      // Don't upate if the center didn't move horizontally, but do if
      var dx = this.old_x - stackViewer.x;
      doNotUpdate = dx <= padS && dx >= -padS;

      if ( doNotUpdate ) {
        // Don't upate if the center didn't move certically, but do if
        var dy = this.old_y - stackViewer.y;
        doNotUpdate = dy <= padS && dy >= -padS;
      }

      if (doNotUpdate) {
        // Don't update if the view didn't get higher, but do if
        doNotUpdate = stackViewer.viewWidth <= (this.old_width + 2 * padS);
      }

      if (doNotUpdate) {
        // Don't update if the view got wider, but do if
        doNotUpdate = stackViewer.viewHeight <= (this.old_height + 2 * padS);
      }
    }

    doNotUpdate = !force && (doNotUpdate || this.suspended);

    var screenScale = CATMAID.TracingOverlay.Settings.session.screen_scaling;
    this.paper.classed('screen-scale', screenScale);
    // All graphics elements scale automatcally. If in screen scale mode, where
    // the size of all elements should stay the same (regardless of zoom level),
    // counter acting this is required.
    var dynamicScale = screenScale ? (1 / stackViewer.scale) : false;
    this.graphics.scale(
        CATMAID.TracingOverlay.Settings.session.scale,
        this.stackViewer.primaryStack.minPlanarRes,
        dynamicScale);

    if ( !doNotUpdate ) {
      // If changing scale or slice, remove tagbox.
      SkeletonAnnotations.Tag.removeTagbox();
      this.updateNodes(completionCallback);
    }

    var stackViewBox = stackViewer.createStackViewBox();
    var projectViewBox = stackViewer.primaryStack.createStackToProjectBox(stackViewBox);
    var planeDims = stackViewer.primaryStack.getPlaneDimensions();

    this.pixiLayer.batchContainer.scale.set(stackViewer.pxPerNm());
    this.pixiLayer.batchContainer.position.set(
        -projectViewBox.min[planeDims.x] * stackViewer.pxPerNm(),
        -projectViewBox.min[planeDims.y] * stackViewer.pxPerNm());

    // Use project coordinates for the SVG's view box
    this.paper.attr({
        viewBox: [
            projectViewBox.min[planeDims.x],
            projectViewBox.min[planeDims.y],
            projectViewBox.max[planeDims.x] - projectViewBox.min[planeDims.x],
            projectViewBox.max[planeDims.y] - projectViewBox.min[planeDims.y]].join(' '),
        width: stackViewer.viewWidth,     // Width and height only need to be updated on
        height: stackViewer.viewHeight}); // resize.

    // Make sure a potential tracing window is up-to-date.
    this.updateTracingWindow();

    if (doNotUpdate) {
      if (!skipRendering) {
        this.renderIfReady();
      }
      if (typeof completionCallback !== "undefined") {
        completionCallback();
      }
    }
  };

  CATMAID.TracingOverlay.prototype.renderIfReady = function() {
    if (this.transferFormat == 'gif' || this.transferFormat == 'png') {
      let target = this.pixiLayer.tracingImage;
      if (!target) {
        target = this.pixiLayer.getTracingImage();
      }
      target.src = this.tracingDataUrl;
      target.style.display = 'block';
    } else {
      if (this.pixiLayer.tracingImage) {
        this.pixiLayer.tracingImage.style.display = 'none';
      }
    }
    this.pixiLayer._renderIfReady();
  };

  /**
   * TODO This doc below is obsolete
   * This isn't called "onclick" to avoid confusion - click events aren't
   * generated when clicking in the overlay since the pointerdown and pointerup events
   * happen in different divs.  This is actually called from pointerdown (or pointerup
   * if we ever need to make click-and-drag work with the left hand button too...)
   */
  CATMAID.TracingOverlay.prototype.whenclicked = function (e) {
    if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.MOVE) {
      return false;
    }

    // Ignore this event, if preventDefault() has been called.
    if (e.defaultPrevented) return;

    if (this.ensureFocused()) {
      e.preventDefault();
      return;
    }

    // Only process the click event, if it was targeted at the view of this
    // overlay. The event is not stopped from bubbling up to make it possible to
    // handle at other places. Currently this triggers the activation of the other
    // view.
    if (e.currentTarget !== this.view) {
      return;
    }

    // Make sure we have the most recent coordinates available. The tracing
    // overlay tracks pointer movement, but this function is executed by the
    // tracing tool and depending on the order of how listeners are executed,
    // this function can be first and can't rely on the general location
    // tracking.
    this.setLocationFromEvent(e);

    var m = CATMAID.ui.getMouse(e, this.view, true);

    // Construct an event mocking the actual click that can be passed to the
    // tracing overlay. If it is handled there, do nothing here.
    var mockClick = new PointerEvent('pointerdown', e);
    var handled = !this.pixiLayer.renderer.view.dispatchEvent(mockClick);

    if (!handled) {
      var atn = SkeletonAnnotations.atn;
      var insert = e.altKey && (e.ctrlKey || e.metaKey);
      var link = e.shiftKey;
      var postLink = e.altKey;
      // e.metaKey should correspond to the command key on Mac OS
      var deselect = (!insert && (e.ctrlKey || e.metaKey)) ||
        (insert && (null === atn.id || SkeletonAnnotations.TYPE_NODE !== atn.type));

      if (deselect) {
        if (null !== atn.id) {
          CATMAID.statusBar.replaceLast("Deactivated node #" + atn.id);
        }
        this.activateNode(null);
        handled = true;
      } else {
        if (!CATMAID.mayEdit()) {
          CATMAID.statusBar.replaceLast("You don't have permission.");
          e.preventDefault();
          return;
        }
        handled = this.createNodeOrLink(insert, link, postLink);
      }
    }

    if (handled) {
      e.preventDefault();
      return true;
    }
    return false;
  };

  /**
   * Create a new node or link depending on the passed in flags. Wrap this action
   * and suspend the tracing overlay while the operation runs.
   */
  CATMAID.TracingOverlay.prototype.createNodeOrLink = function(insert, link, postLink) {
    var handled = false;
    // To suspend field of view node updates during/post model creation,
    // individual creation functions store a promise in <create>, after the
    // execution of which the original suspend state is restored again.
    try {
      this.suspended = true;
      var create = this._createNodeOrLink(insert, link, postLink);
      handled = !!create;

      if (create) {
        var reset = (function(error) {
          this.suspended = false;
        }).bind(this);
        var handleError = function(error) {
          reset();
          CATMAID.handleError(error);
        };
        // Reset suspended property, ignoring any errors
        create.then(reset).catch(handleError);
      } else {
        // Expect async behavior only with create promise.
        this.suspended = false;
      }

    } catch (error) {
      // In case of error, reset the original suspend state
      this.suspended = false;
      CATMAID.handleError(error);
    }

    return handled;
  };


  CATMAID.TracingOverlay.prototype.askForConnectorType = function() {
    let self = this;
    return CATMAID.Connectors.linkTypes(project.id)
      .then(function(linkTypes) {
        return new Promise(function(resolve, reject) {
          if (self.connectorTypeMenu) {
            self.connectorTypeMenu.hide();
          }
          // Display connector link type selection UI
          self.connectorTypeMenu = new CATMAID.ContextMenu({
            select: function(selection) {
              resolve({
                relation: selection.item.data.relation,
                value: selection.item.value,
                title: selection.item.title,
              });
            },
            hide: function(selected) {
              self.connectorTypeMenu = null;
              if (!selected) {
                resolve();
              }
            },
            items: linkTypes.map(function(t) {
              return {
                title: t.name,
                value: t.type_id,
                data: {
                  relation: t.relation
                }
              };
            })
          });
          self.connectorTypeMenu.show(true);
        });
      });
  };


  /**
   * Three possible actions can happen: 1. if both insert and link are false, a
   * new node will be appended as child to the active node. 2. if insert is true,
   * a new node will be inserted between the active node and the closest neighbor
   * in this skeleton 3. if link is true, a new connector node will be created, in
   * this case postLink allows to select if if a pre or post synaptic node will be
   * created.
   *
   * If no active node is available, a new node, or (if link is true) connector,
   * is created.
   */
  CATMAID.TracingOverlay.prototype._createNodeOrLink = function(insert, link, postLink) {
    // take into account current local offset coordinates and scale
    var pos_x = this.coords.lastX;
    var pos_y = this.coords.lastY;
    var pos_z = this.stackViewer.z; // or this.phys2pixZ(project.coordinates.z);

    // get physical coordinates for node position creation
    var phys_x = this.stackViewer.primaryStack.stackToProjectX(pos_z, pos_y, pos_x);
    var phys_y = this.stackViewer.primaryStack.stackToProjectY(pos_z, pos_y, pos_x);
    var phys_z = this.stackViewer.primaryStack.stackToProjectZ(pos_z, pos_y, pos_x);

    var targetTreenodeID,
        atn = SkeletonAnnotations.atn;

    // If activated, edit the node radius right after it was created.
    var postCreateFn;
    if (SkeletonAnnotations.Settings.session.set_radius_after_node_creation) {
      // Edit radius without showing the dialog and without centering.
      postCreateFn = function(overlay, node) { overlay.editRadius(node.id, false, true, true); };
    }

    var create = null;

    if (insert) {
      if (null !== atn.id && SkeletonAnnotations.TYPE_NODE === atn.type) {
        // Insert a treenode along an edge on the active skeleton
        var respectVirtualNodes = true;
        this.insertNodeInActiveSkeleton(phys_x, phys_y, phys_z, atn, respectVirtualNodes);
      }
    } else if (link || postLink) {
      if (null === atn.id) {
        if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.SKELETON) {
          throw new CATMAID.Warning("You need to activate a treenode first (skeleton tracing mode)!");
        }
      } else {
        if (SkeletonAnnotations.TYPE_NODE === atn.type) {
          var targetTreenode = this.nodes.get(atn.id);
          var self = this;
          var newConnectorType = SkeletonAnnotations.Settings.session.default_connector_type;

          var createConnector = function(linkType, connectorType, msg) {
            if (SkeletonAnnotations.Settings.session.make_last_connector_type_default) {
              if (SkeletonAnnotations.Settings.session.default_connector_type !== connectorType) {
                SkeletonAnnotations.Settings.set("default_connector_type", connectorType, 'session');
              }
            }
            if (msg) {
              CATMAID.statusBar.replaceLast(msg);
            }
            return self.createSingleConnector(phys_x, phys_y, phys_z, 5, connectorType)
              .then(function (connectorId) {
                return self.createLink(targetTreenode.id, connectorId, linkType);
              });
          };

          if (postLink && !link) {
            create = this.askForConnectorType()
              .then(function(selection) {
                if (selection) {
                  // Create a new custom connector
                  var msg = "Created " + selection.title.toLowerCase() +
                      " connector with treenode #" + atn.id;
                  return createConnector(selection.relation, selection.value, msg);
                }
              });
          } else if (CATMAID.Connectors.SUBTYPE_ABUTTING_CONNECTOR === newConnectorType) {
            // Create a new abutting connection
            create = createConnector("abutting", newConnectorType,
                "Created abutting connector with treenode #" + atn.id);
          } else if (CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR === newConnectorType) {
            // Create a new abutting connection
            create = createConnector("gapjunction_with", newConnectorType,
                "Created gap junction connector with treenode #" + atn.id);
          } else if (CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR === newConnectorType) {
            create = createConnector("tightjunction_with", newConnectorType,
                "Created tight junction connector with treenode #" + atn.id);
          } else if (CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR === newConnectorType) {
            create = createConnector("desmosome_with", newConnectorType,
                "Created desmosome connector with treenode #" + atn.id);
          } else if (CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR === newConnectorType) {
            // Create a new synaptic connector
            var synapseType = postLink ? 'post' : 'pre';
            create = createConnector(synapseType + "synaptic_to", newConnectorType,
                "Created connector with " + synapseType + "synaptic treenode #" + atn.id);
          } else if (CATMAID.Connectors.SUBTYPE_ATTACHMENT_CONNECTOR == newConnectorType) {
            create = createConnector("attached_to", newConnectorType,
                `Created attachment connector for treenode ${atn.id}`);
          } else {
            CATMAID.warn("Unknown connector type selected");
            return Promise.resolve();
          }
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === atn.type) {
          if (CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR === atn.subtype) {
            if (postLink) {
              // create new treenode (and skeleton) presynaptic to activated connector
              CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " presynaptic to active connector");
              create = this.createPresynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5,
                  postCreateFn);
            } else {
              // create new treenode (and skeleton) postsynaptic to activated connector
              CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " postsynaptic to active connector");
              create = this.createPostsynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5,
                  postCreateFn);
            }
          } else if (CATMAID.Connectors.SUBTYPE_ABUTTING_CONNECTOR === atn.subtype) {
            // create new treenode (and skeleton) abutting to activated connector
            CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " abutting to active connector");
            create = this.createTreenodeWithLink(atn.id, phys_x, phys_y, phys_z, -1, 5,
                "abutting", postCreateFn);
          } else if (CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR === atn.subtype) {
            // create new treenode (and skeleton) as a gap junction to activated connector
            CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " with gap junction to active connector");
            create = this.createGapjunctionTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5,
                postCreateFn);
          } else if (CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR === atn.subtype) {
            CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " with tight junction to active connector");
            create = this.createTightjunctionTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5,
                postCreateFn);
          } else if (CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR === atn.subtype) {
            CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " with link to active desmosome connector");
            create = this.createDesmosomeTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5,
                postCreateFn);
          } else if (CATMAID.Connectors.SUBTYPE_ATTACHMENT_CONNECTOR === atn.subtype) {
            // create new treenode (and skeleton) close to to activated connector
            CATMAID.statusBar.replaceLast("Created treenode #" + atn.id + " close to active connector");
            create = this.createTreenodeWithLink(atn.id, phys_x, phys_y, phys_z, -1, 5,
                "close_to", postCreateFn);
          } else {
            CATMAID.warn("Couldn't find matching link type for connector with type " +
                atn.subtype);
            return null;
          }
        }
      }
    } else {
      // depending on what mode we are in do something else when clicking
      if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.SKELETON) {
        if (SkeletonAnnotations.TYPE_NODE === atn.type || null === atn.id) {
          // Wait for the submitter queue before determining the active node,
          // then return the node creation promise so that node creation and its
          // resulting active node change resolve before any other submitter queue
          // items are processed.
          create = this.submit.then((function () {
            // Create a new treenode, either root node if atn is null, or child if
            // it is not null
            if (null !== SkeletonAnnotations.atn.id) {
              var self = this;
              return new Promise(function (resolve, reject) {
                // Make sure the parent exists
                SkeletonAnnotations.atn.promise()
                  .then(function(atnId) {
                    CATMAID.statusBar.replaceLast("Created new node as child of node #" + atnId);
                    self.createNode(atnId, null, phys_x, phys_y, phys_z, -1, 5, postCreateFn)
                      .then(resolve, reject);
                  }).catch(function(error) {
                    reject();
                    CATMAID.handleError(error);
                  });
              });
            } else {
              // Create root node
              return this.createNode(null, null, phys_x, phys_y, phys_z, -1, 5, postCreateFn);
            }
          }).bind(this)).promise();
        } else if (CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR === atn.subtype) {
          // create new treenode (and skeleton) presynaptic to activated connector
          // if the connector doesn't have a presynaptic node already
          create = this.createPresynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5, postCreateFn);
        } else {
          return null;
        }
      } else if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.SYNAPSE) {
        // only create single synapses/connectors
        create = this.createSingleConnector(phys_x, phys_y, phys_z, 5,
            SkeletonAnnotations.Settings.session.default_connector_type);
      }
    }

    return create;
  };

  /**
   * Obtain the effective level of detail value.
   */
  CATMAID.TracingOverlay.prototype.getEffectiveLOD = function() {
    if (this.levelOfDetailMode === 'absolute') {
      return this.levelOfDetail;
    } else if (this.levelOfDetailMode === 'adaptive') {
      let zoomRange = CATMAID.TracingOverlay.Settings.session.adaptive_lod_scale_range;

      // Determine percentage of current zoom level within zoom level bounds.
      let zoomPercent = this.stackViewer.s / this.stackViewer.primaryStack.MAX_S;

      // Clamp zoom percentage to zoom range and and get ratio of the clamped zoom
      // percentage value relative to the zoom range.
      zoomPercent = Math.max(zoomRange[0], Math.min(zoomRange[1], zoomPercent));

      // Get the inverse percentage, because we want to express a percentage where
      // 0% means lowest LOD and 100% is the highest LOD. If we are zoomed out
      // further, the LOD will be smaller.
      return 1.0 -  (zoomPercent - zoomRange[0]) / (zoomRange[1] - zoomRange[0]);
    } else if (this.levelOfDetailMode === 'mapping') {
      let mapping = CATMAID.TracingOverlay.Settings.session.lod_mapping;
      if (!mapping || mapping.length === 0) {
        return 1;
      }
      // Find first closest zoom levels to the current one.
      let zoom = this.stackViewer.s;
      let smallerEntry, exactEntry, largerEntry;
      for (let i=0; i<mapping.length; ++i) {
        if (mapping[i][0] === zoom) {
          exactEntry = mapping[i];
        } else if (mapping[i][0] < zoom) {
          smallerEntry = smallerEntry === undefined ? mapping[i] :
              (mapping[i][0] < smallerEntry[0] ? smallerEntry : mapping[i]);
        } else if (mapping[i][0] > zoom) {
          largerEntry = largerEntry === undefined ? mapping[i] :
              (mapping[i][0] > largerEntry[0] ? largerEntry : mapping[i]);
        }
      }
      if (exactEntry !== undefined) {
        return exactEntry[1];
      }
      if (smallerEntry && largerEntry) {
        return (smallerEntry[1] + largerEntry[1]) / 2.0;
      } else if (smallerEntry) {
        return smallerEntry[1];
      } else if (largerEntry) {
        return largerEntry[1];
      } else {
        return 1.0;
      }
    } else {
      throw new CATMAID.ValueError("Unknown LOD mode: " + this.levelOfDetailMode);
    }
  };

  /**
   * If there is an active node and the current location is above an existing node
   * of another skeleton, both skeletons are joined at those nodes (if permissions
   * allow) if link is true. If link is not true, the other node will be selected.
   * Alternatively, if the current location is in free space, three possible
   * actions can happen: 1. if both insert and link are false, a new node will be
   * appended as child to the active node. 2. if insert is true, a new node will
   * be inserted between the active node and the closest neighbor in this skeleton
   * 3. if link is true, a new connector node will be created, in this case
   * postLink allows to select if if a pre or post synaptic node will be created.
   *
   * If no active node is available, a new node, or (if link is true) connector,
   * is created.
   */
  CATMAID.TracingOverlay.prototype.createNewOrExtendActiveSkeleton =
      function(insert, link, postLink) {
    // Check if there is already a node under the pointer
    // and if so, then activate it
    var atn = SkeletonAnnotations.atn;
    if (this.coords.lastX !== null && this.coords.lastY !== null) {
      // Choose a search radius that is the scaled selection radius for nodes
      var searchRadius = this.graphics.Node.prototype.CATCH_RADIUS *
         this.graphics.Node.prototype.stackScaling;
      var respectVirtualNodes = true;
      var nearestnode = this.getClosestNode(this.coords.lastX,
                                            this.coords.lastY,
                                            this.stackViewer.z,
                                            searchRadius,
                                            respectVirtualNodes);
      if (nearestnode === null) {
        // Crate a new treenode, connector node and/or link
        this.createNodeOrLink(insert, link, postLink);
      } else if (link) {
        if (null === atn.id) { return; }
        if (nearestnode.skeleton_id === atn.skeleton_id) {
          this.activateNode(nearestnode.node);
          return;
        }
        var nearestnode_id = nearestnode.id;
        var nearestnode_skid = nearestnode.skeleton_id;
        var atn_skid = atn.skeleton_id;

        // Join both skeletons
        this.createTreenodeLink(atn.id, nearestnode.id);
      } else {
        // Activate node at current location if no link is requested
        this.activateNode(nearestnode.node);
      }
    }
  };

  CATMAID.TracingOverlay.prototype.show = function () {
    this.view.style.display = "block";
  };

  CATMAID.TracingOverlay.prototype.hide = function () {
    this.view.style.display = "none";
  };

  /**
   * A wrapper around updateNodes without arguments that can be passed around
   * easier.
   */
  CATMAID.TracingOverlay.prototype.simpleUpdateNodes = function () {
    this.updateNodes();
  };

  function parseNodeResponse(data, transferFormat) {
    let response;
    try {
      if (transferFormat === 'msgpack') {
        response = msgpack.decode(new Uint8Array(data));
      } else if (transferFormat === 'png' || transferFormat == 'gif') {
        response = new Uint8Array(data);
      } else {
        response = JSON.parse(data);
      }
    } catch(e) {
      response = JSON.parse(data);
    }

    // Validate
    if (!response) {
      throw new CATMAID.ValueError("Couldn't parse response");
    }

    return response;
  }

  /**
   * Update treeline nodes by querying them from the server with the bounding
   * volume of the current view. Will also push editions (if any) to nodes to the
   * database.
   */
  CATMAID.TracingOverlay.prototype.updateNodes = function (callback,
      futureActiveNodeID, errCallback) {
    var self = this;

    if (this.suspended) {
      return;
    }

    this.updateNodeCoordinatesInDB(function () {
      // Bail if the overlay was destroyed or suspended before this callback.
      if (self.suspended) {
        return;
      }

      // Disable non-standard headers to avoid CORS preflight requests for
      // tracign data mirrors.
      let headers = {
        'X-Requested-With': undefined,
      };

      // Normally, all nodes are fetched in one go. In certain caching
      // situations or when a read-only mirror is used, the active skeleton is
      // fetched separately in a separate request to ensure most recent data.
      let dedicatedActiveSkeletonUpdate = false;

      let mainUrl = CATMAID.makeURL(project.id + '/node/list');
      let url = mainUrl;
      // If there is a read-only mirror defined, get all nodes from there and
      // do an extra query for the active node from the regular back-end.
      let mirrorIndex = CATMAID.TracingOverlay.Settings.session.read_only_mirror_index;
      if (mirrorIndex > -1) {
        let mirrorServer = CATMAID.TracingOverlay.Settings.session.read_only_mirrors[mirrorIndex - 1];
        if (mirrorServer) {
          dedicatedActiveSkeletonUpdate = true;
          url = CATMAID.tools.urlJoin(mirrorServer.url, project.id + '/node/list');
          if (mirrorServer.auth && mirrorServer.auth.trim().length > 0) {
            headers = {
              'X-Authorization': mirrorServer.auth,
            };
          }
        }
      }

      var treenodeIDs = [];
      var connectorIDs = [];
      var extraNodes;
      var activeNodeId = SkeletonAnnotations.getActiveNodeId();
      if (activeNodeId) {
        var activeNodeType = SkeletonAnnotations.getActiveNodeType();
        if (activeNodeType === SkeletonAnnotations.TYPE_NODE) {
          var extraTreenodeId = futureActiveNodeID ? futureActiveNodeID : activeNodeId;
          // If the active node is virtual, explicitly request both the child
          // and parent from the backend and inject the virtual node into the
          // result.
          if (SkeletonAnnotations.isRealNode(extraTreenodeId)) {
            treenodeIDs.push(extraTreenodeId);
          } else {
            treenodeIDs.push(
              SkeletonAnnotations.getChildOfVirtualNode(extraTreenodeId),
              SkeletonAnnotations.getParentOfVirtualNode(extraTreenodeId));
            var n = self.nodes.get(activeNodeId);
            if (n) {
              extraNodes = [{
                id: n.id,
                parent_id: n.parent_id,
                radius: n.radius,
                x: n.x,
                y: n.y,
                z: n.z,
                confidence: n.confidence,
                skeleton_id: n.skeleton_id,
                user_id: n.user_id,
                edition_time: n.edition_time
              }];
            }
          }
        } else if (activeNodeType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
          connectorIDs.push(activeNodeId);
        }
      }

      // stackViewer.viewWidth and .viewHeight are in screen pixels, so they must
      // be scaled and then transformed to nanometers and stackViewer.x, .y are in
      // absolute pixels, so they also must be brought to nanometers
      var stackViewer = self.stackViewer;
      self.old_x = stackViewer.x;
      self.old_y = stackViewer.y;
      self.old_z = stackViewer.z;
      self.old_width = stackViewer.viewWidth;
      self.old_height = stackViewer.viewHeight;

      // As regular transfer is considered what transfers vector data.
      var regularTransfer = self.transferFormat == 'json' || self.transferFormat == 'msgpack';

      // No padding for image data
      var padding = regularTransfer ? self.padding : 0;

      // And no padding if boundary masks are applied
      var hPadding = self.tracingWindowWidth > 0 && self.applyTracingWindow ?
          - ((stackViewer.viewWidth / 2) - self.tracingWindowWidth / 2) : padding;
      var vPadding = self.tracingWindowHeight > 0 && self.applyTracingWindow ?
          - ((stackViewer.viewHeight / 2) - self.tracingWindowHeight / 2) : padding;

      var paddedHalfWidth =  (stackViewer.viewWidth  / 2 + hPadding) / stackViewer.scale,
          paddedhalfHeight = (stackViewer.viewHeight / 2 + vPadding) / stackViewer.scale;

      var x0 = stackViewer.x - paddedHalfWidth,
          y0 = stackViewer.y - paddedhalfHeight,
          z0 = stackViewer.z;

      var x1 = stackViewer.x + paddedHalfWidth,
          y1 = stackViewer.y + paddedhalfHeight,
          z1 = stackViewer.z + 1.0;

      var wx0 = stackViewer.primaryStack.stackToProjectX(z0, y0, x0),
          wy0 = stackViewer.primaryStack.stackToProjectY(z0, y0, x0),
          wz0 = stackViewer.primaryStack.stackToProjectZ(z0, y0, x0);

      var wx1 = stackViewer.primaryStack.stackToProjectX(z1, y1, x1),
          wy1 = stackViewer.primaryStack.stackToProjectY(z1, y1, x1),
          wz1 = stackViewer.primaryStack.stackToProjectZ(z1, y1, x1);


      // Get level of detail information, which some back-end node providers
      // (namely caching ones) can use to return only a subset of the data.
      let percentLOD = self.levelOfDetailMode !== 'absolute';
      let effectiveLOD = self.getEffectiveLOD();

      // As long as stack space Z coordinates are always clamped to the last
      // section (i.e. if floor() is used instead of round() when transforming),
      // there is no need to compensate for rounding mismatches of stack view's
      // discrete Z coordinates (sections). Otherwise, the stack viewer's position
      // could get larger than the project space position. And this would require
      // to lower the bounding box's minimum by that difference to have all views
      // show the same nodes.
      let params = {
        left: wx0,
        top: wy0,
        z1: wz0,
        right: wx1,
        bottom: wy1,
        z2: wz1,
        labels: self.getLabelStatus(),
        with_relation_map: self.relationMap ? 'none' : 'all',
        lod: effectiveLOD,
        lod_type: percentLOD ? 'percent' : 'absolute',
      };

      // Extra treenode IDs and connector Ids are only fetched through the primary
      // query, if no dedicated quert for the active node is performed.
      if (!dedicatedActiveSkeletonUpdate) {
        params['treenode_ids'] = treenodeIDs;
        params['connector_ids'] = connectorIDs;
      }

      let transferFormat = self.transferFormat;
      let binaryTransfer = transferFormat != 'json';
      if (transferFormat) {
        params['format'] = transferFormat;
      }

      if (self.nLargestSkeletonsLimit > 0) {
        params['n_largest_skeletons_limit'] = self.nLargestSkeletonsLimit;
      }

      if (self.nLastEditedSkeletonLimit > 0) {
        params['n_last_edited_skeletons_limit'] = self.nLastEditedSkeletonLimit;
      }

      if (self.hiddenLastEditorId && self.hiddenLastEditorId !== 'none') {
        params['hidden_last_editor_id'] = self.hiddenLastEditorId;
      }

      if (self.minSkeletonLength && self.minSkeletonLength > 0) {
        params['min_skeleton_length'] = self.minSkeletonLength;
      }

      if (self.minSkeletonNodes && self.minSkeletonNodes > 0) {
        params['min_skeleton_nodes'] = self.minSkeletonNodes;
      }

      if (self.nodeProviderOverride && self.nodeProviderOverride !== 'none') {
        params['src'] = self.nodeProviderOverride;
      }

      // Check the node list cache for an exactly matching request. Only request
      // from the backend if not found.
      var paramsKey = JSON.stringify(params);

      // Allow multiple parallel requests within one submit() entry, collect
      // them in array <requests>.
      let work = self.submit.then(() => {
          let requests = [];
          let extraUpdate = dedicatedActiveSkeletonUpdate &&
              (treenodeIDs.length > 0 || connectorIDs.length > 0);

          if (regularTransfer) {
            var json = self.nodeListCache.get(paramsKey);

            // Special case: allow fast sub-views of a previous view (e.g. when zooming
            // in and back out) based on cached data. If no exact matching node list
            // cache entry was found, try to find a cache entry that encloses the
            // current request bounding box and that didn't have any nodes dropped.
            var subviewsFromCache = CATMAID.TracingOverlay.Settings.session.subviews_from_cache;
            if (subviewsFromCache && !json) {
              json = self.createSubViewNodeListFromCache(params);
            }

            // Finally, if a cache entry was found, use it and update the active node,
            // if any.
            if (json) {
              dedicatedActiveSkeletonUpdate = true;
              requests.push(Promise.resolve(json));
            } else {
              self.tracingDataUrl = url + '?' + CATMAID.RequestQueue.encodeObject(params);
              requests.push(CATMAID.fetch({
                absoluteURL: url,
                method: 'GET',
                data: params,
                blockUI: false,
                replace: true,
                errCallback: errCallback,
                quiet: false,
                id: 'stack-' + self.stackViewer.getId() + '-url-' + url,
                raw: true,
                responseType: binaryTransfer ? 'arraybuffer' : undefined,
                headers: headers,
                details: true,
                parallel: extraUpdate,
              }).then(function(r) {
                // Parse response
                let response = parseNodeResponse(r.data, transferFormat);

                if (!response.error) {
                  // Add to cache
                  self.nodeListCache.set(paramsKey, response, r.dataSize);
                }

                return response;
              }));
            }
          } else {
            params['view_width'] = stackViewer.viewWidth;
            params['view_height'] = stackViewer.viewHeight;
            self.tracingDataUrl = url + '?' + CATMAID.RequestQueue.encodeObject(params);
            requests.push(Promise.resolve([
                [],
                [],
                {},
                false,
                {}
              ]));
          }

          // Before updating the internal node representation, update the active
          // node, if this is required.
          if (extraUpdate) {
            // TODO: To authenticate with the mirror server, an API token needs to
            // be specified.
            let extraParams = CATMAID.tools.deepCopy(params);
            extraParams['src'] = 'extra_nodes_only';
            extraParams['treenode_ids'] = treenodeIDs;
            extraParams['connector_ids'] = connectorIDs;
            extraParams['format'] = 'json';
            // To not query all nodes in the field of view, update the parameter
            // object
            requests.push(CATMAID.fetch({
                relativeURL: mainUrl,
                method: 'GET',
                data: extraParams,
                blockUI: false,
                replace: true,
                errCallback: errCallback,
                quiet: false,
                id: 'stack-' + self.stackViewer.getId() + '-url-' + url,
                raw: true,
                details: true,
                parallel: true,
              }).then(function(r) {
                // Parse response
                return parseNodeResponse(r.data, transferFormat);
              }));
          }

          return Promise.all(requests);
        })
        .then(function(responses) {
          // Bail if the overlay was destroyed or suspended before this callback.
          if (self.suspended) {
            return;
          }

          if (!responses || responses.length === 0) {
            CATMAID.warn("No tracing data responses");
            return;
          }

          // The final response builds on the main response.
          let response = responses[0];

          if (response.error) {
            if (response.error === 'REPLACED') {
              return;
            } else {
              throw new CATMAID.ValueError("Unexpected response: " + response);
            }
          }

          // Add extra data, if any
          if (responses.length > 1) {
            for (let i=1; i<responses.length; ++i) {
              let extraData = responses[i];
              // Call success() again, but now with dedicatedActiveSkeletonUpdate
              // set to false, so the actual update can happen, and with json
              // being the original response from the read-only mirror. This id
              // done by adding (or creating) an extra data
              let originalExtraData = response[5];
              if (!originalExtraData) {
                originalExtraData = [];
                response[5] = originalExtraData;
              }
              originalExtraData.push(extraData);

              // Indicate no extra call is needed anymore
              dedicatedActiveSkeletonUpdate = false;
            }
          }

          // If there is no relation map cached yet and also none was returned,
          // inject retrieval of relation map
          let wrapUp;
          if (!self.relationMap && (!response[4] || CATMAID.tools.isEmpty(response[4]))) {
            wrapUp = CATMAID.Relations.getNameMap(project.id, false)
              .then(function(map) {
                self.relationMap = map;
                return response;
              });
          } else {
            wrapUp = Promise.resolve(response);
          }

          wrapUp.then(function(response) {
            var renderingQueued = self.refreshNodesFromTuples(response, extraNodes);

            // initialization hack for "URL to this view"
            var nodeSelected = false;
            if (SkeletonAnnotations.hasOwnProperty('init_active_node_id')) {
              nodeSelected = true;
              self.activateNode(self.nodes.get(SkeletonAnnotations.init_active_node_id));
              delete SkeletonAnnotations.init_active_node_id;
            }
            if (SkeletonAnnotations.hasOwnProperty('init_active_skeleton_id')) {
              if (!nodeSelected) {
                SkeletonAnnotations.staticMoveToAndSelectClosestNode(project.coordinates.x,
                    project.coordinates.y, project.coordinates.z,
                    SkeletonAnnotations.init_active_skeleton_id, true);
              }
              delete SkeletonAnnotations.init_active_skeleton_id;
            }

            self.redraw(false, callback, renderingQueued);
          });
        });

      // Return a proper promise to the caller (i.e. no submitter instance).
      return work.promise();
    });
  };

  CATMAID.TracingOverlay.prototype.createSubViewNodeListFromCache = function(params) {
    var nodeList = null;
    var self = this;
    this.nodeListCache.forEachEntry(function(entry) {
      // Ignore entry if it doesn't contain all nodes for section. Don't use
      // the cache's get() function, because it will keep each accessed entry
      // in the cache longer. Use get() only once we know we can use the
      // entry.
      let incomplete = entry.value[3];
      if (incomplete) {
        return;
      }
      // Check if the entry encloses the current request bounding box.
      let entryParams = JSON.parse(entry.key);
      let entryEnclosesRequest =
          entryParams.left <= params.left &&
          entryParams.right >= params.right &&
          entryParams.top <= params.top &&
          entryParams.bottom >= params.bottom &&
          entryParams.z1 <= params.z1 &&
          entryParams.z2 >= params.z2 &&
          entryParams.lod == params.lod;
      // Only allow cached entries that either require no extra treenodes or
      // connectors or have matching extra nodes.
      let extraNodesMatch =
          (!params.connector_ids ||
              CATMAID.tools.arraysEqual(entryParams.connector_ids, params.connector_ids)) &&
          (!params.treenode_ids ||
              CATMAID.tools.arraysEqual(entryParams.treenode_ids, params.treenode_ids));

      if (entryEnclosesRequest && extraNodesMatch &&
          entryParams.labels === params.labels) {
        var cachedJson = self.nodeListCache.get(entry.key);
        if (!cachedJson) {
          // This can happen if the entry just turned invalid due to lifetime
          // constraints.
          return;
        }
        // Use cached entry if there was no hit yet or the cached version is
        // smaller.
        var cachedLength = cachedJson[0].length + cachedJson[1].length;
        if (!nodeList || cachedLength < (nodeList[0].length + nodeList[1].length)) {
          nodeList = cachedJson;
        }
      }
    });

    return nodeList;
  };

  /**
   * Set the confidence of the edge partig from the active node towards either the
   * parent or a connector. If there is more than one connector, the confidence is
   * set to all connectors.
   */
  CATMAID.TracingOverlay.prototype.setConfidence = function(newConfidence, toConnector) {
    var nodeID = SkeletonAnnotations.getActiveNodeId();
    if (!nodeID) return;
    var node = this.nodes.get(nodeID);
    if (!node || SkeletonAnnotations.TYPE_NODE !== node.type) {
      return;
    }
    if (node.parent_id || toConnector) {
      var self = this;
      this.promiseNode(node).then(function(nid) {
        return self.submit().then(function() {
          CATMAID.commands.execute(new CATMAID.UpdateConfidenceCommand(
                self.state, project.id, nid, newConfidence, toConnector))
            .then(self.updateNodes.bind(self, undefined, undefined, undefined))
            .catch(CATMAID.handleError);
        });
      });
    }
  };

  /**
   * Test if a node ID properly defined.
   *
   * @nodeID The ID to test
   * @return false if the nodeID is falsy, true otherwise
   */
  CATMAID.TracingOverlay.prototype.isIDNull = function(nodeID) {
    if (!nodeID) {
      CATMAID.info("Select a node first!");
      return true;
    }
    return false;
  };

  /**
   * Move to the previous branch point or the root node, if former is not
   * available. If the treenode is virtual, it's real child is used instead.
   */
  CATMAID.TracingOverlay.prototype.goToPreviousBranchOrRootNode = function(treenode_id, e) {
    if (this.isIDNull(treenode_id)) return;
    if (!SkeletonAnnotations.isRealNode(treenode_id)) {
      // Use child of virtual node, to make sure a branch before the virtual node
      // is seen.
      treenode_id = SkeletonAnnotations.getChildOfVirtualNode(treenode_id);
    }
    var self = this;
    this.submit.promise()
      .then(function() {
        return CATMAID.fetch(project.id + "/treenodes/" +
          treenode_id + "/previous-branch-or-root", 'POST', {
            alt: e.altKey ? 1 : 0
          });
      })
      .then(function(json) {
        // json is a tuple:
        // json[0]: treenode id
        // json[1], [2], [3]: x, y, z in calibrated world units
        if (treenode_id === json[0]) {
          // Already at the root node
          CATMAID.msg('Already there', 'You are already at the root node');
          // Center already selected node
          return self.moveTo(json[3], json[2], json[1]);
        } else {
          return self.moveTo(json[3], json[2], json[1])
            .then(function() {
              return self.selectNode(json[0], json[4])
                .catch(CATMAID.handleError);
            });
        }
      });
  };

  /**
   * Move to the next branch point or end node, if former is not available. If the
   * treenode is virtual, it's real parent is used instead. Pressing shift will
   * cause cylcing though all branches.
   */
  CATMAID.TracingOverlay.prototype.goToNextBranchOrEndNode = function(treenode_id, e) {
    if (this.isIDNull(treenode_id)) return;
    if (!SkeletonAnnotations.isRealNode(treenode_id)) {
      // Use parent of virtual node, to make sure a branch after the virtual node
      // is seen.
      treenode_id = SkeletonAnnotations.getParentOfVirtualNode(treenode_id);
    }
    var branchIndex = e.altKey ? 1 : 2;
    if (e.shiftKey && this.hasCachedBranches(branchIndex)) {
      this.cycleThroughBranches(treenode_id, branchIndex, true);
    } else {
      var self = this;
      this.submit.promise()
        .then(function() {
          return CATMAID.fetch(project.id + "/treenodes/" +
            treenode_id + "/next-branch-or-end", 'POST');
        })
        .then(function(json) {
          // json is an array of branches
          // each branch is a tuple:
          // [child head of branch, first node of interest, first branch or leaf]
          // each node is a tuple:
          // node[0]: treenode id
          // node[1], [2], [3]: x, y, z in calibrated world units
          if (json.length === 0) {
            // Already at a branch or end node
            CATMAID.msg('Already there', 'You are at an end node');
            // Center already selected node
            var atn = SkeletonAnnotations.atn;
            if (atn) {
              return self.goToNode(atn.id);
            }
          } else {
            self.cacheBranches(treenode_id, json);
            return self.cycleThroughBranches(null, branchIndex, true);
          }
        });
    }
  };

  /**
   * Select alternative branches to the currently selected one
   */
  CATMAID.TracingOverlay.prototype.cycleThroughBranches = function (
      treenode_id, node_index, ignoreVirtual) {
    if (typeof this.nextBranches === 'undefined') return Promise.reject("No branch information found");

    // Find branch of which treenode_id is part
    var referenceNodeID;
    if (null !== treenode_id) {
      referenceNodeID = SkeletonAnnotations.isRealNode(treenode_id) ?
        treenode_id : SkeletonAnnotations.getChildOfVirtualNode(treenode_id);
      referenceNodeID = parseInt(referenceNodeID, 10);
    }
    var currentBranch = this.nextBranches.branches.map(function (branch) {
      return branch.some(function (node) { return node[0] === referenceNodeID; });
    }).indexOf(true);

    // Cycle through branches. If treenode_id was not in the branch nodes (such as
    // when first selecting a branch), currentBranch will be -1, so the following
    // line will make it 0 and still produce the desired behavior.
    currentBranch = (currentBranch + 1) % this.nextBranches.branches.length;

    var branch = this.nextBranches.branches[currentBranch];
    var node = branch[node_index];

    // If virtual nodes should be respected, jump to the next section. Otherwise,
    // move to the child node (which might not be on the next section).
    if (ignoreVirtual) {
      return this.moveTo(node[3], node[2], node[1], this.selectNode.bind(this, node[0]));
    } else {
      return this.moveToNodeOnSectionAndEdge(node[0], this.nextBranches.tnid, true, true);
    }
  };

  /**
   * Move to the parent node of the given node. Usually, this is the node at the
   * intersection between the the skeleton of the given node and the section
   * towards its parent. If this happens to be a real node, the real node is
   * loaded (if required) and selected, otherwise, a virtual node is selected.
   * Optionally, the selection of virtual nodes can be disabled. This might cause
   * a jump to a location that is farther away than one section.
   */
  CATMAID.TracingOverlay.prototype.goToParentNode = function(treenode_id, ignoreVirtual) {
    if (treenode_id === null || treenode_id === undefined) {
      return Promise.reject(new CATMAID.Warning("No treenode to select provided"));
    }

    // Find parent of node
    var parentID;
    if (SkeletonAnnotations.isRealNode(treenode_id)) {
      var node = this.nodes.get(treenode_id);
      if (!node) {
        var msg = "Could not find node with id #" + treenode_id;
        return Promise.reject(new CATMAID.Warning(msg));
      }
      if (node.type === SkeletonAnnotations.TYPE_CONNECTORNODE) {
        var msg = "Connector nodes do not have parent nodes";
        return Promise.reject(new CATMAID.Warning(msg));
      }
      if (null === node.parent_id) {
        var msg = "This is the root node, can't move to its parent";
        return Promise.reject(new CATMAID.Warning(msg));
      }
      parentID = node.parent_id;
    } else {
      parentID = SkeletonAnnotations.getParentOfVirtualNode(treenode_id);
    }

    if (ignoreVirtual) {
      return this.moveToAndSelectNode(parentID);
    } else {
      // Move to clostest node on section after the current node in direction of
      // parent node (which may be the parent node or a virtual node).
      return this.moveToNodeOnSectionAndEdge(treenode_id, parentID, true, false);
    }
  };

  /**
   * Select either the node stored in nextBranches or, if this is not available,
   * the next branch or end node is fetched from the back end. Uses the tracing
   * overlay children information, if available.
   *
   * @param {number} treenode_id - The node of which to select the child
   * @param {boolean} cycle - If true, subsequent calls cycle through children
   */
  CATMAID.TracingOverlay.prototype.goToChildNode = function (treenode_id, cycle, ignoreVirtual) {
    if (this.isIDNull(treenode_id)) return Promise.reject("No valid node provided");

    // If the existing nextBranches was fetched for this treenode, reuse it to
    // prevent repeated queries when quickly alternating between child and parent.
    if (cycle || this.hasCachedBranches(0, treenode_id)) {
      return this.cycleThroughBranches(treenode_id, 0, ignoreVirtual);
    } else {
      var self = this;
      var startFromRealNode = SkeletonAnnotations.isRealNode(treenode_id);
      // If we deal with a virtual node, get next branch and interesting node for
      // parent. All result nodes will be after the virtual node.
      var queryNode = startFromRealNode ? treenode_id :
          SkeletonAnnotations.getParentOfVirtualNode(treenode_id);

      // Don't fetch children from back-end if node is already known and is on
      // current section (where it is expected that all children area available).
      var knownNode = this.nodes.get(treenode_id);
      if (knownNode && knownNode.zdiff === 0) {
        return new Promise(function(resolve, reject) {
          // Fill branch cache
          var stack = self.stackViewer.primaryStack;
          var branchData = Array.from(knownNode.children.keys()).map(function(childId) {
            var child = knownNode.children.get(childId);
            return [[parseInt(childId), child.x, child.y, child.z]];
          });
          if (branchData.length === 0) {
            // Already at a branch or end node
            CATMAID.msg('Already there', 'You are at an end node');
            resolve();
          } else {
            self.cacheBranches(treenode_id, branchData);
            self.cycleThroughBranches(null, 0, ignoreVirtual)
              .then(resolve)
              .catch(reject);
          }
        });
      } else {
        return new Promise(function(resolve, reject) {
          self.submit(
              CATMAID.makeURL(project.id + "/treenodes/" + queryNode + "/children"),
              'POST',
              undefined,
              function(json) {
                // See goToNextBranchOrEndNode for JSON schema description.
                if (json.length === 0) {
                  // Already at a branch or end node
                  CATMAID.msg('Already there', 'You are at an end node');
                  resolve();
                } else {
                  // In case of a virtual node, we need to filter the returned array
                  // to only include the branch that contains the virtual node.
                  if (!startFromRealNode) {
                    var childID = parseInt(SkeletonAnnotations.getChildOfVirtualNode(treenode_id), 10);
                    json = json.filter(function(b) { return b[0][0] === childID; });
                  }
                  self.cacheBranches(treenode_id, json);
                  self.cycleThroughBranches(null, 0, ignoreVirtual)
                    .then(resolve)
                    .catch(reject);
                }
              },
              undefined,
              undefined,
              reject);
        });
      }
    }
  };

  /**
   * Stores child nodes of a treenode in a local cache.
   */
  CATMAID.TracingOverlay.prototype.cacheBranches = function(treenode_id, branches) {
    this.nextBranches = {tnid: treenode_id, branches: branches};
  };

  /**
   * Predicate for whether the requested branch index type is in the branch cache,
   * optionally checking the originating node ID for the branch information.
   * @param  {number}  index       0 for child, 1 for node of interest, 2 for next
   *                               branch.
   * @param  {number=} treenode_id Originating node for the branch information.
   * @return {Boolean}             Whether the requested branch information is
   *                               cached.
   */
  CATMAID.TracingOverlay.prototype.hasCachedBranches = function (index, treenode_id) {
    return this.nextBranches && // Branches are cached
        // Requested index is in cache
        this.nextBranches.branches.length && this.nextBranches.branches[0][index] &&
        // Branches are for the correct treenode, if given.
        (!treenode_id || this.nextBranches.tnid === treenode_id);
  };

  /**
   * Lets the user select a radius around a node with the help of a small
   * measurement tool, passing the selected radius to a callback when finished.
   */
  CATMAID.TracingOverlay.prototype.selectRadius = function(treenode_id, no_centering, completionCallback) {
    if (this.isIDNull(treenode_id)) return;
    var self = this;
    // References the original node the selector was created for
    var originalNode;
    var originalStackZ;
    var stackToProject = self.stackViewer.primaryStack.stackToProject.bind(self.stackViewer.primaryStack);

    if (no_centering) {
      toggleMeasurementTool();
    } else {
      this.goToNode(treenode_id, toggleMeasurementTool);
    }

    function verifyNode(treenode_id) {
      var node = self.nodes.get(treenode_id);
      if (!node || node !== originalNode) {
        // This can happen if e.g. the section was changed and all nodes were
        // updated.
        CATMAID.warn('Canceling radius editing, because the edited node ' +
            'cannot be found anymore or has changed.');
        return false;
      }
      return node;
    }

    function toggleMeasurementTool() {
      // Keep a reference to the original node
      originalNode = self.nodes.get(treenode_id);
      originalStackZ = self.stackViewer.primaryStack.projectToStackZ(
          originalNode.z, originalNode.y, originalNode.x);
      // Only allow radius edits of treenodes
      if (!(originalNode && originalNode.type === 'treenode')) {
        CATMAID.warn('Can only edit radius of treenodes');
        return;
      }

      // If there was a measurement tool based radius selection started
      // before, stop this.
      if (originalNode.surroundingCircleElements) {
        hideCircleAndCallback();
      } else {
        // Block location changes while selecting a radius
        self.pixiLayer.blockLocationChange = true;

        originalNode.drawSurroundingCircle(false, toStack, stackToProject,
            hideCircleAndCallback);
        // Attach a handler for the ESC key to cancel selection
        $('body').on('keydown.catmaidRadiusSelect', function(event) {
          if ('Escape'  === event.key) {
            // Allow location changes again
            self.pixiLayer.blockLocationChange = false;
            // Unbind key handler and remove circle
            $('body').off('keydown.catmaidRadiusSelect');
            originalNode.removeSurroundingCircle();
            return true;
          } else if ('Enter' === event.key) {
            hideCircleAndCallback();
            return true;
          }
          return false;
        });
      }

      function hideCircleAndCallback()
      {
        // Allow location changes again
        self.pixiLayer.blockLocationChange = false;

        // Unbind key handler
        $('body').off('keydown.catmaidRadiusSelect');
        var node = verifyNode(treenode_id);
        if (!node) {
          // Remove circle from node we originally attached to and cancel, if no
          // node for the given ID was found.
          originalNode.removeSurroundingCircle();
        } else {
          // Remove circle and call callback
          node.removeSurroundingCircle(function(rx, ry, rz) {
            if (typeof rx === 'undefined' || typeof ry === 'undefined') {
              completionCallback(undefined);
              return;
            }
            var pr = Math.round(Math.sqrt(Math.pow(rx, 2) + Math.pow(ry, 2) + Math.pow(rz, 2)));
            // Callback with the selected radius
            completionCallback(pr);
          });
        }
      }

      /**
       * Transform a layer coordinate into stack space.
       */
      function toStack(r)
      {
        var scaleX = 1 / (self.stackViewer.scale * self.stackViewer.primaryStack.anisotropy(0).x);
        var scaleY = 1 / (self.stackViewer.scale * self.stackViewer.primaryStack.anisotropy(0).y);
        var offsetX = self.stackViewer.x - self.stackViewer.viewWidth * scaleX / 2;
        var offsetY = self.stackViewer.y - self.stackViewer.viewHeight * scaleY / 2;
        return {
          x: r.x * scaleX + offsetX,
          y: r.y * scaleY + offsetY,
          z: originalStackZ  // Use an unchanging Z so that stack Z distance is ignored.
        };
      }
    }
  };

  /**
   * Shows a dialog to edit the radius property of a node. By default, it also
   * lets the user estimate the radius with the help of a small measurement tool,
   * which can be disabled by setting the no_measurement_tool parameter to true.
   * If the measurement tool is used, the dialog display can optionally be
   * disabled
   */
  CATMAID.TracingOverlay.prototype.editRadius = function(treenode_id, no_measurement_tool, no_centering, no_dialog) {
    if (this.isIDNull(treenode_id)) return;
    var self = this;

    function updateRadius(radius, updateMode) {
      updateMode = updateMode || self.editRadius_defaultValue;
      self.promiseNode(treenode_id).then(function(nodeId) {
        return self.submit().then(Promise.resolve.bind(Promise, nodeId));
      }).then(function(nodeId) {
        return CATMAID.commands.execute(new CATMAID.UpdateNodeRadiusCommand(self.state,
              project.id, nodeId, radius, updateMode));
      })
      .then(function(result) {
        if (result && result.updatedNodes) {
          let updatedNodes = Object.keys(result.updatedNodes);
          CATMAID.statusBar.replaceLastSticky("Updated radius of " +
              updatedNodes.length + " nodes", 'darkgreen', 1500);
        } else {
          CATMAID.statusBar.replaceLastSticky("Unexpected radius update response", 'green', 1500);
        }
      })
      .catch(CATMAID.handleError);
    }

    function show_dialog(defaultRadius) {
      if (typeof defaultRadius === 'undefined')
        defaultRadius = self.nodes.get(treenode_id).radius;

      var dialog = new CATMAID.OptionsDialog("Edit radius");
      var input = dialog.appendField("Radius: ", "treenode-edit-radius", defaultRadius, true);
      var choice = dialog.appendChoice("Apply: ", "treenode-edit-radius-scope",
        ['Only this node', 'From this node to the next branch or end node (included)',
         'From this node to the previous branch node or root (excluded)',
         'From this node to the previous node with a defined radius (excluded)',
         'From this node to root (included)', 'All nodes'],
        [0, 1, 2, 3, 4, 5],
        self.editRadius_defaultValue);
      dialog.onOK = function() {
        var radius = parseFloat(input.value);
        if (isNaN(radius)) {
          alert("Invalid number: '" + input.value + "'");
          return;
        }
        self.editRadius_defaultValue = choice.selectedIndex;
        updateRadius(radius, choice.selectedIndex);
      };
      dialog.show('auto', 'auto');
    }

    if (no_measurement_tool) {
      if (no_centering) {
        show_dialog(this.nodes.get(treenode_id).radius);
      } else {
        this.goToNode(treenode_id, show_dialog(this.nodes.get(treenode_id).radius));
      }
    } else {
      this.selectRadius(treenode_id, no_centering, no_dialog ? updateRadius : show_dialog);
    }
  };

  /**
   * Measure a distance from the current cursor position to the position of the
   * next click using the radius measurement tool.
   */
  CATMAID.TracingOverlay.prototype.measureRadius = function () {
    var self = this;

    var spos = [this.coords.lastX, this.coords.lastY, this.stackViewer.z];
    var pos = [
      this.stackViewer.primaryStack.stackToProjectX(spos[2], spos[1], spos[0]),
      this.stackViewer.primaryStack.stackToProjectY(spos[2], spos[1], spos[0]),
      this.stackViewer.primaryStack.stackToProjectZ(spos[2], spos[1], spos[0]),
    ];
    var id = 'vn-fake-fake-fake';
    var r = -1;
    var c = 5;

    var fakeNode = this.graphics.newNode(id, null, null, r, pos[0], pos[1], pos[2], 0, c,
        null, false, '1');

    var stackToProject = self.stackViewer.primaryStack.stackToProject.bind(self.stackViewer.primaryStack);
    toggleMeasurementTool();

    function displayRadius(rx, ry, rz) {
      if (typeof rx === 'undefined' || typeof ry === 'undefined' || typeof rz === 'undefined') {
        return;
      }
      // Convert pixel radius components to nanometers
      var s = self.stackViewer.primaryStack.projectToStack({x: rx, y: ry, z: rz}),
          pr = Math.round(Math.sqrt(Math.pow(rx, 2) + Math.pow(ry, 2) + Math.pow(rz, 2)));
      CATMAID.statusBar.replaceLast(
          'Distance: ' + pr + 'nm ' +
          '(Project nm X: ' + rx + ' Y: ' + ry + ' Z: ' + rz + ') ' +
          '(Stack px X: ' + s.x + ' Y: ' + s.y + ' Z: ' + s.z + ')');
    }

    function toggleMeasurementTool() {
      fakeNode.createGraphics();
      fakeNode.drawSurroundingCircle(true, toStack, stackToProject,
          hideCircleAndCallback);
      // Attach a handler for the ESC key to cancel selection
      $('body').on('keydown.catmaidRadiusSelect', function(event) {
        if ('Escape' === event.key) {
          // Unbind key handler and remove circle
          $('body').off('keydown.catmaidRadiusSelect');
          fakeNode.removeSurroundingCircle();
          if (fakeNode.id === id) {
            fakeNode.disable();
          }
          return true;
        }
        return false;
      });

      function hideCircleAndCallback() {
        // Unbind key handler
        $('body').off('keydown.catmaidRadiusSelect');
        // Remove circle and call callback
        fakeNode.removeSurroundingCircle(displayRadius);
        fakeNode.disable();
        self.redraw();
      }
    }

    /**
     * Transform a layer coordinate into stack space.
     */
    function toStack(r) {
        var scaleX = 1 / (self.stackViewer.scale * self.stackViewer.primaryStack.anisotropy(0).x);
        var scaleY = 1 / (self.stackViewer.scale * self.stackViewer.primaryStack.anisotropy(0).y);
        var offsetX = self.stackViewer.x - self.stackViewer.viewWidth * scaleX / 2;
        var offsetY = self.stackViewer.y - self.stackViewer.viewHeight * scaleY / 2;
        return {
          x: r.x * scaleX + offsetX,
          y: r.y * scaleY + offsetY,
        z: self.stackViewer.z
      };
    }
  };

  /**
   * All moving functions must perform moves via the updateNodeCoordinatesInDB
   * otherwise, coordinates for moved nodes would not be updated.
   */
  CATMAID.TracingOverlay.prototype.moveTo = function(z, y, x, fn) {
    var self = this;
    return self.updateNodeCoordinatesInDB()
      .then(function() {
        return self.stackViewer.getProject().moveTo(z, y, x, undefined, fn);
      });
  };


  /**
   * Move to a node and select it. Can handle virtual nodes.
   *
   * @return {Promise} A promise yielding the selected node.
   */
  CATMAID.TracingOverlay.prototype.moveToAndSelectNode = function(nodeID) {
    if (nodeID === null || nodeID === undefined) {
      return Promise.reject(new CATMAID.Warning("No node selected"));
    }
    var self = this;
    return this.goToNode(nodeID).then(
        function() {
          return self.selectNode(nodeID);
        });
  };

  /**
   * Get a promise that resolves into the location of the passed in node. If node
   * information has to be tretrieved, the request ist queued after all pending
   * requests of this overlay.
   */
  CATMAID.TracingOverlay.prototype.getNodeLocation = function (nodeId) {
    if (this.isIDNull(nodeId)) {
      return Promise.reject("No node provided for selection");
    }

    var node = this.nodes.get(nodeId);
    if (node) {
      return Promise.resolve({
        x: node.x,
        y: node.y,
        z: node.z,
      });
    } else if (SkeletonAnnotations.isRealNode(nodeId)) {
      var self = this;
      return new Promise(function(resolve, reject) {
        self.submit(CATMAID.makeURL(project.id + "/node/get_location"),
            'POST', {tnid: nodeId},
            function(json) {
              // json[0], [1], [2], [3]: id, x, y, z
              resolve({
                x: json[1],
                y: json[2],
                z: json[3]
              });
            },
            false,
            true,
            reject);
      });
    } else {
      // Get parent and child ID locations
      var vnComponents = SkeletonAnnotations.getVirtualNodeComponents(nodeId);
      var parentID = SkeletonAnnotations.getParentOfVirtualNode(nodeId, vnComponents);
      var childID = SkeletonAnnotations.getChildOfVirtualNode(nodeId, vnComponents);
      var vnX = SkeletonAnnotations.getXOfVirtualNode(nodeId, vnComponents);
      var vnY = SkeletonAnnotations.getYOfVirtualNode(nodeId, vnComponents);
      var vnZ = SkeletonAnnotations.getZOfVirtualNode(nodeId, vnComponents);

      if (parentID && childID && vnX && vnY && vnZ) {
        return Promise.resolve({
          x: vnX,
          y: vnY,
          z: vnZ
        });
      } else {
        var msg = "Could not find location for node " + nodeId;
        return Promise.reject(new CATMAID.Warning(msg));
      }
    }

    return Promise.reject("Could not select node " + nodeId);
  };

  /**
   * Move to the node and then invoke the function. If the node happens to be
   * virtual and not available in the front-end already, it tries to get both
   * real parent and real child of it and determine the correct position.
   */
  CATMAID.TracingOverlay.prototype.goToNode = function (nodeID, fn) {
    let self = this;
    return this.getNodeLocation(nodeID)
      .then(function(loc) {
        return self.moveTo(loc.z, loc.y, loc.x, fn);
      });
  };

  /**
   * Get a node representing the location on a skeleton at the first section after
   * the first of two adjacent nodes in direction of the second. If reverse is
   * true, a node on the first section after the second node in direction of the
   * first will be returned. More precisely, a promise is returned that is
   * resolved once the node is available. The promise returns the node
   * representing the location in question. Note that this node can be a virtual
   * node if no real node is available at the given point in space. In this case,
   * the nodes are child and parent of the virtual node. If one of the two nodes
   * happens to be at the given Z, the respective node is returned.
   */
  CATMAID.TracingOverlay.prototype.getNodeOnSectionAndEdge = function (
      childID, parentID, reverse) {
    if (childID === parentID) {
      throw new CATMAID.ValueError("Node IDs must be different");
    }

    var self = this;
    return new Promise(function(resolve, reject) {
      // Promise location, either by using the existing node or getting location
      // informmation from the backend.
      var location1 = self.promiseNodeLocation(childID, false);
      var location2 = self.promiseNodeLocation(parentID, false);
      var suppressed = SkeletonAnnotations.Settings.session.skip_suppressed_virtual_nodes ?
          self.promiseSuppressedVirtualNodes(childID) :
          [];

      // If both locations are available, find intersection at requested Z
      Promise.all([location1, location2, suppressed]).then(function(locations) {
        var stack = self.stackViewer.primaryStack;
        var from = reverse ? locations[1] : locations[0],
              to = reverse ? locations[0] : locations[1],
            toID = reverse ? childID : parentID,
            fromStack = stack.projectToUnclampedStack(from),
            toStack = stack.projectToUnclampedStack(to);
        var suppressedNodes = locations[2];

        // Calculate target section, respecting broken slices and suppressed
        // virtual nodes.
        var z = fromStack.z;
        var inc = fromStack.z < toStack.z ? 1 : (fromStack.z > toStack.z ? -1 : 0);
        var brokenSlices = stack.broken_slices;
        var suppressedZs = suppressedNodes.reduce(function (zs, s) {
          if (s.orientation === stack.orientation) {
            var vncoord = [0, 0, 0];
            vncoord[2 - s.orientation] = s.location_coordinate;
            zs.push(stack.projectToStackZ(vncoord[2], vncoord[1], vncoord[0]));
          }
          return zs;
        }, []);
        var suppressedSkips = 0;
        while (true) {
          z += inc;
          if (-1 !== suppressedZs.indexOf(z)) suppressedSkips++;
          else if (-1 === brokenSlices.indexOf(z)) break;
        }

        if (suppressedSkips) {
          CATMAID.warn('Skipped ' + suppressedSkips + ' suppressed virtual nodes.');
        }

        // If the target is in the section below, above or in the same section as
        // the from node, return it instead of a virtual node
        if (Math.abs(z - toStack.z) < 0.0001) {
          return {id: toID, x: to.x, y: to.y, z: to.z};
        }

        // To calculate the location of a new virtual node, use the real child
        // and parent. This is done to prevent rounding errors to accumulate,
        // which might be part of the virtual node's location.
        var realChildP = SkeletonAnnotations.isRealNode(childID) ? locations[0] :
          self.promiseNodeLocation(SkeletonAnnotations.getChildOfVirtualNode(childID), false);
        var realParentP = SkeletonAnnotations.isRealNode(parentID) ? locations[1] :
          self.promiseNodeLocation(SkeletonAnnotations.getParentOfVirtualNode(parentID), false);

        var realFromLoc = reverse ? realParentP : realChildP;
        var realToLoc = reverse ? realChildP : realParentP;

        return Promise.all([realFromLoc, realToLoc])
          .then(function(locations) {
            var realFrom = locations[0];
            var realTo = locations[1];
            // Find intersection and return virtual node
            var planeOffset = new THREE.Vector3(
                stack.stackToProjectX(z, 0, 0),
                stack.stackToProjectY(z, 0, 0),
                stack.stackToProjectZ(z, 0, 0)).length();
            var pos = CATMAID.tools.intersectLineWithPlane(
                realFrom.x, realFrom.y, realFrom.z,
                realTo.x, realTo.y, realTo.z,
                new THREE.Plane(self.stackViewer.normal(), planeOffset),
                new THREE.Vector3());

            var vnID = SkeletonAnnotations.getVirtualNodeID(childID, parentID, pos.x, pos.y, pos.z);
            return {
              id: vnID,
              x: pos.x,
              y: pos.y,
              z: pos.z
            };
          });
      }).then(function(node) {
        // Result is in project cooridnates and has fields id, x, y, z;
        return node;
      }).then(resolve).catch(reject);
    });
  };

  /**
   * Promise the location of a node. Either by using the client side copy, if
   * available. Or by querying the backend. The location coordinates are returned
   * in project space. If a vitual node ID is provided, its location and ID is
   * returned, too.
   */
  CATMAID.TracingOverlay.prototype.promiseNodeLocation = function (
      nodeID, ignoreVirtual) {
    var isVirtual = !SkeletonAnnotations.isRealNode(nodeID);
    if (ignoreVirtual && isVirtual) {
      throw new CATMAID.ValueError("Node can't be virtual");
    }

    // Try to find
    var node = this.nodes.get(nodeID);
    if (node) {
      return Promise.resolve({
        id: node.id,
        x: node.x,
        y: node.y,
        z: node.z
      });
    }

    // In case of a vitual node, both child and parent are retrieved and the
    // virtual node position is calculated.
    if (isVirtual) {
      var x = parseFloat(SkeletonAnnotations.getXOfVirtualNode(nodeID));
      var y = parseFloat(SkeletonAnnotations.getYOfVirtualNode(nodeID));
      var z = parseFloat(SkeletonAnnotations.getZOfVirtualNode(nodeID));
      return Promise.resolve({
        id: nodeID,
        x: x,
        y: y,
        z: z
      });
    }

    // Request location from backend
    var self = this;
    return new Promise(function(resolve, reject) {
      var url = CATMAID.makeURL(project.id + "/node/get_location");
      self.submit(url, 'POST', {tnid: nodeID}, resolve, true, false, reject);
    }).then(function(json) {
      return {
        id: json[0],
        x: json[1],
        y: json[2],
        z: json[3]
      };
    });
  };

  /**
   * Promise suppressed virtual treenodes of a node, or for a virtual node its
   * real child node.
   * @param  {number} nodeId ID of the child node whose suppressed virtual parents
   *                         will be returned.
   * @return {Promise}       A promise returning the array of suppressed virtual
   *                         node objects.
   */
  CATMAID.TracingOverlay.prototype.promiseSuppressedVirtualNodes = function(nodeId) {
    if (!SkeletonAnnotations.isRealNode(nodeId)) {
      nodeId = SkeletonAnnotations.getChildOfVirtualNode(nodeId);
    }

    var node = this.nodes.get(nodeId);
    if (node && node.suppressed) {
      return Promise.resolve(node.suppressed || []);
    } else {
      // Request suppressed virtual treenodes from backend.
      var self = this;
      return CATMAID.Nodes.getSuppressdVirtualNodes(project.id, nodeId)
        .then(function (json) {
          var node = self.nodes.get(nodeId);
          if (node) node.suppressed = json.length ? json : [];
          return json;
        });
    }
  };

  /**
   * Check whether a virtual node ID is suppressed, assuming its suppression info
   * has already been promised.
   * @param  {string}  vnID ID of the virtual node to check.
   * @return {Boolean}      Whether the node is known to be suppressed.
   */
  CATMAID.TracingOverlay.prototype.isVirtualNodeSuppressed = function (vnID) {
    if (SkeletonAnnotations.isRealNode(vnID));

    var childID = SkeletonAnnotations.getChildOfVirtualNode(vnID);
    var child = this.nodes.get(childID);
    if (child && child.suppressed) {
      var vnCoords = SkeletonAnnotations.getVirtualNodeComponents(vnID).slice(3, 6).map(Number);
      return child.suppressed.some(function (s) {
        if (s.orientation === this.stackViewer.primaryStack.orientation) {
          return vnCoords[2 - s.orientation] === s.location_coordinate;
        }
        return false;
      }, this);
    }
    return false;
  };

  /**
   * Moves the view to the location where the skeleton between a child
   * and a parent node intersects with the first section next to the child. Or,
   * alternatively, the parent if reverse is trueish. Returns a promise which
   * resolves to the node datastructure, return by getNodeOnSectionAndEdge.
   */
  CATMAID.TracingOverlay.prototype.moveToNodeOnSectionAndEdge = function (
      childID, parentID, select, reverse) {
    return this.getNodeOnSectionAndEdge(childID, parentID, reverse)
      .then((function(node) {
        var callback = select ? this.selectNode.bind(this, node.id) : undefined;
        return Promise.all([
          Promise.resolve(node),
          this.moveTo(node.z, node.y, node.x, callback)
        ]);
      }).bind(this))
      .then(function(results) {
        // Return node
        return results[0];
      });
  };

  /**
   * Move to the node that was edited last and select it. This will always be a
   * real node.
   */
  CATMAID.TracingOverlay.prototype.goToLastEditedNode = function(skeletonID, userId) {
    if (typeof skeletonID !== 'undefined' && this.isIDNull(skeletonID)) {
      return Promise.resolve();
    }
    var self = this;
    return this.submit.promise()
      .then(() => CATMAID.Nodes.mostRecentlyEditedNode(project.id, skeletonID, userId))
      .then(json => {
        if (json.id) {
          self.moveTo(json.z, json.y, json.x,
            function() { self.selectNode(json.id).catch(CATMAID.handleError); });
        }
        return json;
      });
  };

  /**
   * Move to the next open end end relative to the active node, and select it. If
   * cyling is requested, all buffered open ends will be selected one after each
   * other. If a virtual node is passed in, the request is done for its real
   * parent.
   */
  CATMAID.TracingOverlay.prototype.goToNextOpenEndNode = function(
      nodeID, cycle, byTime, reverse) {
    if (this.isIDNull(nodeID)) return;
    if (cycle) {
      this.cycleThroughOpenEnds(nodeID, byTime, reverse);
    } else {
      var self = this;
      if (!SkeletonAnnotations.isRealNode(nodeID)) {
        nodeID = SkeletonAnnotations.getParentOfVirtualNode(nodeID);
      }
      var skid = SkeletonAnnotations.getActiveSkeletonId();
      if (!skid) {
        CATMAID.error("No active skeleton set for node " + nodeID);
        return;
      }
      // TODO could be done by inspecting the graph locally if it is loaded in the
      // 3D viewer or treenode table (but either source may not be up to date)
      this.submit(
          CATMAID.makeURL(project.id + '/skeletons/' + skid + '/open-leaves'),
          'POST',
          {treenode_id: nodeID},
          function (json) {
            // json is an array of nodes. Each node is an array:
            // [0]: open end node ID
            // [1]: location array as [x, y, z]
            // [2]: distance (path length)
            // [3]: creation_time
            if (0 === json.length) {
              CATMAID.info("No more open ends!");
              self.nextOpenEnds = { tnid: nodeID, skid: skid, ends: [], byTime: null };
            } else {
              self.nextOpenEnds = { tnid: nodeID, skid: skid, ends: json, byTime: null };
              self.cycleThroughOpenEnds(nodeID, byTime, reverse);
            }
          });
    }
  };

  /**
   * If there are open ends buffered, move to the next one after the current and
   * (or the first) and select the node. If sorting by time is requested and no
   * sorting took place so for, sort all open ends by time.
   */
  CATMAID.TracingOverlay.prototype.cycleThroughOpenEnds = function(
      treenode_id, byTime, reverse) {
    if (this.nextOpenEnds === undefined ||
        this.nextOpenEnds.ends.length === 0 ||
        this.nextOpenEnds.skid !== SkeletonAnnotations.getActiveSkeletonId()) {
      // Can not cycle because open ends data is missing or invalid. Fetch it.
      return this.goToNextOpenEndNode(treenode_id, false, byTime);
    }

    if (byTime !== this.nextOpenEnds.byTime) {
      this.nextOpenEnds.ends.sort(byTime ?
          // Sort creation date strings by descending time
          function (a, b) { return b[3].localeCompare(a[3]); } :
          // Sort by ascending path distance
          function (a, b) { return a[2] - b[2]; });
      this.nextOpenEnds.byTime = byTime;
    }

    var currentEnd = this.nextOpenEnds.ends.map(function (end) {
      return end[0] === treenode_id;
    }).indexOf(true);

    // Cycle through ends. If treenode_id was not in the end (such as when first
    // selecting an end), currentEnd will be -1, so the following line will make
    // it 0 and still produce the desired behavior.
    let offset = reverse ? -1 : 1;
    currentEnd = CATMAID.tools.mod(currentEnd + offset, this.nextOpenEnds.ends.length);

    var node = this.nextOpenEnds.ends[currentEnd];
    this.moveTo(node[1][2], node[1][1], node[1][0], this.selectNode.bind(this, node[0]));
  };

  /**
   * Go the nearest node with a label matching a regex. If a skeleton is active,
   * this is limited to the active skeleton and goes to the nearest node by
   * path distance
   *
   * @param  {boolean} cycle  If true, cycle through results in the previous set.
   * @param  {boolean} repeat If true, repeat the last label search.
   */
  CATMAID.TracingOverlay.prototype.goToNearestMatchingTag = function (cycle, repeat) {
    if (cycle) return this.cycleThroughNearestMatchingTags();

    var self = this;

    var retrieveNearestMatchingTags = function () {
      var nodeId = SkeletonAnnotations.getActiveNodeId();

      if (nodeId) {
        if (!SkeletonAnnotations.isRealNode(nodeId)) {
          nodeId = SkeletonAnnotations.getParentOfVirtualNode(nodeId);
        }
        var skeletonId = SkeletonAnnotations.getActiveSkeletonId();
        self.submit(
            CATMAID.makeURL(project.id + '/skeletons/' + skeletonId + '/find-labels'),
            'POST',
            { treenode_id: nodeId,
              label_regex: self.nextNearestMatchingTag.query },
            function (json) {
              // json is an array of nodes. Each node is an array:
              // [0]: open end node ID
              // [1]: location array as [x, y, z]
              // [2]: distance (path length)
              // [3]: matching tags
              self.nextNearestMatchingTag.matches = json;
              self.cycleThroughNearestMatchingTags();
            });
      } else {
        var projectCoordinates = self.stackViewer.projectCoordinates();
        self.submit(
            CATMAID.makeURL(project.id + '/nodes/find-labels'),
            'POST',
            { x: projectCoordinates.x,
              y: projectCoordinates.y,
              z: projectCoordinates.z,
              label_regex: self.nextNearestMatchingTag.query },
            function (json) {
              self.nextNearestMatchingTag.matches = json;
              self.cycleThroughNearestMatchingTags();
            });
      }
    };

    if (!repeat || this.nextNearestMatchingTag.query === null) {
      var options = new CATMAID.OptionsDialog("Search for node by tag");
      options.appendField("Tag (regex):", "nearest-matching-tag-regex", "", true);
      if (!SkeletonAnnotations.getActiveNodeId()) {
        options.appendField("Within distance:", "nearest-matching-tag-radius", "", true);
      }

      options.onOK = function() {
          var regex = $('#nearest-matching-tag-regex').val();
          if (regex && regex.length > 0) regex = regex.trim();
          else return alert("Must provide a tag name or regex search.");

          self.nextNearestMatchingTag.query = regex;

          var radius = $('#nearest-matching-tag-radius');
          if (radius) {
            radius = Number.parseInt(radius.val(), 10);
            self.nextNearestMatchingTag.radius = radius;
          } else {
            self.nextNearestMatchingTag.radius = Infinity;
          }

          retrieveNearestMatchingTags();
      };

      options.show(300, 180, true);
    } else {
      retrieveNearestMatchingTags();
    }
  };

  /**
   * Cycle through nodes with labels matching a query retrieved by
   * goToNearestMatchingTag.
   */
  CATMAID.TracingOverlay.prototype.cycleThroughNearestMatchingTags = function () {
    if (this.nextNearestMatchingTag.matches.length === 0) {
      CATMAID.info('No nodes with matching tags');
      return;
    }

    var treenodeId = SkeletonAnnotations.getActiveNodeId();
    if (treenodeId) {
      var currentNode = this.nextNearestMatchingTag.matches.map(function (node) {
        return node[0] === treenodeId;
      }).indexOf(true);
    } else {
      var currentNode = -1;
    }

    // Cycle through nodes.
    currentNode = (currentNode + 1) % this.nextNearestMatchingTag.matches.length;

    var node = this.nextNearestMatchingTag.matches[currentNode];

    if (node[2] > this.nextNearestMatchingTag.radius) {
      var remainingNodes = this.nextNearestMatchingTag.matches.length - currentNode;
      CATMAID.info(remainingNodes + ' more nodes have matching tags but are beyond the distance limit.');
      return;
    }
    this.moveTo(node[1][2], node[1][1], node[1][0], this.selectNode.bind(this, node[0]));
  };

  /**
   * Sets treenode information as status. Can handle virtual nodes.
   */
  CATMAID.TracingOverlay.prototype.printTreenodeInfo = function(nodeID, prePrefix, forceExtendedStatus) {
    if (this.isIDNull(nodeID)) return;
    var prefix = "";
    var node = this.nodes.get(nodeID);
    if (node) {
      if (SkeletonAnnotations.TYPE_NODE === node.type) {
        if (SkeletonAnnotations.isRealNode(node.id)) {
          prefix = "Node " + node.id + ", skeleton " + node.skeleton_id;
        } else {
          // Side effect: change nodeID to the real one
          nodeID = SkeletonAnnotations.getChildOfVirtualNode(nodeID);
          prefix = "Virtual node of " + nodeID + ", skeleton " + node.skeleton_id;
        }
      } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
        if (CATMAID.Connectors.SUBTYPE_ABUTTING_CONNECTOR === node.subtype) {
          prefix = "Abutting connector node #" + node.id;
        } else if (CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR === node.subtype) {
          prefix = "Gap junction connector node #" + node.id;
        } else if (CATMAID.Connectors.SUBTYPE_TIGHTJUNCTION_CONNECTOR === node.subtype) {
          prefix = "Tight junction connector node #" + node.id;
        } else if (CATMAID.Connectors.SUBTYPE_DESMOSOME_CONNECTOR === node.subtype) {
          prefix = "Desmosome connector node #" + node.id;
        } else if (CATMAID.Connectors.SUBTYPE_ATTACHMENT_CONNECTOR === node.subtype) {
          prefix = "Attachment connector node #" + node.id;
        } else if (CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR === node.subtype) {
          prefix = "Synaptic connector node #" + node.id;
        } else {
          prefix = "Unknown connector node #" + node.id;
        }
      }
    }

    if (typeof prePrefix !== "undefined") {
      prefix = prePrefix + " " + prefix;
    }

    if (!(CATMAID.TracingOverlay.Settings.session.extended_status_update || forceExtendedStatus)) {
      if (node) {
        prefix += " created by " + CATMAID.User.safeToString(node.user_id) +
          ", last edited " + CATMAID.tools.contextualDateString((node.edition_time_iso_str));
      }
      CATMAID.status(prefix);
    } else {
      CATMAID.status(prefix + " (loading authorship information)");

      var url = CATMAID.makeURL(project.id + '/node/user-info');

      this.submit(url, 'POST', {node_ids: [nodeID]}, function(json) {
          var info = json[nodeID];
          var creator = CATMAID.User.safeToString(info.user);
          var editor = CATMAID.User.safeToString(info.editor);

          var msg = prefix + " created by " + creator + ' ' +
              CATMAID.tools.contextualDateString(info.creation_time) + ", last edited by " + editor + ' ' +
              CATMAID.tools.contextualDateString(info.edition_time) + ", reviewed by ";
          // Add review information
          if (info.reviewers.length > 0) {
            var reviews = [];
            for (var i=0; i<info.reviewers.length; ++i) {
              reviews.push(CATMAID.User.safeToString(info.reviewers[i]) + ' ' +
                  CATMAID.tools.contextualDateString(info.review_times[i]));
            }
            msg += reviews.join(', ');
          } else {
            msg += "no one";
          }
          CATMAID.status(msg);
        },
        false,
        true);
    }
  };

  /**
   * If you select a pre- or post-synaptic terminal, then run this command, the
   * active node will be switched to its connector (if one uniquely exists). If
   * you then run the command again, it will switch back to the terminal.
   */
  CATMAID.TracingOverlay.prototype.switchBetweenTerminalAndConnector = function() {
    var atn = SkeletonAnnotations.atn;
    if (null === atn.id) {
      CATMAID.info("A terminal must be selected in order to switch to its connector");
      return;
    }
    var ob = this.nodes.get(atn.id);
    if (!ob) {
      CATMAID.warn("Cannot switch between terminal and connector: node not loaded.");
      return;
    }
    if (SkeletonAnnotations.TYPE_CONNECTORNODE === ob.type) {
      if (this.switchingConnectorID === ob.id &&
          this.nodes.has(this.switchingTreenodeID)) {
        // Switch back to the terminal
        this.moveToAndSelectNode(this.nodes.get(this.switchingTreenodeID).id);
      } else {
        var links = ob.links.reduce(collectLinksByRelation, {});
        var preLinks = links['presynaptic_to'];
        var postLinks = links['postsynaptic_to'];
        // Go to the postsynaptic terminal if there is only one
        if (postLinks && postLinks.length === 1) {
          this.moveToAndSelectNode(postLinks[0].treenode.id);
        // Otherwise, go to the presynaptic terminal if there is only one
        } else if (preLinks) {
          if (preLinks.length === 1) {
            this.moveToAndSelectNode(preLinks[0].treenode.id);
          } else {
            CATMAID.msg("Oops", "Don't know which terminal to switch to");
            return;
          }
        } else {
          // Otherwise, select the first partner node of the first available link
          if (ob.links.length > 0) {
            this.moveToAndSelectNode(ob.links[0].treenode.id);
          }  else {
            CATMAID.warn("No partner node found");
            return;
          }
        }
      }
    } else if (SkeletonAnnotations.TYPE_NODE === ob.type) {
      if (this.switchingTreenodeID === ob.id &&
          this.nodes.has(this.switchingConnectorID)) {
        // Switch back to the connector
        this.moveToAndSelectNode(this.nodes.get(this.switchingConnectorID).id);
      } else {
        // Find a connector for the treenode 'ob'
        var cs = this.findConnectors(ob.id);
        var preLinks = cs['presynaptic_to'];
        var postLinks = cs['postsynaptic_to'];
        var availableRelations = Object.keys(cs);

        if (postLinks && postLinks.length === 1) {
          this.switchingTreenodeID = ob.id;
          this.switchingConnectorID = postLinks[0];
        } else if (preLinks && preLinks.length === 1) {
          this.switchingTreenodeID = ob.id;
          this.switchingConnectorID = preLinks[0];
        } else if (availableRelations.length > 0) {
          this.switchingTreenodeID = ob.id;
          this.switchingConnectorID = cs[availableRelations[0]][0];
        } else {
          CATMAID.warn("No connector linked to node");
          this.switchingTreenodeID = null;
          this.switchingConnectorID = null;
        }
        if (this.switchingConnectorID) {
          this.moveToAndSelectNode(this.nodes.get(this.switchingConnectorID).id);
        }
      }
    } else {
      CATMAID.error("Unknown node type: " + ob.type);
    }
  };

  /**
   * Delete the connector from the database and removes it from the current view
   * and local objects.
   */
  CATMAID.TracingOverlay.prototype._deleteConnectorNode =
      function(connectornode) {
    // Suspennd the node before submitting the request to note catch pointer
    // events on the removed node.
    connectornode.suspend();
    var self = this;
    return this.submit.promise(function() {
      self.nodeIDsNeedingSync.delete(connectornode.id);
      var command = new CATMAID.RemoveConnectorCommand(self.state, project.id, connectornode.id);
      return CATMAID.commands.execute(command)
        .then(function(result) {
          let links = connectornode.links.reduce(collectLinksByRelation, {});
          let preLinks = links['presynaptic_to'];
          let postLinks = links['postsynaptic_to'];
          let availableRelations = Object.keys(links);
          // If there was a presynaptic node, select it
          if (preLinks && preLinks.length > 0) {
              self.selectNode(preLinks[0].treenode.id).catch(CATMAID.handleError);
          } else if (postLinks && postLinks.length > 0) {
              self.selectNode(postLinks[0].treenode.id).catch(CATMAID.handleError);
          } else if (availableRelations.length > 0) {
              self.selectNode(links[availableRelations[0]][0].treenode.id).catch(CATMAID.handleError);
          } else {
              self.activateNode(null);
          }

          var connectorId = connectornode.id;

          // Delete all connector links
          var allLinks = connectornode.getLinks();
          for (var i=0; i<allLinks.length; ++i) {
            var link = allLinks[i];
            link.treenode.connectors.delete(connectorId);
          }

          // Delete this connector from overlay (to not require a database update).
          self.nodes.delete(connectorId);
          connectornode.disable();
          self.pixiLayer._renderIfReady();

          CATMAID.statusBar.replaceLast("Deleted connector #" + connectorId);
        })
        .catch(CATMAID.handleError);
    }, CATMAID.handleError);
  };

  /**
   * Delete the node from the database and removes it from the current view and
   * local objects.
   */
  CATMAID.TracingOverlay.prototype._deleteTreenode =
      function(node, wasActiveNode, handleError) {
    var self = this;
    // Make sure all other pending tasks are done before the node is deleted.
    return this.submit.then(function() {
      var command = new CATMAID.RemoveNodeCommand(self.state, project.id, node.id);
      return CATMAID.commands.execute(command);
    }, handleError).then(function(json) {
      // nodes not refreshed yet: node still contains the properties of the deleted node
      // ensure the node, if it had any changes, these won't be pushed to the database: doesn't exist anymore
      self.nodeIDsNeedingSync.delete(node.id);

      // Make sure, we got a list of all partners before we delete the node data
      // structure. This is only needed if the node was active and has no parent
      // node, because the partner information is used for making another node
      // active.
      var partners = wasActiveNode && !json.parent_id ?
          self.findConnectors(node.id) : null;

      // Delete any connector links
      for (var connectorId of node.connectors.keys()) {
        var connector = self.nodes.get(connectorId);
        if (connector) {
          var link = node.connectors.get(connectorId);
          connector.removeLink(link);
          connector.drawEdges(true);
        }
      }

      // Delete this node from overlay (to not require a database update).
      var children = node.children;
      var parent = node.parent;
      self.nodes.delete(node.id);
      if (children) {
        let changedChildren = json.children ? json.children : [];
        let childEditTimeMap = new Map(changedChildren);
        for (var child of children.values()) {
          child.parent = parent;
          child.parent_id = node.parent_id;
          if (childEditTimeMap.has(child.id)) {
            child.edition_time_iso_str = childEditTimeMap.get(child.id);
          }
          if (parent) {
            parent.addChildNode(child);
          }
        }
      }
      if (parent) {
        parent.removeChildNode(node);
      }

      // Store node ID before node gets reset
      var nodeId = node.id;

      node.disable();
      node.drawEdges(false);
      if (parent) parent.drawEdges(true);
      self.pixiLayer._renderIfReady();

      CATMAID.statusBar.replaceLast("Deleted node #" + nodeId);

      // activate parent node when deleted
      if (wasActiveNode) {
        if (json.parent_id) {
          return self.selectNode(json.parent_id);
        } else {
          // No parent. But if this node was postsynaptic or presynaptic
          // to a connector, the connector must be selected:
          // Try first connectors for which node is postsynaptic:
          let partnerRelations = Object.keys(partners);
          if (partnerRelations.length > 0) {
            let postLinks = partners['postsynaptic_to'];
            let preLinks = partners['presynaptic_to'];
            if (postLinks && postLinks.length > 0) {
              return self.selectNode(postLinks[0]).catch(CATMAID.handleError);
            // Then try connectors for which node is presynaptic
            } else if (preLinks && preLinks.length > 0) {
              return self.selectNode(preLinks[0]).catch(CATMAID.handleError);
            // Then try connectors for which node has gap junction with
            } else {
              return self.selectNode(partners[partnerRelations[0]][0]).catch(CATMAID.handleError);
            }
          } else {
            self.activateNode(null);
          }
        }
      }
    })
    .promise();
  };

  /**
   * Delete active node after all other queued actions finished, which also allows
   * the active node to change before it is queried. This is useful for instance to
   * quickly delete multiple nodes and a changed active node is required.
   */
  CATMAID.TracingOverlay.prototype.deleteActiveNode = function() {
    var self = this;
    let deleteNode = this.submit.promise(function() {
        return self.deleteNode(SkeletonAnnotations.getActiveNodeId());
      });
    return this.submit.promise(deleteNode);
  };

  /**
   * Delete a node with the given ID. The node can either be a connector or a
   * treenode.
   */
  CATMAID.TracingOverlay.prototype.deleteNode = function(nodeId) {
    var node = this.nodes.get(nodeId);
    var self = this;

    if (!node) {
      CATMAID.error("Could not find a node with id " + nodeId);
      return false;
    }

    if (nodeId === this._lastDeletedNodeId) {
      CATMAID.msg("Just a moment", "Already deleting node " + nodeId);
      return false;
    }

    if (!node.parent_id && node.children && node.children.size > 0) {
      CATMAID.warn("Can't delete root node if there are still child nodes");
      return false;
    }

    if (!SkeletonAnnotations.isRealNode(nodeId)) {
      return this.toggleVirtualNodeSuppression(nodeId);
    }

    if (!CATMAID.mayEdit() || !node.canEdit()) {
      if (node.type === SkeletonAnnotations.TYPE_CONNECTORNODE) {
        CATMAID.error("You don't have permission to delete connector #" + node.id);
      } else {
        CATMAID.error("You don't have permission to delete node #" + node.id);
      }
      return false;
    }

    if (!this.isInView(node.x, node.y, node.z)) {
      CATMAID.msg("Error",
                  "Can not delete nodes outside the current view area. " +
                  "Press A to bring the node into view then try again.");
      return false;
    }

    // Unset active node to avoid actions that involve the deleted node
    var isActiveNode = (node.id === SkeletonAnnotations.getActiveNodeId());

    var reset = (function(deletedNodeId) {
      this.suspended = false;
      this._lastDeletedNodeId = deletedNodeId;
    }).bind(this);

    var handleError= function() {
      reset(null);
      return true;
    };

    // Call actual delete methods defined below (which are callable due to
    // hoisting)
    var del;
    switch (node.type) {
      case SkeletonAnnotations.TYPE_CONNECTORNODE:
        this.suspended = true;
        del = this._deleteConnectorNode(node);
        break;
      case SkeletonAnnotations.TYPE_NODE:
        this.suspended = true;
        del = this._deleteTreenode(node, isActiveNode, handleError);
        break;
    }

    if (del) {
      var lastLastDeletedNodeId = this._lastDeletedNodeId;
      this._lastDeletedNodeId = node.id;
      del.then(function() {
          reset(nodeId);
        })
        .catch(function(error) {
          reset(lastLastDeletedNodeId);
          CATMAID.handleError(error);
        });
      return del;
    } else {
      CATMAID.error("Unhandled node type: " + node.type);
      return false;
    }
  };

  /**
   * Toggle whether a given virtual node is suppressed (i.e., not traversed during
   * review) or unsuppressed.
   * @param  {number}  nodeId ID of the virtual node to suppress or unsuppress.
   * @return {boolean}        Whether a toggle was issued (false for real nodes).
   */
  CATMAID.TracingOverlay.prototype.toggleVirtualNodeSuppression = function (nodeId) {
    if (SkeletonAnnotations.isRealNode(nodeId)) {
      CATMAID.warn("Can not suppress real nodes.");
      return false;
    }

    var childId = SkeletonAnnotations.getChildOfVirtualNode(nodeId);
    var location = this.promiseNodeLocation(nodeId);
    var suppressed = this.promiseSuppressedVirtualNodes(nodeId);
    var self = this;

    Promise.all([location, suppressed]).then(function (values) {
      var location = values[0],
          suppressed = values[1],
          stack = self.stackViewer.primaryStack,
          orientation = stack.orientation,
          orientationName = ['z', 'y', 'x'][orientation],
          coordinate = location[orientationName];
      var match = suppressed
          .map(function (s) {
            return s.orientation === orientation
                && s.location_coordinate === coordinate; })
          .indexOf(true);
      if (-1 !== match) {
        var suppressedId = suppressed[match].id;
        CATMAID.Nodes.deleteSuppresedVirtualNode(project.id, childId, suppressedId)
          .then(function() {
            var node = self.nodes.get(childId);
            if (node) node.suppressed = undefined;
            self.recolorAllNodes();
            CATMAID.info('Unsuppressed virtual parent of ' + childId + ' at ' +
                         orientationName + '=' + coordinate);
          })
          .catch(CATMAID.handleError);
      } else {
        CATMAID.Nodes.addSuppressedVirtualNode(project.id, childId, orientation, coordinate)
          .then(function(json) {
            var node = self.nodes.get(childId);
            if (node && node.suppressed) node.suppressed.push(json);
            self.recolorAllNodes();
            CATMAID.info('Suppressed virtual parent of ' + childId + ' at ' +
                         orientationName + '=' + coordinate);
          })
          .catch(CATMAID.handleError);
      }
    });

    return true;
  };

  /**
   * Get a state representation for a node that is understood by the back-end.
   */
  CATMAID.TracingOverlay.prototype.getState = function(nodeId) {
    var node = this.nodes.get(nodeId);
    if (!node) {
      throw new CATMAID.ValueError("Can't create state: node not found");
    }

    var parentId;
    var parentEditTime;
    if (node.parent_id) {
      parentId = node.parent_id;
      var parentNode = this.nodes.get(parentId);
      if (!parentNode) {
        throw new CATMAID.ValueError("Can't create state: parent node not found");
      }
      parentEditTime = parentNode.edition_time_iso_str;
    }

    var children = [];
    for (var cid of node.children.keys()) {
      cid = SkeletonAnnotations.isRealNode(cid) ? cid :
          SkeletonAnnotations.getChildOfVirtualNode(cid);
      children.push([cid, node.children.get(cid).edition_time_iso_str]);
    }

    var links = [];
    for (var cid of node.connectors.keys()) {
      var connector = this.nodes.get(cid);
      var link = node.connectors.get(cid);
      links.push([cid, connector.edition_time_iso_str, link.relation_id]);
    }

    return CATMAID.getNeighborhoodState(nodeId, node.edition_time_iso_str, parentId,
        parentEditTime, children, links);
  };

  /**
   * Create A simplified state that will only contain id and edition time of the
   * provided node.
   */
  CATMAID.TracingOverlay.prototype.getParentState = function(parentId) {
    var node = this.nodes.get(parentId);
    if (!node) {
      throw new CATMAID.ValueError("Can't create state: node not found");
    }

    return CATMAID.getParentState(parentId, node.edition_time_iso_str);
  };

  CATMAID.TracingOverlay.prototype.getEdgeState = function(childId, parentId) {
    var node = this.nodes.get(parentId);
    if (!node) {
      throw new CATMAID.ValueError("Can't create state: parent not found");
    }

    var child;
    for (var cid of node.children.keys()) {
      if (cid == childId) {
        cid = SkeletonAnnotations.isRealNode(cid) ? cid :
            SkeletonAnnotations.getChildOfVirtualNode(cid);
        child = [cid, node.children.get(cid).edition_time_iso_str];
        break;
      }
    }
    if (!child) {
      throw new CATMAID.ValueError("Can't create state: child not found");
    }

    return CATMAID.getEdgeState(node.id, node.edition_time_iso_str, child[0], child[1]);
  };

  /**
   * Return true if the given node ID is part of the given skeleton. Expects the
   * node to be displayed.
   */
  CATMAID.TracingOverlay.prototype.nodeIsPartOfSkeleton = function(skeletonID, nodeID) {
    if (!this.nodes.has(nodeID)) throw new CATMAID.ValueError("Node not loaded");
    return this.nodes.get(nodeID).skeleton_id === skeletonID;
  };

  /**
   * Handle update of active node with recoloring all nodes. Additionally, if not
   * disabled and the node new node is not part of the current view,, make the
   * selected node "known" to this overlay. This makes it possible to finish
   * actions started in another view by being able to create state
   * representations involving the active node, e.g. branching or interpolation.
   */
  CATMAID.TracingOverlay.prototype.handleActiveNodeChange = function(node) {
    if (node.id && SkeletonAnnotations.Settings.session.skip_suppressed_virtual_nodes) {
      var self = this;
      this.promiseSuppressedVirtualNodes(node.id).then(function () { self.recolorAllNodes(); });
    }
    if (this.copyActiveNode) {
      this.importActiveNode(node);
    }
    this.recolorAllNodes();
  };

  /**
   * Update the pointer on changed interaction modes.
   */
  CATMAID.TracingOverlay.prototype.handleChangedInteractionMode = function(newMode, oldMode) {
    this.updateCursor();
  };

  /**
   * Add the passed in active node to this overlay's state, if it isn't present
   * already.
   *
   * @param {SkeletonAnnotations.atn} node The node to import
   */
  CATMAID.TracingOverlay.prototype.importActiveNode = function(node) {
    if (!node || !node.id) {
      return;
    }
    var knownNode = this.nodes.get(node.id);
    if (knownNode) {
      return;
    }
    var sourceStackViewer = project.getStackViewer(node.stack_viewer_id);
    if (!sourceStackViewer) {
      CATMAID.warn('No stack viewer found for active node');
      return;
    }

    // Get stack coordinates for target stack
    var zs = this.stackViewer.primaryStack.projectToUnclampedStackZ(node.z, node.y, node.x);

    var node;
    if (SkeletonAnnotations.TYPE_NODE === node.type) {
      // Create new treenode. There is no need to include a parent node for this
      // imported node at the moment.
      node = this.graphics.newNode(node.id, null, node.parent_id, node.radius,
          node.x, node.y, node.z, zs - this.stackViewer.z, node.confidence,
          node.skeleton_id, node.edition_time, node.user_id);
    } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
      node = this.graphics.newConnectorNode( node.id, node.x, node.y, node.x, zs -
          this.stackViewer.z, node.confidence, node.subtype, node.edition_time,
          node.user_id);
    }
    this.nodes.set(node.id, node);
    node.createGraphics();
  };

  /**
   * Handle the creation of new nodes. Update our view by manually adding the node
   * to our node store if it is unkown.
   */
  CATMAID.TracingOverlay.prototype.handleNewNode = function(node) {
    // If we know the new node already, do nothing. We assume it has been taken
    // care of somewhere else.
    if (!node || this.nodes.has(node.id)) return;

    // Otherwise, trigger an update if the new node is in the current view. This
    // doesn't catch cases where only the edge between the new node and another
    // node crosses the view. If these cases are important, the allow_lazy_updates
    // setting has to be set to false.
    if (CATMAID.TracingOverlay.Settings.session.allow_lazy_updates) {
      if (!this.isInView(node.x, node.y, node.z)) {
        return;
      }
    }

    // Otherwise, add the new node to the local node store and display. This is
    // done explicitely to avoid a full node update.
    var nid = parseInt(node.id);
    var skid = parseInt(node.skeletonId);

    // The parent will be null if there isn't one or if the parent Node
    // object is not within the set of retrieved nodes, but the parentID
    // will be defined. An edition time of 0 is used initially, because it will be
    // set to the expected format in a separate call.
    var stackZ = this.stackViewer.primaryStack.projectToUnclampedStackZ(
        node.z, node.y, node.x);
    var zDiff = stackZ - this.stackViewer.z;
    var nn = this.graphics.newNode(node.id, this.nodes.get(node.parentId), node.parentId,
        node.radius, node.x, node.y, node.z, zDiff, node.confidence, node.skeletonId, 0,
        node.creatorId);
    nn.edition_time_iso_str = node.editionTime;

    this.nodes.set(node.id, nn);
    nn.createGraphics();

    // Append to parent and recolor
    if (node.parentId) {
      var parentNode = this.nodes.get(node.parentId);
      if (parentNode) {
        parentNode.addChildNode(nn);
        parentNode.updateColors();
      }
    }

    if (node.childIds && node.childIds.length > 0) {
      for (var i=0; i<node.childIds.length; ++i) {
        var childId = node.childIds[i];
        var childNode = this.nodes.get(childId);
        if (childNode) {
          childNode.parent = nn;
          childNode.drawLineToParent();
          nn.addChildNode(childNode);
          nn.updateColors();
        }
      }
    }
  };

  /**
   * Handle the creation of new connector nodes. Update our view by manually
   * adding the node to our node store if it is unkown.
   */
  CATMAID.TracingOverlay.prototype.handleNewConnectorNode = function(node) {
    // If we know the new node already, do nothing. We assume it has been taken
    // care of somewhere else.
    if (!node || this.nodes.has(node.id)) return;

    // Otherwise, trigger an update if the new node is in the current view. This
    // doesn't catch cases where only the edge between the new node and another
    // node crosses the view. If these cases are important, the allow_lazy_updates
    // setting has to be set to false.
    if (CATMAID.TracingOverlay.Settings.session.allow_lazy_updates) {
      if (!this.isInView(node.x, node.y, node.z)) {
        return;
      }
    }

    // add treenode to the display and update it
    var stackZ = this.stackViewer.primaryStack.projectToUnclampedStackZ(
        node.z, node.y, node.x);
    var zDiff = stackZ - this.stackViewer.z;
    var nn = this.graphics.newConnectorNode(node.id, node.x, node.y, node.z,
        zDiff, node.confidence, node.subtype, 0, node.creatorId);
    nn.edition_time_iso_str = node.editionTime;
    this.nodes.set(node.id, nn);
    nn.createGraphics();

    // TODO: add links
  };

  CATMAID.TracingOverlay.prototype.isInView = function(px, py, pz) {
    var vb = this.stackViewer.primaryStack.createStackToProjectBox(
        this.stackViewer.createStackViewBox());

    return vb.min.x <= px && px <= vb.max.x &&
           vb.min.y <= py && py <= vb.max.y &&
           vb.min.z <= pz && pz <= vb.max.z;
  };

  /**
   * Update nodes if called with a node that is currently part of this overlay.
   */
  CATMAID.TracingOverlay.prototype.handleNodeChange = function(nodeId) {
    if (!this.nodes.has(nodeId)) return;
    this.updateNodes();
  };

  /**
   * If the removed connector was selected, unselect it. Update nodes if called
   * with a node that is currently part of this overlay.
   */
  CATMAID.TracingOverlay.prototype.handleRemovedConnector = function(nodeId) {
    var node = this.nodes.get(nodeId);
    if (!node) {
      return;
    }
    if (nodeId === SkeletonAnnotations.getActiveNodeId()) {
      this.activateNode(null);
    }

    this.updateNodes();
  };

  /**
   * Checks if the given skeleton is part of the current display and reloads all
   * nodes if this is the case.
   *
   * @param {number} skeletonID - The ID of the skelton changed.
   */
  CATMAID.TracingOverlay.prototype.handleChangedSkeleton = function(skeletonID, changes) {
    this.updateIfKnown(skeletonID, changes);
  };

  /**
   * Handles skeleton deletion events. Checks if the given skeleton is part of the
   * current display and reloads all nodes if this is the case.
   *
   * @param {number} skeletonID - The ID of the skelton changed.
   */
  CATMAID.TracingOverlay.prototype.handleDeletedSkeleton = function(skeletonID) {
    var activeSkeletonID = SkeletonAnnotations.getActiveSkeletonId();
    // Unselect active node, if it was part of the current display
    if (activeSkeletonID == skeletonID) {
      this.activateNode(null);
    }
    this.updateIfKnown(skeletonID);
  };

  /**
   * Update nodes if the given skeleton is part of the current display.
   *
   * @param skeletonID {number} The ID of the skelton changed.
   * @param callback {function} An optional callback, executed after a node update
   */
  CATMAID.TracingOverlay.prototype.updateIfKnown = function(skeletonID, changes) {
    // If changes are provided and lazy updates are allowed, we can skip the
    // update if no change is in the current view. This requires all changes to
    // have a location provided.
    if (changes && changes.length > 0) {
      if (CATMAID.TracingOverlay.Settings.session.allow_lazy_updates) {
        var needsUpdate = false;
        for (var i=0, imax=changes.length; i<imax; ++i) {
          var change = changes[i];
          if (change && change.length === 4) {
            if (this.isInView(change[1], change[2], change[3])) {
              needsUpdate = true;
              break;
            }
          } else {
            needsUpdate = true;
            break;
          }
          if (!needsUpdate) {
            return;
          }
        }
      }
    }

    for (var nodeId of this.nodes.keys()) {
      if (this.nodeIsPartOfSkeleton(skeletonID, nodeId)) {
        this.updateNodes();
        break;
      }
    }
  };

  /**
   * Update visibility of tracing window DOM element and set its size according to
   * the current settings.
   */
  CATMAID.TracingOverlay.prototype.updateTracingWindow = function() {
    var lineWidth = 2;
    var lineColor = 0x00FF00;

    if (this.applyTracingWindow) {
      var screenCenterX = this.stackViewer.viewWidth / 2;
      var screenCenterY = this.stackViewer.viewHeight / 2;
      var halfWidth = this.tracingWindowWidth / 2;
      var halfHeight = this.tracingWindowHeight / 2;

      this._tracingWindowElement.style.left = (screenCenterX - halfWidth) + 'px';
      this._tracingWindowElement.style.right = (screenCenterX + halfWidth) + 'px';
      this._tracingWindowElement.style.top = (screenCenterY - halfHeight) + 'px';
      this._tracingWindowElement.style.bottom = (screenCenterY + halfHeight) + 'px';
      this._tracingWindowElement.style.width = this.tracingWindowWidth + 'px';
      this._tracingWindowElement.style.height = this.tracingWindowHeight + 'px';

      this.view.appendChild(this._tracingWindowElement);
    } else if (this._tracingWindowElement.parentElement) {
      this._tracingWindowElement.parentElement.removeChild(this._tracingWindowElement);
    }
  };

  /**
   * Manages the creation and deletion of tags via a tag editor DIV. If a tag
   * should be created on a virtual node, the virtual node is realized fist. From
   * http://blog.crazybeavers.se/wp-content/Demos/jquery.tag.editor
   */
  SkeletonAnnotations.Tag = new (function() {
    this.tagbox = null;

    this.RECENT_LABEL_COUNT = 5;
    this.recentLabels = [];

    this.hasTagbox = function() {
      return this.tagbox !== null;
    };

    this.removeTagbox = function() {
      // Remove ATN change listener, if any
      SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
          this.handleATNChange);
      // Remove tag box, if any
      if (this.tagbox) {
        this.tagbox.remove();
        this.tagbox = null;
      }
    };

    this.pushRecentLabel = function (label) {
      var oldIndex = this.recentLabels.indexOf(label);
      if (-1 !== oldIndex) {
        this.recentLabels.splice(oldIndex);
      }

      this.recentLabels.unshift(label);

      this.recentLabels.length = Math.min(this.recentLabels.length, this.RECENT_LABEL_COUNT);
    };

    this.tagATNwithLabel = function(label, tracingOverlay, deleteExisting) {
      return SkeletonAnnotations.Tag.tagATNwithLabels([label], tracingOverlay, deleteExisting);
    };

    this.tagATNwithLabels = function(labels, tracingOverlay, deleteExisting) {
      var nodeType = SkeletonAnnotations.getActiveNodeType();
      var nodeId; // Will be set in promise

      var prepare = SkeletonAnnotations.atn.promise().then(function(treenodeId) {
        nodeId = treenodeId;
        return tracingOverlay.submit();
      });

      var result = prepare.then(function() {
        // If preparation went well, nodeId will be set
        var command = new CATMAID.AddTagsToNodeCommand(project.id, nodeId,
            nodeType, labels, deleteExisting);
        // Make sure a tracing layer update is done after execute and undo
        command.postAction = tracingOverlay.updateNodes.bind(tracingOverlay,
           undefined, undefined, undefined);
        return CATMAID.commands.execute(command);
      }).then(function(result) {
        if (result.deletedLabels.length > 0) {
          CATMAID.info('Tag(s) removed: ' + result.deletedLabels.join(', '));
        }
        if (result.newLabels.length > 0) {
          CATMAID.info('Tag(s) added: ' + result.newLabels.join(', '));
        }
        if (result.duplicateLabels.length > 0) {
          CATMAID.info('These tags exist already: ' + result.duplicateLabels.join(', '));
        }
      });
    };

    this.removeATNLabel = function(label, tracingOverlay) {
      var nodeType = SkeletonAnnotations.getActiveNodeType();
      var nodeId; // Will be set in promise

      var prepare = SkeletonAnnotations.atn.promise().then(function(treenodeId) {
        nodeId = treenodeId;
        tracingOverlay.submit();
      });

      return prepare.then(function() {
        var command = new CATMAID.RemoveTagFromNodeCommand(project.id, nodeId,
            nodeType, label, false);
        // Make sure a tracing layer update is done after execute and undo
        command.postAction = tracingOverlay.updateNodes.bind(tracingOverlay,
           undefined, undefined, undefined);
        return CATMAID.commands.execute(command);
      }).then(function(result) {
        CATMAID.info('Tag "' + result.deletedLabels.join(', ') + '" removed.');
        tracingOverlay.updateNodes();
      }).catch(function(err) {
        if ("ValueError" === err.type) {
          CATMAID.msg('Error', err.error ? err.error : "Unspecified");
        } else if (err.error) {
          CATMAID.error(err.error, err.detail);
        } else {
          CATMAID.error(err);
        }
        return true;
      });
    };

    this.handleATNChange = function(activeNode) {
      if (!activeNode || activeNode.id === null) {
        // If no node is active anymore, destroy the tag box.
        this.removeTagbox();
      }
    };

    this.handleTagbox = function(atn, tracingOverlay) {
      SkeletonAnnotations.atn.promise().then((function() {
        var atnID = SkeletonAnnotations.getActiveNodeId();
        var stackViewer = tracingOverlay.stackViewer;
        var stack = stackViewer.primaryStack;
        var screenOrigin = stackViewer.screenPosition();
        var screenPos = [
          stackViewer.scale * stack.anisotropy(0).x *
            (stack.projectToUnclampedStackX(atn.z, atn.y, atn.x) - screenOrigin.left),
          stackViewer.scale * stack.anisotropy(0).y *
            (stack.projectToUnclampedStackY(atn.z, atn.y, atn.x) - screenOrigin.top),
        ];
        this.tagbox = $("<div class='tagBox' id='tagBoxId" + atnID +
            "' style='z-index: 8; border: 1px solid #B3B2B2; padding: 5px; left: " +
            screenPos[0] + "px; top: " + screenPos[1] + "px;' />");
        this.tagbox.append("Tag: ");
        var input = $("<input id='Tags" + atnID + "' name='Tags' type='text' value='' />");
        this.tagbox.append(input).append("<div style='color:#949494'>(Save&Close: <kbd>Enter</kbd>)</div>");

        if (this.recentLabels.length) {
          this.tagbox.append($("<span style='color:#949494'>Recent: </span>"));
          this.tagbox.append(this.recentLabels
              .sort(CATMAID.tools.compareStrings)
              .map(function (label) {
                  return $("<button>" + label + "</button>").on('pointerdown', function () {
                    input.tagEditorAddTag(label);
                    return false;
                  });
                }, this));
        }

        this.tagbox
          .css('background-color', 'white')
          .css('position', 'absolute')
          .appendTo("#" + tracingOverlay.view.id)

          .on('pointerdown', function (event) {
            if ("" === input.tagEditorGetTags()) {
              SkeletonAnnotations.Tag.updateTags(tracingOverlay);
              SkeletonAnnotations.Tag.removeTagbox();
              tracingOverlay.updateNodes();
            }
            event.stopPropagation();
          })

          .keydown(function (event) {
            if ('Enter' === event.key) {
              event.stopPropagation();
              var val = input.val().trim();
              if ("" === val) {
                SkeletonAnnotations.Tag.updateTags(tracingOverlay);
                SkeletonAnnotations.Tag.removeTagbox();
                tracingOverlay.updateNodes();
              } else {
                SkeletonAnnotations.Tag.pushRecentLabel(val);
              }
            }
          })

          .keyup(function (event) {
            if ('Escape' === event.key) {
              event.stopPropagation();
              SkeletonAnnotations.Tag.removeTagbox();
            }
          });

        // Register to change events of active treenode
        SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
            this.handleATNChange, this);

        var nodeId = atn.id, nodeType = atn.type;
        tracingOverlay.submit().then(function() {
          return CATMAID.Labels.forNode(project.id, nodeId, nodeType);
        }).then(function(labels) {
          input.tagEditor({
            items: labels,
            confirmRemoval: false,
            completeOnSeparator: true
          });
          input.focus();

          // Add autocompletion, only request after tagbox creation.
          tracingOverlay.submit().then(function() {
            return CATMAID.Labels.listAll(project.id);
          }).then(function(labels) {
            // Only display the first 20 matches in the autocompletion list.
            input.autocomplete({source: function (request, result) {
              var matches = $.ui.autocomplete.filter(labels, request.term);

              result(matches.slice(0, 20));
            }});
          });
        });

      }).bind(this));
    };

    /**
     * Return whether a string is empty or not.
     */
    var isNonEmpty = function(str) {
      return 0 !== str.trim().length;
    };

    this.updateTags = function(tracingOverlay) {
      var atn = SkeletonAnnotations.atn;
      if (null === atn.id) {
        CATMAID.error("Can't update tags, because there is no active node selected.");
        return;
      }
      var tags = $("#Tags" + atn.id).tagEditorGetTags().split(",");
      tags = tags.filter(isNonEmpty);
      // Since the tag box represents all tags at once, all tags not in this list
      // can be removed.
      SkeletonAnnotations.Tag.tagATNwithLabels(tags, tracingOverlay, true);
    };

    this.tagATN = function(tracingOverlay) {
      var atn = SkeletonAnnotations.atn;
      if (null === atn.id) {
        alert("Select a node first!");
        return;
      }
      if (this.tagbox) {
        CATMAID.msg('BEWARE', 'Close tagbox first before you tag another node!');
        return;
      }
      if (!tracingOverlay.isInView(atn.x, atn.y, atn.z)) {
        var self = this;
        tracingOverlay.goToNode(atn.id,
            function() {
              self.handleTagbox(atn, tracingOverlay);
            });
      } else {
        this.handleTagbox(atn, tracingOverlay);
      }
    };
  })();

  /**
   * Both fast split and merge mode allow the configuration of filters for when
   * split and merges can happen without user confirmation.
   */
  SkeletonAnnotations.FastMergeMode = new CATMAID.SkeletonNodeMatcher();
  SkeletonAnnotations.FastSplitMode = new CATMAID.SkeletonNodeMatcher();

  /**
   * Controls the visibility of groups of skeleton IDs defined by filters.
   */
  SkeletonAnnotations.VisibilityGroups = new (function () {
    this.GROUP_IDS = {
      OVERRIDE: 0,
      GROUP_1: 1,
      GROUP_2: 2,
    };

    this.groups = Object.keys(this.GROUP_IDS).map(function (groupName, groupID) {
      return {
        metaAnnotationName: null,
        creatorID: null,
        skeletonIDs: new Set(),
        matchAll: false,
        visible: groupName === 'OVERRIDE',
        invert: false,
        callback: (function (metaAnnotationName, skeletonIDs) {
          this.groups[groupID].skeletonIDs = skeletonIDs;
        }).bind(this),
      };
    }, this);

    /**
     * Refresh any meta-annotation-based filters from the backed.
     */
    this.refresh = function () {
      var jobs = [];
      this.groups.forEach(function (group) {
        if (group.metaAnnotationName) {
          jobs.push(CATMAID.annotatedSkeletons.refresh(group.metaAnnotationName, true));
        }
      });
      return Promise.all(jobs);
    };

    /**
     * Set the filters defining a visibility group.
     * @param {number} groupID      ID of the group to set, from GROUP_IDS.
     * @param {Object} groupSetting The filter defining the group. If keyed by
     *                              'universal', may match 'all' or 'none'. May be
     *                              keyed by 'metaAnnotationName' to a string
     *                              name of the meta-annotation to match. May be
     *                              keyed by 'creatorID' to the numeric ID of the
     *                              creation user to match. May be keyed by
     *                              'invert' to a boolean to indicate if the
     *                              filter rule should inverted.
     */
    this.setGroup = function (groupID, groupSetting) {
      var group = this.groups[groupID];

      if (group.metaAnnotationName !== null) {
        CATMAID.annotatedSkeletons.unregister(group.metaAnnotationName, group.callback, true);
      }

      group.skeletonIDs = new Set();
      group.metaAnnotationName = null;
      group.creatorID = null;
      group.matchAll = false;
      if (groupSetting.hasOwnProperty('metaAnnotationName')) {
        group.metaAnnotationName = groupSetting.metaAnnotationName;
        CATMAID.annotatedSkeletons.register(group.metaAnnotationName, group.callback, true);
      } else if (groupSetting.hasOwnProperty('creatorID')) {
        group.creatorID = groupSetting.creatorID;
      } else if (groupSetting.hasOwnProperty('universal')) {
        group.matchAll = groupSetting.universal === 'all';
      }
      group.invert = groupSetting.hasOwnProperty('invert') ? groupSetting.invert : false;
    };

    /**
     * Predicate for whether a tracing overlay node is matched by a group. Note
     * that for connector nodes this will only determine if the connector node
     * itself is matched by the group; it is the connector node's responsibility
     * to determine whether it is transitively matched by a group through linked
     * treenodes.
     *
     * @param  {number} groupID  ID of the group to query, from GROUP_IDS.
     * @param  {Object}  node    Tracing overlay treenode or connector node.
     * @return {Boolean}         True if matched, false otherwise.
     */
    this.isNodeInGroup = function (groupID, node) {
      var group = this.groups[groupID];

      let result;
      if (group.matchAll) result = true;
      else if (group.creatorID) result = node.user_id === group.creatorID;
      else result = group.skeletonIDs.has(node.skeleton_id);

      if (group.invert) return !result;
      else return result;
    };

    /**
     * Determines whether an ordered list of group memberships is visible based
     * upon current hidden group toggle state.
     *
     * @param  {number[]} groupIDs Ordered list of group IDs, from GROUP_IDS.
     * @return {Boolean}           True if visible, false otherwise.
     */
    this.areGroupsVisible = function (groupIDs) {
      if (!groupIDs || groupIDs.length === 0) return true;

      for (var i = groupIDs.length - 1; i >= 0; i--) {
        if (this.groups[groupIDs[i]].visible) return true;
      }

      return false;
    };

    /**
     * Toggle the visibility of a hidden group.
     *
     * @param  {number} groupID  ID of the group to toggle, from GROUP_IDS.
     */
    this.toggle = function (groupID) {
      this.groups[groupID].visible = !this.groups[groupID].visible;

      project.getStackViewers().forEach(function(sv) {
        var overlay = SkeletonAnnotations.getTracingOverlay(sv.getId());
        if (overlay) overlay.updateVisibilityForAllNodes();
      });
    };

  })();

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, function () {
    CATMAID.annotations.update()
      .then(() => {
        SkeletonAnnotations.VisibilityGroups.refresh();
        CATMAID.TracingOverlay.Settings.session.visibility_groups.forEach(function (group, i) {
          SkeletonAnnotations.VisibilityGroups.setGroup(i, group);
        });
        SkeletonAnnotations.FastMergeMode.refresh();
        SkeletonAnnotations.FastMergeMode.setFilters(
            SkeletonAnnotations.Settings.session.fast_merge_mode);
        SkeletonAnnotations.FastSplitMode.refresh();
        SkeletonAnnotations.FastSplitMode.setFilters(
            SkeletonAnnotations.Settings.session.fast_split_mode);
    })
    .catch(CATMAID.handleError);
  });


  /**
   * Automatically annotate skeletons on creation or edition.
   *
   * This is just a thin convenience wrapper around skeleton events.
   */
  SkeletonAnnotations.AutoAnnotator = new (function () {
    this.rules = new Map();

    /**
     * Register an auto annotation rule.
     *
     * @param  {string}   identifier      Unique name of the rule to create.
     * @param  {function} predicate       Predicate taking a skeletonID, returning
     *                                    a boolean indicated whether to add the
     *                                    annotations.
     * @param  {string[]} annotationNames An array of annotation names that will
     *                                    be added if the predicate is true.
     */
    this.register = function (identifier, predicate, annotationNames) {
      if (!Array.isArray(annotationNames)) {
        annotationNames = [annotationNames];
      }

      var callback = function (skeletonId) {
        if (predicate(skeletonId)) {
          CATMAID.Annotations.add(project.id,
                                  null,
                                  [skeletonId],
                                  annotationNames,
                                  null);
          annotationNames.forEach(function (annotationName) {
            CATMAID.annotatedSkeletons.explicitChange(annotationName, [skeletonId], []);
          });
        }
      };

      this.rules.set(identifier, {
          callback: callback,
          predicate: predicate,
          annotationNames: annotationNames});

      CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED, callback);
    };

    /**
     * Remove an auto annotation rule.
     * @param  {string} identifier Unique name of the rule to remove.
     */
    this.unregister = function (identifier) {
      var rule = this.rules.get(identifier);

      if (!rule) return;
      this.rules.delete(identifier);

      CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED, rule.callback);
    };

    /**
     * Remove all auto annotation rules.
     */
    this.unregisterAll = function () {
      this.rules.forEach(function(val, key) { this.unregister(key); }, this);
    };

    /**
     * Create auto annotation rules from settings, removing any existing rules
     * created due to settings.
     */
    this.loadFromSettings = function () {
      this.rules.forEach(function (val, identifier) {
        if (identifier.startsWith('autoAnnotation')) {
          this.unregister(identifier);
        }
      }, this);
      SkeletonAnnotations.Settings.session.auto_annotations.forEach(
          function (autoAnnotation, i) {
            if (autoAnnotation.annotationNames) {
              this.register(
                  'autoAnnotation' + i,
                  function () { return true; },
                  autoAnnotation.annotationNames);
            }
          }, this);
    };
  })();

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, function () {
    SkeletonAnnotations.AutoAnnotator.unregisterAll();
    SkeletonAnnotations.AutoAnnotator.loadFromSettings();
  });

})(CATMAID);
