/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * tracingtool.js
 *
 * requirements:
 *   tools.js
 *   slider.js
 *   stackViewer.js
 */

(function(CATMAID) {

  /**
   * Constructor for the tracing tool.
   */
  function TracingTool()
  {
    this.prototype = new Navigator();
    this.toolname = "tracingtool";

    var self = this;
    // Currently focused tracing layer
    var activeTracingLayer = null;
    // Currently focused stack viewer
    var activeStackViewer = null;
    // Map stacks to its mouse handlers
    var bindings = new Map();
    // Whether node labels should be shown
    var show_labels = false;


    this.resize = function( width, height )
    {
      self.prototype.resize( width, height );
      return;
    };

    this.deselectActiveNode = function()
    {
      activeTracingLayer.svgOverlay.activateNode(null);
    };

    var setupSubTools = function()
    {
      var box;
      if ( self.prototype.stackViewer === null ) {
        box = createButtonsFromActions(
          actions,
          "tracingbuttons",
          "trace_");
        $( "#toolbar_nav" ).prepend( box );

      }
    };

    /**
     * Return a list of all tracing layers, optionally excluding the active one.
     */
    var getTracingLayers = function(excludeActive)
    {
      var viewers = project.getStackViewers();
      if (excludeActive) {
        viewers = viewers.filter(function(sv) {
          // Exclude active stack viewer
          return activeStackViewer !== sv;
        });
      }

      return viewers.map(function(sv) {
        // Get tracing layer for this stack view, or undefined
        return sv.getLayer(getTracingLayerName(sv));
      }).filter(function(layer) {
        // Ignore falsy layers (which come from stacks
        // that don't have tracing layers.
        return layer ? true : false;
      });
    };

    var setTracingLayersSuspended = function(value, excludeActive)
    {
      value = Boolean(value);
      getTracingLayers(excludeActive).forEach(function(layer) {
        layer.svgOverlay.suspended = value;
      });
    };

    var updateNodesInTracingLayers = function(excludeActive)
    {
      getTracingLayers(excludeActive).forEach(function(layer) {
        layer.svgOverlay.updateNodes();
      });
    };

    /**
     * Return a unique name for the tracing layer of a given stack viewer.
     */
    var getTracingLayerName = function(stackViewer)
    {
      return "TracingLayer" + stackViewer.getId();
    };

    var disableLayerUpdate = function() {
      CATMAID.warn("Temporary disabling node update until panning is over");
      activeTracingLayer.svgOverlay.suspended = true;
    };

    /**
     * Create new mouse bindings for the layer's view.
     */
    function createMouseBindings(stackViewer, layer, mouseCatcher)
    {
      // A handle to a delayed update
      var updateTimeout;

      var proto_onmousedown = mouseCatcher.onmousedown;
      var stackViewerBindings = {
        onmousedown: function( e ) {
          switch ( CATMAID.ui.getMouseButton( e ) )
          {
            case 1:
              layer.svgOverlay.whenclicked( e );
              break;
            case 2:
              // Put all tracing layers, except active, in "don't update" mode
              setTracingLayersSuspended(true, true);

              // Attach to the node limit hit event to disable node updates
              // temporary if the limit was hit. This allows for smoother panning
              // when many nodes are visible.
              layer.svgOverlay.on(layer.svgOverlay.EVENT_HIT_NODE_DISPLAY_LIMIT,
                  disableLayerUpdate, layer);
              // Cancel any existing update timeout, if there is one
              if (updateTimeout) {
                clearTimeout(updateTimeout);
                updateTimeout = undefined;
              }

              // Handle mouse event
              proto_onmousedown( e );

              CATMAID.ui.registerEvent( "onmousemove", updateStatusBar );
              CATMAID.ui.registerEvent( "onmouseup",
                function onmouseup (e) {
                  CATMAID.ui.releaseEvents();
                  CATMAID.ui.removeEvent( "onmousemove", updateStatusBar );
                  CATMAID.ui.removeEvent( "onmouseup", onmouseup );
                  layer.svgOverlay.off(layer.svgOverlay.EVENT_HIT_NODE_DISPLAY_LIMIT,
                      disableLayerUpdate, layer);
                  if (layer.svgOverlay.suspended) {
                    // Wait a second before updating the view, just in case the user
                    // continues to pan to not hit the node limit again. Then make
                    // sure the next update is not stopped.
                    updateTimeout = setTimeout(function() {
                      // Wake tracing overlays up again
                      setTracingLayersSuspended(false, false);
                      // Recreate nodes by fetching them from the database for the new
                      // field of view, don't exclude active layer.
                      updateNodesInTracingLayers(false);
                    }, 1000);
                  } else {
                    // Wake tracing overlays up again
                    setTracingLayersSuspended(false, false);
                    // Recreate nodes by fetching them from the database for the new
                    // field of view. The active layer can be excluded, it should be
                    // updated through the move already.
                    updateNodesInTracingLayers(true);
                  }
                });
              break;
            default:
              proto_onmousedown( e );
              break;
          }
        }
      };

      // Assign bindings to view
      var view = layer.svgOverlay.view;
      for (var fn in stackViewerBindings) {
        view[fn] = stackViewerBindings[fn];
      }

      bindings.set(stackViewer, stackViewerBindings);
    }

    /**
     * Add the neuron name display and the tracing layer to the given stack
     * viewer, if they don't exist already.
     */
    function prepareStackViewer(stackViewer) {
      var layerName = getTracingLayerName(stackViewer);
      var layer = stackViewer.getLayer(layerName);

      if (!layer) {
        layer = new TracingLayer(stackViewer, {
          show_labels: show_labels
        });
        stackViewer.addLayer(layerName, layer);
      }

      // Insert a text div for the neuron name in the canvas window title bar
      var neuronNameDisplayID = "neuronName" + stackViewer.getId();
      var neuronNameDisplay = document.getElementById(neuronNameDisplayID);
      if (!neuronNameDisplay) {
        var stackFrame = stackViewer.getWindow().getFrame();
        neuronnameDisplay = document.createElement("p");
        neuronnameDisplay.id = neuronNameDisplayID;
        neuronnameDisplay.className = "neuronname";
        var spanName = document.createElement("span");
        spanName.appendChild(document.createTextNode(""));
        neuronnameDisplay.appendChild(spanName);
        stackFrame.appendChild(neuronnameDisplay);
        setNeuronNameInTopbars(SkeletonAnnotations.getActiveSkeletonId());
      }

      return layer;
    }

    /**
     * Remove the neuron name display and the tacing layer from a stack view.
     */
    function closeStackViewer(stackViewer) {
      // Unregister the neuron name label from the neuron name service and
      // remove it.
      var label = $('#neuronName' + stackViewer.getId());
      var labelData = label.data();
      if (labelData) NeuronNameService.getInstance().unregister(labelData);
      label.remove();

      // Remove the tracing layer
      var layerName = getTracingLayerName(stackViewer);
      var layer = stackViewer.getLayer(layerName);
      if (layer) {
        // Synchronize data with database
        layer.svgOverlay.updateNodeCoordinatesinDB();
        // Remove layer from stack viewer
        stackViewer.removeLayer(layerName);

        // the prototype destroy calls the prototype's unregister, not self.unregister
        // do it before calling the prototype destroy that sets stack viewer to null
        // TODO: remove all skeletons from staging area
        layer.svgOverlay.destroy();
      }
    }

    /**
     * install this tool in a stack viewer.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer )
    {
      document.getElementById( "toolbox_data" ).style.display = "block";

      setupSubTools();

      // Update annotation cache for the current project
      CATMAID.annotations.update();

      // Get or create the tracing layer for this stack viewer
      var layer = prepareStackViewer(parentStackViewer);

      // Set this layer as mouse catcher in Navigator
      var view = layer.svgOverlay.view;
      self.prototype.setMouseCatcher(view);

      // Register stack viewer with prototype, after the mouse catcher has been set.
      // This attaches mouse handlers to the view.
      self.prototype.register(parentStackViewer, "edit_button_trace");

      // Try to get existing mouse bindings for this layer
      if (!bindings.has(parentStackViewer)) createMouseBindings(parentStackViewer, layer, view);

      // Force an update and skeleton tracing mode if stack viewer or layer changed
      if (activeTracingLayer !== layer || activeStackViewer !== parentStackViewer) {
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SKELETON);
        layer.svgOverlay.updateNodes();
      }

      activeStackViewer = parentStackViewer;
      activeTracingLayer = layer;
      activateBindings(parentStackViewer);
    };

    /**
     * Remove bindings for the given stack viewer from the prototype mouse
     * catcher. The bindings are stored in the bindings variable that is
     * available in the closure.
     */
    var inactivateBindings = function(stackViewer) {
      var handlers = bindings.get(stackViewer);
      var c = self.prototype.mouseCatcher;
      for (var fn in handlers) {
        if (c[fn]) delete c[fn];
      }
    };

    /**
     * Replace bindings of the mouse catcher with the stored bindings for the
     * given stack viewer.
     */
    var activateBindings = function(stackViewer) {
      var stackViewerBindings = bindings.get(stackViewer);
      var c = self.prototype.mouseCatcher;
      for (var b in stackViewerBindings) {
        if (stackViewerBindings.hasOwnProperty(b)) {
          c[b] = stackViewerBindings[b];
        }
      }
    };

    /**
     * unregister all stack viewer related mouse and keyboard controls
     */
    this.unregister = function()
    {
      // do it before calling the prototype destroy that sets stack viewer to null
      if (self.prototype.stackViewer) {
        inactivateBindings(self.prototype.stackViewer);
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
      project.off(Project.EVENT_STACKVIEW_ADDED, prepareStackViewer, this);
      project.off(Project.EVENT_STACKVIEW_CLOSED, closeStackViewer, this);
      SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
          handleActiveNodeChange, this);

      project.getStackViewers().forEach(function(stackViewer) {
        closeStackViewer(stackViewer);
      });

      self.prototype.destroy( "edit_button_trace" );
      $( "#tracingbuttons" ).remove();

      // Remove all stored bindings
      bindings.forEach(function(value, key, map) {
        map.delete(key);
      });

      // Forget the current stack viewer
      self.activeStackViewer = null;

      return;
    };

    /**
     * Clear the small bar next to the close button of the stack viewer window.
     */
    function clearTopbars() {
      project.getStackViewers().forEach(function(stackViewer) {
        var label = $('#neuronName' + stackViewer.getId());
        label.text("");
        var labelData = label.data();
        if (labelData) NeuronNameService.getInstance().unregister(labelData);
      });
    }

    /**
     * Set the text in the small bar next to the close button of each stack
     * viewer to the name of the skeleton as it is given by the nameservice.
     */
    function setNeuronNameInTopbars(skeletonID) {
      if (!skeletonID) {
        clearTopbars();
        return;
      }

      project.getStackViewers().forEach(function(stackViewer) {
        var label = $('#neuronName' + stackViewer.getId());
        if (0 === label.length) return;

        NeuronNameService.getInstance().unregister(label.data());

        label.data('skeleton_id', skeletonID);
        label.data('updateNeuronNames', function () {
          label.text(NeuronNameService.getInstance().getName(this.skeleton_id));
        });

        var models = {};
        models[skeletonID] = {};
        NeuronNameService.getInstance().registerAll(label.data(), models)
          .then(function() {
            label.text(NeuronNameService.getInstance().getName(skeletonID));
          });
      });
    }

    /**
     * Handle update of active node. All nodes are recolored and the neuron name in
     * the top bar is updated.
     */
    function handleActiveNodeChange(node) {
      if (node && node.id) {
        if (SkeletonAnnotations.TYPE_NODE === node.type) {
          setNeuronNameInTopbars(node.skeleton_id);
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
          clearTopbars();
        }
      } else {
        clearTopbars();
      }
    }

    this.prototype.changeSlice = function( val )
    {
      activeStackViewer.moveToPixel( val, activeStackViewer.y, activeStackViewer.x, activeStackViewer.s );
    };


    var updateStatusBar = function( e ) {
      var m = CATMAID.ui.getMouse(e, activeTracingLayer.svgOverlay.view, true);
      var offX, offY, pos_x, pos_y;
      if (m) {
        offX = m.offsetX;
        offY = m.offsetY;

        // TODO pos_x and pos_y never change
        var stackViewer = activeStackViewer;
        // TODO pos_x and pos_y never change
        pos_x = stackViewer.primaryStack.translation.x + (stackViewer.x + (offX - stackViewer.viewWidth  / 2) / stackViewer.scale) * stackViewer.primaryStack.resolution.x;
        pos_y = stackViewer.primaryStack.translation.x + (stackViewer.y + (offY - stackViewer.viewHeight / 2) / stackViewer.scale) * stackViewer.primaryStack.resolution.y;
        CATMAID.statusBar.replaceLast("[" + pos_x.toFixed(3) + ", " + pos_y.toFixed(3) + "]" + " stack x,y: " + stackViewer.x + ", " + stackViewer.y);
      }
      return true;
    };

    /**
     * ACTIONS
     *
     **/

    // get basic Actions from Navigator
    var actions = self.prototype.getActions();

    this.getActions = function () {
      return actions;
    };

    this.addAction = function ( action ) {
      actions.push( action );
    };

      this.addAction( new Action({
          helpText: "Switch to skeleton tracing mode",
          buttonName: "skeleton",
          buttonID: 'trace_button_skeleton',
          keyShortcuts: { ";": [ 186 ] },
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
          if (e.altKey || e.ctrlKey || e.metaKey) return false;
          var modifier = e.shiftKey;
          if (null === SkeletonAnnotations.getActiveNodeId()) {
            alert('Must activate a treenode or connector before '
                + (modifier ? 'removing the tag' : 'tagging with') + ' "' + tag + '"!');
            return true;
          }
          // If any modifier key is pressed, remove the tag
          if (modifier) {
            SkeletonAnnotations.Tag.removeATNLabel(tag, activeTracingLayer.svgOverlay);
          } else {
            SkeletonAnnotations.Tag.tagATNwithLabel(tag, activeTracingLayer.svgOverlay, false);
          }
          return true;
        };
      };

    this.addAction( new Action({
      helpText: "Add ends Tag (Shift: Remove) for the active node",
      keyShortcuts: { "K": [ 75 ] },
        run: tagFn('ends')
    } ) );

    this.addAction( new Action({
      helpText: "Add 'uncertain end' Tag (Shift: Remove) for the active node",
      keyShortcuts: { "U": [ 85 ] },
        run: tagFn('uncertain end')
    } ) );

    this.addAction( new Action({
      helpText: "Add 'uncertain continuation' Tag (Shift: Remove) for the active node",
      keyShortcuts: { "C": [ 67 ] },
        run: tagFn('uncertain continuation')
    } ) );

    this.addAction( new Action({
      helpText: "Add 'not a branch' Tag (Shift: Remove) for the active node",
      keyShortcuts: { "N": [ 78 ] },
        run: tagFn('not a branch')
    } ) );

    this.addAction( new Action({
      helpText: "Add 'soma' Tag (Shift: Remove) for the active node",
      keyShortcuts: { "M": [ 77 ] },
        run: tagFn('soma')
    } ) );

    this.addAction( new Action({
      helpText: "Go to active node",
      buttonName: "goactive",
      buttonID: 'trace_button_goactive',
      keyShortcuts: { "A": [ 65 ] },
      run: function (e) {
        if (!mayView())
          return false;
        if (e.shiftKey) {
          var skid = SkeletonAnnotations.getActiveSkeletonId();
          if (Number.isInteger(skid)) WebGLApplication.prototype.staticReloadSkeletons([skid]);
        } else {
          activeTracingLayer.svgOverlay.moveToAndSelectNode(SkeletonAnnotations.getActiveNodeId());
        }
        return true;
      }
    } ) );

    this.addAction( new Action({
      helpText: "Go to nearest open leaf node (subsequent shift+R: cycle through other open leaves; with alt: most recent rather than nearest)",
      keyShortcuts: { "R": [ 82 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.goToNextOpenEndNode(SkeletonAnnotations.getActiveNodeId(), e.shiftKey, e.altKey);
        return true;
      }
    } ) );

    this.addAction( new Action({
      helpText: "Go to next branch or end point (with alt, stop earlier at node with tag, synapse or low confidence; subsequent shift+V: cycle through other branches)",
      keyShortcuts: { "V": [ 86 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.goToNextBranchOrEndNode(SkeletonAnnotations.getActiveNodeId(), e);
        return true;
      }
    } ) );

    this.addAction( new Action({
      helpText: "Go to previous branch or end node (with alt, stop earlier at node with tag, synapse or low confidence)",
      keyShortcuts: { "B": [ 66 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.goToPreviousBranchOrRootNode(SkeletonAnnotations.getActiveNodeId(), e);
        return true;
      }
    } ) );


    this.addAction( new Action({
      helpText: "Deselect the active node",
      keyShortcuts: { "D": [ 68 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.activateNode(null);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Go to the parent of the active node (Ctrl: ignore virtual nodes)",
      keyShortcuts: { "[": [ 219 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.goToParentNode(SkeletonAnnotations.getActiveNodeId(), (e.ctrlKey || e.metaKey));
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Go to the child of the active node (Ctrl: ignore virtual nodes; Subsequent shift+]: cycle through children)",
      keyShortcuts: { "]": [ 221 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.goToChildNode(SkeletonAnnotations.getActiveNodeId(), e.shiftKey, (e.ctrlKey || e.metaKey));
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Edit the radius of the active node (Shift: without measurment tool)",
      keyShortcuts: { "O": [ 79 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.editRadius(SkeletonAnnotations.getActiveNodeId(),
            e.shiftKey);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Measure the distance between the cursor and a clicked point",
      keyShortcuts: { "X": [ 88 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.measureRadius();
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Go to last edited node in this skeleton",
      keyShortcuts: { "H": [ 72 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.goToLastEditedNode(SkeletonAnnotations.getActiveSkeletonId());
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Append the active skeleton to the last used selection widget (Ctrl: remove from selection; Shift: select by radius)",
      keyShortcuts: {
        "Y": [ 89 ]
      },
      run: function (e) {
        if (e.shiftKey) { // Select skeletons by radius.
          var selectionCallback = (e.ctrlKey || e.metaKey) ?
              function (skids) { SelectionTable.getLastFocused().removeSkeletons(skids); } :
              function (skids) { SelectionTable.getLastFocused().addSkeletons(skids); };
          var atnID = SkeletonAnnotations.getActiveNodeId();

          activeTracingLayer.svgOverlay.selectRadius(
              atnID,
              true,
              function (radius) {
                if (typeof radius === 'undefined') return;

                var respectVirtualNodes = true;
                var node = activeTracingLayer.svgOverlay.nodes[atnID];
                var selectedIDs = activeTracingLayer.svgOverlay.findAllNodesWithinRadius(
                    activeStackViewer.primaryStack.stackToProjectX(node.z, node.y, node.x),
                    activeStackViewer.primaryStack.stackToProjectY(node.z, node.y, node.x),
                    activeStackViewer.primaryStack.stackToProjectZ(node.z, node.y, node.x),
                    radius, respectVirtualNodes);
                selectedIDs = selectedIDs.map(function (nodeID) {
                    return activeTracingLayer.svgOverlay.nodes[nodeID].skeleton_id;
                }).filter(function (s) { return !isNaN(s); });

                selectionCallback(selectedIDs);
              });
        } else { // Select active skeleton.
          if (e.ctrlKey || e.metaKey) {
            SelectionTable.getLastFocused().removeSkeletons([
                SkeletonAnnotations.getActiveSkeletonId()]);
          } else {
            SelectionTable.getLastFocused().append(
                SkeletonAnnotations.sourceView.getSelectedSkeletonModels());
          }
        }
      }
    }) );

    this.addAction( new Action({
      helpText: "Split this skeleton at the active node",
      buttonName: "skelsplitting",
      buttonID: 'trace_button_skelsplitting',
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.splitSkeleton(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Re-root this skeleton at the active node",
      buttonName: "skelrerooting",
      buttonID: 'trace_button_skelrerooting',
      keyShortcuts: { "6": [ 54 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.rerootSkeleton(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Toggle the display of labels",
      buttonName: "togglelabels",
      buttonID: 'trace_button_togglelabels',
      keyShortcuts: { "7": [ 55 ] },
      run: function (e) {
        if (!mayView())
          return false;
        show_labels = !show_labels;
        getTracingLayers().forEach(function(layer) {
          if (show_labels) layer.svgOverlay.showLabels();
          else layer.svgOverlay.hideLabels();
        });
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
      keyShortcuts: { "S": [ 83 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.switchBetweenTerminalAndConnector();
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Tag the active node",
      keyShortcuts: { "T": [ 84 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        if (e.shiftKey) {
          // Delete all tags
          SkeletonAnnotations.Tag.tagATNwithLabel('', activeTracingLayer.svgOverlay, true);
          return true;
        } else if (! (e.ctrlKey || e.metaKey)) {
          SkeletonAnnotations.Tag.tagATN(activeTracingLayer.svgOverlay);
          return true;
        } else {
          return false;
        }
      }
    }) );

    this.addAction( new Action({
      helpText: "Add TODO Tag (Shift: Remove) to the active node",
      keyShortcuts: { "L": [ 76 ] },
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
      keyShortcuts: { "G": [ 71 ] },
      run: function (e) {
        if (!mayView())
          return false;
        if (!(e.ctrlKey || e.metaKey)) {
          var respectVirtualNodes = true;
          activeTracingLayer.svgOverlay.activateNearestNode(respectVirtualNodes);
          return true;
        } else {
          return false;
        }
      }
    }) );

    this.addAction( new Action({
      helpText: "Create treenode (Shift on another node: join), behavior like mouse click",
      keyShortcuts: { 'Z': [ 90 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        var insert = e.altKey;
        var link = e.shiftKey;
        var postLink = e.altKey;
        activeTracingLayer.svgOverlay.createNewOrExtendActiveSkeleton(insert, link, postLink);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Delete the active node",
      keyShortcuts: { 'DEL': [ 46 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.deleteNode(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Retrieve information about the active node.",
      keyShortcuts: { 'I': [ 73 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.svgOverlay.printTreenodeInfo(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Set confidence in node link to 1 (Alt: with a connector)",
      keyShortcuts: { '1': [ 49 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.setConfidence(1, e.altKey);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Set confidence in node link to 2 (Alt: with a connector)",
      keyShortcuts: { '2': [ 50 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.setConfidence(2, e.altKey);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Set confidence in node link to 3 (Alt: with a connector)",
      keyShortcuts: { '3': [ 51 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.setConfidence(3, e.altKey);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Set confidence in node link to 4 (Alt: with a connector)",
      keyShortcuts: { '4': [ 52 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.setConfidence(4, e.altKey);
        return true;
      }
    }) );

    this.addAction( new Action({
      helpText: "Set confidence in node link to 5 (Alt: with a connector)",
      keyShortcuts: { '5': [ 53 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.svgOverlay.setConfidence(5, e.altKey);
        return true;
      }
    }) );

    this.addAction( new Action({
        helpText: "Move to previous node in segment for review. At an end node, moves one section beyond for you to check that it really ends.",
        keyShortcuts: { 'Q': [ 81 ] },
        run: function (e) {
            if (!mayEdit())
                return false;
            if (CATMAID.ReviewSystem.validSegment())
                CATMAID.ReviewSystem.moveNodeInSegmentBackward();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move to next node in segment for review (with shift, move to next unreviewed node in the segment)",
        keyShortcuts: { 'W': [ 87 ] },
        run: function (e) {
            if (!mayEdit())
                return false;
            if (CATMAID.ReviewSystem.validSegment())
                CATMAID.ReviewSystem.moveNodeInSegmentForward(e.shiftKey);
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Start reviewing the next skeleton segment.",
        keyShortcuts: { 'E': [ 69 ] },
        run: function (e) {
            if (!mayEdit())
                return false;
            if (CATMAID.ReviewSystem.validSegment())
                CATMAID.ReviewSystem.selectNextSegment();
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Rename active neuron",
        keyShortcuts: { 'F2': [ 113 ] },
        run: function (e) {
            if (!mayEdit()) {
                return false;
            }
            activeTracingLayer.svgOverlay.renameNeuron(SkeletonAnnotations.getActiveSkeletonId());
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Annotate active neuron",
        keyShortcuts: { 'F3': [ 114 ] },
        run: function (e) {
            if (!mayEdit()) {
                return false;
            }
            CATMAID.annotate_neurons_of_skeletons(
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
      keyShortcuts: { '/': [ 191 ] },
      run: function (e) {
        WindowMaker.create('neuron-annotations');
        return true;
      }
    }) );


    var keyCodeToAction = getKeyCodeToActionMap(actions);

    /**
     * This function should return true if there was any action linked to the key
     * code, or false otherwise.
     */
    this.handleKeyPress = function( e ) {
      var keyAction = keyCodeToAction[e.keyCode];
      if (keyAction) {
        activeTracingLayer.svgOverlay.ensureFocused();
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
      result += '<strong>ctrl-shift-click on an arrow:</strong> delete that link<br />';
      result += '<strong>shift-click in space:</strong> create a synapse with the active treenode being presynaptic.<br />';
      result += '<strong>shift-alt-click in space:</strong> create a synapse with the active treenode as postsynaptic.<br />';
      result += '<strong>shift-click in space:</strong> create a post-synaptic node (if there was an active connector)<br />';
      result += '<strong>shift-click on a treenode:</strong> join two skeletons (if there was an active treenode)<br />';
      result += '<strong>alt-ctrl-click in space:</strong> adds a node along the nearest edge of the active skeleton<br />';
      result += '</p>';
      return result;
    };

    this.redraw = function()
    {
      self.prototype.redraw();
    };

    // Initialize a tracing layer in all available stack viewers, but let
    // register() take care of bindings.
    project.getStackViewers().forEach(function(s) {
      var layer = prepareStackViewer(s);
      layer.svgOverlay.updateNodes(layer.forceRedraw.bind(layer));
      s.getView().appendChild(layer.svgOverlay.view);
    }, this);

    // Listen to creation and removal of new stack views in current project.
    project.on(Project.EVENT_STACKVIEW_ADDED, prepareStackViewer, this);
    project.on(Project.EVENT_STACKVIEW_CLOSED, closeStackViewer, this);

    // Listen to active node change events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        handleActiveNodeChange, this);
  }

  /* Works as well for skeletons.
   * @param type A 'neuron' or a 'skeleton'.
   * @param objectID the ID of a neuron or a skeleton.
   */
  TracingTool.goToNearestInNeuronOrSkeleton = function(type, objectID) {
    var projectCoordinates = project.focusedStackViewer.projectCoordinates();
    var parameters = {
      x: projectCoordinates.x,
      y: projectCoordinates.y,
      z: projectCoordinates.z
    }, nodeIDToSelect, skeletonIDToSelect;
    parameters[type + '_id'] = objectID;
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
                  if( index % 20 === 0)
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
   * Actions available for the tracing tool.
   */
  TracingTool.actions = [

    new Action({
        helpText: "Review system",
        buttonID: "data_button_review",
        buttonName: 'table_review',
        run: function (e) {
            WindowMaker.show('review-system');
            return true;
        }
    }),

    new Action({
        helpText: "Notifications",
        buttonID: "data_button_notifications",
        buttonName: 'table_notifications',
        run: function (e) {
            WindowMaker.show('notifications');
            return true;
        }
    }),

      new Action({
          helpText: "Connectivity widget",
          buttonID: "data_button_connectivity",
          buttonName: 'table_connectivity',
          run: function (e) {
              WindowMaker.create('connectivity-widget');
              return true;
          }
      }),

    new Action({
      helpText: "Connectivity Matrix",
      buttonID: "data_button_connectivity_matrix",
      buttonName: 'adj_matrix',
      run: function (e) {
          WindowMaker.create('connectivity-matrix');
          return true;
      }
    }),


  /*    new Action({
          helpText: "Adjacency Matrix widget",
          buttonID: "data_button_connectivity",
          buttonName: 'adj_matrix',
          run: function (e) {
              WindowMaker.show('adjacencymatrix-widget');
              return true;
          }
      }),

    new Action({
        helpText: "Export widget",
        buttonID: "data_button_export_widget",
        buttonName: 'export_widget',
        run: function (e) {
            WindowMaker.show('export-widget');
            return true;
        }
    }),

    new Action({
        helpText: "Graph widget",
        buttonID: "data_button_graph_widget",
        buttonName: 'graph_widget',
        run: function (e) {
            WindowMaker.show('graph-widget');
            return true;
        }
    }),*/

    new Action({
        helpText: "Skeleton Analytics widget",
        buttonID: "button_skeleton_analytics_widget",
        buttonName: 'skeleton_analytics_widget',
        run: function (e) {
            WindowMaker.create('skeleton-analytics-widget');
            return true;
        }
    }),

    new Action({
        helpText: "Graph widget",
        buttonID: "data_button_compartment_graph_widget",
        buttonName: 'graph_widget',
        run: function (e) {
            WindowMaker.create('graph-widget');
            return true;
        }
    }),

    new Action({
        helpText: "Circuit Graph Plot",
        buttonID: "data_button_circuit_graph_plot",
        buttonName: 'circuit_plot',
        run: function (e) {
            WindowMaker.create('circuit-graph-plot');
            return true;
        }
    }),

    new Action({
        helpText: "Morphology Plot",
        buttonID: "data_button_morphology_plot",
        buttonName: 'morphology_plot',
        run: function (e) {
            WindowMaker.create('morphology-plot');
            return true;
        }
    }),

    new Action({
        helpText: "Venn Diagram",
        buttonID: "venn_diagram_button",
        buttonName: 'venn',
        run: function (e) {
            WindowMaker.create('venn-diagram');
            return true;
        }
    }),

    new Action({
        helpText: "Selection Table",
        buttonID: "data_button_neuron_staging_area_widget",
        buttonName: 'neuron_staging',
        run: function (e) {
            WindowMaker.create('neuron-staging-area');
            return true;
        }
    }),

    new Action({
      helpText: "Show search window",
      buttonID: "data_button_search",
      buttonName: 'search',
      keyShortcuts: {
        '/': [ 191, 47 ]
      },
      run: function (e) {
        WindowMaker.show('search');
        return true;
      }
    }),

    new Action({
      helpText: "Navigate Neurons",
      buttonID: 'data_button_neuron_navigator',
      buttonName: 'neuron_navigator_button',
      run: function (e) {
        WindowMaker.create('neuron-navigator');
        return true;
      }
    }),

    new Action({
      helpText: "Query Neurons by Annotations",
      buttonID: "data_button_query_neurons",
      buttonName: 'query_neurons',
      run: function (e) {
        WindowMaker.create('neuron-annotations');
        return true;
      }
    }),

    new Action({
        helpText: "Show 3D WebGL view",
        buttonID: "view_3d_webgl_button",
        buttonName: '3d-view-webgl',
        run: function (e) {
          WindowMaker.create('3d-webgl-view');
        }
      }),

    new Action({
      helpText: "Show project statistics",
      buttonID: "data_button_stats",
      buttonName: 'stats',
      run: function (e) {
        WindowMaker.show('statistics');
        return true;
      }
    }),

    new Action({
        helpText: "Show log",
        buttonID: "data_button_table_log",
        buttonName: 'table_log',
        run: function (e) {
            WindowMaker.show( 'log-table' );
            return true;
        }
    }),

    new Action({
        helpText: "Export widget",
        buttonID: "data_button_export_widget",
        buttonName: 'export_widget',
        run: function (e) {
            WindowMaker.show('export-widget');
            return true;
        }
    }),

     ];

  /**
   * Show dialog regarding the set-up of the tracing tool. If a user
   * has then needed permission, (s)he is offered to let CATMAID set
   * tracing up for the current project. Regardless of the result, the
   * navigator tool is loaded afterwards. It provides a safe fallback
   * on failure and forces a tool reload on success.
   */
  TracingTool.display_tracing_setup_dialog = function(pid, has_needed_permissions,
      missing_classes, missing_relations, missing_classinstances, initialize)
  {
    var dialog = document.createElement('div');
    dialog.setAttribute("id", "dialog-confirm");
    dialog.setAttribute("title", "Update required");
    var msg = document.createElement('p');
    dialog.appendChild(msg);
    var msg_text;
    // If no expected entity is available, let the user know that the project
    // isn't set up for tracing. Otherwise, be more clear that an update is
    // required.
    if (initialize) {
      msg_text = "The tracing system isn't set up to work with this project" +
        ", yet. It needs certain classes and relations which haven't been found. ";
    } else {
      msg_text = "An update of this project's tracing configuration is required. " +
        "No change will be made to the tracing data itself. ";
    }
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
      if (initialize) {
        msg_text = msg_text + "Do you want CATMAID to create the missing bits " +
          "and initialize tracing support for this project?";
      } else {
        msg_text = msg_text + "Do you want to continue and update this project?";
      }
      msg.innerHTML = msg_text;
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
        if (initialize) {
          msg_text = msg_text + "Unfortunately, you don't have " +
            "needed permissions to add the missing bits and intitialize " +
            "tracing for this project. Please contact an administrator.";
        } else {
          msg_text = msg_text + "Unfortunately, you don't have the " +
            "needed permissions to update this project. Please contact " +
            "an administrator";
        }
        msg.innerHTML = msg_text;
        buttons = {
          "Ok": function() {
              project.setTool( new Navigator() );
              $(this).dialog("close");
            }
          };
    }
    // The dialog is inserted into the document and shown by the following call:
    $(dialog).dialog({
      width: 400,
      height: 'auto',
      modal: true,
      buttons: buttons,
    });
  };

  // Make tracing tool in CATMAID namespace
  CATMAID.TracingTool = TracingTool;

})(CATMAID);
