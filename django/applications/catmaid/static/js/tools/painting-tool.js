(function(CATMAID) {

  const actions = [];

  /**
    * Return a unique name for the painting layer of a given stack viewer.
    */
  var getPaintingLayerName = function(stackViewer) {
    return "PaintingLayer" + stackViewer.getId();
  };

  /**
    * Return a unique name for the data layer of a given stack viewer.
    */
  var getPaintingDataLayerName = function(stackViewer) {
    return "PaintingDataLayer" + stackViewer.getId();
  };

  /**
    * Clear the small bar next to the close button of the stack viewer window,
    * optionally with a replacement text.
    */
  function clearTopbars(text) {
    project.getStackViewers().forEach(function(stackViewer) {
      var label = $('#active-element' + stackViewer.getId());
      label.text(text || '');
      label.removeClass("local remote");
      //var labelData = label.data();
      //if (labelData) CATMAID.NeuronNameService.getInstance(labelData.api).unregister(labelData);
    });
  }

  /**
    * Set the text in the small bar next to the close button of each stack
    * viewer to the name of the skeleton as it is given by the nameservice.
    */
  function setActiveElemenTopBarText(projectId, segmentId, prefix, api) {
    if (!segmentId) {
      clearTopbars();
      return;
    }

    // Make sure we can refer to at least an empty prefix
    prefix = prefix || '';

    //let suffix = api ? ` | ${api.name}` : '';

    project.getStackViewers().forEach((stackViewer) => {
      let activeElementId = `active-element${stackViewer.getId()}`;
      let stackFrame = stackViewer.getWindow().getFrame();
      let label = $(`#${activeElementId}`, stackFrame);
      if (0 === label.length) return;

      // If a skeleton is selected, register with neuron name service.
      label.data('segment_id', segmentId);
      label.data('api', api);
      label.removeClass('remote local');
      label.addClass(api ? 'remote' : 'local');
    });
  }

  /**
    * Add the neuron name display and the painting layer to the given stack
    * viewer, if they don't exist already.
    */
  function prepareStackViewer(stackViewer) {
    var dataLayerName = getPaintingDataLayerName(stackViewer);
    var dataLayer = stackViewer.getLayer(dataLayerName);

    if (!dataLayer) {
      // Create a new pixi based N5 image block layer that uses a custom mirror.
      const isVisible = true;
      const showOverview = false;
      const changeMirrorIfNoData = false;
      const mirrorId = -1; // Custom mirror
      const dataLayer = new CATMAID.PixiImageBlockLayer(
          stackViewer,
          "Painting data",
          stackViewer.stack,
          mirrorId,
          isVisible,
          isVisible ? 0 : 1,
          showOverview,
          CATMAID.StackLayer.INTERPOLATION_MODES.INHERIT,
          changeMirrorIfNoData);
      stackViewer.addLayer(dataLayerName, dataLayer);

      var customMirrorData = {
        id: "custom-" + CATMAID.tools.uniqueId(),
        title: 'Painting data N5',
        position: -1,
        image_base: imageBase, // end with slash
        file_extension: 'n5',
        tile_width: 1024,
        tile_height: 1024,
        tile_source_type: 11, // N5 image blocks
      };

      stackViewer.stack.addMirror(customMirrorData);
      dataLayer.switchToMirror(customMirrorData.id);
      CATMAID.setLocalStorageItem(self.customMirrorStorageName,
          JSON.stringify(customMirrorData));

      // Update layer control UI to reflect settings changes.
      if (self.stackViewer && self.stackViewer.layerControl) {
        self.layerControl.refresh();
      }
    }

    var layerName = getPaintingLayerName(stackViewer);
    var layer = stackViewer.getLayer(layerName);

    if (!layer) {
      layer = new CATMAID.PaintingLayer(stackViewer, {
      });
      stackViewer.addLayer(layerName, layer);
    }

    // Insert a text div for the label name in the canvas window title bar
    let activeElementId = `active-element${stackViewer.getId()}`;
    let stackFrame = stackViewer.getWindow().getFrame();
    let activeElement = stackFrame.querySelector(`#${activeElementId}`);
    if (!activeElement) {
      activeElement = document.createElement("p");
      activeElement.id = activeElementId;
      activeElement.classList.add("active-element");
      var spanName = document.createElement("span");
      spanName.appendChild(document.createTextNode(""));
      activeElement.appendChild(spanName);
      stackFrame.appendChild(activeElement);
      setActiveElemenTopBarText();
    }

    return layer;
  }

  /**
   * Constructor for the painting tool.
   */
  function PaintingTool() {
    this.prototype = new CATMAID.Navigator();
    this.toolname = "paintingtool";

    // Currently focused painting layer
    var activePaintingLayer = null;
    // Currently focused N5 layer
    var activePaintingDataLayer = null;
    // Currently focused stack viewer
    var activeStackViewer = null;
    // Map stacks to its mouse handlers
    var bindings = new Map();
    // Information whether  drawing is currently happening
    var isDrawing = false;

    /**
     * Return the stack viewer referenced by the active node, or otherwise (if
     * unavailable) use the painting tool's active stack viewer.
     */
    this.getActiveNodeStackViewer = function() {
      return activeStackViewer;
    };

    /**
      * Display both project and stack space center coordinates in the status
      * bar. In case no active stack is available, only project coordinates are
      * visible.
      */
    var updateStatusBar = function(e) {
      CATMAID.statusBar.replaceLast("Project: " +
          project.coordinates.x.toFixed(3) + ", " +
          project.coordinates.y.toFixed(3) + ", " +
          project.coordinates.z.toFixed(3) +
          (activeStackViewer ? (" Stack: " +
            activeStackViewer.x.toFixed(3) + ", " +
            activeStackViewer.y.toFixed(3) + ", " +
            activeStackViewer.z.toFixed(3)) : ''));
      return true;
    };

    this.resize = function(width, height) {
      this.prototype.resize( width, height );
      return;
    };

    this.redraw = function() {
      this.prototype.redraw();
    };

    /**
     * Remove bindings for the given stack viewer from the prototype mouse
     * catcher. The bindings are stored in the bindings variable that is
     * available in the closure.
     */
    this.inactivateBindings = function(stackViewer) {
      var handlers = bindings.get(stackViewer);
      var c = this.prototype.mouseCatcher;
      for (var fn in handlers) {
        c.removeEventListener(fn, handlers[fn]);
      }
    };

    /**
     * Remove the neuron name display and the tacing layer from a stack view.
     */
    function closeStackViewer(stackViewer) {
      // Unregister the neuron name label from the neuron name service and
      // remove it.
      var label = $('#active-element' + stackViewer.getId());
      label.remove();

      // Remove the painting layer
      var layerName = getPaintingLayerName(stackViewer);
      var layer = stackViewer.getLayer(layerName);
      if (layer) {
        // Remove layer from stack viewer. This will also unregister it and
        // destroy the painting overlay.
        stackViewer.removeLayer(layerName);
      }

      // Remove the painting layer
      var dataLayerName = getPaintingDataLayerName(stackViewer);
      var dataLayer = stackViewer.getLayer(dataLayerName);
      if (dataLayer) {
        // Remove layer from stack viewer. This will also unregister it and
        // destroy the painting overlay.
        stackViewer.removeLayer(dataLayerName);
      }
    }

    /**
     * Replace bindings of the mouse catcher with the stored bindings for the
     * given stack viewer.
     */
    this.activateBindings = function(stackViewer, layer) {
      var c = this.prototype.mouseCatcher;
      // Make sure the parent navigator doesn't handle clicks.
      var view = layer.view;
      var proto_onpointerdown = this.prototype._onpointerdown;
      view.removeEventListener('pointerdown', proto_onpointerdown);
      c.removeEventListener('pointerdown', proto_onpointerdown);

      var handlers = bindings.get(stackViewer);
      for (var fn in handlers) {
        c.addEventListener(fn, handlers[fn]);
      }
    };

    /**
      * Create new mouse bindings for the layer's view.
      */
    this.createPointerBindings = function (stackViewer, layer, mouseCatcher) {
      // A handle to a delayed update
      var updateTimeout;

      // Remove navigator's pointer down handling and replace it with our own.
      var proto_onpointerdown = this.prototype._onpointerdown;
      mouseCatcher.removeEventListener('pointerdown', proto_onpointerdown);

      var [mouseX, mouseY] = [0, 0];
      const context = activePaintingLayer.context;
      const boundings = activePaintingLayer.view.getBoundingClientRect();

      var overlayBindings = {
        pointerdown: function( e ) {
          mouseX = e.clientX - boundings.left;
          mouseY = e.clientY - boundings.top;

          var mouseButton = CATMAID.ui.getMouseButton(e);
          // Left mouse click will delegate to painting overlay
          var fallback = false;
          if (mouseButton === 1) {
            if (SkeletonAnnotations.currentmode === SkeletonAnnotations.MODES.MOVE) {
              fallback = true;
            } else {
              isDrawing = true;

              // Start drawing
              context.beginPath();
              context.moveTo(mouseX, mouseY);
            }
          }

          // Right mouse button and middle mouse button will pan view. And soma
          // will the left mouse button if the painting overlay returned false.
          if (mouseButton === 2 || mouseButton === 3 || fallback) {
            fallback = false;

            /*
            // Put all painting layers in "don't update" mode during move,
            // optionally except the active layer
            setTracingLayersSuspended(true, layer.updateWhilePanning);

            // Attach to the node limit hit event to disable node updates
            // temporary if the limit was hit. This allows for smoother panning
            // when many nodes are visible.
            layer.tracingOverlay.on(layer.tracingOverlay.EVENT_HIT_NODE_DISPLAY_LIMIT,
                disableLayerUpdate, layer);
            */

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
                /*
                layer.tracingOverlay.off(layer.tracingOverlay.EVENT_HIT_NODE_DISPLAY_LIMIT,
                    disableLayerUpdate, layer);
                if (layer.tracingOverlay.suspended) {
                  // Wait a second before updating the view, just in case the user
                  // continues to pan to not hit the node limit again. Then make
                  // sure the next update is not stopped.
                  updateTimeout = setTimeout(function() {
                    // Wake painting overlays up again
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
                */
              });
          }

          // If fallback has been set to true, delegate to prototype.
          if (fallback) {
            proto_onpointerdown( e );
          }
        },
        pointermove: function (event) {
          mouseX = event.clientX - boundings.left;
          mouseY = event.clientY - boundings.top;

          if (isDrawing){
            context.lineTo(mouseX, mouseY);
            context.stroke();
          }
        },
        pointerup: function (event) {
          mouseX = event.clientX - boundings.left;
          mouseY = event.clientY - boundings.top;

          isDrawing = false;
        },
      };

      // Assign bindings to view
      var view = layer.view;
      for (var fn in overlayBindings) {
        view.addEventListener(fn, overlayBindings[fn]);
      }

      bindings.set(stackViewer, overlayBindings);
    };

    /**
     * Iterate all painting layers in the active stack viewer and set the first
     * one as active stack layer that contains the active node, including its
     * API.
     */
    this.setActivePaintingLayer = function (forceBindingUpdate) {
      if (!activeStackViewer) return;

      // Get all painting layers, the top one first.
      let paintingLayers = activeStackViewer.getLayersOfType(CATMAID.PaintingLayer);
      paintingLayers.reverse();
      let activeLayer;

      if (paintingLayers.length === 0) return;
      if (paintingLayers.length === 1) {
        activeLayer = paintingLayers[0];
        if (activePaintingLayer !== paintingLayers[0] || forceBindingUpdate) {
          activePaintingLayer = activeLayer;
          this.inactivateBindings(activeStackViewer);
          this.activateBindings(activeStackViewer, activeLayer);
        }

        return activeLayer;
      }

      /*
      let activeNodeId = SkeletonAnnotations.getActiveNodeId();
      if (activeNodeId !== undefined) {
        let api = SkeletonAnnotations.getActiveSkeletonAPI();

        for (let layer of tracingLayers) {
          layer.tracingOverlay.updateCursor();
          if (CATMAID.API.equals(layer.tracingOverlay.api, api) &&
              layer.tracingOverlay.nodes.has(activeNodeId)) {
            activeLayer = layer;
            break;
          }
        }
      }
      */

      if (!activeLayer) {
        activeLayer = paintingLayers[0];
      }

      if (activePaintingLayer !== activeLayer || forceBindingUpdate) {
        activePaintingLayer = activeLayer;
        this.inactivateBindings(activeStackViewer);
        this.activateBindings(activeStackViewer, activeLayer);
      }

      return activeLayer;
    };

    /**
     * Create quick-access buttons for tools associated with painting.
     */
    this.setupSubTools = function() {
      var box;
      if ( this.prototype.stackViewer === null ) {
        box = CATMAID.createButtonsFromActions(
          actions,
          "paintingbuttons",
          "paint_", 'toolbar_item');
        $( "#toolbar_nav" ).prepend( box );

      }
    };

    /**
     * install this tool in a stack viewer.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer ) {
      this.setupSubTools();

      if (parentStackViewer) {
        // Get or create the painting layer for this stack viewer
        var [paintingLayer, dataLayer] = prepareStackViewer(parentStackViewer);
        activePaintingLayer = paintingLayer;
        activePaintingDataLayer = dataLayer;

        // Set this layer as mouse catcher in Navigator
        var view = layer.view;
        this.prototype.setMouseCatcher(view);
      }

      // Register stack viewer with prototype, after the mouse catcher has been set.
      // This attaches pointer handlers to the view.
      this.prototype.register(parentStackViewer, "edit_button_paint");

      if (parentStackViewer) {
        activeStackViewer = parentStackViewer;
        // The active painting layer however is whichever contains the active node
        // and its API.
        this.setActivePaintingLayer(true);

        // Try to get existing pointer bindings for this layer
        if (!bindings.has(parentStackViewer)) {
          this.createPointerBindings(parentStackViewer, layer, view);
        }
      }
    };

    /**
     * unregister all stack viewer related mouse and keyboard controls
     */
    this.unregister = function() {
      // do it before calling the prototype destroy that sets stack viewer to null
      if (this.prototype.stackViewer) {
        this.inactivateBindings(this.prototype.stackViewer);
      }
      // Do NOT unregister: would remove the mouseCatcher layer
      // and the annotations would disappear
      //this.prototype.unregister();
      return;
    };

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons). Note that a
     * call of this function doesn't imply the destruction of the current
     * project.
     */
    this.destroy = function() {
      project.getStackViewers().forEach(function(stackViewer) {
        closeStackViewer(stackViewer);
      });

      this.prototype.destroy( "edit_button_paint" );
      $( "#paintingbuttons" ).remove();

      // Remove all stored bindings
      bindings.forEach(function(value, key, map) {
        map.delete(key);
      });

      // Forget the current stack viewer
      activeStackViewer = null;

      this.autoCacheUpdate = false;
      if (this.autoCacheUpdateInterval) {
        window.clearInterval(this.autoCacheUpdateInterval);
        this.autoCacheUpdateInterval = null;
      }
    };
  }

  CATMAID.PaintingTool = PaintingTool;

  CATMAID.PaintingTool.Settings = new CATMAID.Settings(
      'painting-tool',
      {
        version: 0,
        entries: {
          dtype: {
            default: 'uint8'
          },
          value: {
            default: 1
          },
          brush_size: {
            default: 5
          },
          color: {
            default: 'red'
          },
        },
        migrations: {}
      });

})(CATMAID);
