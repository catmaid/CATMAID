/**
 * Creates a new tile source, based on a source type.
 */
function getTileSource( tileSourceType, baseURL, fileExtension )
{
    var tileSources = [DefaultTileSource, RequestTileSource,
        HDF5TileSource, BackslashTileSource, LargeDataTileSource,
        DVIDTileSource, RenderServTileSource, DVIDMultiScaleTileSource];

    if (tileSourceType > 0 && tileSourceType <= tileSources.length)
    {
        return new tileSources[tileSourceType - 1]( baseURL, fileExtension );
    }
    else
    {
        return null;
    }
}

/**
 * Creates URLs for standard tile path of CATMAID.
 *
 * Source type: 1
 */
function DefaultTileSource( baseURL, fileExtension )
{
    /**
     * Return the URL of a single tile, defined by it grid position
     * (x, y), ...
     */
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return baseURL + baseName + row + "_" + col + "_" + zoom_level + "." + fileExtension;
    };

    this.getOverviewURL = function( stack ) {
        return baseURL + stack.z + "/small." + fileExtension;
    };

    this.getOverviewLayer = function( layer )
    {
        return new GenericOverviewLayer( layer, baseURL, fileExtension, this.getOverviewURL );
    };
}

/**
 * Creates the URL for a tile in a generic way.
 * To be used for instance for Volumina served datasources
 *
 * Source type: 2
 */
function RequestTileSource( baseURL, fileExtension )
{
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return baseURL + "?" + $.param({
            x: col * tileWidth,
            y: row * tileHeight,
            width : tileWidth,
            height : tileHeight,
            row : 'y',
            col : 'x',
            scale : stack.scale, // defined as 1/2**zoomlevel
            z : stack.z });
    };

    this.getOverviewLayer = function( layer )
    {
        return new DummyOverviewLayer();
    };
}

/*
* Get Tile from HDF5 through Django.
*
* Source type: 3
*/
function HDF5TileSource( baseURL, fileExtension )
{
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return django_url + project.id + '/stack/' + stack.id + '/tile?' + $.param({
            x: col * tileWidth,
            y: row * tileHeight,
            width : tileWidth,
            height : tileHeight,
            row : 'y',
            col : 'x',
            scale : stack.s, // defined as 1/2**zoomlevel
            z : stack.z,
            file_extension: fileExtension,
            basename: baseURL,
            type:'all'
        });
    };

    this.getOverviewLayer = function( layer )
    {
        return new DummyOverviewLayer();
    };
}

/**
 * A tile source like the DefaultTileSource, but with a backslash
 * at the end.
 *
 * Source type: 4
 */
function BackslashTileSource( baseURL, fileExtension )
{
    /**
     * Return the URL of a single tile, defined by it grid position
     * (x, y), ...
     */
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return baseURL + baseName + zoom_level + "/" + row + "_" + col + "." + fileExtension;
    };

    this.getOverviewURL = function( stack ) {
        return baseURL + stack.z + "/small." + fileExtension;
    };

    this.getOverviewLayer = function( layer )
    {
        return new GenericOverviewLayer( layer, baseURL, fileExtension, this.getOverviewURL );
    };
}

/**
 * A tile source for large datasets where the scale and rows are encoded as folders
 *
 * Source type: 5
 */
function LargeDataTileSource( baseURL, fileExtension )
{
    /**
     * Return the URL of a single tile, defined by it grid position
     * (x, y), ...
     */
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return baseURL + zoom_level + "/" + baseName + row + "/" +  col + "." + fileExtension;
    };

    this.getOverviewURL = function( stack ) {
        return baseURL + "/small/" + stack.z + "." + fileExtension;
    };

    this.getOverviewLayer = function( layer )
    {
        return new GenericOverviewLayer( layer, baseURL, fileExtension, this.getOverviewURL);
    };
}

/*
* Simple tile source type for DVID grayscale8 datatype
* see https://github.com/janelia-flyem/dvid
*
* GET  <api URL>/node/<UUID>/<data name>/raw/<dims>/<size>/<offset>[/<format>][?throttle=true][?queryopts]
* e.g. GET <api URL>/node/3f8c/grayscale/raw/0_1/512_256/0_0_100/jpg:80

* Source type: 6
*/
function DVIDTileSource( baseURL, fileExtension )
{
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return baseURL + "/" + tileWidth + "_" + tileHeight + "/" + col * tileWidth + "_" + 
            row * tileHeight + "_" + stack.z + "/" + fileExtension;
    };

    this.getOverviewLayer = function( layer )
    {
        return new DummyOverviewLayer();
    };
}


/*
 * Tile source for the Janelia tile render web-service
 * 
 * https://github.com/saalfeldlab/render/tree/ws_phase_1
 *
 * Documentation on
 * 
 * http://wiki/wiki/display/flyTEM/Render+Web+Service+APIs
 *
 * Source type: 7
 */
function RenderServTileSource( baseURL, fileExtension )
{
	var self = this;
	this.mimeType = fileExtension == "png" ? "/png-image" : "/jpeg-image";
	this.getTileURL = function( project, stack, baseName, tileWidth, tileHeight, col, row, zoom_level )
	{
		var scale = Math.pow( 2, zoom_level );
		var tw = tileWidth * scale;
		var th = tileHeight * scale;
		var invScale = 1.0 / scale;
		return baseURL + "z/" + stack.z + "/box/" + col * tw + "," + row * th + "," + tw + "," + th + "," + invScale + self.mimeType;
	};

	this.getOverviewURL = function( stack ) {
		return baseURL + "z/" + stack.z + "/box/0,0," + stack.dimension.x + "," + stack.dimension.y + "," + 192 / stack.dimension.x + self.mimeType;
	};

	this.getOverviewLayer = function( layer )
	{
		return new GenericOverviewLayer( layer, baseURL, fileExtension, this.getOverviewURL );
	};
}

/*
* Simple tile source type for DVID multiscale2d datatype
* see https://github.com/janelia-flyem/dvid
*
* GET  <api URL>/node/<UUID>/<data name>/tile/<dims>/<scaling>/<tile coord>[?noblanks=true]
* e.g. GET <api URL>/node/3f8c/mymultiscale2d/tile/xy/0/10_10_20
* 
* Source type: 8
*/
function DVIDMultiScaleTileSource( baseURL, fileExtension )
{
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        if (stack.orientation === Stack.ORIENTATION_XY)
            return baseURL + "xy/" + zoom_level + "/" + col + "_" + row + "_" + stack.z;
        else if (stack.orientation === Stack.ORIENTATION_XZ)
            return baseURL + "xz/" + zoom_level + "/" + col + "_" + stack.z + "_" + row;
        else if (stack.orientation === Stack.ORIENTATION_ZY)
            return baseURL + "yz/" + zoom_level + "/" + stack.z + "_" + col + "_" + row;
    };

    this.getOverviewLayer = function( layer )
    {
        return new DummyOverviewLayer();
    };
}


/**
 * This is an overview layer that doesn't display anything.
 */
function DummyOverviewLayer()
{
    this.redraw = function()
    {
    };

    this.unregister = function()
    {
    };
}

/*
 * This is an overviewlayer that displays a small overview
 * map.
 */
function GenericOverviewLayer( layer, baseURL, fileExtension, getOverviewURL)
{
    this.redraw = function()
    {
        img.src = getOverviewURL( stack );
    };

    this.unregister = function()
    {
        if ( img.parentNode )
            img.parentNode.removeChild( img );
    };

    var stack = layer.getStack();
    var img = document.createElement( "img" );
    img.className = "smallMapMap";
    this.redraw(); // sets the img URL
    stack.overview.getView().appendChild( img );
    stack.overview.addLayer( "tilelayer", this );
}
