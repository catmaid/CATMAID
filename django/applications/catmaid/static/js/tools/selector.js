/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * selector.js
 *
 * requirements:
 *   tools.js
 *   slider.js
 *   stack.js
 */

(function(CATMAID) {

  /**
   * Selector tool.  Moves the stack around and should serve as a general selector
   * of any annotated structure.
   */
  function Selector()
  {
    var self = this;
    var stackViewer = null;
    var position_markers = [];
    // settings for duplicated cursors
    var img_path = STATIC_URL_JS + "images/svg-cursor-light-30px.png";
    var img_width = 30;
    var img_height = 30;

    //! mouse catcher
    var mouseCatcher = document.createElement( "div" );
    mouseCatcher.className = "sliceMouseCatcher";
    mouseCatcher.style.cursor = "default";

    this.resize = function( width, height )
    {
      mouseCatcher.style.width = width + "px";
      mouseCatcher.style.height = height + "px";
      return;
    };

    this.redraw = function()
    {
      // nothing to do here
    };

    var onpointermove =
    {
      pos : function( e )
      {
        var xp;
        var yp;
        var m = CATMAID.ui.getMouse( e, stackViewer.getView() );
        if ( m )
        {
          var mouseStackX = stackViewer.x + ( m.offsetX - stackViewer.viewWidth / 2 ) / stackViewer.scale;
          var mouseStackY = stackViewer.y + ( m.offsetY - stackViewer.viewHeight / 2 ) / stackViewer.scale;

          var project_pos_x = stackViewer.primaryStack.stackToProjectX( stackViewer.z, mouseStackY, mouseStackX );
          var project_pos_y = stackViewer.primaryStack.stackToProjectY( stackViewer.z, mouseStackY, mouseStackX );
          var project_pos_z = stackViewer.primaryStack.stackToProjectZ( stackViewer.z, mouseStackY, mouseStackX );

          CATMAID.statusBar.replaceLast( "[" + project_pos_x.toFixed( 3 ) + ", " + project_pos_y.toFixed( 3 ) + ", " + project_pos_z.toFixed( 3 ) + "]" );

          // update position marks in other open stacks as well
          for ( var i = 0; i < position_markers.length; ++i )
          {
            var current_stack_viewer = position_markers[ i ].stackViewer;

            var stack_pos_x = current_stack_viewer.primaryStack.projectToStackX( project_pos_z, project_pos_y, project_pos_x );
            var stack_pos_y = current_stack_viewer.primaryStack.projectToStackY( project_pos_z, project_pos_y, project_pos_x );

            // positioning is relative to the center of the current view
            var rel_x = ( stack_pos_x - current_stack_viewer.x ) * current_stack_viewer.scale + current_stack_viewer.viewWidth * 0.5 - img_width / 2;
            var rel_y = ( stack_pos_y - current_stack_viewer.y ) * current_stack_viewer.scale + current_stack_viewer.viewHeight * 0.5 - img_height / 2;

            var stack_marker = position_markers[ i ].marker;

            stack_marker.style.left = rel_x + "px";
            stack_marker.style.top = rel_y + "px";
          }
        }

        return false;
      },
      move : function( e )
      {
        stackViewer.moveToPixel(
                                 stackViewer.z,
                                 stackViewer.y - CATMAID.ui.diffY / stackViewer.scale,
                                 stackViewer.x - CATMAID.ui.diffX / stackViewer.scale,
                                 stackViewer.s );
        return false;
      }
    };

    var onpointerup = function( e )
    {
      switch ( CATMAID.ui.getMouseButton( e ) )
      {
      case 1:
        break;
      case 2:
        CATMAID.ui.releaseEvents();
        CATMAID.ui.removeEvent( "onpointermove", onpointermove.move );
        CATMAID.ui.removeEvent( "onpointerup", onpointerup );
        break;
      case 3:
        break;
      }
      return false;
    };

    var onpointerdown = function( e )
    {
      switch ( CATMAID.ui.getMouseButton( e ) )
      {
      case 1:
        // select something ...
        break;
      case 2:
        CATMAID.ui.registerEvent( "onpointermove", onpointermove.move );
        CATMAID.ui.registerEvent( "onpointerup", onpointerup );
        CATMAID.ui.catchEvents( "move" );
        CATMAID.ui.onpointerdown( e );
        CATMAID.ui.catchFocus();
        break;
      case 3:
        break;
      }
      return false;
    };

    var onmousewheel = function( e )
    {
      var xp = stackViewer.x;
      var yp = stackViewer.y;
      var m = CATMAID.ui.getMouse( e, stackViewer.getView() );
      var w = CATMAID.ui.getMouseWheel( e );
      if ( m )
      {
        xp = m.offsetX - stackViewer.viewWidth / 2;
        yp = m.offsetY - stackViewer.viewHeight / 2;
      }
      if ( w )
      {
        if ( w > 0 )
        {
          if ( stackViewer.s < stackViewer.primaryStack.MAX_S )
          {
            stackViewer.moveToPixel(
              stackViewer.z,
              stackViewer.y - Math.floor( yp / stackViewer.scale ),
              stackViewer.x - Math.floor( xp / stackViewer.scale ),
              stackViewer.s + 1 );
          }
        }
        else
        {
          if ( stackViewer.s > 0 )
          {
            var ns = stackViewer.scale * 2;
            stackViewer.moveToPixel(
              stackViewer.z,
              stackViewer.y + Math.floor( yp / ns ),
              stackViewer.x + Math.floor( xp / ns ),
              stackViewer.s - 1 );
          }
        }
      }
      return false;
    };

    /**
     * Adds an position marker for all opened stacks related to the
     * current project.
     */
    this.addPositionMarkers = function()
    {
      var stackViewers = project.getStackViewers();
      for ( var i = 0; i < stackViewers.length; ++i )
      {
        var s_id = stackViewers[ i ].getId();
        // don't add one to the current stack
        if ( s_id == stackViewer.getId() )
            continue;
        // create new image div
        var img = document.createElement( "img" );
        img.src = img_path;
        var position_marker = document.createElement( "div" );
        position_marker.id = "positionMarkerId" + s_id;
        position_marker.style.zIndex = 5;
        position_marker.style.width = img_width;
        position_marker.style.height = img_height;
        position_marker.style.position = "absolute";
        position_marker.appendChild( img );
        // add it to view
        var stack_view = stackViewers[ i ].getView();
        stack_view.appendChild( position_marker );
        position_markers[ position_markers.length ] =
          { marker : position_marker,
            view : stack_view,
            stackViewer : stackViewers[ i ] };
      }
    };

    /**
     * Removes all existant position markers from the views they
     * are attached.
     */
    this.removePositionMarkers = function()
    {
      // remove all the created div tags
      for ( var i = 0; i < position_markers.length; ++i )
      {
        var stack_view = position_markers[ i ].view;
        var stack_marker = position_markers[ i ].marker;
        stack_view.removeChild( stack_marker );
      }
      // Clear the array
      position_markers.length = 0;
    };

    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {
      if ( stackViewer && mouseCatcher.parentNode == stackViewer.getView() )
        stackViewer.getView().removeChild( mouseCatcher );
      mouseCatcher.style.cursor = "default";
      self.removePositionMarkers();
      return;
    };

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStackViewer )
    {
      document.getElementById( "edit_button_select" ).className = "button_active";

      stackViewer = parentStackViewer;

      mouseCatcher.onpointerdown = onpointerdown;
      mouseCatcher.onpointermove = onpointermove.pos;
      mouseCatcher.addEventListener( "wheel", onmousewheel, false );

      mouseCatcher.style.cursor = "url(" + STATIC_URL_JS + "images/svg-circle.cur) 15 15, crosshair";
      stackViewer.getView().appendChild( mouseCatcher );

      // make sure there are no markers already there
      self.removePositionMarkers();
      // create a DIV in the view of every opened stack viewer
      self.addPositionMarkers();

      return;
    };

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function()
    {
      self.unregister();
      document.getElementById( "edit_button_select" ).className = "button";
      stackViewer = null;
      return;
    };

    /** This function should return true if there was any action
      linked to the key code, or false otherwise. */
    this.handleKeyPress = function( e )
    {
      return false;
    };
  }

  // Export selector tool in CATMAID namespace
  CATMAID.Selector = Selector;

})(CATMAID);
