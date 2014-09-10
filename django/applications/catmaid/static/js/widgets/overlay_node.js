/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/** Namespace where Raphael SVG element instances are created, cached and edited. */
var SkeletonElements = function(paper)
{
  this.cache = {
    nodePool : new this.ElementPool(100),
    connectorPool : new this.ElementPool(20),
    arrowPool : new this.ElementPool(50),

    clear : function() {
      this.nodePool.clear();
      this.connectorPool.clear();
      this.arrowPool.clear();
    },

    reset: function() {
      this.nodePool.reset();
      this.connectorPool.reset();
      this.arrowPool.reset();
    }
  };

  this.destroy = function() {
    this.cache.clear();
    paper = null;
  };

  /** Invoked at the start of the continuation that updates all nodes. */
  this.resetCache = function() {
    this.cache.reset();
  };

  /** Disable all cached Node instances at or beyond the cutoff index,
   * preserving up to 100 disabled nodes and 20 disabled connector nodes,
   * and removing the rest from the cache.
   * Invoked at the end of the continuation that updates all nodes. */
  this.disableBeyond = function(nodeCuttoff, connectorCuttoff) {
    this.cache.nodePool.disableBeyond(nodeCuttoff);
    this.cache.connectorPool.disableBeyond(connectorCuttoff);
  };

  this.disableRemainingArrows = function() {
    // Cut cache array beyond used arrows plus 50, and obliterate the rest
    this.cache.arrowPool.disableBeyond(this.cache.arrowPool.nextIndex);
  };

  this.createArrow = (function(arrowPool, ArrowLine) {
    return function(connector, node, confidence, is_pre) {
      var arrow = arrowPool.next();
      if (!arrow) {
        arrow = new ArrowLine(paper);
        arrowPool.push(arrow);
      }
      arrow.init(connector, node, confidence, is_pre);
      return arrow;
    };
  })(this.cache.arrowPool, this.ArrowLine);

  /** Surrogate constructor that may reuse an existing, cached Node instance currently not in use.
   * Appends any newly created instances to the pool. */
  this.newNode = function(
    id,         // unique id for the node from the database
    parent,     // the parent node, if present within the subset of nodes retrieved for display; otherwise null.
    parent_id,  // the id of the parent node, or null if it is root
    radius,
    x,          // the x coordinate in pixel coordinates
    y,          // y coordinates
    z,          // z coordinates
    zdiff,      // the difference in Z from the current slice
    confidence,
    skeleton_id,// the id of the skeleton this node is an element of
    can_edit)   // a boolean combining (is_superuser or user owns the node)
  {
    var node = this.cache.nodePool.next();
    if (node) {
      node.reInit(id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, can_edit);
    } else {
      node = new this.Node(paper, id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, can_edit);
      this.cache.nodePool.push(node);
    }
    return node;
  };

  /** Surrogate constructor for ConnectorNode.
   * See "newNode" for explanations. */
  this.newConnectorNode = function(
    id,         // unique id for the node from the database
    x,          // the x coordinate in pixel coordinates
    y,          // y coordinates
    z,          // z coordinates
    zdiff,      // the different from the current slices
    confidence,
    can_edit)   // a boolean combining (is_superuser or user owns the node)
  {
    var connector = this.cache.connectorPool.next();
    if (connector) {
      connector.reInit(id, x, y, z, zdiff, confidence, can_edit);
    } else {
      connector = new this.ConnectorNode(paper, id, x, y, z, zdiff, confidence, can_edit);
      connector.createArrow = this.createArrow;
      this.cache.connectorPool.push(connector);
    }
    return connector;
  };
};


////// Definition of classes used in SkeletonElements

SkeletonElements.prototype = {};

  /** For reusing objects such as DOM elements, which are expensive to insert and remove. */
SkeletonElements.prototype.ElementPool = function(reserve_size) {
  this.pool = [];
  this.nextIndex = 0;
  this.reserve_size = reserve_size;
};

SkeletonElements.prototype.ElementPool.prototype = (function() {
  return {
    reset : function() {
      this.nextIndex = 0;
    },

    obliterateFn : function(element) {
      element.obliterate();
    },

    disableFn : function(element) {
      element.disable();
    },

    clear : function() {
      this.pool.splice(0).forEach(this.obliterateFn);
      this.reset();
    },

    disableBeyond : function(new_length) {
      if (new_length < this.pool.length) {
        // Drop elements beyond new length plus reserve
        if (this.pool.length > new_length + this.reserve_size) {
          this.pool.splice(new_length + this.reserve_size).forEach(this.obliterateFn);
        }
        // Disable elements from cut off to new ending of node pool array
        this.pool.slice(new_length).forEach(this.disableFn);
      }
    },

    next : function() {
      return this.nextIndex < this.pool.length ?
        this.pool[this.nextIndex++] : null;
    },

    /** Append a new element at the end, implying that all other elements are in use. */
    push : function(element) {
      this.pool.push(element);
      this.nextIndex += 1;
    }
  };
})();


/** A prototype for both Treenode and Connector. */
SkeletonElements.prototype.NodePrototype = new (function() {
  /** Update the local x,y coordinates of the node
   * and for its raphael objects c, mc as well. */
  this.setXY = function(xnew, ynew) {
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

  /** Create the Raphael circle elements if and only if the zdiff is zero, that is, if the node lays on the current section. */
  this.createCircle = function() {
    if (!this.shouldDisplay()) {
      return;
    }
    // c and mc may already exist if the node is being reused
    if (this.c && this.mc) {
      // Do nothing
    } else {
      // create a raphael circle object
      this.c = this.paper.circle(this.x, this.y, this.NODE_RADIUS);
      // a raphael circle oversized for the mouse logic
      this.mc = this.paper.circle(this.x, this.y, this.CATCH_RADIUS);

      SkeletonElements.prototype.mouseEventManager.attach(this.mc, this.type);
    }

    var fillcolor = this.color();

    this.c.attr({
      fill: fillcolor,
      stroke: "none",
      opacity: 1.0
    });

    // mc (where mc stands for 'mouse catcher circle') is fully transparent
    this.mc.attr({
      fill: fillcolor,  // If opacity is zero it must have a fillcolor, otherwise the mouse events ignore it
      stroke: "none",
      opacity: 0
    });

    if ("none" === this.c.node.style.display) {
      this.c.show();
      this.mc.show();
    }

    this.mc.catmaidNode = this; // for event handlers
  };

  /** Recreate the GUI components, namely the circle and edges.
   *  This is called only when creating a single node. */
  this.createGraphics = function() {
    this.createCircle();
    this.drawEdges();
  };

  this.shouldDisplay = function() {
    return this.zdiff >= 0 && this.zdiff < 1;
  };

  /** Draw a line with the other node if this or the other should be displayed. */
  this.mustDrawLineWith = function(node) {
    return this.shouldDisplay() || (node && node.shouldDisplay());
  };
})();

SkeletonElements.prototype.AbstractTreenode = function() {
  // Colors that a node can take
  this.active_skeleton_color = "rgb(255,255,0)";
  this.inactive_skeleton_color = "rgb(255,0,255)";
  this.inactive_skeleton_color_above = "rgb(0,0,255)";
  this.inactive_skeleton_color_below = "rgb(255,0,0)";
  this.root_node_color = "rgb(255,0,0)";
  this.leaf_node_color = "rgb(128,0,0)";

  // For drawing:
  this.NODE_RADIUS = 3;
  this.CATCH_RADIUS = 8;

  // ID of the disabled nodes
  this.DISABLED = -1;

  this.addChildNode = function(childNode) {
    if (!this.children.hasOwnProperty(childNode.id)) {
      ++ this.numberOfChildren;
    }
    // Still set new node object in any case, since
    // node objects can be reused for different IDs
    this.children[childNode.id] = childNode;
  };

  /** Set the node fill color depending on its distance from the
  * current slice, whether it's the active node, the root node, or in
  * an active skeleton. */
  this.color = function() {
    var color;
    if (SkeletonAnnotations.getActiveNodeId() === this.id) {
      // The active node is always in green:
      color = SkeletonAnnotations.getActiveNodeColor();
    } else if (this.isroot) {
      // The root node should be colored red unless it's active:
      color = this.root_node_color;
    } else if (0 === this.numberOfChildren) {
      color = this.leaf_node_color;
    } else {
      // If none of the above applies, just colour according to the z difference.
      color = this.colorFromZDiff();
    }

    return color;
  };

  this.updateColors = function() {
    if (this.c) {
      var fillcolor = this.color();
      this.c.attr({fill: fillcolor});
    }
    if (this.line) {
      var linecolor = this.colorFromZDiff();
      this.line.attr({stroke: linecolor});
    }
  };

  /** Updates the coordinates of the raphael path
   * that represents the line from the node to the parent. */
  this.drawLineToParent = function() {
    if (!this.parent) {
      return;
    }
    if (!this.mustDrawLineWith(this.parent)) {
      return;
    }
    var lineColor = this.colorFromZDiff();

    if (!this.line) {
      this.line = this.paper.path();
      this.line.toBack();
    }

    this.line.attr({
      path: [
        ["M", this.x, this.y],
        ["L", this.parent.x, this.parent.y]
      ],
      stroke: lineColor,
      "stroke-width": 2
    });

    // May be hidden if the node was reused
    if ("none" === this.line.node.style.display) {
      this.line.show();
    }

    if (this.confidence < 5) {
      // Create new or update
      this.number_text = this.updateConfidenceText(
          this.x, this.y, this.parent.x, this.parent.y,
          lineColor,
          this.confidence,
          this.number_text);
    } else if (this.number_text) {
      this.number_text.remove();
      this.number_text = null;
    }
  };

  /** Trigger the redrawing of the lines with parent treenode,
   * and also with children when toChildren is true. */
  this.drawEdges = function(toChildren) {
    if (toChildren) {
      for (var ID in this.children) {
        if (this.children.hasOwnProperty(ID)) {
          var child = this.children[ID];
          if (this.mustDrawLineWith(child)) {
            child.drawLineToParent();
          }
        }
      }
    }

    if (this.mustDrawLineWith(this.parent)) {
      this.drawLineToParent();
    }
  };

  /** Return a color depending upon some conditions,
   * such as whether the zdiff with the current section is positive, negative, or zero,
   * and whether the node belongs to the active skeleton.
   */
  this.colorFromZDiff = function() {
    // zdiff is in sections, therefore the current section is at [0, 1) -- notice 0 is inclusive and 1 is exclusive.
    if (this.zdiff >= 1) {
      return this.inactive_skeleton_color_above;
    } else if (this.zdiff < 0) {
      return this.inactive_skeleton_color_below;
    } else if (SkeletonAnnotations.getActiveSkeletonId() === this.skeleton_id) {
      return this.active_skeleton_color;
    }
    return this.inactive_skeleton_color;
  };

  /** Prepare node for removal from cache. */
  this.obliterate = function() {
    this.paper = null;
    this.id = null;
    this.parent = null;
    this.parent_id = null;
    this.type = null;
    this.children = null;
    if (this.c) {
      this.c.remove();
      this.c = null;
      SkeletonElements.prototype.mouseEventManager.forget(this.mc, SkeletonAnnotations.TYPE_NODE);
      this.mc.catmaidNode = null; // break circular reference
      this.mc.remove();
      this.mc = null;
    }
    if (this.line) {
      this.line.remove();
      this.line = null;
    }
    if (this.number_text) {
      this.number_text.remove();
      this.number_text = null;
    }
  };

  /** Before reusing a node, clear all the member variables that
   * are relevant to the skeleton structure.
   * All numeric variables will be overwritten,
   * and the c, mc and line will be reused. */
  this.disable = function() {
    this.id = this.DISABLED;
    this.parent = null;
    this.parent_id = this.DISABLED;
    this.children = {};
    this.numberOfChildren = 0;
    if (this.c) {
      this.c.hide();
      this.mc.hide();
    }
    if (this.line) {
      this.line.hide();
    }
    if (this.number_text) {
      this.number_text.remove();
      this.number_text = null;
    }
  };

  /** Reset all member variables and reposition Raphael circles when existing. */
  this.reInit = function(id, parent, parent_id, radius, x, y, z, zdiff, confidence, skeleton_id, can_edit) {
    this.id = id;
    this.parent = parent;
    this.parent_id = parent_id;
    this.children = {};
    this.numberOfChildren = 0;
    this.radius = radius; // the radius as stored in the database
    this.x = x;
    this.y = y;
    this.z = z;
    this.zdiff = zdiff;
    this.confidence = confidence;
    this.skeleton_id = skeleton_id;
    this.isroot = null === parent_id || isNaN(parent_id) || parseInt(parent_id) < 0;
    this.can_edit = can_edit;
    this.needsync = false;

    if (this.c) {
      if (0 !== zdiff) {
        this.c.hide();
        this.mc.hide();
      } else {
        var newCoords = {cx: x, cy: y};
        this.c.attr(newCoords);
        this.mc.attr(newCoords);
      }
    }
    if (this.line) {
      this.line.hide();
    }
    if (this.number_text) {
      this.number_text.remove();
      this.number_text = null;
    }
  };
};

SkeletonElements.prototype.AbstractTreenode.prototype = SkeletonElements.prototype.NodePrototype;


SkeletonElements.prototype.Node = function(
  paper,
  id,         // unique id for the node from the database
  parent,     // the parent node (may be null if the node is not loaded)
  parent_id,  // is null only for the root node
  radius,     // the radius
  x,          // the x coordinate in pixels
  y,          // y coordinates in pixels
  z,          // z coordinates in pixels
  zdiff,      // the difference in z from the current slice
  confidence, // confidence with the parent
  skeleton_id,// the id of the skeleton this node is an element of
  can_edit)   // whether the user can edit (move, remove) this node
{
  this.paper = paper;
  this.id = id;
  this.type = SkeletonAnnotations.TYPE_NODE;
  this.parent = parent;
  this.parent_id = parent_id;
  this.children = {};
  this.numberOfChildren = 0;
  this.radius = radius; // the radius as stored in the database
  this.x = x;
  this.y = y;
  this.z = z;
  this.zdiff = zdiff;
  this.confidence = confidence;
  this.skeleton_id = skeleton_id;
  this.can_edit = can_edit;
  this.isroot = null === parent_id || isNaN(parent_id) || parseInt(parent_id) < 0;
  this.c = null; // The Raphael circle for drawing
  this.mc = null; // The Raphael circle for mouse actions (it's a bit larger)
  this.line = null; // The Raphael line element that represents an edge between nodes
};

SkeletonElements.prototype.Node.prototype = new SkeletonElements.prototype.AbstractTreenode();


SkeletonElements.prototype.AbstractConnectorNode = function() {
  // For drawing:
  this.NODE_RADIUS = 8;
  this.CATCH_RADIUS = 8;

  /** Disables the ArrowLine object and removes entries from the preLines and postLines. */
  this.removeConnectorArrows = function() {
    if (this.preLines) {
      this.preLines.forEach(SkeletonElements.prototype.ElementPool.prototype.disableFn);
      this.preLines = null;
    }
    if (this.postLines) {
      this.postLines.forEach(SkeletonElements.prototype.ElementPool.prototype.disableFn);
      this.postLines = null;
    }
  };

  this.obliterate = function() {
    this.paper = null;
    this.id = null;
    if (this.c) {
      this.c.remove();
      SkeletonElements.prototype.mouseEventManager.forget(this.mc, SkeletonAnnotations.TYPE_CONNECTORNODE);
      this.mc.catmaidNode = null; // break circular reference
      this.mc.remove();
    }
    this.pregroup = null;
    this.postgroup = null;
    // Note: mouse event handlers are removed by c.remove and mc.remove()
    this.removeConnectorArrows(); // also removes confidence text associated with edges
    this.preLines = null;
    this.postLines = null;
  };

  this.disable = function() {
    this.id = this.DISABLED;
    if (this.c) {
      this.c.hide();
      this.mc.hide();
    }
    this.removeConnectorArrows();
    this.pregroup = null;
    this.postgroup = null;
  };

  this.colorFromZDiff = function()
  {
    // zdiff is in sections, therefore the current section is at [0, 1) -- notice 0 is inclusive and 1 is exclusive.
    if (this.zdiff >= 1) {
      return "rgb(0,0,255)";
    } else if (this.zdiff < 0) {
      return "rgb(255,0,0)";
    } else {
      return "rgb(235,117,0)";
    }
  };

  this.color = function() {
    if (SkeletonAnnotations.getActiveNodeId() === this.id) {
      return "rgb(0,255,0)";
    }
    if (this.zdiff >= 0 && this.zdiff < 1) {
      return "rgb(235,117,0)";
    }
  };

  this.updateColors = function() {
    if (this.c) {
      var fillcolor = this.color();
      this.c.attr({fill: fillcolor});
    }
  };

  this.drawEdges = function(redraw) {

    if (redraw) {
      this.removeConnectorArrows();
    }

    var i, node;

    // re-create
    for (i in this.pregroup) {
      if (this.pregroup.hasOwnProperty(i)) {
        node = this.pregroup[i].treenode;
        if (this.mustDrawLineWith(node)) {
          if (!this.preLines) this.preLines = [];
          this.preLines.push(this.createArrow(this, node, this.pregroup[i].confidence, true));
        }
      }
    }

    for (i in this.postgroup) {
      if (this.postgroup.hasOwnProperty(i)) {
        node = this.postgroup[i].treenode;
        if (this.mustDrawLineWith(node)) {
          if (!this.postLines) this.postLines = [];
          this.postLines.push(this.createArrow(this, node, this.postgroup[i].confidence, false));
        }
      }
    }
  };

  this.reInit = function(id, x, y, z, zdiff, confidence, can_edit) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.z = z;
    this.zdiff = zdiff;
    this.confidence = confidence;
    this.can_edit = can_edit;
    this.pregroup = {};
    this.postgroup = {};
    this.needsync = false;

    if (this.c) {
      if (this.shouldDisplay()) {
        var newCoords = {cx: x, cy: y};
        this.c.attr(newCoords);
        this.mc.attr(newCoords);
      } else {
        this.c.hide();
        this.mc.hide();
      }
    }

    this.preLines = null;
    this.postLines = null;
  };
};

SkeletonElements.prototype.AbstractConnectorNode.prototype = SkeletonElements.prototype.NodePrototype;

SkeletonElements.prototype.ConnectorNode = function(
  paper,
  id,         // unique id for the node from the database
  x,          // the x coordinate in pixel coordinates
  y,          // y coordinates
  z,          // z coordinates
  zdiff,      // the difference from the current slice
  confidence, // (TODO: UNUSED)
  can_edit) // whether the logged in user has permissions to edit this node -- the server will in any case enforce permissions; this is for proper GUI flow
{
  this.paper = paper;
  this.id = id;
  this.type = SkeletonAnnotations.TYPE_CONNECTORNODE;
  this.needsync = false; // state variable; whether this node is already synchronized with the database
  this.x = x; // local screen coordinates relative to the div, in pixel coordinates
  this.y = y;
  this.z = z;
  this.zdiff = zdiff;
  this.confidence = confidence;
  this.can_edit = can_edit;
  this.pregroup = {}; // set of presynaptic treenodes
  this.postgroup = {}; // set of postsynaptic treenodes
  this.c = null; // The Raphael circle for drawing
  this.mc = null; // The Raphael circle for mouse actions (it's a bit larger)
  this.preLines = null; // Array of ArrowLine to the presynaptic nodes
  this.postLines = null; // Array of ArrowLine to the postsynaptic nodes
};

SkeletonElements.prototype.ConnectorNode.prototype = new SkeletonElements.prototype.AbstractConnectorNode();

/** Event handling functions for 'mc'
* Realize that:
*    mc.prev === c
* and that, on constructing the mc, we declared:
*    mc.catmaidNode = this;  // 'this' is the node
 *
 * Below, the function() is but a namespace that returns a manager object
 * with functions attach and forget.
*/
SkeletonElements.prototype.mouseEventManager = new (function()
{
  /** Variables used for mouse events, which involve a single node at a time.
   * Includes node.x, node.y, node.id and node.c
   * These are set at mc_start, then used at mc_move, and set to null at mc_up. */
  var o = null;

  var is_middle_click = function(e) {
    return 2 === e.which;
  };

  /** Here 'this' is mc. */
  var mc_dblclick = function(e) {
    e.stopPropagation();
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.paper);
    catmaidSVGOverlay.ensureFocused();
  };

  /** 
   * Here 'this' is mc, and node is the Node instance
   */
  this.mc_click = function(e) {
    e.stopPropagation();
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.paper);
    if (catmaidSVGOverlay.ensureFocused()) {
      return;
    }
    var node = this.catmaidNode,
        wasActiveNode = false;
    if (e.shiftKey) {
      var atnID = SkeletonAnnotations.getActiveNodeId();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (!mayEdit() || !node.can_edit) {
          alert("You don't have permission to delete node #" + node.id);
          return;
        }
        // if it is active node, set active node to null
        if (node.id === atnID) {
          catmaidSVGOverlay.activateNode(null);
          wasActiveNode = true;
        }
        catmaidSVGOverlay.deleteTreenode(node, wasActiveNode);
        return true;
      }
      if (atnID) {
        var atnType = SkeletonAnnotations.getActiveNodeType();
        // connected activated treenode or connectornode
        // to existing treenode or connectornode
        if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
          if (!mayEdit()) {
            alert("You lack permissions to declare node #" + node.id + " as postsynaptic to connector #" + atnID);
            return;
          }
          // careful, atnID is a connector
          catmaidSVGOverlay.createLink(node.id, atnID, "postsynaptic_to");
          // TODO check for error
          statusBar.replaceLast("Joined node #" + atnID + " to connector #" + node.id);
        } else if (atnType === SkeletonAnnotations.TYPE_NODE) {
          // Joining two skeletons: only possible if one owns both nodes involved
          // or is a superuser
          if( node.skeleton_id === SkeletonAnnotations.getActiveSkeletonId() ) {
            alert('Can not join node with another node of the same skeleton!');
            return;
          }
          catmaidSVGOverlay.createTreenodeLink(atnID, node.id);
          // TODO check for error
          statusBar.replaceLast("Joined node #" + atnID + " to node #" + node.id);
        }

      } else {
        alert("Nothing to join without an active node!");
      }
    } else {
      // activate this node
      catmaidSVGOverlay.activateNode(node);
    }
  };

  /** Here 'this' is mc, and node is the Node instance. */
  var mc_move = function(dx, dy, x, y, e) {
    if (is_middle_click(e)) {
      // Allow middle-click panning
      return;
    }
    if (!o) {
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

    if (o.id !== SkeletonAnnotations.getActiveNodeId()) return;
    if (!checkNodeID(this.catmaidNode)) return;

    var node = this.catmaidNode;

    node.x = o.ox + dx;
    node.y = o.oy + dy;
    node.c.attr({
      cx: node.x,
      cy: node.y
    });
    node.mc.attr({
      cx: node.x,
      cy: node.y
    });
    node.drawEdges(true); // TODO for connector this is overkill
    statusBar.replaceLast("Moving node #" + node.id);

    node.needsync = true;
  };

  /** Here 'this' is mc. */
  var mc_up = function(e) {
    e.stopPropagation();
    if (!checkNodeID(this.catmaidNode)) return;
    o = null;
    this.catmaidNode.c.attr({
      opacity: 1
    });
  };

  var checkNodeID = function(catmaidNode) {
    if (!o || o.id !== catmaidNode.id) {
      console.log("WARNING: detected ID mismatch in mouse event system.");
      SkeletonAnnotations.getSVGOverlayByPaper(catmaidNode.paper).updateNodes();
      return false;
    }
    return true;
  };

  /** Here 'this' is mc. */
  var mc_start = function(x, y, e) {
    
    if (is_middle_click(e)) {
      // Allow middle-click panning
      return;
    }
    e.stopPropagation();

    // If not trying to join or remove a node, but merely click on it to drag it or select it:
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      SkeletonAnnotations
        .getSVGOverlayByPaper(this.paper)
        .activateNode(this.catmaidNode);
    }

    o = {ox: this.catmaidNode.x,
         oy: this.catmaidNode.y,
         id: this.catmaidNode.id};

    this.catmaidNode.c.attr({
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
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.paper);
    e.stopPropagation();
    var atnID = SkeletonAnnotations.getActiveNodeId(),
        connectornode = this.catmaidNode,
        wasActiveNode = false;
    if (catmaidSVGOverlay.ensureFocused()) {
      return;
    }
    // return some log information when clicked on the node
    // this usually refers here to the mc object
    if (e.shiftKey) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (connectornode.id === atnID) {
          catmaidSVGOverlay.activateNode(null);
          wasActiveNode = true;
        }
        catmaidSVGOverlay.deleteConnectorNode(connectornode);
        return true;
      }
      if (atnID) {
        var atnType = SkeletonAnnotations.getActiveNodeType();
        // connected activated treenode or connectornode
        // to existing treenode or connectornode
        if (atnType === SkeletonAnnotations.TYPE_CONNECTORNODE) {
          alert("Can not join two connector nodes!");
        } else if (atnType === SkeletonAnnotations.TYPE_NODE) {
          var synapse_type = e.altKey ? 'post' : 'pre';
          catmaidSVGOverlay.createLink(atnID, connectornode.id, synapse_type + "synaptic_to");
          statusBar.replaceLast("Joined node #" + atnID + " with connector #" + connectornode.id);
        }
      } else {
        growlAlert('BEWARE', 'You need to activate a node before joining it to a connector node!');
      }
    } else {
      // activate this node
      catmaidSVGOverlay.activateNode(connectornode);
    }
  };

  this.attach = function(mc, type) {
    mc.drag(mc_move, mc_start, mc_up);
    mc.mousedown(mc_mousedown);
    mc.dblclick(mc_dblclick);

    if (SkeletonAnnotations.TYPE_NODE === type) {
      mc.click(this.mc_click);
    } else {
      // SkeletonAnnotations.TYPE_CONNECTORNODE
      mc.click(connector_mc_click);
    }
  };
  
  this.forget = function(mc, type) {
    mc.undrag();
    mc.unmousedown(mc_mousedown);
    mc.undblclick(mc_dblclick);

    if (SkeletonAnnotations.TYPE_NODE === type) {
      mc.unclick(this.mc_click);
    } else {
      // SkeletonAnnotations.TYPE_CONNECTORNODE
      mc.unclick(connector_mc_click);
    }
  };
})();


SkeletonElements.prototype.ArrowLine = function(paper) {
  this.line = paper.path(this.pathString);
  this.arrowPath = paper.path(this.arrowString);
  this.arrowPath.mousedown(this.mousedown);
  this.confidence_text = null;
};

SkeletonElements.prototype.ArrowLine.prototype = new (function() {
  this.PRE_COLOR = "rgb(200,0,0)";
  this.POST_COLOR = "rgb(0,217,232)";
  this.pathString = "M0,0,L1,0";
  this.arrowString = "M0,0,L-5,-5,L-5,5,L0,0";

  /** Function to assign to the Raphael arrowPath. */
  this.mousedown = (function(e) {
    e.stopPropagation();
    if(!(e.shiftKey && (e.ctrlKey || e.metaKey))) {
      return;
    }
    // 'this' will be the the arrowPath
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.paper);
    requestQueue.register(django_url + project.id + '/link/delete', "POST", {
      pid: project.id,
      connector_id: this.connector_id,
      treenode_id: this.treenode_id
    }, function (status, text) {
      if (status !== 200) {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
      } else {
          if (text && text !== " ") {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              catmaidSVGOverlay.updateNodes();
              return true;
            }
          }
      }
    });
  });

  this.update = function(x1, y1, x2, y2, stroke_color, confidence) {
    var rloc = 9;
    var xdiff = (x2 - x1);
    var ydiff = (y2 - y1);
    var le = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
    if( le === 0 ) {
        le = 0.9 * rloc;
    }
    var F = (1 - rloc / le);
    var x1new = (x1 - x2) * F + x2;
    var y1new = (y1 - y2) * F + y2;
    var x2new = (x2 - x1) * F + x1;
    var y2new = (y2 - y1) * F + y1;

    var angle = Raphael.angle(x2new, y2new, x1new, y1new);

    // Reset transform
    this.line.transform("");
    // Translate, rotate and scale
    var length = Math.sqrt((x2new - x1new) * (x2new - x1new) +
                           (y2new - y1new) * (y2new - y1new));
    this.line.transform( "t" + x1new + "," + y1new +
                         "r" + angle + ",0,0" +
                         "s" + length + "," + length + ",0,0");

    // Reset transform
    this.arrowPath.transform("");
    // Translate and then rotate relative to 0,0 (preconcatenates)
    this.arrowPath.transform("t" + x2new + "," + y2new + "r" + angle + ",0,0");

    if (confidence < 5) {
      this.confidence_text = this.updateConfidenceText(x1, y1, x2, y2, stroke_color, confidence, this.confidence_text);
    } else if (this.confidence_text) {
      this.confidence_text.remove();
      this.confidence_text = null;
    }

    // Adjust
    this.line.attr({"stroke": stroke_color,
                        "stroke-width": 2});
    // Adjust color
    this.arrowPath.attr({
      "fill": stroke_color,
      "stroke": stroke_color
    });

    this.show();
  };

  this.show = function() {
    // Ensure visible
    if ("none" === this.line.node.style.display) {
      this.line.show();
      this.arrowPath.show();
      // show may not enough
      this.line.node.style.display = "block";
      this.arrowPath.node.style.display = "block";
    }
  };

  this.disable = function() {
    this.arrowPath.connector_id = null;
    this.arrowPath.treenode_id = null;
    this.line.hide();
    this.arrowPath.hide();
    if (this.confidence_text) this.confidence_text.hide();
  };

  this.obliterate = function() {
    this.arrowPath.connector_id = null;
    this.arrowPath.treenode_id = null;
    this.arrowPath.unmousedown(this.mousedown);
    this.arrowPath.remove();
    this.arrowPath = null;
    this.line.remove();
    this.line = null;
    if (this.confidence_text) {
      this.confidence_text.remove();
      this.confidence_text = null;
    }
  };

  this.init = function(connector, node, confidence, is_pre) {
    this.arrowPath.connector_id = connector.id;
    this.arrowPath.treenode_id = node.id;
    if (is_pre) {
      this.update(node.x, node.y, connector.x, connector.y, this.PRE_COLOR, confidence);
    } else {
      this.update(connector.x, connector.y, node.x, node.y, this.POST_COLOR, confidence);
    }
  };
})();


/** Used for confidence between treenode nodes and confidence between
 * a connector and a treenode. */
(function(classes) {
  var updateConfidenceText = function (x, y,
                                       parentx, parenty,
                                       fillColor,
                                       confidence,
                                       existing) {
    var text,
    numberOffset = 12,
    confidenceFontSize = '20px',
    xdiff = parentx - x,
    ydiff = parenty - y,
    length = Math.sqrt(xdiff*xdiff + ydiff*ydiff),
    nx = -ydiff / length,
    ny = xdiff / length,
    newConfidenceX = (x + parentx) / 2 + nx * numberOffset,
    newConfidenceY = (y + parenty) / 2 + ny * numberOffset;

    if (existing) {
      text = existing;
      text.show();
    } else {
      text = this.line.paper.text(newConfidenceX, newConfidenceY, ""+confidence);
      text.toBack();
    }

    text.attr({x: newConfidenceX,
               y: newConfidenceY,
               'font-size': confidenceFontSize,
               stroke: 'black',
               'stroke-width': 0.25,
               fill: fillColor,
               text: ""+confidence});

    return text;
  };

  // Inject into classes that have the member variable 'this.line'
  classes.forEach(function(c) {
    c.updateConfidenceText = updateConfidenceText;
  });
})([SkeletonElements.prototype.NodePrototype,
    SkeletonElements.prototype.ArrowLine.prototype]);
