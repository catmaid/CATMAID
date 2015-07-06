/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  function SegmentationTool()
  {
      var self = this;
      this.stack = null;
      this.toolname = "segmentationtool";

      var canvasLayer = null;

      /**
       * unregister all stack related mouse and keyboard controls
       */
      this.unregister = function()
      {

      };

      /**
       * unregister all project related GUI control connections and event
       * handlers, toggle off tool activity signals (like buttons)
       */
      this.destroy = function()
      {
          self.unregister();

          self.destroyToolbar();

          self.stack = null;
      };

      /*
      ** Destroy the tool bar elements
      */
      this.destroyToolbar = function ()
      {
          // disable button and toolbar
          document.getElementById( "edit_button_segmentation" ).className = "button";
          document.getElementById( "toolbar_segmentation" ).style.display = "none";

          self.slider_z.update(
              0,
              1,
              undefined,
              0,
              null );
      };

      /**
       * install this tool in a stack.
       * register all GUI control elements and event handlers
       */
      this.register = function( parentStack )
      {
          document.getElementById( "toolbox_segmentation" ).style.display = "block";
          self.stack = parentStack;
          self.createToolbar();
      };

      /*
      ** Create the segmentation toolbar
      */
      this.createToolbar = function ()
      {
          //console.log('create toolbar')
          // enable button and toolbar
          document.getElementById( "edit_button_segmentation" ).className = "button_active";
          document.getElementById( "toolbar_segmentation" ).style.display = "block";

          self.slider_z = new CATMAID.Slider(
              CATMAID.Slider.HORIZONTAL,
              true,
              0,
              self.stack.slices,
              self.stack.slices,
              self.stack.z,
              self.changeSliceDelayed );

          var sliders_box = document.getElementById( "sliders_box_segmentation" );
          
          /* remove all existing dimension sliders */
          while ( sliders_box.firstChild )
              sliders_box.removeChild( sliders_box.firstChild );
              
          var slider_z_box = document.createElement( "div" );
          slider_z_box.className = "box";
          slider_z_box.id = "slider_z_box";
          var slider_z_box_label = document.createElement( "p" );
          slider_z_box_label.appendChild( document.createTextNode( "z-index" + "   " ) );
          slider_z_box.appendChild( slider_z_box_label );
          slider_z_box.appendChild( self.slider_z.getView() );
          slider_z_box.appendChild( self.slider_z.getInputView() );
          sliders_box.appendChild( slider_z_box );
      };

      var onmouseup = function( e )
      {
          //console.log('onmouseup');
          CATMAID.ui.releaseEvents();
          CATMAID.ui.removeEvent( "onmousemove", onmousemove );
          CATMAID.ui.removeEvent( "onmouseup", onmouseup );
          return false;
      };

      var onmousedown = function( e )
      {
          //console.log('onmousedown');
          CATMAID.ui.registerEvent( "onmousemove", onmousemove );
          CATMAID.ui.registerEvent( "onmouseup", onmouseup );
          CATMAID.ui.catchEvents( "move" );
          CATMAID.ui.onmousedown( e );

          //ui.catchFocus();

          return false;
      };

      /** This returns true if focus had to be switched; typically if
          the focus had to be switched, you should return from any event
          handling, otherwise all kinds of surprising bugs happen...  */
      this.ensureFocused = function() {
        var window = self.stack.getWindow();
        if (window.hasFocus()) {
          return false;
        } else {
          window.focus();
          return true;
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
          self.changeSlice( changeSliceDelayedParam.z );
          changeSliceDelayedParam = null;
          return false;
      };

      this.changeSliceDelayed = function( val )
      {
          current_section = val;
          if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
          changeSliceDelayedParam = { z : val };
          changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
      };

      this.changeSlice = function( val )
      {
          self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );
          return;
      };

      var updateControls = function()
      {
          self.slider_z.setByValue( self.stack.z, true );
          return;
      };

      var actions = [];

      this.addAction = function ( action ) {
          actions.push( action );
      };

      this.getActions = function () {
          return actions;
      };

      this.addAction( new Action({
          helpText: "Move up 1 slice in z (or 10 with Shift held)",
          keyShortcuts: {
              ',': [ 44, 188 ]
          },
          run: function (e) {
              self.move_up( e );
              return true;
          }
      }) );

      this.addAction( new Action({
          helpText: "Move down 1 slice in z (or 10 with Shift held)",
          keyShortcuts: {
              '.': [ 46, 190 ]
          },
          run: function (e) {
              self.move_down( e );
              return true;
          }
      }) );

      var keyCodeToAction = getKeyCodeToActionMap(actions);

      /** This function should return true if there was any action
          linked to the key code, or false otherwise. */
      this.handleKeyPress = function( e )
      {
          var keyAction = keyCodeToAction[e.keyCode];
          if (keyAction) {
            return keyAction.run(e);
          } else {
            return false;
          }
      };

      this.clickXY = function( e ) {
          var wc = self.stack.getFieldOfViewInPixel();
          return;
      };

      this.redraw = function() {
          updateControls();
      };

  }

  /**
   * Actions available on segmentation tool.
   */
  SegmentationTool.actions = [];

  // Make SegmentationTool available in CATMAID namespace
  CATMAID.SegmentationTool = SegmentationTool;

})(CATMAID);
