(function(CATMAID) {

  "use strict";

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
   * Constructor for the painting tool.
   */
  function PaintingTool() {
    this.prototype = new CATMAID.Navigator();
    this.toolname = "paintingtool";

    // Currently selected mode;
    let currentMode = PaintingTool.MODES.MOVE;
    // Currently focused painting layer
    let activePaintingLayer = null;
    // Currently focused N5 layer
    let activePaintingDataLayer = null;
    // Currently focused stack viewer
    let activeStackViewer = null;
    // Currently active writable stack
    let activeWritableStack = null;
    // Map stacks to its mouse handlers
    let bindings = new Map();
    // Information whether  drawing is currently happening
    let isDrawing = false;
    // All currently available writable stacks for the active stack viewer.
    let writableStacks = new Map();

    const actions = [];

    // A drop down for export format options
    let writableStackOptions = [];
    function updateWritableStackOptions() {
      writableStackOptions = writableStacks.values().map(ws => {
        return {
          'title': ws.name,
          'value': ws.id,
        };
      }).toArray();
    }
    updateWritableStackOptions();

    const createWritableStackSelect = () => {
      let stackOptions = [{
          'title': '(none)',
          'value': -1
        }].concat(writableStackOptions);
      let selectedOption = activeWritableStack;
      if (!stackOptions || stackOptions.length === 0) {
        selectedOption = -1;
      }
      return CATMAID.DOM.createSelectElement('Painting layer', stackOptions,
        "Select one of the available writable stacks for the current primary stack as painting layer.", selectedOption, (event) => {
          let num = Number(event.srcElement.value);
          if (!Number.isNaN(num)) {
            this.activateWritableStack(num < 0 ? null : num);
          }
        });
    };
    let writableStackSelect;

    /**
     * Replaces any existing display of a writable tack with the one passed in.
     */
    this.activateWritableStack = function(writableStackId) {
      if (activeWritableStack === writableStackId) {
        return;
      }

      if (activeStackViewer) {
        removePaintingLayers(activeStackViewer);
      }

      activeWritableStack = writableStackId;
      // TODO: There should be a simpler way than to re-register
      // this.refreshPaintingLayer();
      // <binding update>
      this.register(activeStackViewer);
    };

    this.getActions = function () {
      return actions;
    };

    this.addAction = function (action) {
      actions.push( action );
    };

    this.addAction(new CATMAID.Action({
      helpText: "Switch to navigation mode",
      buttonName: "move",
      buttonID: 'paint_button_move',
      run: () => {
        this.setInteractionMode(PaintingTool.MODES.MOVE, true);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Switch to painting mode",
      buttonName: "paint",
      buttonID: 'paint_button_paint',
      run: () => {
        this.setInteractionMode(PaintingTool.MODES.PAINT, true);
        return true;
      }
    }));

    this.addAction(new CATMAID.Action({
      helpText: "Add a new painting layer to the current stack",
      keyShortcuts: { "N": [ "n" ] },
      buttonName: "new_writable_stack",
      buttonID: "paint_button_new_writable_stack",
      run: e => {
        if (!CATMAID.mayView())
          return false;
        this.addWritableStack();
        return true;
      }
    }));


    /**
     * Set current interaction mode in tool, whether to paint or to move.
     */
    this.setInteractionMode = function(mode, toggle = false) {
      let oldMode = currentMode;

      if (toggle && currentMode === mode) {
        currentMode = PaintingTool.MODES.SELECT;
      } else {
        switch (mode) {
          case PaintingTool.MODES.MOVE:
            currentMode = mode;
            break;
          case PaintingTool.MODES.PAINT:
            currentMode = mode;
            break;
        }
      }

      if (oldMode !== currentMode) {
        this.trigger(
            PaintingTool.EVENT_INTERACTION_MODE_CHANGED, currentMode, oldMode);
      }
    };

    /**
     * Add a new writable stack to the current primary stack.
     */
    this.addWritableStack = function() {
      const dialog = new CATMAID.OptionsDialog("Add writable stack");
      dialog.appendMessage("Please specify the details of the new writable stack. All user created data will be stored in a server-side N5 file.");
      const nameField = dialog.appendField('Name', 'new-writable-stack-name', `Writable stack #${writableStacks.size + 1}`);
      dialog.onOK = () => {
        CATMAID.WritableStack.create(project.id, activeStackViewer.primaryStack.id, nameField.value, 'n5')
          .then(writableStack => {
            writableStacks.set(writableStack.id, {
              'id': writableStack.id,
              'user_id': writableStack.user_id,
              'stack_id': writableStack.stack_id,
              'name': writableStack.name,
              'path': writableStack.path,
              'filetype': writableStack.filetype,
              'metadata': writableStack.metadata,
            });
            // TODO: Trigger UI update of toolbar
            this.refreshToolbar();
          })
          .catch(CATMAID.handleError);
      };

      dialog.show(400, 'auto');
    };

    /**
      * Add the neuron name display and the painting layer to the given stack
      * viewer, if they don't exist already.
      */
    function prepareStackViewer(stackViewer, tool) {
      removePaintingLayers(stackViewer);

      var dataLayerName = getPaintingDataLayerName(stackViewer);
      var dataLayer = stackViewer.getLayer(dataLayerName);
      const ws = writableStacks.get(activeWritableStack);

      if (!activeWritableStack || !ws) {
        return [null, null];
      }

      if (!dataLayer) {
        // Create a new pixi based N5 image block layer that uses a custom mirror.
        const isVisible = true;
        const showOverview = false;
        const changeMirrorIfNoData = false;
        const stack = stackViewer.primaryStack;

        const writable_stack_dir = 'files/writable_stacks';
        const dataSetUrl = CATMAID.tools.urlJoinAll([
            CATMAID.getAbsoluteURL(),
            writable_stack_dir,
            ws.path,
            ws.metadata['dataset']
        ]);
        const imageBase = CATMAID.tools.urlJoin(dataSetUrl, '/%SCALE_DATASET%/0_1_2');

        var customMirrorData = {
          id: "custom-" + CATMAID.tools.uniqueId(),
          title: 'Painting data N5',
          position: -1,
          image_base: imageBase,
          file_extension: 'n5',
          tile_width: 1024,
          tile_height: 1024,
          tile_source_type: 11, // N5 image blocks
        };
        stack.addMirror(customMirrorData);

        dataLayer = new CATMAID.PixiImageBlockLayer(
            stackViewer,
            "Painting data",
            stackViewer.primaryStack,
            customMirrorData.id,
            isVisible,
            isVisible ? 0 : 1,
            showOverview,
            CATMAID.StackLayer.INTERPOLATION_MODES.INHERIT,
            changeMirrorIfNoData);

        stackViewer.addLayer(dataLayerName, dataLayer);

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
        layer = new CATMAID.PaintingLayer(stackViewer, tool, dataLayer);
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

      return [layer, dataLayer];
    }

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
      removePaintingLayers(stackViewer);
    }

    function removePaintingLayers(stackViewer) {
      // Remove the painting layer
      var layerName = getPaintingLayerName(stackViewer);
      var layer = stackViewer.getLayer(layerName);
      if (layer) {
        // Remove layer from stack viewer. This will also unregister it and
        // destroy the painting overlay.
        stackViewer.removeLayer(layerName);
      }
      activePaintingLayer = null;

      // Remove the painting data layer
      var dataLayerName = getPaintingDataLayerName(stackViewer);
      var dataLayer = stackViewer.getLayer(dataLayerName);
      if (dataLayer) {
        // Remove layer from stack viewer. This will also unregister it and
        // destroy the painting overlay.
        stackViewer.removeLayer(dataLayerName);
      }
      activePaintingDataLayer = null;
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
    this.createPointerBindings = function (stackViewer, layer, mouseCatcher = undefined) {
      // A handle to a delayed update
      var updateTimeout;

      // Remove navigator's pointer down handling and replace it with our own.
      var proto_onpointerdown = this.prototype._onpointerdown;
      if (mouseCatcher) {
        mouseCatcher.removeEventListener('pointerdown', proto_onpointerdown);
      }

      var [mouseX, mouseY] = [0, 0];
      var [prevMouseX, prevMouseY] = [0, 0];
      const boundings = activePaintingLayer.view.getBoundingClientRect();

      var overlayBindings = {
        pointerdown: function( e ) {
          mouseX = e.clientX - boundings.left;
          mouseY = e.clientY - boundings.top;
          prevMouseX = mouseX;
          prevMouseY = mouseY;

          var mouseButton = CATMAID.ui.getMouseButton(e);
          // Left mouse click will delegate to painting overlay
          var fallback = false;
          if (mouseButton === 1) {
            if (currentMode === PaintingTool.MODES.MOVE) {
              fallback = true;
            } else {
              isDrawing = true;
            }

            layer.paintAt(mouseX, mouseY, prevMouseX, prevMouseY);
          }

          // Right mouse button and middle mouse button will pan view. And so
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
          prevMouseX = mouseX;
          prevMouseY = mouseY;
          mouseX = event.clientX - boundings.left;
          mouseY = event.clientY - boundings.top;

          if (isDrawing){
            layer.paintAt(mouseX, mouseY, prevMouseX, prevMouseY);
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
           // Remove any existing bindings and re-add layer specific ones
          this.inactivateBindings(activeStackViewer);
          this.activateBindings(activeStackViewer, activeLayer);
        }

        return activeLayer;
      } else {
        CATMAID.error("More than one painting layer found");
      }

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
      if ( this.prototype.stackViewer === null ) {
        const box = CATMAID.createButtonsFromActions(
          actions,
          "paintingbuttons",
          "paint_", 'toolbar_item');
        $( "#toolbar_nav" ).prepend( box );
      }
      this.refreshToolbar();
    };

    this.refreshToolbar = function() {
      updateWritableStackOptions();

      let existingContainer = document.getElementById('paintingbuttons_extra');
      if (existingContainer) {
        existingContainer.parentElement.removeChild(existingContainer);
      }
      writableStackSelect = createWritableStackSelect();

      const selectContainer = document.createElement('div');
      selectContainer.classList.add('box');
      selectContainer.id = 'paintingbuttons_extra';
      const selectLayouter = selectContainer.appendChild(document.createElement('p'));
      selectLayouter.appendChild(writableStackSelect);

      const buttonContainer = document.getElementById('paintingbuttons');
      buttonContainer.insertAdjacentElement('afterend', selectContainer);

      this.updateInteractionModeSelection();
    };

    this.refreshPaintingLayer = function() {
      if (activeStackViewer) {
        // Get or create the painting layer for this stack viewer
        var [paintingLayer, dataLayer] = prepareStackViewer(activeStackViewer, this);
        activePaintingLayer = paintingLayer;
        activePaintingDataLayer = dataLayer;
      }
    };

    /**
     * install this tool in a stack viewer.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer ) {
      activeStackViewer = parentStackViewer;

      this.setupSubTools();

      // General UI updates
      var button = document.getElementById("edit_button_paint");
      if (button) button.className = "button_active";

      var toolbar = document.getElementById( "toolbar_nav" );
      if (toolbar) {
        toolbar.style.display = "";
      }

      // Get list of writable stacks for current user
      return CATMAID.WritableStack.list(project.id)
        .then(writable_stacks => {
          writableStacks = new Map(writable_stacks.map(ws => [ws.id, ws]));

          // Update tool UI for stack selection and layer display
          this.refreshToolbar();
          this.refreshPaintingLayer();

          if (activeStackViewer) {
            if (activePaintingLayer) {
              // Set this layer as mouse catcher in Navigator
              this.prototype.setMouseCatcher(activePaintingLayer.view);
            } else {
              this.prototype.resetMouseCatcher();
            }
          }

          // Register stack viewer with prototype, after the mouse catcher has been set.
          // This attaches pointer handlers to the view.
          this.prototype.register(parentStackViewer, "edit_button_paint");

          if (parentStackViewer) {
            // Create pointer bindings for this layer, if they don't exist already.
            if (!bindings.has(parentStackViewer) && activePaintingLayer) {
              this.createPointerBindings(parentStackViewer, activePaintingLayer);
            }

            // The active painting layer however is whichever contains the active node
            // and its API.
            this.setActivePaintingLayer(true);
          }
        })
        .catch(CATMAID.handleError);
    };

    /**
     * Unregister all stack viewer related mouse and keyboard controls. Do NOT
     * unregister with prototype, because it would remove the mouseCatcher layer
     * and the annotations would disappear
     *
     * Do this before calling the prototype destroy that sets stack viewer to
     * null.
     */
    this.unregister = function() {
      if (this.prototype.stackViewer) {
        this.inactivateBindings(this.prototype.stackViewer);
      }
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

      this.off(PaintingTool.EVENT_INTERACTION_MODE_CHANGED,
          this.updateInteractionModeSelection, this);
    };

    /**
    * Update painting tool mode button selection state.
    */
    PaintingTool.prototype.updateInteractionModeSelection = function() {
      // Deselect all mode buttons
      document.getElementById("paint_button_move").className = "button";
      document.getElementById("paint_button_paint").className = "button";

      // Activate button for new mode
      switch (currentMode) {
        case PaintingTool.MODES.MOVE:
          document.getElementById("paint_button_move").className = "button_active";
          break;
        case PaintingTool.MODES.PAINT:
          document.getElementById("paint_button_paint").className = "button_active";
          break;
      }
    };

    // If the interation mode changes, update the UI
    this.on(PaintingTool.EVENT_INTERACTION_MODE_CHANGED,
        this.updateInteractionModeSelection, this);
  }

  PaintingTool.MODES = Object.freeze({
    SELECT: 0,
    MOVE: 1,
    PAINT: 2,
  });

  PaintingTool.Settings = new CATMAID.Settings(
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

  PaintingTool.EVENT_INTERACTION_MODE_CHANGED = "painting_tool_interaction_mode_changed";
  CATMAID.asEventSource(PaintingTool.prototype);

  CATMAID.PaintingTool = PaintingTool;

})(CATMAID);
