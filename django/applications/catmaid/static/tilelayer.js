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
		stack,						//!< reference to the parent stack
		tileWidth,
		tileHeight,
		tileSource
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
		
		if( stack.tile_source_type === 5)
		{
			var pixelPos = [ stack.x, stack.y, stack.z, stack.t,  stack.c ];
		}else{
			var pixelPos = [ stack.x, stack.y, stack.z ];
		}

		var tileBaseName = getTileBaseName( pixelPos );

		//console.log('Tile basename ',tileBaseName);


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
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
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
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
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
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
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
					img.src = STATIC_URL_JS + "widgets/empty256.gif";
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

	/**
	*gets pixel value from image at (x,y) temporalily creating a canvas object
	*/
	this.getPixelValue = function(image,x,y)
	{
		rgba = new Array();
		rgba[0] = -1;//dumb initialization
		rgba[1] = -1;
		rgba[2] = -1;
		rgba[3] = -1;
		var rgba = [-1, -1, -1, -1];
		if( !image.width || !image.height ){
			return rgba;
		}

		var canvasFA = document.createElement('canvas');
		//document.body.appendChild(canvasFA);
		//var canvasFA = document.getElementById('canvasFA');
		var ctx = canvasFA.getContext('2d');
		canvasFA.width = image.width;
    	canvasFA.height = image.height;
    	ctx.drawImage(image, 0, 0, image.width, image.height);
    	//console.log("x=" + x + ";y=" + y);
    	//console.log("width=" + image.width + ";height=" + image.height);
    	var imageData = ctx.getImageData(0, 0, canvasFA.width, canvasFA.height);


    	//To read the values of a pixel, you write this code:
		var pixelIndex = 4 * (x + y * image.width);
		rgba[0] = imageData.data[pixelIndex    ];  // red   color
		rgba[1] = imageData.data[pixelIndex + 1];  // green color
		rgba[2] = imageData.data[pixelIndex + 2];  // blue  color
		rgba[3] = imageData.data[pixelIndex + 3];  //alpha blending
		//destroy canvas
		canvasFA.remove();

		return rgba;
	}

	/**
	*gets max luminsoity value in a certain area
	*/
	this.getPixelValueMaxLuminosity = function(image,x,y, winSize)
	{
		var l = -1;
		if( !image.width || !image.height ){
			return l;
		}

		var canvasFA = document.createElement('canvas');
		//document.body.appendChild(canvasFA);
		//var canvasFA = document.getElementById('canvasFA');
		var ctx = canvasFA.getContext('2d');
		canvasFA.width = image.width;
    	canvasFA.height = image.height;
    	ctx.drawImage(image, 0, 0, image.width, image.height);
    	//console.log("x=" + x + ";y=" + y);
    	//console.log("width=" + image.width + ";height=" + image.height);
    	var imageData = ctx.getImageData(0, 0, canvasFA.width, canvasFA.height);


    	var rgba = [-1,-1,-1,-1];
    	for( var ii = -winSize; ii < winSize; ++ii)
		{
			var pixelIndex = 4 * (x + ii + y  * image.width);
			for( var jj = -winSize; jj < winSize; ++jj)
			{
				if( x+ii >= 0 && y+jj>=0 && x+ii<image.width && y+jj<image.height)
				{
					
					rgba[0] = imageData.data[pixelIndex    ];  // red   color
					rgba[1] = imageData.data[pixelIndex + 1];  // green color
					rgba[2] = imageData.data[pixelIndex + 2];  // blue  color
					rgba[3] = imageData.data[pixelIndex + 3];  //alpha blending
					//luminosity
					var lAux = 0.21 * rgba[0] + 0.71 * rgba[1] + 0.07 * rgba[2];
					l = Math.max(l, lAux);		  
				}else{
					break;
				}
				pixelIndex = pixelIndex + 4;
			}
		}

		//====================debug=======================================================
		/*
		console.log("===========================================================================")
		//create website to print array
		var div = document.getElementById('divDebug');
		if( div == null) 
		{
			div = document.createElement('div');
			div.id = "divDebug";
		div.style.left = '0px'; 
		div.style.top = '1024px';
		div.style.width = '1024px';
		div.style.height = '1024px';
		div.style.position = "absolute"
		document.body.appendChild(div);
		}	

		
		var pixelIndex = 0;
		var count = 0;
		var lArray = new Array();
		for( var ii = 0; ii < image.height; ++ii )
		{
			for( var jj = 0; jj < image.width; ++jj )
			{
				rgba[0] = imageData.data[pixelIndex    ];  // red   color
				rgba[1] = imageData.data[pixelIndex + 1];  // green color
				rgba[2] = imageData.data[pixelIndex + 2];  // blue  color
				rgba[3] = imageData.data[pixelIndex + 3];  //alpha blending
				//luminosity
				var lAux = 0.21 * rgba[0] + 0.71 * rgba[1] + 0.07 * rgba[2];
				//var lAux = imageData.data[pixelIndex    ];

				lArray[count] = lAux;
				pixelIndex = pixelIndex + 4;
				count = count + 1;
			}
		}
		div.appendChild(canvasFA);
		div.innerHTML = '<p>' + lArray + '</p>';
		console.log("===========================================================================")
		*/
		//================================================================================


    	//destroy canvas
		canvasFA.remove();

		return l;
	}
	
	/**
	* gets the pi
	*/
	this.getTilePixelValueScreenCenter = function()
	{

		//find center (in pixels) of current tile screen
		var CMW0 = document.getElementById("CMW0");//div containing tiles
		var hh = parseInt(CMW0.style.height,10) / 2;//height and width (in pixels) of the tile area
		var ww = parseInt(CMW0.style.width,10) / 2;

		//find which tile and at which (x,y) I need to retrieve
		var aa = 0;
		var bb = 0;
		var x = 0;
		var y = 0;
		var foundTile = false;
		for ( var ii = 0; ii < tiles.length; ++ii )
		{
			for ( var jj = 0; jj < tiles[0].length; ++jj )
			{
				var tt = parseInt(tiles[ii][jj].style.top,10);
				var lt = parseInt(tiles[ii][jj].style.left,10);
				var wt = parseInt(tiles[ii][jj].style.width,10);
				var ht = parseInt(tiles[ii][jj].style.height,10);

				if( tt <== hh && tt+ht > hh && lt < ww && lt+wt > ww)//this is the correct tile
				{
					aa = ii;
					bb = jj;
					y = Math.floor(hh - tt);//y is related to height of image
					x = Math.floor(ww - lt);//x is related to width of image
					foundTile = true;
					break;
				}
			}
			if( foundTile === true ){
				break;
			}
		}

		//look in a window around the center
		var l = self.getPixelValueMaxLuminosity(tiles[aa][bb],x,y,10);

		//-------------------------debug-------------------
    	//console.log("====Value at center (" + x + "," + y + ") is l = " + l + " ==============");

		return l;
	}

	/**
	 * same as redraw() but for XZ plane in the tracing triview. Basically we change Y<->Z
	 * also we need to pass some position (right now redraws after clicking with the mouse). pos_ are in pixels (not physical coordinates)
	 * @param: triviewPlane: 1->XZ, 2->YZ
	 * @param: pos_x: coordinates in pixels (not in physical coordinates) with no scaling
	 */
	this.drawTriview = function(pos_x, pos_y, pos_z, triviewPlane)
	{
		var pos_c = Math.round(pos_x);//XZ configuration
		var pos_r = Math.round(pos_z);
		var pos_slice = Math.round(pos_y);

		if( triviewPlane == 2)//YZ configuration
		{
			pos_c = Math.round(pos_z);
			pos_r = Math.round(pos_y);
			pos_slice = Math.round(pos_x);
		}

		if( stack.tile_source_type === 5)
		{
			var pixelPos = [ pos_r, pos_c, pos_slice, stack.t,  stack.c ];//the first two are ignored
		}else{
			var pixelPos = [ pos_r, pos_c, pos_slice ];
		}

		var tileBaseName = getTileBaseName( pixelPos );


		//path for triview is url/XZ/c/t/y
		if( triviewPlane == 1)
			tileBaseName = "XZ/" + tileBaseName;
		else if( triviewPlane == 2)
			tileBaseName = "YZ/" + tileBaseName;

		//console.log('Tile basename ',tileBaseName);


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

		//add strething to show isotropic resolution
		var magWidth = 1.0;
		var magHeight = 1.0;
		if( triviewPlane == 1)//comment out this if else statement if you do not want anistropic resolution in triview
		{
			magHeight = stack.resolution.z / stack.resolution.x;
		}	
		else if( triviewPlane == 2)
		{
			magWidth = stack.resolution.z / stack.resolution.y;
		}


		effectiveTileWidth = tileWidth * mag * magWidth;
		effectiveTileHeight = tileHeight * mag * magHeight;

		//we need scale to adjust translation in the centering
		var pos_s = stack.s;
      	var tileScale = Math.pow(2,pos_s);
      	//pos_x *= mag;
      	//pos_y *= mag;


		var centerc = tilesContainer.parentElement.clientWidth / 2.0;
		var centerr = tilesContainer.parentElement.clientHeight / 2.0;

		//center triview with respect to windows size
		pos_r /= tileScale;
		pos_c /= tileScale;

		if( triviewPlane == 1)
		{
			pos_r *= magHeight;
		}	
		else if( triviewPlane == 2)
		{
			pos_c *= magWidth;
		}

		pos_r -=centerr;
		pos_c -=centerc;



		var fr = Math.floor( pos_r / effectiveTileHeight );
		var fc = Math.floor( pos_c / effectiveTileWidth );

		//recalculate all the time since we reuse this function for different triviews
			if (artificialZoom)
			{
				if( triviewPlane == 1)
				{
					LAST_RT = Math.floor( ( stack.dimension.z - 1 ) / tileHeight );
					LAST_CT = Math.floor( ( stack.dimension.x - 1 ) / tileWidth );
				}else if( triviewPlane == 2){
					LAST_RT = Math.floor( ( stack.dimension.y - 1 ) / tileHeight );
					LAST_CT = Math.floor( ( stack.dimension.z - 1 ) / tileWidth );
				}
			}
			else
			{
				if( triviewPlane == 1)
				{
					LAST_RT = Math.floor( ( stack.dimension.z * stack.scale - 1 ) / tileHeight );
					LAST_CT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
				}
				else if( triviewPlane == 2)
				{
					LAST_RT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );
					LAST_CT = Math.floor( ( stack.dimension.z * stack.scale - 1 ) / tileWidth );
				}
				
			}
		


		var top;
		var left;

		if ( pos_r >= 0 )
			top  = -( pos_r % effectiveTileHeight ) ;
		else
			top  = -( ( pos_r + 1 ) % effectiveTileHeight ) - effectiveTileHeight + 1;
		
		if ( pos_c >= 0 )
			left = -( pos_c % effectiveTileWidth );
		else
			left = -( ( pos_c + 1 ) % effectiveTileWidth ) - effectiveTileWidth + 1;

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
				if ( r < 0 || c < 0 || r > LAST_RT || c > LAST_CT )
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
		

		//show marker in clicked point
		if( marker != null )
		{
			stack.getView().removeChild( marker );
		}
			//here we can define markers to overlay on top of images for specific locations
			marker = document.createElement( "div" );
			marker.className = "markerTag";
			marker.style.position ="absolute";
			marker.style.left = (centerc -1 - 27) + "px";//to compensate for size of the box. Depends on markerText.size
			marker.style.top = (centerr -1 - 19) + "px";
			marker.style.visibility = "visible";
			marker.appendChild( document.createElement( "p" ) );
			markerSpan = document.createElement( "span" );
			markerSpan.style.color = "green";

			markerText = document.createElement("font");
			markerText.size = "5";
			markerText.innerHTML ="+";
			markerSpan.appendChild(markerText);

			marker.firstChild.appendChild( markerSpan );
			//marker.firstChild.firstChild.appendChild( document.createTextNode( "+" ) );
			stack.getView().appendChild( marker );
		

		return;
	}

	this.resizeNoRedraw = function( width, height )
	{
//		alert( "resize tileLayer of stack" + stack.getId() );
		
		var rows = Math.floor( height / tileHeight ) + 2;
		var cols = Math.floor( width / tileWidth ) + 2;
		initTiles( rows, cols );
		return;
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
	var tiles2 = new Array();
	
	var tilesContainer = document.createElement( "div" );
	tilesContainer.className = "sliceTiles";
	stack.getView().appendChild( tilesContainer );


	//to indicate center in triview
	var marker = null;
	

	var LAST_XT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );
	var LAST_YT = Math.floor( ( stack.dimension.y * stack.scale - 1 ) / tileHeight );

	var LAST_RT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileHeight );//for triview
	var LAST_CT = Math.floor( ( stack.dimension.x * stack.scale - 1 ) / tileWidth );//for triview

	self.tileSource = tileSource;

	var overviewLayer = tileSource.getOverviewLayer( this );
}
