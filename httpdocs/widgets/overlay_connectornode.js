/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/*
 * A connector node object
 * Copy-and-Paste from Node
 */
ConnectorNode = function (
id, // unique id for the node from the database
paper, // the raphael paper this node is drawn to
r, // radius
x, // the x coordinate in pixel coordinates
y, // y coordinates
z, // z coordinates
zdiff) // the different from the current slices
{
  var self = this;
  // the database treenode id
  this.id = id;
  // this object should be used for synapses, for now only location
  this.type = "location"; // TODO update this name!

  // state variable whether this node is already synchronized with the database
  this.needsync = false;

  // local screen coordinates relative to the div
  // pixel coordinates
  this.x = x;
  this.y = y;
  this.z = z;
  this.zdiff = zdiff;
  this.paper = paper;

  // set of presynaptic treenodes
  this.pregroup = {};

  // set of postsynaptic treenodes
  this.postgroup = {};

  // prefixed radius for now
  this.r = r;

  // local variables, only valid in the scope of a node
  // and not accessible to the outisde
  var ox = 0,
      oy = 0;
    
  // the raphael node objects, one for display, the other
  // slightly bigger one for dragging
  var c, mc;

  // the node fill color depending on its distance for the
  // current slice
  var fillcolor;

  this.colorFromZDiff = function() {
    if (self.zdiff > 0) {
      return "rgb(0, 0, 255)";
    } else if (self.zdiff < 0) {
      return "rgb(255, 0, 0)";
    } else {
      return "rgb(235, 117, 0)";
    }
  };

  // if the zdiff is bigger than zero we do not allow
  // to drag the nodes
  if (this.zdiff === 0) {
    this.rcatch = r + 8;
  }
  else {
    this.rcatch = 0;
  }

  // update the local x,y coordinates
  // updated them for the raphael object as well
  this.setXY = function (xnew, ynew) {
    self.x = xnew;
    self.y = ynew;
    if (c) {
      c.attr({
        cx: self.x,
        cy: self.y
      });
      mc.attr({
        cx: self.x,
        cy: self.y
      });
    }
    self.drawEdges();
  };

  // Set the connector node fill color depending on whether it is active
  // or not
  this.setColor = function () {
    var atn = SkeletonAnnotations.getActiveNode();
    var atn_fillcolor = SkeletonAnnotations.getActiveNodeColor();
    if (atn !== null && self.id === atn.id) {
      // The active node is always in green:
      fillcolor = atn_fillcolor;
    } else {
      // If none of the above applies, just colour according to the z
      // difference.
      fillcolor = self.colorFromZDiff();
    }
    
    if (self.c) {
      self.c.attr({
        fill: fillcolor
      });
    }
  };

  // the accessor method for the display node
  this.getC = function () {
    return c;
  };

  this.createCircle = function () {
    // create a raphael circle object
    self.c = self.paper.circle(self.x, self.y, self.r).attr({
      fill: fillcolor,
      stroke: "none",
      opacity: 1.0
    });

    // a raphael circle oversized for the mouse logic
    self.mc = self.paper.circle(self.x, self.y, self.rcatch).attr({
      fill: "rgb(0, 1, 0)",
      stroke: "none",
      opacity: 0
    });
    
    self.createEventHandlers();
  };

  // set the fill color of this connector
  this.setColor();

  // an array storing the children Node objects of the this node
  // this.children = new Object();
  // XXX: delete all objects relevant to this node
  // such as raphael DOM elements and node references
  // javascript's garbage collection should do the rest
  this.deleteall = function () {
    var i;
    // remove the parent of all the children
    for (i = 0; i < self.children.length; ++i) {
      self.children[i].line.remove();
      self.children[i].removeParent();
    }
    // remove the raphael svg elements from the DOM
    if (c) {
      c.remove();
      mc.remove();
    }
    if (self.parent !== null) {
      self.removeLine();
      // remove this node from parent's children list
      for (i in self.parent.children) {
        if (self.parent.children.hasOwnProperty(i)) {
          if (self.parent.children[i].id === id) {
            // FIXME: use splice(1,1) instead
            self.parent.children.splice(i, 1);
            // delete self.parent.children[i];
          }
        }
      }
    }
  };

/*
   * delete the connector from the database and removes it from
   * the current view and local objects
   *
   */
  this.deletenode = function () {
    requestQueue.register("model/connector.delete.php", "POST", {
      pid: project.id,
      cid: self.id,
      class_instance_type: 'synapse'
    }, function (status, text, xml) {
      if (status !== 200) {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
      }
      return true;
    });

    // refresh the nodes again in order to remove the lines
    // and not have references to the connector anymore in the
    // treenodes
    self.paper.catmaidSVGOverlay.updateNodes();  // TODO this is overkill
  };


  // Constructor method for ArrowLine
  var ArrowLine = function (paper, x1, y1, x2, y2, size, strowi, strocol) {
    /*
     * compute position for arrowhead pointer
     */
    var rloc = 9;
    var xdiff = (x2 - x1);
    var ydiff = (y2 - y1);
    var le = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
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
    arrowPath.attr({
      "fill": strocol,
      "stroke": strocol
    });
    // The 'this' refers to the new ArrowLine, so don't use the ConnectorNode.self!
    this.remove = function () {
      arrowPath.remove();
      linePath.remove();
    };
  };

  // updates the raphael path coordinates
  var createLine = function (to_id, pre) {
    var line;
    if (pre) {
      line = new ArrowLine(self.paper, self.pregroup[to_id].x, self.pregroup[to_id].y, self.x, self.y, 5, 2, "rgb(126, 57, 112)");
    } else {
      line = new ArrowLine(self.paper, self.x, self.y, self.postgroup[to_id].x, self.postgroup[to_id].y, 5, 2, "rgb(67, 67, 128)");
    }
    return line;
  };

  // TODO convert to arrays: would iterate faster without one function call per line. Measure performance!
  this.preLines = {};
  this.postLines = {};

  this.updateLines = function () {
    var i, l;
    for (i in self.preLines) {
      if(self.preLines.hasOwnProperty(i)) {
        if (self.preLines[i].remove)
          self.preLines[i].remove();
        else console.log(i, self.preLines[i]);
      }
    }

    for (i in self.postLines) {
      if(self.postLines.hasOwnProperty(i)) {
        if (self.postLines[i].remove)
          self.postLines[i].remove();
        else console.log(i, self.postLines[i]);
      }
    }

    // re-create
    for (i in self.pregroup) {
      if (self.pregroup.hasOwnProperty(i)) {
        l = createLine(self.pregroup[i].id, true);
        self.preLines[self.pregroup[i].id] = l;
      }
    }

    for (i in self.postgroup) {
      if (self.postgroup.hasOwnProperty(i)) {
        l = createLine(self.postgroup[i].id, false);
        self.postLines[self.postgroup[i].id] = l;
      }
    }

  };


  // draw function to update the paths from the children
  // and to its parent
  this.draw = function () {
    // delete lines and recreate them with the current list
    self.updateLines();
    self.createCircle();
  };
  
  this.drawEdges = this.updateLines;

  this.createEventHandlers = function () {
    /*
     * event handlers
     */
    self.mc.dblclick(function (e) {
      if (e.altKey) {
        // zoom in
        slider_trace_s.move(-1);
      }
      else {
        // zoom out
        slider_trace_s.move(1);
      }
      project.tracingCommand('goactive');
    });

    self.mc.click(function (e) {
      var atn = SkeletonAnnotations.getActiveNode();
      // return some log information when clicked on the node
      // this usually refers here to the mc object
      if (e.shiftKey) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          if (atn != null && self.id == atn.id) {
            self.paper.catmaidSVGOverlay.activateNode(null);
          }
          statusBar.replaceLast("deleted connector with id " + self.id);
          self.deletenode();
          e.stopPropagation();
          return true;
        }
        if (atn !== null) {
          // connected activated treenode or connectornode
          // to existing treenode or connectornode
          // console.log("from", atn.id, "to", self.parentnode.id);
          paper.catmaidSVGOverlay.createLink(atn.id, self.id, "presynaptic_to", "presynaptic terminal", "synapse", "treenode", "connector");
          statusBar.replaceLast("joined active connector to treenode with id " + self.id);
        } else {
          var g = $('body').append('<div id="growl-alert" class="growl-message"></div>').find('#growl-alert');
          g.growlAlert({
            autoShow: true,
            content: 'You need to activate a treenode before joining it to a connector node!',
            title: 'BEWARE',
            position: 'top-right',
            delayTime: 2500,
            onComplete: function() { g.remove(); }
          });
        }
        e.stopPropagation();
      } else {
        //console.log("Try to activate node");
        // activate this node
        self.paper.catmaidSVGOverlay.activateNode(self);
        // stop propagation of the event
        e.stopPropagation();
      }
    });

    self.mc.move = function (dx, dy) {
      self.paper.catmaidSVGOverlay.activateNode(self);
      self.x = ox + dx;
      self.y = oy + dy;
      self.c.attr({
        cx: self.x,
        cy: self.y
      });
      self.mc.attr({
        cx: self.x,
        cy: self.y
      });
      self.drawEdges();
      statusBar.replaceLast("move connector with id " + self.id);
    };

    self.mc.up = function () {
      self.c.attr({
        opacity: 1
      });
      self.needsync = true;
    };

    self.mc.start = function () {
      ox = self.x;
      oy = self.y;
      self.c.attr({
        opacity: 0.7
      });
    };
    
    self.mc.drag(self.mc.move, self.mc.start, self.mc.up);

    self.mc.mousedown(function (e) {
      e.stopPropagation();
    });
    
  }

};
