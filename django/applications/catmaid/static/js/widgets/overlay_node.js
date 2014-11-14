/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

d3.selection.prototype.toFront = function () {
  return this.each(function () {
    this.parentNode.appendChild(this);
  });
};

d3.selection.prototype.toBack = function () {
  return this.each(function () {
    var firstChild = this.parentNode.firstChild;
    if (firstChild) {
      this.parentNode.insertBefore(this, firstChild);
    }
  });
};

d3.selection.prototype.hide = function () {
  return this.attr('visibility', 'hidden');
};

d3.selection.prototype.show = function () {
  return this.attr('visibility', 'visible');
};

/** Namespace where SVG element instances are created, cached and edited. */
var SkeletonElements = function(paper)
{
  // Create definitions for reused elements and markers
  var defs = paper.append('defs');

  // Let (concrete) element classes initialize any shared SVG definitions
  // required by their instances. Even though called statically, initDefs is an
  // instance (prototype) method so that we can get overriding inheritance of
  // pseudo-static variables.
  var concreteElements = [
    SkeletonElements.prototype.Node.prototype,
    SkeletonElements.prototype.ConnectorNode.prototype,
    SkeletonElements.prototype.ArrowLine.prototype,
  ];
  concreteElements.forEach(function (klass) {klass.initDefs(defs);});

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

  this.scale = function(baseScale, resScale, dynamicScale) {
    // Check for unchanged scale to prevent unnecessary SVG manipulation.
    if (this.scales &&
        this.scales.base === baseScale &&
        this.scales.res === resScale &&
        this.scales.dyn == dynamicScale) return;
    this.scales = {base: baseScale, res: resScale, dyn: dynamicScale};

    concreteElements.forEach(function (klass) {
      klass.scale(baseScale, resScale, dynamicScale);
    });
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
    x,          // the x coordinate in oriented project coordinates
    y,          // the y coordinate in oriented project coordinates
    z,          // the z coordinate in oriented project coordinates
    zdiff,      // the difference in Z from the current slice in stack space
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
    x,          // the x coordinate in oriented project coordinates
    y,          // the y coordinate in oriented project coordinates
    z,          // the z coordinate in oriented project coordinates
    zdiff,      // the difference in Z from the current slice in stack space
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
  this.CONFIDENCE_FONT_PT = 15;
  this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';

  /** Update the local x,y coordinates of the node
   * and for its SVG object c well. */
  this.setXY = function(xnew, ynew) {
    this.x = xnew;
    this.y = ynew;
    if (this.c) {
      this.c.attr({
        x: xnew,
        y: ynew
      });
    }
  };

  /** Create the SVG circle elements if and only if the zdiff is zero, that is, if the node lays on the current section. */
  this.createCircle = function() {
    if (!this.shouldDisplay()) {
      return;
    }
    // c may already exist if the node is being reused
    if (!this.c) {
      // create a circle object
      this.c = this.paper.append('use')
                          .attr('xlink:href', '#' + this.USE_HREF)
                          .attr('x', this.x)
                          .attr('y', this.y)
                          .classed('overlay-node', true);

      SkeletonElements.prototype.mouseEventManager.attach(this.c, this.type);
    }

    var fillcolor = this.color();

    this.c.attr({
      fill: fillcolor,
      stroke: fillcolor,
      opacity: 1.0,
      'stroke-width': this.CATCH_RADIUS,  // Use a large transparent stroke to
      'stroke-opacity': 0                 // catch mouse events near the circle.
    });
    this.c.datum(this.id);

    if ("hidden" === this.c.attr('visibility')) this.c.show();
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

  this.scale = function(baseScale, resScale, dynamicScale) {
    var scale = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
    // To account for SVG non-scaling-stroke in screen scale mode the resolution
    // scaling must not be applied to edge. While all three scales could be
    // combined to avoid this without the non-scaling-stroke, this is necessary
    // to avoid the line size be inconcistent on zoom until a redraw.
    this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * baseScale * (dynamicScale ? 1 : resScale);
    this.confidenceFontSize = this.CONFIDENCE_FONT_PT*scale + 'pt';
    this.circleDef.attr('r', this.NODE_RADIUS*scale);
  };

  this.initDefs = function(defs) {
    this.circleDef = defs.append('circle').attr({
      id: this.USE_HREF,
      cx: 0,
      cy: 0,
      r: this.NODE_RADIUS
    });
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
  this.USE_HREF = 'treenodeCircle';
  this.NODE_RADIUS = 3;
  this.CATCH_RADIUS = 5;
  this.BASE_EDGE_WIDTH = 2;

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

  /** Updates the coordinates of the SVG line from the node to the parent. */
  this.drawLineToParent = function() {
    if (!this.parent) {
      return;
    }
    if (!this.mustDrawLineWith(this.parent)) {
      return;
    }
    var lineColor = this.colorFromZDiff();

    if (!this.line) {
      this.line = this.paper.append('line');
      this.line.toBack();
    }

    this.line.attr({
        x1: this.x, y1: this.y,
        x2: this.parent.x, y2: this.parent.y,
        stroke: lineColor,
        'stroke-width': this.EDGE_WIDTH
    });

    // May be hidden if the node was reused
    this.line.show();

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
      SkeletonElements.prototype.mouseEventManager.forget(this.c, SkeletonAnnotations.TYPE_NODE);
      this.c.remove();
      this.c = null;
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
   * and the c and line will be reused. */
  this.disable = function() {
    this.id = this.DISABLED;
    this.parent = null;
    this.parent_id = this.DISABLED;
    this.children = {};
    this.numberOfChildren = 0;
    if (this.c) {
      this.c.datum(null);
      this.c.hide();
    }
    if (this.line) {
      this.line.hide();
    }
    if (this.number_text) {
      this.number_text.remove();
      this.number_text = null;
    }
  };

  /** Reset all member variables and reposition SVG circles when existing. */
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
      this.c.datum(id);
      if (0 !== zdiff) {
        this.c.hide();
      } else {
        this.c.attr({x: x, y: y});
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

  /**
   * Draws a circle around the treenode and control its radius with the help of
   * the mouse (and a mouse-to-stack transform function).
   */
  this.drawSurroundingCircle = function(transform) {
    var self = this;
    // Create a raphael circle object that represents the surrounding circle
    var color = "rgb(255,255,0)";
    var c = this.paper.append('circle')
      .attr({
        cx: this.x,
        cy: this.y,
        r: 0,
        fill: "none",
        stroke: color,
        'stroke-width': 1.5,
      });
    // Create an adhoc mouse catcher
    var mc = this.paper.append('circle')
      .attr({
        cx: this.x,
        cy: this.y,
        r: '300%',
        fill: color,  // If opacity is zero it must have a fillcolor, otherwise the mouse events ignore it
        stroke: "none",
        opacity: 0
      });

    // Mark this node as currently edited
    this.surroundingCircleElements = [c, mc];

    // Update radius on mouse move
    mc.on('mousemove', function() {
      var e = d3.event;
      var r = transform({x: e.layerX, y: e.layerY});
      r.x -= self.x;
      r.y -= self.y;
      var newR = Math.sqrt(Math.pow(r.x, 2) + Math.pow(r.y, 2));
      c.attr('r', newR);
      // Strore also x and y components
      c.datum(r);
    });

    // Don't let mouse down events bubble up
    mc.on('mousedown', function() {
        d3.event.stopPropagation();
    });
    mc.on('click', function() {
      d3.event.stopPropagation();
    });
  };

  /**
   * Remove a surrounding circle, if it is present. The callback function, if
   * any, will be called with the last radius of the circle.
   */
  this.removeSurroundingCircle = function(callback) {
    if (!this.surroundingCircleElements) {
      return;
    }
    // Get last radius components
    var r = this.surroundingCircleElements[0].datum();
    // Clean up
    this.surroundingCircleElements[0].remove();
    this.surroundingCircleElements[1].remove();
    delete this.surroundingCircleElements;
    // Execute callback, if any, with radius in nm as argument
    if (callback) {
      if (r) callback(r.x, r.y);
      else callback();
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
  this.c = null; // The SVG circle for drawing
  this.line = null; // The SVG line element that represents an edge between nodes
};

SkeletonElements.prototype.Node.prototype = new SkeletonElements.prototype.AbstractTreenode();


SkeletonElements.prototype.AbstractConnectorNode = function() {
  // For drawing:
  this.USE_HREF = 'connectornodeCircle';
  this.NODE_RADIUS = 8;
  this.CATCH_RADIUS = 0;

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
      SkeletonElements.prototype.mouseEventManager.forget(this.c, SkeletonAnnotations.TYPE_CONNECTORNODE);
      this.c.remove();
    }
    this.pregroup = null;
    this.postgroup = null;
    // Note: mouse event handlers are removed by c.remove()
    this.removeConnectorArrows(); // also removes confidence text associated with edges
    this.preLines = null;
    this.postLines = null;
  };

  this.disable = function() {
    this.id = this.DISABLED;
    if (this.c) {
      this.c.datum(null);
      this.c.hide();
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
      this.c.datum(id);
      if (this.shouldDisplay()) {
        this.c.attr({x: x, y: y});
      } else {
        this.c.hide();
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
  x,          // the x coordinate in oriented project coordinates
  y,          // the y coordinate in oriented project coordinates
  z,          // the z coordinate in oriented project coordinates
  zdiff,      // the difference in Z from the current slice in stack space
  confidence, // (TODO: UNUSED)
  can_edit) // whether the logged in user has permissions to edit this node -- the server will in any case enforce permissions; this is for proper GUI flow
{
  this.paper = paper;
  this.id = id;
  this.type = SkeletonAnnotations.TYPE_CONNECTORNODE;
  this.needsync = false; // state variable; whether this node is already synchronized with the database
  this.x = x;
  this.y = y;
  this.z = z;
  this.zdiff = zdiff;
  this.confidence = confidence;
  this.can_edit = can_edit;
  this.pregroup = {}; // set of presynaptic treenodes
  this.postgroup = {}; // set of postsynaptic treenodes
  this.c = null; // The SVG circle for drawing
  this.preLines = null; // Array of ArrowLine to the presynaptic nodes
  this.postLines = null; // Array of ArrowLine to the postsynaptic nodes
};

SkeletonElements.prototype.ConnectorNode.prototype = new SkeletonElements.prototype.AbstractConnectorNode();

/** Event handling functions for 'c'
 * Realize that on constructing the c, we declared:
 *    c.datum() = node.id;  // 'node' is the node
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
    return 1 === e.button;
  };

  /** Here 'this' is c's SVG node. */
  var mc_dblclick = function(d) {
    d3.event.stopPropagation();
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode);
    catmaidSVGOverlay.ensureFocused();
  };

  /** 
   * Here 'this' is c's SVG node, and node is the Node instance
   */
  this.mc_click = function(d) {
    var e = d3.event;
    e.stopPropagation();
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode);
    if (catmaidSVGOverlay.ensureFocused()) {
      return;
    }
    var node = catmaidSVGOverlay.nodes[d];
    if (e.shiftKey) {
      var atnID = SkeletonAnnotations.getActiveNodeId();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        return catmaidSVGOverlay.deleteNode(node.id)
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

  /** Here 'this' is c's SVG node, and node is the Node instance. */
  var mc_move = function(d) {
    var e = d3.event.sourceEvent;
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode);
    var node = catmaidSVGOverlay.nodes[d];

    if (is_middle_click(e)) return; // Allow middle-click panning

    e.stopPropagation();

    if (!o) return; // Not properly initialized with mc_start
    if (e.shiftKey) return;

    if (!mayEdit() || !node.can_edit) {
      statusBar.replaceLast("You don't have permission to move node #" + d);
      return;
    }

    if (o.id !== SkeletonAnnotations.getActiveNodeId()) return;
    if (!checkNodeID(this)) return;

    node.x += d3.event.dx;
    node.y += d3.event.dy;
    node.c.attr({
      x: node.x,
      y: node.y
    });
    node.drawEdges(true); // TODO for connector this is overkill
    statusBar.replaceLast("Moving node #" + node.id);

    node.needsync = true;
  };

  /** Here 'this' is c's SVG node. */
  var mc_up = function(d) {
    d3.event.sourceEvent.stopPropagation();
    if (!checkNodeID(this)) return;
    o = null;
    d3.select(this).attr({
      opacity: 1
    });
  };

  var checkNodeID = function(svgNode) {
    if (!o || o.id !== svgNode.__data__) {
      console.log("WARNING: detected ID mismatch in mouse event system.");
      SkeletonAnnotations.getSVGOverlayByPaper(svgNode.parentNode).updateNodes();
      return false;
    }
    return true;
  };

  /** Here 'this' is c's SVG node. */
  var mc_start = function(d) {
    var e = d3.event.sourceEvent;
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode);
    var node = catmaidSVGOverlay.nodes[d];
    if (is_middle_click(e)) {
      // Allow middle-click panning
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    // If not trying to join or remove a node, but merely click on it to drag it or select it:
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      catmaidSVGOverlay.activateNode(node);
    }

    o = {ox: node.x,
         oy: node.y,
         id: node.id};

    node.c.attr({
      opacity: 0.7
    });
  };

  var mc_mousedown = function(d) {
    var e = d3.event;
    if (is_middle_click(e)) return; // Allow middle-click panning
    e.stopPropagation();
  };

  var connector_mc_click = function(d) {
    var e = d3.event;
    e.stopPropagation();
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode);
    if (catmaidSVGOverlay.ensureFocused()) {
      return;
    }
    var atnID = SkeletonAnnotations.getActiveNodeId(),
        connectornode = catmaidSVGOverlay.nodes[d];
    if (catmaidSVGOverlay.ensureFocused()) {
      return;
    }
    // return some log information when clicked on the node
    // this usually refers here to the c object
    if (e.shiftKey) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        return catmaidSVGOverlay.deleteNode(connectornode.id);
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
    var drag = d3.behavior.drag();
    drag.on('dragstart', mc_start)
        .on('drag', mc_move)
        .on('dragend', mc_up);
    mc.on('mousedown', mc_mousedown)
      .on("dblclick", mc_dblclick)
      .call(drag);

    if (SkeletonAnnotations.TYPE_NODE === type) {
      mc.on("click", this.mc_click);
    } else {
      // SkeletonAnnotations.TYPE_CONNECTORNODE
      mc.on("click", connector_mc_click);
    }
  };
  
  this.forget = function(mc, type) {
    ['dragstart', 'drag', 'dragstop', 'mousedown', 'dblclick', 'click'].forEach(function (l) {
      mc.on(l, null);
    });
  };
})();


SkeletonElements.prototype.ArrowLine = function(paper) {
  this.line = paper.append('line');
  this.line.on('mousedown', this.mousedown);
  this.confidence_text = null;
};

SkeletonElements.prototype.ArrowLine.prototype = new (function() {
  this.PRE_COLOR = "rgb(200,0,0)";
  this.POST_COLOR = "rgb(0,217,232)";
  this.BASE_EDGE_WIDTH = 2;
  this.CONFIDENCE_FONT_PT = 15;
  this.confidenceFontSize = this.CONFIDENCE_FONT_PT + 'pt';

  /** Function to assign to the SVG arrow. */
  this.mousedown = (function(d) {
    var e = d3.event;
    e.stopPropagation();
    if(!(e.shiftKey && (e.ctrlKey || e.metaKey))) {
      return;
    }
    // 'this' will be the the connector line
    var catmaidSVGOverlay = SkeletonAnnotations.getSVGOverlayByPaper(this.parentNode);
    requestQueue.register(django_url + project.id + '/link/delete', "POST", {
      pid: project.id,
      connector_id: d.connector_id,
      treenode_id: d.treenode_id
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

  this.update = function(x1, y1, x2, y2, is_pre, confidence, rloc) {
    var xdiff = (x2 - x1);
    var ydiff = (y2 - y1);
    var le = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
    if( le === 0 ) {
        le = 0.9 * rloc;
    }
    rloc *= 2; // rloc is the radius of target node, which we don't want to touch.
    var F = (1 - rloc / le);
    var x2new = (x2 - x1) * F + x1;
    var y2new = (y2 - y1) * F + y1;

    this.line.attr({x1: x1, y1: y1, x2: x2new, y2: y2new});

    var stroke_color = is_pre ? this.PRE_COLOR : this.POST_COLOR;

    if (confidence < 5) {
      this.confidence_text = this.updateConfidenceText(x2, y2, x1, y1, stroke_color, confidence, this.confidence_text);
    } else if (this.confidence_text) {
      this.confidence_text.remove();
      this.confidence_text = null;
    }

    // Adjust
    this.line.attr({stroke: stroke_color,
                    'stroke-width': this.EDGE_WIDTH,
                    'marker-end': is_pre ? 'url(#markerArrowPre)' : 'url(#markerArrowPost)'});

    this.show();
  };

  this.show = function() {
    // Ensure visible
    if ('hidden' === this.line.attr('visibility')) {
      this.line.show();
    }
  };

  this.disable = function() {
    this.line.datum(null);
    this.line.hide();
    if (this.confidence_text) this.confidence_text.hide();
  };

  this.obliterate = function() {
    this.line.datum(null);
    this.line.on('mousedown', null);
    this.line.remove();
    this.line = null;
    if (this.confidence_text) {
      this.confidence_text.remove();
      this.confidence_text = null;
    }
  };

  this.init = function(connector, node, confidence, is_pre) {
    this.line.datum({connector_id: connector.id, treenode_id: node.id});
    if (is_pre) {
      this.update(node.x, node.y, connector.x, connector.y, is_pre, confidence, connector.NODE_RADIUS);
    } else {
      this.update(connector.x, connector.y, node.x, node.y, is_pre, confidence, node.NODE_RADIUS);
    }
  };

  var markerSize = [5, 4];

  this.scale = function(baseScale, resScale, dynamicScale) {
    var scale = baseScale * resScale * (dynamicScale ? dynamicScale : 1);
    this.EDGE_WIDTH = this.BASE_EDGE_WIDTH * baseScale * (dynamicScale ? 1 : resScale);
    this.confidenceFontSize = this.CONFIDENCE_FONT_PT*scale + 'pt';
    // If not in screen scaling mode, do not need to scale markers (but must reset scale).
    scale = dynamicScale ? resScale*dynamicScale : 1;
    this.markerDefs.forEach(function (m) {
      m.attr({
        markerWidth: markerSize[0]*scale,
        markerHeight: markerSize[1]*scale
      });
    });
  };

  this.initDefs = function(defs) {
    // Note that in SVG2 the fill could be set to 'context-stroke' and would
    // work appropriately as an end marker for both pre- and post- connectors.
    // However, this SVG2 feature is not supported in current browsers, so two
    // connectors are created, one for each color.
    this.markerDefs = [
      defs.append('marker'),
      defs.append('marker')];
    var ids = ['markerArrowPost', 'markerArrowPre'];
    var colors = [this.POST_COLOR, this.PRE_COLOR];
    this.markerDefs.forEach(function (m, i) {
        m.attr({
        id: ids[i],
        viewBox: '0 0 10 10',
        markerWidth: markerSize[0],
        markerHeight: markerSize[1],
        markerUnits: 'strokeWidth',
        refX: '10',
        refY: '5',
        orient: 'auto'
      }).append('path').attr({
        d: 'M 0 0 L 10 5 L 0 10 z',
        fill: colors[i]
      });
    });
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
    numberOffset = this.CONFIDENCE_FONT_PT * 1.5,
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
      text = d3.select(this.line.node().parentNode).append('text');
      text.toBack();
    }

    text.attr({x: newConfidenceX,
               y: newConfidenceY,
               'font-size': this.confidenceFontSize,
               'text-anchor': 'middle',
               stroke: 'black',
               'stroke-width': 0.5,
               fill: fillColor})
        .text(""+confidence);

    return text;
  };

  // Inject into classes that have the member variable 'this.line'
  classes.forEach(function(c) {
    c.updateConfidenceText = updateConfidenceText;
  });
})([SkeletonElements.prototype.NodePrototype,
    SkeletonElements.prototype.ArrowLine.prototype]);
