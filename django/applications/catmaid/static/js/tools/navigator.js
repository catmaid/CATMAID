/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * navigator.js
 *
 * requirements:
 *   tools.js
 *   slider.js
 *   stackViewer.js
 */

(function(CATMAID) {

  /**
   * Navigator tool.  Moves the stack around
   */
  function Navigator()
  {
    var self = this;
    this.stackViewer = null;
    this.toolname = "navigator";

    var sliders_box = document.getElementById( "sliders_box" );
    this.input_x = document.getElementById( "x" );    //!< x_input
    this.input_y = document.getElementById( "y" );    //!< y_input

    /* remove all existing dimension sliders */
    while ( sliders_box.firstChild )
      sliders_box.removeChild( sliders_box.firstChild );

    this.slider_z = new CATMAID.Slider(
        CATMAID.Slider.HORIZONTAL,
        true,
        1,
        388,
        388,
        1,
        function( val ){ CATMAID.statusBar.replaceLast( "z: " + val ); return; },
        undefined,
        undefined,
        undefined,
        this.validateZ.bind(this));

    this.slider_s = new CATMAID.Slider(
        CATMAID.Slider.HORIZONTAL,
        true,
        undefined,
        undefined,
        new Array(
          8,
          4,
          2,
          1,
          0 ),
        8,
        function( val ){ CATMAID.statusBar.replaceLast( "s: " + val ); },
        undefined,
        false,
        0.05 );

    var slider_z_box = document.createElement( "div" );
    slider_z_box.className = "box";
    slider_z_box.id = "slider_z_box";
    var slider_z_box_label = document.createElement( "p" );
    slider_z_box_label.appendChild( document.createTextNode( "z-index" ) );
      slider_z_box.appendChild( slider_z_box_label );
    slider_z_box.appendChild( self.slider_z.getView() );
    slider_z_box.appendChild( self.slider_z.getInputView() );

    sliders_box.appendChild( slider_z_box );

    var slider_s_view = self.slider_s.getView();
    slider_s_view.id = "slider_s";
    document.getElementById( "slider_s" ).parentNode.replaceChild(
        slider_s_view,
        document.getElementById( "slider_s" ) );
    document.getElementById( "slider_s" ).parentNode.replaceChild(
        self.slider_s.getInputView(),
        slider_s_view.nextSibling );

    //! mouse catcher
    this.mouseCatcher = document.createElement( "div" );
    self.mouseCatcher.className = "sliceMouseCatcher";

    this.setMouseCatcher = function( mc )
    {
      self.mouseCatcher = mc;
    };

    this.updateControls = function()
    {
      if (self.stackViewer) {
        self.slider_s.setByValue( self.stackViewer.s, true );
        self.slider_z.setByValue( self.stackViewer.z, true );

        self.input_x.value = self.stackViewer.x;
        self.input_y.value = self.stackViewer.y;
      }
    };

    this.resize = function( width, height )
    {
      self.mouseCatcher.style.width = width + "px";
      self.mouseCatcher.style.height = height + "px";
    };

    this.redraw = function()
    {
      self.updateControls();
    };

    var onpointermove = function( e )
    {
      // We need to call the global UI handler explicitly, because we use
      // pointer events (rather than mouse events), which can only react to
      // move/down events on the event targets where start happened too. There
      // might be other listeners registered to the global UI instance, plus it
      // handles the global cursor location reference.
      CATMAID.ui.onpointermove( e );

      self.stackViewer.moveToPixel(
          self.stackViewer.z,
          self.stackViewer.y - CATMAID.ui.diffY / self.stackViewer.scale
                                / self.stackViewer.primaryStack.anisotropy(0).y,
          self.stackViewer.x - CATMAID.ui.diffX / self.stackViewer.scale
                                / self.stackViewer.primaryStack.anisotropy(0).x,
          self.stackViewer.s )
        .catch(CATMAID.handleError);

      return true;
    };

    var onpointerup = function( e )
    {
      self.mouseCatcher.style.cursor = 'auto';

      // We need to call the global UI handler explicitly, because we use
      // pointer events (rather than mouse events), which can only react to
      // move/down events on the event targets where start happened too. There
      // might be other listeners registered to the global UI instance, plus it
      // handles the global cursor location reference.
      CATMAID.ui.onpointerup( e );

      self.mouseCatcher.removeEventListener('pointerup', onpointerup);
      self.mouseCatcher.removeEventListener('pointermove', onpointermove);

      return false;
    };

    var onpointerdown = function( e )
    {
      if (!project.canMove()) {
        return;
      }

      self.mouseCatcher.style.cursor = 'move';

      // We need to call the global UI handler explicitly, because we use
      // pointer events (rather than mouse events), which can only react to
      // move/down events on the event targets where start happened too. There
      // might be other listeners registered to the global UI instance, plus it
      // handles the global cursor location reference.
      CATMAID.ui.onpointerdown( e );

      self.mouseCatcher.addEventListener('pointerup', onpointerup);
      self.mouseCatcher.addEventListener('pointermove', onpointermove);

      CATMAID.ui.catchFocus();

      return false;
    };
    this._onpointerdown = onpointerdown;

    var onmousewheel = function (e) {
      var w = CATMAID.ui.getMouseWheel( e );

      if (!w) return false;
      e.preventDefault();

      if (!Navigator.Settings.session.invert_mouse_wheel) w = -w;
      w /= Math.abs(w); // Normalize w to {-1, 1}.

      if (e.ctrlKey || e.metaKey) { // Zoom.
        self.slider_s.move(w, !e.shiftKey);
      } else { // Move sections.
        if (e.shiftKey) w *= Navigator.Settings.session.major_section_step;
        self.slider_z.move(w);
      }

      return true;
    };

    this.lastPointerCoordsP = {'x': 0, 'y': 0, 'z': 0};
    this.lastPointerCoordsS = {'x': 0, 'y': 0, 'z': 0};
    this._mousePosStatusUpdate = function(e) {
      let m = CATMAID.ui.getMouse(e, self.mouseCatcher, true);
      CATMAID.statusBar.printCoords('ui');

      let stackViewer = self.stackViewer;
      let _m = CATMAID.ui.getMouse(e, self.stackViewer.getView(), true);
      if (_m) {
        let sCoords = self.lastPointerCoordsS;
        let pCoords = self.lastPointerCoordsP;
        let screenPosition = stackViewer.screenPosition();
        sCoords.x = screenPosition.left + _m.offsetX / stackViewer.scale / stackViewer.primaryStack.anisotropy(0).x;
        sCoords.y = screenPosition.top  + _m.offsetY / stackViewer.scale / stackViewer.primaryStack.anisotropy(0).y;
        sCoords.z = stackViewer.z;
        stackViewer.primaryStack.stackToProject(sCoords, pCoords);
        // This function is called often, so the least memory consuming way
        // should be used to create the status bar update.
        CATMAID.statusBar.printCoords(`S: [${sCoords.x.toFixed(1)}, ${sCoords.y.toFixed(1)}, ${sCoords.z.toFixed(1)}] px, P: [${pCoords.x.toFixed(1)}, ${pCoords.y.toFixed(1)}, ${pCoords.z.toFixed(1)}] nm`);
      }
    };

    //--------------------------------------------------------------------------
    /**
     * Slider commands for changing the slice come in too frequently, thus the
     * execution of the actual slice change has to be delayed slightly.  The
     * timer is overridden if a new action comes in before the last had time to
     * be executed.
     */
    var changeSliceDelayedTimer = null;
    var changeSliceDelayedParam = null;

    var changeSliceDelayedAction = function()
    {
      window.clearTimeout( changeSliceDelayedTimer );
      self.changeSlice( changeSliceDelayedParam.z, changeSliceDelayedParam.step );
      changeSliceDelayedParam = null;
      return false;
    };

    this.changeSliceDelayed = function(val, step)
    {
      if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
      changeSliceDelayedParam = { z : val, step: step };
      changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 50 );
    };

    this.changeSlice = function(val, step)
    {
      try {
        val = self.stackViewer.toValidZ(val, step < 0 ? -1 : 1);
        self.stackViewer.moveToPixel( val, self.stackViewer.y, self.stackViewer.x, self.stackViewer.s );
      } catch (error) {
        // Due to the way, sliders area currently used, we have to reset the
        // slider value.
        self.slider_z.setByValue( self.stackViewer.z, true );
        CATMAID.handleError(error);
      }
    };

    var animateChange = function (e, max_fps, name, change) {
      if (!max_fps) {
        // Throttle to 60 FPS by default.
        max_fps = 60.0;
      }
      var MIN_FRAME_TIME = 1000.0 / max_fps;
      var frameTimeout = null;
      var lastFrameTime = null;

      if (self['animate' + name]) return true;
      self['animate' + name] = true;

      var callback = function () {
        if (!self['animate' + name]) return;

        // Throttle slice change rate to 60 FPS, because rendering can be much
        // faster if image data is already cached.
        var thisFrameTime = performance.now();
        if (lastFrameTime && thisFrameTime - lastFrameTime < MIN_FRAME_TIME) {
          window.clearTimeout(frameTimeout);
          frameTimeout = window.setTimeout(callback, MIN_FRAME_TIME + lastFrameTime - thisFrameTime);
          return;
        }
        lastFrameTime = thisFrameTime;

        window.requestAnimationFrame(() => change(callback));
      };

      var target = e.target;
      var oldListener = target.onkeyup;
      var oldBlocking = self.stackViewer.blockingRedraws;
      self.stackViewer.blockingRedraws = true;
      target.onkeyup = function (e) {
        window.clearTimeout(frameTimeout);
        target.onkeyup = oldListener;
        self['animate' + name] = false;
        self.stackViewer.blockingRedraws = oldBlocking;
      };
      callback();
    };

    var smoothChangeSlice = function (e, max_fps, step) {
      animateChange(e, max_fps, 'scroll', function (callback) {
        var zOffset = self.stackViewer.validZDistanceByStep(self.slider_z.val, step);
        if (!zOffset) return;
        self.stackViewer.moveToPixel(
            self.slider_z.val + zOffset,
            self.stackViewer.y,
            self.stackViewer.x,
            self.stackViewer.s,
            callback);
      });
    };

    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    /**
     * ... same as said before for scale changes ...
     */
    var changeScaleDelayedTimer = null;
    var changeScaleDelayedParam = null;

    var changeScaleDelayedAction = function()
    {
      window.clearTimeout( changeScaleDelayedTimer );
      self.changeScale( changeScaleDelayedParam.s );
      changeScaleDelayedParam = null;
      return false;
    };

    this.changeScaleDelayed = function( val )
    {
      if ( changeScaleDelayedTimer ) window.clearTimeout( changeScaleDelayedTimer );
      changeScaleDelayedParam = { s : val };
      changeScaleDelayedTimer = window.setTimeout( changeScaleDelayedAction, 100 );
    };

    this.changeScale = function( val, callback )
    {
      // Determine if the pointer is over the stack view.
      var offset = $(self.stackViewer.getView()).offset();
      var m = CATMAID.UI.getLastMouse();
      var x = m.x - offset.left,
        y = m.y - offset.top;
      if (Navigator.Settings.session.use_cursor_following_zoom &&
          x >= 0 && x <= self.stackViewer.viewWidth &&
          y >= 0 && y <= self.stackViewer.viewHeight) {
        x /= self.stackViewer.scale;
        y /= self.stackViewer.scale;
        x += (self.stackViewer.x - self.stackViewer.viewWidth / self.stackViewer.scale / 2);
        y += (self.stackViewer.y - self.stackViewer.viewHeight / self.stackViewer.scale / 2);
        self.scalePreservingLastPosition(x, y, val, callback);
      } else {
        // If the pointer is not over the stack view, zoom towards the center.
        self.stackViewer.moveToPixel( self.stackViewer.z, self.stackViewer.y, self.stackViewer.x, val, callback );
      }
    };

    /**
     * change the scale, making sure that the point keep_[xyz] stays in
     * the same position in the view
     */
    this.scalePreservingLastPosition = function (keep_x, keep_y, sp, callback) {
      var old_s = self.stackViewer.s;
      var s_extents = self.stackViewer.getZoomExtents();
      var new_s = Math.max(s_extents.min, Math.min(s_extents.max, sp));
      var scale_ratio = Math.pow(2, new_s - old_s);

      if (old_s == new_s)
        return;

      var dx = keep_x - self.stackViewer.x;
      var dy = keep_y - self.stackViewer.y;

      var new_centre_x = keep_x - dx * scale_ratio;
      var new_centre_y = keep_y - dy * scale_ratio;

      self.stackViewer.moveToPixel(self.stackViewer.z, new_centre_y, new_centre_x, sp, callback);
    };

    var smoothChangeScale = function (e, max_fps, step) {
      animateChange(e, max_fps, 'scale', function (callback) {
        var val = self.slider_s.val + step;
        self.changeScale(val, callback);
      });
    };

    //--------------------------------------------------------------------------

    var changeXByInput = function( e )
    {
      var val = parseInt( this.value );
      if ( isNaN( val ) ) this.value = self.stackViewer.x;
      else self.stackViewer.moveToPixel( self.stackViewer.z, self.stackViewer.y, val, self.stackViewer.s );
      e.target.blur();
    };

    var changeYByInput = function( e )
    {
      var val = parseInt( this.value );
      if ( isNaN( val ) ) this.value = self.stackViewer.y;
      else self.stackViewer.moveToPixel( self.stackViewer.z, val, self.stackViewer.x, self.stackViewer.s );
      e.target.blur();
    };

    var YXMouseWheel = function( e )
    {
      var w = CATMAID.ui.getMouseWheel( e );
      if ( w )
      {
        this.value = parseInt( this.value ) - w;
        this.onchange();
      }
      return false;
    };

    this.getActions = function () {
      return actions;
    };

    var actions = [

      new CATMAID.Action({
        helpText: "Zoom in (smaller increments with <kbd>Shift</kbd> held; hold with <kbd>Ctrl</kbd> to animate)",
        keyShortcuts: {
          '+': [ '+', '=', 'Ctrl + =', 'Ctrl + Shift + =', 'Shift + +' ]
        },
        run: function (e) {
          if (e.ctrlKey) {
            smoothChangeScale(e, Navigator.Settings.session.max_fps, e.shiftKey ? -0.01 : -0.05);
          } else {
            self.slider_s.move(1, !e.shiftKey);
          }
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Zoom out (smaller increments with <kbd>Shift</kbd> held; hold with <kbd>Ctrl</kbd> to animate)",
        keyShortcuts: {
          '-': [ '-', 'Ctrl + -', 'Ctrl + Shift + -', 'Shift + -' ]
        },
        run: function (e) {
          if (e.ctrlKey) {
            smoothChangeScale(e, Navigator.Settings.session.max_fps, e.shiftKey ? 0.01 : 0.05);
          } else {
            self.slider_s.move(-1, !e.shiftKey);
          }
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move up 1 slice in z (or 10 with <kbd>Shift</kbd> held; hold with <kbd>Ctrl</kbd> to animate)",
        keyShortcuts: {
          ',': [ ',', 'Ctrl + ,', 'Ctrl + Shift + ,', 'Shift + ,' ]
        },
        run: function (e) {
          var step = e.shiftKey ? (-1 * Navigator.Settings.session.major_section_step) : -1;
          if (Navigator.Settings.session.animate_section_change ? !e.ctrlKey : e.ctrlKey) {
            smoothChangeSlice(e, Navigator.Settings.session.max_fps, step);
          } else {
            self.slider_z.move(step);
          }
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move down 1 slice in z (or 10 with <kbd>Shift</kbd> held; hold with <kbd>Ctrl</kbd> to animate)",
        keyShortcuts: {
          '.': [ '.', 'Ctrl + .', 'Ctrl + Shift + .', 'Shift + .' ]
        },
        run: function (e) {
          var step = e.shiftKey ? Navigator.Settings.session.major_section_step : 1;
          if (Navigator.Settings.session.animate_section_change ? !e.ctrlKey : e.ctrlKey) {
            smoothChangeSlice(e, Navigator.Settings.session.max_fps, step);
          } else {
            self.slider_z.move(step);
          }
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move left (towards negative x, faster with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          "\u2190": [ 'ArrowLeft', 'Alt + ArrowLeft', 'Alt + Shift + ArrowLeft', 'Shift + ArrowLeft' ]
        },
        run: function (e) {
          self.input_x.value = parseInt(self.input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
          self.input_x.onchange(e);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move right (towards positive x, faster with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          "\u2192": [ 'ArrowRight', 'Alt + ArrowRight', 'Alt + Shift + ArrowRight', 'Shift + ArrowRight' ]
        },
        run: function (e) {
          self.input_x.value = parseInt(self.input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
          self.input_x.onchange(e);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move up (towards negative y, faster with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          "\u2191": [ 'ArrowUp', 'Alt + ArrowUp', 'Alt + Shift + ArrowUp', 'Shift + ArrowUp' ]
        },
        run: function (e) {
          self.input_y.value = parseInt(self.input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
          self.input_y.onchange(e);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move down (towards positive y, faster with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          "\u2193": [ 'ArrowDown', 'Alt + ArrowDown', 'Alt + Shift + ArrowDown', 'Shift + ArrowDown' ]
        },
        run: function (e) {
          self.input_y.value = parseInt(self.input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
          self.input_y.onchange(e);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Hide all layers except image tile layers (while held)",
        keyShortcuts: {
          "SPACE": [ ' ' ]
        },
        run: function (e) {
          // Avoid repeated onkeydown events in some browsers, but still
          // handle event to prevent browser default behavior (scrolling
          // or input selection).
          if (self.hideLayersHeld) return true;
          self.hideLayersHeld = true;

          // Hide any visible layers (besides the tile layer).
          var stackLayers = project.getStackViewers().map(function (s) { return s.getLayers(); });
          var layerOpacities = stackLayers.map(function (layers) {
            var opacities = {};
            layers.forEach(function (layer, k) {
              if (layer.isHideable) {
                opacities[k] = layer.getOpacity();
                layer.setOpacity(0);
                // Redrawing the layer is necessary to hide WebGL layers.
                layer.redraw();
              }
            });
            return opacities;
          });

          // Set a key up a listener to make these layers visible again
          // when the key is released.
          var target = e.target;
          var oldListener = target.onkeyup;
          target.onkeyup = function (e) {
            if (e.key === ' ') {
              stackLayers.forEach(function (layers, ind) {
                Object.keys(layerOpacities[ind]).forEach(function (k) {
                  layers.get(k).setOpacity(layerOpacities[ind][k]);
                });
                target.onkeyup = oldListener;
                self.hideLayersHeld = false;
              });
              // Redraw everything to show, e.g., WebGL layers.
              project.getStackViewers().forEach(function (s) { s.redraw(); });
            } else if (oldListener) oldListener(e);
          };
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Change major section step size",
        keyShortcuts: {
          '#': [ 'Shift + #' ]
        },
        run: function (e) {
          // Show dialog to update major section step size
          var dialog = new CATMAID.OptionsDialog("Update major section step");
          dialog.appendMessage("Please provide a new majtor section step size.");
          var stepInput = dialog.appendField("New major section step",
              "majorSectionStep", "", true);
          dialog.onOK = function() {
            // Only try to update step size if there was some input
            if (stepInput.value.length !== 0) {
              var newStep = parseInt(stepInput.value, 10);
              CATMAID.Navigator.Settings.session.major_section_step = newStep;
            }
          };

          dialog.show(400, "auto");
          return true;
        }
      }),
    ];

    var keyToAction = CATMAID.getKeyToActionMap(actions);

    /**
     * install this tool in a stackViewer.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer, buttonName )
    {
      var buttonID = typeof buttonName == "undefined" ? "edit_button_move" : buttonName;
      var button = document.getElementById(buttonID);
      if (button) button.className = "button_active";

      var toolbar = document.getElementById( "toolbar_nav" );
      if (toolbar) toolbar.style.display = "block";

      self.stackViewer = parentStackViewer;

      self.mouseCatcher.addEventListener('pointerdown', this._onpointerdown);
      self.mouseCatcher.addEventListener( "wheel", onmousewheel, false );
      self.mouseCatcher.addEventListener('pointerdown', this._mousePosStatusUpdate);
      self.mouseCatcher.addEventListener('pointermove', this._mousePosStatusUpdate);
      self.mouseCatcher.addEventListener('pointerup', this._mousePosStatusUpdate);

      self.stackViewer.getView().appendChild( self.mouseCatcher );

      var sExtents = self.stackViewer.getZoomExtents();
      self.slider_s.update(
        sExtents.max,
        sExtents.min,
        { major: sExtents.max - sExtents.min + 1,
          minor: (sExtents.max - sExtents.min)*10 + 1 },
        self.stackViewer.s,
        self.changeScaleDelayed,
        -0.01);

      if ( self.stackViewer.primaryStack.slices.length < 2 )  //!< hide the self.slider_z if there is only one slice
      {
        self.slider_z.getView().parentNode.style.display = "none";
      }
      else
      {
        self.slider_z.getView().parentNode.style.display = "block";
      }
      var validSections = self.stackViewer.getValidSections();
      self.slider_z.update(
        undefined,
        undefined,
        { major: validSections.filter(function(e, i) { return i % 10 === 0; }),
          minor: validSections },
        self.stackViewer.z,
        self.changeSliceDelayed );

      self.input_x.onchange = changeXByInput;
      self.input_x.addEventListener( "wheel", YXMouseWheel, false );

      self.input_y.onchange = changeYByInput;
      self.input_y.addEventListener( "wheel", YXMouseWheel, false );

      self.updateControls();
    };

    /**
     * unregister all stack related pointer and keyboard controls
     */
    this.unregister = function()
    {
      if ( self.stackViewer && self.mouseCatcher.parentNode == self.stackViewer.getView() )
        self.stackViewer.getView().removeChild( self.mouseCatcher );

      self.mouseCatcher.removeEventListener('pointerdown', this._mousePosStatusUpdate);
      self.mouseCatcher.removeEventListener('pointermove', this._mousePosStatusUpdate);
      self.mouseCatcher.removeEventListener('pointerup', this._mousePosStatusUpdate);
    };

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function( buttonName )
    {
      self.unregister();

      var buttonID = typeof buttonName == "undefined" ? "edit_button_move" : buttonName;
      var button = document.getElementById(buttonID);
      if (button) button.className = "button";

      var toolbar = document.getElementById( "toolbar_nav" );
      if (toolbar) toolbar.style.display = "none";

      self.slider_s.update(
        undefined,
        undefined,
        undefined,
        0,
        null );

      self.slider_z.update(
        undefined,
        undefined,
        undefined,
        0,
        null );

      self.input_x.onchange = null;
      self.input_x.removeEventListener( "wheel", YXMouseWheel, false );

      self.input_y.onchange = null;
      self.input_y.removeEventListener( "wheel", YXMouseWheel, false );

      self.stackViewer = null;
    };

    /** This function should return true if there was any action
      linked to the key code, or false otherwise. */

    this.handleKeyPress = function( e ) {
      var keyAction = CATMAID.UI.getMappedKeyAction(keyToAction, e);
      if (keyAction) {
        keyAction.run(e);
        return true;
      } else {
        return false;
      }
    };

    this.getMouseHelp = function () {
      var result = '<ul>';
      result += '<li><strong>Middle mouse drag:</strong> pan the view</li>';
      result += '<li><strong>Mouse wheel:</strong> move up/down 1 section in z</li>';
      result += '<li><strong>Mouse wheel with <kbd>Shift</kbd>:</strong> move up/down 10 sections in z</li>';
      result += '<li><strong>Mouse wheel with <kbd>Ctrl</kbd>:</strong> zoom in/out to the next integer zoom level</li>';
      result += '<li><strong>Mouse wheel with <kbd>Ctrl</kbd> and <kbd>Shift</kbd>:</strong> zoom in/out 1/10th of a zoom level</li>';
      result += '</ul>';
      return result;
    };
  }

  Navigator.prototype.validateZ = function(val) {
    try {
      return this.stackViewer.isValidZ(val);
    } catch (error) {
      return false;
    }
  };

  Navigator.prototype.getContextHelp = function() {
    return [
      '<h1>Navigation</h1>',
      '<p>Both the <em>Left</em> and <em>Right Mouse Button</em> can be used to ',
      'move in the plane (pan). The coordinates of the current location in ',
      'stack space are displayed in the <em>X</em> and <em>Y</em> input boxes ',
      'in the second tool bar. Additionally, the <em>Arrow Keys</em> can be used ',
      'for planar movement. The two sliders in the toolbar allow to change ',
      '<em>Z</em> and the <em>Zoom Level</em>.</p>',
    ].join('');
  };


  Navigator.Settings = new CATMAID.Settings(
      'navigator',
      {
        version: 0,
        entries: {
          invert_mouse_wheel: {
            default: false
          },
          use_cursor_following_zoom: {
            default: true
          },
          major_section_step: {
            default: 10
          },
          animate_section_change: {
            default: false
          },
          max_fps: {
            default: 60.0
          }
        },
        migrations: {}
      });

  // Make Navigator available in CATMAID Namespace
  CATMAID.Navigator = Navigator;

})(CATMAID);
