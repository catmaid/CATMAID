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
		baseURL,`					//!< base URL for image tiles
		tileWitdh,
		tileHeight
		)
{
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	var redraw = function()
	{
		var pixelPos = [ stack.x, stack.y, stack.z ];
		var tileBaseName = getTileBaseName( pixelPos );

		var fr = Math.floor( stack.yc / tileHeight );
		var fc = Math.floor( stack.xc / tileWidth );
		
		var xd = 0;
		var yd = 0;
		
		if ( stack.z == stack.old_z && stack.s == stack.old_s )
		{
			var old_fr = Math.floor( stack.old_yc / tileHeight );
			var old_fc = Math.floor( stack.old_xc / tileWidth );
			
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
					img.src = "gfx/empty256.gif";
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
					img.src = "gfx/empty256.gif";
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
					img.src = "gfx/empty256.gif";
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
					img.src = "gfx/empty256.gif";
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
			top  = -( yc % tileHeight );
		else
			top  = -( ( yc + 1 ) % tileHeight ) - tileHeight + 1;
		if ( xc >= 0 )
			left = -( xc % tileWidth );
		else
			left = -( ( xc + 1 ) % tileWidth ) - tileWidth + 1;
		
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
					tiles[ i ][ j ].alt = tileBaseName + ( fr + i ) + "_" + ( fc + j ) + "_" + stack.s;
					tiles[ i ][ j ].src = baseURL + tiles[ i ][ j ].alt + ".jpg";
				}
				tiles[ i ][ j ].style.top = t + "px";
				tiles[ i ][ j ].style.left = l + "px";
				tiles[ i ][ j ].style.visibility = "visible";
				
				l += tileWidth;
			}
			l = left;
			t += tileHeight;
		}
		
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
				tiles[ i ][ j ].src = "gfx/empty256.gif";
				
				tilesContainer.appendChild( tiles[ i ][ j ] );
			}
		}
		stack.
		return;
	}
	
	var resize = function( width, height )
	{
		alert( "resize tileLayer of stack" + stack.getId() );
		
		/* TODO 2 more?  Should be 1---not?! */
		var rows = Math.floor( height / tileHeight ) + 2;
		var cols = Math.floor( width / tileWidth ) + 2;
		initTiles( rows, cols );
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
	
	// initialise
	var self = this;
	
	/* Contains all tiles in a 2d-array */
	var tiles = new Array();
	
	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";
	stack.getView().appendChild( tilesContainer );
	
	var LAST_XT = Math.floor( stack.dimension.x * stack.scale / tileWidth );
	var LAST_YT = Math.floor( stack.dimension.y * stack.scale / tileHeight );
}
