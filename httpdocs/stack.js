 /* stack.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 slider.js
 *
 * @todo redo all public interfaces to use physical coordinates instead of pixel coordinates
 */

/**
 */

/**
 * transition object for general animations
 */
function Transition()
{
	/**
	 * returns if there is some transition running or not
	 */
	this.busy = function()
	{
		return ( this.timeout !== false );
	}
	
	/**
	 * returns true, if the requested function is still queued
	 */
	this.queued = function( f )
	{
		q = false;
		for ( var i = 0; i < queue.length; ++i )
		{
			if ( queue[ i ] == f )
			{
				statusBar.replaceLast( "already queued in slot " + i + " of " + queue.length + "." );
				q = true;
				break;
			}
		}
		return q;
	}
	
	/**
	 * forces the transition to finish by setting step = 1
	 */
	this.finish = function()
	{
		step = 1.0;
		return;
	}
	
	/**
	 * registers a function to the queue for waiting or starts it imediately
	 * each function gets the current step as parameter and has to return the next step value
	 */
	this.register = function( t )
	{
		queue.push( t );
		if ( !timeout )
			t();
			timeout = window.setTimeout( run, 25 );
		return;
	}
	
	/**
	 * runs the first element of the queue
	 */
	var run = function()
	{
		if ( timeout ) window.clearTimeout( timeout );
		if ( queue.length > 0 )
			step = queue[ 0 ]( step );
		if ( step > 1 )
		{
			step = 0;
			if ( queue.length > 0 )
				queue.shift();
			//statusBar.replaceLast( "running step " + step + " queue.length " + queue.length );
		}
		if ( queue.length > 0 )
			timeout = window.setTimeout( run, 25 );
		else
			timeout = false;
		return;
	}
	
	// initialize
	var self = this;
	var step = 0;					//!< the transitions state [0.0, ..., 1.0]
	var queue = new Array();		//!< queue of waiting transitions
	var FINISH = false;				//!< set this to force the transition to make an end
	var timeout = false;			//!< window.timeout
}

/**
 * container for the small navigator map widget
 */
function SmallMap(
		stack,			//!< a reference to the stack
		max_y,			//!< maximal height
		max_x			//!< maximal width
)
{
	/**
	 * get the view object
	 */
	this.getView = function()
	{
		return view;
	}
	
	var onclick = function( e )
	{
		var m = ui.getMouse( e );
		if ( m )
		{
			//statusBar.replaceLast( m.offsetX + ", " + m.offsetY );
			stack.moveToPixel( z, Math.floor( m.offsetY / SCALE ), Math.floor( m.offsetX / SCALE ), s );
		}
		return false;
	}
	
	this.update = function(
			nz,
			y,
			x,
			ns,
			screenHeight,
			screenWidth
	)
	{
		z = nz;
		s = ns;
		var scale = 1 / Math.pow( 2, s );
		img.src = stack.image_base + z + "/small.jpg";
		var height = SCALE / scale * screenHeight;
		var width = SCALE / scale * screenWidth;
		rect.style.height = Math.floor( height ) + "px";
		rect.style.width = Math.floor( width ) + "px";
		rect.style.top = Math.floor( SCALE * y - height / 2 ) + "px";
		rect.style.left = Math.floor( SCALE * x - width / 2 ) + "px";
		return;
	}
	
	this.focus = function()
	{
		view.style.zIndex = 8;
		return;
	}
	
	this.blur = function()
	{
		view.style.zIndex = 4;
		return;
	}
	
	// initialise
	if ( !ui ) ui = new UI();
	
	var HEIGHT = parseInt( getPropertyFromCssRules( 3, 3, "height" ) );
	var WIDTH = parseInt( getPropertyFromCssRules( 3, 3, "width" ) );
	var SCALE_Y = HEIGHT / max_y;
	var SCALE_X = WIDTH / max_x;
	var SCALE = Math.min( SCALE_X, SCALE_Y );
	HEIGHT = Math.floor( max_y * SCALE );
	WIDTH = Math.floor( max_x * SCALE );
	
	var s = 0;
	var z = 0;
	
	var view = document.createElement( "div" );
	view.className = "smallMapView";
	view.style.width = WIDTH + "px";
	view.style.height = HEIGHT + "px";
	
	var img = document.createElement( "img" );
	img.className = "smallMapMap";
	//img.src = "map/small.jpg";
	img.onclick = onclick;
	img.style.width = view.style.width;
	img.style.height = view.style.height;
	view.appendChild( img );
	
	var rect = document.createElement( "div" );
	rect.className = "smallMapRect";
	view.appendChild( rect );
	
	var toggle = document.createElement( "div" );
	toggle.className = "smallMapToggle";
	toggle.title = "hide general view";
	toggle.onclick = function( e )
	{
		if ( view.className == "smallMapView_hidden" )
		{
			toggle.title = "hide general view";
			view.className = "smallMapView";
			view.style.width = WIDTH + "px";
			view.style.height = HEIGHT + "px";
		}
		else
		{
			toggle.title = "show general view";
			view.className = "smallMapView_hidden";
			view.style.width = "";
			view.style.height = "";
		}
		return false;
	}
	
	view.appendChild( toggle );
}

/**
 * a stack of slices
 */
function Stack(
		project,					//!< reference to the parent project
		id,							//!< the stack's id
		title,						//!< the stack's title
		dimension,					//!< pixel dimensions {x, y, z}
		resolution,					//!< physical resolution in nm/pixel {x, y, z}
		translation,				//!< physical translation relative to the project in nm {x, y, z}
		image_base,					//!< URL to the image base path
		broken_slices,				//!< broken slices to be excluded from the stack's view
		trakem2_project				//!< boolean that states if a TrakEM2 project is available for this stack
)
{
	/**
	 * update the benchmark (x-resolution) to a proper size
	 */
	var updateBenchmark = function()
	{
		var meter = scale / resolution.x;
		var benchmark_width = 0;
		var benchmark_text = "";
		for ( var i = 0; i < BENCHMARK_SIZES.length; ++i )
		{
			benchmark_text = BENCHMARK_SIZES[ i ];
			benchmark_width = BENCHMARK_SIZES[ i ] * meter;
			if ( benchmark_width > Math.min( 192, viewWidth / 5 ) )
				break;
		}
		var ui = 0;
		while ( benchmark_text >= 1000 && ui < BENCHMARK_UNITS.length - 1 )
		{
			benchmark_text /= 1000;
			++ui;
		}
		benchmark.style.width = benchmark_width + "px";
		benchmark.firstChild.firstChild.replaceChild( document.createTextNode( benchmark_text + " " + BENCHMARK_UNITS[ ui ] ), benchmark.firstChild.firstChild.firstChild );
		return;
	}
	
	var updateControls = function()
	{
		if ( registered )
		{
			if ( slider_s ) slider_s.setByValue( s, true );
      if ( slider_trace_s ) slider_trace_s.setByValue( s, true );
			if ( slider_z ) slider_z.setByValue( z, true );
      if ( slider_trace_z ) slider_trace_z.setByValue( z, true );
      
			if ( input_x ) input_x.value = x;
			if ( input_y ) input_y.value = y;
		}
		
		return;
	}
	
	/**
	 * update all state informations and the screen content
	 */
	var update = function( now )
	{
		smallMap.update( z, y, x, s, viewHeight, viewWidth );
		updateBenchmark();
		
		
		//statusBar.replaceLast( "[" + ( Math.round( x * 10000 * resolution.x ) / 10000 ) + ", " + ( Math.round( y * 10000 * resolution.y ) / 10000 ) + "]" );
		
		if ( !transition.queued( redraw ) )
		{
			if ( now )
				transition.register( redraw );
			else
				redraw();
		}
		
		return
	}
	
	/**
	 * get the pixel coordinates of the current view's top left corner
	 */
	this.screenCoordinates = function()
	{
		var l =
		{
			width : viewWidth / scale,
			height : viewHeight / scale,
			z : z,
			s : s,
			scale : scale
		};
		l.y = Math.floor( y - l.height / 2 );
		l.x = Math.floor( x - l.width / 2 );
		return l;
	}
	
	/**
	 * get the physical project-coordinates to the current view
	 */
	this.projectCoordinates = function()
	{
		var l =
		{
			z : z * resolution.z + translation.z,
			s : s,
			scale : scale,
			y : y * resolution.y + translation.y,
			x : x * resolution.x + translation.x
		};
		return l;
	}
	
	/**
	 * update textlabels by querying it from the server
	 */
	this.updateTextlabels = function()
	{
		var tl_width;
		var tl_height;
		if ( tiles.length == 0 )
		{
			tl_width = 0;
			tl_height = 0;
		}
		else
		{
			tl_width = tiles[ 0 ].length * X_TILE_SIZE / scale;
			tl_height = tiles.length * Y_TILE_SIZE / scale;
		}
		requestQueue.register(
			'model/textlabels.php',
			'POST',
			{
				pid : project.id,
				sid : id,
				z : z * resolution.z + translation.z,
				top : ( y - tl_height / 2 ) * resolution.y + translation.y,
				left : ( x - tl_width / 2 ) * resolution.x + translation.x,
				width : tl_width * resolution.x,
				height : tl_height * resolution.y,
				//scale : ( mode == "text" ? 1 : scale ),	// should we display all textlabels when being in text-edit mode?  could be really cluttered
				scale : scale,
				resolution : resolution.y
			},
			handle_updateTextlabels );
		return;
	}

  /**
   * update treeline nodes by querying them from the server
   * with a bounding volume dependend on the current view
   */
  this.updateNodes = function()
  {
    
    var tl_width;
    var tl_height;
    if ( tiles.length == 0 )
    {
      tl_width = 0;
      tl_height = 0;
    }
    else
    {
      tl_width = tiles[ 0 ].length * X_TILE_SIZE / scale;
      tl_height = tiles.length * Y_TILE_SIZE / scale;
    }
    /*
    console.log("In updateTreelinenodes");
    console.log("scale is: "+scale);
    console.log("X_TILE_SIZE is: "+X_TILE_SIZE);
    console.log("Y_TILE_SIZE is: "+Y_TILE_SIZE);
    console.log("tl_width is: "+tl_width);
    console.log("tl_height is: "+tl_height);
    console.log("x is: "+x);
    console.log("y is: "+y);
    console.log("resolution.x is: "+resolution.x);
    console.log("resolution.y is: "+resolution.y);
    console.log("translation.x is: "+translation.x);
    console.log("translation.y is: "+translation.y);
    console.log('-----computed');
    console.log('z', z * resolution.z + translation.z);
    console.log('top', ( y - tl_height / 2 ) * resolution.y + translation.y);
    console.log('left', ( x - tl_width / 2 ) * resolution.x + translation.x);
    console.log('width', tl_width * resolution.x);
    console.log('height', tl_height * resolution.y);
      */  
    // first synchronize with database
    svgOverlay.updateNodeCoordinatesinDB();

    requestQueue.register(
      'model/node.list.php',
      'POST',
      {
        pid : project.id,
        sid : id,
        z : z * resolution.z + translation.z,
        top : ( y - tl_height / 2 ) * resolution.y + translation.y,
        left : ( x - tl_width / 2 ) * resolution.x + translation.x,
        width : tl_width * resolution.x,
        height : tl_height * resolution.y,
        zres : resolution.z
      },
      handle_updateNodes );
    return;
  }

  /**
   * handle an update-treelinenodes-request answer
   *
   */
  var handle_updateNodes = function( status, text, xml )
  {
    if ( status = 200 )
    {
      //console.log("update noded text", $.parseJSON(text));
      var e = eval( "(" + text + ")" );
      //var e = $.parseJSON(text);
      
      if ( e.error )
      {
        alert( e.error );
      }
      else
      {
        var jso = $.parseJSON(text);
        svgOverlay.refreshNodes(jso);
      }
    }
    return;
  }
  
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	var redraw = function()
	{
		var yc = Math.floor( y * scale - ( viewHeight / 2 ) );
		var xc = Math.floor( x * scale - ( viewWidth / 2 ) );

		var fr = Math.floor( yc / Y_TILE_SIZE );
		var fc = Math.floor( xc / X_TILE_SIZE );
		
		var xd = 0;
		var yd = 0;
		
		if ( z == old_z && s == old_s )
		{
			var old_yc = Math.floor( old_y * old_scale - ( viewHeight / 2 ) );
			var old_xc = Math.floor( old_x * old_scale - ( viewWidth / 2 ) );
			
			var old_fr = Math.floor( old_yc / Y_TILE_SIZE );
			var old_fc = Math.floor( old_xc / X_TILE_SIZE );
			
			xd = fc - old_fc;
			yd = fr - old_fr;
			
			// re-order the tiles array on demand
			if ( xd < 0 )
			{
				for ( var i = 0; i < tiles.length; ++i )
				{
					tilesContainer.removeChild( tiles[ i ].pop() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = "widgets/themes/kde/empty.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					tiles[ i ].unshift( img );
				}
			}
			else if ( xd > 0 )
			{
				for ( var i = 0; i < tiles.length; ++i )
				{
					tilesContainer.removeChild( tiles[ i ].shift() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = "widgets/themes/kde/empty.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					tiles[ i ].push( img );
				}
			}
			else if ( yd < 0 )
			{
				var old_row = tiles.pop();
				var new_row = new Array();
				for ( var i = 0; i < tiles[ 0 ].length; ++i )
				{
					tilesContainer.removeChild( old_row.pop() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = "widgets/themes/kde/empty.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					new_row.push( img );
				}
				tiles.unshift( new_row );
			}
			else if ( yd > 0 )
			{
				var old_row = tiles.shift();
				var new_row = new Array();
				for ( var i = 0; i < tiles[ 0 ].length; ++i )
				{
					tilesContainer.removeChild( old_row.pop() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = "widgets/themes/kde/empty.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					new_row.push( img );
				}
				tiles.push( new_row );
			}
		}
		
		var top;
		var left;
		
		if ( yc >= 0 )
			top  = -( yc % Y_TILE_SIZE );
		else
			top  = -( ( yc + 1 ) % Y_TILE_SIZE ) - Y_TILE_SIZE + 1;
		if ( xc >= 0 )
			left = -( xc % X_TILE_SIZE );
		else
			left = -( ( xc + 1 ) % X_TILE_SIZE ) - X_TILE_SIZE + 1;
		
		var t = top;
		var l = left;

		// update the images sources
		for ( var i = 0; i < tiles.length; ++i )
		{
			var r = fr + i;
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
			{
				var c = fc + j;
				if ( r < 0 || c < 0 || r > LAST_YT || c > LAST_XT )
				{
					tiles[ i ][ j ].alt = "";
					tiles[ i ][ j ].src = "widgets/black.gif";
				}
				else
				{
					tiles[ i ][ j ].alt = z + "/" + ( fr + i ) + "_" + ( fc + j ) + "_" + s;
					tiles[ i ][ j ].src = image_base + tiles[ i ][ j ].alt + ".jpg";
				}
				tiles[ i ][ j ].style.top = t + "px";
				tiles[ i ][ j ].style.left = l + "px";
				tiles[ i ][ j ].style.visibility = "visible";
				
				l += X_TILE_SIZE;
			}
			l = left;
			t += Y_TILE_SIZE;
		}
		
		// render the profiles
		
		/*
		var l = self.screenCoordinates();
		for ( var i = 0; i < profiles.length; ++i )
		{
			profiles[ i ].updateScreen( l );
			var v = profiles[ i ].getView();
			var a = v.parentNode && v.parentNode == view;		//!< already on the screen	
			if ( profiles[ i ].isVisible() )
			{
				if ( !a ) view.appendChild( v );
				profiles[ i ].place();
				profiles[ i ].clearCanvas();
				if ( i == spi && mode == "edit" )
				{
					profiles[ i ].drawOutline();
					profiles[ i ].drawHandles();
				}
				else
					profiles[ i ].draw();
			}
			else if ( a )
				view.removeChild( v );
		}
		*/
		
		// update and request textlabels
		if ( show_textlabels )
		{
			if ( z != old_z ||
				s != old_s ||
				xd != 0 ||
				yd != 0 )
			{
				self.updateTextlabels();
			}
			
			//! left-most border of the view in physical project coordinates
			var screen_left = ( ( x - viewWidth / scale / 2 ) ) * resolution.x + translation.x;
			var screen_top = ( ( y - viewHeight / scale / 2 ) ) * resolution.y + translation.y;
			
			for ( var i = 0; i < textlabels.length; ++i )
			{
				textlabels[ i ].redraw(
					screen_left,
					screen_top,
					scale );
			}        
      
		}
		if ( show_tracing )
		{
      if ( z != old_z ||
        s != old_s ||
        xd != 0 ||
        yd != 0 )
      {
        self.updateNodes();
      }
      // redraw the overlay
      svgOverlay.redraw(
        screen_left,
        screen_top,
        scale);
		}
		
		// render the treenodes
		/*
		if ( show_treenodes )
		{
		  self.updateTreelinenodes();
		  console.log("redraw treenodes...");
		}*/
		
		// update crop box if available
		if ( mode == "crop" && cropBox )
			updateCropBox();
			
		//----------------------------------------------------------------------
		/**
		 * This question is completely useless but without asking it, Firefox on
		 * Linux systems will not redraw the screen properly.  Took me ... to
		 * find this out.
		 */
		var a = view.offsetWidth;
		//----------------------------------------------------------------------
			
		
		old_z = z;
		old_y = y;
		old_x = x;
		old_s = s;
		old_scale = scale;
		
		return 2;
	}
	
	/**
	 * initialise the tiles array
	 */
	var initTiles = function( rows, cols )
	{
		while ( tilesContainer.firstChild )
			tilesContainer.removeChild( tilesContainer.firstChild );
		
		delete tiles;
		tiles = new Array();
		
		for ( var i = 0; i < rows; ++i )
		{
			tiles[ i ] = new Array();
			for ( var j = 0; j < cols; ++j )
			{
				tiles[ i ][ j ] = document.createElement( "img" );
				tiles[ i ][ j ].alt = "empty";
				tiles[ i ][ j ].src = "widgets/themes/kde/empty.gif";
				
				tilesContainer.appendChild( tiles[ i ][ j ] );
			}
		}
		
		updateControls();
		update();
		
		return;
	}
	
	/**
	 * get the view element
	 */
	this.getView = function()
	{
		return view;
	}
	
	/**
	 * move to physical project-coordinates in nanometer
	 */
	this.moveTo = function( zp, yp, xp, sp )
	{
		if ( typeof sp == "number" )
		{
			s = Math.max( 0, Math.min( MAX_S, Math.round( sp ) ) );
			scale = 1 / Math.pow( 2, s );
		}
		
		LAST_XT = Math.floor( MAX_X * scale / X_TILE_SIZE );
		LAST_YT = Math.floor( MAX_Y * scale / Y_TILE_SIZE );
		
		x = Math.max( 0, Math.min( MAX_X, Math.round( ( xp - translation.x ) / resolution.x ) ) );
		y = Math.max( 0, Math.min( MAX_Y, Math.round( ( yp - translation.y ) / resolution.y ) ) );
		
		var z1;
		var z2;
		z1 = z2 = Math.round( ( zp - translation.z ) / resolution.z );
		while ( broken_slices[ z1 ] && broken_slices[ z2 ] )
		{
			z1 = Math.max( 0, z1 - 1 );
			z2 = Math.min( MAX_Z, z2 + 1 );
		}
		if ( !broken_slices[ z1 ] ) z = z1;
		else z = z2;
		z = Math.max( 0, Math.min( MAX_Z, z ) );
		
		update();
		
		return;
	}
	
	/**
	 * move to pixel coordinates
	 */
	this.moveToPixel = function( zp, yp, xp, sp )
	{
		s = Math.max( 0, Math.min( MAX_S, sp ) );

		scale = 1 / Math.pow( 2, s );
		
		project.moveTo(
			zp * resolution.z + translation.z,
			yp * resolution.y + translation.y,
			xp * resolution.x + translation.x );
		
		updateControls();
		
		return true;
	}
	
	
	var onmousemove = 
	{
	  trace :function( e )
    {
      
      // take into account the shift of the svgOverlay
      var xp;
      var yp;
      var m = ui.getMouse( e );

      if ( m )
      {
        // add right move of svgOverlay to the m.offsetX
        offX = m.offsetX + svgOverlay.offleft;
        // add down move of svgOverlay to the m.offsetY
        offY = m.offsetY + svgOverlay.offtop;
        
        var pos_x = translation.x + ( x +  ( offX - viewWidth / 2 ) / scale ) * resolution.x;
        var pos_y = translation.x + ( y + ( offY - viewHeight / 2 ) / scale ) * resolution.y;
        statusBar.replaceLast( "[" + pos_x.toFixed( 3 ) + ", " + pos_y.toFixed( 3 ) + "]" );
      }
      // continue with event handling
      return true;
    }, 
		pos : function( e )
		{
			var xp;
			var yp;
			var m = ui.getMouse( e );

			if ( m )
			{
				var pos_x = translation.x + ( x + ( m.offsetX - viewWidth / 2 ) / scale ) * resolution.x;
				var pos_y = translation.x + ( y + ( m.offsetY - viewHeight / 2 ) / scale ) * resolution.y;
				statusBar.replaceLast( "[" + pos_x.toFixed( 3 ) + ", " + pos_y.toFixed( 3 ) + "]" );
			}
			return false;
		},
		move : function( e )
		{
			self.moveToPixel( z, y - ui.diffY / scale, x - ui.diffX / scale, s );
			return false;
		},
		crop : function( e )
		{
			if ( cropBox )
			{
				cropBox.right += ui.diffX / scale * resolution.x;
				cropBox.bottom += ui.diffY / scale * resolution.y;
				updateCropBox();
			}
		}
	};
	
	var onmouseup =
	{
		move : function( e )
		{
			ui.releaseEvents()
			ui.removeEvent( "onmousemove", onmousemove.move );
			ui.removeEvent( "onmouseup", onmouseup.move );
			return false;
		},
		edit : function( e )
		{
			ui.releaseEvents()
			ui.removeEvent( "onmousemove", profiles[ spi ].onmousemove );
			ui.removeEvent( "onmouseup", onmouseup.edit );
			
			return false;
		},
		crop : function( e )
		{
			ui.releaseEvents();
			ui.removeEvent( "onmousemove", onmousemove.crop );
			ui.removeEvent( "onmouseup", onmouseup.crop );
		},
    trace : function( e )
    {
      console.log("unregister trace");
      ui.releaseEvents();
      ui.removeEvent( "onmousemove", svgOverlay.onmousemove );
      ui.removeEvent( "onmouseup", onmouseup.move );
    }
	};
	
	var onmousedown =
	{
	  trace : function( e )
	  {
	    
      var b = ui.getMouseButton( e );
      switch ( b )
      {
      case 2:
        // afford dradding in tracing mode
        ui.registerEvent( "onmousemove", onmousemove.move );
        ui.registerEvent( "onmouseup", onmouseup.move );
        ui.catchEvents( "move" );
        ui.onmousedown( e );

        //! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
        document.body.firstChild.focus();
        break;
      }
      
      return true;
      
	  },
		move : function( e )
		{          
			ui.registerEvent( "onmousemove", onmousemove.move );
			ui.registerEvent( "onmouseup", onmouseup.move );
			ui.catchEvents( "move" );
			ui.onmousedown( e );
			
			//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
			document.body.firstChild.focus();
			
			return false;
		},
		edit : function( e )
		{
			var m = ui.getMouse( e );
			if ( m )
			{
				var pos_x = Math.round( x + ( m.offsetX - viewWidth / 2 ) / scale );
				var pos_y = Math.round( y + ( m.offsetY - viewHeight / 2 ) / scale );
				var spi = -1;
				for ( var i = 0; i < profiles.length; ++i )
				{
					if ( profiles[ i ].isInside( pos_x, pos_y ) )
					{
						spi = i;
						break;
					}
				}
				if ( spi >= 0 )
				{
					profiles[ spi ].onmousedown( e );
					profiles[ spi ].clearCanvas();
					profiles[ spi ].drawOutline();
					profiles[ spi ].drawHandles();
					ui.registerEvent( "onmousemove", profiles[ spi ].onmousemove );
					ui.registerEvent( "onmouseup", onmouseup.edit );
					ui.catchEvents();
					ui.onmousedown( e );
				}
			}
			
			//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
			document.body.firstChild.focus();
			
			return false;
		},
		text : function( e )
		{
			var b = ui.getMouseButton( e );
			switch ( b )
			{
			case 2:
				ui.registerEvent( "onmousemove", onmousemove.move );
				ui.registerEvent( "onmouseup", onmouseup.move );
				ui.catchEvents( "move" );
				ui.onmousedown( e );

				//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
				document.body.firstChild.focus();
				break;
			default:
  				var m = ui.getMouse( e );
  				var tlx = ( x + ( m.offsetX - viewWidth / 2 ) / scale ) * resolution.x + translation.x;
  				var tly = ( y + ( m.offsetY - viewHeight / 2 ) / scale ) * resolution.y + translation.y;
  				var tlz = z * resolution.z + translation.z;
			
				project.createTextlabel( tlx, tly, tlz, resolution.y, scale );
			}
			
			return false;
		},
		crop : function( e )
		{
			var b = ui.getMouseButton( e );
			switch ( b )
			{
			case 2:
				ui.registerEvent( "onmousemove", onmousemove.move );
				ui.registerEvent( "onmouseup", onmouseup.move );
				ui.catchEvents( "move" );
				break;
			default:
				if ( cropBox )
				{
					view.removeChild( cropBox.view );
					delete cropBox;
					cropBox = false;
				}
				var m = ui.getMouse( e );
				cropBox = {
					left : ( x + ( m.offsetX - viewWidth / 2 ) / scale ) * resolution.x + translation.x,
					top : ( y + ( m.offsetY - viewHeight / 2 ) / scale ) * resolution.y + translation.y
				};
				cropBox.right = cropBox.left;
				cropBox.bottom = cropBox.top;
				cropBox.view = document.createElement( "div" );
				cropBox.view.className = "cropBox";
				cropBox.text = document.createElement( "p" );
				cropBox.text.appendChild( document.createTextNode( "0 x 0" ) );
				
				cropBox.view.appendChild( cropBox.text );				
				view.appendChild( cropBox.view );
				
				ui.registerEvent( "onmousemove", onmousemove.crop );
				ui.registerEvent( "onmouseup", onmouseup.crop );
				ui.catchEvents( "crosshair" );
			}
			ui.onmousedown( e );
			
			//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
			document.body.firstChild.focus();
			
			return false;
		}
	};
	
	var onmousewheel = 
	{
		zoom : function( e )
		{
			var w = ui.getMouseWheel( e );
			if ( w )
			{
				if ( w > 0 )
				{
					slider_z.move( 1 );
          slider_trace_z.move( 1 );
				}
				else
				{
          slider_z.move( -1 );
          slider_trace_z.move( -1 );
				}
			}
			return false;
		},
		move : function( e )
		{
			var xp = x;
			var yp = y;
			var m = ui.getMouse( e );
			var w = ui.getMouseWheel( e );
			if ( m )
			{
				xp = m.offsetX - viewWidth / 2;
				yp = m.offsetY - viewHeight / 2;
				//statusBar.replaceLast( ( m.offsetX - viewWidth / 2 ) + " " + ( m.offsetY - viewHeight / 2 ) );
			}
			if ( w )
			{
				if ( w > 0 )
				{
					if ( s < MAX_S )
					{
						self.moveToPixel(
							z,
							y - Math.floor( yp / scale ),
							x - Math.floor( xp / scale ),
							s + 1 );
					}
				}
				else
				{
					if ( s > 0 )
					{
						var ns = scale * 2;
						self.moveToPixel(
							z,
							y + Math.floor( yp / ns ),
							x + Math.floor( xp / ns ),
							s - 1 );
					}
				}
			}
			return false;
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
	}
	
	this.changeSliceDelayed = function( val )
	{
		if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
		changeSliceDelayedParam = { z : val };
		changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
	}
	
	this.changeSlice = function( val )
	{
		self.moveToPixel( val, y, x, s );
		return;
	}
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
	}
	
	this.changeScaleDelayed = function( val )
	{
		if ( changeScaleDelayedTimer ) window.clearTimeout( changeScaleDelayedTimer );
		changeScaleDelayedParam = { s : val };
		changeScaleDelayedTimer = window.setTimeout( changeScaleDelayedAction, 100 );
	}
	
	this.changeScale = function( val )
	{
		self.moveToPixel( z, y, x, val );
		return;
	}
	//--------------------------------------------------------------------------
	
	var changeXByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = x;
		else self.moveToPixel( z, y, val, s );
		return;
	}
	
	var changeYByInput = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) ) this.value = y;
		self.moveToPixel( z, val, x, s );
		return;
	}
	
	var YXMouseWheel = function( e )
	{
		var w = ui.getMouseWheel( e );
		if ( w )
		{
			this.value = parseInt( this.value ) - w;
			this.onchange();
		}
		return false
	}
	
	/**
	 * change the input mode of the slice
	 *
	 * @param string m { "select", "move", "edit" }
	 */
	this.setMode = function( m )
	{
		if ( cropBox )
		{
			view.removeChild( cropBox.view );
			delete cropBox;
			cropBox = false;
		}
    // svg overlay logic		
		mouseCatcher.style.zIndex = 5;
		svgOverlay.hide();
		show_tracing = false;
		
		switch( m )
		{
		case "text":
			mode = "text";
			mouseCatcher.style.cursor = "crosshair";
			//mouseCatcher.style.display = "none";
			mouseCatcher.onmousedown = onmousedown.text;
			mouseCatcher.onmousemove = onmousemove.pos;
			show_textlabels = true;
			self.updateTextlabels();
			for ( var i = 0; i < textlabels.length; ++i )
			{
				textlabels[ i ].setEditable( true );
			}
			//updateControls();
			//update();
			break;
		case "crop":
			mode = "crop";
			mouseCatcher.style.cursor = "crosshair";
			mouseCatcher.onmousedown = onmousedown.crop;
			mouseCatcher.onmousemove = onmousemove.pos;
			if ( show_textlabels ) self.updateTextlabels();
			break;
		case "trace":
		  // console.log("in tracing mode");
		  mode = "trace"
      mouseCatcher.style.cursor = "crosshair";
      
      // for the surrounding mouse event catcher
      mouseCatcher.onmousedown = onmousedown.move;
      mouseCatcher.onmousemove = onmousemove.pos;
      // but also for the svgoverlay, stops dragging node mdoe
      svgOverlay.view.onmousedown = onmousedown.trace;
      // XXX: coordinates are adjusted, either position or dragging but not both :(
      // svgOverlay.view.onmousemove = onmousemove.trace;

      try
      {
        svgOverlay.view.addEventListener( "DOMMouseScroll", onmousewheel.zoom, false );
        /* Webkit takes the event but does not understand it ... */
        svgOverlay.view.addEventListener( "mousewheel", onmousewheel.zoom, false );
      }
      catch ( error )
      {
        try
        {
          svgOverlay.view.onmousewheel = onmousewheel.zoom;
        }
        catch ( error ) {}
      }
            
      show_tracing = true;
      svgOverlay.show();
      self.updateNodes();
      for ( var i = 0; i < textlabels.length; ++i )
      {
        textlabels[ i ].setEditable( false );
      }
		  break;
		case "select":
		case "move":
		default:
			mode = "move";
			//mouseCatcher.style.display = "block";
			mouseCatcher.style.cursor = "move";
			mouseCatcher.onmousedown = onmousedown.move;
			mouseCatcher.onmousemove = onmousemove.pos;
			try
			{
				mouseCatcher.addEventListener( "DOMMouseScroll", onmousewheel.zoom, false );
				/* Webkit takes the event but does not understand it ... */
				mouseCatcher.addEventListener( "mousewheel", onmousewheel.zoom, false );
			}
			catch ( error )
			{
				try
				{
					mouseCatcher.onmousewheel = onmousewheel.zoom;
				}
				catch ( error ) {}
			}
			if ( show_textlabels ) self.updateTextlabels();
			
			for ( var i = 0; i < textlabels.length; ++i )
			{
				textlabels[ i ].setEditable( false );
			}
			//updateControls();
			//update();
			break;
    /*
    case "profile":
      mode = "profile";
      mouseCatcher.style.display = "block";
      mouseCatcher.style.cursor = "crosshair";
      mouseCatcher.onmousedown = onmousedown.edit;
      mouseCatcher.onmousemove = onmousemove.pos;
      try
      {
        mouseCatcher.removeEventListener( "DOMMouseScroll", onmousewheel.move, false );
      }
      catch ( error )
      {
        try
        {
          mouseCatcher.onmousewheel = null;
        }
        catch ( error ) {}
      }
      //! @todo import the available profiles of the slice
      break;
    */
		}
		return;
	}
	
	
	this.showTextlabels = function( b )
	{
		show_textlabels = b;
		if ( show_textlabels )
			self.updateTextlabels();
		else
		{
			//! remove all old text labels
			while ( textlabels.length > 0 )
			{
				var t = textlabels.pop();
				try		//!< we do not know if it really is in the DOM currently
				{
					view.removeChild( t.getView() );
				}
				catch ( error ) {}
			}
		}
		return;
	}

  this.createLink = function( fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype )
  {
    svgOverlay.createLink(fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype);
  }
  
  this.createTreenodeLink = function( fromid, toid )
  {
    svgOverlay.createTreenodeLink(fromid, toid);
  }
	
	this.showTags = function ( val )
	{
      svgOverlay.showTags(val);
	}
	
	this.toggleTracing = function( m )
	{
    switch ( m )
    {
    case "skeletontracing":
      svgOverlay.set_tracing_mode(m);
      break;
    case "synapsedropping":
      svgOverlay.set_tracing_mode(m);
      break;
    case "dbsync":
      svgOverlay.updateNodeCoordinatesinDB();
      break;
    case "goactive":
      if(atn!=null) {
        project.moveTo(
                  svgOverlay.pix2physZ(atn.z),
                  svgOverlay.pix2physY(atn.y),
                  svgOverlay.pix2physX(atn.x)
                  );
      }
      break;
    case "skeletonsplitting":
      if(atn!=null) {
        svgOverlay.splitSkeleton();
      } else {
        alert('Need to activate a treenode before splitting!');
      }
      break;
    case "skeletonreroot":
      if(atn!=null) {
        svgOverlay.rerootSkeleton();
      } else {
        alert('Need to activate a treenode before rerooting!');
      }
      break;
    case "tagging":
      if(atn!=null) {
        svgOverlay.tagATN();
      } else {
        alert('Need to activate a treenode or connector before tagging!');
      }
      break;
    case "togglelabels":
      svgOverlay.toggleLabels();
      break;
    case "exportswc":
      if(atn!=null) {
        svgOverlay.exportSWC();
      } else {
        alert('Need to activate a treenode before exporting to SWC!');
      }
      break;
    case "showskeleton":
      if(atn!=null) {
        svgOverlay.showSkeleton();
      } else {
        alert('Need to activate a treenode or connector before showing them!');
      }
      break;
    }
    return;
	  
	}
	
	
	/*
	 * resize the viewport
	 */
	this.resize = function( left, top, width, height )
	{
		viewHeight = height;
		viewWidth = width;
		
		// resize svgOverlay
		//svgOverlay.update(viewWidth, viewHeight);
		
		view.style.left = left + "px";
		view.style.top = top + "px";
		view.style.width = viewWidth + "px";
		view.style.height = viewHeight + "px";
		
		var rows = Math.floor( viewHeight / Y_TILE_SIZE ) + 2;
		var cols = Math.floor( viewWidth / X_TILE_SIZE ) + 2;

		initTiles( rows, cols );
		 		
		return;
	}
	
	/**
	 * crop a microstack by initiating a server backend
	 * @todo which has to be built
	 */
	var crop = function()
	{
		var scale = 1 / Math.pow( 2, slider_crop_s.val );
		var numSections = Math.max( slider_crop_top_z.val, slider_crop_bottom_z.val ) - Math.min( slider_crop_top_z.val, slider_crop_bottom_z.val ) + 1;
		var pixelWidth = Math.round( ( Math.max( cropBox.left, cropBox.right ) - Math.min( cropBox.left, cropBox.right ) ) / resolution.x * scale );
		var pixelHeight = Math.round( ( Math.max( cropBox.top, cropBox.bottom ) - Math.min( cropBox.top, cropBox.bottom ) ) / resolution.y * scale );
		var str = "The generated stack will have " + numSections + " sections.\n";
		str += "Each section will have a size of " + pixelWidth + "x" + pixelHeight + "px.\n";
		str += "Do you really want to crop this microstack?";
		
		if ( !window.confirm( str ) ) return false; 
		requestQueue.register(
		'model/crop.php',
		'POST',
		{
			pid : project.id,
			sid : id,
			left : cropBox.left,
			top : cropBox.top,
			front : slider_crop_top_z.val * resolution.z + translation.z,
			right : cropBox.right,
			bottom : cropBox.bottom,
			back : slider_crop_bottom_z.val * resolution.z + translation.z,
			scale : scale,
			reregister : ( document.getElementById( "crop_reregister" ).checked ? 1 : 0 )
		},
		handle_crop );
		return false;
	}
	
	/**
	 * handle the answer of a microstack crop request
	 * this answer is not the ready made microstack itself but a confirmation that the cropping process was invoked
	 */
	var handle_crop = function( status, text, xml )
	{
		if ( status = 200 )
		{
			statusBar.replaceLast( text );
			var e = eval( "(" + text + ")" );
			if ( e.error )
			{
				alert( e.error );
			}
			else
			{
				//alert( "crop microstack ( " + e.left + ", " + e.top + ", " + e.front + " ) -> ( " + e.right + ", " + e.bottom + ", " + e.back + " ) at scale " + e.scale );
				alert( "Cropping the microstack...\nThis operation may take some time, you will be notified as soon as the cropped stack is ready." );
			}
		}
		return;
	}
	
	this.registerZoomControl = function( c )
	{
		slider_s = c;
		return;
	}

  this.registerZoomControlTrace = function( c )
  {
    slider_trace_s = c;
    return;
  }
  
	this.registerSliceControl = function( c )
	{
		slider_z = c;
		return;
	}
	
  this.registerSliceControlTrace = function( c )
  {
    slider_trace_z = c;
    return;
  }
	
	this.registerXControl = function( c )
	{
		input_x = c;
		return;
	}
	
	this.registerYControl = function( c )
	{
		input_y = c;
		return;
	}
	
	this.registerCropTopSliceControl = function( c )
	{
		slider_crop_top_z = c;
		return;
	}
	
	this.registerCropBottomSliceControl = function( c )
	{
		slider_crop_bottom_z = c;
		return;
	}
	
	this.registerCropZoomControl = function( c )
	{
		slider_crop_s = c;
		return;
	}
	
	this.registerCropApplyControl = function( c )
	{
		button_crop_apply = c;
		return;
	}
	
	/**
	 * register all GUI control elements and event handlers
	 */
	this.register = function()
	{
		registered = true;
		slider_s.update(
			MAX_S,
			0,
			MAX_S + 1,
			s,
			this.changeScaleDelayed );
    slider_trace_s.update(
      MAX_S,
      0,
      MAX_S + 1,
      s,
      this.changeScaleDelayed );
      
		if ( slices.length < 2 )	//!< hide the slider_z if there is only one slice
		{
			slider_z.getView().parentNode.style.display = "none";
      slider_trace_z.getView().parentNode.style.display = "none";
			slider_crop_top_z.getView().parentNode.style.display = "none";
			slider_crop_bottom_z.getView().parentNode.style.display = "none";
		}
		else
		{
			slider_z.getView().parentNode.style.display = "block";
      slider_trace_z.getView().parentNode.style.display = "block";
			slider_crop_top_z.getView().parentNode.style.display = "block";
			slider_crop_bottom_z.getView().parentNode.style.display = "block";
		}
		slider_z.update(
			0,
			0,
			slices,
			z,
			this.changeSliceDelayed );
			
    slider_trace_z.update(
      0,
      0,
      slices,
      z,
      this.changeSliceDelayed );

		slider_crop_top_z.update(
			0,
			0,
			slices,
			z,
			this.changeSliceDelayed );
		slider_crop_bottom_z.update(
			0,
			0,
			slices,
			z,
			this.changeSliceDelayed );
		
		/**
		 * Cropping is possible with an attached TrakEM2 project only.
		 */
		if ( trakem2_project )
		{
			document.getElementById( "edit_button_crop" ).style.display = "block";	
			button_crop_apply.onclick = crop;
		}
		else
		{
			document.getElementById( "edit_button_crop" ).style.display = "none";
		}
		
		input_x.onchange = changeXByInput;
		try
		{
			input_x.addEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = YXMouseWheel;
			}
			catch ( error ) {}
		}
		
		input_y.onchange = changeYByInput;
		try
		{
			input_y.addEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = YXMouseWheel;
			}
			catch ( error ) {}
		}
		return;
	}
	
	/**
	 * unregister all GUI control connections and event handlers
	 */
	this.unregister = function()
	{
		registered = false;
		slider_s.update(
			0,
			1,
			undefined,
			0,
			null );

    slider_trace_s.update(
      0,
      1,
      undefined,
      0,
      null );
      
		slider_z.update(
			0,
			1,
			undefined,
			0,
			null );

    slider_trace_z.update(
      0,
      1,
      undefined,
      0,
      null );
      
		input_x.onchange = null;
		try
		{
			input_x.removeEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = null;
			}
			catch ( error ) {}
		}
		
		input_y.onchange = null;
		try
		{
			input_y.removeEventListener( "DOMMouseScroll", YXMouseWheel, false );
		}
		catch ( error )
		{
			try
			{
				input_x.onmousewheel = null;
			}
			catch ( error ) {}
		}
		return;
	}
	
	
	/**
	 * set the GUI focus to the stack
	 */
	this.focus = function()
	{
		project.focusStack( self );
		
		smallMap.focus();
		self.setMode( mode );
		stackInfo.className = "stackInfo_selected";
		self.register();
		self.moveToPixel( z, y, x, s );
		
		if ( cropBox ) cropBox.view.style.display = "block";
		
		return;
	}
	
	/**
	 * remove the GUI focus from the stack
	 */
	this.blur = function()
	{
		self.unregister();
		mouseCatcher.style.cursor = "default";
		mouseCatcher.style.zIndex = 7;
		mouseCatcher.onmousedown = function( e )
		{
			self.focus();
			return onmousedown[ mode ]( e );
		}
		stackInfo.className = "stackInfo";
		
		if ( cropBox ) cropBox.view.style.display = "none";
		
		return;
	}
	
	/**
	 * handle an update-textlabels-request answer
	 *
	 */
	var handle_updateTextlabels = function( status, text, xml )
	{
		if ( status = 200 )
		{
			//alert( "data: " + text );
			var e = eval( "(" + text + ")" );
			if ( e.error )
			{
				alert( e.error );
			}
			else
			{
				//! remove all old text labels
				while ( textlabels.length > 0 )
				{
					var t = textlabels.pop();
					try		//!< we do not know if it really is in the DOM currently
					{
						view.removeChild( t.getView() );
					}
					catch ( error ) {}
				}
				
				if ( text )
				{
					//! import the new
					for ( var i in e )
					{
						var t = new Textlabel( e[ i ], resolution, translation );
						textlabels.push( t );
						view.appendChild( t.getView() );
						if ( mode == "text" )
							t.setEditable( true );
					}
				}
			}
			update();
		}
		return;
	}
	
	/**
	 * display the cropBox
	 */
	var updateCropBox = function()
	{
		var t = Math.min( cropBox.top, cropBox.bottom );
		var b = Math.max( cropBox.top, cropBox.bottom );
		var l = Math.min( cropBox.left, cropBox.right );
		var r = Math.max( cropBox.left, cropBox.right );
		//! left-most border of the view in physical project coordinates
	    var screen_left = ( ( x - viewWidth / scale / 2 ) + translation.x ) * resolution.x;
		var screen_top = ( ( y - viewHeight / scale / 2 ) + translation.y ) * resolution.y;
							
		var rx = resolution.x / scale;
		var ry = resolution.y / scale;
		
		cropBox.view.style.left = Math.floor( ( l - screen_left ) / rx ) + "px";
		cropBox.view.style.top = Math.floor( ( t - screen_top ) / ry ) + "px";
		cropBox.view.style.width = Math.floor( ( r - l ) / rx ) + "px";
		cropBox.view.style.height = Math.floor( ( b - t ) / ry ) + "px";
		
		statusBar.replaceLast( l.toFixed( 3 ) + ", " + t.toFixed( 3 ) + " -> " + r.toFixed( 3 ) + "," + b.toFixed( 3 ) );
		
		cropBox.text.replaceChild( document.createTextNode( ( r - l ).toFixed( 3 ) + " x " + ( b - t ).toFixed( 3 ) ), cropBox.text.firstChild );
		
		return;
	}
	
	
	// initialise
	var self = this;
	if ( !ui ) ui = new UI();
	
	this.id = id;
	
	this.image_base = image_base;
	
	//!< in nanometers
	var BENCHMARK_SIZES = new Array(
			10,
			20,
			25,
			50,
			100,
			200,
			250,
			500,
			1000,
			2000,
			2500,
			5000,
			10000,
			20000,
			25000,
			50000,
			100000,
			200000,
			250000,
			500000,
			1000000,
			2000000,
			2500000,
			5000000,
			10000000,
			20000000,
			25000000,
			50000000,
			100000000,
			200000000,
			250000000,
			500000000,
			1000000000,
			2000000000,
			2500000000,
			5000000000,
			10000000000,
			20000000000,
			25000000000,
			50000000000,
			100000000000,
			200000000000,
			250000000000,
			500000000000 );
	var BENCHMARK_UNITS = new Array(
			"nm",
			unescape( "%u03BCm" ),
			"mm",
			"m" );
	
	
	//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	// these parameters should be get dynamically from the server,
	// they define the size and resolution properties of the slice stack
	//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	
	//var Y_TILE_SIZE = parseInt( getPropertyFromCssRules( 3, 2, "height" ) );
	//var X_TILE_SIZE = parseInt( getPropertyFromCssRules( 3, 2, "width" ) );
	var Y_TILE_SIZE = 256;
	var X_TILE_SIZE = 256;
	
	var MAX_X = dimension.x - 1;   //!< the last possible x-coordinate
	var MAX_Y = dimension.y - 1;   //!< the last possible y-coordinate
	var MAX_Z = dimension.z - 1;   //!< the last possible z-coordinate
	
	
	//! estimate the zoom levels
	var MAX_S = 0;
	var min_max = Math.min( MAX_X, MAX_Y );
	var tile_size = Y_TILE_SIZE;
	if ( min_max == MAX_X ) tile_size = X_TILE_SIZE;
	while ( min_max / Math.pow( 2, MAX_S ) / tile_size > 3 )
		++MAX_S;
	
	//! all possible slices
	var slices = new Array();
	for ( var i = 0; i < dimension.z; ++i )
	{
		if ( !broken_slices[ i ] )
			slices.push( i );
	}
	
	//profiles have to be requested from the server as well
	var profiles = new Array();					//!< list of recent profiles
	//profiles[ 0 ] = new Profile();
	var spi = 0;								//!< selected profile index
	
	//-------------------------------------------------------------------------
	
	var transition = new Transition();
	
	// extract the borders of the viewer window from CSS rules
	var viewTop    = parseInt( getPropertyFromCssRules( 3, 0, "top" ) );
	var viewBottom = parseInt( getPropertyFromCssRules( 3, 0, "bottom" ) );
	var viewLeft   = parseInt( getPropertyFromCssRules( 3, 0, "left" ) );
	var viewRight  = parseInt( getPropertyFromCssRules( 3, 0, "right" ) );
	
	var tiles = new Array();
	
	var view = document.createElement( "div" );
	view.className = "sliceView";
	
	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";
	view.appendChild( tilesContainer );
	

	
	//! stack info header
	var stackInfo = document.createElement( "div" );
	stackInfo.className = "stackInfo";
	var stackTitle = document.createElement( "p" );
	stackTitle.className = "stackTitle";
	stackTitle.appendChild( document.createTextNode( title ) );
	stackInfo.appendChild( stackTitle );
	var stackClose = document.createElement( "p" );
	stackClose.className = "stackClose";
	stackClose.onmousedown = function( e )
	{
		project.removeStack( id );
		return true;
	};
	stackClose.appendChild( document.createTextNode( "close [ x ]" ) );
	stackInfo.appendChild( stackClose );
	
	view.appendChild( stackInfo );
	
	
	var smallMap = new SmallMap( self, MAX_Y, MAX_X );
	view.appendChild( smallMap.getView() );
	
	var benchmark = document.createElement( "div" );
	benchmark.className = "sliceBenchmark";
	benchmark.appendChild( document.createElement( "p" ) );
	benchmark.firstChild.appendChild( document.createElement( "span" ) );
	benchmark.firstChild.firstChild.appendChild( document.createTextNode( "test" ) );
	view.appendChild( benchmark );
	
	var textlabels = new Array();
	
	var cropBox = false;
	
  //! mouse catcher
  var mouseCatcher = document.createElement( "div" );
  mouseCatcher.className = "sliceMouseCatcher";
  view.appendChild( mouseCatcher );

	// take care, that all values are within a proper range
	var z = 1;
	var y = Math.floor( MAX_Y / 2 );
	var x = Math.floor( MAX_X / 2 );
	var s = MAX_S;
	
	var old_z = -1;
	var old_y = y;
	var old_x = x;
	var old_s = s;
	
	var viewWidth;
	var viewHeight;
	
	var scale = 1 / Math.pow( 2, s );
	var old_scale = scale;
	
  // svg overlay for the tracing
  var svgOverlay = new SVGOverlay(resolution, translation, dimension, scale);
  view.appendChild( svgOverlay.view );
  svgOverlay.hide();
	
	var LAST_XT = Math.floor( MAX_X * scale / X_TILE_SIZE );
	var LAST_YT = Math.floor( MAX_Y * scale / Y_TILE_SIZE );
	
	var mode = "move";
	var show_textlabels = true;
  var show_tracing = false;
  
	var registered = false;
	
	var slider_s;
  var slider_trace_s;
	var slider_z;
	var slider_trace_z;
	var input_x;
	var input_y;
	
	var slider_crop_top_z;
	var slider_crop_bottom_z;
	var slider_crop_s;
	var button_crop_apply;

	//self.setMode( "move" );
}
