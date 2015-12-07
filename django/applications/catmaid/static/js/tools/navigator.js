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
        function( val ){ CATMAID.statusBar.replaceLast( "z: " + val ); return; } );

    this.slider_s = new CATMAID.Slider(
        CATMAID.Slider.HORIZONTAL,
        true,
        undefined,
        undefined,
        new Array(
          0,
          1,
          2,
          4,
          8 ),
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
      self.slider_s.setByValue( self.stackViewer.s, true );
      self.slider_z.setByValue( self.stackViewer.z, true );

      self.input_x.value = self.stackViewer.x;
      self.input_y.value = self.stackViewer.y;
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

    var onmousemove = function( e )
    {
      self.stackViewer.moveToPixel(
        self.stackViewer.z,
        self.stackViewer.y - CATMAID.ui.diffY / self.stackViewer.scale,
        self.stackViewer.x - CATMAID.ui.diffX / self.stackViewer.scale,
        self.stackViewer.s );
      return true;
    };

    var onmouseup = function( e )
    {
      CATMAID.ui.releaseEvents();
      CATMAID.ui.removeEvent( "onmousemove", onmousemove );
      CATMAID.ui.removeEvent( "onmouseup", onmouseup );
      return false;
    };

    var onmousedown = function( e )
    {
      CATMAID.ui.registerEvent( "onmousemove", onmousemove );
      CATMAID.ui.registerEvent( "onmouseup", onmouseup );
      CATMAID.ui.catchEvents( "move" );
      CATMAID.ui.onmousedown( e );

      CATMAID.ui.catchFocus();

      return false;
    };

    var onmousewheel = function (e) {
      var w = CATMAID.ui.getMouseWheel( e );

      if (!w) return false;
      e.preventDefault();

      if (!Navigator.Settings.session.invert_mouse_wheel) w = -w;
      w /= Math.abs(w); // Normalize w to {-1, 1}.

      if (e.ctrlKey || e.metaKey) { // Zoom.
        self.slider_s.move(w, !e.shiftKey);
      } else { // Move sections.
        if (e.shiftKey) w *= 10;
        self.slider_z.move(w);
      }

      return true;
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
      self.changeSlice( changeSliceDelayedParam.z );
      changeSliceDelayedParam = null;
      return false;
    };

    this.changeSliceDelayed = function( val )
    {
      if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
      changeSliceDelayedParam = { z : val };
      changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
    };

    this.changeSlice = function( val )
    {
      self.stackViewer.moveToPixel( val, self.stackViewer.y, self.stackViewer.x, self.stackViewer.s );
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

    this.changeScale = function( val )
    {
      // Determine if the mouse is over the stack view.
      var offset = $(self.stackViewer.getView()).offset();
      var m = CATMAID.UI.getLastMouse();
      var x = m.x - offset.left,
        y = m.y - offset.top;
      if (Navigator.Settings.use_cursor_following_zoom &&
        x >= 0 && x <= self.stackViewer.viewWidth &&
        y >= 0 && y <= self.stackViewer.viewHeight) {
        x /= self.stackViewer.scale;
        y /= self.stackViewer.scale;
        x += (self.stackViewer.x - self.stackViewer.viewWidth / self.stackViewer.scale / 2);
        y += (self.stackViewer.y - self.stackViewer.viewHeight / self.stackViewer.scale / 2);
        self.scalePreservingLastPosition(x, y, val);
      } else {
        // If the mouse is not over the stack view, zoom towards the center.
        self.stackViewer.moveToPixel( self.stackViewer.z, self.stackViewer.y, self.stackViewer.x, val );
      }
    };

    /**
     * change the scale, making sure that the point keep_[xyz] stays in
     * the same position in the view
     */
    this.scalePreservingLastPosition = function (keep_x, keep_y, sp) {
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

      self.stackViewer.moveToPixel(self.stackViewer.z, new_centre_y, new_centre_x, sp);
    };

    //--------------------------------------------------------------------------

    var changeXByInput = function( e )
    {
      var val = parseInt( this.value );
      if ( isNaN( val ) ) this.value = self.stackViewer.x;
      else self.stackViewer.moveToPixel( self.stackViewer.z, self.stackViewer.y, val, self.stackViewer.s );
    };

    var changeYByInput = function( e )
    {
      var val = parseInt( this.value );
      if ( isNaN( val ) ) this.value = self.stackViewer.y;
      else self.stackViewer.moveToPixel( self.stackViewer.z, val, self.stackViewer.x, self.stackViewer.s );
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

    var arrowKeyCodes = {
      left: 37,
      up: 38,
      right: 39,
      down: 40
    };

    var actions = [

      new CATMAID.Action({
        helpText: "Zoom in (smaller increments with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          '+': [ 43, 107, 61, 187 ]
        },
        run: function (e) {
          self.slider_s.move(1, !e.shiftKey);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Zoom out (smaller increments with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          '-': [ 45, 109, 173, 189 ]
        },
        run: function (e) {
          self.slider_s.move(-1, !e.shiftKey);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move up 1 slice in z (or 10 with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          ',': [ 44, 188 ]
        },
        run: function (e) {
          self.slider_z.move(-(e.shiftKey ? 10 : 1));
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move down 1 slice in z (or 10 with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          '.': [ 190 ]
        },
        run: function (e) {
          self.slider_z.move((e.shiftKey ? 10 : 1));
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Move left (towards negative x, faster with <kbd>Shift</kbd> held)",
        keyShortcuts: {
          "\u2190": [ arrowKeyCodes.left ]
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
          "\u2192": [ arrowKeyCodes.right ]
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
          "\u2191": [ arrowKeyCodes.up ]
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
          "\u2193": [ arrowKeyCodes.down ]
        },
        run: function (e) {
          self.input_y.value = parseInt(self.input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
          self.input_y.onchange(e);
          return true;
        }
      }),

      new CATMAID.Action({
        helpText: "Hide all layers except image tile layer (while held)",
        keyShortcuts: {
          "SPACE": [ 32 ]
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
              if (k !== 'TileLayer') {
                opacities[k] = layer.getOpacity();
                layer.setOpacity(0);
              }
            });
            return opacities;
          });

          // Set a key up a listener to make these layers visible again
          // when the key is released.
          var target = e.target;
          var oldListener = target.onkeyup;
          target.onkeyup = function (e) {
            if (e.keyCode == 32) {
              stackLayers.forEach(function (layers, ind) {
                Object.keys(layerOpacities[ind]).forEach(function (k) {
                  layers.get(k).setOpacity(layerOpacities[ind][k]);
                });
                target.onkeyup = oldListener;
                self.hideLayersHeld = false;
              });
            } else if (oldListener) oldListener(e);
          };
          return true;
        }
      })];

    var keyCodeToAction = CATMAID.getKeyCodeToActionMap(actions);

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

      self.mouseCatcher.onmousedown = onmousedown;
      self.mouseCatcher.addEventListener( "wheel", onmousewheel, false );

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
      self.slider_z.update(
        undefined,
        undefined,
        { major: self.stackViewer.primaryStack.slices.filter(function(el,ind,arr) { return (ind % 10) === 0; }),
          minor: self.stackViewer.primaryStack.slices },
        self.stackViewer.z,
        self.changeSliceDelayed );

      self.input_x.onchange = changeXByInput;
      self.input_x.addEventListener( "wheel", YXMouseWheel, false );

      self.input_y.onchange = changeYByInput;
      self.input_y.addEventListener( "wheel", YXMouseWheel, false );

      self.updateControls();
    };

    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {
      if ( self.stackViewer && self.mouseCatcher.parentNode == self.stackViewer.getView() )
        self.stackViewer.getView().removeChild( self.mouseCatcher );
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
        0,
        1,
        undefined,
        0,
        null );

      self.slider_z.update(
        0,
        1,
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
      var keyAction = keyCodeToAction[e.keyCode];
      if (keyAction) {
        keyAction.run(e);
        return true;
      } else {
        return false;
      }
    };
  }

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
          }
        },
        migrations: {}
      });

  // Make Navigator available in CATMAID Namespace
  CATMAID.Navigator = Navigator;

})(CATMAID);
