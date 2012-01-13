/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
  this.toolname = "tracingtool";

	this.resize = function( width, height )
	{
        self.prototype.resize( width, height );
		return;
	};

  this.updateLayer = function()
  {
    tracingLayer.svgOverlay.updateNodes();
  }

  this.deselectActiveNode = function()
  {
    tracingLayer.svgOverlay.activateNode(null);
  }

  var setupSubTools = function()
  {
    var box;
    if ( self.prototype.stack == null ) {
      box = createButtonsFromActions(
        actions,
        "tracingbuttons",
        "trace_");
      $( "#toolbar_nav" ).prepend( box );
    }
  };

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
  };

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
  };

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
  };

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
    var m = ui.getMouse(e, tracingLayer.svgOverlay.view, true);
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
  };

  this.getActions = function () {
    return actions;
  };

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
      self.prototype.slider_s.move(1);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Zoom out",
    keyShortcuts: {
      '-': [ 45, 109, 189 ]
    },
    run: function (e) {
      self.prototype.slider_s.move(-1);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move up 1 slice in z (or 10 with Shift held)",
    keyShortcuts: {
      ',': [ 44, 188 ]
    },
    run: function (e) {
      self.prototype.slider_z.move(-(e.shiftKey ? 10 : 1));
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move down 1 slice in z (or 10 with Shift held)",
    keyShortcuts: {
      '.': [ 46, 190 ]
    },
    run: function (e) {
      self.prototype.slider_z.move((e.shiftKey ? 10 : 1));
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move left (towards negative x)",
    keyShortcuts: {
      "\u2190": [ arrowKeyCodes.left ]
    },
    run: function (e) {
      self.prototype.input_x.value = parseInt(self.prototype.input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      self.prototype.input_x.onchange(e);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move right (towards positive x)",
    keyShortcuts: {
      "\u2192": [ arrowKeyCodes.right ],
    },
    run: function (e) {
      self.prototype.input_x.value = parseInt(self.prototype.input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      self.prototype.input_x.onchange(e);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move up (towards negative y)",
    keyShortcuts: {
      "\u2191": [ arrowKeyCodes.up ]
    },
    run: function (e) {
      self.prototype.input_y.value = parseInt(self.prototype.input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      self.prototype.input_y.onchange(e);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move down (towards positive y)",
    keyShortcuts: {
      "\u2193": [ arrowKeyCodes.down ]
    },
    run: function (e) {
      self.prototype.input_y.value = parseInt(self.prototype.input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      self.prototype.input_y.onchange(e);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Switch to skeleton tracing mode",
    buttonName: "skeleton",
    buttonID: 'trace_button_skeleton',
    keyShortcuts: {
      "K": [ 75 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('skeleton');
      return true;
    }
  } ) );

  this.addAction( new Action({
    helpText: "Switch to synapse dropping mode",
    buttonName: "synapse",
    buttonID: 'trace_button_synapse',
    keyShortcuts: {
      "Y": [ 89 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('synapse');
      return true;
    }
  } ) );

  this.addAction( new Action({
    helpText: "Go to active node",
    buttonName: "goactive",
    buttonID: 'trace_button_goactive',
    keyShortcuts: {
      "A": [ 65 ]
    },
    run: function (e) {
      var activeNodePosition = SkeletonAnnotations.getActiveNodePosition();
      if (activeNodePosition === null) {
        alert("No active node to go to!");
      } else {
        project.moveTo(
          tracingLayer.svgOverlay.pix2physZ(activeNodePosition.z),
          tracingLayer.svgOverlay.pix2physY(activeNodePosition.y),
          tracingLayer.svgOverlay.pix2physX(activeNodePosition.x));
      }
      return true;
    }
  } ) );

  this.addAction( new Action({
    helpText: "Deselect the active node",
    keyShortcuts:  {
      "D": [ 68 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.activateNode(null);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Go to the parent of the active node (?)",
    keyShortcuts: {
      "P": [ 80 ]
    },
    run: function (e) {
      var atn = tracingLayer.svgOverlay.getActiveNode();
      if (atn !== null) {
        if (atn.parent !== null) {
          project.moveTo(
            tracingLayer.svgOverlay.pix2physZ(atn.parent.z),
            tracingLayer.svgOverlay.pix2physY(atn.parent.y),
            tracingLayer.svgOverlay.pix2physX(atn.parent.x));
          tracingLayer.svgOverlay.selectNode(atn.parent.id);
        } else {
          alert("This is the root node.");
        }
      } else {
        if (SkeletonAnnotations.getActiveNodeId() === null) {
          alert('There must be a currently active node in order to move to its parent.');
        } else {
          alert("There active node must be visible in order to move to its parent");
        }
      }
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Go to last edited node in this skeleton",
    keyShortcuts: {
      "E": [ 69 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('golastedited');
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Split this skeleton at the active node",
    buttonName: "skelsplitting",
    buttonID: 'trace_button_skelsplitting',
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('skelsplitting');
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Re-root this skeleton at the active node",
    buttonName: "skelrerooting",
    buttonID: 'trace_button_skelrerooting',
    keyShortcuts: {
      "6": [ 54 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('skelrerooting');
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Toggle the display of labels",
    buttonName: "togglelabels",
    buttonID: 'trace_button_togglelabels',
    keyShortcuts: {
      "7": [ 55 ]
    },
    run: function (e) {
      if(tracingLayer.svgOverlay.getLabelStatus()) {
        tracingLayer.svgOverlay.tracingCommand('hidelabels');
      } else {
        tracingLayer.svgOverlay.tracingCommand('showlabels');
      }
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Export to SWC",
    buttonName: "exportswc",
    buttonID: 'trace_button_exportswc',
    keyShortcuts: {
      "S": [ 83 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('exportswc');
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Tag the active node",
    keyShortcuts: {
      "T": [ 84 ]
    },
    run: function (e) {
      if (!(e.ctrlKey || e.metaKey)) {
	tracingLayer.svgOverlay.tracingCommand('tagging');
        return true;
      } else {
        return false;
      }
    }
  }) );

  this.addAction( new Action({
    helpText: "Add TODO Tag (Shift: Remove) for the active node",
    keyShortcuts: {
      "L": [ 76 ]
    },
    run: function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        tracingLayer.svgOverlay.tracingCommand('tagTODOremove');
      } else {
        tracingLayer.svgOverlay.tracingCommand('tagTODO');
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
        tracingLayer.svgOverlay.tracingCommand('selectnearestnode');
        return true;
      } else {
        return false;
      }
    }
  }) );

  this.addAction( new Action({
    helpText: "Move up 1 slice in z and click",
    keyShortcuts: {
      'N': [ 78 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('createtreenode');
      self.prototype.slider_z.move(-(e.shiftKey ? 10 : 1));
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Move down 1 slice in z and click",
    keyShortcuts: {
      'M': [ 77 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.tracingCommand('createtreenode');
      self.prototype.slider_z.move((e.shiftKey ? 10 : 1));
      return true;
    }
  }) );


  this.addAction( new Action({
    helpText: "Set confidence in node link to 1",
    keyShortcuts: {
      '1': [ 49 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.setConfidence(1);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 2",
    keyShortcuts: {
      '2': [ 50 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.setConfidence(2);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 3",
    keyShortcuts: {
      '3': [ 51 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.setConfidence(3);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 4",
    keyShortcuts: {
      '4': [ 52 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.setConfidence(4);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 5",
    keyShortcuts: {
      '5': [ 53 ]
    },
    run: function (e) {
      tracingLayer.svgOverlay.setConfidence(5);
      return true;
    }
  }) );


  var keyCodeToAction = getKeyCodeToActionMap(actions);

  /** This function should return true if there was any action
      linked to the key code, or false otherwise. */

  this.handleKeyPress = function( e ) {
    var keyAction = keyCodeToAction[e.keyCode];
    if (keyAction) {
      return keyAction.run(e);
    } else {
      return false;
    }
  };

  this.getMouseHelp = function( e ) {
    var result = '<p>';
    result += '<strong>click on a node:</strong> make that node active<br />'
    result += '<strong>ctrl-click in space:</strong> deselect the active node<br />';
    result += '<strong>ctrl-shift-click on a node:</strong> delete that node<br />';
    result += '<strong>shift-click in space:</strong> create a synapse (if there was an active treenode)<br />';
    result += '<strong>shift-click in space:</strong> create a post-synaptic node (if there was an active synapse)<br />';
    result += '<strong>shift-click on a treenode:</strong> join two skeletons (if there was an active treenode)<br />';
    result += '</p>';
    return result;
  };
  
  this.redraw = function()
  {
    self.prototype.redraw();
  };

}

TracingTool.goToNearestInNeuron = function(type, objectID) {
  parameters = {
    pid: project.id,
    x: project.x,
    y: project.y,
    z: project.z,
  };
  parameters[type + '_id'] = objectID;
  requestQueue.register("model/node.nearest.php", "GET",
                        parameters, function (status, text) {
    var data;
    if (status !== 200) {
      alert("Finding the nearest node failed with HTTP status code: "+status);
    } else {
      data = $.parseJSON(text);
      if (data.error) {
        alert("An error was returned when trying to fetch the nearest node: "+data.error);
      } else {
        project.moveTo(data.z, data.y, data.x);
        window.setTimeout("SkeletonAnnotations.staticSelectNode( " + data.treenode_id + ", " + data.skeleton_id + " )", 1000);
      }
    }
  });
};

TracingTool.search = function()
{
  var setSearchingMessage = function(message) {
    $('#search-results').empty();
    $('#search-results').append($('<i/>').text(message));
  };

  setSearchingMessage('Search in progress...');
  requestQueue.register("model/search.php", "GET", {
    pid: project.id,
    substring: $('#search-box').val()
  }, function (status, text) {
    var i, table, tbody, row, id, name, class_name, actionLink, data, neuronID;
    if (status !== 200) {
      setSearchingMessage('Search failed with HTTP status'+status);
    } else {
      data = $.parseJSON(text);
      if (data.error) {
        setSearchingMessage('Search failed with error: '+data.error);
      } else {
        $('#search-results').empty();
        $('#search-results').append($('<i/>').data('Found '+data.length+' results:'));
        table = $('<table/>');
        $('#search-results').append(table);
        tbody = $('<tbody/>');
        tbody.append('<tr><th>ID</th><th>Name</th><th>Class</th><th>Action</th></tr>');
        table.append(tbody);
        for (i = 0; i < data.length; ++i) {
          row = $('<tr/>');
          row.append($('<td/>').text(data[i].id));
          row.append($('<td/>').text(data[i].name));
          row.append($('<td/>').text(data[i].class_name));
          if (data[i].class_name === 'neuron') {
            actionLink = $('<a/>');
            actionLink.attr({'id': ''+data[i].id});
            actionLink.attr({'href':''});
            actionLink.click(function() {
              TracingTool.goToNearestInNeuron('neuron', parseInt($(this).attr('id')));
              return false;
            });
            actionLink.text("Go to nearest node");
            row.append($('<td/>').append(actionLink));
          } else {
            row.append($('<td/>').text('IMPLEMENT ME'));
          }
          tbody.append(row);
        }
      }
    }
    return true;
  });


}
