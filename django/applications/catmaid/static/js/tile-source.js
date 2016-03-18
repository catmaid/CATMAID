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
      '8': CATMAID.DVIDImagetileTileSource,
      '9': CATMAID.FlixServerTileSource
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

    this.getOverviewURL = function(stack, slicePixelPosition) {
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
      return new CATMAID.ArtificialOverviewLayer(layer);
    };
  };

  /**
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
      return new CATMAID.ArtificialOverviewLayer(layer);
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

    this.getOverviewURL = function(stack, slicePixelPosition) {
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

    this.getOverviewURL = function(stack, slicePixelPosition) {
      return baseURL + 'small/' + slicePixelPosition[0] + '.' + fileExtension;
    };

    this.getOverviewLayer = function( layer ) {
      return new CATMAID.GenericOverviewLayer(layer, baseURL, fileExtension,
          this.getOverviewURL);
    };
  };

  /**
   * Simple tile source type for DVID imageblk (uint8blk, rgba8blk) datatype
   * see https://github.com/janelia-flyem/dvid
   *
   * GET  <api URL>/node/<UUID>/<data name>/raw/<dims>/<size>/<offset>[/<format>][?throttle=true][?queryopts]
   * e.g. GET <api URL>/node/3f8c/grayscale/raw/0_1/512_256/0_0_100/jpg:80
   *
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
      return new CATMAID.ArtificialOverviewLayer(layer);
    };

    this.transposeTiles = new Set([CATMAID.Stack.ORIENTATION_ZY]);
  };


  /**
   * Tile source for the Janelia tile render web-service
   *
   * https://github.com/saalfeldlab/render/tree/ws_phase_1
   *
   * Documentation on
   *
   * http://<render service host>/swagger-ui/#!/Bounding_Box_Image_APIs
   *
   * Source type: 7
   */
  CATMAID.RenderServTileSource = function(baseURL, fileExtension, tileWidth, tileHeight)
  {
    this.getTileURL = function(project, stack, slicePixelPosition, col, row, zoomLevel) {
      var baseName = CATMAID.getTileBaseName(slicePixelPosition);
      return baseURL + 'largeDataTileSource/' + tileWidth + '/' + tileHeight + '/' +
             zoomLevel + '/' + baseName + row + '/' +  col + '.' + fileExtension;
    };

    this.getOverviewURL = function(stack, slicePixelPosition) {
      return baseURL + 'largeDataTileSource/' + tileWidth + '/' + tileHeight + '/' +
             'small/' + slicePixelPosition[0] + '.' + fileExtension;
    };

    this.getOverviewLayer = function(layer) {
      return new CATMAID.GenericOverviewLayer(layer, baseURL, fileExtension, this.getOverviewURL);
    };
  };

  /**
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
      return new CATMAID.ArtificialOverviewLayer(layer);
    };

    this.transposeTiles = new Set([CATMAID.Stack.ORIENTATION_ZY]);
  };

  /**
   * Serve images from Felix FlixServer.
   */
  CATMAID.FlixServerTileSource = function(baseURL, fileExtension, tileWidth, tileHeight) {
    this.color = null;
    this.minIntensity = null;
    this.maxIntensity = null;
    this.gamma = null;
    this.quality = null;

    this.getSettings = function() {
      return [
        {name: 'color', displayName: 'Color', type: 'text', value: this.color,
          help: 'Use one or list of: red, green, blue, cyan, magenta, yellow, white. Use comma for multiple channels'},
        {name: 'minIntensity', displayName: 'Min Intensity', type: 'text', range: [0, 65535],
          value: this.maxIntensity, help: 'Minimum value of display range, e.g. 10.0, use comma for multiple channels'},
        {name: 'maxIntensity', displayName: 'Max Intensity', type: 'text', range: [0, 65535],
          value: this.maxIntensity, help: 'Maximum value of display range, e.g. 256.0, use comma for muliple channels'},
        {name: 'gamma', displayName: 'Gamma', type: 'text', range: [0, Number.MAX_VALUE],
          value: this.gamma, help: 'Exponent of non-linear mapping, e.g. 1.0, use comma for multiple channels'},
        {name: 'quality', displayName: 'Quality', type: 'number', range: [0, 100],
          value: this.quality, help: 'Image quality in range 0-100, use comma for multiple channels'}
      ];
    };

    this.setSetting = function(name, value) {
      this[name] = value;
    };

    this.getTileURL = function(project, stack, slicePixelPosition,
                               col, row, zoomLevel) {
      var baseName = CATMAID.getTileBaseName(slicePixelPosition);
      var url = baseURL + baseName + row + '_' + col + '_' + zoomLevel + '.' +
          fileExtension;

      var params = [];
      if (this.color) { params.push('color=' + this.color); }
      if (this.minIntensity) { params.push('min=' + this.minIntensity); }
      if (this.maxIntensity) { params.push('max=' + this.maxIntensity); }
      if (this.gamma) { params.push('gamma=' + this.gamma); }
      if (this.quality) { params.push('quality=' + this.quality); }

      if (0 < params.length) {
        url += "?" + params.join("&");
      }

      return url;
    };

    this.getOverviewURL = function(stack, slicePixelPosition) {
      return baseURL + slicePixelPosition[0] + '/small.' + fileExtension;
    };

    this.getOverviewLayer = function(layer) {
      return new CATMAID.GenericOverviewLayer(layer, baseURL, fileExtension,
          this.getOverviewURL);
    };
  };

  /**
   * This is an overview layer that doesn't display anything.
   */
  CATMAID.DummyOverviewLayer = function() {
    this.redraw = function() { };
    this.unregister = function() { };
  };

  /**
   * An overview layer that doesn't attempt to get an image, but only shows a
   * blank area, optionally with a grid on top. This can be used as fallback if
   * no overview image can be loaded.
   */
  CATMAID.ArtificialOverviewLayer = function(layer) {
    this.backgroundColor = "#000";
    this.nGridLines = 5;
    this.gridStyle = "#777";

    this.layer = layer;
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('smallMapMap');

    var maxWidth = 192;
    var maxHeight = 192;

    // Size canvas to be proportional to image stack data
    var stack = layer.getStack();
    if (stack.dimension.x > stack.dimension.y) {
      this.canvas.width = maxWidth;
      this.canvas.height = (maxWidth / stack.dimension.x) * stack.dimension.y;
    } else {
      this.canvas.width = (maxHeight / stack.dimension.y) * stack.dimension.x;
      this.canvas.height = maxHeight;
    }

    var stackViewer = layer.getStackViewer();
    stackViewer.overview.getView().appendChild(this.canvas);
    stackViewer.overview.addLayer('tilelayer', this);
  };

  CATMAID.ArtificialOverviewLayer.prototype.redraw = function() {
    // Fill context with background color and optionally draw a grid.
    if (this.canvas) {
      var ctx = this.canvas.getContext("2d");
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0,0, this.canvas.width, this.canvas.height);

      if (this.nGridLines > 0) {
        var xSpacing = this.canvas.width / (this.nGridLines + 1);
        var ySpacing = this.canvas.height / (this.nGridLines + 1);
        ctx.strokeStyle = this.gridStyle;
        ctx.lineWidth = 1.0;
        for (var i=1; i<=this.nGridLines; ++i) {
          // Draw vertical line. According to MDN positioning lines inbetween
          // exact pixel positions allows for more crips drawing:
          // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Applying_styles_and_colors
          var x = Math.round(i * xSpacing) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, this.canvas.height);
          ctx.stroke();
          // Draw horizontal line
          var y = Math.round(i * ySpacing) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(this.canvas.width, y);
          ctx.stroke();
        }
      }
    }
  };

  CATMAID.ArtificialOverviewLayer.prototype.unregister = function() {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  };

  /**
   * This is an overview layer that displays a small overview map.
   */
  CATMAID.GenericOverviewLayer = function(layer, baseURL, fileExtension,
                                          getOverviewURL) {
    // Initialize prototype
    CATMAID.ArtificialOverviewLayer.call(this, layer);

    this.redraw = function() {
      var stack = layer.getStack();
      var stackViewer = layer.getStackViewer();
      var slicePixelPosition = [stackViewer.scaledPositionInStack(stack).z];
      img.src = getOverviewURL(stack, slicePixelPosition);
    };

    var img = document.createElement( 'img' );
    img.className = 'smallMapMap';

    // If images can't be loaded, fall-back to the artificial overview layer
    img.onerror = (function() {
      CATMAID.ArtificialOverviewLayer.prototype.redraw.call(this);
    }).bind(this);

    // After the image has been loaded, draw it to the overview canvas
    img.onload = (function() {
      if (this.canvas) {
        var ctx = this.canvas.getContext("2d");
        ctx.width = img.width;
        ctx.height = img.height;
        ctx.drawImage(img, 0, 0);
      }
    }).bind(this);

    this.redraw(); // sets the img URL
  };

  CATMAID.GenericOverviewLayer.prototype = Object.create(CATMAID.ArtificialOverviewLayer.prototype);

})(CATMAID);
