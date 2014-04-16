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

function getTileBaseName3D( stack, pixelPos, adjacent )
{
  if(!adjacent) {
    adjacent = 0;
  }
  var z = pixelPos[ 2 ] + adjacent;
  if( z < 0 ) {
    z = 0;
  }
  if( z > stack.slices[stack.slices.length-1] ) {
    z = stack.slices[stack.slices.length-1];
  }
  if( $.inArray(z, stack.slices) === -1 ) {
    return null;
  }
  return z + "/";
}

/**
 * 
 */
function TileLayer(
		tilelayername,
		stack,						//!< reference to the parent stack
		tileWidth,
		tileHeight,
		tileSource,
		visibility,
		opacity
		)
{
	/**
	 * Return friendly name of this layer.
	 */
	this.getLayerName = function()
	{
		return "Image data";
	};

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
				tiles[ i ][ j ].src = STATIC_URL_JS + "widgets/empty256.gif";
				
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

		var effectiveTileWidth = tileWidth * mag;
		var effectiveTileHeight = tileHeight * mag;

		var fr = Math.floor( stack.yc / effectiveTileHeight );
		var fc = Math.floor( stack.xc / effectiveTileWidth );
		
		var xd = 0;
		var yd = 0;
		
		// If panning only (no scaling, no browsing through z)
		if ( stack.z == stack.old_z && stack.s == stack.old_s )
		{
			var old_fr = Math.floor( stack.old_yc / effectiveTileHeight );
			var old_fc = Math.floor( stack.old_xc / effectiveTileWidth );
			
			// Compute panning in X and Y
			xd = fc - old_fc;
			yd = fr - old_fr;

			// re-order the tiles array on demand
			if ( xd < 0 )
			{
				// Panning to the left:
				// Remove existing last image from each row
				// and preppend a new one pointing to the black tile URL.
				for ( var i = 0; i < tiles.length; ++i )
				{
					tilesContainer.removeChild( tiles[ i ].pop() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					tiles[ i ].unshift( img );
				}
			}
			else if ( xd > 0 )
			{
				// Panning to the right:
				// Remove existing first image from each row
				// and append a new one pointing to the black tile URL.
				for ( var i = 0; i < tiles.length; ++i )
				{
					tilesContainer.removeChild( tiles[ i ].shift() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					tiles[ i ].push( img );
				}
			}
			else if ( yd < 0 )
			{
				// Panning to the top:
				// Remove the last row of tiles
				// and preppend a new row of tiles, all pointing to the black image URL.
				var old_row = tiles.pop();
				var new_row = new Array();
				for ( var i = 0; i < tiles[ 0 ].length; ++i )
				{
					tilesContainer.removeChild( old_row.pop() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					new_row.push( img );
				}
				tiles.unshift( new_row );
			}
			else if ( yd > 0 )
			{
				// Panning to the bottom:
				// Remove the first row of tiles
				// and append a new row of tiles, all pointing to the black image URL.
				var old_row = tiles.shift();
				var new_row = new Array();
				for ( var i = 0; i < tiles[ 0 ].length; ++i )
				{
					tilesContainer.removeChild( old_row.pop() );
					var img = document.createElement( "img" );
					img.alt = "empty";
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
					img.style.visibility = "hidden";
					tilesContainer.appendChild( img );
					new_row.push( img );
				}
				tiles.push( new_row );
			}
		}

		// Adjust the last tile to render with an URL rather than with the black gif.
		// Must run when changing scale, or when changing the size of the canvas window.
		// Considering how inexpensive it is, it is made to run always.
		if (artificialZoom)
		{
			// Adjust last tile index to display to the one intersecting the bottom right
			// of the field of view. The purpose: to set the URL of images beyond the edges
			// to the black gif URL further below.
			// Notice that we add the panning xd, yd as well (which is already in tile units).
			LAST_XT = Math.floor((stack.x * stack.scale + stack.viewWidth) / effectiveTileWidth) + xd;
			LAST_YT = Math.floor((stack.y * stack.scale + stack.viewHeight) / effectiveTileHeight) + yd;
		}
		else
		{
			LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
			LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );
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
					tiles[ i ][ j ].src = STATIC_URL_JS + "widgets/black.gif";
				}
				else
				{
					tiles[ i ][ j ].alt = "";
					tiles[ i ][ j ].src = self.tileSource.getTileURL( project, stack,
						tileBaseName, tileWidth, tileHeight, c, r, zoom);

          // prefetch tiles
          // TODO: fetch information in stack table: -2, -1, 1, 2
					/*
          var adj = [], tmpimg = new Image(), tmptileBaseName;
          for( var jj in adj ) {
            tmptileBaseName = getTileBaseName3D( stack, pixelPos, adj[jj] );
            // only prefetch for type 1
            if( tileSourceType === 1 ) {
              tmpimg.src = self.getTileURL( tmptileBaseName + r + "_" + c + "_" + zoom );
            }
          }
					*/
				}

				tiles[ i ][ j ].style.top = t + "px";
				tiles[ i ][ j ].style.left = l + "px";
				tiles[ i ][ j ].style.visibility = "visible";

				tiles[ i ][ j ].style.width = effectiveTileWidth + "px";
				tiles[ i ][ j ].style.height = effectiveTileHeight + "px";

				l += effectiveTileWidth;

			}
			l = left;
			t += effectiveTileHeight;
		}
		
		
		if (typeof completionCallback !== "undefined") {
			completionCallback();
		}

		return 2;
	}
	
	this.resize = function( width, height )
	{
//		alert( "resize tileLayer of stack" + stack.getId() );
		
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

	/* Set opacity in the range from 0 to 1 */
	this.setOpacity = function( val )
	{
		tilesContainer.style.opacity = val+"";
		self.opacity = val;
		if(val < 0.02) {
			if(self.visible)
				self.isolateTileLayer();
		} else {
			if(!self.visible)
				self.reattachTileLayer();
		}
	}

	this.updateOpacity = function() {
		self.setOpacity( opacity );
	}

	this.getOpacity = function()
	{
		return self.opacity;
	}

	this.isolateTileLayer = function()
	{	
		stack.getView().removeChild( tilesContainer );
		self.visible = false;
	}

	this.reattachTileLayer = function()
	{
		stack.getView().appendChild( tilesContainer );
		self.visible = true;
	}

	// initialise
	var self = this;

	self.opacity = opacity; // in the range [0,1]
	self.visible = visibility;
	self.tileSource = tileSource;

	/* Contains all tiles in a 2d-array */
	var tiles = new Array();
	
	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";

	if( self.visible )
		stack.getView().appendChild( tilesContainer );
	
	var LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
	var LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );

	var overviewLayer;
	if( tilelayername === "TileLayer" ) {
		// Initialize the OverviewLayer on the bottom-right with the correct
		// path to the small thumbnail images depending on the tile source type
		// This is only run for the TileLayer which usually holds the primary
		// raw data, and not for additional overlay layers. Overlay layers are
		// currently not shown with a small image.
		overviewLayer = tileSource.getOverviewLayer( this );
	}
	

}
