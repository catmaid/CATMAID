/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The constructor for the region of interest (ROI) tool. It allows to draw a
   * box selection on the current view and to modify it with the help of text
   * boxes in a tool bar.
   */
  function RoiTool()
  {
  // call super constructor
  CATMAID.BoxSelectionTool.call( this );

  var self = this;
  this.toolname = "roitool";

  // inputs for x, y, width and height of the crop box
  this.box_roi_x = document.getElementById( "box_roi_x" );
  this.box_roi_y = document.getElementById( "box_roi_y" );
  this.box_roi_w = document.getElementById( "box_roi_w" );
  this.box_roi_h = document.getElementById( "box_roi_h" );
  this.box_roi_r = document.getElementById( "box_roi_r" );

  //! mouse catcher
  this.mouseCatcher = document.createElement( "div" );
  this.mouseCatcher.className = "sliceMouseCatcher";
  this.mouseCatcher.style.cursor = "default";

  // initialize roi button
  this.button_roi_apply = document.getElementById( "button_roi_apply" );
  this.button_roi_apply.onclick = function() {
    self.createRoi()
      .then(function(result) {
        if (result.status) {
          CATMAID.msg("Success", result.status);
        }
      })
      .catch(CATMAID.handleError);
  };

  // bind event handlers to current calling context
  this.onpointerdown_bound = this.onpointerdown.bind(this);
  this.onpointerup_bound = this.onpointerup.bind(this);
  this.onpointermove_pos_bound = this.onpointermove.pos.bind(this);
  this.onpointermove_crop_bound = this.onpointermove.crop.bind(this);
  }

  // Let the RoiTool inherit from the BoxSelectionTool
  CATMAID.tools.extend( RoiTool, CATMAID.BoxSelectionTool );

  /**
   * Updates UI elements like the the crop box input boxes.
   */
  RoiTool.prototype.updateControls = function()
  {
    var cb = this.getCropBox();
    if ( cb )
    {
      var roiBoxBB = this.getCropBoxBoundingBox(cb.stackViewer);
      this.box_roi_x.value = isNaN(roiBoxBB.left_px) ? "-" : roiBoxBB.left_px;
      this.box_roi_y.value = isNaN(roiBoxBB.top_px) ? "-" : roiBoxBB.top_px;
      this.box_roi_w.value = isNaN(roiBoxBB.width_px) ? "-" : roiBoxBB.width_px;
      this.box_roi_h.value = isNaN(roiBoxBB.height_px) ? "-" : roiBoxBB.height_px;
      this.box_roi_r.value = isNaN(roiBoxBB.rotation_cw) ? "-" : roiBoxBB.rotation_cw;
    }
  };

  /**
   * Handles redraw events and calls the redraw method of the base class and
   * triggers an update of UI elements.
   */
  RoiTool.prototype.redraw = function(completionCallback)
  {
    // call register of super class
    RoiTool.superproto.redraw.call( this, completionCallback );
    this.updateControls();
  };

  /**
   * Handles resize events by adjusting the mouse catcher.
   */
  RoiTool.prototype.resize = function( width, height )
  {
    this.mouseCatcher.style.width = width + "px";
    this.mouseCatcher.style.height = height + "px";
  };

  /**
   * Handles onchange events in the X input box.
   */
  RoiTool.prototype.changeCropBoxXByInput = function( e )
  {
    var val = parseInt( this.box_roi_x.value, 10 );
    var cropBox = this.getCropBox();

    if ( isNaN( val ) )
    {
      this.value = this.toPx( cropBox.left, this.stackViewer.primaryStack.resolution.x );
    }
    else
    {
      var screen = this.stackViewer.screenPosition();
      var screen_left = this.stackViewer.primaryStack.stackToProjectX(
        this.stackViewer.z, scrren.top, screen.left);
      var width_world = cropBox.right - cropBox.left;
      cropBox.left = this.toWorld( val, this.stackViewer.primaryStack.resolution.x ) + screen_left;
      cropBox.right = cropBox.left + width_world;
      this.updateCropBox();
      this.updateControls();
    }
  };

  /**
   * Handles onchange events in the Y input box.
   */
  RoiTool.prototype.changeCropBoxYByInput = function( e )
  {
    var val = parseInt( this.box_roi_y.value, 10 );
    var cropBox = this.getCropBox();

    if ( isNaN( val ) )
    {
      this.value = this.toPx( cropBox.left, this.stackViewer.primaryStack.resolution.y );
    }
    else
    {
      var screen = this.stackViewer.screenPosition();
      var screen_top = this.stackViewer.primaryStack.stackToProjectY(
        this.stackViewer.z, screen.top, screen.left);
      var height_world = cropBox.bottom - cropBox.top;
      cropBox.top = this.toWorld( val, this.stackViewer.primaryStack.resolution.y ) + screen_top;
      cropBox.bottom = cropBox.top + height_world;
      this.updateCropBox();
      this.updateControls();
    }
  };

  /**
   * Handles onchange events in the width input box.
   */
  RoiTool.prototype.changeCropBoxWByInput = function( e )
  {
    var val = parseInt( this.box_roi_w.value, 10 );
    var cropBox = this.getCropBox();

    if ( isNaN( val ) )
    {
      var width_world = cropBox.right - cropBox.left;
      this.value = this.toPx( width_world, this.stackViewer.primaryStack.resolution.x );
    }
    else
    {
      var width_world = this.toWorld( val, this.stackViewer.primaryStack.resolution.x );
      cropBox.right = cropBox.left + width_world;
      this.updateCropBox();
      this.updateControls();
    }
  };

  /**
   * Handles onchange events in the height input box.
   */
  RoiTool.prototype.changeCropBoxHByInput = function( e )
  {
    var val = parseInt( this.box_roi_h.value, 10 );
    var cropBox = this.getCropBox();

    if ( isNaN( val ) )
    {
      var height_world = cropBox.bottom - cropBox.top;
      this.value = this.toPx( height_world, this.stackViewer.primaryStack.resolution.y );
    }
    else
    {
      var height_world = this.toWorld( val, this.stackViewer.primaryStack.resolution.y );
      cropBox.bottom = cropBox.top + height_world;
      this.updateCropBox();
      this.updateControls();
    }
  };

  /**
   * Handles onchange events in the height input box.
   */
  RoiTool.prototype.changeCropBoxRByInput = function( e )
  {
    var val = parseInt( this.box_roi_r.value, 10 );
    var cropBox = this.getCropBox();

    if ( isNaN( val ) )
    {
      this.box_roi_r.value = cropBox.rotation_cw;
    }
    else
    {
      cropBox.rotation_cw = val;
      this.updateCropBox();
      this.updateControls();
    }
  };

  /**
   * Handles mouse wheel changes in text input boxes.
   */
  RoiTool.prototype.cropBoxMouseWheel = function( e )
  {
    var w = CATMAID.ui.getMouseWheel( e );
    if ( w )
    {
      this.value = parseInt( this.value, 10 ) - w;
      this.onchange();
    }
    return false;
  };

  /**
   * Handles pointerdown events.
   */
  RoiTool.prototype.onpointerdown = function( e )
  {
    var b = CATMAID.ui.getMouseButton( e );
    switch ( b )
    {
    case 2:
      CATMAID.ui.removeEvent( "onpointermove", this.onpointermove_crop_bound );
      CATMAID.ui.removeEvent( "onpointerup", this.onpointerup_bound );
      break;
    default:
      var m = CATMAID.ui.getMouse( e, this.stackViewer.getView() );
      this.createCropBox( m.offsetX, m.offsetY );

      CATMAID.ui.registerEvent( "onpointermove", this.onpointermove_crop_bound );
      CATMAID.ui.registerEvent( "onpointerup", this.onpointerup_bound );
      CATMAID.ui.catchEvents( "crosshair" );
    }
    CATMAID.ui.onpointerdown( e );

    //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
    document.body.firstChild.focus();

    return false;
  };

  /**
   * Keeps two pointermove event handlers. The first (pos) shown the current
   * position in the status line and the second one (crop) adjusts the crop box
   * while moving.
   */
  RoiTool.prototype.onpointermove = {
    pos : function ( e )
    {
      var xp;
      var yp;
      var m = CATMAID.ui.getMouse( e, this.stackViewer.getView() );
      if ( m )
      {
        var s = this.stackViewer;
        var pos_x = s.primaryStack.translation.x + ( s.x + ( m.offsetX - s.viewWidth / 2 ) / s.scale ) * s.primaryStack.resolution.x;
        var pos_y = s.primaryStack.translation.x + ( s.y + ( m.offsetY - s.viewHeight / 2 ) / s.scale ) * s.primaryStack.resolution.y;
        CATMAID.statusBar.replaceLast( "[" + this.convertWorld( pos_x ).toFixed( 3 ) + ", " + this.convertWorld( pos_y ).toFixed( 3 ) + "]" );
      }
      return false;
    },
    crop : function( e )
    {
      var cropBox = this.getCropBox();

      if ( cropBox )
      {
        // adjust left and rigt component
        cropBox.xdist += CATMAID.ui.diffX;
        var xdist_world = this.toWorld( cropBox.xdist, this.stackViewer.primaryStack.resolution.x );
        if ( cropBox.xdist > 0 )
        {
          cropBox.left = cropBox.xorigin;
          cropBox.right = cropBox.xorigin + xdist_world;
        }
        else
        {
          cropBox.left = cropBox.xorigin + xdist_world;
          cropBox.right = cropBox.xorigin;
        }

        // adjust top and bottom component
        cropBox.ydist += CATMAID.ui.diffY;
        var ydist_world = this.toWorld( cropBox.ydist, this.stackViewer.primaryStack.resolution.y );
        if ( cropBox.ydist > 0 )
        {
          cropBox.top = cropBox.yorigin;
          cropBox.bottom = cropBox.yorigin + ydist_world;
        }
        else
        {
          cropBox.top = cropBox.yorigin + ydist_world;
          cropBox.bottom = cropBox.yorigin;
        }

        this.updateCropBox();
      }
      this.updateControls();
    }
  };

  RoiTool.prototype.onpointerup = function ( e )
  {
    CATMAID.ui.releaseEvents();
    CATMAID.ui.removeEvent( "onpointermove", this.onpointermove_crop_bound );
    CATMAID.ui.removeEvent( "onpointerup", this.onpointerup_bound );
    this.updateControls();
  };

  RoiTool.prototype.onmousewheel = function( e )
  {

  };

  /**
   * Adds a mouse wheel listener to a component.
   */
  RoiTool.prototype.addMousewheelListener = function( component, handler )
  {
    component.addEventListener( "wheel", handler, false );
  };

  /**
   * Removes a mouse wheel listener from a component.
   */
  RoiTool.prototype.removeMousewheelListener = function( component, handler )
  {
    component.removeEventListener( "wheel", handler, false );
  };

  /**
   * Installs this tool in a stack viewer and registers all GUI control elements and
   * event handlers.
   */
  RoiTool.prototype.register = function( parentStackViewer )
  {
    // call register of super class (updates also stack member)
    RoiTool.superproto.register.call( this, parentStackViewer );

    // initialize the stacks we offer to crop
    var project = this.stackViewer.getProject();

    this.mouseCatcher.style.cursor = "crosshair";
    // create and remember mouse bindings, bound to the
    // current context (this).
    this.mouseCatcher.onpointerdown = this.onpointerdown_bound;
    this.mouseCatcher.onpointermove = this.onpointermove_pos_bound;

    var onmousewheel = this.onmousewheel.bind(this);
    this.mouseCatcher.addEventListener( "wheel", onmousewheel, false );

    this.stackViewer.getView().appendChild( this.mouseCatcher );

    var cropBoxMouseWheel = this.cropBoxMouseWheel.bind(this);
    this.box_roi_x.onchange = this.changeCropBoxXByInput.bind(this);
    this.addMousewheelListener( this.box_roi_x, this.cropBoxMouseWheel );
    this.box_roi_y.onchange = this.changeCropBoxYByInput.bind(this);
    this.addMousewheelListener( this.box_roi_y, this.cropBoxMouseWheel );
    this.box_roi_w.onchange = this.changeCropBoxWByInput.bind(this);
    this.addMousewheelListener( this.box_roi_w, this.cropBoxMouseWheel );
    this.box_roi_h.onchange = this.changeCropBoxHByInput.bind(this);
    this.addMousewheelListener( this.box_roi_h, this.cropBoxMouseWheel );
    this.box_roi_r.onchange = this.changeCropBoxRByInput.bind(this);
    this.addMousewheelListener( this.box_roi_r, this.cropBoxMouseWheel );

    document.getElementById( "toolbar_roi" ).style.display = "block";

    this.updateControls();
  };

  /**
   * Unregisters all stack viewer related mouse and keyboard controls.
   */
  RoiTool.prototype.unregister = function()
  {
    if ( this.stackViewer && this.mouseCatcher.parentNode == this.stackViewer.getView() )
      this.stackViewer.getView().removeChild( this.mouseCatcher );
  };

  /**
   * Unregisters all project related GUI control connections and event
   * handlers, toggle off tool activity signals (like buttons).
   */
  RoiTool.prototype.destroy = function()
  {
    this.unregister();

    document.getElementById( "toolbar_roi" ).style.display = "none";

    this.box_roi_x.onchange = null;
    this.removeMousewheelListener( this.box_roi_x, this.cropBoxMouseWheel );
    this.box_roi_y.onchange = null;
    this.removeMousewheelListener( this.box_roi_y, this.cropBoxMouseWheel );
    this.box_roi_w.onchange = null;
    this.removeMousewheelListener( this.box_roi_w, this.cropBoxMouseWheel );
    this.box_roi_h.onchange = null;
    this.removeMousewheelListener( this.box_roi_h, this.cropBoxMouseWheel );

    this.button_roi_apply.onclick = null;

    // call destroy of super class
    RoiTool.superproto.destroy.call( this );
  };

  /**
   * This function should return true if there was any action linked to the key
   * code, or false otherwise.
   */
  RoiTool.prototype.handleKeyPress = function( e ) {
    return false;
  };

  RoiTool.prototype.createRoi = function()
  {
    // Collect relevant information
    var cb = this.getCropBox();
    var data = {
      x_min: cb.left,
      x_max: cb.right,
      y_min: cb.top,
      y_max: cb.bottom,
      z: this.stackViewer.z * this.stackViewer.primaryStack.resolution.z + this.stackViewer.primaryStack.translation.z,
      zoom_level: this.stackViewer.s,
      rotation_cw: cb.rotation_cw,
      stack: this.stackViewer.primaryStack.id
    };
    return CATMAID.fetch(project.id + '/roi/add', 'POST', data);
  };

  // Export tool into CATMAID namespace
  CATMAID.RoiTool = RoiTool;

})(CATMAID);
