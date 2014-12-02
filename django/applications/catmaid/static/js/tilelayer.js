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
	var dir = "";
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
		displayname,
		stack,						//!< reference to the parent stack
		tileWidth,
		tileHeight,
		tileSource,
		visibility,
		opacity,
		showOverview
		)
{
	/**
	 * Return friendly name of this layer.
	 */
	this.getLayerName = function()
	{
		return self.displayname;
	};

	/**
	 * initialise the tiles array
	 */
	var initTiles = function( rows, cols )
	{
		while ( tilesContainer.firstChild )
			tilesContainer.removeChild( tilesContainer.firstChild );

		var tileOnload = function ()
		{
			this.style.visibility = "visible";
			this.alt = "l"; // Set a flag to indicate this image has loaded
		};
		
		tiles = [];

		tiles_buf = [];

		
		for ( var i = 0; i < rows; ++i )
		{
			tiles[ i ] = [];
			tiles_buf[ i ] = [];
			for ( var j = 0; j < cols; ++j )
			{
				tiles[ i ][ j ] = document.createElement( "img" );
				tiles[ i ][ j ].alt = "";
				tiles[ i ][ j ].style.visibility = "hidden";
				tiles[ i ][ j ].onload = tileOnload;

				tiles_buf[ i ][ j ] = document.createElement( "img" );
				tiles_buf[ i ][ j ].alt = "";
				tiles_buf[ i ][ j ].visibility = "hidden";
				
				tilesContainer.appendChild( tiles[ i ][ j ] );
			}
		}

		return;
	};
	
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
		if (zoom < 0 || zoom % 1 !== 0) {
			artificialZoom = true;
			/* For nonintegral zoom levels the ceiling is used to select
			 * source image zoom level. While using the floor would allow
			 * better image quality, it would requiring dynamically
			 * increasing the number of tiles to fill the viewport since
			 * in that case effectiveTileWidth < tileWidth.
			 */
			zoom = Math.max(0, Math.ceil(zoom));
			/* Magnification is positive for digital zoom beyond image
			 * resolution and negative for non-integral zooms within
			 * image resolution.
			 */
			mag = Math.pow(2, zoom - stack.s);
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
				// Move the last column of tiles to the first column
				for ( var i = tiles.length - 1; i >= 0; --i )
				{
					var img = tiles[ i ].pop();
					img.style.visibility = "hidden";
					tiles[ i ].unshift( img );
				}
			}
			else if ( xd > 0 )
			{
				// Panning to the right:
				// Move the first column of tiles to the last column
				for ( var i = tiles.length - 1; i >= 0; --i )
				{
					var img = tiles[ i ].shift();
					img.style.visibility = "hidden";
					tiles[ i ].push( img );
				}
			}

			if ( yd < 0 )
			{
				// Panning to the top:
				// Move the last row of tiles to the first row
				var old_row = tiles.pop();
				for ( var i = old_row.length - 1; i >= 0; --i )
				{
					old_row[ i ].style.visibility = "hidden";
				}
				tiles.unshift( old_row );
			}
			else if ( yd > 0 )
			{
				// Panning to the bottom:
				// Move the first row of tiles to the last row
				var old_row = tiles.shift();
				for ( var i = old_row.length - 1; i >= 0; --i )
				{
					old_row[ i ].style.visibility = "hidden";
				}
				tiles.push( old_row );
			}
		}

		// Adjust the last tile in a row or column to be visible rather than hidden.
		// Must run when changing scale, or when changing the size of the canvas window.
		// Considering how inexpensive it is, it is made to run always.
		if (artificialZoom)
		{
			// Adjust last tile index to display to the one intersecting the bottom right
			// of the field of view. The purpose: to hide images beyond the stack edges.
			// Notice that we add the panning xd, yd as well (which is already in tile units).
			LAST_XT = Math.floor((stack.x * stack.scale + stack.viewWidth) / effectiveTileWidth) + xd;
			LAST_YT = Math.floor((stack.y * stack.scale + stack.viewHeight) / effectiveTileHeight) + yd;

			// Clamp last tile coordinates within the slice edges.
			LAST_XT = Math.min(LAST_XT, Math.floor((stack.dimension.x * Math.pow(2, -zoom) - 1) / tileWidth));
			LAST_YT = Math.min(LAST_YT, Math.floor((stack.dimension.y * Math.pow(2, -zoom) - 1) / tileHeight));
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

		// Detect if moving to a new Z. If so, attempt to preload images to
		// paint at once (but let regular code run for new stacks.)
		var z_loading = stack.z !== stack.old_z && stack.s === stack.old_s;

		var to_buffer = 0;
		var buffered = 0;
		for ( var i = 0; i < tiles.length; ++i )
		{
			var r = fr + i;
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
			{
				var c = fc + j;
				if ( r >= 0 && c >= 0 && r <= LAST_YT && c <= LAST_XT )
				{
					to_buffer = to_buffer + 1;
				}
			}
		}

		// Helper function to swap source images from tiles_buf into tiles
		var swapLayers = function ()
		{
			to_buffer = NaN; // If timeout, prevent load callbacks from calling
			for ( var i = 0; i < tiles.length; ++i )
			{
				var r = fr + i;
				for ( var j = 0; j < tiles[ 0 ].length; ++j )
				{
					var c = fc + j;
					if ( r >= 0 && c >= 0 && r <= LAST_YT && c <= LAST_XT &&
						tiles_buf[ i ][ j ].src && !tiles[ i ][ j ].alt)
					{
						tiles[i][j].src = tiles_buf[i][j].src;
					}
				}
			}
		};

		// Set a timeout for slow connections to swap in images for the zslice
		// whether or not they have buffered.
		if (z_loading) var swapLayersTimeout = window.setTimeout(swapLayers, 3000);

		// Callback to deal with buffered image loading. Calls swapLayers once
		// all requested images have been loaded in the tile buffer.
		function bufferLoadDeferred()
		{
			return function() {
				buffered = buffered + 1;
				if (buffered === to_buffer)
				{
					window.clearTimeout(swapLayersTimeout);
					swapLayers();
				}
			};
		}

		var nextL, nextT, seamRow;

		// update the images sources
		for ( var i = 0; i < tiles.length; ++i )
		{
			var r = fr + i;
			nextT = t + effectiveTileHeight;
			seamRow = Math.round(nextT) - nextT > 0;
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
			{
				var c = fc + j;
				var tile = tiles[ i ][ j ];

				nextL = l + effectiveTileWidth;

				if ( r >= 0 && c >= 0 && r <= LAST_YT && c <= LAST_XT )
				{
					var source = self.tileSource.getTileURL( project, stack,
						tileBaseName, tileWidth, tileHeight, c, r, zoom);

					if (tile.src === source)
					{
						// If a tile was hidden earlier, but we now wish to
						// show it again and it happens to have the same src,
						// Chrome will not fire the onload event if we set src.
						// Instead check the flag we set in alt when loaded.
						if (tile.alt)
						{
							tile.style.visibility = "visible";
						}
					}
					else
					{
						tile.alt = ""; // Mark that the correct image for this
									   // tile has not yet loaded.
						if (z_loading)
						{
							tiles_buf[ i ][ j ].onload = bufferLoadDeferred();
							tiles_buf[ i ][ j ].src = source;
						}
						else
						{
							tile.src = source;
						}
					}

					tile.style.top = t + "px";
					tile.style.left = l + "px";

					// To prevent tile seams when the browser is going to round the
					// edge of the next column up a pixel, grow the width of this
					// column slightly to fill the gap
					if (Math.round(nextL) - nextL > 0) {
						tile.style.width = Math.ceil(effectiveTileWidth) + "px";
					} else {
						tile.style.width = effectiveTileWidth + "px";
					}

					// As above, prevent tile seams when the next row will round up
					if (seamRow) {
						tile.style.height = Math.ceil(effectiveTileHeight) + "px";
					} else {
						tile.style.height = effectiveTileHeight + "px";
					}
				}
				else
				{
					tile.style.visibility = "hidden";
				}

				l = nextL;
			}
			l = left;
			t = nextT;
		}
		
		
		if (typeof completionCallback !== "undefined") {
			completionCallback();
		}

		return 2;
	};
	
	this.resize = function( width, height )
	{
//		alert( "resize tileLayer of stack" + stack.getId() );
		
		var rows = Math.floor( height / tileHeight ) + 2;
		var cols = Math.floor( width / tileWidth ) + 2;
		initTiles( rows, cols );
		self.redraw();
		return;
	};
	
	/**
	 * Get the width of an image tile.
	 */
	this.getTileWidth = function(){ return tileWidth; };
	
	/**
	 * Get the height of an image tile.
	 */
	this.getTileHeight = function(){ return tileHeight; };
	
	/**
	 * Get the number of tile columns.
	 */
	this.numTileColumns = function()
	{
		if ( tiles.length == 0 )
			return 0;
		else
			return tiles[ 0 ].length;
	};
	
	/**
	 * Get the number of tile rows.
	 */
	this.numTileColumns = function(){ return tiles.length; };
	
	/**
	 * Get the stack.
	 */
	this.getStack = function(){ return stack; };

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
	};

	this.updateOpacity = function() {
		self.setOpacity( opacity );
	};

	this.getOpacity = function()
	{
		return self.opacity;
	};

	this.isolateTileLayer = function()
	{	
		stack.getView().removeChild( tilesContainer );
		self.visible = false;
	};

	this.reattachTileLayer = function()
	{
		stack.getView().appendChild( tilesContainer );
		self.visible = true;
	};

	// initialise
	var self = this;

	self.displayname = displayname;
	self.opacity = opacity; // in the range [0,1]
	self.visible = visibility;
	self.tileSource = tileSource;

	/* Contains all tiles in a 2d-array */
	var tiles = [];
	var tiles_buf = [];

	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";

	if( self.visible )
		stack.getView().appendChild( tilesContainer );
	
	var LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
	var LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );

	if( showOverview ) {
		// Initialize the OverviewLayer on the bottom-right with the correct
		// path to the small thumbnail images depending on the tile source type
		// This is only run for the TileLayer which usually holds the primary
		// raw data, and not for additional overlay layers. Overlay layers are
		// currently not shown with a small image.
		var overviewLayer = tileSource.getOverviewLayer( this );
	}
	

}
