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
  // the database treenode id
  this.id = id;
  // this object should be used for synapses, for now only location
  this.type = "location";

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
    if (this.zdiff > 0) {
      return "rgb(0, 0, 255)";
    } else if (this.zdiff < 0) {
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
    this.x = xnew;
    this.y = ynew;
    if (c) {
      c.attr({
        cx: this.x,
        cy: this.y
      });
      mc.attr({
        cx: this.x,
        cy: this.y
      });
    }
    this.drawEdges();
  };

  // Set the connector node fill color depending on whether it is active
  // or not
  this.setColor = function () {

    if (atn !== null && this.id === atn.id) {
      // The active node is always in green:
      fillcolor = atn_fillcolor;
    } else {
      // If none of the above applies, just colour according to the z
      // difference.
      fillcolor = this.colorFromZDiff();
    }
    
    if (this.c) {
      this.c.attr({
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
    this.c = this.paper.circle(this.x, this.y, this.r).attr({
      fill: fillcolor,
      stroke: "none",
      opacity: 1.0
    });

    // a raphael circle oversized for the mouse logic
    this.mc = this.paper.circle(this.x, this.y, this.rcatch).attr({
      fill: "rgb(0, 1, 0)",
      stroke: "none",
      opacity: 0
    });
    
    this.createEventHandlers();
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
    for (i = 0; i < this.children.length; ++i) {
      this.children[i].line.remove();
      this.children[i].removeParent();
    }
    // remove the raphael svg elements from the DOM
    if (c) {
      c.remove();
      mc.remove();
    }
    if (this.parent !== null) {
      this.removeLine();
      // remove this node from parent's children list
      for (i in this.parent.children) {
        if (this.parent.children.hasOwnProperty(i)) {
          if (this.parent.children[i].id === id) {
            // FIXME: use splice(1,1) instead
            this.parent.children.splice(i, 1);
            // delete this.parent.children[i];
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
      cid: this.id,
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
    project.updateNodes();
  };

  var arrowLine = function (paper, x1, y1, x2, y2, size, strowi, strocol) {
    this.remove = function () {
      arrowPath.remove();
      linePath.remove();
    };
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
  };

  // updates the raphael path coordinates
  this.drawLine = function (to_id, pre) {
    var line = this.paper.path();
    if (pre) {
      line = new arrowLine(this.paper, this.pregroup[to_id].x, this.pregroup[to_id].y, this.x, this.y, 5, 2, "rgb(126, 57, 112)");
    } else {
      line = new arrowLine(this.paper, this.x, this.y, this.postgroup[to_id].x, this.postgroup[to_id].y, 5, 2, "rgb(67, 67, 128)");
    }
    return line;
  };

  this.preLines = {};
  this.postLines = {};

  this.updateLines = function () {
    var i, l;
    for (i in this.preLines) {
      if(this.preLines.hasOwnProperty(i)) {
        this.preLines[i].remove();
      }
    }

    for (i in this.postLines) {
      if(this.postLines.hasOwnProperty(i)) {
        this.postLines[i].remove();
      }
    }

    // re-create
    for (i in this.pregroup) {
      if (this.pregroup.hasOwnProperty(i)) {
        l = this.drawLine(this.pregroup[i].id, true);
        this.preLines[this.pregroup[i].id] = l;
      }
    }

    for (i in this.postgroup) {
      if (this.postgroup.hasOwnProperty(i)) {
        l = this.drawLine(this.postgroup[i].id, false);
        this.postLines[this.postgroup[i].id] = l;
      }
    }

  };


  // draw function to update the paths from the children
  // and to its parent
  this.draw = function () {
    // delete lines and recreate them with the current list
    this.updateLines();
    this.createCircle();
  };
  
  this.drawEdges = this.updateLines;

  this.createEventHandlers = function () {
    var self = this;
    /*
     * event handlers
     */
    this.mc.dblclick(function (e) {
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

    this.mc.click(function (e) {

      // return some log information when clicked on the node
      // this usually refers here to the mc object
      if (e.shiftKey) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          if (atn != null && self.id == atn.id) {
            activateNode(null);
          }
          statusBar.replaceLast("deleted connector with id " + self.id);
          self.deletenode();
          e.stopPropagation();
          return true;
        }
        if (atn !== null) {
          // connected activated treenode or connectornode
          // to existing treenode or connectornode
          // console.log("from", atn.id, "to", this.parentnode.id);
          project.createLink(atn.id, self.id, "presynaptic_to", "presynaptic terminal", "synapse", "treenode", "connector");
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
        activateNode(self);
        // stop propagation of the event
        e.stopPropagation();
      }
    });

    this.mc.move = function (dx, dy) {
      activateNode(self);
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

    this.mc.up = function () {
      self.c.attr({
        opacity: 1
      });
      self.needsync = true;
    };

    this.mc.start = function () {
      ox = self.x;
      oy = self.y;
      self.c.attr({
        opacity: 0.7
      });
    };
    
    this.mc.drag(this.mc.move, this.mc.start, this.mc.up);

    this.mc.mousedown(function (e) {
      e.stopPropagation();
    });
    
  }

};
