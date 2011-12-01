/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* stack.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 slider.js
 *
 * @todo redo all public interfaces to use physical coordinates instead of pixel coordinates
 */

/**
 */

/**
 * transition object for general animations
 */

function Transition() {
  /**
   * returns if there is some transition running or not
   */
  this.busy = function () {
    return (this.timeout !== false);
  }

  /**
   * returns true, if the requested function is still queued
   */
  this.queued = function (f) {
    q = false;
    for (var i = 0; i < queue.length; ++i) {
      if (queue[i] == f) {
        statusBar.replaceLast("already queued in slot " + i + " of " + queue.length + ".");
        q = true;
        break;
      }
    }
    return q;
  }

  /**
   * forces the transition to finish by setting step = 1
   */
  this.finish = function () {
    step = 1.0;
    return;
  }

  /**
   * registers a function to the queue for waiting or starts it imediately
   * each function gets the current step as parameter and has to return the next step value
   */
  this.register = function (t) {
    queue.push(t);
    if (!timeout) t();
    timeout = window.setTimeout(run, 25);
    return;
  }

  /**
   * runs the first element of the queue
   */
  var run = function () {
    if (timeout) window.clearTimeout(timeout);
    if (queue.length > 0) step = queue[0](step);
    if (step > 1) {
      step = 0;
      if (queue.length > 0) queue.shift();
      //statusBar.replaceLast( "running step " + step + " queue.length " + queue.length );
    }
    if (queue.length > 0) timeout = window.setTimeout(run, 25);
    else
    timeout = false;
    return;
  }

  // initialize
  var self = this;
  var step = 0; //!< the transitions state [0.0, ..., 1.0]
  var queue = new Array(); //!< queue of waiting transitions
  var FINISH = false; //!< set this to force the transition to make an end
  var timeout = false; //!< window.timeout
}

/**
 * container for the small navigator map widget
 */

function SmallMap(
stack, //!< a reference to the stack
max_y, //!< maximal height
max_x //!< maximal width
) {
  /**
   * get the view object
   */
  this.getView = function () {
    return view;
  }

  var onclick = function (e) {
    var m = ui.getMouse(e);
    if (m) {
      //statusBar.replaceLast( m.offsetX + ", " + m.offsetY );
      stack.moveToPixel(z, Math.floor(m.offsetY / SCALE), Math.floor(m.offsetX / SCALE), s);
    }
    return false;
  }

  this.update = function (
  nz, y, x, ns, screenHeight, screenWidth) {
    z = nz;
    s = ns;
    var scale = 1 / Math.pow(2, s);
    img.src = stack.image_base + z + "/small.jpg";
    var height = SCALE / scale * screenHeight;
    var width = SCALE / scale * screenWidth;
    rect.style.height = Math.floor(height) + "px";
    rect.style.width = Math.floor(width) + "px";
    rect.style.top = Math.floor(SCALE * y - height / 2) + "px";
    rect.style.left = Math.floor(SCALE * x - width / 2) + "px";
    return;
  }

  this.focus = function () {
    view.style.zIndex = 8;
    return;
  }

  this.blur = function () {
    view.style.zIndex = 4;
    return;
  }

  // initialise
  if (!ui) ui = new UI();

  var HEIGHT = parseInt(getPropertyFromCssRules(3, 3, "height"));
  var WIDTH = parseInt(getPropertyFromCssRules(3, 3, "width"));
  var SCALE_Y = HEIGHT / max_y;
  var SCALE_X = WIDTH / max_x;
  var SCALE = Math.min(SCALE_X, SCALE_Y);
  HEIGHT = Math.floor(max_y * SCALE);
  WIDTH = Math.floor(max_x * SCALE);

  var s = 0;
  var z = 0;

  var view = document.createElement("div");
  view.className = "smallMapView";
  view.style.width = WIDTH + "px";
  view.style.height = HEIGHT + "px";

  var img = document.createElement("img");
  img.className = "smallMapMap";
  //img.src = "map/small.jpg";
  img.onclick = onclick;
  img.style.width = view.style.width;
  img.style.height = view.style.height;
  view.appendChild(img);

  var rect = document.createElement("div");
  rect.className = "smallMapRect";
  view.appendChild(rect);

  var toggle = document.createElement("div");
  toggle.className = "smallMapToggle";
  toggle.title = "hide general view";
  toggle.onclick = function (e) {
    if (view.className == "smallMapView_hidden") {
      toggle.title = "hide general view";
      view.className = "smallMapView";
      view.style.width = WIDTH + "px";
      view.style.height = HEIGHT + "px";
    } else {
      toggle.title = "show general view";
      view.className = "smallMapView_hidden";
      view.style.width = "";
      view.style.height = "";
    }
    return false;
  }

  view.appendChild(toggle);
}

/**
 * a stack of slices
 */

function Stack(
project, //!< reference to the parent project
id, //!< the stack's id
title, //!< the stack's title
dimension, //!< pixel dimensions {x, y, z}
resolution, //!< physical resolution in nm/pixel {x, y, z}
translation, //!< physical translation relative to the project in nm {x, y, z}
image_base, //!< URL to the image base path
broken_slices, //!< broken slices to be excluded from the stack's view
trakem2_project //!< boolean that states if a TrakEM2 project is available for this stack
) {

  /**
   * update treeline nodes by querying them from the server
   * with a bounding volume dependend on the current view
   */
  this.updateNodes = function () {

    var tl_width;
    var tl_height;
    if (tiles.length == 0) {
      tl_width = 0;
      tl_height = 0;
    } else {
      tl_width = tiles[0].length * X_TILE_SIZE / scale;
      tl_height = tiles.length * Y_TILE_SIZE / scale;
    }
/*
		console.log("In updateTreelinenodes");
		console.log("scale is: "+scale);
		console.log("X_TILE_SIZE is: "+X_TILE_SIZE);
		console.log("Y_TILE_SIZE is: "+Y_TILE_SIZE);
		console.log("tl_width is: "+tl_width);
		console.log("tl_height is: "+tl_height);
		console.log("x is: "+x);
		console.log("y is: "+y);
		console.log("resolution.x is: "+resolution.x);
		console.log("resolution.y is: "+resolution.y);
		console.log("translation.x is: "+translation.x);
		console.log("translation.y is: "+translation.y);
		console.log('-----computed');
		console.log('z', z * resolution.z + translation.z);
		console.log('top', ( y - tl_height / 2 ) * resolution.y + translation.y);
		console.log('left', ( x - tl_width / 2 ) * resolution.x + translation.x);
		console.log('width', tl_width * resolution.x);
		console.log('height', tl_height * resolution.y);
			*/

    // FIXME: check if we need to wait for the result of this, which
    // can now be done with completedCallback...
    // first synchronize with database
    svgOverlay.updateNodeCoordinatesinDB();

    requestQueue.register('model/node.list.php', 'POST', {
      pid: project.id,
      sid: id,
      z: z * resolution.z + translation.z,
      top: (y - tl_height / 2) * resolution.y + translation.y,
      left: (x - tl_width / 2) * resolution.x + translation.x,
      width: tl_width * resolution.x,
      height: tl_height * resolution.y,
      zres: resolution.z
    }, handle_updateNodes);
    return;
  }

  /**
   * handle an update-treelinenodes-request answer
   *
   */
  var handle_updateNodes = function (status, text, xml) {
    if (status = 200) {
      //console.log("update noded text", $.parseJSON(text));
      var e = eval("(" + text + ")");
      //var e = $.parseJSON(text);
      if (e.error) {
        alert(e.error);
      } else {
        var jso = $.parseJSON(text);
        // XXX: how much time does calling the function like this take?
        svgOverlay.refreshNodes(jso);
      }
    }
    return;
  }


  /**
   * change the scale, making sure that the point keep_[xyz] stays in
   * the same position in the view
   */
  this.scalePreservingLastPosition = function (keep_x, keep_y, sp) {
    var old_s = s;
    var old_scale = scale;
    var new_s = Math.max(0, Math.min(MAX_S, Math.round(sp)));
    var new_scale = 1 / Math.pow(2, new_s);

    if (old_s == new_s) return;

    var dx = keep_x - project.coordinates.x;
    var dy = keep_y - project.coordinates.y;

    var new_centre_x = keep_x - dx * (old_scale / new_scale);
    var new_centre_y = keep_y - dy * (old_scale / new_scale);

    this.moveTo(project.coordinates.z, new_centre_y, new_centre_x, sp);
  }

  /**
   * move to physical project-coordinates in nanometer
   */
  this.moveTo = function (zp, yp, xp, sp) {
    if (typeof sp == "number") {
      s = Math.max(0, Math.min(MAX_S, Math.round(sp)));
      scale = 1 / Math.pow(2, s);
    }

    LAST_XT = Math.floor(MAX_X * scale / X_TILE_SIZE);
    LAST_YT = Math.floor(MAX_Y * scale / Y_TILE_SIZE);

    x = Math.max(0, Math.min(MAX_X, Math.round((xp - translation.x) / resolution.x)));
    y = Math.max(0, Math.min(MAX_Y, Math.round((yp - translation.y) / resolution.y)));

    var z1;
    var z2;
    z1 = z2 = Math.round((zp - translation.z) / resolution.z);
    while (broken_slices[z1] && broken_slices[z2]) {
      z1 = Math.max(0, z1 - 1);
      z2 = Math.min(MAX_Z, z2 + 1);
    }
    if (!broken_slices[z1]) z = z1;
    else z = z2;
    z = Math.max(0, Math.min(MAX_Z, z));

    project.coordinates.x = xp;
    project.coordinates.y = yp;
    project.coordinates.z = zp;

    update();
    updateControls();

    return;
  }


  var onmousemove = {
    trace: function (e) {

      // take into account the shift of the svgOverlay
      var xp;
      var yp;
      // If we don't allow propagation (with the optional second parameter)
      // then dragging of nodes in Raphaël doesn't work, for reasons
      // that are obscure to me. [1]
      // [1] See http://stackoverflow.com/q/6617548/223092
      var m = ui.getMouse(e, true);

      if (m) {
        // add right move of svgOverlay to the m.offsetX
        offX = m.offsetX + svgOverlay.offleft;
        // add down move of svgOverlay to the m.offsetY
        offY = m.offsetY + svgOverlay.offtop;

        var pos_x = translation.x + (x + (offX - viewWidth / 2) / scale) * resolution.x;
        var pos_y = translation.x + (y + (offY - viewHeight / 2) / scale) * resolution.y;
        project.lastX = pos_x;
        project.lastY = pos_y;
        project.lastStackID = self.id;
        statusBar.replaceLast("[" + pos_x.toFixed(3) + ", " + pos_y.toFixed(3) + "]");
      }
      // continue with event handling
      return true;
    },
    pos: function (e) {
      var xp;
      var yp;
      var m = ui.getMouse(e);

      if (m) {
        var pos_x = translation.x + (x + (m.offsetX - viewWidth / 2) / scale) * resolution.x;
        var pos_y = translation.y + (y + (m.offsetY - viewHeight / 2) / scale) * resolution.y;
        var pos_z = translation.z + z * resolution.z;
        project.lastX = pos_x;
        project.lastY = pos_y;
        project.lastStackID = self.id;
        statusBar.replaceLast("[" + pos_x.toFixed(3) + ", " + pos_y.toFixed(3) + ", " + pos_z + "]");
      }
      return false;
    },
    move: function (e) {
      self.moveToPixel(z, y - ui.diffY / scale, x - ui.diffX / scale, s);
      return false;
    },
    crop: function (e) {
      if (cropBox) {
        cropBox.right += ui.diffX / scale * resolution.x;
        cropBox.bottom += ui.diffY / scale * resolution.y;
        updateCropBox();
      }
    }
  };

  var onmouseup = {
    move: function (e) {
      ui.releaseEvents()
      ui.removeEvent("onmousemove", onmousemove.move);
      ui.removeEvent("onmouseup", onmouseup.move);
      return false;
    },
    edit: function (e) {
      ui.releaseEvents()
      ui.removeEvent("onmousemove", profiles[spi].onmousemove);
      ui.removeEvent("onmouseup", onmouseup.edit);

      return false;
    },
    crop: function (e) {
      ui.releaseEvents();
      ui.removeEvent("onmousemove", onmousemove.crop);
      ui.removeEvent("onmouseup", onmouseup.crop);
    },
    trace: function (e) {
      // console.log("unregister trace");
      ui.releaseEvents();
      ui.removeEvent("onmousemove", svgOverlay.onmousemove);
      ui.removeEvent("onmouseup", onmouseup.move);
    }
  };

  var onmousedown = {
    trace: function (e) {

      var b = ui.getMouseButton(e);
      if (b === MOUSE_BUTTON_MIDDLE) {
        // afford dragging in tracing mode
        ui.registerEvent("onmousemove", onmousemove.move);
        ui.registerEvent("onmouseup", onmouseup.move);
        ui.catchEvents("move");
        ui.onmousedown(e);

        //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
        document.body.firstChild.focus();
      } else {
        svgOverlay.whenclicked(e);
      }

      return true;

    },
    move: function (e) {
      ui.registerEvent("onmousemove", onmousemove.move);
      ui.registerEvent("onmouseup", onmouseup.move);
      ui.catchEvents("move");
      ui.onmousedown(e);

      //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
      document.body.firstChild.focus();

      return false;
    },
    edit: function (e) {
      var m = ui.getMouse(e);
      if (m) {
        var pos_x = Math.round(x + (m.offsetX - viewWidth / 2) / scale);
        var pos_y = Math.round(y + (m.offsetY - viewHeight / 2) / scale);
        var spi = -1;
        for (var i = 0; i < profiles.length; ++i) {
          if (profiles[i].isInside(pos_x, pos_y)) {
            spi = i;
            break;
          }
        }
        if (spi >= 0) {
          profiles[spi].onmousedown(e);
          profiles[spi].clearCanvas();
          profiles[spi].drawOutline();
          profiles[spi].drawHandles();
          ui.registerEvent("onmousemove", profiles[spi].onmousemove);
          ui.registerEvent("onmouseup", onmouseup.edit);
          ui.catchEvents();
          ui.onmousedown(e);
        }
      }

      //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
      document.body.firstChild.focus();

      return false;
    },
    text: function (e) {
      var b = ui.getMouseButton(e);
      switch (b) {
      case MOUSE_BUTTON_MIDDLE:
        ui.registerEvent("onmousemove", onmousemove.move);
        ui.registerEvent("onmouseup", onmouseup.move);
        ui.catchEvents("move");
        ui.onmousedown(e);

        //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
        document.body.firstChild.focus();
        break;
      default:
        var m = ui.getMouse(e);
        var tlx = (x + (m.offsetX - viewWidth / 2) / scale) * resolution.x + translation.x;
        var tly = (y + (m.offsetY - viewHeight / 2) / scale) * resolution.y + translation.y;
        var tlz = z * resolution.z + translation.z;

        project.createTextlabel(tlx, tly, tlz, resolution.y, scale);
      }

      return false;
    },
    crop: function (e) {
      var b = ui.getMouseButton(e);
      switch (b) {
      case MOUSE_BUTTON_MIDDLE:
        ui.registerEvent("onmousemove", onmousemove.move);
        ui.registerEvent("onmouseup", onmouseup.move);
        ui.catchEvents("move");
        break;
      default:
        if (cropBox) {
          view.removeChild(cropBox.view);
          delete cropBox;
          cropBox = false;
        }
        var m = ui.getMouse(e);
        cropBox = {
          left: (x + (m.offsetX - viewWidth / 2) / scale) * resolution.x + translation.x,
          top: (y + (m.offsetY - viewHeight / 2) / scale) * resolution.y + translation.y
        };
        cropBox.right = cropBox.left;
        cropBox.bottom = cropBox.top;
        cropBox.view = document.createElement("div");
        cropBox.view.className = "cropBox";
        cropBox.text = document.createElement("p");
        cropBox.text.appendChild(document.createTextNode("0 x 0"));

        cropBox.view.appendChild(cropBox.text);
        view.appendChild(cropBox.view);

        ui.registerEvent("onmousemove", onmousemove.crop);
        ui.registerEvent("onmouseup", onmouseup.crop);
        ui.catchEvents("crosshair");
      }
      ui.onmousedown(e);

      //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
      document.body.firstChild.focus();

      return false;
    }
  };

  var onmousewheel = {
    zoom: function (e) {
      var w = ui.getMouseWheel(e);
      if (w) {
        if (w == MOUSE_WHEEL_UP) {
          slider_z.move(1);
          slider_trace_z.move(1);
        } else {
          slider_z.move(-1);
          slider_trace_z.move(-1);
        }
      }
      return false;
    },
    move: function (e) {
      var xp = x;
      var yp = y;
      var m = ui.getMouse(e);
      var w = ui.getMouseWheel(e);
      if (m) {
        xp = m.offsetX - viewWidth / 2;
        yp = m.offsetY - viewHeight / 2;
        //statusBar.replaceLast( ( m.offsetX - viewWidth / 2 ) + " " + ( m.offsetY - viewHeight / 2 ) );
      }
      if (w) {
        if (w == MOUSE_WHEEL_UP) {
          if (s < MAX_S) {
            self.moveToPixel(
            z, y - Math.floor(yp / scale), x - Math.floor(xp / scale), s + 1);
          }
        } else {
          if (s > 0) {
            var ns = scale * 2;
            self.moveToPixel(
            z, y + Math.floor(yp / ns), x + Math.floor(xp / ns), s - 1);
          }
        }
      }
      return false;
    }
  };


  /**
   * change the input mode of the slice
   *
   * @param string m { "select", "move", "edit" }
   */
  this.setMode = function (m) {
    if (cropBox) {
      view.removeChild(cropBox.view);
      delete cropBox;
      cropBox = false;
    }
    // svg overlay logic
    mouseCatcher.style.zIndex = 5;
    svgOverlay.hide();
    show_tracing = false;

    switch (m) {
    case "text":
      mode = "text";
      mouseCatcher.style.cursor = "crosshair";
      //mouseCatcher.style.display = "none";
      mouseCatcher.onmousedown = onmousedown.text;
      mouseCatcher.onmousemove = onmousemove.pos;
      show_textlabels = true;
      self.updateTextlabels();
      for (var i = 0; i < textlabels.length; ++i) {
        textlabels[i].setEditable(true);
      }
      //updateControls();
      //update();
      break;
    case "crop":
      mode = "crop";
      mouseCatcher.style.cursor = "crosshair";
      mouseCatcher.onmousedown = onmousedown.crop;
      mouseCatcher.onmousemove = onmousemove.pos;
      if (show_textlabels) self.updateTextlabels();
      break;
    case "trace":
      // console.log("in tracing mode");
      mode = "trace"
       mouseCatcher.style.cursor = "crosshair";

      // for the surrounding mouse event catcher
      mouseCatcher.onmousedown = onmousedown.move;
      mouseCatcher.onmousemove = onmousemove.trace;
      svgOverlay.view.onmousedown = onmousedown.trace;
      try {
        svgOverlay.view.addEventListener("DOMMouseScroll", onmousewheel.zoom, false); /* Webkit takes the event but does not understand it ... */
        svgOverlay.view.addEventListener("mousewheel", onmousewheel.zoom, false);
      } catch (error) {
        try {
          svgOverlay.view.onmousewheel = onmousewheel.zoom;
        } catch (error) {}
      }

      show_tracing = true;
      svgOverlay.show();
      self.updateNodes();
      for (var i = 0; i < textlabels.length; ++i) {
        textlabels[i].setEditable(false);
      }
      break;
    case "select":
    case "move":
    default:
      mode = "move";
      //mouseCatcher.style.display = "block";
      mouseCatcher.style.cursor = "move";
      mouseCatcher.onmousedown = onmousedown.move;
      mouseCatcher.onmousemove = onmousemove.pos;
      try {
        mouseCatcher.addEventListener("DOMMouseScroll", onmousewheel.zoom, false); /* Webkit takes the event but does not understand it ... */
        mouseCatcher.addEventListener("mousewheel", onmousewheel.zoom, false);
      } catch (error) {
        try {
          mouseCatcher.onmousewheel = onmousewheel.zoom;
        } catch (error) {}
      }
      if (show_textlabels) self.updateTextlabels();

      for (var i = 0; i < textlabels.length; ++i) {
        textlabels[i].setEditable(false);
      }
      //updateControls();
      //update();
      break;
/*
		case "profile":
			mode = "profile";
			mouseCatcher.style.display = "block";
			mouseCatcher.style.cursor = "crosshair";
			mouseCatcher.onmousedown = onmousedown.edit;
			mouseCatcher.onmousemove = onmousemove.pos;
			try
			{
				mouseCatcher.removeEventListener( "DOMMouseScroll", onmousewheel.move, false );
			}
			catch ( error )
			{
				try
				{
					mouseCatcher.onmousewheel = null;
				}
				catch ( error ) {}
			}
			//! @todo import the available profiles of the slice
			break;
		*/
    }
    return;
  }


  this.showTextlabels = function (b) {
    show_textlabels = b;
    if (show_textlabels) self.updateTextlabels();
    else {
      //! remove all old text labels
      while (textlabels.length > 0) {
        var t = textlabels.pop();
        try //!< we do not know if it really is in the DOM currently
        {
          view.removeChild(t.getView());
        } catch (error) {}
      }
    }
    return;
  }

  this.createLink = function (fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype) {
    svgOverlay.createLink(fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype);
  }

  this.createTreenodeLink = function (fromid, toid) {
    svgOverlay.createTreenodeLink(fromid, toid);
  }

  this.showTags = function (val) {
    svgOverlay.showTags(val);
  }

  this.selectNode = function (id) {
    svgOverlay.selectNode(id);
  }

  this.recolorAllNodes = function () {
    svgOverlay.recolorAllNodes();
  }

  this.tracingCommand = function (m) {
    switch (m) {
    case "skeletontracing":
      svgOverlay.set_tracing_mode(m);
      break;
    case "synapsedropping":
      svgOverlay.set_tracing_mode(m);
      break;
    case "goparent":
      if (atn != null) {
        if (atn.parent != null) {
          project.moveTo(
          svgOverlay.pix2physZ(atn.parent.z), svgOverlay.pix2physY(atn.parent.y), svgOverlay.pix2physX(atn.parent.x));
          window.setTimeout("project.selectNode( " + atn.parent.id + " )", 1000);
        } else {
          alert("This is the root node.");
        }
      } else {
        alert("No active node selected.");
      }
      break;
    case "goactive":
      if (atn != null) {
        project.moveTo(
        svgOverlay.pix2physZ(atn.z), svgOverlay.pix2physY(atn.y), svgOverlay.pix2physX(atn.x));
      } else {
        alert("No active node to go to!");
      }
      break;
    case "golastedited":
      if (atn == null) {
        alert("There was no active node.  One is required to find the\n" + "last edited node in the same skeleton.");
        break;
      }
      svgOverlay.updateNodeCoordinatesinDB(function () {

        requestQueue.register("model/last.edited.or.added.php", "POST", {
          pid: project.id,
          tnid: atn.id
        }, function (status, text, xml) {
          if (status == 200) {
            if (text && text != " ") {
              var e = eval("(" + text + ")");
              if (e.error) {
                alert(e.error);
              } else {
                project.moveTo(e.z, e.y, e.x);
              }
            }
          }
        });

      });
      break;
    case "skeletonsplitting":
      if (atn != null) {
        svgOverlay.splitSkeleton();
      } else {
        alert('Need to activate a treenode before splitting!');
      }
      break;
    case "skeletonreroot":
      if (atn != null) {
        svgOverlay.rerootSkeleton();
      } else {
        alert('Need to activate a treenode before rerooting!');
      }
      break;
    case "tagging":
      if (atn != null) {
        svgOverlay.tagATN();
      } else {
        alert('Need to activate a treenode or connector before tagging!');
      }
      break;
    case "selectnearestnode":
      svgOverlay.activateNearestNode(project.lastX, project.lastY, project.coordinates.z);
      break;
    case "togglelabels":
      svgOverlay.toggleLabels();
      break;
    case "exportswc":
      if (atn != null) {
        svgOverlay.exportSWC();
      } else {
        alert('Need to activate a treenode before exporting to SWC!');
      }
      break;
    case "showskeleton":
      if (atn != null) {
        svgOverlay.showSkeleton();
      } else {
        alert('Need to activate a treenode or connector before showing them!');
      }
      break;
    }
    return;

  }






  // svg overlay for the tracing
  var svgOverlay = new SVGOverlay(resolution, translation, dimension, scale);
  mouseCatcher.appendChild(svgOverlay.view);
  svgOverlay.hide();

}
