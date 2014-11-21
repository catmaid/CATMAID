/**
 * Creates a new tile source, based on a source type.
 */
function getTileSource( tileSourceType, baseURL, fileExtension )
{
    var tileSources = [DefaultTileSource, RequestTileSource,
        HDF5TileSource, BackslashTileSource, LargeDataTileSource,
        DVIDTileSource];

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
* Simple tile source type for DVID.
* see https://github.com/janelia-flyem/dvid
* (only for xy plane, no multi-scale, no overview thubnail image)
* use as image base: http://<HOST>/api/node/<UUID>/<DATASETNAME>/0,1/
*
* Source type: 6
*/
function DVIDTileSource( baseURL, fileExtension )
{
    this.getTileURL = function( project, stack, baseName,
        tileWidth, tileHeight, col, row, zoom_level )
    {
        return baseURL + "/" + tileWidth + "," + tileHeight + "/" + col * tileWidth + "," + 
            row * tileHeight + "," + stack.z + "/" + fileExtension;
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
