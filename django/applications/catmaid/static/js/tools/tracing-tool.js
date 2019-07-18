/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
    // Update caches every 60min
    this.autoCacheUpdateIntervalLength = 60*60*1000;
    this.autoCacheUpdateInterval = null;
    this.refreshAutoCacheUpdate();
    // Keep a reference to the current and last selected skeleton.
    this.lastSkeletonId = null;
    this.currentSkeletonId = null;

    /**
     * Return the stack viewer referenced by the active node, or otherwise (if
     * unavailable) use the tracing tool's active stack viewer.
     */
    var getActiveNodeStackViewer = function() {
      var stackViewerId = SkeletonAnnotations.atn.stack_viewer_id;
      return stackViewerId === undefined ?
          activeStackViewer : project.getStackViewer(stackViewerId);
    };

    var getActiveNodeTracingLayer = function() {
      var stackViewer = getActiveNodeStackViewer();
      if (!stackViewer) {
        return null;
      }
      var tracingLayer = stackViewer.getLayer(getTracingLayerName(stackViewer));
      if (!tracingLayer) {
        throw new CATMAID.ValueError("Can't find tracing layer for active node");
      }
      return tracingLayer;
    };

    /**
     * Set postAction option of a command to update of the active tracing layer,
     * if it is available.
     *
     * @returns input command
     */
    var withPostUpdate = function(command) {
      if (activeTracingLayer) {
        var overlay = activeTracingLayer.tracingOverlay;
        command.postAction = overlay.updateNodes.bind(overlay, undefined, undefined, undefined);
      }
      return command;
    };

    /**
     * Get the node closest to the last cursor position in the active stack
     * viewer. All layers are respected and the closest node ID is returned,
     * limited by a maximum distance in pixels.
     *
     * @param {Number} maxDistancePx (Optional) The maximum distance of a node
     *                               to the cursor position.
     * @returns The ID of the cloesest node or null if no node was found.
     */
    this.getClosestNode = function(maxDistancePx) {
      maxDistancePx = CATMAID.tools.getDefined(maxDistancePx, 100.0);
      // Give all layers a chance to activate a node
      var selectedNode = null;
      var layers = activeStackViewer.getLayers();
      var layerOrder = activeStackViewer.getLayerOrder();

      let coords = self.prototype.lastPointerCoordsS;
      // Only allow nodes that are screen space 50px or closer
      var r = maxDistancePx / activeStackViewer.scale;
      for (var i = layerOrder.length - 1; i >= 0; --i) {
        // Read layers from top to bottom
        var l = layers.get(layerOrder[i]);
        if (CATMAID.tools.isFn(l.getClosestNode)) {
          var candidateNode = l.getClosestNode(coords.x, coords.y, coords.z, r);
          if (candidateNode && (!selectedNode || candidateNode.distsq < selectedNode.distsq)) {
            selectedNode = candidateNode;
          }
        }
      }

      return selectedNode;
    };

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
    function createPointerBindings(stackViewer, layer, mouseCatcher) {
      // A handle to a delayed update
      var updateTimeout;

      // Remove navigator's pointer down handling and replace it with our own.
      var proto_onpointerdown = self.prototype._onpointerdown;
      mouseCatcher.removeEventListener('pointerdown', proto_onpointerdown);

      var overlayBindings = {
        pointerdown: function( e ) {
          var mouseButton = CATMAID.ui.getMouseButton(e);
          // Left mouse click will delegate to tracing overlay
          var fallback = false;
          if (mouseButton === 1) {
            if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.MOVE) {
              fallback = true;
            } else {
              layer.tracingOverlay.whenclicked( e );
            }
          }

          // Right mouse button and middle mouse button will pan view. And soma
          // will the left mouse button if the tracing overlay returned false.
          if (mouseButton === 2 || mouseButton === 3 || fallback) {
            fallback = false;
            // Put all tracing layers in "don't update" mode during move,
            // optionally except the active layer
            setTracingLayersSuspended(true, layer.updateWhilePanning);

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

            // Handle pointer event
            proto_onpointerdown( e );

            CATMAID.ui.registerEvent( "onpointermove", updateStatusBar );
            CATMAID.ui.registerEvent( "onpointerup",
              function onpointerup (e) {
                CATMAID.ui.removeEvent( "onpointermove", updateStatusBar );
                CATMAID.ui.removeEvent( "onpointerup", onpointerup );
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

                layer.tracingOverlay.updateCursor();
              });
          }

          // If fallback has been set to true, delegate to prototype.
          if (fallback) {
            proto_onpointerdown( e );
          }
        }
      };

      // Assign bindings to view
      var view = layer.tracingOverlay.view;
      for (var fn in overlayBindings) {
        view.addEventListener(fn, overlayBindings[fn]);
      }

      bindings.set(stackViewer, overlayBindings);
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
          show_labels: CATMAID.TracingTool.Settings.session.show_node_labels
        });
        stackViewer.addLayer(layerName, layer);
      }

      // Insert a text div for the neuron name in the canvas window title bar
      var activeElementId = "active-element" + stackViewer.getId();
      var activeElement = document.getElementById(activeElementId);
      if (!activeElement) {
        var stackFrame = stackViewer.getWindow().getFrame();
        activeElement = document.createElement("p");
        activeElement.id = activeElementId;
        activeElement.classList.add("active-element");
        var spanName = document.createElement("span");
        spanName.appendChild(document.createTextNode(""));
        activeElement.appendChild(spanName);
        stackFrame.appendChild(activeElement);
        setActiveElemenTopBarText(SkeletonAnnotations.getActiveSkeletonId());
      }

      return layer;
    }

    function prepareAndUpdateStackViewer(stackViewer) {
      let layer = prepareStackViewer(stackViewer);
      layer.forceRedraw();
    }

    /**
     * Remove the neuron name display and the tacing layer from a stack view.
     */
    function closeStackViewer(stackViewer) {
      // Unregister the neuron name label from the neuron name service and
      // remove it.
      var label = $('#active-element' + stackViewer.getId());
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

      if (activeTracingLayer.stackViewer === stackViewer) {
        activeTracingLayer = null;
      }

      if (activeStackViewer === stackViewer) {
        activeStackViewer = null;
      }
    }

    /**
     * install this tool in a stack viewer.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer ) {
      document.getElementById( "toolbox_data" ).style.display = "block";

      setupSubTools();

      // Get or create the tracing layer for this stack viewer
      var layer = prepareStackViewer(parentStackViewer);

      // Set this layer as mouse catcher in Navigator
      var view = layer.tracingOverlay.view;
      self.prototype.setMouseCatcher(view);

      // Register stack viewer with prototype, after the mouse catcher has been set.
      // This attaches pointer handlers to the view.
      self.prototype.register(parentStackViewer, "edit_button_trace");

      // Initialize button state
      document.getElementById( "trace_button_togglelabels" ).className =
          CATMAID.TracingTool.Settings.session.show_node_labels ? "button_active" : "button";

      document.getElementById( "trace_button_togglecolorlength" ).className =
          CATMAID.TracingOverlay.Settings.session.color_by_length ? "button_active" : "button";

      // Try to get existing pointer bindings for this layer
      if (!bindings.has(parentStackViewer)) createPointerBindings(parentStackViewer, layer, view);

      // Force an update and skeleton tracing mode if stack viewer or layer changed
      if (activeTracingLayer !== layer || activeStackViewer !== parentStackViewer) {
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.currentmode);
        this.handleChangedInteractionMode(SkeletonAnnotations.currentmode);
      }

      activeStackViewer = parentStackViewer;
      activeTracingLayer = layer;
      activateBindings(parentStackViewer, layer);
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
        c.removeEventListener(fn, handlers[fn]);
      }
    };

    /**
     * Replace bindings of the mouse catcher with the stored bindings for the
     * given stack viewer.
     */
    var activateBindings = function(stackViewer, layer) {

      // Make sure the parent navigator doesn't handle clicks.
      var view = layer.tracingOverlay.view;
      var proto_onpointerdown = self.prototype._onpointerdown;
      view.removeEventListener('pointerdown', proto_onpointerdown);

      var handlers = bindings.get(stackViewer);
      var c = self.prototype.mouseCatcher;
      for (var fn in handlers) {
        c.addEventListener(fn, handlers[fn]);
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
      project.off(CATMAID.Project.EVENT_STACKVIEW_ADDED, prepareAndUpdateStackViewer, this);
      project.off(CATMAID.Project.EVENT_STACKVIEW_CLOSED, closeStackViewer, this);
      SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
          handleActiveNodeChange, this);
      SkeletonAnnotations.off(SkeletonAnnotations.EVENT_INTERACTION_MODE_CHANGED,
          this.handleChangedInteractionMode, this);

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

      // Neurons from the closed project shouldn't need a front-end name
      // anymore.
      CATMAID.NeuronNameService.getInstance().clear();

      // Forget the active node
      SkeletonAnnotations.atn.set(null);

      if (this.autoCacheUpdateTimeout) {
        window.clearInterval(this.autoCacheUpdateInterval);
      }
    };

    /**
     * Clear the small bar next to the close button of the stack viewer window,
     * optionally with a replacement text.
     */
    function clearTopbars(text) {
      project.getStackViewers().forEach(function(stackViewer) {
        var label = $('#active-element' + stackViewer.getId());
        label.text(text || '');
        var labelData = label.data();
        if (labelData) CATMAID.NeuronNameService.getInstance().unregister(labelData);
      });
    }

    /**
     * Set the text in the small bar next to the close button of each stack
     * viewer to the name of the skeleton as it is given by the nameservice.
     */
    function setActiveElemenTopBarText(skeletonId, prefix) {
      if (!skeletonId) {
        clearTopbars();
        return;
      }

      // Make sure we can refer to at least an empty prefix
      prefix = prefix || '';

      project.getStackViewers().forEach(function(stackViewer) {
        var label = $('#active-element' + stackViewer.getId());
        if (0 === label.length) return;

        var labelData = label.data();
        if (labelData) {
          CATMAID.NeuronNameService.getInstance().unregister(labelData);
        }

        // If a skeleton is selected, register with neuron name service.
        label.data('skeleton_id', skeletonId);
        label.data('updateNeuronNames', function () {
          label.text(prefix + CATMAID.NeuronNameService.getInstance().getName(this.skeleton_id));
        });

        var models = {};
        models[skeletonId] = {};
        CATMAID.NeuronNameService.getInstance().registerAll(label.data(), models)
          .then(function() {
            label.text(prefix + CATMAID.NeuronNameService.getInstance().getName(skeletonId));
          })
          .catch(CATMAID.handleError);
      });
    }

    /**
     * Handle update of active node. All nodes are recolored and the neuron name in
     * the top bar is updated.
     */
    function handleActiveNodeChange(node, skeletonChanged) {
      self.lastSkeletonId = self.currentSkeletonId;
      self.currentSkeletonId = null;
      if (node && node.id) {
        if (SkeletonAnnotations.TYPE_NODE === node.type) {
          if (skeletonChanged) {
            setActiveElemenTopBarText(node.skeleton_id);
          }
          self.currentSkeletonId = node.skeleton_id;
        } else if (SkeletonAnnotations.TYPE_CONNECTORNODE === node.type) {
          if (CATMAID.Connectors.SUBTYPE_SYNAPTIC_CONNECTOR === node.subtype) {
            // Retrieve presynaptic skeleton
            CATMAID.fetch(project.id + "/connector/skeletons", "POST", {
              connector_ids: [node.id]
            })
            .then(function(json) {
              var presynaptic_to = json[0] ? json[0][1].presynaptic_to : false;
              if (presynaptic_to) {
                setActiveElemenTopBarText(presynaptic_to, 'Connector ' +
                    node.id + ', presynaptic partner: ');
              } else {
                clearTopbars('Connector ' + node.id + ' (no presynatpic partner)');
              }
            })
            .catch(CATMAID.handleError);
          } else if (CATMAID.Connectors.SUBTYPE_GAPJUNCTION_CONNECTOR === node.subtype) {
            clearTopbars('Gap junction connector #' + node.id);
          } else {
            clearTopbars('Abutting connector #' + node.id);
          }
        }
      } else {
        clearTopbars();
      }
    }


    this.prototype.changeSlice = function(val, step) {
      val = activeStackViewer.toValidZ(val, step < 0 ? -1 : 1);
      activeStackViewer.moveToPixel( val, activeStackViewer.y, activeStackViewer.x, activeStackViewer.s )
        .catch(CATMAID.warn);
    };


    /**
     * Display both project and stack space center coordinates in the status
     * bar.
     */
    var updateStatusBar = function(e) {
      CATMAID.statusBar.replaceLast("Project: " +
          project.coordinates.x.toFixed(3) + ", " +
          project.coordinates.y.toFixed(3) + ", " +
          project.coordinates.z.toFixed(3) + " Stack: " +
          activeStackViewer.x.toFixed(3) + ", " +
          activeStackViewer.y.toFixed(3) + ", " +
          activeStackViewer.z.toFixed(3));
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
        sv.redraw();
      }

      var fn = allHaveLayers ? remove : add;
      project.getStackViewers().forEach(fn);
    };


    /**
     * ACTIONS
     *
     **/

    var actions = [];

    this.getActions = function () {
      return actions;
    };

    this.addAction = function (action) {
      actions.push( action );
    };

    this.addAction(new CATMAID.Action({
      helpText: "Switch to or toggle skeleton tracing mode",
      buttonName: "skeleton",
      buttonID: 'trace_button_skeleton',
      run: function (e) {
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SKELETON, true);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Switch to or toggle synapse dropping mode",
      buttonName: "synapse",
      buttonID: 'trace_button_synapse',
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.SYNAPSE, true);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Switch to navigation mode",
      buttonName: "move",
      buttonID: 'trace_button_move',
      run: function (e) {
        SkeletonAnnotations.setTracingMode(SkeletonAnnotations.MODES.MOVE, true);
        return true;
      }
    }));

    /** Return a function that attempts to tag the active treenode or connector,
     * and display an alert when no node is active.
     */
    var tagFn = function(tag) {
      return function(e) {
        if (!CATMAID.mayEdit()) return false;
        if (e.altKey || e.ctrlKey || e.metaKey) return false;
        var modifier = e.shiftKey;
        var nodeId = SkeletonAnnotations.getActiveNodeId();
        if (null === nodeId) {
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
      helpText: "Add 'ends' tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "K": [ "k", "Shift + k" ] },
      run: tagFn('ends')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'uncertain end' tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "U": [ "u", "Shift + u" ] },
      run: tagFn('uncertain end')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'uncertain continuation' tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "C": [ "c", "Shift + c" ] },
      run: tagFn('uncertain continuation')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'not a branch' tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "N": [ "n", "Shift + n" ] },
      run: tagFn('not a branch')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'soma' tag (<kbd>Shift</kbd>: Remove) for the active node",
      keyShortcuts: { "M": [ "m", "Shift + m" ] },
      run: tagFn('soma')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to active node (<kbd>Shift</kbd>: refresh active skeleton in 3D viewer)",
      buttonName: "goactive",
      buttonID: 'trace_button_goactive',
      keyShortcuts: { "A": [ "a", "Shift + a" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        if (e.shiftKey) {
          var skid = SkeletonAnnotations.getActiveSkeletonId();
          if (Number.isInteger(skid)) CATMAID.WebGLApplication.prototype.staticReloadSkeletons([skid]);
        } else {
          activeTracingLayer.tracingOverlay.moveToAndSelectNode(SkeletonAnnotations.getActiveNodeId())
            .catch(CATMAID.handleError);
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to nearest open leaf node (subsequent <kbd>Shift</kbd>+<kbd>R</kbd>: cycle through other open leaves; with <kbd>Alt</kbd>: most recent rather than nearest, <kbd>Shift</kbd>+<kbd>Alt</kbd>: cycle in reverse)",
      keyShortcuts: { "R": [ "r", "Alt + r", "Alt + Shift + R", "Shift + r"] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToNextOpenEndNode(SkeletonAnnotations.getActiveNodeId(),
            e.shiftKey, e.altKey, e.shiftKey && e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to next branch or end point (with <kbd>Alt</kbd>: stop earlier at node with tag, synapse or low confidence; subsequent <kbd>Shift</kbd>+<kbd>V</kbd>: cycle through other branches)",
      keyShortcuts: { "V": [ "v", "Alt + v", "Alt + Shift + v", "Shift + v" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToNextBranchOrEndNode(SkeletonAnnotations.getActiveNodeId(), e);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to previous branch or end node (with <kbd>Alt</kbd>: stop earlier at node with tag, synapse or low confidence)",
      keyShortcuts: { "B": [ "b", "Alt + b" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.goToPreviousBranchOrRootNode(SkeletonAnnotations.getActiveNodeId(), e);
        return true;
      }
    }));


    this.addAction(new CATMAID.Action({
      helpText: "Deselect the active node",
      keyShortcuts: { "D": [ "d" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.activateNode(null);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to the parent of the active node (<kbd>Ctrl</kbd>: ignore virtual nodes)",
      keyShortcuts: { "[": [ "[", "Ctrl + [", "Meta + [" ] },
      run: (function() {
        var updateInProgress = false;
        return function (e) {
          if (updateInProgress) {
            return false;
          }
          if (!CATMAID.mayView()) {
            return false;
          }

          var modifierKey = e.ctrlKey || e.metaKey;
          if (CATMAID.TracingTool.Settings.session.invert_virtual_node_ignore_modifier) modifierKey = !modifierKey;
          updateInProgress = true;
          var fn = activeTracingLayer.tracingOverlay.goToParentNode.bind(activeTracingLayer.tracingOverlay,
              SkeletonAnnotations.getActiveNodeId(), modifierKey);
          var update = activeTracingLayer.withHiddenUpdate(true, fn);

          // Only allow further parent selections if the last one has been
          // completed.
          update.then(function() {
            updateInProgress = false;
          }).catch(function(error) {
            updateInProgress = false;
            CATMAID.handleError(error);
          });

          return true;
        };
      })()
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to the child of the active node (<kbd>Ctrl</kbd>: ignore virtual nodes; Subsequent <kbd>Shift</kbd>+<kbd>]</kbd>: cycle through children)",
      keyShortcuts: { "]": [ "]", "Ctrl + ]" , "Meta + ]", "Shift + ]", "Ctrl + Shift + ]", "Meta + Shift + ]" ] },
      run: (function() {
        var updateInProgress = false;
        return function (e) {
          if (updateInProgress) {
            return false;
          }
          if (!CATMAID.mayView()) {
            return false;
          }

          var modifierKey = e.ctrlKey || e.metaKey;
          if (CATMAID.TracingTool.Settings.session.invert_virtual_node_ignore_modifier) modifierKey = !modifierKey;
          updateInProgress = true;
          var fn = activeTracingLayer.tracingOverlay.goToChildNode.bind(activeTracingLayer.tracingOverlay,
              SkeletonAnnotations.getActiveNodeId(), e.shiftKey, modifierKey);
          var update = activeTracingLayer.withHiddenUpdate(true, fn);

          // Only allow further parent selections if the last one has been
          // completed.
          update.then(function() {
            updateInProgress = false;
          }).catch(function() {
            updateInProgress = false;
          });

          return true;
        };
      })()
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Edit the radius of the active node (<kbd>Shift</kbd>: without measurment tool; <kbd>Ctrl</kbd>: without confirmation dialog)",
      keyShortcuts: { "O": [ "o", "Ctrl + o", "Ctrl + Shift + o", "Shift + o" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.editRadius(SkeletonAnnotations.getActiveNodeId(),
            e.shiftKey, false, e.ctrlKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Measure the distance between the cursor and a clicked point",
      keyShortcuts: { "X": [ "x" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.measureRadius();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to last node edited by you in active skeleton (no active skeleton: in last active skeleton, <kbd>Shift</kbd>: in any skeleton, <kbd>Alt</kbd>: by anyone)",
      keyShortcuts: { "H": [ "h", "Shift + h", "Alt + h", "Alt + Shift + h" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        let activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
        let referenceSkeletonId = activeSkeletonId ? activeSkeletonId : self.lastSkeletonId;
        activeTracingLayer.tracingOverlay.goToLastEditedNode(
            e.shiftKey ? undefined : referenceSkeletonId,
            e.altKey ? undefined : CATMAID.session.user)
          .then(result => {
            let user = e.altKey ? 'anyone' : 'you';
            if (result && result.id) {
              if (e.shiftKey) {
                CATMAID.msg(`Selected node last edited by ${user} in any skeleton`, 'Node selection successful');
              } else {
                if (activeSkeletonId) {
                  CATMAID.msg(`Selected node last edited by ${user} in the active skeleton`, 'Node selection successful');
                } else if (referenceSkeletonId) {
                  CATMAID.msg(`Selected node last edited by ${user} in last active skeleton`);
                } else {
                  CATMAID.warn(`Neither is nor was a skeleton active to look for node last edited by ${user}. Alterantively, use the Shift key for last edit globally.`);
                }
              }
            } else {
              if (e.shiftKey) {
                if (e.altKey) {
                  CATMAID.warn('Could not find any last edited node in any skeleton');
                } else {
                  CATMAID.warn('Could not find any node last edited by you in any skeleton');
                }
              } else {
                if (activeSkeletonId) {
                  CATMAID.warn(`Could not find any node in the active skeleton last edited by ${user}`);
                } else if (referenceSkeletonId) {
                  CATMAID.warn(`Could not find any node in the last active skeleton edited by ${user}`);
                } else {
                  CATMAID.warn(`Neither is nor was a skeleton active to look for node last edited by ${user}. Alterantively, use the Shift key for last edit globally.`);
                }
              }
            }
          })
          .catch(CATMAID.handleError);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Append the active skeleton to the last used selection widget " +
          "(<kbd>Ctrl</kbd>: remove from selection; " +
          "<kbd>Shift</kbd>: select by radius; " +
          "<kbd>Alt</kbd>: create a new selection widget)",
      keyShortcuts: {
        "Y": [ "y", "Ctrl + y", "Meta + y", "Shift + y", "Ctrl + Shift + y", "Meta + Shift + y" ]
      },
      run: function (e) {
        if (e.shiftKey) { // Select skeletons by radius.
          var selectionCallback = (e.ctrlKey || e.metaKey) ?
              function (skids) { CATMAID.SelectionTable.getLastFocused().removeSkeletons(skids); } :
              (e.altKey ?
                  function (skids) { WindowMaker.create('selection-table').widget.addSkeletons(skids); } :
                  function (skids) { CATMAID.SelectionTable.getLastFocused().addSkeletons(skids); });
          var atnID = SkeletonAnnotations.getActiveNodeId();

          activeTracingLayer.tracingOverlay.selectRadius(
              atnID,
              true,
              function (radius) {
                if (typeof radius === 'undefined') return;

                var respectVirtualNodes = true;
                var node = activeTracingLayer.tracingOverlay.nodes.get(atnID);
                var selectedIDs = activeTracingLayer.tracingOverlay.findAllNodesWithinRadius(
                    node.x, node.y, node.z,
                    radius, respectVirtualNodes, true);
                selectedIDs = selectedIDs.map(function (nodeID) {
                    return activeTracingLayer.tracingOverlay.nodes.get(nodeID).skeleton_id;
                }).filter(function (s) { return !isNaN(s); });

                selectionCallback(selectedIDs);
              });
        } else { // Select active skeleton.
          if (e.ctrlKey || e.metaKey) {
            CATMAID.SelectionTable.getLastFocused().removeSkeletons([
                SkeletonAnnotations.getActiveSkeletonId()]);
          } else {
            var selectionTable = e.altKey ?
                WindowMaker.create('selection-table').widget :
                CATMAID.SelectionTable.getLastFocused();
            selectionTable.append(SkeletonAnnotations.activeSkeleton.getSelectedSkeletonModels());
          }
        }
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Split this skeleton at the active node",
      buttonName: "skelsplitting",
      buttonID: 'trace_button_skelsplitting',
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        var activeNodeId = SkeletonAnnotations.getActiveNodeId();
        if (!activeNodeId) {
          CATMAID.warn("No node selected");
          return false;
        }
        var tracingLayer = getActiveNodeTracingLayer();
        tracingLayer.tracingOverlay.splitSkeleton(activeNodeId);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Re-root this skeleton at the active node",
      buttonName: "skelrerooting",
      buttonID: 'trace_button_skelrerooting',
      keyShortcuts: { "6": [ "6" ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        var tracingLayer = getActiveNodeTracingLayer();
        tracingLayer.tracingOverlay.rerootSkeleton(SkeletonAnnotations.getActiveNodeId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Toggle the display of labels",
      buttonName: "togglelabels",
      buttonID: 'trace_button_togglelabels',
      keyShortcuts: { "7": [ "7" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;

        var settings = CATMAID.TracingTool.Settings;
        var showLabels = !settings.session.show_node_labels;
        settings.set('show_node_labels', showLabels, 'session');
        getTracingLayers().forEach(function(layer) {
          if (showLabels) layer.tracingOverlay.showLabels();
          else layer.tracingOverlay.hideLabels();
        });

        document.getElementById( "trace_button_togglelabels" ).className =
            showLabels ? "button_active" : "button";

        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Toggle coloring by length",
      buttonName: "togglecolorlength",
      buttonID: 'trace_button_togglecolorlength',
      keyShortcuts: { "F7": [ "F7" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;

        var settings = CATMAID.TracingOverlay.Settings;
        var colorByLength = !settings.session.color_by_length;
        settings.set('color_by_length', colorByLength, 'session');
        getTracingLayers().forEach(function(layer) {
          if (colorByLength) {
            var source = new CATMAID.ColorSource('length', layer.tracingOverlay);
            layer.tracingOverlay.setColorSource(source);
          } else {
            layer.tracingOverlay.setColorSource();
          }
        });

        document.getElementById( "trace_button_togglecolorlength" ).className =
            colorByLength ? "button_active" : "button";

        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Measure the distance between two nodes",
      buttonName: "distance",
      buttonID: "trace_button_distance",
      keyShortcuts: { "F8": ["F8"] },
      run: function(e) {
        if (!CATMAID.mayView()) {
          return false;
        }

        self.measureNodeDistance();

        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Refresh cached data like neuron names and annotations",
      buttonName: "refresh",
      buttonID: "trace_button_refresh",
      keyShortcuts: { "F6": ["F6"] },
      run: function(e) {
        if (!CATMAID.mayView()) {
          return false;
        }
        self.refreshCaches()
          .then(function() {
            CATMAID.msg("Success", "Caches updated");
          })
          .catch(CATMAID.handleError);

        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Switch between a terminal and its connector",
      keyShortcuts: { "S": [ "s" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.switchBetweenTerminalAndConnector();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Tag the active node (<kbd>Shift</kbd>: Remove all tags; <kbd>Alt</kbd>: Tag with personal tag set)",
      keyShortcuts: { "T": [ "t", "Alt + t", "Shift + t", "Alt + Shift + t" ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        var usePersonalTagSet = e.altKey;
        var personalTagSet;
        if (usePersonalTagSet) {
          personalTagSet = SkeletonAnnotations.Settings.session.personal_tag_set;
          if (personalTagSet && personalTagSet.length === 0) {
            CATMAID.msg("No tags", "No tags in personal tag set");
            return true;
          }
        }

        if (e.shiftKey) {
           if (usePersonalTagSet) {
             // Delete personal tag set tags
             var removeRequests = personalTagSet.map(function(t) {
               return SkeletonAnnotations.Tag.removeATNLabel(t, activeTracingLayer.tracingOverlay);
             });
             Promise.all(removeRequests)
               .catch(CATMAID.handleError);
           } else {
            // Delete all tags
            SkeletonAnnotations.Tag.tagATNwithLabel('', activeTracingLayer.tracingOverlay, true);
           }
          return true;
        } else if (!e.ctrlKey && !e.metaKey) {
          if (usePersonalTagSet) {
            SkeletonAnnotations.Tag.tagATNwithLabel(personalTagSet,
                activeTracingLayer.tracingOverlay, false);
          } else {
            SkeletonAnnotations.Tag.tagATN(activeTracingLayer.tracingOverlay);
          }
          return true;
        } else {
          return false;
        }
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add TODO Tag (<kbd>Shift</kbd>: Remove) to the active node",
      keyShortcuts: { "L": [ "l", "Shift + l" ] },
      run: tagFn('TODO')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add 'microtubules end' tag (<kbd>Shift</kbd>: Remove) to the active node",
      keyShortcuts: {
        "F": [ "f", "Shift + f" ]
      },
      run: tagFn('microtubules end')
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Select the nearest node to the mouse cursor in the current section (<kbd>Alt</kbd>: globally)",
      keyShortcuts: { "G": [ "g", "Alt + g" ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
          // Only allow nodes that are screen space 50px or closer
          var selectedNode = self.getClosestNode(100.0);
          if (selectedNode) {
            // If this layer has a node close by, activate it
            var z = activeTracingLayer.stackViewer.primaryStack.projectToStackZ(
                selectedNode.node.z, selectedNode.node.y, selectedNode.node.x);
            if (activeTracingLayer.stackViewer.z === z) {
              SkeletonAnnotations.staticSelectNode(selectedNode.id, true)
                .catch(CATMAID.handleError);
            } else {
              SkeletonAnnotations.staticMoveToAndSelectNode(selectedNode.id)
                .catch(CATMAID.handleError);
            }
          }
          return true;
        } else if (e.altKey) {
          let p = self.prototype.lastPointerCoordsP;
          CATMAID.Nodes.nearestNode(project.id, p.x, p.y, p.z)
            .then(function(data) {
              var nodeIDToSelect = data.treenode_id;
              return SkeletonAnnotations.staticMoveTo(data.z, data.y, data.x)
                  .then(function () {
                    return SkeletonAnnotations.staticSelectNode(nodeIDToSelect);
                  });
            })
            .catch(function () {
              CATMAID.warn('Selecing the globally closed node failed');
            });
          return true;
        } else {
          return false;
        }
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Create treenode (<kbd>Shift</kbd> on another node: join), behavior like mouse click",
      keyShortcuts: { 'Z': [ "z", "Alt + z", "Shift + z", "Alt + Shift + z" ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
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
      keyShortcuts: { 'DEL': [ "Delete" ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        activeTracingLayer.tracingOverlay.deleteActiveNode()
          .catch(CATMAID.handleError);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Retrieve information about the active node.",
      keyShortcuts: { 'I': [ 'i' ] },
      run: function (e) {
        if (!CATMAID.mayView())
          return false;
        activeTracingLayer.tracingOverlay.printTreenodeInfo(
              SkeletonAnnotations.getActiveNodeId(), undefined, true);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 1 (Alt: with a connector)",
      keyShortcuts: { '1': [ '1', 'Alt + 1' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        if (e.shiftKey) {
          return false;
        }
        activeTracingLayer.tracingOverlay.setConfidence(1, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 2 (Alt: with a connector)",
      keyShortcuts: { '2': [ '2', 'Alt + 2' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        if (e.shiftKey) {
          return false;
        }
        activeTracingLayer.tracingOverlay.setConfidence(2, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 3 (Alt: with a connector)",
      keyShortcuts: { '3': [ '3', 'Alt + 3' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        if (e.shiftKey) {
          return false;
        }
        activeTracingLayer.tracingOverlay.setConfidence(3, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 4 (Alt: with a connector)",
      keyShortcuts: { '4': [ '4', 'Alt + 4' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        if (e.shiftKey) {
          return false;
        }
        activeTracingLayer.tracingOverlay.setConfidence(4, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Set confidence in node link to 5 (Alt: with a connector)",
      keyShortcuts: { '5': [ '5', 'Alt + 5' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        if (e.shiftKey) {
          return false;
        }
        activeTracingLayer.tracingOverlay.setConfidence(5, e.altKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Move to previous node in segment for review. At an end node, moves one section beyond for you to check that it really ends.",
      keyShortcuts: { 'Q': [ 'q', 'Shift + q' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        var reviewWidget = CATMAID.ReviewSystem.getLastFocused();
        if (reviewWidget) {
          if (reviewWidget.validSegment()) {
            reviewWidget.moveNodeInSegmentBackward(e.shiftKey);
          }
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Move to next node in segment for review (with <kbd>Shift</kbd>: move to next unreviewed node in the segment)",
      keyShortcuts: { 'W': [ 'w', 'Shift + w' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        var reviewWidget = CATMAID.ReviewSystem.getLastFocused();
        if (reviewWidget) {
          if (reviewWidget.validSegment()) {
            reviewWidget.moveNodeInSegmentForward(e.shiftKey);
          }
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Start reviewing the next skeleton segment.",
      keyShortcuts: { 'E': [ 'e' ] },
      run: function (e) {
        if (!CATMAID.mayEdit())
          return false;
        var reviewWidget = CATMAID.ReviewSystem.getLastFocused();
        if (reviewWidget) {
          if (reviewWidget.validSegment()) {
            reviewWidget.selectNextSegment();
          }
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Rename active neuron",
      keyShortcuts: { 'F2': [ 'F2' ] },
      run: function (e) {
        if (!CATMAID.mayEdit()) {
          return false;
        }
        activeTracingLayer.tracingOverlay.renameNeuron(SkeletonAnnotations.getActiveSkeletonId());
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Annotate active neuron",
      keyShortcuts: { 'F3': [ 'F3' ] },
      run: function (e) {
        if (!CATMAID.mayEdit()) {
          return false;
        }
        var activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
        if (activeSkeletonId) {
          CATMAID.annotate_neurons_of_skeletons(
              [activeSkeletonId]);
        } else {
          CATMAID.warn('No neuron selected to annotate');
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Neuron dendrogram",
      keyShortcuts: {
        'F4': [ 'F4' ]
      },
      run: function (e) {
        WindowMaker.create('neuron-dendrogram');
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Command history",
      keyShortcuts: {
        'F9': [ 'F9' ]
      },
      run: function (e) {
        var dialog = new CATMAID.HistoryDialog();
        dialog.show();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Toggle skeleton projection layer",
      keyShortcuts: {
        'F10': [ 'F10' ]
      },
      run: function (e) {
        toggleSkeletonProjectionLayers();
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Open the neuron/annotation search widget (with <kbd>Shift</kbd>: activate next selected neuron in search results after active skeleton)",
      keyShortcuts: { '/': [ '/', 'Shift + /' ] },
      run: function (e) {
        if (e.shiftKey) {
          var neuronSearch = CATMAID.NeuronSearch.prototype.getFirstInstance();
          if (neuronSearch) {
            var nextSkid = neuronSearch.getNextSkeletonIdAfter(SkeletonAnnotations.getActiveSkeletonId());
            if (nextSkid) {
              CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', nextSkid);
            }
          } else {
            CATMAID.msg('No search widget open', 'Please open a search widget first');
          }
        } else {
          WindowMaker.create('neuron-search');
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Find the nearest matching tagged node (<kbd>Ctrl</kbd>: repeat last tag query; Subsequent <kbd>Shift</kbd>+<kbd>\\</kbd>: cycle to next nearest)",
      keyShortcuts: { '\\': [ '\\', 'Ctrl + \\', 'Shift + \\', 'Ctrl + Shift + \\' ] },
      run: function (e) {
        activeTracingLayer.tracingOverlay.goToNearestMatchingTag(e.shiftKey, e.ctrlKey);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Bookmark the active node or current location",
      keyShortcuts: { ';': [ ';' ] },
      run: function (e) {
          var dialog = new CATMAID.Bookmarks.Dialog(CATMAID.Bookmarks.MODES.MARK);
          dialog.show();
          return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to a bookmarked skeleton",
      keyShortcuts: { '\'': [ '\'' ] },
      run: function (e) {
          var dialog = new CATMAID.Bookmarks.Dialog(CATMAID.Bookmarks.MODES.SKELETON);
          dialog.show();
          return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Go to a bookmarked node",
      keyShortcuts: { '`': [ '`' ] },
      run: function (e) {
          var dialog = new CATMAID.Bookmarks.Dialog(CATMAID.Bookmarks.MODES.NODE);
          dialog.show();
          return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Toggle display of skeletons in visibility group 1 (<kbd>Shift</kbd>: visibility group 2)",
      keyShortcuts: { 'HOME': [ 'Home', 'Shift + Home' ] },
      run: function (e) {
        if (e.shiftKey) {
          SkeletonAnnotations.VisibilityGroups.toggle(SkeletonAnnotations.VisibilityGroups.GROUP_IDS.GROUP_2);
        } else {
          SkeletonAnnotations.VisibilityGroups.toggle(SkeletonAnnotations.VisibilityGroups.GROUP_IDS.GROUP_1);
        }
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Peek: show closest skeleton in all open 3D viewers, while held (<kbd>Shift</kbd>: show active skeleton)",
      keyShortcuts: { 'P': [ 'p', 'Shift + P' ] },
      run: function (e) {
        if (self.peekingSkeleton) return;

        var skid = null;
        if (e.shiftKey) {
          skid = SkeletonAnnotations.getActiveSkeletonId();
        } else {
          var match = self.getClosestNode(100.0);
          if (match) {
            skid = match.node.skeleton_id;
          }
        }

        if (!skid) return;
        self.peekingSkeleton = skid;

        var skeletonModels = {};
        skeletonModels[skid] = new CATMAID.SkeletonModel(
            skid,
            undefined,
            new THREE.Color(CATMAID.TracingOverlay.Settings.session.active_node_color));
        var viewersWithoutSkel = Array.from(WindowMaker.getOpenWindows('3d-viewer', true).values())
            .filter(function (viewer) { return !viewer.hasSkeleton(skid); });

        var removePeekingSkeleton = function () {
          viewersWithoutSkel.forEach(function (viewer) {
            try {
              viewer.removeSkeletons([skid]);
            } catch (error) {
              console.log("Could not remove peeking skeleton", error);
            }
            viewer.render();
          });
          self.peekingSkeleton = false;
        };

        viewersWithoutSkel.forEach(function (viewer) {
          // In case the key is released before the skeleton has loaded,
          // check after loading whether it is still being peeked.
          viewer.addSkeletons(skeletonModels, function () {
            if (self.peekingSkeleton !== skid) {
              removePeekingSkeleton();
            } else {
              viewer.render();
            }
          });
        });

        // Set a key up a listener to remove the skeleton from these viewers
        // when the key is released.
        var target = e.target;
        var oldListener = target.onkeyup;
        target.onkeyup = function (e) {
          if (e.key === 'p' || e.key === 'P') {
            target.onkeyup = oldListener;
            removePeekingSkeleton();
          } else if (oldListener) oldListener(e);
        };

        return true;
      }
    }));

    /**
     * Factory which returns a function which will move the active node in Z.
     *
     * @param step
     * @returns {Function}
     */
    const createNodeZMover = function (step) {
      return function (e) {
        const tracingOverlay = activeStackViewer.getLayersOfType(CATMAID.TracingLayer)[0].tracingOverlay;

        // force SkeletonAnnotation.atn's attributes (x and y coords) to update
        tracingOverlay.activateNode(tracingOverlay.nodes.get(SkeletonAnnotations.getActiveNodeId()));
        const activeNode = SkeletonAnnotations.atn;

        if (!CATMAID.mayEdit()) {
          CATMAID.statusBar.replaceLast("You don't have permission to move node #" + activeNode.id);
          return Promise.resolve();
        }

        const oldZs = activeStackViewer.primaryStack.projectToStackZ(activeNode.z, activeNode.y, activeNode.x);

        if (activeStackViewer.z !== oldZs) {
          CATMAID.statusBar.replaceLast("Stack viewer must be in the same z-slice to move node #" + activeNode.id);
          return Promise.resolve();
        }

        // Get the next valid Z coordinate for the active stack and move the
        // active node to it. To do this, we have have to first convert the
        // active node's (project space) coordinates to stack space, move it,
        // and then convert back.
        const newXs = activeStackViewer.primaryStack.projectToUnclampedStackX(activeNode.z, activeNode.y, activeNode.x);
        const newYs = activeStackViewer.primaryStack.projectToUnclampedStackY(activeNode.z, activeNode.y, activeNode.x);
        const newZs = activeStackViewer.validZDistanceByStep(activeStackViewer.z, step) + activeStackViewer.z;

        const newXp = activeStackViewer.primaryStack.stackToProjectX(newZs, newYs, newXs);
        const newYp = activeStackViewer.primaryStack.stackToProjectY(newZs, newYs, newXs);
        const newZp = activeStackViewer.primaryStack.stackToProjectZ(newZs, newYs, newXs);

        const nodeInfo = [
          activeNode.id,
          newXp,
          newYp,
          newZp
        ];

        const treenodesToUpdate = [];
        const connectorsToUpdate = [];

        if (activeNode.type === SkeletonAnnotations.TYPE_NODE) {
          treenodesToUpdate.push(nodeInfo);
        } else {
          connectorsToUpdate.push(nodeInfo);
        }

        const command = new CATMAID.UpdateNodesCommand(
          tracingOverlay.state, project.id, treenodesToUpdate, connectorsToUpdate
        );

        return CATMAID.commands.execute(command)
          .then(function() {
            tracingOverlay.moveTo(
              newZp,
              newYp,
              newXp
            );
          })
          .catch(CATMAID.handleError);
      };
    };

    this.addAction(new CATMAID.Action({
      helpText: "With <kbd>Alt</kbd> held, move selected node up in Z",
      keyShortcuts: {',': ['Alt + ,']},
      run: createNodeZMover(-1)
    }));

    this.addAction(new CATMAID.Action({
      helpText: "With <kbd>Alt</kbd> held, move selected node down in Z",
      keyShortcuts: {'.': ['Alt + .']},
      run: createNodeZMover(1)
    }));

    var keyToAction = CATMAID.getKeyToActionMap(actions);

    /**
     * This function should return true if there was any action linked to the key
     * code, or false otherwise.
     */
    this.handleKeyPress = function(e) {
      var result = false;
      var keyAction = CATMAID.UI.getMappedKeyAction(keyToAction, e);
      if (keyAction) {
        if (activeTracingLayer) {
          activeTracingLayer.tracingOverlay.ensureFocused();
          result = keyAction.run(e);
        } else {
          CATMAID.warn("Tracing layer not yet loaded, ignoring key short cut");
        }
      }
      if (!result) {
        result = this.prototype.handleKeyPress(e);
      }
      return result;
    };

    this.getUndoHelp = function(e) {
      var result = '<p>The following actions can be undone by pressing <kbd>Ctrl</kbd> + <kbd>Z</kbd> or opening the command history:</p><ul>';
      result += "<li>Add/insert/move/remove nodes and edit their radius, confidence</li>";
      result += "<li>Add/remove connectors, edit their confidence as well as links to/from them</li>";
      result += "<li>Add/remove/edit annotations, tags</li>";
      result += "<li>Change neuron name</li>";
      result += "</ul>";
      return result;
    };

    this.getMouseHelp = function(e) {
      var result = self.prototype.getMouseHelp();
      result += '<ul>';
      result += '<li><strong>Click on a node:</strong> make that node active</li>';
      result += '<li><strong>Click in space:</strong> create a new node. Create presynaptic node with active connector.</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+click in space:</strong> deselect the active node</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click on a node:</strong> delete that node</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click on an edge:</strong> split skeleton at this location</li>';
      result += '<li><strong><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click on an arrow:</strong> delete that link</li>';
      result += '<li><strong><kbd>Shift</kbd>+click in space:</strong> create a synapse with the active treenode being presynaptic.</li>';
      result += '<li><strong><kbd>Shift</kbd>+<kbd>Alt</kbd>+click in space:</strong> create a synapse with the active treenode as postsynaptic. Create presynaptic node with an active connector.</li>';
      result += '<li><strong><kbd>Shift</kbd>+click in space:</strong> create a post-synaptic node (if there was an active connector)</li>';
      result += '<li><strong><kbd>Shift</kbd>+click on a treenode:</strong> join two skeletons (if there was an active treenode)</li>';
      result += '<li><strong><kbd>Alt</kbd>+<kbd>Ctrl</kbd>+click in space:</strong> adds a node along the nearest edge of the active skeleton</li>';
      result += '</ul>';
      return result;
    };

    this.redraw = function() {
      self.prototype.redraw();
    };

    this.init = function() {
      // Make sure all required initial data is available.
      return  CATMAID.fetch(project.id + '/tracing/setup/validate')
        .then(function() {
          // Initialize a tracing layer in all available stack viewers, but let
          // register() take care of bindings.
          project.getStackViewers().forEach(function(s) {
            var layer = prepareAndUpdateStackViewer(s);
          }, this);
        });
    };

    // Listen to creation and removal of new stack views in current project.
    project.on(CATMAID.Project.EVENT_STACKVIEW_ADDED, prepareAndUpdateStackViewer, this);
    project.on(CATMAID.Project.EVENT_STACKVIEW_CLOSED, closeStackViewer, this);

    // Listen to active node change events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        handleActiveNodeChange, this);

    // If the interation mode changes, update the UI
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_INTERACTION_MODE_CHANGED,
        this.handleChangedInteractionMode, this);
  }

  /**
   * Update tracing tool mode button selection state.
   */
  TracingTool.prototype.handleChangedInteractionMode = function(newMode, oldMode) {
    // Deselect all mode buttons
    document.getElementById("trace_button_move").className = "button";
    document.getElementById("trace_button_skeleton").className = "button";
    document.getElementById("trace_button_synapse").className = "button";

    // Activate button for new mode
    switch (newMode) {
      case SkeletonAnnotations.MODES.MOVE:
        document.getElementById("trace_button_move").className = "button_active";
        break;
      case SkeletonAnnotations.MODES.SKELETON:
        document.getElementById("trace_button_skeleton").className = "button_active";
        break;
      case SkeletonAnnotations.MODES.SYNAPSE:
        document.getElementById("trace_button_synapse").className = "button_active";
        break;
    }
  };

  /**
   * Refresh various caches, like the annotation cache.
   */
  TracingTool.prototype.refreshCaches = function() {
    return Promise.all([
      CATMAID.annotations.update(true),
      CATMAID.NeuronNameService.getInstance().refresh(),
      SkeletonAnnotations.VisibilityGroups.refresh(),
      SkeletonAnnotations.FastMergeMode.refresh()
    ]);
  };

  /**
   * Clear a potentially running auto cache update timeout and create a new one
   * if an update interval is set.
   */
  TracingTool.prototype.refreshAutoCacheUpdate = function() {
    if (this.autoCacheUpdateTimeout) {
      window.clearInterval(this.autoCacheUpdateInterval);
    }

    if (this.autoCacheUpdateIntervalLength) {
      this.autoCacheUpdateInterval= window.setInterval(
          this.refreshCaches.bind(this), this.autoCacheUpdateIntervalLength);
    }
  };

  /**
   * Measure the distance between the active node and a second node.
   */
  TracingTool.prototype.measureNodeDistance = function() {
    let firstNodeId = SkeletonAnnotations.getActiveNodeId();
    let skeletonId = SkeletonAnnotations.getActiveSkeletonId();
    if (!firstNodeId) {
      CATMAID.warn("Please select first node");
      return;
    }

    let secondNodeId = null;

    let getNode = new Promise(function(resolve, reject) {
      var dialog = new CATMAID.OptionsDialog("Select node", {
        'Use active node': function() {
          secondNodeId = SkeletonAnnotations.getActiveNodeId();
          if (!secondNodeId) {
            throw new CATMAID.Warning("No node selected");
          }

          if (firstNodeId === secondNodeId) {
            throw new CATMAID.Warning("Please select a node different from the first one");
          }

          let activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();

          if (skeletonId !== activeSkeletonId) {
            throw new CATMAID.Warning("The second node isn't part of the same skeleton");
          }

          let arborTransform;
          let firstIsVirtual = !SkeletonAnnotations.isRealNode(firstNodeId);
          let secondIsVirtual = !SkeletonAnnotations.isRealNode(secondNodeId);
          if (firstIsVirtual || secondIsVirtual) {
            // If we deal with virtual nodes, insert the virtual node into the
            // arbor parser to get the exact distance.
            arborTransform = function(arborParser) {
              if (firstIsVirtual) {
                let vnComponents = SkeletonAnnotations.getVirtualNodeComponents(firstNodeId);
                let parentId = SkeletonAnnotations.getParentOfVirtualNode(firstNodeId, vnComponents);
                let childId = SkeletonAnnotations.getChildOfVirtualNode(firstNodeId, vnComponents);
                let vnX = Number(SkeletonAnnotations.getXOfVirtualNode(firstNodeId, vnComponents));
                let vnY = Number(SkeletonAnnotations.getYOfVirtualNode(firstNodeId, vnComponents));
                let vnZ = Number(SkeletonAnnotations.getZOfVirtualNode(firstNodeId, vnComponents));
                arborParser.positions[firstNodeId] = new THREE.Vector3(vnX, vnY, vnZ);
                arborParser.arbor.edges[firstNodeId] = parentId;
                arborParser.arbor.edges[childId] = firstNodeId;
              }
              if (secondIsVirtual) {
                let vnComponents = SkeletonAnnotations.getVirtualNodeComponents(secondNodeId);
                let parentId = SkeletonAnnotations.getParentOfVirtualNode(secondNodeId, vnComponents);
                let childId = SkeletonAnnotations.getChildOfVirtualNode(secondNodeId, vnComponents);
                let vnX = Number(SkeletonAnnotations.getXOfVirtualNode(secondNodeId, vnComponents));
                let vnY = Number(SkeletonAnnotations.getYOfVirtualNode(secondNodeId, vnComponents));
                let vnZ = Number(SkeletonAnnotations.getZOfVirtualNode(secondNodeId, vnComponents));
                arborParser.positions[secondNodeId] = new THREE.Vector3(vnX, vnY, vnZ);
                arborParser.arbor.edges[secondNodeId] = parentId;
                arborParser.arbor.edges[childId] = firstNodeId;
              }
            };
          }

          resolve(CATMAID.Skeletons.distanceBetweenNodes(project.id, skeletonId,
              firstNodeId, secondNodeId, arborTransform));
        }
      });
      dialog.appendMessage("Please select a second node on the same skeleton!");
      dialog.show('auto', 'auto', false);
    });

    getNode.then(function(length) {
        var dialog = new CATMAID.OptionsDialog("Node distance", {
          'Close': function() {},
        });
        dialog.appendMessage("The distance between node " +
            firstNodeId + " and " + secondNodeId + " on skeleton " +
            skeletonId + " is:");
        dialog.appendMessage(Math.round(length) + " nm");
        dialog.show(500, 'auto', false);
      })
      .catch(CATMAID.handleError);
  };

  TracingTool.prototype.getContextHelp = function() {
    return [
      '<h1>Tracing tool</h1>',
      '<p>The Tracing Tool provides access to many tools related ',
      'to neuron reconstruction and circuit analysis. The widgets ',
      'displayed in the third batch of icons in the top bar are only ',
      'a sub-set of the most common tools. More widgets can be opened ',
      'using the <em>Open Widget Dialog</em>, accessible through ',
      '<kbd>Ctrl</kbd> + <kbd>Space</em> or the first icon in the top tool ',
      'bar. </p>',
      '<p>The first three icons in the second toolbar select the interaction ',
      'mode, which by default is tracing (first icon). Each click with the <em>',
      'Left Mouse Button</em> (LMB) will create a new skeleton node or cause an ',
      'other action, depending on the pressed modifiers (See Help <kbd>F1</kbd>). ',
      'The second interaction mode is called <em>Synapse Dropping Mode</em>, in ',
      'which each <em>LMB</em> click will create a new synapse. The last ',
      'interaction mode is <em>Navigation Mode</em>, in which both LMB and RMB ',
      'drag events cause planar movement.</p>',
      '<h1>Navigation</h1>',
      '<p>The <em>Right Mouse Button</em> (RMB) can be used to move in the plane ',
      '(pan) as well as the <em>Arrow Keys</em>. The coordinates of the current ',
      'location in <em>stack space</em> are displayed in the <em>X</em> and ',
      '<em>Y</em> input boxes in the second tool bar. This two sliders in the ',
      'toolbar allow to change <em>Z</em> and the <em>Zoom Level</em>. The ',
      'lower right corner displays the current location in both <em>stack space</em> ',
      'and <em>physical space</em> in the status bar.</p>',
      '<h1>Neuron handling</h1>',
      '<p>The Tracing Tool will add a <em>Tracing Layer</em> to all open Stack ',
      'Viewers. In skeletons consisting of "treenodes" and edges model neurons in ',
      'the underlying image data. New nodes can be created by clicking the LMB or ',
      'by using the <kbd>Z</kbd> key. Synapses can be created using <kbd>Shift</kbd> ',
      '+ LMB. These actions can be undone using <kbd>Ctrl</kbd> + <kbd>Z</kbd></p>. ',
      '<p>Generally, nodes can be selected either by clicking or by selecting the node ',
      'closest to the mouse cursor using the <kbd>G</kbd> key. This is especially ',
      'useful in Navigation Mode.</p>'
    ].join('');
  };

  /**
   * Move to and select a node in the specified neuron or skeleton nearest
   * the current project position.
   *
   * @param  {string} type       A 'neuron' or a 'skeleton'.
   * @param  {number} objectID   The ID of a neuron or a skeleton.
   * @return {Promise}           A promise succeeding after the move and select.
   */
  TracingTool.goToNearestInNeuronOrSkeleton = function(type, objectID) {
    var projectCoordinates = project.focusedStackViewer.projectCoordinates();
    return CATMAID.Nodes.nearestNode(project.id, projectCoordinates.x,
        projectCoordinates.y, projectCoordinates.z, objectID, type)
      .then(function (data) {
        var nodeIDToSelect = data.treenode_id;
        return SkeletonAnnotations.staticMoveTo(data.z, data.y, data.x)
            .then(function () {
              return SkeletonAnnotations.staticSelectNode(nodeIDToSelect);
            });
      })
      .catch(function () {
        CATMAID.warn('Going to ' + type + ' ' + objectID + ' failed. ' +
                     'The ' + type + ' may no longer exist.');
      });
  };

  /**
   * Actions available for the tracing tool.
   */
  TracingTool.actions = [

    new CATMAID.Action({
      helpText: "Review Widget: Review existing skeletons",
      buttonID: "data_button_review",
      buttonName: 'table_review',
      run: function (e) {
        WindowMaker.show('review-widget');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Notifications: Accept or reject action requests by other users",
      buttonID: "data_button_notifications",
      buttonName: 'table_notifications',
      run: function (e) {
        WindowMaker.create('notifications');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Connectivity Widget: List all connected partners to one or more skeletons",
      buttonID: "data_button_connectivity",
      buttonName: 'table_connectivity',
      run: function (e) {
        WindowMaker.create('connectivity-widget');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Connectivity Matrix: Quantify connections between skeletons",
      buttonID: "data_button_connectivity_matrix",
      buttonName: 'adj_matrix',
      run: function (e) {
        WindowMaker.create('connectivity-matrix');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Graph Widget: Work with graph representation of connectivity between skeletons",
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
      helpText: "Morphology Plot: Plot skeleton properties over distance from root node",
      buttonID: "data_button_morphology_plot",
      buttonName: 'morphology_plot',
      run: function (e) {
        WindowMaker.create('morphology-plot');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Tag Table: Find skeletons based on their tags",
      buttonID: "data_button_tag_table",
      buttonName: 'tag-table',
      run: function (e) {
        WindowMaker.create('tag-table');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Venn Diagram: Find overlap and difference between sets of skeletons",
      buttonID: "venn_diagram_button",
      buttonName: 'venn',
      run: function (e) {
        WindowMaker.create('venn-diagram');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Selection Table: Manage lists of skeletons",
      buttonID: "data_button_neuron_staging_area_widget",
      buttonName: 'neuron_staging',
      run: function (e) {
        WindowMaker.create('selection-table');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Global Search: Search on skeleton and neuron properties as well as labels",
      buttonID: "data_button_search",
      buttonName: 'search',
      run: function (e) {
        WindowMaker.show('search');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Neuron Navigator: View details and analytics of individual skeletons",
      buttonID: 'data_button_neuron_navigator',
      buttonName: 'neuron_navigator',
      run: function (e) {
        WindowMaker.create('neuron-navigator');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Neuron Search: Search for skeletons and annotations based on names, annotations, contributors and timestamps",
      buttonID: "data_button_query_neurons",
      buttonName: 'query_neurons',
      run: function (e) {
        WindowMaker.create('neuron-search');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "3D Viewer: 3D visualization of selected skeletons",
      buttonID: "view_3d_webgl_button",
      buttonName: '3d-view-webgl',
      run: function (e) {
        WindowMaker.create('3d-viewer');
      }
    }),

    new CATMAID.Action({
      helpText: "Project Statistics: Display user contribution statistics",
      buttonID: "data_button_stats",
      buttonName: 'stats',
      run: function (e) {
        WindowMaker.show('statistics');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Log Widget: Show record of user activity",
      buttonID: "data_button_table_log",
      buttonName: 'table_log',
      run: function (e) {
        WindowMaker.show( 'log-table' );
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Synapse Distribution Plot: Show synapse distribution with partners over distance from root node",
      buttonID: "data_button_synapse_plot",
      buttonName: 'synapse_plot',
      run: function (e) {
        WindowMaker.create('synapse-plot');
        return true;
      }
    }),

    new CATMAID.Action({
      helpText: "Synapse Fractions: Show fraction of inputs or outputs in percent",
      buttonID: "data_button_synapse_fractions",
      buttonName: 'synapse_fractions',
      run: function (e) {
        WindowMaker.create('synapse-fractions');
        return true;
      }
    }),

  ];

  // Make tracing tool in CATMAID namespace
  CATMAID.TracingTool = TracingTool;

  CATMAID.TracingTool.Settings = new CATMAID.Settings(
      'tracing-tool',
      {
        version: 0,
        entries: {
          invert_virtual_node_ignore_modifier: {
            default: false
          },
          show_node_labels: {
            default: false
          },
        },
        migrations: {}
      });

})(CATMAID);
