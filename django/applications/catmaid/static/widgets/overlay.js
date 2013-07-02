/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/** Contains the current state of skeleton annotations. */
var SkeletonAnnotations = {
  /** A table of stack vs SVGOverlay instances.
   * The SVGOverlay construct adds the new instance here,
   * and the SVGOVerlay.destroy() removes it. */
  SVGOverlays : {},

  atn_fillcolor : "rgb(0, 255, 0)",

  /** Data of the active Treenode or ConnectorNode */
  atn : {
    id: null,
    type: null,
    skeleton_id: null,
    x: null,
    y: null,
    z: null,
    parent_id: null
  },

  submit : submitterFn(),

  TYPE_NODE : "treenode",
  TYPE_CONNECTORNODE : "connector"
};

SkeletonAnnotations.MODES = Object.freeze({SKELETON: 0, SYNAPSE: 1});
SkeletonAnnotations.currentmode = SkeletonAnnotations.MODES.skeleton;

SkeletonAnnotations.atn.set = function(node) {
  if (node) {
    this.id = node.id;
    this.skeleton_id = node.skeleton_id;
    this.type = node.type;
    this.x = node.x;
    this.y = node.y;
    this.z = node.z;
    this.parent_id = node.parent ? node.parent.id : null;
  } else {
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
};

SkeletonAnnotations.getSVGOverlay = function(stack) {
  return this.SVGOverlays[stack];
};


SkeletonAnnotations.getSVGOverlayByPaper = function(paper) {
  for (var stackID in this.SVGOverlays) {
    if (this.SVGOverlays.hasOwnProperty(stackID)) {
      var s = this.SVGOverlays[stackID];
      if (paper === s.paper) {
        return s;
      }
    }
  }
  return null;
};

/** Select a node in any of the existing SVGOverlay instances, by its ID and its skeletonID. If it is a connector node, it expects a null skeletonID. */
SkeletonAnnotations.staticSelectNode = function(nodeID) {
  for (var stack in this.SVGOverlays) {
    if (this.SVGOverlays.hasOwnProperty(stack)) {
      return this.SVGOverlays[stack].selectNode(nodeID);
    }
  }
  statusBar.replaceLast("Could not find node #" + nodeID);
};

/** Move to a location, ensuring that any edits to node coordinates are pushed to the database. After the move, the fn is invoked. */
SkeletonAnnotations.staticMoveTo = function(z, y, x, fn) {
  for (var stack in this.SVGOverlays) {
    if (this.SVGOverlays.hasOwnProperty(stack)) {
      return this.SVGOverlays[stack].moveTo(z, y, x, fn);
    }
  }
  statusBar.replaceLast("Could not find node #" + nodeID);
};

SkeletonAnnotations.getActiveNodeId = function() {
  return this.atn.id;
};

SkeletonAnnotations.getActiveSkeletonId = function() {
  return this.atn.skeleton_id;
};

SkeletonAnnotations.getActiveNodeType = function() {
  return this.atn.type;
};

SkeletonAnnotations.getActiveNodeColor = function() {
  return this.atn_fillcolor;
};

SkeletonAnnotations.getActiveNodePosition = function() {
  if (null === this.atn.id) {
    return null;
  } else {
    return {'x': this.atn.x, 'y': this.atn.y, 'z': this.atn.z};
  }
};

/**
 * Open the skeleton node in the Object Tree if the Object Tree is visible
 * and if the Object Tree synchronize_object_tree checkbox is checked.
 */
SkeletonAnnotations.openSkeletonNodeInObjectTree = function(node) {
  // Check if the Object Tree div is visible
  if ($('#object_tree_widget').css('display') === "none" || ! $('#synchronize_object_tree').attr('checked')) {
    return;
  }
  // Else, synchronize:
  if (node) {
    ObjectTree.requestOpenTreePath(node.skeleton_id);
  }
};

SkeletonAnnotations.refreshAllWidgets = function() {
  if ($('#connectortable_widget').css('display') === "block" && $('#synchronize_connectortable').attr('checked')) {
    ConnectorTable.init( project.getId() );
  }

  if ($('#treenode_table_widget').css('display') === "block" && $('#synchronize_treenodetable').attr('checked')) {
    TreenodeTable.init( project.getId() );
  }

  if (NeuronStagingArea.is_widget_open()) {
    NeuronStagingArea.highlight_skeleton(this.atn.skeleton_id);
  }
};

SkeletonAnnotations.exportSWC = function() {
  if (!this.atn.id || !this.atn.skeleton_id) {
    alert('Need to activate a treenode before exporting to SWC!');
    return;
  }
  // Retrieve SWC file of currently active treenode's skeleton
  var recipe = window.open('', 'RecipeWindow', 'width=600,height=600');

  requestQueue.register(django_url + project.id + '/skeleton/' + this.atn.skeleton_id + '/swc', "POST", {}, function (status, text, xml) {
    if (status === 200) {
      $('#recipe1').clone().appendTo('#myprintrecipe');
      var html = "<html><head><title>Skeleton as SWC</title></head><body><pre><div id='myprintrecipe'>" + text + "</div></pre></body></html>";
      recipe.document.open();
      recipe.document.write(html);
      recipe.document.close();
    }
  });
};

SkeletonAnnotations.setTracingMode = function (mode) {
  // toggles the button correctly
  // might update the mouse pointer
  document.getElementById("trace_button_skeleton").className = "button";
  document.getElementById("trace_button_synapse").className = "button";

  switch (mode) {
    case this.MODES.SKELETON:
      this.currentmode = mode;
      document.getElementById("trace_button_skeleton").className = "button_active";
      break;
    case this.MODES.SYNAPSE:
      this.currentmode = mode;
      document.getElementById("trace_button_synapse").className = "button_active";
      break;
  }
};


/**
* Execute the function fn if the skeleton
* has more than one node and the dialog is confirmed,
* or has a single node (no dialog pops up).
* The verb is the action to perform, as written as a question in a dialog
* to confirm the action if the skeleton has a single node.
*/
SkeletonAnnotations.maybeExecuteIfSkeletonHasMoreThanOneNode = function(node_id, verb, fn) {
  SkeletonAnnotations.submit(
      django_url + project.id + '/skeleton/node/' + node_id + '/node_count',
      {},
      function(json) {
        if (json.count > 1 && !confirm("Do you really want to " + verb + " skeleton #" + json.skeleton_id + ", which has more than one node?")) {
          return;
        }
        fn();
      });
};

SkeletonAnnotations.updateNeuronNameLabel = function(stackID) {
  var skeletonID = this.getActiveSkeletonId();
  if (!skeletonID) return;
  this.submit(
      django_url + project.id + '/skeleton/' + skeletonID + '/neuronname',
      {},
      function(json) {
        SkeletonAnnotations.setNeuronNameInTopbar(stackID, json['neuronname'], skeletonID);
      });
};

SkeletonAnnotations.renameNeuron = function(stackID) {
  var skeletonID = this.getActiveSkeletonId();
  if (!skeletonID) return;
  this.submit(
      django_url + project.id + '/skeleton/' + skeletonID + '/neuronname',
      {},
      function(json) {
          var new_name = prompt("Change neuron name", json['neuronname']);
          if (!new_name) return;
          SkeletonAnnotations.submit(
            django_url + project.id + '/object-tree/instance-operation',
            {operation: "rename_node",
             id: json['neuronid'],
             title: new_name,
             classname: "neuron",
             pid: project.id},
            function(json) {
              SkeletonAnnotations.setNeuronNameInTopbar(stackID, new_name, skeletonID);
              SkeletonAnnotations.refreshAllWidgets();
            });
      });
};


/** The constructor for SVGOverlay. */
SkeletonAnnotations.SVGOverlay = function(stack) {
  this.stack = stack;

  // Register instance
  SkeletonAnnotations.SVGOverlays[stack] = this;

  /** The ID vs Node or ConnectorNode instance. */
  this.nodes = {};
  /** The DOM elements representing node labels. */
  this.labels = {};
  /** Toggle for text labels on nodes and connectors. */
  this.show_labels = false;

  /* Variables keeping state for toggling between a terminal and its connector. */
  this.switchingConnectorID = null;
  this.switchingTreenodeID = null;

  /* lastX, lastY: for the 'z' key to know where was the mouse.
   * offsetXPhysical, offsetYPhysical: offset of stack in physical coordinates */
  this.coords = {lastX: null, lastY: null,
                 offsetXPhysical: 0, offsetYPhysical: 0};

  /* padding beyond screen borders for fetching data and updating nodes */
  this.PAD = 256;
 
  /* old_x and old_y record the x and y position of the stack the
     last time that an updateNodes request was made.  When panning
     the stack, these are used to tell whether the user has panned
     far enough to merit issuing another updateNodes. */
  this.old_x = stack.x;
  this.old_y = stack.y;

  this.view = document.createElement("div");
  this.view.className = "sliceSVGOverlay";
  this.view.id = "sliceSVGOverlayId" + stack.getId();
  this.view.style.zIndex = 5;
  // Custom cursor for tracing
  this.view.style.cursor ="url(" + STATIC_URL_JS + "widgets/themes/kde/svg-circle.cur) 15 15, crosshair";
  this.view.onmousemove = this.createViewMouseMoveFn(this.stack, this.coords);

  this.paper = Raphael(this.view, Math.floor(stack.dimension.x * stack.scale), Math.floor(stack.dimension.y * stack.scale));
  this.graphics = new SkeletonElements(this.paper);
};

SkeletonAnnotations.setNeuronNameInTopbar = function(stackID, neuronName, skeletonID) {
  $('#neuronName' + stackID).text(neuronName + ' (Skeleton ID: '+ skeletonID +')');
};


SkeletonAnnotations.SVGOverlay.prototype = new function() {
  /** The original list of nodes; beware the instance of the list will change,
   * the contents of any one instance may change,
   * and the data of the nodes will change as they are recycled. */
  this.getNodes = function() {
    return this.nodes;
  };

  this.getStack = function() {
    return this.stack;
  };

  this.createViewMouseMoveFn = function(stack, coords) {
    return function(e) {
      var wc;
      var worldX, worldY;
      var m = ui.getMouse(e, stack.getView(), true);
      if (m) {
        wc = stack.getWorldTopLeft();
        worldX = wc.worldLeft + ((m.offsetX / stack.scale) * stack.resolution.x);
        worldY = wc.worldTop + ((m.offsetY / stack.scale) * stack.resolution.y);
        coords.lastX = worldX;
        coords.lastY = worldY;
        statusBar.printCoords('['+worldX+', '+worldY+', '+project.coordinates.z+']');
        coords.offsetXPhysical = worldX;
        coords.offsetYPhysical = worldY;
      }
    };
  };

  /** This returns true if focus had to be switched; typically if
      the focus had to be switched, you should return from any event
      handling, otherwise all kinds of surprising bugs happen...  */
  this.ensureFocused = function() {
    var win = this.stack.getWindow();
    if (win.hasFocus()) {
      return false;
    } else {
      win.focus();
      return true;
    }
  };

  this.destroy = function() {
    // Unregister instance
    delete SkeletonAnnotations.SVGOverlays[this.stack];
    // Release
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
    if (this.view) {
      this.view.onmousemove = null;
      this.view.onmousedown = null;
      this.view = null;
    }
  };

  /**
   * Activates the given node id if it exists
    in the current retrieved set of nodes.
   */
  this.selectNode = function(id) {
    var node = this.nodes[id];
    if (node) {
      this.activateNode(node);
    }
  };

  /**
   * Find connectors pre- and postsynaptic to the given node ID.
   * Returns an array of two arrays, containing IDs of pre and post connectors.
   */
  this.findConnectors = function(node_id) {
    var pre = [];
    var post = [];
    for (var id in this.nodes) {
      if (this.nodes.hasOwnProperty(id)) {
        var node = this.nodes[id];
        if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
          if (node.pregroup.hasOwnProperty(node_id)) {
            pre.push(parseInt(id));
          } else if (node.postgroup.hasOwnProperty(node_id)) {
            post.push(parseInt(id));
          }
        }
      }
    }
    return [pre, post];
  };

  this.recolorAllNodes = function () {
    // Assumes that atn and active_skeleton_id are correct:
    for (var nodeID in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeID)) {
        this.nodes[nodeID].updateColors();
      }
    }
  };

  this.activateNode = function(node) {
    var atn = SkeletonAnnotations.atn;
    if (node) {
      // Check if the node is already selected/activated
      if (node.id === atn.id && node.skeleton_id === atn.skeleton_id) {
        // Update coordinates
        atn.set(node);
        return;
      }
      // Else, select the node
      if (SkeletonAnnotations.TYPE_NODE === node.type) {
        // Update statusBar
        statusBar.replaceLast("Activated treenode with id " + node.id + " and skeleton id " + node.skeleton_id);
        // If changing skeletons:
        if (atn.skeleton_id !== node.skeleton_id) {
          // 1. Open the object tree node if synchronizing:
          SkeletonAnnotations.openSkeletonNodeInObjectTree(node);
          // 2. Update the status with the ancestry of that skeleton:
          var stackID = this.stack.getId();
          SkeletonAnnotations.submit(
              django_url + project.id + '/skeleton/ancestry',
              {pid: project.id,
               skeleton_id: node.skeleton_id},
              function(json) {
                var message = "Activated treenode with id " + node.id + " and skeleton id " + node.skeleton_id;
                for (var i = 0, len = json.length; i < len; ++i) {
                  message += " <i>part_of</i> [<strong>" + json[i].name + "</strong>]";
                }
                statusBar.replaceLastHTML(message);
                SkeletonAnnotations.setNeuronNameInTopbar(stackID, json[0].name, node.skeleton_id);
                project.selectedObjects.selectedneuron = json[0].id;
                project.selectedObjects.selectedskeleton = parseInt(node.skeleton_id);
              });
        }

        atn.set(node);
        this.recolorAllNodes();

        // refresh all widgets except for the object tree
        // the reason is that calling a refresh just after a request to open tree path
        // prevents the opening of the tree path. thus, the opening of the treepath
        // and/or refresh have to be added to the individual operation's
        // (such as split tree) callbacks
        SkeletonAnnotations.refreshAllWidgets();
      } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
        statusBar.replaceLast("Activated connector node #" + node.id);
        atn.set(node);
        this.recolorAllNodes();
      }
    } else {
      // Deselect
      atn.set(null);
      // Deselect all from Object Tree. It is necessary because the neuron ID
      // would be used to create the next skeleton, and it would fail
      // if the neuron doesn't exist.
      project.setSelectObject( null, null );
      $('#tree_object').jstree("deselect_all");
      this.recolorAllNodes();
    }

    if ($("#view_in_3d_webgl_widget").length) {
      // if displayed in 3d viewer, update position
      WebGLApp.showActiveNode();
      WebGLApp.updateActiveNodePosition();
    }
  };

  /** Activate the node nearest to the mouse. */
  this.activateNearestNode = function () {
    var x = this.coords.lastX,
        y = this.coords.lastY,
        z = project.coordinates.z;
    var nearestnode = this.findNodeWithinRadius(x, y, z, Number.MAX_VALUE);
    if (nearestnode) {
      var physZ = this.pix2physZ(nearestnode.z);
      if (physZ >= z && physZ < z + this.stack.resolution.z) {
        this.activateNode(nearestnode);
      } else {
        statusBar.replaceLast("No nodes were visible in the current section - can't activate the nearest");
      }
    }
    return nearestnode;
  };

  this.findNodeWithinRadius = function (x, y, z, radius) {
    var xdiff, ydiff, zdiff, distsq, mindistsq = radius * radius, nearestnode = null, node, nodeid;
    for (nodeid in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeid)) {
        node = this.nodes[nodeid];
        xdiff = x - this.pix2physX(node.x);
        ydiff = y - this.pix2physY(node.y);
        zdiff = z - this.pix2physZ(node.z);
        distsq = xdiff*xdiff + ydiff*ydiff + zdiff*zdiff;
        if (distsq < mindistsq) {
          mindistsq = distsq;
          nearestnode = node;
        }
      }
    }
    return nearestnode;
  };

  /** Remove and hide all node labels. */
  this.hideLabels = function() {
    document.getElementById( "trace_button_togglelabels" ).className = "button";
    this.removeLabels();
    this.show_labels = false;
  };

  /** Remove all node labels in the view.
   *  Empty the node labels array. */
  this.removeLabels = function() {
    for (var labid in this.labels) {
      if (this.labels.hasOwnProperty(labid)) {
        this.labels[labid].remove();
      }
    }
    this.labels = {};
  };

  this.getLabelStatus = function() {
    return this.show_labels;
  };

  this.showLabels = function() {
    this.show_labels = true;
    this.updateNodes(function() {
      document.getElementById( "trace_button_togglelabels" ).className = "button_active";
    });
  };

  this.toggleLabels = function() {
    if (this.getLabelStatus()) {
      this.hideLabels();
    } else {
      this.showLabels();
    }
  };

  this.checkLoadedAndIsNotRoot = function(nodeID) {
    if (null === nodeID || !this.nodes.hasOwnProperty(nodeID)) {
      growlAlert("Warning", "Cannot find node with ID " + nodeID);
      return false;
    }
    if (this.nodes[nodeID].isroot) {
      growlAlert("Information", "Node is already root!");
      return false;
    }
    return true;
  };

  this.rerootSkeleton = function(nodeID) {
    if (!this.checkLoadedAndIsNotRoot(nodeID)) return;
    if (!confirm("Do you really want to to reroot the skeleton?")) return;
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/skeleton/reroot',
        {treenode_id: nodeID},
        function() { self.updateNodes(); } );
  };

  this.splitSkeleton = function(nodeID) {
    if (!this.checkLoadedAndIsNotRoot(nodeID)) return;
    if (!confirm("Do you really want to split the skeleton?")) return;
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/skeleton/split',
        { treenode_id: nodeID },
        function () {
          self.updateNodes();
          ObjectTree.refresh();
          SkeletonAnnotations.refreshAllWidgets();
          self.selectNode(nodeID);
        },
        true); // block UI
  };

  // Used to join two skeletons together
  // Permissions are checked at the server side, returning an error if not allowed.
  this.createTreenodeLink = function (fromid, toid) {
    if (fromid === toid) return;
    if (!this.nodes.hasOwnProperty(toid)) return;
    var self = this;
    SkeletonAnnotations.maybeExecuteIfSkeletonHasMoreThanOneNode(
        toid,
        "join",
        function() {
          // The call to join will reroot the target skeleton at the shift-clicked treenode
          SkeletonAnnotations.submit(
            django_url + project.id + '/skeleton/join',
            {from_id: fromid,
             to_id: toid},
            function (json) {
              self.updateNodes(function() {
                ObjectTree.refresh();
                SkeletonAnnotations.refreshAllWidgets();
                self.selectNode(toid);
              });
            });
        });
  };

  this.createLink = function (fromid, toid, link_type) {
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/link/create',
        {pid: project.id,
         from_id: fromid,
         link_type: link_type,
         to_id: toid},
         function(json) {
           self.updateNodes();
         });
  };

  /** Create a single connector not linked to any treenode.
    *  If given a completionCallback function, it is invoked with one argument: the ID of the newly created connector. */
  this.createSingleConnector = function (phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, confval, completionCallback) {
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/connector/create',
        {pid: project.id,
         confidence: confval,
         x: phys_x,
         y: phys_y,
         z: phys_z},
        function(jso) {
          // add treenode to the display and update it
          var nn = self.graphics.newConnectorNode(jso.connector_id, pos_x, pos_y, pos_z, 0, 5 /* confidence */, true);
          self.nodes[jso.connector_id] = nn;
          nn.createGraphics();
          self.activateNode(nn);
          if (typeof completionCallback !== "undefined") {
            completionCallback(jso.connector_id);
          }
        });
  };

  /** Create a new postsynaptic treenode from a connector. Store new skeleton/neuron in Isolated synaptic terminals
   *  We create the treenode first, then we create the link from the connector. */
  this.createPostsynapticTreenode = function (connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {
    this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z, "postsynaptic_to");
  };

  this.createPresynapticTreenode = function (connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {
    // Check that connectorID doesn't have a presynaptic treenode already
    // (It is also checked in the server on attempting to create a link. Here, it is checked for convenience to avoid creating an isolated treenode for no reason.)
    var connectorNode = this.nodes[connectorID];
    if (Object.keys(connectorNode.pregroup).length > 0) {
      growlAlert("WARNING", "The connector already has a presynaptic node!");
      return;
    }
    this.createTreenodeWithLink(connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z, "presynaptic_to");
  };

  this.createTreenodeWithLink = function (connectorID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z, link_type) {
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/treenode/create',
        {pid: project.id,
         parent_id: -1,
         x: phys_x,
         y: phys_y,
         z: phys_z,
         radius: radius,
         confidence: confidence,
         targetgroup: "Isolated synaptic terminals"},
        function (jso) {
          var nid = parseInt(jso.treenode_id);
          // always create a new treenode which is the root of a new skeleton
          var nn = self.graphics.newNode(nid, null, null, radius, pos_x, pos_y, pos_z, 0, 5 /* confidence */, parseInt(jso.skeleton_id), true);
          // add node to nodes list
          self.nodes[nid] = nn;
          nn.createGraphics();
          // create link : new treenode postsynaptic_to or presynaptic_to deactivated connectorID
          self.createLink(nid, connectorID, link_type);
        });
  };

  /** Caters both to the createInterpolatedNode and createTreenodeLinkInterpolated functions, which are almost identical. */
  this.createInterpolatedNodeFn = function () {
    // Javascript is not multithreaded.
    // The only pseudo-threadedness occurs in the code execution between the AJAX request and the execution of the callback; that is, no concurrency, but continuations. Therefore altering the queue array is always safe.

    // Accumulate invocations of the createInterpolatedNode function
    var queue = [];

    // Function to handle the callback
    var handler = function (status, text, xml) {
      if (status !== 200) {
        queue.length = 0; // reset
        return false;
      }
      if (text && text !== " ") {
        var json = $.parseJSON(text);
        if (json.error) {
          alert(json.error);
          queue.length = 0; // reset
        } else {
          // Check if any calls have accumulated
          if (queue.length > 1) {
            // Remove this call
            queue.shift();
            // Invoke the oldest of any accumulated calls
            requester(json.treenode_id, queue[0]);
          } else {
            // Start a new continuation to update the nodes,
            // ensuring that the desired active node will be loaded
            // (Could not be loaded if the user scrolled away between
            // the creation of the node and its activation)
            var q = queue[0];
            q.self.updateNodes(function () {
              q.self.selectNode(json.treenode_id);
              // Remove this call now that the active node is set properly
              queue.shift();
              // Invoke the oldest of any accumulated calls
              if (queue.length > 0) {
                requester(json.treenode_id, queue[0]);
              }
            }, json.treenode_id);
          }
          if (json.has_changed_group) {
            ObjectTree.refresh();
          }
        }
      }
      return true;
    };

    // Function to request interpolated nodes
    var requester = function(parent_id, q) {
      var stack = q.self.getStack();
      // Creates treenodes from atn to new node in each z section
      var post = {
          pid: project.id,
          x: q.phys_x,
          y: q.phys_y,
          z: q.phys_z,
          resx: stack.resolution.x,
          resy: stack.resolution.y,
          resz: stack.resolution.z,
          stack_translation_z: stack.translation.z,
          stack_id: project.focusedStack.id
      };
      var url;
      if (q.nearestnode_id) {
        url = '/skeleton/join_interpolated';
        post.from_id = parent_id;
        post.to_id = q.nearestnode_id;
      } else {
        url = '/treenode/create/interpolated';
        post.parent_id = parent_id;
      }
      requestQueue.register(django_url + project.id + url, "POST", post, handler);
    };

    return function (phys_x, phys_y, phys_z, nearestnode_id) {
      queue.push({phys_x: phys_x,
                  phys_y: phys_y,
                  phys_z: phys_z,
                  nearestnode_id: nearestnode_id,
                  self: this});

      if (queue.length > 1) {
        return; // will be handled by the callback
      }

      if (!SkeletonAnnotations.getActiveNodeId()) {
          growlAlert("WARNING", "No node selected!");
          return;
      }
      requester(SkeletonAnnotations.getActiveNodeId(), queue[0]);
    }
  };

  /** Create a node and activate it. */
  this.createNode = function (parentID, phys_x, phys_y, phys_z, radius, confidence, pos_x, pos_y, pos_z) {
    if (!parentID) { parentID = -1; }

    // Check if we want the newly create node to be a model of an existing empty neuron
    var selneuron = project.selectedObjects.selectedneuron;
    var useneuron = null === selneuron ? -1 : selneuron;

    var self = this;

    SkeletonAnnotations.submit(
        django_url + project.id + '/treenode/create',
        {pid: project.id,
         parent_id: parentID,
         x: phys_x,
         y: phys_y,
         z: phys_z,
         radius: radius,
         confidence: confidence,
         targetgroup: "Fragments",
         useneuron: useneuron},
        function(jso) {
          // add treenode to the display and update it
          var nid = parseInt(jso.treenode_id);
          // The parent will be null if there isn't one or if the parent Node object is not within the set of retrieved nodes, but the parentID will be defined.
          var nn = self.graphics.newNode(nid, self.nodes[parentID], parentID, radius, pos_x, pos_y, pos_z, 0, 5 /* confidence */, parseInt(jso.skeleton_id), true);

          self.nodes[nid] = nn;
          nn.createGraphics();
          // Obtain active_node_z prior to altering atn
          var active_node_z = SkeletonAnnotations.atn.z;
          // Set atn to be the newly created node
          self.activateNode(nn);
          // ALREADY DONE by activate node // refreshAllWidgets();

          // Append to parent and recolor
          if (parentID) {
            var parentNode = self.nodes[parentID];
            if (parentNode) {
              parentNode.addChildNode(nn);
              parentNode.updateColors();
            }
          }

          // Check whether the Z coordinate of the new node is beyond one section away
          // from the Z coordinate of the parent node (which is the active by definition)
          if (active_node_z !== null && Math.abs(active_node_z - nn.z) > 1) {
            growlAlert('BEWARE', 'Node added beyond one section from its parent node!');
          }

          if (jso.has_changed_group) {
            ObjectTree.refresh();
          }
        });
  };

  /** Invoke the callback function after having pushed updated node coordinates
   * to the database. */
  this.updateNodeCoordinatesinDB = function (callback) {
    var update = {treenode: [],
                  connector: []};
    for (var nodeID in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeID)) {
        var node = this.nodes[nodeID];
        // only updated nodes that need sync, e.g.
        // when they changed position
        if (node.needsync) {
          node.needsync = false;
          update[node.type].push([node.id,
                                  this.pix2physX(node.x),
                                  this.pix2physY(node.y),
                                  this.pix2physZ(node.z)]);
        }
      }
    }
    if (update.treenode.length > 0 || update.connector.length > 0) {
      SkeletonAnnotations.submit(
          django_url + project.id + '/node/update',
          {t: update.treenode,
           c: update.connector},
          function(json) {
            if (typeof callback !== "undefined") {
              // Invoke the callback with the number of nodes that were updated
              callback(json);
            }
          });
    } else if (callback) {
      callback(0);
    }
  };


  /** Recreate all nodes (or reuse existing ones if possible).
   *
   * @param jso is an array of JSON objects, where each object may specify a Node or a ConnectorNode
   * @param pz is the z of the section in calibrated coordinates
   */
  this.refreshNodesFromTuples = function (jso, pz)
  {
    // Reset nodes and labels
    this.nodes = {};
    // remove labels, but do not hide them
    this.removeLabels();

    // Prepare existing Node and ConnectorNode instances for reuse
    this.graphics.resetCache();

    // Populate Nodes
    jso[0].forEach(function(a, index, array) {
      // a[0]: ID, a[1]: parent ID, a[2]: x, a[3]: y, a[4]: z, a[5]: confidence
      // a[8]: user_id, a[6]: radius, a[7]: skeleton_id, a[8]: user can edit or not
      this.nodes[a[0]] = this.graphics.newNode(
        a[0], null, a[1], a[6], this.phys2pixX(a[2]),
        this.phys2pixY(a[3]), this.phys2pixZ(a[4]),
        (a[4] - pz) / this.stack.resolution.z, a[5], a[7], a[8]);
    }, this);

    // Populate ConnectorNodes
    jso[1].forEach(function(a, index, array) {
      // a[0]: ID, a[1]: x, a[2]: y, a[3]: z, a[4]: confidence,
      // a[5]: presynaptic nodes as array of arrays with treenode id
      // and confidence, a[6]: postsynaptic nodes as array of arrays with treenode id
      // and confidence, a[7]: whether the user can edit the connector
      this.nodes[a[0]] = this.graphics.newConnectorNode(
        a[0], this.phys2pixX(a[1]),
        this.phys2pixY(a[2]), this.phys2pixZ(a[3]),
        (a[3] - pz) / this.stack.resolution.z, a[4], a[7]);
    }, this);

    // Disable any unused instances
    this.graphics.disableBeyond(jso[0].length, jso[1].length);

    // Now that all Node instances are in place, loop nodes again
    // and set correct parent objects and parent's children update
    jso[0].forEach(function(a, index, array) {
      var pn = this.nodes[a[1]]; // parent Node
      if (pn) {
        var nn = this.nodes[a[0]];
        // if parent exists, update the references
        nn.parent = pn;
        // update the parent's children
        pn.addChildNode(nn);
      }
    }, this);

    // Now that ConnectorNode and Node instances are in place,
    // set the pre and post relations
    jso[1].forEach(function(a, index, array) {
      // a[0] is the ID of the ConnectorNode
      var connector = this.nodes[a[0]];
      // a[5]: pre relation which is an array of arrays of tnid and tc_confidence
      a[5].forEach(function(r, i, ar) {
        // r[0]: tnid, r[1]: tc_confidence
        var tnid = r[0];
        var node = this.nodes[tnid];
        if (node) {
          // link it to pregroup, to connect it to the connector
          connector.pregroup[tnid] = {'treenode': node,
                                      'confidence': r[1]};
        }
      }, this);
      // a[6]: post relation which is an array of arrays of tnid and tc_confidence
      a[6].forEach(function(r, i, ar) {
        // r[0]: tnid, r[1]: tc_confidence
        var tnid = r[0];
        var node = this.nodes[tnid];
        if (node) {
          // link it to postgroup, to connect it to the connector
          connector.postgroup[tnid] = {'treenode': node,
                                       'confidence': r[1]};
        }
      }, this);
    }, this);

    // Draw node edges first
    for (var i in this.nodes) {
      if (this.nodes.hasOwnProperty(i)) {
        this.nodes[i].drawEdges();
      }
    }
    
    // Now that all edges have been created, disable unused arrows
    this.graphics.disableRemainingArrows();

    // Create raphael's circles on top of the edges
    // so that the events reach the circles first
    for (var i in this.nodes) {
      if (this.nodes.hasOwnProperty(i)) {
        // Will only create it or unhide it if the node is to be displayed
        this.nodes[i].createCircle();
      }
    }

    if (this.getLabelStatus()) {
      // For every node ID
      var m = jso[2];
      for (var nid in m) {
        if (m.hasOwnProperty(nid)) {
          var node = this.nodes[nid];
          this.labels[nid] = new OverlayLabel(nid, this.paper, node.x, node.y, m[nid]);
        }
      }
    }

    // Warn about nodes not retrieved because of limit
    if (true === jso[3]) {
      var msg = "Did not retrieve all visible nodes--too many! Zoom in to constrain the field of view.";
      statusBar.replaceLast("*WARNING*: " + msg);
      growlAlert('WARNING', msg);
    }
  };


  /* When we pass a completedCallback to redraw, it's essentially
     always because we want to know that, if any fetching of nodes
     was required for the redraw, those nodes have now been fetched.
     So, if we *do* need to call updateNodes, we should pass it the
     completionCallback.  Otherwise, just fire the
     completionCallback at the end of this method. */
  this.redraw = function( stack, completionCallback ) {
    var wc = this.stack.getWorldTopLeft();
    var pl = wc.worldLeft,
        pt = wc.worldTop,
        new_scale = wc.scale;
    
    // TODO: this should also check for the size of the containing
    // div having changed.  You can see this problem if you have
    // another window open beside one with the tracing overlay -
    // when you close the window, the tracing overlay window is
    // enlarged but will have extra nodes fetched for the exposed
    // area.

    var stack = this.stack;

    var doNotUpdate = stack.old_z == stack.z && stack.old_s == stack.s;
    if ( doNotUpdate )
    {
      var sPAD = this.PAD / stack.scale;
      var dx = this.old_x - stack.x;
      doNotUpdate = dx < sPAD && dx > -sPAD;
      
      if ( doNotUpdate )
      {
        var dy = this.old_y - stack.y;
        doNotUpdate = dy < sPAD && dy > -sPAD;
      }
    }

    if ( !doNotUpdate ) {
      this.updateNodes(completionCallback);
    }

    this.view.style.left = Math.floor((-pl / stack.resolution.x) * new_scale) + "px";
    this.view.style.top = Math.floor((-pt / stack.resolution.y) * new_scale) + "px";

    this.updatePaperDimensions(stack);
    if (doNotUpdate) {
      if (typeof completionCallback !== "undefined") {
        completionCallback();
      }
    }
  };

  // TODO This doc below is obsolete
  // This isn't called "onclick" to avoid confusion - click events
  // aren't generated when clicking in the overlay since the mousedown
  // and mouseup events happen in different divs.  This is actually
  // called from mousedown (or mouseup if we ever need to make
  // click-and-drag work with the left hand button too...)
  this.whenclicked = function (e) {
    if (this.ensureFocused()) {
      e.stopPropagation();
      return;
    }
    var m = ui.getMouse(e, this.view);

    if (!mayEdit()) {
      statusBar.replaceLast("You don't have permission.");
      e.stopPropagation();
      return;
    }

    // take into account current local offset coordinates and scale
    var pos_x = m.offsetX;
    var pos_y = m.offsetY;
    var pos_z = this.phys2pixZ(project.coordinates.z);

    // get physical coordinates for node position creation
    var phys_x = this.pix2physX(pos_x);
    var phys_y = this.pix2physY(pos_y);
    var phys_z = project.coordinates.z;

    var targetTreenodeID,
        atn = SkeletonAnnotations.atn;

    // e.metaKey should correspond to the command key on Mac OS
    if (e.ctrlKey || e.metaKey) {
      // ctrl-click deselects the current active node
      if (null !== atn.id) {
        statusBar.replaceLast("Deactivated node #" + atn.id);
      }
      $('#neuronName').text('');
      ObjectTree.deselectAll();
      this.activateNode(null);
      if (!e.shiftKey) {
        e.stopPropagation();
      } // else, a node under the mouse will be removed
    } else if (e.shiftKey) {
      if (null === atn.id) {
        if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.SKELETON) {
          growlAlert('BEWARE', 'You need to activate a treenode first (skeleton tracing mode)!');
          e.stopPropagation();
          return true;
        }
      } else {
        targetTreenodeID = atn.id;
        if (SkeletonAnnotations.TYPE_NODE === atn.type) {
          if (e.shiftKey) {
            var synapse_type = e.altKey ? 'post' : 'pre';
            statusBar.replaceLast("created connector, with " + synapse_type + "synaptic treenode id " + atn.id);
            var self = this;
            this.createSingleConnector(phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, 5,
                function (connectorID) {
                  self.createLink(targetTreenodeID, connectorID, synapse_type + "synaptic_to");
                });
            e.stopPropagation();
          }
          // Else don't stop propagation: the mouse functions of the node will be triggered
          return true;
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === atn.type) {
          // create new treenode (and skeleton) postsynaptic to activated connector
          statusBar.replaceLast("created treenode with id " + atn.id + "postsynaptic to activated connector");
          this.createPostsynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          e.stopPropagation();
          return true;
        }
      }
    } else {
      // depending on what mode we are in do something else when clicking
      if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.SKELETON) {
        if (SkeletonAnnotations.TYPE_NODE === atn.type || null === atn.id) {
          // Create a new treenode,
          // either root node if atn is null, or child if it is not null
          if (null !== atn.id) {
            statusBar.replaceLast("Created new node as child of node #" + atn.id);
          }
          this.createNode(atn.id, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          e.stopPropagation();
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === atn.type) {
          // create new treenode (and skeleton) presynaptic to activated connector
          // if the connector doesn't have a presynaptic node already
          this.createPresynapticTreenode(atn.id, phys_x, phys_y, phys_z, -1, 5, pos_x, pos_y, pos_z);
          e.stopPropagation();
        }
        // Else don't stop propagation: a node may be moved
        return true;
      } else if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.SYNAPSE) {
        // only create single synapses/connectors
        this.createSingleConnector(phys_x, phys_y, phys_z, pos_x, pos_y, pos_z, 5);
      }
    }
    e.stopPropagation();
    return true;
  };

  this.updatePaperDimensions = function () {
    var wi = Math.floor(this.stack.dimension.x * this.stack.scale);
    var he = Math.floor(this.stack.dimension.y * this.stack.scale);
    // update width/height with the dimension from the database, which is in pixel unit
    this.view.style.width = wi + "px";
    this.view.style.height = he + "px";
    // update the raphael canvas as well
    this.paper.setSize(wi, he);
  };

  this.phys2pixX = function (x) {
    return (x - this.stack.translation.x) / this.stack.resolution.x * this.stack.scale;
  };
  this.phys2pixY = function (y) {
    return (y - this.stack.translation.y) / this.stack.resolution.y * this.stack.scale;
  };
  this.phys2pixZ = function (z) {
    return (z - this.stack.translation.z) / this.stack.resolution.z;
  };
  this.pix2physX = function (x) {
    return this.stack.translation.x + ((x) / this.stack.scale) * this.stack.resolution.x;
  };
  this.pix2physY = function (y) {
    return this.stack.translation.y + ((y) / this.stack.scale) * this.stack.resolution.y;
  };
  this.pix2physZ = function (z) {
    return z *this.stack.resolution.z + this.stack.translation.z;
  };

  this.show = function () {
    this.view.style.display = "block";
  };

  this.hide = function () {
    this.view.style.display = "none";
  };

  /** Update treeline nodes by querying them from the server
   * with the bounding volume of the current view.
   * Will also push editions (if any) to nodes to the database. */
  this.updateNodes = function (callback, future_active_node_id)
  {
    var activeSkeleton = SkeletonAnnotations.getActiveSkeletonId();
    if (!activeSkeleton) {
      activeSkeleton = 0;
    }

    var self = this;

    this.updateNodeCoordinatesinDB(function () {
      // stack.viewWidth and .viewHeight are in screen pixels
      // so they must be scaled and then transformed to nanometers
      // and stack.x, .y are in absolute pixels, so they also must be brought to nanometers
      var atnid = -1; // cannot send a null
      var atntype = "";
      if (SkeletonAnnotations.getActiveNodeId() && SkeletonAnnotations.TYPE_NODE === SkeletonAnnotations.getActiveNodeType()) {
        if (future_active_node_id) {
          atnid = future_active_node_id;
        } else {
          atnid = SkeletonAnnotations.getActiveNodeId();
        }
      }

      var stack = self.stack;
      self.old_x = stack.x;
      self.old_y = stack.y;

      var pz = stack.z * stack.resolution.z + stack.translation.z;

      SkeletonAnnotations.submit(
        django_url + project.id + '/node/list',
        {pid: stack.getProject().id,
         sid: stack.getId(),
         z: pz,
         top: (stack.y - (stack.viewHeight / 2) / stack.scale) * stack.resolution.y + stack.translation.y,
         left: (stack.x - (stack.viewWidth / 2) / stack.scale) * stack.resolution.x + stack.translation.x,
         width: (stack.viewWidth / stack.scale) * stack.resolution.x,
         height: (stack.viewHeight / stack.scale) * stack.resolution.y,
         zres: stack.resolution.z,
         atnid: atnid,
         labels: self.getLabelStatus()},
        function(json) {
          self.refreshNodesFromTuples(json, pz);

          // initialization hack for "URL to this view"
          if (SkeletonAnnotations.hasOwnProperty('init_active_node_id')) {
            self.activateNode(self.nodes[SkeletonAnnotations.init_active_node_id]);
            delete SkeletonAnnotations.init_active_node_id;
          }

          stack.redraw();
          if (typeof callback !== "undefined") {
            callback();
          }
        },
        false,
        true);
    });
  };

  /** Set the confidence of the edge partig from the active node towards
   * either the parent or a connector.
   * If there is more than one connector, the confidence is set to all connectors. */
  this.setConfidence = function(newConfidence, toConnector) {
    var nodeID = SkeletonAnnotations.getActiveNodeId();
    if (!nodeID) return;
    var node = this.nodes[nodeID];
    if (!node || 'treenode' !== node.type) {
      return;
    }
    if (node.parent_id || toConnector) {
      var self = this;
      SkeletonAnnotations.submit(
          django_url + project.id + '/node/' + nodeID + '/confidence/update',
          {pid: project.id,
           to_connector: toConnector,
           tnid: nodeID,
           new_confidence: newConfidence},
          function(json) {
            self.updateNodes();
          });
    }
  };

  this.isIDNull = function(nodeID) {
    if (!nodeID) {
      growlAlert("Information", "Select a node first!");
      return true;
    }
    return false;
  };

  this.goToPreviousBranchOrRootNode = function(treenode_id, e) {
    if (this.isIDNull(treenode_id)) return;
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + "/node/previous_branch_or_root",
        {tnid: treenode_id,
         alt: e.altKey ? 1 : 0},
        function(json) {
          // json is a tuple:
          // json[0]: treenode id
          // json[1], [2], [3]: x, y, z in calibrated world units
          if (treenode_id === json[0]) {
            // Already at the root node
            growlAlert('Already there', 'You are already at the root node');
          } else {
            self.moveTo(json[3], json[2], json[1],
              function() {
                self.selectNode(json[0], json[4]);
              });
          }
        });
  };

  this.goToNextBranchOrEndNode = function(treenode_id, e) {
    if (this.isIDNull(treenode_id)) return;
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + "/node/next_branch_or_end",
        {tnid: treenode_id,
         shift: e.shiftKey ? 1 : 0,
         alt: e.altKey ? 1 : 0},
        function(json) {
          // json is a tuple:
          // json[0]: treenode id
          // json[1], [2], [3]: x, y, z in calibrated world units
          if (treenode_id === json[0]) {
            // Already at a branch or end node
            growlAlert('Already there', 'You are already at a branch or end node');
          } else {
            self.moveTo(json[3], json[2], json[1],
              function() {
                self.selectNode(json[0]);
              });
          }
        });
  };

  /** Checks first if the parent is loaded,
   * otherwise fetches its location from the database. */
  this.goToParentNode = function(treenode_id) {
    if (this.isIDNull(treenode_id)) return;
    var node = this.nodes[treenode_id];
    if (!node) {
      alert("ERROR", "Could not find node with id #" + treenode_id);
      return;
    }
    if (node.isroot) {
      growlAlert("Information", "This is the root node - can't move to its parent");
      return;
    }
    this.moveToAndSelectNode(node.parent_id);
  };

  /** All moving functions must perform moves via the updateNodeCoordinatesinDB
   * otherwise, coordinates for moved nodes would not be updated. */
  this.moveTo = function(z, y, x, fn) {
    var stack = this.stack;
    this.updateNodeCoordinatesinDB(function() {
      stack.getProject().moveTo(z, y, x, undefined, fn);
    });
  };

  this.moveToAndSelectNode = function(nodeID) {
    if (this.isIDNull(nodeID)) return;
    var self = this;
    this.goToNode(nodeID,
        function() {
          self.selectNode(nodeID);
        });
  };

  /** Move to the node and then invoke the function. */
  this.goToNode = function (nodeID, fn) {
    if (this.isIDNull(nodeID)) return;
    var node = this.nodes[nodeID];
    var self = this;
    if (node) {
      this.moveTo(
        this.pix2physZ(node.z),
        this.pix2physY(node.y),
        this.pix2physX(node.x),
        fn);
    } else {
      SkeletonAnnotations.submit(
          django_url + project.id + "/node/get_location",
          {tnid: nodeID},
          function(json) {
            // json[0], [1], [2], [3]: id, x, y, z
            self.moveTo(json[3], json[2], json[1], fn);
          },
          false,
          true);
    }
  };

  this.goToLastEditedNode = function(skeletonID) {
    if (this.isIDNull(skeletonID)) return;
    if (!skeletonID) return;
    var self = this;
    SkeletonAnnotations.submit(
      django_url + project.id + '/node/most_recent',
      {pid: project.id,
       treenode_id: SkeletonAnnotations.getActiveNodeId()},
      function (jso) {
        self.moveTo(jso.z, jso.y, jso.x,
          function() { self.selectNode(jso.id) });
      });
  };

  this.goToNearestOpenEndNode = function(nodeID) {
    if (this.isIDNull(nodeID)) return;
    if (this.getLabelStatus()) {
      var label = this.labels[nodeID];
      if (label && -1 === label.text.indexOf('end')) {
        growlAlert("Information", "You are at an open end node.");
        return;
      }
    }
    var self = this;
    // TODO could be done by inspecting the graph locally if it is loaded in the 3d Viewer
    // of from the treenode table (both sources though may not be up to date)
    SkeletonAnnotations.submit(
        django_url + project.id + '/skeleton/' + SkeletonAnnotations.getActiveSkeletonId() + '/openleaf',
        {tnid: nodeID},
        function(jso) {
          // [0]: open end node ID
          // [1]: location string as in "(12.3, 45.6, 78.9)"
          if (!jso[0]) {
            growlAlert("Information", "No more open ends!");
          } else if (jso[0] === nodeID) {
            growlAlert("Information", "You are at an open end node.");
          } else {
            // Parse location string
            var loc = jso[1].slice(1, -1).split(',').map(parseFloat);
            self.moveTo(loc[2], loc[1], loc[0],
              function() { self.selectNode(jso[0]) });
          }
        });
  };

  this.printTreenodeInfo = function(nodeID) {
    if (this.isIDNull(nodeID)) return;
    SkeletonAnnotations.submit(
        django_url + project.id + '/node/user-info',
        {treenode_id: nodeID},
        function(jso) {
          var msg = "Created by " + jso.user.first_name + " " + jso.user.last_name + " (" + jso.user.username +
                  ") on " + jso.creation_time +
                  ", last edited by " + jso.editor.first_name + " " + jso.editor.last_name + " (" + jso.editor.username +
                  ") on " + jso.edition_time +
                  ", reviewed by ";
          if (jso.reviewer) {
            msg += jso.reviewer.first_name + " " + jso.reviewer.last_name + " (" + jso.reviewer.username + ") on " + jso.review_time;
          } else {
            msg += "no one";
          }
          statusBar.replaceLast(msg);
        },
        false,
        true);
  };

  /** @param e The mouse event, to read out whether shift is down. */
  this.createInterpolatedTreenode = function(e) {
    // Check if there is already a node under the mouse
    // and if so, then activate it
    var atn = SkeletonAnnotations.atn;
    if (this.coords.lastX !== null && this.coords.lastY !== null) {
      // Radius of 7 pixels, in physical coordinates
      var phys_radius = (7.0 / this.stack.scale) * Math.max(this.stack.resolution.x, this.stack.resolution.y);
      var nearestnode = this.findNodeWithinRadius(this.coords.lastX, this.coords.lastY, project.coordinates.z, phys_radius);

      if (nearestnode !== null) {
        if (e && e.shiftKey) {
          // Shift down: interpolate and join
          if (null === atn.id) { return; }
          if (nearestnode.skeleton_id === atn.skeleton_id) {
            this.activateNode(nearestnode);
            return;
          }
          // If the target skeleton has more than one node, ask for confirmation
          var nearestnode_id = nearestnode.id;
          var nearestnode_skid = nearestnode.skeleton_id;
          var atn_id = atn.id;
          var atn_skid = atn.skeleton_id;
          var atn_x = atn.x;
          var atn_y = atn.y;
          var atn_z = atn.z;
          var self = this;
          SkeletonAnnotations.maybeExecuteIfSkeletonHasMoreThanOneNode(
              nearestnode.id,
              "join",
              function() {
                // Take into account current local offset coordinates and scale
                var pos_x = self.phys2pixX(self.coords.offsetXPhysical);
                var pos_y = self.phys2pixY(self.coords.offsetYPhysical);
                // At this point of the execution
                // project.coordinates.z is not on the new z index, thus simulate it here
                var pos_z = self.phys2pixZ(project.coordinates.z);
                var phys_z = self.pix2physZ(pos_z);
                // Get physical coordinates for node position creation
                var phys_x = self.pix2physX(pos_x);
                var phys_y = self.pix2physY(pos_y);
                // Ask to join the two skeletons with interpolated nodes
                self.createTreenodeLinkInterpolated(phys_x, phys_y, phys_z, nearestnode_id);
              });
          return;
        } else {
          // If shift is not down, just select the node:
          this.activateNode(nearestnode);
          return;
        }
      }
    }
    // Else, check that there is a node activated
    if (atn.id === null) {
      alert('Need to activate a treenode first!');
      return;
    }
    // TODO this comment needs revision: (same above)
    //  * the offsetXPhysical is converted to pixels and then back to physical coordinates
    //  * the offsetXPhysical reads like the 'x' of the mouse, rather than the stack offset.
    //
    // Take into account current local offset coordinates and scale
    var pos_x = this.phys2pixX(this.coords.offsetXPhysical);
    var pos_y = this.phys2pixY(this.coords.offsetYPhysical);
    // At this point of the execution
    // project.coordinates.z is not on the new z index, thus simulate it here
    var pos_z = this.phys2pixZ(project.coordinates.z);
    var phys_z = this.pix2physZ(pos_z);
    // Get physical coordinates for node position creation
    var phys_x = this.pix2physX(pos_x);
    var phys_y = this.pix2physY(pos_y);
    this.createInterpolatedNode(phys_x, phys_y, phys_z, null);
  };


  /** If you select a pre- or post-synaptic terminal, then run
      this command, the active node will be switched to its
      connector (if one uniquely exists).  If you then run the
      command again, it will switch back to the terminal. */
  this.switchBetweenTerminalAndConnector = function() {
    var atn = SkeletonAnnotations.atn;
    if (null === atn.id) {
      growlAlert("A terminal must be select in order to switch to its connector");
      return;
    }
    var ob = this.nodes[atn.id];
    if (!ob) {
      growlAlert("WARNING", "Cannot switch between terminal and connector: node not loaded.");
      return;
    }
    if (SkeletonAnnotations.TYPE_CONNECTORNODE === ob.type) {
      if (this.switchingConnectorID === ob.id) {
        // Switch back to the terminal
        this.moveToAndSelectNode(this.nodes[this.switchingTreenodeID].id);
      } else {
        // Go to the postsynaptic terminal if there is only one
        if (1 === countProperties(ob.postgroup)) {
          this.moveToAndSelectNode(this.nodes[Object.keys(ob.postgroup)[0]].id);
        // Otherwise, go to the presynaptic terminal if there is only one
        } else if (1 === countProperties(ob.pregroup)) {
          this.moveToAndSelectNode(this.nodes[Object.keys(ob.pregroup)[0]].id);
        } else {
          growlAlert("Oops", "Don't know which terminal to switch to");
          return;
        }
      }
    } else if (SkeletonAnnotations.TYPE_NODE === ob.type) {
      if (this.switchingTreenodeID === ob.id) {
        // Switch back to the connector
        this.moveToAndSelectNode(this.nodes[this.switchingConnectorID].id);
      } else {
        // Find a connector for the treenode 'ob'
        var cs = this.findConnectors(ob.id);
        var preIDs = cs[0];
        var postIDs = cs[1];
        if (1 === postIDs.length) {
          this.switchingTreenodeID = ob.id;
          this.switchingConnectorID = postIDs[0];
        } else if (1 === preIDs.length) {
          this.switchingTreenodeID = ob.id;
          this.switchingConnectorID = preIDs[0];
        } else {
          growlAlert("Oops", "Don't know which connector to switch to");
          this.switchingTreenodeID = null;
          this.switchingConnectorID = null;
          return;
        }
        this.moveToAndSelectNode(this.nodes[this.switchingConnectorID].id);
      }
    } else {
      alert("ERROR: unknown node type: " + ob.type);
    }
  };

  /** Delete the connector from the database and removes it from
   * the current view and local objects. */
  this.deleteConnectorNode = function(connectornode) {
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/connector/delete',
        {pid: project.id,
         connector_id: connectornode.id},
        function(json) {
          // If there was a presynaptic node, select it
          var preIDs  = Object.keys(connectornode.pregroup);
          var postIDs = Object.keys(connectornode.postgroup);
          if (preIDs.length > 0) {
              self.selectNode(preIDs[0]);
          } else if (postIDs.length > 0) {
              self.selectNode(postIDs[0]);
          } else {
              self.activateNode(null);
          }
          // Refresh all nodes in any case, to reflect the new state of the database
          self.updateNodes();

          statusBar.replaceLast("Deleted connector #" + connectornode.id);
        });
  };

  /** Delete the node from the database and removes it from
   * the current view and local objects.  */
  this.deleteTreenode = function (node, wasActiveNode) {
    var self = this;
    SkeletonAnnotations.submit(
        django_url + project.id + '/treenode/delete',
        {pid: project.id,
         treenode_id: node.id},
        function(json) {
          // activate parent node when deleted
          if (wasActiveNode) {
            if (json.parent_id) {
              self.selectNode(json.parent_id);
            } else {
              // No parent. But if this node was postsynaptic or presynaptic
              // to a connector, the connector must be selected:
              var pp = self.findConnectors(node.id);
              // Try first connectors for which node is postsynaptic:
              if (pp[1].length > 0) {
                self.selectNode(pp[1][0]);
              // Then try connectors for which node is presynaptic
              } else if (pp[0].length > 0) {
                self.selectNode(pp[0][0]);
              } else {
                self.activateNode(null);
              }
              // Refresh object tree as well, given that the node had no parent and therefore the deletion of its skeleton perhaps was triggered
              ObjectTree.refresh();
            }
          }
          // Refresh all nodes in any case, to reflect the new state of the database
          self.updateNodes();

          statusBar.replaceLast("Deleted node #" + node.id);
        });
  };

  // Now that functions exist:
  this.createInterpolatedNode = this.createInterpolatedNodeFn();

  /** Interpolate and join, both: uses same function as createInterpolatedNode
   *  so that requests are queued in the same queue. */
  this.createTreenodeLinkInterpolated = this.createInterpolatedNode;

};

var growlAlert = function(title, message) {
  $('#growl-alert').growlAlert({
    autoShow: true,
    content: message,
    title: title,
    position: 'top-right',
    delayTime: 2500,
    onComplete: function() { g.remove(); }
  });
};


/** Manages the creation and deletion of tags via a tag editor div.
  * tagbox from http://blog.crazybeavers.se/wp-content/Demos/jquery.tag.editor */
SkeletonAnnotations.Tag = new (function() {
  this.tagbox = null;

  this.hasTagbox = function() {
    return this.tagbox !== null;
  }

  this.removeTagbox = function() {
    if (this.tagbox) {
      this.tagbox.remove();
      this.tagbox = null;
    }
  };

  this.tagATNwithLabel = function(label, svgOverlay) {
    var atn = SkeletonAnnotations.atn;
    SkeletonAnnotations.submit(
      django_url + project.id + '/label/' + atn.type + '/' + atn.id + '/update',
      {pid: project.id,
       tags: label},
      function(json) {
        if ('' === label) {
          growlAlert('Information', 'Tags removed.');
        } else {
          growlAlert('Information', 'Tag ' + label + ' added.');
        }
        svgOverlay.updateNodes();
    });
  };

  this.handle_tagbox = function(atn, svgOverlay) {
    var atnID = SkeletonAnnotations.getActiveNodeId();
    this.tagbox = $("<div class='tagBox' id='tagBoxId" + atnID + "' style='z-index: 8; border: 1px solid #B3B2B2; padding: 5px; left: " + atn.x + "px; top: " + atn.y + "px;' />");
    this.tagbox.append("Tag: ");
    var input = $("<input id='Tags" + atnID + "' name='Tags' type='text' value='' />");
    this.tagbox.append(input).append("<div style='color:#949494'>(Save&Close: Enter)</div>");

    this.tagbox
      .css('background-color', 'white')
      .css('position', 'absolute')
      .appendTo("#" + svgOverlay.view.id)

      .mousedown(function (event) {
        if ("" === input.tagEditorGetTags()) {
          SkeletonAnnotations.Tag.updateTags();
          SkeletonAnnotations.Tag.removeTagbox();
          svgOverlay.hideLabels();
          svgOverlay.updateNodes();
        }
        event.stopPropagation();
      })

      .keydown(function (event) {
        if (13 === event.keyCode) { // ENTER
          event.stopPropagation();
          if ("" === input.val()) {
            SkeletonAnnotations.Tag.updateTags();
            SkeletonAnnotations.Tag.removeTagbox();
            growlAlert('Information', 'Tags saved!');
            svgOverlay.updateNodes();
          }
        }
      })

      .keyup(function (event) {
        if (27 === event.keyCode) { // ESC
          event.stopPropagation();
          SkeletonAnnotations.Tag.removeTagbox();
        }
      });

    SkeletonAnnotations.submit(
        django_url + project.id + '/labels-for-node/' + atn.type  + '/' + atnID,
        {pid: project.id},
        function(json) {
          input.tagEditor({
            items: json,
            confirmRemoval: false,
            completeOnSeparator: true
          });
          input.focus();

          // TODO autocompletion should only be invoked after typing at least one character
          // add autocompletion, only request after tagbox creation
          SkeletonAnnotations.submit(
            django_url + project.id + '/labels-all',
            {pid: project.id},
            function(json) {
              input.autocomplete({source: json});
            });
        });
  };

  this.updateTags = function() {
    var atn = SkeletonAnnotations.atn;
    // TODO why pass the atnID both as POST and in the URL?
    SkeletonAnnotations.submit(
        django_url + project.id + '/label/' + atn.type + '/' + atn.id + '/update',
        {pid: project.id,
         nid: atn.id,
         ntype: atn.type,
         tags: $("#Tags" + atn.id).tagEditorGetTags()},
        function(json) {});
  };

  this.tagATN = function(svgOverlay) {
    var atn = SkeletonAnnotations.atn;
    if (null === atn.id) {
      alert("Select a node first!");
      return;
    }
    if (this.tagbox) {
      growlAlert('BEWARE', 'Close tagbox first before you tag another node!');
      return;
    }
    if (svgOverlay.stack.z !== atn.z) {
      var self = this;
      svgOverlay.goToNode(atn.id,
          function() {
            self.handle_tagbox(atn, svgOverlay);
          });
    } else {
      this.handle_tagbox(atn, svgOverlay);
    }
  };

  /** Upon changing stack scale, remove the tag box. */
  this.changeScale = function(val) {
    if (this.hasTagbox()) {
      this.removeTagbox();
    }
  };

  /** Upon changing stack slice, remove the tag box. */
  this.changeSlice = this.changeScale;
})();
