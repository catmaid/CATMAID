/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


// Global color properties
var active_skeleton_color = "rgb(255,255,0)";
var inactive_skeleton_color = "rgb(255,0,255)";
var inactive_skeleton_color_above = "rgb(0,0,255)";
var inactive_skeleton_color_below = "rgb(255,0,0)";

/*
 * A treenode object
 */
var Node = function (
	id, // unique id for the node from the database
	paper, // the raphael paper this node is drawn to
	parent, // the parent node
	r, // the radius
	x, // the x coordinate in pixel coordinates
	y, // y coordinates
	z, // z coordinates
	zdiff, // the different from the current slices
	skeleton_id,
	is_root_node) // the id of the skeleton this node is an element of
{

  var self = this;

  // the database treenode id
  this.id = id;

  // this object should be used for treenodes
  this.type = "treenode";

  // state variable whether this node is already synchronized with the database
  this.needsync = false;

  // is this node a root node
  this.isroot = is_root_node;

  // local screen coordinates relative to the div
  // pixel coordinates
  this.x = x;
  this.y = y;
  this.z = z;
  this.zdiff = zdiff;
  this.skeleton_id = skeleton_id;
  this.parent = parent;
  this.paper = paper;
  this.r = r;

  // local variables, only valid in the scope of a node
  // and not accessible to the outisde
  var ox = 0,
      oy = 0;
  // the raphael node objects, one for display, the other
  // slightly bigger one for dragging
  var c, mc;
  // the line that is drawn to its parent
  var line = this.paper.path(); // TODO not all!

  this.fillcolor = inactive_skeleton_color;

  this.colorFromZDiff = function() {
    if (this.zdiff > 0) {
      return inactive_skeleton_color_above;
    } else if (this.zdiff < 0) {
      return inactive_skeleton_color_below;
    } else {
      if (atn && atn.skeleton_id != this.skeleton_id) {
        return inactive_skeleton_color;
      } else {
        if (this.skeleton_id == active_skeleton_id ) {
          return active_skeleton_color;
        } else {
          return inactive_skeleton_color;
        }
      }
    }
  };

  // Set the node fill color depending on its distance from the
  // current slice, whether it's the active node, the root node, or in
  // an active skeleton.
  this.setColor = function () {
    if (atn !== null && self.id === atn.id) {
      // The active node is always in green:
      fillcolor = atn_fillcolor;
    } else if (self.isroot) {
      // The root node should be colored red unless it's active:
      fillcolor = "rgb(255, 0, 0)";
    } else {
      // If none of the above applies, just colour according to the z
      // difference.
      fillcolor = self.colorFromZDiff();
    }
    
    if (c) {
      c.attr({
        fill: fillcolor
      });
    }
  };

  if (this.r < 0) {
    this.r = 3;
  }

  // if the zdiff is bigger than zero we do not allow
  // to drag the nodes
  if (this.zdiff === 0) {
    this.rcatch = r + 8;
  }
  else {
    this.rcatch = 0;
  }

  // Update the parent's children if it exists
  if (this.parent) {
    this.parent.children[this.id] = this;
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

  this.createCircle = function () {
    // Create c and mc ONLY if the node is in the current section
    if (0 == self.zdiff) {
      // create a raphael circle object
      c = self.paper.circle(self.x, self.y, self.r).attr({
        fill: fillcolor,
        stroke: "none",
        opacity: 1.0
      });

      // a raphael circle oversized for the mouse logic
      mc = self.paper.circle(self.x, self.y, self.rcatch).attr({
        fill: "rgb(0, 1, 0)",
        stroke: "none",
        opacity: 0
      });
      
      self.createEventHandlers();
    }
  }

  this.setColor();

  // an array storing the children Node objects of the this node
  this.children = {};

  // an array storing the reference to all attached connector
  this.connectors = {};

  // delete all objects relevant to this node
  // such as raphael DOM elements and node references
  // javascript's garbage collection should do the rest
  this.deleteall = function () {
    // test if there is any child of type ConnectorNode
    // if so, it is not allowed to remove the treenode
    var i;
    // remove the parent of all the children
    for (i = 0; i < self.children.length; ++i) {
      self.children[i].removeLine();
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
            delete self.parent.children[i];
          }
        }
      }
    }
  };

/*
   * delete the node from the database and removes it from
   * the current view and local objects
   *
   */
  this.deletenode = function () {
    requestQueue.register("model/treenode.delete.php", "POST", {
      pid: project.id,
      tnid: self.id
    }, function (status, text) {
      if (status !== 200) {
        alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
      }
      return true;
    });

    // activate parent node when deleted
    if (self.parent) {
      // loop over nodes to see if parent is retrieved
      paper.catmaidSVGOverlay.selectNode(self.parent.id);
      if (!atn) {
		  // fetch the parent node from the database and select it
		  // TODO
	  }
    } else {
      paper.catmaidSVGOverlay.activateNode(null);
    }
    // redraw everything for now
    paper.catmaidSVGOverlay.updateNodes();

    // infact, doing everything done on the server-side
    // (like relinking) again in the ui not best-practice
/*
    // remove the parent of all the children
    for ( var i in this.children) {
      this.children[ i ].removeLine();
      this.children[ i ].removeParent();
    }
    // remove the raphael svg elements from the DOM
    c.remove();
    mc.remove();
    this.removeLine();

    if(this.parent != null) {
      // remove this node from parent's children list
      for ( var i in this.parent.children) {
        if(this.parent.children[i].id == id)
         delete this.parent.children[i];
      }
    }
    */
  };

  // remove the raphael line to the parent
  this.removeLine = function () {
    line.remove();
  };

  // remove the parent node
  this.removeParent = function () {
    delete self.parent;
    self.parent = null;
  };

  // updates the raphael path coordinates
  this.drawLineToParent = function () {
    if (self.parent) {
      line.attr({
        path: [
          ["M", self.x, self.y],
          ["L", self.parent.x, self.parent.y]
        ],
        stroke: self.parent.colorFromZDiff(),
        "stroke-width": 2
      });
    }
  };

  // draw function to update the paths from the children
  // and to its parent
  this.drawEdges = function () {
    var i;
    // draws/updates path to parent and children
    for (i in self.children) {
      if (self.children.hasOwnProperty(i)) {
        self.children[i].drawLineToParent();
      }
    }
    for (i in self.connectors) {
      if (self.children.hasOwnProperty(i)) {
        // should update the connector paths
        self.connectors[i].drawEdges();
      }
    }
    if (self.parent !== null) {
      self.drawLineToParent();
    }
  };

  this.draw = function () {
    var i, l;
    self.drawEdges();
    // Push new edges to the back.
    for (i in self.children) {
      if (self.children.hasOwnProperty(i)) {
        l = self.children[i].line;
        if (l) l.toBack();
      }
    }
    if (self.parent !== null && self.line) self.line.toBack();
    //
    self.createCircle();
  };



  this.createEventHandlers = function () {
		var self = this;
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
			//    console.log("atn.id", atn.id);
			//  console.log("treenode: clicked", this.parentnode.id, "active is", atn.id);
			// return some log information when clicked on the node
			// this usually refers here to the mc object
			if (e.shiftKey) {
				if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
					// if it is active node, set active node to null
					if (atn !== null && self.id === atn.id) {
						paper.catmaidSVGOverlay.activateNode(null);
					}
					statusBar.replaceLast("deleted treenode with id " + self.id);
					self.deletenode();
					e.stopPropagation();
					return true;
				}
				if (atn !== null) {
					// connected activated treenode or connectornode
					// to existing treenode or connectornode
					if (atn.type === "location") {
						paper.catmaidSVGOverlay.createLink(atn.id, self.id, "postsynaptic_to", "synapse", "postsynaptic terminal", "connector", "treenode");
						statusBar.replaceLast("joined active treenode to connector with id " + self.id);
					} else if (atn.type === "treenode") {
						statusBar.replaceLast("joined active treenode to treenode with id " + self.id);
						paper.catmaidSVGOverlay.createTreenodeLink(atn.id, self.id);
					}

				} else {
					alert("Nothing to join without an active node!");
				}
				e.stopPropagation();

			} else {
				// activate this node
				paper.catmaidSVGOverlay.activateNode(self);
				// stop propagation of the event
				e.stopPropagation();
			}
		});

		mc.move = function (dx, dy) {
			paper.catmaidSVGOverlay.activateNode(self);
			self.x = ox + dx;
			self.y = oy + dy;
			c.attr({
				cx: self.x,
				cy: self.y
			});
			mc.attr({
				cx: self.x,
				cy: self.y
			});
			self.drawEdges();
			statusBar.replaceLast("move treenode with id " + self.id);

			self.needsync = true;
		};

		mc.up = function () {
			c.attr({
				opacity: 1
			});
		};

		mc.start = function () {
			ox = self.x;
			oy = self.y;
			c.attr({
				opacity: 0.7
			});
		};

		mc.drag(mc.move, mc.start, mc.up);

    mc.mousedown(function (e) {
      e.stopPropagation();
    });


	}

};
