/**
 * selector.js
 *
 * requirements:
 *	 tools.js
 *	 slider.js
 *   stack.js
 */

/**
 */

/**
 * Selector tool.  Moves the stack around and should serve as a general selector
 * of any annotated structure.
 */
function Selector()
{
	var self = this;
	var stack = null;
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
	
	var onmousemove =
	{
		pos : function( e )
		{
			var xp;
			var yp;
			var m = CATMAID.ui.getMouse( e, stack.getView() );
			if ( m )
			{
				var mouseStackX = stack.x + ( m.offsetX - stack.viewWidth / 2 ) / stack.scale;
				var mouseStackY = stack.y + ( m.offsetY - stack.viewHeight / 2 ) / stack.scale;

				var project_pos_x = stack.stackToProjectX( stack.z, mouseStackY, mouseStackX );
				var project_pos_y = stack.stackToProjectY( stack.z, mouseStackY, mouseStackX );
				var project_pos_z = stack.stackToProjectZ( stack.z, mouseStackY, mouseStackX );

				CATMAID.statusBar.replaceLast( "[" + project_pos_x.toFixed( 3 ) + ", " + project_pos_y.toFixed( 3 ) + ", " + project_pos_z.toFixed( 3 ) + "]" );

				// update position marks in other open stacks as well
				for ( var i = 0; i < position_markers.length; ++i )
				{
					var current_stack = position_markers[ i ].stack;

					var stack_pos_x = current_stack.projectToStackX( project_pos_z, project_pos_y, project_pos_x );
					var stack_pos_y = current_stack.projectToStackY( project_pos_z, project_pos_y, project_pos_x );

					// positioning is relative to the center of the current view
					var rel_x = ( stack_pos_x - current_stack.x ) * current_stack.scale + current_stack.viewWidth * 0.5 - img_width / 2;
					var rel_y = ( stack_pos_y - current_stack.y ) * current_stack.scale + current_stack.viewHeight * 0.5 - img_height / 2;

					var stack_marker = position_markers[ i ].marker;

					stack_marker.style.left = rel_x + "px";
					stack_marker.style.top = rel_y + "px";
				}
			}

			return false;
		},
		move : function( e )
		{
			stack.moveToPixel( stack.z,
                               stack.y - CATMAID.ui.diffY / stack.scale,
                               stack.x - CATMAID.ui.diffX / stack.scale,
                               stack.s );
			return false;
		}
	};
	
	var onmouseup = function( e )
	{
		switch ( CATMAID.ui.getMouseButton( e ) )
		{
		case 1:
			break;
		case 2:
			CATMAID.ui.releaseEvents();
			CATMAID.ui.removeEvent( "onmousemove", onmousemove.move );
			CATMAID.ui.removeEvent( "onmouseup", onmouseup );
			break;
		case 3:
			break;
		}
		return false;
	};
	
	var onmousedown = function( e )
	{
		switch ( CATMAID.ui.getMouseButton( e ) )
		{
		case 1:
			// select something ...
			break;
		case 2:			
			CATMAID.ui.registerEvent( "onmousemove", onmousemove.move );
			CATMAID.ui.registerEvent( "onmouseup", onmouseup );
			CATMAID.ui.catchEvents( "move" );
			CATMAID.ui.onmousedown( e );
			CATMAID.ui.catchFocus();
			break;
		case 3:
			break;
		}
		return false;
	};
	
	var onmousewheel = function( e )
	{
		var xp = stack.x;
		var yp = stack.y;
		var m = CATMAID.ui.getMouse( e, stack.getView() );
		var w = CATMAID.ui.getMouseWheel( e );
		if ( m )
		{
			xp = m.offsetX - stack.viewWidth / 2;
			yp = m.offsetY - stack.viewHeight / 2;
		}
		if ( w )
		{
			if ( w > 0 )
			{
				if ( stack.s < stack.MAX_S )
				{
					stack.moveToPixel(
						stack.z,
						stack.y - Math.floor( yp / stack.scale ),
						stack.x - Math.floor( xp / stack.scale ),
						stack.s + 1 );
				}
			}
			else
			{
				if ( stack.s > 0 )
				{
					var ns = stack.scale * 2;
					stack.moveToPixel(
						stack.z,
						stack.y + Math.floor( yp / ns ),
						stack.x + Math.floor( xp / ns ),
						stack.s - 1 );
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
		var stacks = project.getStacks();
		for ( var i = 0; i < stacks.length; ++i )
		{
			var s_id = stacks[ i ].id;
			// don't add one to the current stack
			if ( s_id == stack.id )
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
			var stack_view = stacks[ i ].getView();
			stack_view.appendChild( position_marker );
			position_markers[ position_markers.length ] =
				{ marker : position_marker,
				  view : stack_view,
				  stack : stacks[ i ] };
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
		if ( stack && mouseCatcher.parentNode == stack.getView() )
			stack.getView().removeChild( mouseCatcher );
		mouseCatcher.style.cursor = "default";
		self.removePositionMarkers();
		return;
	};
	
	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
		document.getElementById( "edit_button_select" ).className = "button_active";
		
		stack = parentStack;

		mouseCatcher.onmousedown = onmousedown;
		mouseCatcher.onmousemove = onmousemove.pos;
		mouseCatcher.addEventListener( "wheel", onmousewheel, false );

		mouseCatcher.style.cursor = "url(" + STATIC_URL_JS + "images/svg-circle.cur) 15 15, crosshair";
		stack.getView().appendChild( mouseCatcher );

		// make sure there are no markers already there
		self.removePositionMarkers();
		// create a DIV in the view of every opened stack
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
		stack = null;
		return;
	};

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */
	this.handleKeyPress = function( e )
	{
		return false;
	};
}

