/**
 * tracingtool.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 slider.js
 *   stack.js
 */

/**
 */

/**
 * Constructor for the tracing tool.
 */
function TracingTool()
{
  this.prototype = new Navigator();
  
  var self = this;
  var tracingLayer = null;
  var stack = null;
  var bindings = {};

	this.resize = function( width, height )
	{
        self.prototype.resize( width, height );
		return;
	}

  var setupSubTools = function()
  {
    // TODO: replace with project.js strings
    if ( self.prototype.stack == null ) {
      var box = $( '<div class="box" id="tracingbuttons"></div>' );
      [ { name : "skeleton", alt : "skeleton" },
        { name : "synapse", alt : "synapse" },
        { name : "goactive", alt : "go to active element" },
        { name : "skelsplitting", alt : "split skeleton" },
        { name : "skelrerooting", alt : "reroot skeleton" },
        { name : "togglelabels", alt : "toggle labels" },
        { name : "3dview", alt : "3d view" } ].map(
        function( button ) {
          var a = document.createElement('a');
          a.setAttribute('class', 'button');
          a.setAttribute('id', 'trace_button_' + button.name);
          a.onclick = function( e ) {
            tracingLayer.svgOverlay.tracingCommand(button.name);
            return false;
          };
          var img = document.createElement('img');
          img.setAttribute('title', button.alt);
          img.setAttribute('alt', button.alt);
          img.setAttribute('src', 'widgets/themes/kde/trace_' + button.name + '.png');
          a.appendChild(img);
          box.append(a);
        }
      );
      $( "#toolbar_nav" ).prepend( box );
    }
  }

  var createTracingLayer = function( parentStack )
  {
    stack = parentStack;
    tracingLayer = new TracingLayer( parentStack );
    //this.prototype.mouseCatcher = tracingLayer.svgOverlay.getView();
    self.prototype.setMouseCatcher( tracingLayer.svgOverlay.view );
    parentStack.addLayer( "TracingLayer", tracingLayer );

    // Call register AFTER changing the mouseCatcher
    self.prototype.register( parentStack, "edit_button_trace" );

    // NOW set the mode TODO cleanup this initialization problem
    tracingLayer.svgOverlay.set_tracing_mode( "skeletontracing" );
    tracingLayer.svgOverlay.updateNodes();

    // view is the mouseCatcher now
    var view = tracingLayer.svgOverlay.view;

    var proto_onmousedown = view.onmousedown;
    view.onmousedown = function( e ) {
      switch ( ui.getMouseButton( e ) )
      {
        case 1:
          tracingLayer.svgOverlay.whenclicked( e );
          break;
        case 2:
          proto_onmousedown( e );
          ui.registerEvent( "onmousemove", updateStatusBar );
          ui.registerEvent( "onmouseup",
            function onmouseup (e) {
              ui.releaseEvents();
              ui.removeEvent( "onmousemove", updateStatusBar );
              ui.removeEvent( "onmouseup", onmouseup );
              // Recreate nodes by feching them from the database for the new field of view
              tracingLayer.svgOverlay.updateNodes();
            });
          break;
        default:
          proto_onmousedown( e );
          break;
      }
      return;
    };

    var proto_changeSlice = self.prototype.changeSlice;
    self.prototype.changeSlice =
      function( val ) {
        proto_changeSlice( val );
        tracingLayer.svgOverlay.updateNodes();
      };
  }

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
    setupSubTools();

    if (tracingLayer && stack) {
      if (stack !== parentStack) {
        // If the tracing layer exists and it belongs to a different stack, replace it
        stack.removeLayer( tracingLayer );
        createTracingLayer( parentStack );
      } else {
        reactivateBindings();
      }
    } else {
      createTracingLayer( parentStack );
    }

    return;
  }

  /** Inactivate only onmousedown, given that the others are injected when onmousedown is called.
   * Leave alone onmousewheel: it is different in every browser, and it cannot do any harm to have it active. */
  var inactivateBindings = function() {
    var c = self.prototype.mouseCatcher;
    ['onmousedown'].map(
      function ( fn ) {
        if (c[fn]) {
          bindings[fn] = c[fn];
          delete c[fn];
        }
      });
  }

  var reactivateBindings = function() {
    var c = self.prototype.mouseCatcher;
    for (var b in bindings) {
      if (bindings.hasOwnProperty(b)) {
        c[b.name] = b;
      }
    }
  };

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
	this.unregister = function()
	{
    // do it before calling the prototype destroy that sets stack to null
    if (self.prototype.stack) {
      inactivateBindings();
    }
    // Do NOT unregister: would remove the mouseCatcher layer
    // and the annotations would disappear
    //self.prototype.unregister();
    return;
	}

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
    // Synchronize data with database
    tracingLayer.svgOverlay.updateNodeCoordinatesinDB();

    // the prototype destroy calls the prototype's unregister, not self.unregister
    // do it before calling the prototype destroy that sets stack to null
    self.prototype.stack.removeLayer( "TracingLayer" );
    self.prototype.destroy( "edit_button_trace" );
    $( "#tracingbuttons" ).remove();
    tracingLayer.svgOverlay.destroy();
    //
    for (var b in bindings) {
      if (bindings.hasOwnProperty(b)) {
        delete bindings[b];
      }
    }
    return;
	};


  var updateStatusBar = function( e ) {
    var m = ui.getMouse(e, true);
    var offX, offY, pos_x, pos_y;
    if (m) {
      // add right move of svgOverlay to the m.offsetX
      offX = m.offsetX + tracingLayer.svgOverlay.offleft;
      // add down move of svgOverlay to the m.offsetY
      offY = m.offsetY + tracingLayer.svgOverlay.offtop;

      // TODO pos_x and pos_y never change
      pos_x = stack.translation.x + (stack.x + (offX - stack.viewWidth / 2) / stack.scale) * stack.resolution.x;
      pos_y = stack.translation.x + (stack.y + (offY - stack.viewHeight / 2) / stack.scale) * stack.resolution.y;
      statusBar.replaceLast("[" + pos_x.toFixed(3) + ", " + pos_y.toFixed(3) + "]" + " stack.x,y: " + stack.x + ", " + stack.y);
    }
    return true;
  };

    var actions = [];

    this.addAction = function ( action ) {
	actions.push( action );
    }

    this.getActions = function () {
	return actions;
    }

    var arrowKeyCodes = {
	left: 37,
	up: 38,
	right: 39,
	down: 40
    };

    this.addAction( new Action({
	helpText: "Zoom in",
	keyShortcuts: {
	    '+': [ 43, 107, 61, 187 ]
	},
	run: function (e) {
	    slider_s.move(1);
	    slider_trace_s.move(1);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Zoom out",
	keyShortcuts: {
	    '-': [ 45, 109, 189 ]
	},
	run: function (e) {
	    slider_s.move(-1);
	    slider_trace_s.move(-1);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Move up 1 slice in z (or 10 with Shift held)",
	keyShortcuts: {
	    ',': [ 44, 188 ]
	},
	run: function (e) {
	    slider_z.move(-(e.shiftKey ? 10 : 1));
	    slider_trace_z.move(-(e.shiftKey ? 10 : 1));
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Move down 1 slice in z (or 10 with Shift held)",
	keyShortcuts: {
	    '.': [ 46, 190 ]
	},
	run: function (e) {
	    slider_z.move((e.shiftKey ? 10 : 1));
	    slider_trace_z.move((e.shiftKey ? 10 : 1));
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Move left (towards negative x)",
	keyShortcuts: {
	    "\u2190": [ arrowKeyCodes.left ]
	},
	run: function (e) {
	    input_x.value = parseInt(input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
	    input_x.onchange(e);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Move right (towards positive x)",
	keyShortcuts: {
	    "\u2192": [ arrowKeyCodes.right ],
	},
	run: function (e) {
	    input_x.value = parseInt(input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
	    input_x.onchange(e);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Move up (towards negative y)",
	keyShortcuts: {
	    "\u2191": [ arrowKeyCodes.up ]
	},
	run: function (e) {
	    input_y.value = parseInt(input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
	    input_y.onchange(e);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Move down (towards positive y)",
	keyShortcuts: {
	    "\u2193": [ arrowKeyCodes.down ]
	},
	run: function (e) {
	    input_y.value = parseInt(input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
	    input_y.onchange(e);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Go to active node",
	buttonID: [ 'trace_button_goactive' ],
	keyShortcuts: {
	    "A": [ 65 ]
	},
	run: function (e) {
	    project.tracingCommand('goactive');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Deselect the active node",
	keyShortcuts:  {
	    "M": [ 77 ]
	},
	run: function (e) {
	    activateNode(null);
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Go to the parent of the active node (?)",
	keyShortcuts: {
	    "P": [ 80 ]
	},
	run: function (e) {
	    project.tracingCommand('goparent');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Go to last edited node in this skeleton",
	keyShortcuts: {
	    "E": [ 69 ]
	},
	run: function (e) {
	    project.tracingCommand('golastedited');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Split this skeleton at the active node",
	buttonID: [ 'trace_button_skelsplitting' ],
	keyShortcuts: {
	    "5": [ 53 ]
	},
	run: function (e) {
	    project.tracingCommand('skeletonsplitting');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Re-root this skeleton at the active node",
	buttonID: [ 'trace_button_skelrerooting' ],
	keyShortcuts: {
	    "6": [ 54 ]
	},
	run: function (e) {
	    project.tracingCommand('skeletonreroot');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Toggle the display of labels",
	buttonID: [ 'trace_button_togglelabels' ],
	keyShortcuts: {
	    "7": [ 55 ]
	},
	run: function (e) {
	    project.tracingCommand('togglelabels');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Export to SWC",
	buttonID: [ 'trace_button_exportswc' ],
	keyShortcuts: {
	    "S": [ 83 ]
	},
	run: function (e) {
	    project.tracingCommand('exportswc');
	    return false;
	}
    }) );

    this.addAction( new Action({
	helpText: "Tag the active node",
	keyShortcuts: {
	    "T": [ 84 ]
	},
	run: function (e) {
	    if (!(e.ctrlKey || e.metaKey)) {
		project.tracingCommand('tagging');
	    }
	    return true;
	}
    }) );

    this.addAction( new Action({
	helpText: "Select the nearest node to the mouse cursor",
	keyShortcuts: {
	    "G": [ 71 ]
	},
	run: function (e) {
	    if (!(e.ctrlKey || e.metaKey)) {
		project.activateNearestNode();
	    }
	    return true;
	}
    }) );

    setButtonClicksFromActions(actions);

    /** This function should return true if there was any action
        linked to the key code, or false otherwise. */

    var handleKeyPress = function( e ) {
        keyAction = self.keyCodeToAction[key];
        if (keyAction) {
	    keyAction.run(e || event);
	    return true;
	} else {
            return false;
	}
    }

}
