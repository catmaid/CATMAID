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
  function TracingTool() {
    this.prototype = new CATMAID.Navigator();
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


    this.resize = function(width, height) {
      self.prototype.resize( width, height );
      return;
    };

    this.deselectActiveNode = function() {
      activeTracingLayer.tracingOverlay.activateNode(null);
    };

    var setupSubTools = function() {
      var box;
      if ( self.prototype.stackViewer === null ) {
        box = CATMAID.createButtonsFromActions(
          actions,
          "tracingbuttons",
          "trace_");
        $( "#toolbar_nav" ).prepend( box );

      }
    };

    /**
     * Return a list of all tracing layers, optionally excluding the active one.
     */
    var getTracingLayers = function(excludeActive) {
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

    var setTracingLayersSuspended = function(value, excludeActive) {
      value = Boolean(value);
      getTracingLayers(excludeActive).forEach(function(layer) {
        layer.tracingOverlay.suspended = value;
      });
    };

    var updateNodesInTracingLayers = function(excludeActive) {
      getTracingLayers(excludeActive).forEach(function(layer) {
        layer.tracingOverlay.updateNodes();
      });
    };

    /**
     * Return a unique name for the tracing layer of a given stack viewer.
     */
    var getTracingLayerName = function(stackViewer) {
      return "TracingLayer" + stackViewer.getId();
    };

    var disableLayerUpdate = function() {
      CATMAID.warn("Temporary disabling node update until panning is over");
      activeTracingLayer.tracingOverlay.suspended = true;
    };

    /**
     * Create new mouse bindings for the layer's view.
     */
    function createMouseBindings(stackViewer, layer, mouseCatcher) {
      // A handle to a delayed update
      var updateTimeout;

      var proto_onmousedown = mouseCatcher.onmousedown;
      var stackViewerBindings = {
        onmousedown: function( e ) {
          switch ( CATMAID.ui.getMouseButton( e ) ) {
            case 1:
              layer.tracingOverlay.whenclicked( e );
              break;
            case 2:
              // Put all tracing layers, except active, in "don't update" mode
              setTracingLayersSuspended(true, true);

              // Attach to the node limit hit event to disable node updates
              // temporary if the limit was hit. This allows for smoother panning
              // when many nodes are visible.
              layer.tracingOverlay.on(layer.tracingOverlay.EVENT_HIT_NODE_DISPLAY_LIMIT,
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
                  layer.tracingOverlay.off(layer.tracingOverlay.EVENT_HIT_NODE_DISPLAY_LIMIT,
                      disableLayerUpdate, layer);
                  if (layer.tracingOverlay.suspended) {
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
      var view = layer.tracingOverlay.view;
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
        layer = new CATMAID.TracingLayer(stackViewer, {
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
      if (labelData) CATMAID.NeuronNameService.getInstance().unregister(labelData);
      label.remove();

      // Remove the tracing layer
      var layerName = getTracingLayerName(stackViewer);
      var layer = stackViewer.getLayer(layerName);
      if (layer) {
        // Remove layer from stack viewer. This will also unregister it and
        // destroy the tracing overlay.
        stackViewer.removeLayer(layerName);
      }
    }

    /**
     * install this tool in a stack viewer.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer ) {
      document.getElementById( "toolbox_data" ).style.display = "block";

      setupSubTools();

      // Update annotation cache for the current project
      CATMAID.annotations.update();

      // Get or create the tracing layer for this stack viewer
      var layer = prepareStackViewer(parentStackViewer);

      // Set this layer as mouse catcher in Navigator
      var view = layer.tracingOverlay.view;
      self.prototype.setMouseCatcher(view);

      // Register stack viewer with prototype, after the mouse catcher has been set.
      // This attaches mouse handlers to the view.
      self.prototype.register(parentStackViewer, "edit_button_trace");

      // Try to get existing mouse bindings for this layer
      if (!bindings.has(parentStackViewer)) createMouseBindings(parentStackViewer, layer, view);

      // Force an update and skeleton tracing mode if stack viewer or layer changed
      if (activeTracingLayer !== layer || activeStackViewer !== parentStackViewer) {
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SKELETON);
        layer.tracingOverlay.updateNodes();
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
    this.unregister = function() {
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
    this.destroy = function() {
      project.off(CATMAID.Project.EVENT_STACKVIEW_ADDED, prepareStackViewer, this);
      project.off(CATMAID.Project.EVENT_STACKVIEW_CLOSED, closeStackViewer, this);
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
     * Clear the small bar next to the close button of the stack viewer window,
     * optionally with a replacement text.
     */
    function clearTopbars(text) {
      project.getStackViewers().forEach(function(stackViewer) {
        var label = $('#neuronName' + stackViewer.getId());
        label.text(text || '');
        var labelData = label.data();
        if (labelData) CATMAID.NeuronNameService.getInstance().unregister(labelData);
      });
    }

    /**
     * Set the text in the small bar next to the close button of each stack
     * viewer to the name of the skeleton as it is given by the nameservice.
     */
    function setNeuronNameInTopbars(skeletonID, prefix) {
      if (!skeletonID) {
        clearTopbars();
        return;
      }

      // Make sure we can refer to at least an empty prefix
      prefix = prefix || '';

      project.getStackViewers().forEach(function(stackViewer) {
        var label = $('#neuronName' + stackViewer.getId());
        if (0 === label.length) return;

        CATMAID.NeuronNameService.getInstance().unregister(label.data());

        label.data('skeleton_id', skeletonID);
        label.data('updateNeuronNames', function () {
          label.text(prefix + CATMAID.NeuronNameService.getInstance().getName(this.skeleton_id));
        });

        var models = {};
        models[skeletonID] = {};
        CATMAID.NeuronNameService.getInstance().registerAll(label.data(), models)
          .then(function() {
            label.text(prefix + CATMAID.NeuronNameService.getInstance().getName(skeletonID));
          });
      });
    }

    /**
     * Handle update of active node. All nodes are recolored and the neuron name in
     * the top bar is updated.
     */
    function handleActiveNodeChange(node, skeletonChanged) {
      if (node && node.id) {
        if (skeletonChanged && SkeletonAnnotations.TYPE_NODE === node.type) {
          setNeuronNameInTopbars(node.skeleton_id);
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
          if (SkeletonAnnotations.SUBTYPE_SYNAPTIC_CONNECTOR === node.subtype) {
            // Retrieve presynaptic skeleton
            requestQueue.register(django_url + project.id + "/connector/skeletons",
                "POST",
                { connector_ids: [node.id] },
                CATMAID.jsonResponseHandler(function(json) {
                  var presynaptic_to = json[0] ? json[0][1].presynaptic_to : false;
                  if (presynaptic_to) {
                    setNeuronNameInTopbars(presynaptic_to, 'Connector ' + node.id +
                        ', presynaptic partner: ');
                  } else {
                    clearTopbars('Connector ' + node.id + ' (no presynatpic partner)');
                  }
                }));
          } else {
            clearTopbars('Abutting connector #' + node.id);
          }
        }
      } else {
        clearTopbars();
      }
    }

    this.prototype.changeSlice = function(val) {
      activeStackViewer.moveToPixel( val, activeStackViewer.y, activeStackViewer.x, activeStackViewer.s );
    };


    var updateStatusBar = function(e) {
      var m = CATMAID.ui.getMouse(e, activeTracingLayer.tracingOverlay.view, true);
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
     * Add or remove a skeleton projection layer to each view.
     */
    var toggleSkeletonProjectionLayers = function() {
      var key = "skeletonprojection";
      var allHaveLayers = project.getStackViewers().every(function(sv) {
        return !!sv.getLayer(key);
      });

      function add(sv) {
        if (sv.getLayer(key)) return;
        // Add new layer, defaulting to the active skelton source for input
        sv.addLayer(key, new CATMAID.SkeletonProjectionLayer(sv));
      }
      function remove(sv) {
        if (!sv.getLayer(key)) return;
        sv.removeLayer(key);
      }

      var fn = allHaveLayers ? remove : add;
      project.getStackViewers().forEach(fn);
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

    this.addAction = function (action) {
      actions.push( action );
    };

    this.addAction(new CATMAID.Action({
      helpText: "Switch to skeleton tracing mode",
      buttonName: "skeleton",
      buttonID: 'trace_button_skeleton',
      keyShortcuts: { ";": [ 186 ] },
      run: function (e) {
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SKELETON);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Switch to synapse dropping mode",
      buttonName: "synapse",
      buttonID: 'trace_button_synapse',
      run: function (e) {
        if (!mayEdit())
          return false;
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SYNAPSE);
        return true;
      }
    }));

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
          SkeletonAnnotations.Tag.removeATNLabel(tag, activeTracingLayer.tracingOverlay);
        } else {
          SkeletonAnnotations.Tag.tagATNwithLabel(tag, activeTracingLayer.tracingOverlay, false);
        }
        return true;
      };
    };

    this.addAction(new CATMAID.Action({
      helpText: "Add ends Tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "K": [ 75 ] },
      run: tagFn('ends')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'uncertain end' Tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "U": [ 85 ] },
      run: tagFn('uncertain end')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'uncertain continuation' Tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "C": [ 67 ] },
      run: tagFn('uncertain continuation')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'not a branch' Tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "N": [ 78 ] },
      run: tagFn('not a branch')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'soma' Tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "M": [ 77 ] },
      run: tagFn('soma')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to active node",
      buttonName: "goactive",
      buttonID: 'trace_button_goactive',
      keyShortcuts: { "A": [ 65 ] },
      run: function (e) {
        if (!mayView())
          return false;
        if (e.shiftKey) {
          var skid = SkeletonAnnotations.getActiveSkeletonId();
          if (Number.isInteger(skid)) CATMAID.WebGLApplication.prototype.staticReloadSkeletons([skid]);
        } else {
          activeTracingLayer.tracingOverlay.moveToAndSelectNode(SkeletonAnnotations.getActiveNodeId());
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to nearest open leaf node (subsequent <kbd>Shift</kbd>+<kbd>R</kbd>: cycle through other open leaves; with <kbd>Alt</kbd>: most recent rather than nearest)",
      keyShortcuts: { "R": [ 82 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToNextOpenEndNode(SkeletonAnnotations.getActiveNodeId(), e.shiftKey, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to next branch or end point (with <kbd>Alt</kbd>: stop earlier at node with tag, synapse or low confidence; subsequent <kbd>Shift</kbd>+<kbd>V</kbd>: cycle through other branches)",
      keyShortcuts: { "V": [ 86 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToNextBranchOrEndNode(SkeletonAnnotations.getActiveNodeId(), e);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to previous branch or end node (with <kbd>Alt</kbd>: stop earlier at node with tag, synapse or low confidence)",
      keyShortcuts: { "B": [ 66 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToPreviousBranchOrRootNode(SkeletonAnnotations.getActiveNodeId(), e);
        return true;
      }
    }));


    this.addAction(new CATMAID.Action({
      helpText: "Deselect the active node",
      keyShortcuts: { "D": [ 68 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.activateNode(null);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to the parent of the active node (<kbd>Ctrl</kbd>: ignore virtual nodes)",
      keyShortcuts: { "[": [ 219, 56 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToParentNode(SkeletonAnnotations.getActiveNodeId(), (e.ctrlKey || e.metaKey));
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to the child of the active node (<kbd>Ctrl</kbd>: ignore virtual nodes; Subsequent <kbd>Shift</kbd>+<kbd>]</kbd>: cycle through children)",
      keyShortcuts: { "]": [ 221, 57 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToChildNode(SkeletonAnnotations.getActiveNodeId(), e.shiftKey, (e.ctrlKey || e.metaKey));
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Edit the radius of the active node (<kbd>Shift</kbd>: without measurment tool)",
      keyShortcuts: { "O": [ 79 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.editRadius(SkeletonAnnotations.getActiveNodeId(),
            e.shiftKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Measure the distance between the cursor and a clicked point",
      keyShortcuts: { "X": [ 88 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.measureRadius();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to last node edited by you in this skeleton",
      keyShortcuts: { "H": [ 72 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToLastEditedNode(SkeletonAnnotations.getActiveSkeletonId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Append the active skeleton to the last used selection widget (<kbd>Ctrl</kbd>: remove from selection; <kbd>Shift</kbd>: select by radius)",
      keyShortcuts: {
        "Y": [ 89 ]
      },
      run: function (e) {
        if (e.shiftKey) { // Select skeletons by radius.
          var selectionCallback = (e.ctrlKey || e.metaKey) ?
              function (skids) { CATMAID.SelectionTable.getLastFocused().removeSkeletons(skids); } :
              function (skids) { CATMAID.SelectionTable.getLastFocused().addSkeletons(skids); };
          var atnID = SkeletonAnnotations.getActiveNodeId();

          activeTracingLayer.tracingOverlay.selectRadius(
              atnID,
              true,
              function (radius) {
                if (typeof radius === 'undefined') return;

                var respectVirtualNodes = true;
                var node = activeTracingLayer.tracingOverlay.nodes[atnID];
                var selectedIDs = activeTracingLayer.tracingOverlay.findAllNodesWithinRadius(
                    activeStackViewer.primaryStack.stackToProjectX(node.z, node.y, node.x),
                    activeStackViewer.primaryStack.stackToProjectY(node.z, node.y, node.x),
                    activeStackViewer.primaryStack.stackToProjectZ(node.z, node.y, node.x),
                    radius, respectVirtualNodes);
                selectedIDs = selectedIDs.map(function (nodeID) {
                    return activeTracingLayer.tracingOverlay.nodes[nodeID].skeleton_id;
                }).filter(function (s) { return !isNaN(s); });

                selectionCallback(selectedIDs);
              });
        } else { // Select active skeleton.
          if (e.ctrlKey || e.metaKey) {
            CATMAID.SelectionTable.getLastFocused().removeSkeletons([
                SkeletonAnnotations.getActiveSkeletonId()]);
          } else {
            CATMAID.SelectionTable.getLastFocused().append(
                SkeletonAnnotations.activeSkeleton.getSelectedSkeletonModels());
          }
        }
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Split this skeleton at the active node",
      buttonName: "skelsplitting",
      buttonID: 'trace_button_skelsplitting',
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.splitSkeleton(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Re-root this skeleton at the active node",
      buttonName: "skelrerooting",
      buttonID: 'trace_button_skelrerooting',
      keyShortcuts: { "6": [ 54 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.rerootSkeleton(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Toggle the display of labels",
      buttonName: "togglelabels",
      buttonID: 'trace_button_togglelabels',
      keyShortcuts: { "7": [ 55 ] },
      run: function (e) {
        if (!mayView())
          return false;
        show_labels = !show_labels;
        getTracingLayers().forEach(function(layer) {
          if (show_labels) layer.tracingOverlay.showLabels();
          else layer.tracingOverlay.hideLabels();
        });
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Export to SWC",
      buttonName: "exportswc",
      buttonID: 'trace_button_exportswc',
      run: function (e) {
        if (!mayView())
          return false;
        SkeletonAnnotations.exportSWC();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Switch between a terminal and its connector",
      keyShortcuts: { "S": [ 83 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.switchBetweenTerminalAndConnector();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Tag the active node",
      keyShortcuts: { "T": [ 84 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        if (e.shiftKey) {
          // Delete all tags
          SkeletonAnnotations.Tag.tagATNwithLabel('', activeTracingLayer.tracingOverlay, true);
          return true;
        } else if (! (e.ctrlKey || e.metaKey)) {
          SkeletonAnnotations.Tag.tagATN(activeTracingLayer.tracingOverlay);
          return true;
        } else {
          return false;
        }
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add TODO Tag (<kbd>Shift</kbd>: Remove) to the active node",
      keyShortcuts: { "L": [ 76 ] },
      run: tagFn('TODO')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'microtubules end' tag (<kbd>Shift</kbd>: Remove) to the active node",
      keyShortcuts: {
        "F": [ 70 ]
      },
      run: tagFn('microtubules end')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Select the nearest node to the mouse cursor",
      keyShortcuts: { "G": [ 71 ] },
      run: function (e) {
        if (!mayView())
          return false;
        if (!(e.ctrlKey || e.metaKey)) {
          // Give all layers a chance to activate a node
          var selectedNode = null;
          var layers = activeStackViewer.getLayers();
          var layerOrder = activeStackViewer.getLayerOrder();
          // TODO: Don't use internal objects of the tracing overlay, i.e. find
          // a better way to get the current mouse position.
          var x = activeTracingLayer.tracingOverlay.coords.lastX;
          var y = activeTracingLayer.tracingOverlay.coords.lastY;
          // Only allow nodes that are screen space 50px or closer
          var r = 50.0 / activeStackViewer.scale;
          for (var i=0, max=layerOrder.length; i<max; ++i) {
            // Read layers from top to bottom
            var l = layers.get(layerOrder[max-i-1]);
            if (CATMAID.tools.isFn(l.getClosestNode)) {
              selectedNode = l.getClosestNode(x, y, r);
              if (selectedNode) {
                break;
              }
            }
          }
          if (selectedNode) {
            // If this layer has a node close by, activate it
            SkeletonAnnotations.staticMoveToAndSelectNode(selectedNode);
          } else {
            // If no layer found a node close by, ask the tracing layer for the
            // closest node without any bounds.
            var respectVirtualNodes = true;
            activeTracingLayer.tracingOverlay.activateNearestNode(respectVirtualNodes);
          }
          return true;
        } else {
          return false;
        }
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Create treenode (<kbd>Shift</kbd> on another node: join), behavior like mouse click",
      keyShortcuts: { 'Z': [ 90 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        var insert = e.altKey;
        var link = e.shiftKey;
        var postLink = e.altKey;
        activeTracingLayer.tracingOverlay.createNewOrExtendActiveSkeleton(insert, link, postLink);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Delete the active node (or suppress it if it is virtual)",
      keyShortcuts: { 'DEL': [ 46 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.deleteNode(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Retrieve information about the active node.",
      keyShortcuts: { 'I': [ 73 ] },
      run: function (e) {
        if (!mayView())
          return false;
        activeTracingLayer.tracingOverlay.printTreenodeInfo(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 1 (Alt: with a connector)",
      keyShortcuts: { '1': [ 49 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.setConfidence(1, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 2 (Alt: with a connector)",
      keyShortcuts: { '2': [ 50 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.setConfidence(2, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 3 (Alt: with a connector)",
      keyShortcuts: { '3': [ 51 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.setConfidence(3, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 4 (Alt: with a connector)",
      keyShortcuts: { '4': [ 52 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.setConfidence(4, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 5 (Alt: with a connector)",
      keyShortcuts: { '5': [ 53 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.setConfidence(5, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Move to previous node in segment for review. At an end node, moves one section beyond for you to check that it really ends.",
      keyShortcuts: { 'Q': [ 81 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        if (CATMAID.ReviewSystem.validSegment())
          CATMAID.ReviewSystem.moveNodeInSegmentBackward();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Move to next node in segment for review (with <kbd>Shift</kbd>: move to next unreviewed node in the segment)",
      keyShortcuts: { 'W': [ 87 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        if (CATMAID.ReviewSystem.validSegment())
          CATMAID.ReviewSystem.moveNodeInSegmentForward(e.shiftKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Start reviewing the next skeleton segment.",
      keyShortcuts: { 'E': [ 69 ] },
      run: function (e) {
        if (!mayEdit())
          return false;
        if (CATMAID.ReviewSystem.validSegment())
          CATMAID.ReviewSystem.selectNextSegment();
        return true;
        }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Rename active neuron",
      keyShortcuts: { 'F2': [ 113 ] },
      run: function (e) {
        if (!mayEdit()) {
          return false;
        }
        activeTracingLayer.tracingOverlay.renameNeuron(SkeletonAnnotations.getActiveSkeletonId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
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
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Neuron dendrogram",
      keyShortcuts: {
        'F4': [ 115 ]
      },
      run: function (e) {
        WindowMaker.create('neuron-dendrogram');
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Toggle skeleton projection layer",
      keyShortcuts: {
        'F10': [ 121 ]
      },
      run: function (e) {
        toggleSkeletonProjectionLayers();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Open the neuron/annotation search widget (with <kbd>Shift</kbd>: activate next selected neuron in search results after active skeleton)",
      keyShortcuts: { '/': [ 191 ] },
      run: function (e) {
        if (e.shiftKey) {
          var nextSkid = CATMAID.NeuronAnnotations.prototype.getFirstInstance()
              .getNextSkeletonIdAfter(SkeletonAnnotations.getActiveSkeletonId());
          if (nextSkid) {
            CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', nextSkid);
          }
        } else {
          WindowMaker.create('neuron-annotations');
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Find the nearest matching tagged node (<kbd>Ctrl</kbd>: repeat last tag query; Subsequent <kbd>Shift</kbd>+<kbd>\\</kbd>: cycle to next nearest)",
      keyShortcuts: { '\\': [ 220 ] },
      run: function (e) {
        activeTracingLayer.tracingOverlay.goToNearestMatchingTag(e.shiftKey, e.ctrlKey);
        return true;
      }
    }));


    var keyCodeToAction = CATMAID.getKeyCodeToActionMap(actions);

    /**
     * This function should return true if there was any action linked to the key
     * code, or false otherwise.
     */
    this.handleKeyPress = function(e) {
      var keyAction = keyCodeToAction[e.keyCode];
      if (keyAction) {
        activeTracingLayer.tracingOverlay.ensureFocused();
        return keyAction.run(e);
      } else {
        return false;
      }
    };

    this.getMouseHelp = function(e) {
      var result = self.prototype.getMouseHelp();
      result += '<ul>';
      result += '<li><strong>Click on a node:</strong> make that node active</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+click in space:</strong> deselect the active node</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click on a node:</strong> delete that node</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click on an arrow:</strong> delete that link</li>';
      result += '<li><strong><kbd>Shift</kbd>+click in space:</strong> create a synapse with the active treenode being presynaptic.</li>';
      result += '<li><strong><kbd>Shift</kbd>+<kbd>Alt</kbd>+click in space:</strong> create a synapse with the active treenode as postsynaptic.</li>';
      result += '<li><strong><kbd>Shift</kbd>+click in space:</strong> create a post-synaptic node (if there was an active connector)</li>';
      result += '<li><strong><kbd>Shift</kbd>+click on a treenode:</strong> join two skeletons (if there was an active treenode)</li>';
      result += '<li><strong><kbd>Alt</kbd>+<kbd>Ctrl</kbd>+click in space:</strong> adds a node along the nearest edge of the active skeleton</li>';
      result += '</ul>';
      return result;
    };

    this.redraw = function() {
      self.prototype.redraw();
    };

    // Initialize a tracing layer in all available stack viewers, but let
    // register() take care of bindings.
    project.getStackViewers().forEach(function(s) {
      var layer = prepareStackViewer(s);
      layer.tracingOverlay.updateNodes(layer.forceRedraw.bind(layer));
      s.getView().appendChild(layer.tracingOverlay.view);
    }, this);

    // Listen to creation and removal of new stack views in current project.
    project.on(CATMAID.Project.EVENT_STACKVIEW_ADDED, prepareStackViewer, this);
    project.on(CATMAID.Project.EVENT_STACKVIEW_CLOSED, closeStackViewer, this);

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

  TracingTool.search = function() {
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
              var selection = CATMAID.SelectionTable.prototype.getOrCreate();
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

    new CATMAID.Action({
      helpText: "Review system",
      buttonID: "data_button_review",
      buttonName: 'table_review',
      run: function (e) {
        WindowMaker.show('review-system');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Notifications",
      buttonID: "data_button_notifications",
      buttonName: 'table_notifications',
      run: function (e) {
        WindowMaker.show('notifications');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Connectivity widget",
      buttonID: "data_button_connectivity",
      buttonName: 'table_connectivity',
      run: function (e) {
        WindowMaker.create('connectivity-widget');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Connectivity Matrix",
      buttonID: "data_button_connectivity_matrix",
      buttonName: 'adj_matrix',
      run: function (e) {
        WindowMaker.create('connectivity-matrix');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Skeleton Analytics widget",
      buttonID: "button_skeleton_analytics_widget",
      buttonName: 'skeleton_analytics_widget',
      run: function (e) {
        WindowMaker.create('skeleton-analytics-widget');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Graph widget",
      buttonID: "data_button_compartment_graph_widget",
      buttonName: 'graph_widget',
      run: function (e) {
        WindowMaker.create('graph-widget');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Circuit Graph Plot",
      buttonID: "data_button_circuit_graph_plot",
      buttonName: 'circuit_plot',
      run: function (e) {
        WindowMaker.create('circuit-graph-plot');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Morphology Plot",
      buttonID: "data_button_morphology_plot",
      buttonName: 'morphology_plot',
      run: function (e) {
        WindowMaker.create('morphology-plot');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Venn Diagram",
      buttonID: "venn_diagram_button",
      buttonName: 'venn',
      run: function (e) {
        WindowMaker.create('venn-diagram');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Selection Table",
      buttonID: "data_button_neuron_staging_area_widget",
      buttonName: 'neuron_staging',
      run: function (e) {
        WindowMaker.create('neuron-staging-area');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Search",
      buttonID: "data_button_search",
      buttonName: 'search',
      run: function (e) {
        WindowMaker.show('search');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Navigate Neurons",
      buttonID: 'data_button_neuron_navigator',
      buttonName: 'neuron_navigator_button',
      run: function (e) {
        WindowMaker.create('neuron-navigator');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Query Neurons by Annotations",
      buttonID: "data_button_query_neurons",
      buttonName: 'query_neurons',
      run: function (e) {
        WindowMaker.create('neuron-annotations');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Show 3D WebGL view",
      buttonID: "view_3d_webgl_button",
      buttonName: '3d-view-webgl',
      run: function (e) {
        WindowMaker.create('3d-webgl-view');
      }
    }),

    new CATMAID.Action({
      helpText: "Show project statistics",
      buttonID: "data_button_stats",
      buttonName: 'stats',
      run: function (e) {
        WindowMaker.show('statistics');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Show log",
      buttonID: "data_button_table_log",
      buttonName: 'table_log',
      run: function (e) {
        WindowMaker.show( 'log-table' );
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Export widget",
      buttonID: "data_button_export_widget",
      buttonName: 'export_widget',
      run: function (e) {
        WindowMaker.show('export-widget');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Synapse Distribution Plot",
      buttonID: "data_button_synapse_plot",
      buttonName: 'synapse_plot',
      run: function (e) {
        WindowMaker.create('synapse-plot');
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
      missing_classes, missing_relations, missing_classinstances, initialize) {
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
                  project.setTool( new CATMAID.Navigator() );
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
            project.setTool( new CATMAID.Navigator() );
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
              project.setTool( new CATMAID.Navigator() );
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
