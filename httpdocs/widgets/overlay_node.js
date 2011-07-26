/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/** Namespace where Node instances are created and edited. */
var SkeletonElements = new function()
{
  var active_skeleton_color = "rgb(255,255,0)";
  var inactive_skeleton_color = "rgb(255,0,255)";
  var inactive_skeleton_color_above = "rgb(0,0,255)";
  var inactive_skeleton_color_below = "rgb(255,0,0)";
  var root_node_color = "rgb(255, 0, 0)";

  var TYPE_NODE = "treenode";
  var TYPE_CONNECTORNODE = "location"; // TODO update the name in the PHP files

  var CATCH_RADIUS = 8;

  /** Constructor for Node instances. */
  this.Node = function(
    id, // unique id for the node from the database
    paper, // the raphael paper this node is drawn to
    parent, // the parent node
    r, // the radius
    x, // the x coordinate in pixel coordinates
    y, // y coordinates
    z, // z coordinates
    zdiff, // the different from the current slices
    skeleton_id, is_root_node) // the id of the skeleton this node is an element of
  {
    this.id = id;
    this.type = TYPE_NODE;
    this.paper = paper;
    this.parent = parent;
    this.children = {};
    this.connectors = {};
    this.r = r < 0 ? 3 : r;
    this.x = x;
    this.y = y;
    this.z = z;
    this.zdiff = zdiff;
    this.skeleton_id = skeleton_id;
    this.isroot = is_root_node;
    this.fillcolor = inactive_skeleton_color;
    this.c = null; // The Raphael circle for drawing
    this.mc = null; // The Raphael circle for mouse actions (it's a bit larger)
    this.line = paper.path(); // TODO not all! At least root shouldn't have it

    // The member functions:
    this.setXY = setXY;
    this.drawEdges = nodeDrawEdges;
    this.drawLineToParent = nodeDrawLineToParent;
    this.draw = nodeDraw;
    this.deleteall = nodeDeleteAll;
    this.deletenode = nodeDelete;
    this.setColor = nodeSetColor;
    this.createCircle = nodeCreateCircle;

    // Init block
    // 1. Add this node to the parent's children if it exists
    if (parent) this.children[id] = this;
  };

  /** Trigger the redrawing of the lines with parent, children and connectors.
   * Here, 'this' is the node, given that it is called in the context of the node only.
   */
  var nodeDrawEdges = function() {
    var i;
    // draws/updates path to parent and children
    for (i in this.children) {
      if (this.children.hasOwnProperty(i)) {
        this.children[i].drawLineToParent();
      }
    }
    for (i in this.connectors) {
      if (this.children.hasOwnProperty(i)) {
        // should update the connector paths
        this.connectors[i].drawEdges();
      }
    }
    if (this.parent !== null) {
      this.drawLineToParent();
    }
  };

  /** Update the local x,y coordinates of the node
   * Update them for the raphael objects as well.
   * Redraw the edges as well.
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
    this.drawEdges();
  };

  /** Updates the coordinates of the raphael path
   * that represents the line from the node to the parent.
   * Here 'this' refers to the node.
   */
  var nodeDrawLineToParent = function () {
    var parent = this.parent;
    if (parent) {
      this.line.attr({
        path: [
          ["M", this.x, this.y],
          ["L", parent.x, parent.y]
        ],
        stroke: colorFromZDiff(parent.zdiff, parent.skeleton_id),
        "stroke-width": 2
      });
    }
  };

  /** Recreate the GUI components, namely the circle and edges.
   * Here 'this' refers to the node.
   */
  var nodeDraw = function() {
    var ID, line, children = this.children;
    this.drawEdges();
    // Push new edges to the back.
    for (ID in children) {
      if (children.hasOwnProperty(ID)) {
        line = children[ID].line;
        if (line) line.toBack();
      }
    }
    if (this.parent !== null && this.line) this.line.toBack();
    //
    this.createCircle();
  };

  /** Delete all objects relevant to the node
  * such as raphael DOM elements and node references
  * javascript's garbage collection should do the rest.
   * Here 'this' refers to the node.
   * TODO this function is never used? */
  var nodeDeleteAll = function()
  {
    // Test if there is any child of type ConnectorNode
    // If so, it is not allowed to remove the treenode
    var i,
        children = this.children,
        parent = this.parent;
    // Remove the parent of all the children
    for (i in children) {
      if (children.hasOwnProperty(i)) {
        children[i].line.remove();
        children[i].parent = null;
      }
    }
    // Remove the raphael svg elements from the DOM
    if (this.c) {
      this.c.remove();
      this.mc.remove();
    }
    if (parent !== null) {
      this.line.remove();
      var pc = parent.children;
      // remove this node from parent's children list
      for (i in pc) {
        if (pc.hasOwnProperty(i)) {
          if (pc[i].id === id) {
            // FIXME: use splice(1,1) instead
            delete pc[i];
          }
        }
      }
    }
  };

  /** Delete the node from the database and removes it from
   * the current view and local objects.
   * Here 'this' refers to the node.
   */
  var nodeDelete = function () {
    var node = this;
    requestQueue.register("model/treenode.delete.php", "POST", {
      pid: project.id,
      tnid: node.id
    }, function (status, text) {
      if (status !== 200) {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
      } else {
        // activate parent node when deleted
        if (node.parent) {
          // loop over nodes to see if parent is retrieved
          node.paper.catmaidSVGOverlay.selectNode(node.parent.id);
          var atn = SkeletonAnnotations.getActiveNode();
          if (!atn) {
            // The parent does not belong to the set of retrieved nodes.
            // fetch the parent node from the database and select it and go to it
            // TODO
          }
        } else {
          node.paper.catmaidSVGOverlay.activateNode(null);
        }
        // Redraw everything for now
        node.paper.catmaidSVGOverlay.updateNodes();
      }
      return true;
    });



    // in fact, doing everything on the server-side
    // (like relinking) again in the ui not best-practice
    /*
    // remove the parent of all the children
    for (var i in this.children) {
      this.children[ i ].removeLine();
      this.children[ i ].removeParent();
    }
    // remove the raphael svg elements from the DOM
    c.remove();
    mc.remove();
    this.removeLine();

    if (this.parent != null) {
      // remove this node from parent's children list
      for (var i in this.parent.children) {
        if (this.parent.children[i].id == id)
          delete this.parent.children[i];
      }
    }
    */
  };

  /** Set the node fill color depending on its distance from the
  * current slice, whether it's the active node, the root node, or in
  * an active skeleton.
   * Here 'this' refers to the node. */
  var nodeSetColor = function ()
  {
    var atn = SkeletonAnnotations.getActiveNode();
    if (atn !== null && this.id === atn.id) {
      // The active node is always in green:
      this.fillcolor = SkeletonAnnotations.getActiveNodeColor();
    } else if (this.isroot) {
      // The root node should be colored red unless it's active:
      this.fillcolor = root_node_color;
    } else {
      // If none of the above applies, just colour according to the z difference.
      this.fillcolor = colorFromZDiff(this.zdiff, this.skeleton_id);
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
  var colorFromZDiff = function(zdiff, skeleton_id)
  {
    if (zdiff > 0) {
      return inactive_skeleton_color_above;
    } else if (zdiff < 0) {
      return inactive_skeleton_color_below;
    } else if (skeleton_id == SkeletonAnnotations.getActiveSkeletonId() ) {
      return active_skeleton_color;
    }
    return inactive_skeleton_color
  };

  /** Create the Raphael circle elements if and only if the zdiff is zero, that is, if the node lays on the current section.
   * Here 'this' refers to the node.
   * */
  var nodeCreateCircle = function()
  {
    // TODO this could improve. For example the objects given as arguments could be reused forever, given that raphael merely reads them
    // TODO    and that javascript is single-threaded (at least when it comes to creating nodes in overlay.js).
    if (0 === this.zdiff) {
      var paper = this.paper;
      // create a raphael circle object
      this.c = paper.circle(this.x, this.y, this.r).attr({
        fill: this.fillcolor,
        stroke: "none",
        opacity: 1.0
      });

      // a raphael circle oversized for the mouse logic
      this.mc = paper.circle(this.x, this.y, CATCH_RADIUS).attr({
        fill: "rgb(0, 1, 0)",
        stroke: "none",
        opacity: 0
      });
      this.mc.treenode = this; // for event handlers

      nodeAssignEventHandlers(this.mc);
    }
  };


  /** Event handling functions for 'mc'
  * Realize that:
  *    mc.prev === c
  * and that, on constructing the mc, we declared:
  *    mc.treenode = this;  // 'this' is the node
  */
  var nodeAssignEventHandlers = function ()
  {
    /** Variables used for mouse events, which involve a single node at a time.
     * These are set at mc_start and then used at mc_move. */
    var ox, oy;

    /** Here 'this' is mc. */
    var mc_dblclick = function(e) {
      // TODO these sliders don't exist anymore
      if (e.altKey) {
        // zoom in
        slider_trace_s.move(-1);
      }
      else {
        // zoom out
        slider_trace_s.move(1);
      }
      this.paper.catmaidSVGOverlay.tracingCommand('goactive');
    };

    /**  Log information in the status bar when clicked on the node
     *
     * Here 'this' is mc, and treenode is the Node instance
     */
    var mc_click = function(e) {
      var node = this.treenode,
        paper = this.paper;
      if (e.shiftKey) {
        var atn = SkeletonAnnotations.getActiveNode();
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          // if it is active node, set active node to null
          if (atn !== null && node.id === atn.id) {
            paper.catmaidSVGOverlay.activateNode(null);
          }
          statusBar.replaceLast("deleted treenode with id " + node.id);
          node.deletenode();
          e.stopPropagation();
          return true;
        }
        if (atn !== null) {
          // connected activated treenode or connectornode
          // to existing treenode or connectornode
          if (atn.type === TYPE_CONNECTORNODE) {
            this.paper.catmaidSVGOverlay.createLink(atn.id, node.id, "postsynaptic_to", "synapse", "postsynaptic terminal", "connector", "treenode");
            statusBar.replaceLast("joined active treenode to connector with id " + node.id);
          } else if (atn.type === TYPE_NODE) {
            statusBar.replaceLast("joined active treenode to treenode with id " + node.id);
            paper.catmaidSVGOverlay.createTreenodeLink(atn.id, node.id);
          }

        } else {
          alert("Nothing to join without an active node!");
        }
        e.stopPropagation();

      } else {
        // activate this node
        paper.catmaidSVGOverlay.activateNode(node);
        // stop propagation of the event
        e.stopPropagation();
      }
    };

    /** Here 'this' is mc, and treenode is the Node instance. */
    var mc_move = function(dx, dy) {
      var node = this.treenode,
        mc = this,
        c = this.prev;
      this.paper.catmaidSVGOverlay.activateNode(node);
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
      node.drawEdges();
      statusBar.replaceLast("move treenode with id " + node.id);

      node.needsync = true;
    };

    /** Here 'this' is mc. */
    var mc_up = function() {
      var c = this.prev;
      c.attr({
        opacity: 1
      });
    };

    /** Here 'this' is mc, and treenode is the Node instance. */
    var mc_start = function() {
      var node = this.treenode,
        c = this.prev;
      ox = node.x;
      oy = node.y;
      c.attr({
        opacity: 0.7
      });
    };

    var mc_mousedown = function(e) {
      e.stopPropagation();
    };

    // The actual nodeAssignEventHandlers function:
    return function(mc) {
      mc.dblclick(mc_dblclick);
      mc.click(mc_click);
      mc.drag(mc_move, mc_start, mc_up);
      mc.mousedown(mc_mousedown);
    }
  }();


  // TODO must reuse nodes instead of creating them new, to avoid DOM insertions.
  // -- well, it can: just leave as members of each the functions that are really different.

  // Identical functions: setXY, setColor, createCircle, deleteAll, deletenode (but for the php URL), some of the sub-functions of createEventHandlers

  // Also, there shouldn't be a "needsync" flag. Instead, push the node to an array named "needSyncWithDB". Will avoid looping.

  // Regarding the nodes map: it should be an array of keys over objects stored in a a cache of nodes that are already inserted into the DOM
  // and that can be reused.
  // Regarding children and connectors: any reason not to make them plain arrays? Given that they are always small,
  // using a filter to find a node with a specific id would be enough.

  // WARNING deleteall is never used!
};
