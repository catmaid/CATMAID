/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// TODO check all other TODOS

/** Namespace where Node instances are created and edited. */
var SkeletonElements = new function()
{
  var active_skeleton_color = "rgb(255,255,0)";
  var inactive_skeleton_color = "rgb(255,0,255)";
  var inactive_skeleton_color_above = "rgb(0,0,255)";
  var inactive_skeleton_color_below = "rgb(255,0,0)";
  var root_node_color = "rgb(255, 0, 0)";
  var leaf_node_color = "rgb(128, 0, 0)";

  var TYPE_NODE = "treenode";
  var TYPE_CONNECTORNODE = "connector";

  var CATCH_RADIUS = 8;

  var DISABLED = -1; // ID of the disabled nodes

  // Two arrays containing all created Node and ConnectorNode, for their reuse.
  var nodePool = [];
  var connectorPool = [];
  // The two corresponding indices in the pool for the next available instance for reuse
  var nextNodeIndex = 0;
  var nextConnectorIndex = 0;
  var firstDisabledNodeIndex = -1;

  this.resetCache = function() {
    nextNodeIndex = 0;
    nextConnectorIndex = 0;
  };

  this.clearCache = function() {
    nodePool = [];
    connectorPool = [];
    nextNodeIndex = 0;
    nextConnectorIndex = 0;
    firstDisabledNodeIndex = -1;
  };

  /** Disable all cached Node instances at or beyond the cutoff index. */
  this.disableBeyond = function(nodeCuttoff, connectorCuttoff) {
    var i;
    for (i = nodeCuttoff; i < nodePool.length; ++i) {
      disableNode(nodePool[i]);
    }
    for (i = connectorCuttoff; i < connectorPool.length; ++i) {
      disableConnectorNode(connectorPool[i]);
    }

    //console.log(nodePool.length, nextNodeIndex, nodeCuttoff);
  };

  /** Surrogate constructor that may reuse an existing, cached Node instance currently not in use.
   * Appends any newly created instances to the pool. */
  this.newNode = function(
    id, // unique id for the node from the database
    paper, // the raphael paper this node is drawn to
    parent, // the parent node, if present within the subset of nodes retrieved for display; otherwise null.
    parent_id, // the id of the parent node, or null if it is root
    r, // the radius
    x, // the x coordinate in pixel coordinates
    y, // y coordinates
    z, // z coordinates
    zdiff, // the different from the current slices
    confidence,
    skeleton_id, // the id of the skeleton this node is an element of
    can_edit) // a boolean combining (is_superuser or user owns the node)
  {
    var node;
    if (nextNodeIndex < nodePool.length) {
      node = nodePool[nextNodeIndex];
      reuseNode(node, id, parent, parent_id, r, x, y, z, zdiff, confidence, skeleton_id, can_edit);
    } else {
      node = new this.Node(id, paper, parent, parent_id, r, x, y, z, zdiff, confidence, skeleton_id, can_edit);
      nodePool.push(node);
    }
    nextNodeIndex += 1;
    return node;
  };

  /** Constructor for Node instances. */
  this.Node = function(
    id, // unique id for the node from the database
    paper, // the raphael paper this node is drawn to
    parent, // the parent node (may be null if the node is not loaded)
    parent_id, // is null only for the root node
    r, // the radius
    x, // the x coordinate in pixel coordinates
    y, // y coordinates
    z, // z coordinates
    zdiff, // the different from the current slices
    confidence,
    skeleton_id, // the id of the skeleton this node is an element of
    can_edit)
  {
    this.id = id;
    this.type = TYPE_NODE;
    this.paper = paper;
    this.parent = parent;
    this.parent_id = parent_id;
    this.children = {};
    this.numberOfChildren = 0;
    this.r = r > 0 ? 60 : 3; // 3; // not use radius size on overlay display
    this.x = x;
    this.y = y;
    this.z = z;
    this.zdiff = zdiff;
    this.shouldDisplay = displayTreenode;
    this.confidence = confidence;
    this.skeleton_id = skeleton_id;
    this.can_edit = can_edit;
    this.isroot = null === parent_id || isNaN(parent_id) || parseInt(parent_id) < 0;
    this.fillcolor = inactive_skeleton_color;
    this.c = null; // The Raphael circle for drawing
    this.mc = null; // The Raphael circle for mouse actions (it's a bit larger)
    this.line = paper.path(); // The Raphael line element that represents an edge between nodes
    this.line.toBack();

    // The member functions:
    this.setXY = setXY;
    this.drawEdges = nodeDrawEdges;
    this.draw = draw;
    this.deletenode = nodeDelete;
    this.setColor = setColor;
    this.colorFromZDiff = nodeColorFromZDiff;
    this.createCircle = createCircle;

    this.addChildNode = function(childNode) {
      if (!this.children.hasOwnProperty(childNode.id)) {
        ++ this.numberOfChildren;
      }
      // Still set new node object in any case, since
      // node objects can be reused for different IDs
      this.children[childNode.id] = childNode;
    };

    // Init block
    // 1. Add this node to the parent's children if it exists
    if (parent) parent.addChildNode(this);
  };

  /** Before reusing a node, clear all the member variables that
   * are relevant to the skeleton structure.
   * All numeric variables will be overwritten,
   * and the c, mc and line will be reused. */
  var disableNode = function(node)
  {
    node.id = DISABLED;
    node.parent = null;
    node.children = {};
    node.numberOfChildren = 0;
    if (node.c) {
      node.c.hide();
      node.mc.hide();
    }
    if (node.line) {
      node.line.hide();
    }
    if (node.number_text) {
      node.number_text.remove();
      node.number_text = null;
    }
  };

  /** Takes an existing Node and sets all the proper members as given, and resets its children. */
  var reuseNode = function(node, id, parent, parent_id, r, x, y, z, zdiff, confidence, skeleton_id, can_edit)
  {
    node.id = id;
    node.parent = parent;
    node.parent_id = parent_id;
    node.children = {};
    node.numberOfChildren = 0;
    node.r = r > 0 ? 60 : 3;// 3; // hardcode value r < 0 ? 3 : r;
    node.x = x;
    node.y = y;
    node.z = z;
    node.zdiff = zdiff;
    node.shouldDisplay = displayTreenode;
    node.confidence = confidence;
    node.skeleton_id = skeleton_id;
    node.isroot = null === parent_id || isNaN(parent_id) || parseInt(parent_id) < 0;
    node.can_edit = can_edit;

    if (node.c) {
      if (0 !== zdiff) {
        node.c.hide();
        node.mc.hide();
      } else {
        var newCoords = {cx: x, cy: y};
        node.c.attr(newCoords);
        node.mc.attr(newCoords);
      }
    }
    if (node.line) {
      node.line.hide();
    }
    if (node.number_text) {
      node.number_text.remove();
      node.number_text = null;
    }
  };

  /** Trigger the redrawing of the lines with parent, children and connectors.
   * Here, 'this' is the node, given that it is called in the context of the node only.
   */
  var nodeDrawEdges = function(toChildren) {
    var ID,
        children = this.children,
        child;

    if (toChildren) {
      for (ID in children) {
        if (children.hasOwnProperty(ID)) {
          child = children[ID];
          if (displayBetweenNodes(this, child))
            drawLineToParent(children[ID]);
        }
      }
    }

    if (displayBetweenNodes(this, this.parent)) {
      drawLineToParent(this);
    }
  };

  /** Update the local x,y coordinates of the node
   * Update them for the raphael objects as well.
   * Does NOT redraw the edges.
   * Here 'this' refers to the node.
   */
  var setXY = function(xnew, ynew)
  {
    this.x = xnew;
    this.y = ynew;
    if (this.c) {
      this.c.attr({
        cx: xnew,
        cy: ynew
      });
      this.mc.attr({
        cx: xnew,
        cy: ynew
      });
    }
  };

  var updateConfidenceText = function (x, y,
                                       parentx, parenty,
                                       fillColor,
                                       confidence,
                                       paper,
                                       existing) {
    var result,
    numberOffset = 12,
    confidenceFontSize = '20px',
    xdiff = parentx - x,
    ydiff = parenty - y,
    length = Math.sqrt(xdiff*xdiff + ydiff*ydiff),
    nx = -ydiff / length,
    ny = xdiff / length,
    newConfidenceX = (x + parentx) / 2 + nx * numberOffset,
    newConfidenceY = (y + parenty) / 2 + ny * numberOffset;

    if (typeof existing == "undefined") {
      result = paper.text(newConfidenceX,
                          newConfidenceY,
                          ""+confidence);
    } else {
      result = existing;
    }

    result.attr({x: newConfidenceX,
                 y: newConfidenceY,
                 'font-size': confidenceFontSize,
                 stroke: 'black',
                 'stroke-width': 0.25,
                 fill: fillColor,
                 text: ""+confidence});

    return result;
  };

  /** Updates the coordinates of the raphael path
   * that represents the line from the node to the parent.
   */
  var drawLineToParent = function (node) {
    var parent = node.parent;
    var lineColor;
    if (!displayBetweenNodes(node, parent)) {
      return;
    }
    if (parent) {
      lineColor = node.colorFromZDiff(parent.zdiff, parent.skeleton_id);
      if (node.line) {
        node.line.attr({
          path: [
            ["M", node.x, node.y],
            ["L", parent.x, parent.y]
          ],
          stroke: lineColor,
          "stroke-width": 2
        });
        // May be hidden if the node was reused
        if ("none" === node.line.node.style.display) { node.line.show(); }
      }
      if (node.confidence < 5) {
        if (node.number_text) {
          updateConfidenceText(
            node.x, node.y, parent.x, parent.y,
            lineColor,
            node.confidence,
            node.paper,
            node.number_text);
        } else {
          node.number_text = updateConfidenceText(
            node.x, node.y, parent.x, parent.y,
            lineColor,
            node.confidence,
            node.paper);
        }
        node.number_text.toBack();
      } else {
        if (node.number_text) {
          node.number_text.remove();
          node.number_text = null;
        }
      }
    }
  };

  /** Recreate the GUI components, namely the circle and edges.
   * Here 'this' refers to the node.
   *  This is called only when creating a single node
   */
  var draw = function() {
    this.createCircle();
    this.drawEdges();
  };

  /** Delete the node from the database and removes it from
   * the current view and local objects.
   * Here 'this' refers to the node.
   */
  var nodeDelete = function (wasActiveNode) {
    var node = this;
    requestQueue.register(django_url + project.id + '/treenode/delete', "POST", {
      pid: project.id,
      treenode_id: node.id
    }, function (status, text) {
      if (status !== 200) {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
      } else {

          if (text && text !== " ") {
              var e = $.parseJSON(text);
              if (e.error) {
                  alert(e.error);
              } else {
                  // activate parent node when deleted
                  if (wasActiveNode) {
                      var ov = node.paper.catmaidSVGOverlay;
                      if (e.parent_id) {
                          ov.selectNode(e.parent_id);
                      } else {
                          // No parent. But if this node was postsynaptic or presynaptic
                          // to a connector, the connector must be selected:
                          var pp = ov.findConnectors(node.id);
                          // Try first connectors for which node is postsynaptic:
                          if (pp[1].length > 0) {
                              ov.selectNode(pp[1][0]);
                          // Then try connectors for which node is presynaptic
                          } else if (pp[0].length > 0) {
                              ov.selectNode(pp[0][0]);
                          } else {
                              ov.activateNode(null);
                          }
                          // Refresh object tree as well, given that the node had no parent and therefore the deletion of its skeleton was triggered
                          ObjectTree.refresh();
                      }
                  }
                  node.needsync = false;
                  // Redraw everything for now
                  node.paper.catmaidSVGOverlay.updateNodes();
              }
          }
      }
      return true;
    });
  };

  /** Set the node fill color depending on its distance from the
  * current slice, whether it's the active node, the root node, or in
  * an active skeleton.
   * Here 'this' refers to the node. */
  var setColor = function ()
  {
    if (this.id === SkeletonAnnotations.getActiveNodeId()) {
      // The active node is always in green:
      this.fillcolor = SkeletonAnnotations.getActiveNodeColor();
    } else if (this.isroot) {
      // The root node should be colored red unless it's active:
      this.fillcolor = root_node_color;
    } else if ((this.type !== TYPE_CONNECTORNODE) && (this.numberOfChildren === 0)) {
      this.fillcolor = leaf_node_color;
    } else {
      // If none of the above applies, just colour according to the z difference.
      this.fillcolor = this.colorFromZDiff(this.zdiff, this.skeleton_id);
    }

    if (this.c) {
      this.c.attr({
        fill: this.fillcolor
      });
    }
  };

  /** Return a color depending upon some conditions,
   * such as whether the zdiff with the current section is positive, negative, or zero,
   * and whether the node belongs to the active skeleton.
   */
  var nodeColorFromZDiff = function(zdiff, skeleton_id)
  {
    // zdiff is in sections, therefore the current section is at [0, 1) -- notice 0 is inclusive and 1 is exclusive.
    if (zdiff >= 1) {
      return inactive_skeleton_color_above;
    } else if (zdiff < 0) {
      return inactive_skeleton_color_below;
    } else if (skeleton_id === SkeletonAnnotations.getActiveSkeletonId() ) {
      return active_skeleton_color;
    }
    return inactive_skeleton_color;
  };

  var displayTreenode = function () {
    return this.zdiff >= 0 && this.zdiff < 1;
  };

  var displayConnector = function() {
    /* Change the constant to 1.5 if you want to see the connector
       (differently coloured) in the next and previous slices too. */
    return this.zdiff >= 0 && this.zdiff < 1;
  };

  var displayBetweenNodes = function(node_a, node_b) {
    return (node_a && node_a.shouldDisplay()) ||
      (node_b && node_b.shouldDisplay());
  };

  /** Create the Raphael circle elements if and only if the zdiff is zero, that is, if the node lays on the current section.
   * Here 'this' refers to the node.
   * */
  var createCircle = function()
  {
    if (this.shouldDisplay()) {
      var paper = this.paper;
      // c and mc may already exist if the node is being reused
      if (this.c && this.mc) {
      } else {
        // create a raphael circle object
        this.c = paper.circle(this.x, this.y, this.r); // again hard-code the radius to address issue #522
        // a raphael circle oversized for the mouse logic
        if( this.r > 0 )
          this.mc = paper.circle(this.x, this.y, this.r + 5);
        else
          this.mc = paper.circle(this.x, this.y, CATCH_RADIUS);

        assignEventHandlers(this.mc, this.type);
      }

      this.c.attr({
        fill: this.fillcolor,
        stroke: "none",
        opacity: 1.0
      });

      this.mc.attr({
        fill: "rgb(0, 1, 0)",
        stroke: "none",
        opacity: 0
      });

      if ("none" === this.c.node.style.display) {
        this.c.show();
        this.mc.show();
      }

      this.mc.catmaidNode = this; // for event handlers
    }
  };


  /** Event handling functions for 'mc'
  * Realize that:
  *    mc.prev === c
  * and that, on constructing the mc, we declared:
  *    mc.catmaidNode = this;  // 'this' is the node
   *
   * Below, the function() is but a namespace that returns the actual nodeAssignEventHandlers function,
   * which assigns the event handlers to the mc given to it as argument.
  */
  var assignEventHandlers = function ()
  {
    /** Variables used for mouse events, which involve a single node at a time.
     * These are set at mc_start and then used at mc_move. */
    var ox = null, oy = null;

    /** Here 'this' is mc. */
    var mc_dblclick = function(e) {
      if (this.paper.catmaidSVGOverlay.ensureFocused()) {
        e.stopPropagation();
        return;
      }
      // Else, do nothing
      e.stopPropagation();
    };

    /** 
     * Here 'this' is mc, and treenode is the Node instance
     */
    var mc_click = function(e) {
      e.stopPropagation();
      var node = this.catmaidNode,
          paper = this.paper,
          wasActiveNode = false;
      if (this.paper.catmaidSVGOverlay.ensureFocused()) {
        return;
      }
      if (e.shiftKey) {
        var atnID = SkeletonAnnotations.getActiveNodeId();
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          if (!mayEdit() || !node.can_edit) {
            alert("You don't have permission to delete node #" + node.id);
            return;
          }
          // if it is active node, set active node to null
          if (node.id === atnID) {
            paper.catmaidSVGOverlay.activateNode(null);
            wasActiveNode = true;
          }
          statusBar.replaceLast("Deleted node #" + node.id);
          node.deletenode(wasActiveNode);
          return true;
        }
        if (atnID) {
          var atnType = SkeletonAnnotations.getActiveNodeType();
          // connected activated treenode or connectornode
          // to existing treenode or connectornode
          // console.log("from source #" + atnID + " to target #" + node.id);
          if (atnType === TYPE_CONNECTORNODE) {
            if (!mayEdit()) {
              alert("You lack permissions to declare node #" + node.id + "as postsynaptic to connector #" + atnID);
              return;
            }
            // careful, atnID is a connector
            paper.catmaidSVGOverlay.createLink(node.id, atnID, "postsynaptic_to");
            // TODO check for error
            statusBar.replaceLast("Joined node #" + atnID + " to connector #" + node.id);
          } else if (atnType === TYPE_NODE) {
            // Joining two skeletons: only possible if one owns both nodes involved
            // or is a superuser
            if( node.skeleton_id === SkeletonAnnotations.getActiveSkeletonId() ) {
              alert('Can not join node with another node of the same skeleton!');
              return;
            }
            paper.catmaidSVGOverlay.createTreenodeLink(atnID, node.id);
            // TODO check for error
            statusBar.replaceLast("Joined node #" + atnID + " to node #" + node.id);
          }

        } else {
          alert("Nothing to join without an active node!");
        }
      } else {
        // activate this node
        paper.catmaidSVGOverlay.activateNode(node);
        // stop propagation of the event
      }
    };

    /** Here 'this' is mc, and node is the Node instance. */
    var mc_move = function(dx, dy, x, y, e) {
      if (is_middle_click(e)) {
        // Allow middle-click panning
        return;
      }
      if (!ox || !oy) {
        // Not properly initialized with mc_start
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      if (e.shiftKey) {
        return;
      }
      if (!mayEdit() || !this.catmaidNode.can_edit) {
        statusBar.replaceLast("You don't have permission to move node #" + this.catmaidNode.id);
        return;
      }
      var node = this.catmaidNode,
        mc = this,
        c = this.prev;

      if( node.id !== SkeletonAnnotations.getActiveNodeId() )
        return;

      node.x = ox + dx;
      node.y = oy + dy;
      c.attr({
        cx: node.x,
        cy: node.y
      });
      mc.attr({
        cx: node.x,
        cy: node.y
      });
      node.drawEdges(true); // TODO for connector this is overkill
      statusBar.replaceLast("Moving node #" + node.id);

      node.needsync = true;
    };

    /** Here 'this' is mc. */
    var mc_up = function(e) {
      ox = null;
      oy = null;
      e.stopPropagation();
      var c = this.prev;
      c.attr({
        opacity: 1
      });
    };

    /** Here 'this' is mc. */
    var mc_start = function(x, y, e) {
      
      if (is_middle_click(e)) {
        // Allow middle-click panning
        return;
      }
      e.stopPropagation();
      var node = this.catmaidNode,
        c = this.prev;

      // If not trying to join or remove a node, but merely click on it to drag it or select it:
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        this.paper.catmaidSVGOverlay.activateNode(node);
      }

      ox = node.x;
      oy = node.y;
      c.attr({
        opacity: 0.7
      });
    };

    var mc_mousedown = function(e) {
    
      if (is_middle_click(e)) {
        // Allow middle-click panning
        return;
      }
      e.stopPropagation();
    };

    var connector_mc_click = function(e) {
      e.stopPropagation();
      var atnID = SkeletonAnnotations.getActiveNodeId(),
          connectornode = this.catmaidNode,
          paper = this.paper,
          wasActiveNode = false;
      if (this.paper.catmaidSVGOverlay.ensureFocused()) {
        return;
      }
      // return some log information when clicked on the node
      // this usually refers here to the mc object
      if (e.shiftKey) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          if (connectornode.id === atnID) {
            paper.catmaidSVGOverlay.activateNode(null);
            wasActiveNode = true;
          }
          statusBar.replaceLast("Deleted connector #" + connectornode.id);
          connectornode.deletenode(wasActiveNode);
          return true;
        }
        if (atnID) {
          var atnType = SkeletonAnnotations.getActiveNodeType();
          // connected activated treenode or connectornode
          // to existing treenode or connectornode
          if (atnType === TYPE_CONNECTORNODE) {
            alert("Can not join two connector nodes!");
          } else if (atnType === TYPE_NODE) {
            paper.catmaidSVGOverlay.createLink(atnID, connectornode.id, "presynaptic_to");
            statusBar.replaceLast("Joined node #" + atnID + " with connector #" + connectornode.id);
          }
        } else {
          $('#growl-alert').growlAlert({
            autoShow: true,
            content: 'You need to activate a node before joining it to a connector node!',
            title: 'BEWARE',
            position: 'top-right',
            delayTime: 2500,
            onComplete: function() { g.remove(); }
          });
        }
      } else {
        //console.log("Try to activate node");
        // activate this node
        paper.catmaidSVGOverlay.activateNode(connectornode);
      }
    };

    // The actual assignEventHandlers function
    // BEWARE that 'this' cannot be used to refer to the node within this function
    return function(mc, type) {
      mc.drag(mc_move, mc_start, mc_up);
      mc.mousedown(mc_mousedown);
      mc.dblclick(mc_dblclick);

      if (TYPE_NODE === type) {
        mc.click(mc_click);
      } else {
        // TYPE_CONNECTORNODE
        mc.click(connector_mc_click);
      }
    };
  }();


  // TODO must reuse nodes instead of creating them new, to avoid DOM insertions.
  // -- well, it can: just leave as members of each the functions that are really different.

  // Identical functions: setXY, setColor, createCircle, deletenode (but for the php URL), some of the sub-functions of createEventHandlers

  // Also, there shouldn't be a "needsync" flag. Instead, push the node to an array named "needSyncWithDB". Will avoid looping.

  // Regarding the nodes map: it is an array of keys over objects stored in a a cache of nodes that are already inserted into the DOM and that can be reused.

  /** Surrogate constructor for ConnectorNode.
   * See "newNode" for explanations. */
  this.newConnectorNode = function(
    id, // unique id for the node from the database
    paper, // the raphael paper this node is drawn to
    r, // radius
    x, // the x coordinate in pixel coordinates
    y, // y coordinates
    z, // z coordinates
    zdiff, // the different from the current slices
    confidence,
    can_edit) // a boolean combining (is_superuser or user owns the node)
  {
    var connector;
    if (nextConnectorIndex < connectorPool.length) {
      connector = connectorPool[nextConnectorIndex];
      reuseConnectorNode(connector, id, r, x, y, z, zdiff, confidence, can_edit);
    } else {
      connector = new this.ConnectorNode(id, paper, r, x, y, z, zdiff, confidence, can_edit);
      connectorPool.push(connector);
    }
    nextConnectorIndex += 1;
    return connector;
  };

  /**
   * Constructor for ConnectorNode.
   */
  this.ConnectorNode = function (
    id, // unique id for the node from the database
    paper, // the raphael paper this node is drawn to
    r, // radius
    x, // the x coordinate in pixel coordinates
    y, // y coordinates
    z, // z coordinates
    zdiff, // the different from the current slices
    confidence,
    can_edit) // whether the logged in user has permissions to edit this node -- the server will in any case enforce permissions; this is for proper GUI flow
  {
    this.id = id;
    this.type = TYPE_CONNECTORNODE;
    this.needsync = false; // state variable; whether this node is already synchronized with the database
    this.x = x; // local screen coordinates relative to the div, in pixel coordinates
    this.y = y;
    this.z = z;
    this.zdiff = zdiff;
    this.shouldDisplay = displayConnector;
    this.confidence = confidence;
    this.can_edit = can_edit;
    this.paper = paper;
    this.pregroup = {}; // set of presynaptic treenodes
    this.postgroup = {}; // set of postsynaptic treenodes
    this.r = r; // prefixed radius for now
    this.c = null; // The Raphael circle for drawing
    this.mc = null; // The Raphael circle for mouse actions (it's a bit larger)
    this.preLines = {}; // The Raphael edges to the presynaptic nodes
    this.postLines = {}; // The Raphael edges to the postsynaptic nodes
    this.fillcolor = null;

    // Member functions
    this.setXY = setXY;
    this.setColor = setColor;
    this.colorFromZDiff = connectorColorFromZDiff;
    this.createCircle = createCircle;
    this.deletenode = connectorDelete;
    this.draw = draw;
    this.drawEdges = connectorDrawEdges;
  };


  /**
   * @param c The Node to reuse
   * @param id
   * @param r
   * @param x
   * @param y
   * @param z
   * @param zdiff
   */
  var reuseConnectorNode = function(c, id, r, x, y, z, zdiff, confidence, can_edit)
  {
    c.id = id;
    c.r = r;
    c.x = x;
    c.y = y;
    c.z = z;
    c.zdiff = zdiff;
    c.shouldDisplay = displayConnector;
    c.confidence = confidence;
    c.can_edit = can_edit;
    c.pregroup = {};
    c.postgroup = {};

    if (c.c) {
      if (c.shouldDisplay()) {
        var newCoords = {cx: x, cy: y};
        c.c.attr(newCoords);
        c.mc.attr(newCoords);
      } else {
        c.c.hide();
        c.mc.hide();
      }
    }

    // preLines and postLines are always removed and then recreated when calling drawEdges
  };

  /**
   *
   * @param c The ConnectorNode instance to disable
   */
  var disableConnectorNode = function(c) {
    if (c.c) {
      c.c.hide();
      c.mc.hide();
    }
    removeConnectorEdges(c.preLines, c.postLines);
  };

  /** Here 'this' is the connector node. */
  var connectorColorFromZDiff =  function(zdiff)
  {
    // zdiff is in sections, therefore the current section is at [0, 1) -- notice 0 is inclusive and 1 is exclusive.
    if (zdiff >= 1) {
      return "rgb(0, 0, 255)";
    } else if (zdiff < 0) {
      return "rgb(255, 0, 0)";
    } else {
      return "rgb(235, 117, 0)";
    }
  };

  /** Delete the connector from the database and removes it from
   * the current view and local objects.
   * Here 'this' is the connector node.
   */
  var connectorDelete = function ()
  {
    var connectornode = this;
    requestQueue.register(django_url + project.id + '/connector/delete', "POST", {
      pid: project.id,
      connector_id: connectornode.id
    }, function (status, text, xml) {
      if (status !== 200) {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
      } else {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              var ov = connectornode.paper.catmaidSVGOverlay;
              // If there was a presynaptic node, select it
              var preIDs  = Object.keys(connectornode.pregroup);
              var postIDs = Object.keys(connectornode.postgroup);
              if (preIDs.length > 0) {
                  ov.selectNode(preIDs[0]);
              } else if (postIDs.length > 0) {
                  ov.selectNode(postIDs[0]);
              } else {
                  ov.activateNode(null);
              }
              connectornode.needsync = false;
              // Refresh all nodes in any case, to reflect the new state of the database
              ov.updateNodes();

              return true;
            }
          }
      }
    });
  };

  var removeConnectorEdges = function(preLines, postLines) {
    var i;
    for (i in preLines) {
      if (preLines.hasOwnProperty(i)) {
        if (preLines[i].remove)
          preLines[i].remove();
        else console.log(i, preLines[i]);
      }
    }

    for (i in postLines) {
      if (postLines.hasOwnProperty(i)) {
        if (postLines[i].remove)
          postLines[i].remove();
        else console.log(i, postLines[i]);
      }
    }
  };

  /**
   * Here 'this' is the connector node.
   */
  var connectorDrawEdges = function()
  {
    var i,
        tnid,
        treenode,
        confidence,
        preLines = this.preLines,
        postLines = this.postLines,
        pregroup = this.pregroup,
        postgroup = this.postgroup;

    removeConnectorEdges(preLines, postLines);

    // re-create
    for (i in pregroup) {
      if (pregroup.hasOwnProperty(i)) {
        treenode = pregroup[i].treenode;
        tnid = treenode.id;
        confidence = pregroup[i].confidence;
        if (displayBetweenNodes(this, treenode))
          preLines[tnid] = connectorCreateLine(this, tnid, confidence, true);
      }
    }

    for (i in postgroup) {
      if (postgroup.hasOwnProperty(i)) {
        treenode = postgroup[i].treenode;
        tnid = treenode.id;
        confidence = postgroup[i].confidence;
        if (displayBetweenNodes(this, treenode))
          postLines[tnid] = connectorCreateLine(this, tnid, confidence, false);
      }
    }
  };

  /** Below, a function that acts as a namespace and assigns to connectorCreateLine the proper function.
   * (Notice how it is executed at the end of its declaration. */
  var connectorCreateLine = function()
  {
    /** Constructor method for ArrowLine. */
    var ArrowLine = function (paper, x1, y1, x2, y2, confidence, size, strowi, strocol, fromid, toid) {
      // Compute position for arrowhead pointer
      var rloc = 9;
      var xdiff = (x2 - x1);
      var ydiff = (y2 - y1);
      var le = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
      if( le === 0 ) {
          le = 0.9 * rloc;
      }
      var x1new = (x1 - x2) * (1 - rloc / le) + x2;
      var y1new = (y1 - y2) * (1 - rloc / le) + y2;
      var x2new = (x2 - x1) * (1 - rloc / le) + x1;
      var y2new = (y2 - y1) * (1 - rloc / le) + y1;

      var angle = Math.atan2(x1 - x2, y2 - y1);
      angle = (angle / (2 * Math.PI)) * 360;
      var linePath = paper.path("M" + x1new + " " + y1new + " L" + x2new + " " + y2new);

      var arrowPath = paper.path("M" + x2new + " " + y2new + " L" + (x2new - size) + " " + (y2new - size) + " L" + (x2new - size) + " " + (y2new + size) + " L" + x2new + " " + y2new).attr("fill", "black").rotate((90 + angle), x2new, y2new);

      linePath.attr({
        "stroke-width": strowi,
        "stroke": strocol
      });
      var arrow_mousedown = function(e) {
        e.stopPropagation();
        if(!(e.shiftKey && (e.ctrlKey || e.metaKey))) {
          return;
        }
        requestQueue.register(django_url + project.id + '/link/delete', "POST", {
          pid: project.id,
          connector_id: fromid,
          treenode_id: toid
        }, function (status, text, xml) {
          if (status !== 200) {
            alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
          } else {
              if (text && text !== " ") {
                var e = $.parseJSON(text);
                if (e.error) {
                  alert(e.error);
                } else {  
                  paper.catmaidSVGOverlay.updateNodes();
                  return true;
                }
              }
          }
        });

      };
      arrowPath.mousedown( arrow_mousedown );
      arrowPath.attr({
        "fill": strocol,
        "stroke": strocol
      });
      var confidenceText = null;
      if (confidence < 5) {
        confidenceText = updateConfidenceText(
          x1, y1, x2, y2,
          strocol,
          confidence,
          paper);
        confidenceText.toBack();
      }
      // The 'this' refers to the new ArrowLine
      this.remove = function () {
        arrowPath.remove();
        linePath.remove();
        if (confidenceText) {
          confidenceText.remove();
        }
      };
    };

    // Return the actual connectorCreateLine function
    return function(self, to_id, confidence, pre) {
      if (pre) {
        return new ArrowLine(self.paper, self.pregroup[to_id].treenode.x, self.pregroup[to_id].treenode.y, self.x, self.y, confidence, 5, 2, "rgb(200, 0, 0)", self.id, to_id);
      } else {
        return new ArrowLine(self.paper, self.x, self.y, self.postgroup[to_id].treenode.x, self.postgroup[to_id].treenode.y, confidence, 5, 2, "rgb(0, 217, 232)", self.id, to_id);
      }
    };
  }();

  var is_middle_click = function(e) {
    return 2 === e.which;
  };

}();
