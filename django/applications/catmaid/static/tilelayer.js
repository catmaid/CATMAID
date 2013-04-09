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

function Tile( width, height, onload, ctx )
{
	var self = this;
	var x = 0;
	var y = 0;
	var scale = 1;
	self.loaded = false;
	
	self.setPosition = function( newX, newY )
	{
		x = newX;
		y = newY;
	}
	
	self.paint = function( scale )
	{
		ctx.drawImage( img, x, y, width * scale, height * scale );
	}
	
	self.setURL = function( url )
	{
		/* WebKit does not fire again if src is not changed */
		self.loaded = self.loaded && img.src == url;
		img.src = url;
		//console.log( self.loaded );
	}
	
	var img = document.createElement( "img" );
	img.addEventListener( "load", function(){ self.loaded = true; } );
	img.alt = "";
	img.src = STATIC_URL_JS + "widgets/empty256.gif";
//	img.onload = self.paint;
	
	//document.body.appendChild(img);
}

/**
 * 
 */
function TileLayer(
		stack,						//!< reference to the parent stack
		tileWidth,
		tileHeight,
		tileSource
		)
{
	var self = this;
	var timeout = null;
	var tryPaintTimeout = null;
	var mag = 1.0;
	
	/**
	 * initialise the tiles array
	 */
	var initTiles = function( rows, cols )
	{
		delete tiles;
		tiles = new Array();
		
		for ( var i = 0; i < rows; ++i )
		{
			tiles[ i ] = new Array();
			for ( var j = 0; j < cols; ++j )
				tiles[ i ][ j ] = new Tile( tileWidth, tileHeight, self.paint, ctx );
		}

		return;
	}
	
	/**
	 * align and update the tiles to be ( x, y ) in the image center
	 */
	self.redraw = function(completionCallback)
	{
		if ( !timeout )
			timeout = window.setTimeout( self.paint, 20 );
		
		if (typeof completionCallback !== "undefined") {
			completionCallback();
		}

		return 2;
	}
	
	self.paint = function()
	{
		var tileBaseName = getTileBaseName( [ stack.x, stack.y, stack.z ] );

		var zoom = stack.s;
		if ( zoom < 0 )
		{
			mag = Math.pow(2, -zoom);
			zoom = 0;
		}
		else
			mag = 1.0;

		effectiveTileWidth = tileWidth * mag;
		effectiveTileHeight = tileHeight * mag;

		var fr = Math.floor( stack.yc /  effectiveTileHeight);
		var fc = Math.floor( stack.xc / effectiveTileWidth );
		
		var xd = 0;
		var yd = 0;

		var top;
		var left;
		
		LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
		LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );

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

		/* update urls */
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
					tiles[ i ][ j ].setURL( STATIC_URL_JS + "widgets/black.gif" );
				}
				else
				{
					tiles[ i ][ j ].setURL( self.tileSource.getTileURL( project, stack, tileBaseName, tileWidth, tileHeight, c, r, zoom ) );
				}
				tiles[ i ][ j ].setPosition( l, t );
				
				l += effectiveTileWidth;

			}
			l = left;
			t += effectiveTileHeight;
		}
		
		if ( !tryPaintTimeout )
			tryPaintTimeout = window.setTimeout( self.tryPaint, 20 );
		
		timeout = null;
		
		return;
	}
	
	self.tryPaint = function()
	{
		for ( var i = 0; i < tiles.length; ++i )
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
				if ( !tiles[ i ][ j ].loaded )
				{
					tryPaintTimeout = window.setTimeout( self.tryPaint, 20 );
					return;
				}
		
		for ( var i = 0; i < tiles.length; ++i )
			for ( var j = 0; j < tiles[ 0 ].length; ++j )
				tiles[ i ][ j ].paint( mag );
		
		tryPaintTimeout = null;
	}
	
	self.resize = function( width, height )
	{
		//console.log( "resize tileLayer of stack" + stack.getId() );
		
		tilesCanvas.width = width;
		tilesCanvas.height = height;
		tilesCanvas.style.width = width + "px";
		tilesCanvas.style.height = height + "px";
		
		var rows = Math.floor( height / tileHeight ) + 2;
		var cols = Math.floor( width / tileWidth ) + 2;
		
		ctx = tilesCanvas.getContext("2d");
		
		initTiles( rows, cols );
		self.redraw();
		
		return;
	}
	
	/**
	 * Get the width of an image tile.
	 */
	self.getTileWidth = function(){ return tileWidth; }
	
	/**
	 * Get the height of an image tile.
	 */
	self.getTileHeight = function(){ return tileHeight; }
	
	/**
	 * Get the number of tile columns.
	 */
	self.numTileColumns = function()
	{
		if ( tiles.length == 0 )
			return 0;
		else
			return tiles[ 0 ].length;
	}
	
	/**
	 * Get the number of tile rows.
	 */
	self.numTileColumns = function(){ return tiles.length; }
	
	/**
	 * Get the stack.
	 */
	self.getStack = function(){ return stack; }

	self.setOpacity = function( val )
	{
		tilesContainer.style.opacity = val + "";
		opacity = val;
	}

	self.getOpacity = function()
	{
		return opacity;
	}

	// internal opacity variable
	var opacity = 100;
	
	/* Contains all tiles in a 2d-array */
	var tiles = new Array();
	
	var tilesCanvas = document.createElement( "canvas" );
	tilesCanvas.style.position = "absolute";
	tilesCanvas.style.top = "0px";
	tilesCanvas.style.left = "0px";
//	tilesCanvas.style.width = "100%";
//	tilesCanvas.style.height = "100%";
	stack.getView().appendChild( tilesCanvas );
	
	var ctx;
	try
	{
		ctx = tilesCanvas.getContext( "2d" );
	}
	catch( e )
	{
		alert( "Sorry, CATMAID uses the HTML5 canvas element that seems not to be available in your web browser." );
		return false;
	}
	
	img = document.createElement( "img" );
	img.src = "http://fly.mpi-cbg.de/~saalfeld/saalfeld.jpg";
		
	ctx.drawImage( img, 0, 0, tileWidth, tileHeight );
	
	var LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
	var LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );

	self.tileSource = tileSource;

	var overviewLayer = tileSource.getOverviewLayer( this );
}
