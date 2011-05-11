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
  if (zdiff === 0) {
    fillcolor = "rgb(235, 117, 0)";
  }
  else if (zdiff === 1) {
    fillcolor = "rgb(0, 0, 255)";
  }
  else if (zdiff === -1) {
    fillcolor = "rgb(255, 0, 0)";
  }

  // if the zdiff is bigger than zero we do not allow
  // to drag the nodes
  if (this.zdiff === 0) {
    this.rcatch = r + 8;
  }
  else {
    this.rcatch = 0;
  }

  // XXX: update the parent node of this node
  // update parent's children array
/*
  this.updateParent = function(par)
  {
    // par must be a Node object
    this.parent = par;
    // update reference to oneself
    this.parent.children[id] = this;
  }*/

  // update the parent if it exists
/*
  if ( this.parent != null ) {
    // if parent exists, update it
    this.updateParent(parent);
  }*/

  // update the local x,y coordinates
  // updated them for the raphael object as well
  this.setXY = function (xnew, ynew) {
    this.x = xnew;
    this.y = ynew;
    c.attr({
      cx: this.x,
      cy: this.y
    });
    mc.attr({
      cx: this.x,
      cy: this.y
    });
    this.draw();
  };

  // set to default fill color
  this.setDefaultColor = function () {
    c.attr({
      fill: fillcolor
    });
  };

  // the accessor method for the display node
  this.getC = function () {
    return c;
  };

  // create a raphael circle object
  c = this.paper.circle(this.x, this.y, this.r).attr({
    fill: fillcolor,
    stroke: "none",
    opacity: 1.0
  });

  // a raphael circle oversized for the mouse logic
  mc = this.paper.circle(this.x, this.y, this.rcatch).attr({
    fill: "rgb(0, 1, 0)",
    stroke: "none",
    opacity: 0
  });

  // add a reference to the parent container node in the
  // raphael object in order to being able for the drag event handler
  // to do something sensible
  mc.parentnode = this;

  // an array storing the children Node objects of the this node
  // this.children = new Object();
  // XXX: delete all objects relevant to this node
  // such as raphael DOM elements and node references
  // javascript's garbage collection should do the rest
  this.deleteall = function () {
    var i;
    // test if there is any child of type ConnectorNode
    // if so, it is not allowed to remove the treenode
/*for ( var i = 0; i < children.length; ++i ) {
      if( children[i] instanceof ConnectorNode ) {
        console.log("not allowed to delete treenode with connector attached. first remove connector.")
        return;
      }
    }
    */
    // remove the parent of all the children
    for (i = 0; i < this.children.length; ++i) {
      this.children[i].line.remove();
      this.children[i].removeParent();
    }
    // remove the raphael svg elements from the DOM
    c.remove();
    mc.remove();
    if (this.parent !== null) {
      this.removeLine();
      // remove this node from parent's children list
      for (i in this.parent.children) {
        if (this.parent.children.hasOwnProperty(i)) {
          if (this.parent.children[i].id === id) {
            delete this.parent.children[i];
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
/*
    // remove from view
    c.remove();
    mc.remove();
    for(var i in this.preLines) {
      this.preLines[i].remove();
    }
    for(var i in this.postLines) {
      this.postLines[i].remove();
    }
    */
  };

  var arrowLine = function (paper, x1, y1, x2, y2, size, strowi, strocol) {
    this.remove = function () {
      arrowPath.remove();
      linePath.remove();
    };
/*
     * compute better position for arrowhead pointer
     */
    var rloc = 3;
    var xdiff = (x2 - x1);
    var ydiff = (y2 - y1);
    var le = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
    var x2new = (x2 - x1) * (1 - rloc / le) + x1;
    var y2new = (y2 - y1) * (1 - rloc / le) + y1;

    var angle = Math.atan2(x1 - x2, y2 - y1);
    angle = (angle / (2 * Math.PI)) * 360;
    var linePath = paper.path("M" + x1 + " " + y1 + " L" + x2new + " " + y2new);
    var arrowPath = paper.path("M" + x2new + " " + y2new + " L" + (x2new - size) + " " + (y2new - size) + " L" + (x2new - size) + " " + (y2new + size) + " L" + x2new + " " + y2new).attr("fill", "black").rotate((90 + angle), x2new, y2new);
    linePath.attr({
      "stroke-width": strowi,
      "stroke": strocol
    });
    arrowPath.attr({
      "fill": strocol,
      "stroke": strocol
    });
    // XXX: uncomment this for speedup
    linePath.toBack();
    arrowPath.toBack();
  };

  // updates the raphael path coordinates
  this.drawLine = function (to_id, pre) {
    var line = this.paper.path();
    if (pre) {
      line = new arrowLine(this.paper, this.pregroup[to_id].getC().attrs.cx, this.pregroup[to_id].getC().attrs.cy, c.attrs.cx, c.attrs.cy, 5, 2, "rgb(126, 57, 112)");
    } else {
      line = new arrowLine(this.paper, c.attrs.cx, c.attrs.cy, this.postgroup[to_id].getC().attrs.cx, this.postgroup[to_id].getC().attrs.cy, 5, 2, "rgb(67, 67, 128)");
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
  };

/*
   * event handlers
   */
  mc.dblclick(function (e) {
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

  mc.click(function (e) {

    // return some log information when clicked on the node
    // this usually refers here to the mc object
    if (e.shiftKey) {
      if (e.ctrlKey && e.shiftKey) {
        if (atn !== null && this.parentnode.id === atn.id) {
          activateNode(null);
        }
        statusBar.replaceLast("deleted connector with id " + this.parentnode.id);
        this.parentnode.deletenode();
        e.stopPropagation();
        return true;
      }
      if (atn !== null) {
        // connected activated treenode or connectornode
        // to existing treenode or connectornode
        // console.log("from", atn.id, "to", this.parentnode.id);
        project.createLink(atn.id, this.parentnode.id, "presynaptic_to", "presynaptic terminal", "synapse", "treenode", "connector");
        statusBar.replaceLast("joined active connector to treenode with id " + this.parentnode.id);
      } else {
        alert("You need to activate a treenode before joining it to a connector node!");
      }
      e.stopPropagation();
    } else {
      //console.log("Try to activate node");
      // activate this node
      activateNode(this.parentnode);
      // stop propagation of the event
      e.stopPropagation();
    }
  });

  mc.move = function (dx, dy) {
    activateNode(this.parentnode);
    this.parentnode.x = ox + dx;
    this.parentnode.y = oy + dy;
    c.attr({
      cx: this.parentnode.x,
      cy: this.parentnode.y
    });
    mc.attr({
      cx: this.parentnode.x,
      cy: this.parentnode.y
    });
    this.parentnode.draw();
    statusBar.replaceLast("move connector with id " + this.parentnode.id);
  };

  mc.up = function () {
    c.attr({
      opacity: 1
    });
    this.parentnode.needsync = true;
  };

  mc.start = function () {
    // as soon you do something with the node, activate it
    // activateNode( this.parentnode );
    ox = mc.attr("cx");
    oy = mc.attr("cy");
    c.attr({
      opacity: 0.7
    });
  };
  
  mc.drag(mc.move, mc.start, mc.up);

};