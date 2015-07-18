/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
 CATMAID,
 django_url,
 Stack,
 */

(function(CATMAID) {

  'use strict';

  /**
   * Get the part of the tile name that consists of invariant dimensions of the
   * slice plane: z, t, ...
   * For a 3D stack this will return 'z/', for a 4D stack 't/z/', etc.
   *
   * @param slicePixelPos stack pixel position for the slice plane [z, t, ...]
   */
  CATMAID.getTileBaseName = function (slicePixelPos) {
    var n = slicePixelPos.length;
    var dir = '';
    for (var i = n - 1; i >= 0; --i) {
      dir += slicePixelPos[i] + '/';
    }
    return dir;
  };

  /**
   * Creates a new tile source, based on a source type.
   */
  CATMAID.getTileSource = function(tileSourceType, baseURL, fileExtension, tileWidth, tileHeight) {
    // Map tile source types to corresponding constructors. This could also be
    // represented as an array, but is this way more clear and readable.
    var tileSources = {
      '1': CATMAID.DefaultTileSource,
      '2': CATMAID.RequestTileSource,
      '3': CATMAID.HDF5TileSource,
      '4': CATMAID.BackslashTileSource,
      '5': CATMAID.LargeDataTileSource,
      '6': CATMAID.DVIDImageblkTileSource,
      '7': CATMAID.RenderServTileSource,
      '8': CATMAID.DVIDImagetileTileSource
    };

    var TileSource = tileSources[tileSourceType];
    if (TileSource) {
      var source = new TileSource(baseURL, fileExtension, tileWidth, tileHeight);
      source.tileWidth = tileWidth;
      source.tileHeight = tileHeight;
      return source;
    } else throw new RangeError('Tile source type ' + tileSourceType + ' is unknown.');
  };

  /**
   * Creates URLs for standard tile path of CATMAID.
   *
   * Source type: 1
   */
  CATMAID.DefaultTileSource = function(baseURL, fileExtension, tileWidth, tileHeight) {
    /**
     * Return the URL of a single tile, defined by it grid position
     * (x, y), ...
     */
    this.getTileURL = function(project, stack, slicePixelPosition,
                               col, row, zoomLevel) {
      var baseName = CATMAID.getTileBaseName(slicePixelPosition);
      return baseURL + baseName + row + '_' + col + '_' + zoomLevel + '.' +
          fileExtension;
    };

    this.getOverviewURL = function(slicePixelPosition) {
      return baseURL + slicePixelPosition[0] + '/small.' + fileExtension;
    };

    this.getOverviewLayer = function(layer) {
      return new CATMAID.GenericOverviewLayer(layer, baseURL, fileExtension,
          this.getOverviewURL);
    };
  };

  /**
   * Creates the URL for a tile in a generic way.
   * To be used for instance for Volumina served datasources
   *
   * Source type: 2
   */
  CATMAID.RequestTileSource = function(baseURL, fileExtension, tileWidth, tileHeight) {
    this.getTileURL = function( project, stack, slicePixelPosition,
                                col, row, zoomLevel ) {
      return baseURL + '?' + $.param({
        x: col * tileWidth,
        y: row * tileHeight,
        width : tileWidth,
        height : tileHeight,
        row : 'y',
        col : 'x',
        scale : 1/(1 << zoomLevel), // Bitshift is safe because zoomLevel is integral.
        z : slicePixelPosition[0]
      });
    };

    this.getOverviewLayer = function( layer ) {
      return new CATMAID.DummyOverviewLayer();
    };
  };

  /*
  * Get Tile from HDF5 through Django.
  *
  * Source type: 3
  */
  CATMAID.HDF5TileSource = function(baseURL, fileExtension, tileWidth, tileHeight) {
    this.getTileURL = function(project, stack, slicePixelPosition,
                               col, row, zoomLevel) {
      return django_url + project.id + '/stack/' + stack.id + '/tile?' +
          $.param({
            x: col * tileWidth,
            y: row * tileHeight,
            width : tileWidth,
            height : tileHeight,
            row : 'y',
            col : 'x',
            scale : 1/(1 << zoomLevel), // Bitshift is safe because zoomLevel is integral.
            z: slicePixelPosition[0],
            file_extension: fileExtension,
            basename: baseURL,
            type:'all'
          });
    };

    this.getOverviewLayer = function(layer) {
      return new CATMAID.DummyOverviewLayer();
    };
  };

  /**
   * A tile source like the DefaultTileSource, but with a backslash
   * at the end.
   *
   * Source type: 4
   */
  CATMAID.BackslashTileSource = function(baseURL, fileExtension, tileWidth, tileHeight) {
    /**
     * Return the URL of a single tile, defined by it grid position
     * (x, y), ...
     */
    this.getTileURL = function(project, stack, slicePixelPosition,
                               col, row, zoomLevel) {
      var baseName = CATMAID.getTileBaseName(slicePixelPosition);
      return baseURL + baseName + zoomLevel + '/' + row + '_' + col + '.' +
          fileExtension;
    };

    this.getOverviewURL = function(slicePixelPosition) {
      return baseURL + slicePixelPosition[0] + '/small.' + fileExtension;
    };

    this.getOverviewLayer = function( layer )
    {
      return new CATMAID.GenericOverviewLayer(layer, baseURL, fileExtension,
          this.getOverviewURL);
    };
  };

  /**
   * A tile source for large datasets where the scale and rows are encoded as
   * folders
   *
   * Source type: 5
   */
  CATMAID.LargeDataTileSource = function(baseURL, fileExtension, tileWidth, tileHeight)
  {
    /**
     * Return the URL of a single tile, defined by it grid position
     * (x, y), ...
     */
    this.getTileURL = function( project, stack, slicePixelPosition,
        col, row, zoomLevel ) {
      var baseName = CATMAID.getTileBaseName(slicePixelPosition);
      return baseURL + zoomLevel + '/' + baseName + row + '/' +  col + '.' +
         fileExtension;
    };

    this.getOverviewURL = function( slicePixelPosition ) {
      return baseURL + '/small/' + slicePixelPosition[0] + '.' + fileExtension;
    };

    this.getOverviewLayer = function( layer ) {
      return new CATMAID.GenericOverviewLayer(layer, baseURL, fileExtension,
          this.getOverviewURL);
    };
  };

  /*
  * Simple tile source type for DVID imageblk (uint8blk, rgba8blk) datatype
  * see https://github.com/janelia-flyem/dvid
  *
  * GET  <api URL>/node/<UUID>/<data name>/raw/<dims>/<size>/<offset>[/<format>][?throttle=true][?queryopts]
  * e.g. GET <api URL>/node/3f8c/grayscale/raw/0_1/512_256/0_0_100/jpg:80

  * Source type: 6
  */
  CATMAID.DVIDImageblkTileSource = function(baseURL, fileExtension, tileWidth, tileHeight)
  {
    this.getTileURL = function( project, stack, slicePixelPosition,
        col, row, zoomLevel ) {
      if (stack.orientation === CATMAID.Stack.ORIENTATION_XY) {
        return baseURL + tileWidth + '_' + tileHeight + '/' + col * tileWidth + '_' +
            row * tileHeight + '_' + slicePixelPosition[0] + '/' + fileExtension;
      } else if (stack.orientation === CATMAID.Stack.ORIENTATION_XZ) {
        return baseURL + tileWidth + '_' + tileHeight + '/' + col * tileWidth + '_' +
            slicePixelPosition[0] + '_' + row * tileHeight + '/' + fileExtension;
      } else if (stack.orientation === CATMAID.Stack.ORIENTATION_ZY) {
        return baseURL + tileWidth + '_' + tileHeight + '/' + slicePixelPosition[0] + '_' +
            row * tileHeight + '_' + col * tileWidth + '/' + fileExtension;
      }
    };

    this.getOverviewLayer = function( layer ) {
      return new CATMAID.DummyOverviewLayer();
    };

    this.transposeTiles = new Set([CATMAID.Stack.ORIENTATION_ZY]);
  };


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
  CATMAID.RenderServTileSource = function(baseURL, fileExtension, tileWidth, tileHeight)
  {
    var self = this;
    this.mimeType = fileExtension == 'png' ? '/png-image' : '/jpeg-image';
    this.getTileURL = function(project, stack, slicePixelPosition,
                               col, row, zoomLevel) {
      var scale = Math.pow(2, zoomLevel);
      var tw = tileWidth * scale;
      var th = tileHeight * scale;
      var invScale = 1.0 / scale;
      return baseURL + 'z/' + slicePixelPosition[0] + '/box/' + col * tw + ',' + row * th +
          ',' + tw + ',' + th + ',' + invScale + self.mimeType;
    };

    this.getOverviewURL = function(slicePixelPosition) {
      return baseURL + 'z/' + slicePixelPosition[0] + '/box/0,0,' + stack.dimension.x + ',' +
          stack.dimension.y + ',' + 192 / stack.dimension.x + self.mimeType;
    };

    this.getOverviewLayer = function(layer) {
      return new CATMAID.GenericOverviewLayer(layer, baseURL,
          fileExtension, this.getOverviewURL);
    };
  };

  /*
  * Simple tile source type for DVID imagetile datatype
  * see https://github.com/janelia-flyem/dvid
  *
  * GET  <api URL>/node/<UUID>/<data name>/tile/<dims>/<scaling>/<tile coord>[?noblanks=true]
  * e.g. GET <api URL>/node/3f8c/mymultiscale2d/tile/xy/0/10_10_20
  * 
  * Source type: 8
  */
  CATMAID.DVIDImagetileTileSource = function(baseURL, fileExtension, tileWidth, tileHeight)
  {
    this.getTileURL = function(project, stack, slicePixelPosition,
                               col, row, zoomLevel) {
      if (stack.orientation === CATMAID.Stack.ORIENTATION_XY) {
        return baseURL + 'xy/' + zoomLevel + '/' + col + '_' + row + '_' + slicePixelPosition[0];
      } else if (stack.orientation === CATMAID.Stack.ORIENTATION_XZ) {
        return baseURL + 'xz/' + zoomLevel + '/' + col + '_' + slicePixelPosition[0] + '_' + row;
      } else if (stack.orientation === CATMAID.Stack.ORIENTATION_ZY) {
        return baseURL + 'yz/' + zoomLevel + '/' + slicePixelPosition[0] + '_' + row + '_' + col;
      }
    };

    this.getOverviewLayer = function(layer) {
      return new CATMAID.DummyOverviewLayer();
    };

    this.transposeTiles = new Set([CATMAID.Stack.ORIENTATION_ZY]);
  };


  /**
   * This is an overview layer that doesn't display anything.
   */
  CATMAID.DummyOverviewLayer = function() {
    this.redraw = function() { };
    this.unregister = function() { };
  };

  /*
   * This is an overviewlayer that displays a small overview
   * map.
   */
  CATMAID.GenericOverviewLayer = function(layer, baseURL, fileExtension,
                                          getOverviewURL) {
    this.redraw = function() {
      var stack = layer.getStack();
      var slicePixelPosition = [stackViewer.scaledPositionInStack(stack).z];
      img.src = getOverviewURL( slicePixelPosition );
    };

    this.unregister = function() {
      if ( img.parentNode ) {
        img.parentNode.removeChild( img );
      }
    };

    var stackViewer = layer.getStackViewer();
    var img = document.createElement( 'img' );
    img.className = 'smallMapMap';
    this.redraw(); // sets the img URL
    stackViewer.overview.getView().appendChild( img );
    stackViewer.overview.addLayer( 'tilelayer', this );
  };

})(CATMAID);
