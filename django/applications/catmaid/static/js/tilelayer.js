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
			if (this.alt === "h") return;
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
	};
	
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	this.redraw = function(completionCallback)
	{
		var pixelPos = [ stack.x, stack.y, stack.z ];
		var tileBaseName = getTileBaseName( pixelPos );

		var tileInfo = this.tilesForLocation(stack.xc, stack.yc, stack.z, stack.s);

		var effectiveTileWidth = tileWidth * tileInfo.mag;
		var effectiveTileHeight = tileHeight * tileInfo.mag;
		
		var xd = 0;
		var yd = 0;
		
		// If panning only (no scaling, no browsing through z)
		if ( stack.z == stack.old_z && stack.s == stack.old_s )
		{
			var old_fr = Math.floor( stack.old_yc / effectiveTileHeight );
			var old_fc = Math.floor( stack.old_xc / effectiveTileWidth );
			
			// Compute panning in X and Y
			xd = tileInfo.first_col - old_fc;
			yd = tileInfo.first_row - old_fr;

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

		var to_buffer =
				(tileInfo.last_col - Math.max(0, tileInfo.first_col) + 1) *
				(tileInfo.last_row - Math.max(0, tileInfo.first_row) + 1);
		var buffered = 0;
		buffering = z_loading;

		// Set a timeout for slow connections to swap in images for the zslice
		// whether or not they have buffered.
		if (buffering) {
			window.clearTimeout(swapBuffersTimeout);
			swapBuffersTimeout = window.setTimeout(swapBuffers, 3000);
		}

		// Callback to deal with buffered image loading. Calls swapLayers once
		// all requested images have been loaded in the tile buffer.
		function bufferLoadDeferred()
		{
			return function() {
				if (!this.alt || !buffering) return;
				buffered = buffered + 1;
				if (buffered === to_buffer)
				{
					window.clearTimeout(swapBuffersTimeout);
					swapBuffers();
				}
			};
		}

		var nextL, nextT, seamRow;

		// update the images sources
		for ( var i = 0; i < tiles.length; ++i )
		{
			var r = tileInfo.first_row + i;
			nextT = t + effectiveTileHeight;
			seamRow = Math.round(nextT) - nextT > 0;
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
			{
				var c = tileInfo.first_col + j;
				var tile = tiles[ i ][ j ];

				nextL = l + effectiveTileWidth;

				if ( c >= 0 && r >= 0 && c <= tileInfo.last_col && r <= tileInfo.last_row )
				{
					var source = self.tileSource.getTileURL( project, stack,
						tileBaseName, tileWidth, tileHeight, c, r, tileInfo.zoom);

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

					if (tile.src === source)
					{
						tiles_buf[i][j].alt = "";
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
							tiles_buf[ i ][ j ].alt = "t";
							tiles_buf[ i ][ j ].src = source;
						}
						else
						{
							tiles_buf[i][j].alt = "";
							tile.src = source;
						}
					}
				}
				else
				{
					tile.alt = "h";
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
	};

	// Helper function to swap source images from tiles_buf into tiles
	var swapBuffers = function ()
	{
		if (!buffering) return;
		buffering = false; // If timeout, prevent load callbacks from calling
		for ( var i = 0; i < tiles.length; ++i )
		{
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
			{
				if (tiles_buf[ i ][ j ].alt && !tiles[ i ][ j ].alt)
				{
					tiles[i][j].src = tiles_buf[i][j].src;
				}
			}
		}
	};

	this.resize = function( width, height )
	{
		var rows = Math.ceil( height / tileHeight ) + 1;
		var cols = Math.ceil( width / tileWidth ) + 1;
		if (tiles.length === 0 || tiles.length !== rows || tiles[0].length !== cols)
			initTiles( rows, cols );
		self.redraw();
	};

	/**
	 * Loads tiles at specified indices, but does not display them, so that
	 * they are cached for future vieweing.
	 * @param  {[[]]}                     tileIndices      an array of tile
	 *                                                     indices like:
	 *                                                     [c, r, z, s]
	 * @param  {function(number, number)} progressCallback
	 */
	this.cacheTiles = function(tileIndices, progressCallback, cachedCounter, loaders) {
		if (typeof cachedCounter === 'undefined') cachedCounter = 0;

		// Truncate request to no more than 3000 tiles.
		if (tileIndices.length > 3000) tileIndices.splice(3000);

		progressCallback(tileIndices.length, cachedCounter);
		// Check if the queue is empty
		if (0 === tileIndices.length) return;

		var BATCH_SIZE = 16;
		var numLoaders = Math.min(BATCH_SIZE, tileIndices.length);
		var loaded = 0;

		if (typeof loaders === 'undefined') {
			loaders = [];
			for (var i = 0; i < numLoaders; ++i)
				loaders[i] = new Image();
		}

		tileIndices.splice(0, numLoaders).forEach(function (tileInd, i) {
			var img = loaders[i];
			img.onload = img.onerror = function () {
				loaded += 1;
				if (loaded >= numLoaders)
					self.cacheTiles(tileIndices, progressCallback, cachedCounter + numLoaders, loaders);
			};
			img.src = self.tileSource.getTileURL(
					project, stack,
					getTileBaseName(tileInd.slice(0, 3)),
					tileWidth, tileHeight, tileInd[0], tileInd[1], tileInd[3]);
		});
	};

	/**
	 * Loads tiles for views centered at specified project locations, but does
	 * not display them, so that they are cached for future vieweing.
	 * @param  {[[]]}                     locations        an array of project
	 *                                                     coords like:
	 *                                                     [x, y, z]
	 * @param  {function(number, number)} progressCallback
	 */
	this.cacheLocations = function(locations, progressCallback) {
		var s = stack.s;

		var tileIndices = locations.reduce(function (tileInds, loc) {
			var tileInfo = self.tilesForLocation(
					// Convert project coords to scaled stack coords of a view corner.
					loc[0] * stack.scale / stack.resolution.x - stack.viewWidth / 2,
					loc[1] * stack.scale / stack.resolution.y - stack.viewHeight / 2,
					Math.floor(loc[2] / stack.resolution.z),
					s);
			for (var i = tileInfo.first_col; i <= tileInfo.last_col; ++i)
				for (var j = tileInfo.first_row; j <= tileInfo.last_row; ++j)
					tileInds.push([i, j, tileInfo.z, tileInfo.zoom]);

			return tileInds;
		}, []);

		this.cacheTiles(tileIndices, progressCallback);
	};

	this.tilesForLocation = function (xc, yc, z, s) {
		var zoom = s;
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
			mag = Math.pow(2, zoom - s);
		}

		var effectiveTileWidth = tileWidth * mag;
		var effectiveTileHeight = tileHeight * mag;

		var fr = Math.floor( yc / effectiveTileHeight );
		var fc = Math.floor( xc / effectiveTileWidth );

		var lr, lc;

		// Adjust the last tile in a row or column to be visible rather than hidden.
		// Must run when changing scale, or when changing the size of the canvas window.
		// Considering how inexpensive it is, it is made to run always.

		// Adjust last tile index to display to the one intersecting the bottom right
		// of the field of view. The purpose: to hide images beyond the stack edges.
		// Notice that we add the panning xd, yd as well (which is already in tile units).
		lc = Math.floor((stack.x * stack.scale + stack.viewWidth / 2) / effectiveTileWidth);
		lr = Math.floor((stack.y * stack.scale + stack.viewHeight / 2) / effectiveTileHeight);

		// Clamp last tile coordinates within the slice edges.
		lc = Math.min(lc, Math.floor((stack.dimension.x * Math.pow(2, -zoom) - 1) / tileWidth));
		lr = Math.min(lr, Math.floor((stack.dimension.y * Math.pow(2, -zoom) - 1) / tileHeight));

		return {
			first_row: fr,
			first_col: fc,
			last_row:  lr,
			last_col:  lc,
			z:         z,
			zoom:      zoom,
			mag: mag
		};
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
	var buffering = false;
	var swapBuffersTimeout;

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
