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
  };

  this.deselectActiveNode = function()
  {
    tracingLayer.svgOverlay.activateNode(null);
  };

  var setupSubTools = function()
  {
    var box;
    if ( self.prototype.stack === null ) {
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
    SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SKELETON);
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
    };

    // Insert a text div for the neuron name in the canvas window title bar
    var neuronnameDisplay = document.createElement( "p" );
    neuronnameDisplay.className = "neuronname";
    var spanName = document.createElement( "span" );
    spanName.id = "neuronName" + stack.getId();
    spanName.appendChild( document.createTextNode( "" ) );
    neuronnameDisplay.appendChild( spanName );
    stack.getWindow().getFrame().appendChild( neuronnameDisplay );
    SkeletonAnnotations.setNeuronNameInTopbar(stack.getId(), SkeletonAnnotations.getActiveSkeletonId());
  };

  /**
   * install this tool in a stack.
   * register all GUI control elements and event handlers
   */
  this.register = function( parentStack )
  {
    document.getElementById( "toolbox_data" ).style.display = "block";

    setupSubTools();

    // Update annotation cache for the current project
    annotations.update();

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
  };

  /**
   * unregister all project related GUI control connections and event
   * handlers, toggle off tool activity signals (like buttons)
   */
  this.destroy = function()
  {
    // Remove div with the neuron's name
    $("#neuronname" + stack.getId()).remove();

    // Synchronize data with database
    tracingLayer.svgOverlay.updateNodeCoordinatesinDB();

    // the prototype destroy calls the prototype's unregister, not self.unregister
    // do it before calling the prototype destroy that sets stack to null
    self.prototype.stack.removeLayer( "TracingLayer" );
    self.prototype.destroy( "edit_button_trace" );
    $( "#tracingbuttons" ).remove();
    // TODO: remove all skeletons from staging area
    tracingLayer.svgOverlay.destroy();
    //
    for (var b in bindings) {
      if (bindings.hasOwnProperty(b)) {
        delete bindings[b];
      }
    }
    return;
  };

  this.prototype.changeScale = function( val )
  {
    SkeletonAnnotations.Tag.changeScale();
    stack.moveToPixel( stack.z, stack.y, stack.x, val );
    return;
  };

  this.prototype.changeSlice = function( val )
  {
    WebGLApplication.prototype.staticUpdateZPlane();

    SkeletonAnnotations.Tag.changeSlice();
    stack.moveToPixel( val, stack.y, stack.x, stack.s );
  };


  var updateStatusBar = function( e ) {
    var m = ui.getMouse(e, tracingLayer.svgOverlay.view, true);
    var offX, offY, pos_x, pos_y;
    if (m) {
      offX = m.offsetX;
      offY = m.offsetY;

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
      '-': [ 45, 109, 173, 189 ]
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
      '.': [ 190 ]
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
      "\u2192": [ arrowKeyCodes.right ]
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
            ";": [ 186 ]
        },
        run: function (e) {
          SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SKELETON);
          return true;
        }
    } ) );

    this.addAction( new Action({
      helpText: "Switch to synapse dropping mode",
      buttonName: "synapse",
      buttonID: 'trace_button_synapse',
      run: function (e) {
        if (!mayEdit())
          return false;
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SYNAPSE);
        return true;
      }
    } ) );

    /** Return a function that attempts to tag the active treenode or connector,
     * and display an alert when no node is active.
     */
    var tagFn = function(tag) {
      return function(e) {
        if (!mayEdit()) return false;
        if (e.ctrlKey) return false;
        var modifier = e.metaKey || e.shiftKey;
        if (null === SkeletonAnnotations.getActiveNodeId()) {
          alert('Must activate a treenode or connector before '
              + (modifier ? 'removing the tag' : 'tagging with') + ' "' + tag + '"!');
          return true;
        }
        // If any modifier key is pressed, remove all tags
        SkeletonAnnotations.Tag.tagATNwithLabel( modifier ? '' : tag, tracingLayer.svgOverlay);
        return true;
      };
    };

  this.addAction( new Action({
    helpText: "Add ends Tag (Shift: Remove) for the active node",
    keyShortcuts: {
      "K": [ 75 ]
    },
      run: tagFn('ends')
  } ) );

  this.addAction( new Action({
    helpText: "Add 'uncertain end' Tag (Shift: Remove) for the active node",
    keyShortcuts: {
      "U": [ 85 ]
    },
      run: tagFn('uncertain end')
  } ) );

  this.addAction( new Action({
    helpText: "Add 'uncertain continuation' Tag (Shift: Remove) for the active node",
    keyShortcuts: {
      "C": [ 67 ]
    },
      run: tagFn('uncertain continuation')
  } ) );

  this.addAction( new Action({
    helpText: "Add 'not a branch' Tag (Shift: Remove) for the active node",
    keyShortcuts: {
      "N": [ 78 ]
    },
      run: tagFn('not a branch')
  } ) );

  this.addAction( new Action({
    helpText: "Add 'soma' Tag (Shift: Remove) for the active node",
    keyShortcuts: {
      "M": [ 77 ]
    },
      run: tagFn('soma')
  } ) );

  this.addAction( new Action({
    helpText: "Go to active node",
    buttonName: "goactive",
    buttonID: 'trace_button_goactive',
    keyShortcuts: {
      "A": [ 65 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.moveToAndSelectNode(SkeletonAnnotations.getActiveNodeId());
      return true;
    }
  } ) );

  this.addAction( new Action({
    helpText: "Next open leaf node",
    keyShortcuts: {
      "R": [ 82 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.goToNearestOpenEndNode(SkeletonAnnotations.getActiveNodeId());
      return true;
    }
  } ) );

  this.addAction( new Action({
    helpText: "Go to next branch or end point (with alt, stop earlier at node with tag, synapse or low confidence; with shift and at a branch node, move down the other branch)",
    keyShortcuts: {
      "V": [ 86 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.goToNextBranchOrEndNode(SkeletonAnnotations.getActiveNodeId(), e);
      return true;
    }
  } ) );

  this.addAction( new Action({
    helpText: "Go to previous branch or end node (with alt, stop earlier at node with tag, synapse or low confidence)",
    keyShortcuts: {
      "B": [ 66 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.goToPreviousBranchOrRootNode(SkeletonAnnotations.getActiveNodeId(), e);
      return true;
    }
  } ) );


  this.addAction( new Action({
    helpText: "Deselect the active node",
    keyShortcuts:  {
      "D": [ 68 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.activateNode(null);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Go to the parent of the active node",
    keyShortcuts: {
      "P": [ 80 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.goToParentNode(SkeletonAnnotations.getActiveNodeId());
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Edit the radius of the active node",
    keyShortcuts: {
      "O": [ 79 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.editRadius(SkeletonAnnotations.getActiveNodeId());
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Go to last edited node in this skeleton",
    keyShortcuts: {
      "H": [ 72 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.goToLastEditedNode(SkeletonAnnotations.getActiveSkeletonId());
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Append the active skeleton to the last used selection widget",
    keyShortcuts: {
      "Y": [ 89 ]
    },
    run: function (e) {
      SelectionTable.getLastFocused().append(SkeletonAnnotations.sourceView.getSelectedSkeletonModels());
    }
  }) );

  this.addAction( new Action({
    helpText: "Split this skeleton at the active node",
    buttonName: "skelsplitting",
    buttonID: 'trace_button_skelsplitting',
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.splitSkeleton(SkeletonAnnotations.getActiveNodeId());
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
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.rerootSkeleton(SkeletonAnnotations.getActiveNodeId());
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
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.toggleLabels();
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Export to SWC",
    buttonName: "exportswc",
    buttonID: 'trace_button_exportswc',
    run: function (e) {
      if (!mayView())
        return false;
      SkeletonAnnotations.exportSWC();
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Switch between a terminal and its connector",
    keyShortcuts: {
      "S": [ 83 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.switchBetweenTerminalAndConnector();
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Tag the active node",
    keyShortcuts: {
      "T": [ 84 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      if (!(e.ctrlKey || e.metaKey)) {
        SkeletonAnnotations.Tag.tagATN(tracingLayer.svgOverlay);
        return true;
      } else {
        return false;
      }
    }
  }) );

  this.addAction( new Action({
    helpText: "Add TODO Tag (Shift: Remove) to the active node",
    keyShortcuts: {
      "L": [ 76 ]
    },
    run: tagFn('TODO')
  }) );

  this.addAction( new Action({
    helpText: "Add 'microtubules end' tag (Shift: Remove) to the active node",
    keyShortcuts: {
      "F": [ 70 ]
    },
    run: tagFn('microtubules end')
  }) );

  this.addAction( new Action({
    helpText: "Select the nearest node to the mouse cursor",
    keyShortcuts: {
      "G": [ 71 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      if (!(e.ctrlKey || e.metaKey)) {
        tracingLayer.svgOverlay.activateNearestNode();
        return true;
      } else {
        return false;
      }
    }
  }) );

  this.addAction( new Action({
    helpText: "Create treenode with z axis interpolation (Shift on another node: interpolate and join)",
    keyShortcuts: {
      'Z': [ 90 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.createInterpolatedTreenode(e);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Delete the active node",
    keyShortcuts: {
      'DEL': [ 46 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      var node = tracingLayer.svgOverlay.nodes[SkeletonAnnotations.getActiveNodeId()];
      var nodeType = SkeletonAnnotations.getActiveNodeType();
      tracingLayer.svgOverlay.activateNode(null);

      switch (nodeType) {
        case SkeletonAnnotations.TYPE_CONNECTORNODE:
          tracingLayer.svgOverlay.deleteConnectorNode(node);
          break;
        case SkeletonAnnotations.TYPE_NODE:
          tracingLayer.svgOverlay.deleteTreenode(node, true);
          break;
      }
      
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Retrieve information about the active node.",
    keyShortcuts: {
      'I': [ 73 ]
    },
    run: function (e) {
      if (!mayView())
        return false;
      tracingLayer.svgOverlay.printTreenodeInfo(SkeletonAnnotations.getActiveNodeId());
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 1 (Alt: with a connector)",
    keyShortcuts: {
      '1': [ 49 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.setConfidence(1, e.altKey);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 2 (Alt: with a connector)",
    keyShortcuts: {
      '2': [ 50 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.setConfidence(2, e.altKey);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 3 (Alt: with a connector)",
    keyShortcuts: {
      '3': [ 51 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.setConfidence(3, e.altKey);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 4 (Alt: with a connector)",
    keyShortcuts: {
      '4': [ 52 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.setConfidence(4, e.altKey);
      return true;
    }
  }) );

  this.addAction( new Action({
    helpText: "Set confidence in node link to 5 (Alt: with a connector)",
    keyShortcuts: {
      '5': [ 53 ]
    },
    run: function (e) {
      if (!mayEdit())
        return false;
      tracingLayer.svgOverlay.setConfidence(5, e.altKey);
      return true;
    }
  }) );

  this.addAction( new Action({
      helpText: "Move to previous node in segment for review. At an end node, moves one section beyond for you to check that it really ends.",
      keyShortcuts: {
          'Q': [ 81 ]
      },
      run: function (e) {
          if (!mayEdit())
              return false;
          if (ReviewSystem.validSegment())
              ReviewSystem.moveNodeInSegmentBackward();
          return true;
      }
  }) );

  this.addAction( new Action({
      helpText: "Move to next node in segment for review (with shift, move to next unreviewed node in the segment)",
      keyShortcuts: {
          'W': [ 87 ]
      },
      run: function (e) {
          if (!mayEdit())
              return false;
          if (ReviewSystem.validSegment())
              ReviewSystem.moveNodeInSegmentForward(e.shiftKey);
          return true;
      }
  }) );

  this.addAction( new Action({
      helpText: "Start reviewing the next skeleton segment.",
      keyShortcuts: {
          'E': [ 69 ]
      },
      run: function (e) {
          if (!mayEdit())
              return false;
          if (ReviewSystem.validSegment())
              ReviewSystem.selectNextSegment();
          return true;
      }
  }) );

  this.addAction( new Action({
      helpText: "Rename active neuron",
      keyShortcuts: {
          'F2': [ 113 ]
      },
      run: function (e) {
          if (!mayEdit()) {
              return false;
          }
          tracingLayer.svgOverlay.renameNeuron(SkeletonAnnotations.getActiveSkeletonId());
          return true;
      }
  }) );

  this.addAction( new Action({
      helpText: "Annotate active neuron",
      keyShortcuts: {
          'F3': [ 114 ]
      },
      run: function (e) {
          if (!mayEdit()) {
              return false;
          }
          NeuronAnnotations.prototype.annotate_neurons_of_skeletons(
            [SkeletonAnnotations.getActiveSkeletonId()]);
          return true;
      }
  }) );

  this.addAction( new Action({
      helpText: "Neuron dendrogram",
      keyShortcuts: {
          'F4': [ 115 ]
      },
      run: function (e) {
        WindowMaker.create('neuron-dendrogram');
        return true;
      }
  }) );

  this.addAction( new Action({
    helpText: "Open the neuron/annotation search widget",
    keyShortcuts: {
      '/': [ 191 ]
    },
    run: function (e) {
      WindowMaker.create('neuron-annotations');
      return true;
    }
  }) );


  var keyCodeToAction = getKeyCodeToActionMap(actions);

  /** This function should return true if there was any action
      linked to the key code, or false otherwise. */

  this.handleKeyPress = function( e ) {
    var keyAction = keyCodeToAction[e.keyCode];
    if (keyAction) {
      tracingLayer.svgOverlay.ensureFocused();
      return keyAction.run(e);
    } else {
      return false;
    }
  };

  this.getMouseHelp = function( e ) {
    var result = '<p>';
    result += '<strong>click on a node:</strong> make that node active<br />';
    result += '<strong>ctrl-click in space:</strong> deselect the active node<br />';
    result += '<strong>ctrl-shift-click on a node:</strong> delete that node<br />';
    result += '<strong>ctrl-shift-click on an arrowhead:</strong> delete that link<br />';
    result += '<strong>shift-click in space:</strong> create a synapse with the active treenode being presynaptic.<br />';
    result += '<strong>shift-alt-click in space:</strong> create a synapse with the active treenode as postsynaptic.<br />';
    result += '<strong>shift-click in space:</strong> create a post-synaptic node (if there was an active connector)<br />';
    result += '<strong>shift-click on a treenode:</strong> join two skeletons (if there was an active treenode)<br />';
    result += '</p>';
    return result;
  };
  
  this.redraw = function()
  {
    self.prototype.redraw();
  };

}

/* Works as well for skeletons.
 * @param type A 'neuron' or a 'skeleton'.
 * @param objectID the ID of a neuron or a skeleton.
 */
TracingTool.goToNearestInNeuronOrSkeleton = function(type, objectID) {
  var projectCoordinates = project.focusedStack.projectCoordinates();
  var parameters = {
    x: projectCoordinates.x,
    y: projectCoordinates.y,
    z: projectCoordinates.z
  }, nodeIDToSelect, skeletonIDToSelect;
  parameters[type + '_id'] = objectID;
  //requestQueue.register("model/node.nearest.php", "GET",
  requestQueue.register(django_url + project.id + "/node/nearest", "POST",
                        parameters, function (status, text) {
    var data;
    if (status !== 200) {
      alert("Finding the nearest node failed with HTTP status code: "+status);
    } else {
      data = $.parseJSON(text);
      if (data.error) {
        alert("An error was returned when trying to fetch the nearest node: "+data.error);
      } else {
        nodeIDToSelect = data.treenode_id;
        skeletonIDToSelect = data.skeleton_id;
        //console.log('goToNearestInNeuronOrSkeleton', type, objectID )
        SkeletonAnnotations.staticMoveTo(data.z, data.y, data.x,
          function () {
            SkeletonAnnotations.staticSelectNode(nodeIDToSelect, skeletonIDToSelect);
          });
      }
    }
  });
};

TracingTool.search = function()
{
  if( $('#search-box').val() === '' ) {
    return;
  }

  var setSearchingMessage = function(message) {
    $('#search-results').empty();
    $('#search-results').append($('<i/>').text(message));
  };

  setSearchingMessage('Search in progress...');
  //requestQueue.register("model/search.php", "GET", {
  requestQueue.register(django_url + project.id + '/search', "GET", {
    pid: project.id,
    substring: $('#search-box').val()
  }, function (status, text) {
    var i, table, tbody, row, actionLink, data;
    if (status !== 200) {
      setSearchingMessage('Search failed with HTTP status'+status);
    } else {
      data = $.parseJSON(text);
      if (null === data) {
        setSearchingMessage('Search failed, parseJSON returned null. Check javascript console.');
        return;
      }
      if (data.error) {
        setSearchingMessage('Search failed with error: '+data.error);
      } else {
        $('#search-results').empty();
        $('#search-results').append($('<i/>').data('Found '+data.length+' results:'));
        table = $('<table/>');
        $('#search-results').append(table);
        tbody = $('<tbody/>');
        tbody.append('<tr><th></th><th>ID</th><th>Name</th><th>Class</th><th>Action</th><th></th></tr>');
        table.append(tbody);
        var action = function(type) {
          return function() {
              TracingTool.goToNearestInNeuronOrSkeleton(type, parseInt($(this).attr('id')));
              return false;
          };
        };
        var actionaddstage = function(type) {
          return function() {
            // Find an open Selection, or open one if none
            var selection = SelectionTable.prototype.getOrCreate();
            selection.addSkeletons([parseInt($(this).attr('id'))]);
            return false;
          };
        };
        var removelabel = function(id) {
          return function() {
            requestQueue.register(django_url + project.id + '/label/remove', "POST", {
            class_instance_id: id
            }, function (status, text) {});
            return false;
          };
        };
        for (i = 0; i < data.length; ++i) {
          row = $('<tr/>');
          row.append($('<td/>').text(i+1));
          row.append($('<td/>').text(data[i].id));
          row.append($('<td/>').text(data[i].name));
          row.append($('<td/>').text(data[i].class_name));
          if (data[i].class_name === 'neuron' || data[i].class_name === 'skeleton') {
            var tdd = $('<td/>');
            actionLink = $('<a/>');
            actionLink.attr({'id': ''+data[i].id});
            actionLink.attr({'href':''});
            actionLink.click(action(data[i].class_name));
            actionLink.text("Go to nearest node");
            tdd.append(actionLink);
            if( data[i].class_name === 'skeleton' ) {
              actionLink = $('<a/>');
              actionLink.attr({'id': ''+data[i].id});
              actionLink.attr({'href':''});
              actionLink.click(actionaddstage(data[i].class_name));
              actionLink.text(" Add to selection table");
              tdd.append(actionLink);
            }
            row.append(tdd);
          } else if (data[i].class_name === 'label') {
            // Create a link that will then query, when clicked, for the list of nodes
            // that point to the label, and show a list [1], [2], [3] ... clickable,
            // or better, insert a table below this row with x,y,z,parent skeleton, parent neuron.
            if (data[i].hasOwnProperty('nodes')) {
              var td = $('<td/>');
              row.append(td);
              data[i].nodes.reduce(function(index, node) {
                // Local copies
                var z = parseInt(node.z);
                var y = parseInt(node.y);
                var x = parseInt(node.x);
                var id = parseInt(node.id);
                var skid = parseInt(node.skid);
                td.append(
                  $('<a/>').attr({'id': '' + id})
                           .attr({'href':''})
                           .click(function(event) {
                             SkeletonAnnotations.staticMoveTo(z, y, x,
                               function() {
                                 SkeletonAnnotations.staticSelectNode(id, skid);
                               });
                             return false;
                           })
                           .text("[" + index + "]")
                  ).append("&nbsp;");
                if( index % 20 == 0)
                  td.append('<br />');
                return index + 1;
              }, 1);
            } else {
              // no nodes, option to remove the label
              actionLink = $('<a/>');
              actionLink.attr({'id': ''+data[i].id});
              actionLink.attr({'href':''});
              actionLink.click(removelabel(data[i].id));
              actionLink.text("Remove label");
              row.append($('<td/>').append(actionLink));
            }
          } else {
            row.append($('<td/>').text('IMPLEMENT ME'));
          }
          row.append($('<td/>').text(i+1));
          tbody.append(row);
        }
      }
    }
    return true;
  });


};

/**
 * Show dialog regarding the set-up of the tracing tool. If a user
 * has then needed permission, (s)he is offered to let CATMAID set
 * tracing up for the current project. Regardless of the result, the
 * navigator tool is loaded afterwards. It provides a safe fallback
 * on failure and forces a tool reload on success.
 */
function display_tracing_setup_dialog(pid, has_needed_permissions,
    missing_classes, missing_relations, missing_classinstances)
{
  var dialog = document.createElement('div');
  dialog.setAttribute("id", "dialog-confirm");
  dialog.setAttribute("title", "Tracing not set-up for project");
  var msg = document.createElement('p');
  dialog.appendChild(msg);
  var msg_text = "The tracing system isn't set up to work with this project" +
    ", yet. It needs certain classes and relations which haven't been found. ";
  if (missing_classes.length > 0) {
    msg_text = msg_text + "The missing classes are: " +
       missing_classes.join(", ") + ". ";
  }
  if (missing_relations.length > 0) {
    msg_text = msg_text + "The missing relations are: " +
       missing_relations.join(", ") + ". ";
  }
  if (missing_classinstances.length > 0) {
    msg_text = msg_text + "The missing class instances are: " +
       missing_classinstances.join(", ") + ". ";
  }

  var buttons;
  if (has_needed_permissions) {
    msg.innerHTML = msg_text + "Do you want CATMAID to create " +
      "the missing bits and initialize tracing support for this " +
      "project?";
    buttons = {
      "Yes": function() {
          $(this).dialog("close");
          // Call setup method for this project
          requestQueue.register(django_url + pid + '/tracing/setup/rebuild',
            'GET', {}, function(status, data, text) {
              if (status !== 200) {
                alert("Setting up tracing failed with HTTP status code: "+status);
              } else {
                var json = $.parseJSON(data);
                project.setTool( new Navigator() );
                if (json.error) {
                  alert("An error was returned when trying to set up tracing: " +
                    json.error);
                } else if (json.all_good) {
                  alert("Tracing has been set up successfully for the current " +
                    "project. Please reload the tracing tool.");
                } else {
                  alert("An unidentified error happened while trying to set " +
                    "up tracing.");
                }
              }
            });
      },
      "No": function() {
          project.setTool( new Navigator() );
          $(this).dialog("close");
        }
      };
  } else {
    msg.innerHTML = msg_text + "Unfortunately, you don't have " +
      "needed permissions to add the missing bits and intitialize " +
      "tracing for this project";
      buttons = {
        "Ok": function() {
            project.setTool( new Navigator() );
            $(this).dialog("close");
          }
        };
  }
  // The dialog is inserted into the document and shown by the following call:
  $(dialog).dialog({
    height: 200,
    modal: true,
    buttons: buttons,
  });
}
