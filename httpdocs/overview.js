/**
 * Overview navigator widget
 */
function Overview(
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
	
	// initialize
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
	img.src = "map/small.jpg";
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

