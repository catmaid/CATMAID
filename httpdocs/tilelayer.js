/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/**
 * tilelayer.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 slider.js
 *
 * @todo redo all public interfaces to use physical coordinates instead of pixel coordinates
 */

/**
 * Get the part of the tile name that consists of dimensions z, t, ...
 * For a 3D stack this will return "z/", for a 4D stack "t/z/", etc.
 *
 * @param pixelPos pixel position of the stack [x, y, z, t, ...]
 */
function getTileBaseName( pixelPos )
{
	var n = pixelPos.length;
	var dir = ""
	for ( var i = n - 1; i > 1; --i )
	{
		dir += pixelPos[ i ] + "/";
	}
	return dir;
}


/**
 * 
 */
function TileLayer(
		stack,						//!< reference to the parent stack
		baseURL,					//!< base URL for image tiles
		tileWidth,
		tileHeight,
		fileExtension
		)
{
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
				tiles[ i ][ j ].src = "widgets/empty256.gif";
				
				tilesContainer.appendChild( tiles[ i ][ j ] );
			}
		}
		return;
	}
	
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	this.redraw = function(completionCallback)
	{
		var pixelPos = [ stack.x, stack.y, stack.z ];
		var tileBaseName = getTileBaseName( pixelPos );

		var zoom = stack.s;
		var mag = 1.0;
		var artificialZoom = false;
		/* If the zoom is negative we zoom in digitally. For this
		 * we take the zero zoom level and adjust the tile properties.
		 * This way we let the browser do the zooming work.
		 */
		if (zoom < 0) {
			artificialZoom = true;
			mag = Math.pow(2, -zoom);
			zoom = 0;
		}

		effectiveTileWidth = tileWidth * mag;
		effectiveTileHeight = tileHeight * mag;

		var fr = Math.floor( stack.yc / effectiveTileHeight );
		var fc = Math.floor( stack.xc / effectiveTileWidth );
		
		var xd = 0;
		var yd = 0;
		
		if ( stack.z == stack.old_z && stack.s == stack.old_s )
		{
			var old_fr = Math.floor( stack.old_yc / effectiveTileHeight );
			var old_fc = Math.floor( stack.old_xc / effectiveTileWidth );
			
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
					img.src = "widgets/empty256.gif";
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
					img.src = "widgets/empty256.gif";
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
					img.src = "widgets/empty256.gif";
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
					img.src = "widgets/empty256.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					new_row.push( img );
				}
				tiles.push( new_row );
			}
		}
		
		if ( stack.s != stack.old_s)
		{
			if (artificialZoom)
			{
				LAST_XT = Math.floor( ( stack.dimension.x - 1 ) / tileWidth );
				LAST_YT = Math.floor( ( stack.dimension.y - 1 ) / tileHeight );
			}
			else
			{
				LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
				LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );
			}
		}
		
		var top;
		var left;
		
		if ( stack.yc >= 0 )
			top  = -( stack.yc % effectiveTileHeight );
		else
			top  = -( ( stack.yc + 1 ) % effectiveTileHeight ) - effectiveTileHeight + 1;
		if ( stack.xc >= 0 )
			left = -( stack.xc % effectiveTileWidth );
		else
			left = -( ( stack.xc + 1 ) % effectiveTileWidth ) - effectiveTileWidth + 1;
		
		var t = top;
		var l = left;

		// update the images sources
		for ( var i = 0; i < tiles.length; ++i )
		{
			var r = fr + i;
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
			{
				var c = fc + j;
				
				/**
				 * TODO Test if updating the URLs always was required to
				 * guarantee homogeneous update speed for modulo-changing steps
				 * and non-modulo changing steps.  Write more comments in
				 * general.
				 */
				if ( r < 0 || c < 0 || r > LAST_YT || c > LAST_XT )
				{
					tiles[ i ][ j ].alt = "";
					tiles[ i ][ j ].src = "widgets/black.gif";
				}
				else
				{
					// TODO: use this for the new tile naming scheme:
					// tiles[ i ][ j ].alt = tileBaseName + stack.s + "/" + ( fr + i ) + "/" + ( fc + j );
					tiles[ i ][ j ].alt = tileBaseName + r + "_" + c + "_" + zoom;
					tiles[ i ][ j ].src = self.getTileURL( tiles[ i ][ j ].alt );
				}
				tiles[ i ][ j ].style.top = t + "px";
				tiles[ i ][ j ].style.left = l + "px";
				tiles[ i ][ j ].style.visibility = "visible";

				tiles[ i ][ j ].style.width = effectiveTileWidth + "px";
				tiles[ i ][ j ].style.height = effectiveTileHeight + "px";

				l += effectiveTileWidth;
				
				//alert( l + ", " + t );
				
			}
			l = left;
			t += effectiveTileHeight;
		}

		if (typeof completionCallback !== "undefined") {
			completionCallback();
		}

		return 2;
	}

	/**
	 * Creates the URL for a tile.
	 */
	this.getTileURL = function(tileId) {
		return baseURL + tileId + "." + fileExtension;
	}
	
	this.resize = function( width, height )
	{
//		alert( "resize tileLayer of stack" + stack.getId() );
		
		/* TODO 2 more?  Should be 1---not?! */
		var rows = Math.floor( height / tileHeight ) + 2;
		var cols = Math.floor( width / tileWidth ) + 2;
		initTiles( rows, cols );
		self.redraw();
		return;
	}
	
	/**
	 * Get the width of an image tile.
	 */
	this.getTileWidth = function(){ return tileWidth; }
	
	/**
	 * Get the height of an image tile.
	 */
	this.getTileHeight = function(){ return tileHeight; }
	
	/**
	 * Get the number of tile columns.
	 */
	this.numTileColumns = function()
	{
		if ( tiles.length == 0 )
			return 0;
		else
			return tiles[ 0 ].length;
	}
	
	/**
	 * Get the number of tile rows.
	 */
	this.numTileColumns = function(){ return tiles.length; }
	
	/**
	 * Get the stack.
	 */
	this.getStack = function(){ return stack; }
	
	var OverviewLayer = function()
	{
		this.redraw = function()
		{
			img.src = baseURL + stack.z + "/small." + fileExtension;
			return;
		}
		
		this.unregister = function()
		{
			if ( img.parentNode )
				img.parentNode.removeChild( img );
		}
		
		var self = this;
		
		var img = document.createElement( "img" );
		img.className = "smallMapMap";
		img.src = "map/small." + fileExtension;
		
		stack.overview.getView().appendChild( img );
		stack.overview.addLayer( "tilelayer", this );
	}

	this.setOpacity = function( val )
	{
		tilesContainer.style.opacity = val+"";
		opacity = val;
	}

	this.getOpacity = function()
	{
		return opacity;
	}

	// initialise
	var self = this;

	// internal opacity variable
	var opacity = 100;
	
	/* Contains all tiles in a 2d-array */
	var tiles = new Array();
	
	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";
	stack.getView().appendChild( tilesContainer );
	
	var overviewLayer = new OverviewLayer();
	
	var LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
	var LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );
	
	self.baseURL = baseURL;
}
