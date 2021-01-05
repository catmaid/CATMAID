/* global
 CATMAID,
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

  CATMAID.TileSources = {};

  CATMAID.TileSources.getTypeConstructor = function (tileSourceType) {
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
      '9': CATMAID.FlixServerTileSource,
      '10': CATMAID.H2N5TileSource,
      '11': CATMAID.N5ImageBlockWorkerSource,
      '12': CATMAID.BossTileSource,
      '13': CATMAID.CloudVolumeTileSource,
      '14': CATMAID.NeuroglancerPrecomputedImageBlockWorkerSource,
    };

    return tileSources[tileSourceType];
  };

  CATMAID.TileSources.typeIsImageBlockSource = function (tileSourceType) {
    return CATMAID.TileSources.getTypeConstructor(tileSourceType).prototype
        instanceof CATMAID.AbstractImageBlockSource;
  };

  /**
   * Creates a new tile source, based on a source type.
   */
  CATMAID.TileSources.get = function(
      id, tileSourceType, baseURL, fileExtension, tileWidth, tileHeight) {
    let TileSource = CATMAID.TileSources.getTypeConstructor(tileSourceType);

    if (TileSource) {
      var source = new TileSource(id, baseURL, fileExtension, tileWidth, tileHeight);
      source.tileWidth = tileWidth;
      source.tileHeight = tileHeight;
      return source;
    } else throw new RangeError('Tile source type ' + tileSourceType + ' is unknown.');
  };

  let _sourceCache = new Map();

  CATMAID.TileSources.getCached = function (id, ...args) {
    let source = _sourceCache.get(id);
    if (typeof source === 'undefined') {
      source = CATMAID.TileSources.get(id, ...args);
      _sourceCache.set(id, source);
    }

    return source;
  };


  CATMAID.AbstractTileSource = function (id, baseURL, fileExtension, tileWidth, tileHeight) {
    this.id = id;
    this.baseURL = baseURL;
    this.fileExtension = fileExtension;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.transposeTiles = new Set();
  };

  CATMAID.AbstractTileSource.prototype.constructor = CATMAID.AbstractTileSource;

  /**
   * Return the URL of a single tile, defined by it grid position
   * (x, y), ...
   */
  CATMAID.AbstractTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    throw new CATMAID.NotImplementedError();
  };

  CATMAID.AbstractTileSource.prototype.getOverviewLayer = function (layer) {
    return new CATMAID.ArtificialOverviewLayer(layer);
  };

  CATMAID.AbstractTileSource.prototype.getSettings = function () {
    return this.settings || [];
  };

  CATMAID.AbstractTileSource.prototype.setSetting = function (name, value) {
    this[name] = value;
  };

  /**
   * Create a canary tile URL for a particular project/stack
   * combination.
   *
   * @param  {Project} project
   * @param  {Stack}   stack
   * @return {String}  A complete canary tile URL
   */
  CATMAID.AbstractTileSource.prototype.getCanaryUrl = function (project, stack) {
    var canaryLocation = stack.canaryLocation;
    var col = Math.floor(canaryLocation.x / this.tileWidth);
    var row = Math.floor(canaryLocation.y / this.tileHeight);
    return this.getTileURL(project, stack, [canaryLocation.z], col, row, 0);
  };

  /**
   * Check whether the canary location for a stack is accessible via this tile
   * source and what time it takes to load. Checks for normal and CORS requests,
   * for DOM and WebGL tiles respectively.
   *
   * @param  {Project} project
   * @param  {Stack}   stack
   * @param  {Boolean} noCache    Prevent caching by appending a dummy request parameter
   * @return {Object}             Object with boolean keys normal and cors as
   *                              well as float keys normalTime and corsTime.
   */
  CATMAID.AbstractTileSource.prototype.checkCanary = function (project, stack, noCache) {
    var url = this.getCanaryUrl(project, stack);

    if (noCache) {
      url += "?nocache=" + Date.now();
    }

    var normalReq = new Promise(function (resolve, reject) {
      var normalImg = new Image();
      var beforeNormalLoad = performance.now();

      normalImg.onload = function () {
        resolve([true, performance.now() - beforeNormalLoad]);
      };
      normalImg.onerror = function () {
        resolve([false, Infinity]);
      };

      normalImg.src = url;
    });

    var beforeCorsLoad = performance.now();
    var corsReq = new Request(url, {
        mode: 'cors',
        credentials: 'same-origin',
        headers: this.getRequestHeaders()});
    corsReq = fetch(corsReq)
      .then(function (response) {
        var contentHeader = response.headers.get('Content-Type');
        return [contentHeader && contentHeader.startsWith('image'),
            performance.now() - beforeCorsLoad];
      })
      .catch(function () { return [false, Infinity]; });

    return Promise.all([normalReq, corsReq]).then(function (result) {
      return {
        normal:     result[0][0],
        normalTime: result[0][1],
        cors:       result[1][0],
        corsTime:   result[1][1]
      };
    });
  };

  CATMAID.AbstractTileSource.prototype.getRequestHeaders = function () {
    return {};
  };

  CATMAID.AbstractTileSourceWithOverview = function () {
    CATMAID.AbstractTileSource.apply(this, arguments);
  };

  CATMAID.AbstractTileSourceWithOverview.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.AbstractTileSourceWithOverview.prototype.getOverviewURL = function (stack, slicePixelPosition) {
    throw new CATMAID.NotImplementedError();
  };

  CATMAID.AbstractTileSourceWithOverview.prototype.getOverviewLayer = function (layer) {
    return new CATMAID.GenericOverviewLayer(layer, this.baseURL, this.fileExtension,
        this.getOverviewURL.bind(this));
  };


  /**
   * Creates URLs for standard tile path of CATMAID.
   *
   * Source type: 1
   */
  CATMAID.DefaultTileSource = function () {
    CATMAID.AbstractTileSourceWithOverview.apply(this, arguments);
  };

  CATMAID.DefaultTileSource.prototype = Object.create(CATMAID.AbstractTileSourceWithOverview.prototype);

  CATMAID.DefaultTileSource.prototype.getTileURL = function(
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    var baseName = CATMAID.getTileBaseName(slicePixelPosition);
    return this.baseURL + baseName + row + '_' + col + '_' + zoomLevel + '.' +
        this.fileExtension;
  };

  CATMAID.DefaultTileSource.prototype.getOverviewURL = function(stack, slicePixelPosition) {
    return this.baseURL + slicePixelPosition[0] + '/small.' + this.fileExtension;
  };


  /**
   * Creates the URL for a tile in a generic way.
   * To be used for instance for Volumina served datasources
   *
   * Source type: 2
   */
  CATMAID.RequestTileSource = function () {
    CATMAID.AbstractTileSource.apply(this, arguments);
  };

  CATMAID.RequestTileSource.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.RequestTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    return this.baseURL + '?' + $.param({
      x: col * this.tileWidth,
      y: row * this.tileHeight,
      width : this.tileWidth,
      height : this.tileHeight,
      row : 'y',
      col : 'x',
      scale : 1/(1 << zoomLevel), // Bitshift is safe because zoomLevel is integral.
      z : slicePixelPosition[0]
    });
  };


  /**
   * Get Tile from HDF5 through Django.
   *
   * Source type: 3
   */
  CATMAID.HDF5TileSource = function () {
    CATMAID.AbstractTileSource.apply(this, arguments);
  };

  CATMAID.HDF5TileSource.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.HDF5TileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    return CATMAID.makeURL(project.id + '/stack/' + stack.id + '/tile?' +
        $.param({
          x: col * this.tileWidth,
          y: row * this.tileHeight,
          width : this.tileWidth,
          height : this.tileHeight,
          row : 'y',
          col : 'x',
          scale : 1/(1 << zoomLevel), // Bitshift is safe because zoomLevel is integral.
          z: slicePixelPosition[0],
          file_extension: this.fileExtension,
          basename: this.baseURL,
          type:'all',
          format: 'hdf5',
        }));
  };


  /**
   * A tile source like the DefaultTileSource, but with a backslash
   * at the end.
   *
   * Source type: 4
   */
  CATMAID.BackslashTileSource = function () {
    CATMAID.AbstractTileSourceWithOverview.apply(this, arguments);
  };

  CATMAID.BackslashTileSource.prototype = Object.create(CATMAID.AbstractTileSourceWithOverview.prototype);

  CATMAID.BackslashTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    var baseName = CATMAID.getTileBaseName(slicePixelPosition);
    return this.baseURL + baseName + zoomLevel + '/' + row + '_' + col + '.' +
        this.fileExtension;
  };

  CATMAID.BackslashTileSource.prototype.getOverviewURL = function (stack, slicePixelPosition) {
    return this.baseURL + slicePixelPosition[0] + '/small.' + this.fileExtension;
  };


  /**
   * A tile source for large datasets where the scale and rows are encoded as
   * folders
   *
   * Source type: 5
   */
  CATMAID.LargeDataTileSource = function () {
    CATMAID.AbstractTileSourceWithOverview.apply(this, arguments);
  };

  CATMAID.LargeDataTileSource.prototype = Object.create(CATMAID.AbstractTileSourceWithOverview.prototype);

  CATMAID.LargeDataTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    var baseName = CATMAID.getTileBaseName(slicePixelPosition);
    return this.baseURL + zoomLevel + '/' + baseName + row + '/' +  col + '.' +
       this.fileExtension;
  };

  CATMAID.LargeDataTileSource.prototype.getOverviewURL = function (stack, slicePixelPosition) {
    return this.baseURL + 'small/' + slicePixelPosition[0] + '.' + this.fileExtension;
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
  CATMAID.DVIDImageblkTileSource = function () {
    CATMAID.AbstractTileSource.apply(this, arguments);

    this.transposeTiles.add(CATMAID.Stack.ORIENTATION_ZY);
  };

  CATMAID.DVIDImageblkTileSource.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.DVIDImageblkTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    if (stack.orientation === CATMAID.Stack.ORIENTATION_XY) {
      return this.baseURL + this.tileWidth + '_' + this.tileHeight + '/' + col * this.tileWidth + '_' +
          row * this.tileHeight + '_' + slicePixelPosition[0] + '/' + this.fileExtension;
    } else if (stack.orientation === CATMAID.Stack.ORIENTATION_XZ) {
      return baseURL + this.tileWidth + '_' + this.tileHeight + '/' + col * this.tileWidth + '_' +
          slicePixelPosition[0] + '_' + row * this.tileHeight + '/' + this.fileExtension;
    } else if (stack.orientation === CATMAID.Stack.ORIENTATION_ZY) {
      return baseURL + this.tileWidth + '_' + this.tileHeight + '/' + slicePixelPosition[0] + '_' +
          row * this.tileHeight + '_' + col * this.tileWidth + '/' + this.fileExtension;
    }
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
  CATMAID.RenderServTileSource = function () {
    CATMAID.AbstractTileSourceWithOverview.apply(this, arguments);

    this.maxTiles = null;
  };

  CATMAID.RenderServTileSource.prototype = Object.create(CATMAID.AbstractTileSourceWithOverview.prototype);

  CATMAID.RenderServTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    var baseName = CATMAID.getTileBaseName(slicePixelPosition);
    var url = this.baseURL + 'largeDataTileSource/' + this.tileWidth + '/' + this.tileHeight + '/' +
           zoomLevel + '/' + baseName + row + '/' +  col + '.' + this.fileExtension;

    var params = [];
    if (null !== this.maxTiles && undefined !== this.maxTiles) {
        params.push('maxTileSpecsToRender=' + this.maxTiles);
    }

    if (0 < params.length) {
      url += "?" + params.join("&");
    }

    return url;
  };

  CATMAID.RenderServTileSource.prototype.getOverviewURL = function (stack, slicePixelPosition) {
    return this.baseURL + 'largeDataTileSource/' + this.tileWidth + '/' + this.tileHeight + '/' +
           'small/' + slicePixelPosition[0] + '.' + this.fileExtension;
  };

  CATMAID.RenderServTileSource.prototype.getSettings = function () {
    return [
        {name: 'maxTiles', displayName: 'Maximum tiles', type: 'number', range: [0, 100000],
          value: this.maxTiles, help: 'Maximum number of image tiles to load for a section'}
      ];
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
  CATMAID.DVIDImagetileTileSource = function () {
    CATMAID.AbstractTileSource.apply(this, arguments);

    this.transposeTiles.add(CATMAID.Stack.ORIENTATION_ZY);
  };

  CATMAID.DVIDImagetileTileSource.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.DVIDImagetileTileSource.prototype.getTileURL = function(
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    if (stack.orientation === CATMAID.Stack.ORIENTATION_XY) {
      return this.baseURL + 'xy/' + zoomLevel + '/' + col + '_' + row + '_' + slicePixelPosition[0];
    } else if (stack.orientation === CATMAID.Stack.ORIENTATION_XZ) {
      return this.baseURL + 'xz/' + zoomLevel + '/' + col + '_' + slicePixelPosition[0] + '_' + row;
    } else if (stack.orientation === CATMAID.Stack.ORIENTATION_ZY) {
      return this.baseURL + 'yz/' + zoomLevel + '/' + slicePixelPosition[0] + '_' + row + '_' + col;
    }
  };


  /**
   * Serve images from Felix FlixServer.
   *
   * Source type: 9
   */
  CATMAID.FlixServerTileSource = function() {
    CATMAID.AbstractTileSource.apply(this, arguments);

    this.color = null;
    this.minIntensity = null;
    this.maxIntensity = null;
    this.gamma = null;
    this.quality = null;
  };

  CATMAID.FlixServerTileSource.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.FlixServerTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    var baseName = CATMAID.getTileBaseName(slicePixelPosition);
    var url = this.baseURL + baseName + row + '_' + col + '_' + zoomLevel + '.' +
        this.fileExtension;

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

  CATMAID.FlixServerTileSource.prototype.getOverviewURL = function (stack, slicePixelPosition) {
    return this.baseURL + slicePixelPosition[0] + '/small.' + this.fileExtension;
  };

  CATMAID.FlixServerTileSource.prototype.getSettings = function () {
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


  /**
   * Tile source type for the H2N5 tile server.
   * See https://github.com/aschampion/h2n5
   *
   * Source type: 10
   */
  CATMAID.H2N5TileSource = function () {
    CATMAID.AbstractTileSourceWithOverview.apply(this, arguments);

    // Scale levels are stored in difference N5 datasets. In the future, the
    // names of these datasets may be read from the attributes of the parent
    // dataset on construction. For now, the convention s0, s1, ..., is used.
    this.scaleLevelPath = {
      get: function (zoomLevel) {
        return 's' + zoomLevel;
      }
    };
  };

  CATMAID.H2N5TileSource.prototype = Object.create(CATMAID.AbstractTileSourceWithOverview.prototype);

  CATMAID.H2N5TileSource.prototype.getTileURL = function(
      project, stack, slicePixelPosition, col, row, zoomLevel) {

    return this.baseURL
      .replace('%SCALE_DATASET%', this.scaleLevelPath.get(zoomLevel))
      .replace('%AXIS_0%', col * this.tileWidth)
      .replace('%AXIS_1%', row * this.tileHeight)
      .replace('%AXIS_2%', slicePixelPosition[0])
      + '.' + this.fileExtension;
  };

  CATMAID.H2N5TileSource.prototype.getOverviewURL = function (stack, slicePixelPosition) {
    let sliceSize = Math.max(this.tileWidth, this.tileHeight);
    let zoomLevel = stack.zoomLevelFittingSlice(sliceSize);
    // If the zoom level does not exist, return a URL that will trigger `onerror`
    // for proper overview fallback.
    if (zoomLevel < 0 || zoomLevel > 0 && !this.baseURL.includes('%SCALE_DATASET%'))
      return 'data:,';
    slicePixelPosition[0] = Math.round(slicePixelPosition[0] / stack.downsample_factors[zoomLevel].z);
    return this.getTileURL(null, stack, slicePixelPosition, 0, 0, zoomLevel);
  };

  CATMAID.H2N5TileSource.prototype.getOverviewLayer = function (layer) {
    let sliceSize = Math.max(this.tileWidth, this.tileHeight);
    let stack = layer.getStack();
    let zoomLevel = stack.zoomLevelFittingSlice(sliceSize);
    // If the zoom level does not exist, return empty overview layer.
    if (zoomLevel < 0 || zoomLevel > 0 && !this.baseURL.includes('%SCALE_DATASET%'))
      return new CATMAID.ArtificialOverviewLayer(layer);

    let cropWidth = stack.dimension.x / stack.downsample_factors[zoomLevel].x;
    let cropHeight = stack.dimension.y / stack.downsample_factors[zoomLevel].y;
    return new CATMAID.GenericOverviewLayer(layer, this.baseURL, this.fileExtension,
        this.getOverviewURL.bind(this), cropWidth, cropHeight);
  };


  CATMAID.AbstractImageBlockSource = class AbstractImageBlockSource
      extends CATMAID.AbstractTileSource {

    blockSize(zoomLevel) {
      throw new CATMAID.NotImplementedError();
    }

    blockCoordBounds(zoomLevel) {
      throw new CATMAID.NotImplementedError();
    }

    dataType() {
      throw new CATMAID.NotImplementedError();
    }

    numScaleLevels() {
      throw new CATMAID.NotImplementedError();
    }

    readBlock(zoomLevel, xi, yi, zi) {
      throw new CATMAID.NotImplementedError();
    }
  };


  /**
   * Image block source type for N5 datasets.
   * See https://github.com/saalfeldlab/n5
   * See https://github.com/aschampion/n5-wasm
   *
   * Source type: 11
   */
  CATMAID.N5ImageBlockSource = class N5ImageBlockSource extends CATMAID.AbstractImageBlockSource {
    constructor(...args) {
      super(...args);

      function supportsDynamicImport() {
        try {
          new Function('import("")');
          return true;
        } catch (err) {
          return false;
        }
      }

      if (!supportsDynamicImport() || typeof BigInt === 'undefined') {
        // TODO: should fail gracefully here instead.
        throw new CATMAID.Error(
          'Your browser does not support features required for N5 mirrors');
      }

      this.hasScaleLevels = this.baseURL.includes('%SCALE_DATASET%');
      this.datasetURL = this.baseURL.substring(0, this.baseURL.lastIndexOf('/'));
      this.datasetPathFormat = this.datasetURL.substring(this.rootURL.length + 1);
      let sliceDims = this.baseURL.substring(this.baseURL.lastIndexOf('/') + 1);
      this.sliceDims = sliceDims.split('_').map(d => parseInt(d, 10));
      this.reciprocalSliceDims = Array.from(Array(this.sliceDims.length).keys())
          .sort((a, b) => this.sliceDims[a] - this.sliceDims[b]);
      // Because we cannot infer the root URL, must find it exhaustively.
      let n5SearchIndex = this.datasetURL.lastIndexOf('%SCALE_DATASET%');
      // Initial guess of root:
      this.rootURL = n5SearchIndex === -1 ?
          this.datasetURL :
          this.datasetURL.substring(0, n5SearchIndex - 1);

      this.datasetAttributes = [];
      this.promiseReady = N5ImageBlockSource.loadN5()
          .then(n5wasm => this._findRoot(n5wasm).then(r => this.reader = r))
          .then(() => this.populateDatasetAttributes());
      this.ready = false;
    }

    static loadN5() {
      // Store a static promise for loading the N5 wasm module to prevent
      // reloading for multiple stacks and to prevent strange wasm panics when
      // loading multiple times.
      if (!this.promiseN5wasm) {
        // This is done inside a Function/eval so that Firefox does not fail
        // to parse this whole file because of the dynamic import.
        const jsPath = CATMAID.makeStaticURL('libs/n5-wasm/n5_wasm.js');
        this.promiseN5wasm = (new Function(`return import('${jsPath}')`))()
            .then(n5wasm =>
                wasm_bindgen(CATMAID.makeStaticURL('libs/n5-wasm/n5_wasm_bg.wasm'))
                .then(() => wasm_bindgen));
      }

      return this.promiseN5wasm;
    }

    /** Find the root of this N5 container by recursively walking up the path. */
    _findRoot(n5wasm) {
      return n5wasm.N5HTTPFetch.open(this.rootURL)
        .then(r => {
          this.datasetPathFormat = this.datasetURL.substring(this.rootURL.length + 1);
          return r;
        })
        .catch(error => {
          let origin = (new URL(this.rootURL)).origin;
          let nextDir = this.rootURL.lastIndexOf('/');
          if (nextDir === -1 || origin == this.rootURL) {
            CATMAID.msg('Mirror Inaccessible', `Could not locate N5 root for mirror ${this.id}`, {style: 'error'});
            // Don't cause error popups, but do not resolve promise.
            return new Promise(() => {});
          }
          this.rootURL = this.rootURL.substring(0, nextDir);
          return this._findRoot(n5wasm);
        });
    }

    getTileURL(project, stack, slicePixelPosition, col, row, zoomLevel) {
      let z = Math.floor(slicePixelPosition[0] / this.blockSize(zoomLevel)[2]);
      let sourceCoord = [col, row, z];
      let blockCoord = CATMAID.tools.permute(sourceCoord, this.reciprocalSliceDims);

      return this.rootURL + '/' + this.datasetPath(zoomLevel) + '/' + blockCoord.join('/');
    }

    populateDatasetAttributes() {
      let datasetPath = this.datasetPath(zoomLevel);
      return this.reader
          .dataset_exists(datasetPath)
          // If accessing the path results in an error, treat the path as
          // inaccessible and stop further zoom-level lookups.
          .catch(() => false)
          .then(exists => {
            if (exists) {
              return this.reader.get_dataset_attributes(datasetPath)
                  .then(dataAttrs => this.datasetAttributes[zoomLevel] = dataAttrs)
                  .then(() => {
                    if (this.hasScaleLevels) {
                      return this.populateDatasetAttributes(zoomLevel + 1);
                    }
                  });
            }
          })
          .then(() => this.ready = true);
    }

    blockCoordBounds(zoomLevel) {
      if (!this.ready) return;

      let attrs = this.datasetAttributes[zoomLevel];
      let bs = attrs.get_block_size();
      // Use `BigInt` rather than literals to not break old parsers.
      let n0 = BigInt(0);
      let n1 = BigInt(1);
      let max = attrs.get_dimensions().map((d, i) => {
        let b = BigInt(bs[i]);
        // - 1 because this is inclusive.
        return (d + n1) / b + (d % b != n0  ? n1 : n0) - n1;
      });
      // FIXME: check conversion is valid
      let maxNum = new Array(max.length);
      max.forEach((n, i) => maxNum[i] = Number(n));

      let min = new Array(maxNum.length).fill(0);
      return new CATMAID.BlockCoordBounds(min, maxNum);
    }

    blockSize(zoomLevel) {
      if (!this.ready) return [
        this.tileWidth,
        this.tileHeight,
        1
      ];
      let bs = this.datasetAttributes[zoomLevel].get_block_size();
      return CATMAID.tools.permute(bs, this.sliceDims);
    }

    dataType () {
      return this.ready ?
          this.datasetAttributes[0].get_data_type().toLowerCase() :
          undefined;
    }

    readBlock(zoomLevel, ...sourceCoord) {
      return this.promiseReady.then(() => {
        let path = this.datasetPath(zoomLevel);
        let dataAttrs = this.datasetAttributes[zoomLevel];

        let blockCoord = CATMAID.tools.permute(sourceCoord, this.reciprocalSliceDims);

        return this.reader
            .read_block_with_etag(path, dataAttrs, blockCoord.map(BigInt))
            .then(block => {
              if (block) {
                let etag = block.get_etag();
                let size = block.get_size();
                let n = 1;
                let stride = size.map(s => { let rn = n; n *= s; return rn; });
                return {
                  etag,
                  block: new nj.NdArray(nj.ndarray(block.into_data(), size, stride))
                      .transpose(...this.sliceDims)
                };
              } else {
                return {block, etag: undefined};
              }
            });
      });
    }

    datasetPath(zoomLevel) {
      return this.datasetPathFormat
          .replace('%SCALE_DATASET%', this.scaleLevelPath(zoomLevel));
    }

    scaleLevelPath(zoomLevel) {
      return 's' + zoomLevel;
    }

    numScaleLevels() {
      return this.datasetAttributes.length;
    }

    checkCanary(project, stack, noCache) {
      let request = (options) => {
        let url = this.getCanaryUrl(project, stack);

        if (noCache) {
          url += "?nocache=" + Date.now();
        }

        let before = performance.now();
        return fetch(new Request(url, options))
          .then(response =>
            [response.status === 200, performance.now() - before]
          )
          .catch(() => [false, Infinity]);
      };

      return this.promiseReady.then(() => Promise.all([
          request(),
          request({mode: 'cors', credentials: 'same-origin'})
      ]).then(result => ({
          normal:     result[0][0],
          normalTime: result[0][1],
          cors:       result[1][0],
          corsTime:   result[1][1]
      })));
    }
  };

  /**
   * Image block source type for N5 datasets. This sub-implementation uses
   * a pool of web workers for block loading.
   * See https://github.com/saalfeldlab/n5
   * See https://github.com/aschampion/n5-wasm
   *
   * Source type: 11
   */
  CATMAID.N5ImageBlockWorkerSource = class N5ImageBlockWorkerSource extends CATMAID.N5ImageBlockSource {
    constructor(...args) {
      super(...args);

      this.promiseReady.then(() => {
        this.workers = new CATMAID.PromiseWorkerPool(
          () => { return {
            worker: new CATMAID.PromiseWorker(
              new Worker(CATMAID.makeStaticURL('libs/n5-wasm/n5_wasm_worker.js'))
            ),
            init: (worker) => worker.postMessage([
              [wasm_bindgen.__wbindgen_wasm_module],
              this.rootURL,
            ]),
          };}
        );
      });
    }

    readBlock(zoomLevel, ...sourceCoord) {
      return this.promiseReady.then(() => {
        let path = this.datasetPath(zoomLevel);
        let dataAttrs = this.datasetAttributes[zoomLevel];

        if (!dataAttrs) return {block: null, etag: undefined};

        let blockCoord = CATMAID.tools.permute(sourceCoord, this.reciprocalSliceDims);

        return this.workers
            .postMessage([path, dataAttrs.to_json(), blockCoord.map(BigInt)])
            .then(block => {
              if (block) {
                let n = 1;
                let stride = block.size.map(s => { let rn = n; n *= s; return rn; });
                return {
                  etag: block.etag,
                  block: new nj.NdArray(nj.ndarray(block.data, block.size, stride))
                      .transpose(...this.sliceDims)
                };
              } else {
                return {block, etag: undefined};
              }
            });
      });
    }
  };

  /**
   * Tile source for Boss tiles.
   *
   * See https://docs.theboss.io/docs/image
   *
   * https://api.theboss.io/v1/tile/:collection/:experiment/:channel/:orientation/:tile_size/:resolution/:x_idx/:y_idx/:z_idx/:t_idx/
   *
   * Tile source: 10
   */
  CATMAID.BossTileSource = function () {
    CATMAID.AbstractTileSource.apply(this, arguments);

    if (this.tileWidth !== this.tileHeight)
      throw new CATMAID.ValueError('Tile width and height must be equal for Boss tile sources!');

    this.authToken = '';
    this.headers = {};
  };

  CATMAID.BossTileSource.prototype = Object.create(CATMAID.AbstractTileSource.prototype);

  CATMAID.BossTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    if (stack.orientation === CATMAID.Stack.ORIENTATION_XY) {
      return this.baseURL + 'xy/' + this.tileWidth + '/' + zoomLevel + '/' + col + '/' + row + '/' + slicePixelPosition[0];
    } else if (stack.orientation === CATMAID.Stack.ORIENTATION_XZ) {
      return this.baseURL + 'xz/' + this.tileWidth + '/' + zoomLevel + '/' + col + '/' + slicePixelPosition[0] + '/' + row ;
    } else if (stack.orientation === CATMAID.Stack.ORIENTATION_ZY) {
      return this.baseURL + 'yz/' + this.tileWidth + '/' + zoomLevel + '/' + col + '/' + row + '/' + slicePixelPosition[0];
    }
  };

  CATMAID.BossTileSource.prototype.getSettings = function () {
    return [
        {name: 'authToken', displayName: 'Boss auth token', type: 'text', value: this.authToken,
          help: 'TODO'},
      ];
  };

  CATMAID.BossTileSource.prototype.setSetting = function () {
    CATMAID.AbstractTileSource.prototype.setSetting.apply(this, arguments);
    this._buildRequestHeaders();
  };

  CATMAID.BossTileSource.prototype._buildRequestHeaders = function () {
    this.headers = {'Authorization': 'Token ' + this.authToken};
  };

  CATMAID.BossTileSource.prototype.getRequestHeaders = function () {
    return this.headers;
  };


  /**
   * Get Tiles from another source through CloudVolume on the back-end. Note:
   * this isn't very performant when accessed by many people. A front-end based
   * approach should be used/implemented instead.
   *
   * Source type: 13
   */
  CATMAID.CloudVolumeTileSource = function () {
    CATMAID.AbstractTileSourceWithOverview.apply(this, arguments);
  };

  CATMAID.CloudVolumeTileSource.prototype = Object.create(CATMAID.AbstractTileSourceWithOverview.prototype);

  CATMAID.CloudVolumeTileSource.prototype.getTileURL = function (
      project, stack, slicePixelPosition, col, row, zoomLevel) {
    return CATMAID.makeURL(project.id + '/stack/' + stack.id + '/tile?' +
        $.param({
          x: col * this.tileWidth,
          y: row * this.tileHeight,
          width: this.tileWidth,
          height: this.tileHeight,
          row: 'y',
          col: 'x',
          scale: 1/(1 << zoomLevel), // Bitshift is safe because zoomLevel is integral.
          z: slicePixelPosition[0],
          file_extension: this.fileExtension,
          basename: this.baseURL,
          type:'all',
          format: 'cloudvolume',
        }));
  };

  CATMAID.CloudVolumeTileSource.prototype.getOverviewURL = function(stack, slicePixelPosition) {
    let [stackWidth, stackHeight] = [stack.dimension.x, stack.dimension.y];
    let scale, width, height;
    if (stackWidth > stackHeight) {
      [width, height] = [192, Math.ceil(192 * (stackHeight / stackWidth))];
      scale = 1 / Math.floor(stackWidth / 192);
    } else {
      [width, height] = [Math.ceil(192 * (stackWidth / stackHeight)), 192];
      scale = 1 / Math.floor(stackHeight / 192);
    }
    return CATMAID.makeURL(project.id + '/stack/' + stack.id + '/tile?' +
        $.param({
          x: 0,
          y: 0,
          width: width,
          height: height,
          row: 'y',
          col: 'x',
          scale: scale,
          z: slicePixelPosition[0],
          file_extension: this.fileExtension,
          basename: this.baseURL,
          type:'all',
          upscale: true,
          format: 'cloudvolume',
        }));
  };

  /**
   * Image block source type for Neuroglancer precomputed datasets.
   * See https://github.com/google/neuroglancer/blob/master/src/neuroglancer/datasource/precomputed/README.md
   *
   * Source type: 14
   */
  CATMAID.NeuroglancerPrecomputedImageBlockSource = class NeuroglancerPrecomputedImageBlockSource extends CATMAID.AbstractImageBlockSource {
    constructor(...args) {
      super(...args);

      function supportsDynamicImport() {
        try {
          new Function('import("")');
          return true;
        } catch (err) {
          return false;
        }
      }

      if (!supportsDynamicImport() || typeof BigInt === 'undefined') {
        // TODO: should fail gracefully here instead.
        throw new CATMAID.Error(
          'Your browser does not support features required for NeuroglancerPrecomputed mirrors');
      }

      this.datasetURL = this.baseURL.substring(0, this.baseURL.lastIndexOf('/'))
          .replace(/^gs:\/\//, 'https://storage.googleapis.com/');

      let sliceDims = this.baseURL.substring(this.baseURL.lastIndexOf('/') + 1);
      this.sliceDims = sliceDims.split('_').map(d => parseInt(d, 10));
      this.reciprocalSliceDims = Array.from(Array(this.sliceDims.length).keys())
          .sort((a, b) => this.sliceDims[a] - this.sliceDims[b]);
      // Because we cannot infer the root URL, must find it exhaustively.
      let ngPreSearchIndex = this.datasetURL.lastIndexOf('%SCALE_DATASET%');
      // Initial guess of root:
      this.rootURL = ngPreSearchIndex === -1 ?
          this.datasetURL :
          this.datasetURL.substring(0, ngPreSearchIndex - 1);
      this.datasetPathFormat = this.datasetURL.substring(this.rootURL.length + 1);

      this.datasetAttributes = null;
      this.promiseReady = NeuroglancerPrecomputedImageBlockSource.loadNeuroglancerPrecomputed()
          .then(ngprewasm => this._findRoot(ngprewasm).then(r => this.reader = r))
          .then(() => this.populateDatasetAttributes());
      this.ready = false;
    }

    static loadNeuroglancerPrecomputed() {
      // Store a static promise for loading the NeuroglancerPrecomputed wasm module to prevent
      // reloading for multiple stacks and to prevent strange wasm panics when
      // loading multiple times.
      if (!this.promiseNeuroglancerPrecomputedwasm) {
        // This is done inside a Function/eval so that Firefox does not fail
        // to parse this whole file because of the dynamic import.
        const jsPath = CATMAID.makeStaticURL('libs/ngpre-wasm/ngpre_wasm.js');
        this.promiseNeuroglancerPrecomputedwasm = (new Function(`return import('${jsPath}')`))()
            .then(module =>
                // The global ngpre_wasm variable is created in ngpre_wasm.js
                ngpre_wasm(CATMAID.makeStaticURL('libs/ngpre-wasm/ngpre_wasm_bg.wasm'))
                .then(() => ngpre_wasm));
      }

      return this.promiseNeuroglancerPrecomputedwasm;
    }

    /** Find the root of this NeuroglancerPrecomputed container by recursively walking up the path. */
    _findRoot(ngeprewasm) {
      return ngeprewasm.NgPreHTTPFetch.open(this.rootURL)
        .then(r => {
          this.datasetPathFormat = this.datasetURL.substring(this.rootURL.length + 1);
          return r;
        })
        .catch(error => {
          let origin = (new URL(this.rootURL)).origin;
          let nextDir = this.rootURL.lastIndexOf('/');
          if (nextDir === -1 || origin == this.rootURL) {
            CATMAID.msg('Mirror Inaccessible', `Could not locate Neuroglancer Precomputed root for mirror ${this.id}`, {style: 'error'});
            // Don't cause error popups, but do not resolve promise.
            return new Promise(() => {});
          }
          this.rootURL = this.rootURL.substring(0, nextDir);
          return this._findRoot(ngeprewasm);
        });
    }

    getTileURL(project, stack, slicePixelPosition, col, row, zoomLevel) {
      let bs = this.blockSize(zoomLevel);
      let z = Math.floor(slicePixelPosition[0] / bs[2]);
      let vo = this.voxelOffset(zoomLevel);
      let sourceCoord = [col, row, z];
      let blockCoord = CATMAID.tools.permute(sourceCoord, this.reciprocalSliceDims);
      // The voxel offset specifies how the image dataset is translated relativ
      // to the global origin. We want to map from global into voxel
      let voxelCoord = [
          blockCoord[0] * bs[0] + vo[0],
          blockCoord[1] * bs[1] + vo[1],
          blockCoord[2] * bs[2] + vo[2]];

      return `${this.rootURL}/${this.datasetPath(zoomLevel)}/` +
          `${voxelCoord[0]}-${voxelCoord[0] + bs[0]}_${voxelCoord[1]}-${voxelCoord[1] + bs[1]}_${voxelCoord[2]}-${voxelCoord[2] + bs[2]}`;
    }

    populateDatasetAttributes(zoomLevel = 0) {
      return this.reader
          .get_dataset_attributes("")
          .then(dataAttrs => {
            this.datasetAttributes = dataAttrs;
            // This makes accessing individual scale level properties easier.
            this.scalelevelAttributes = dataAttrs.to_json().scales;
            this.ready = true;
          });
    }

    blockCoordBounds(zoomLevel) {
      if (!this.ready) return;

      let attrs = this.datasetAttributes;
      let bs = attrs.get_block_size(zoomLevel);
      // Use `BigInt` rather than literals to not break old parsers.
      let n0 = BigInt(0);
      let n1 = BigInt(1);
      let max = attrs.get_dimensions(zoomLevel).map((d, i) => {
        let b = BigInt(bs[i]);
        // - 1 because this is inclusive.
        return (d + n1) / b + (d % b != n0  ? n1 : n0) - n1;
      });
      // FIXME: check conversion is valid
      let maxNum = new Array(max.length);
      max.forEach((n, i) => maxNum[i] = Number(n));

      let min = new Array(maxNum.length).fill(0);
      return new CATMAID.BlockCoordBounds(min, maxNum);
    }

    blockSize(zoomLevel) {
      if (!this.ready || !this.datasetAttributes) return [
        this.tileWidth,
        this.tileHeight,
        1
      ];
      let bs = this.datasetAttributes.get_block_size(zoomLevel);
      return CATMAID.tools.permute(bs, this.sliceDims);
    }

    voxelOffset(zoomLevel) {
      if (!this.ready || !this.datasetAttributes) return [
        0,
        0,
        0
      ];
      let vo = this.datasetAttributes.get_voxel_offset(zoomLevel);
      return CATMAID.tools.permute(vo, this.sliceDims);
    }

    dataType () {
      return this.ready ?
          this.datasetAttributes.get_data_type().toLowerCase() :
          undefined;
    }

    readBlock(zoomLevel, ...sourceCoord) {
      return this.promiseReady.then(() => {
        let path = this.datasetPath(zoomLevel);
        let dataAttrs = this.datasetAttributes;

        let blockCoord = CATMAID.tools.permute(sourceCoord, this.reciprocalSliceDims);

        return this.reader
            .read_block_with_etag(path, dataAttrs, blockCoord.map(BigInt))
            .then(block => {
              if (block) {
                let etag = block.get_etag();
                let size = block.get_size();
                let n = 1;
                let stride = size.map(s => { let rn = n; n *= s; return rn; });
                return {
                  etag,
                  block: new nj.NdArray(nj.ndarray(block.into_data(), size, stride))
                      .transpose(...this.sliceDims)
                };
              } else {
                return {block, etag: undefined};
              }
            });
      });
    }

    datasetPath(zoomLevel) {
      return this.datasetPathFormat
          .replace('%SCALE_DATASET%', this.scaleLevelPath(zoomLevel));
    }

    scaleLevelPath(zoomLevel) {
      if (!this.ready) {
        return '';
      }
      return this.scalelevelAttributes[zoomLevel].key;
    }

    numScaleLevels() {
      return this.datasetAttributes ? this.datasetAttributes.to_json().scales.length : 0;
    }

    checkCanary(project, stack, noCache) {
      let request = (options) => {
        let url = this.getCanaryUrl(project, stack);

        if (noCache) {
          url += "?nocache=" + Date.now();
        }

        let before = performance.now();
        return fetch(new Request(url, options))
          .then(response =>
            [response.status === 200, performance.now() - before]
          )
          .catch(() => [false, Infinity]);
      };

      return this.promiseReady.then(() => Promise.all([
          request(),
          request({mode: 'cors', credentials: 'same-origin'})
      ]).then(result => ({
          normal:     result[0][0],
          normalTime: result[0][1],
          cors:       result[1][0],
          corsTime:   result[1][1]
      })));
    }
  };

  /**
   * Image block source type for NeuroglancerPrecomputed datasets. This sub-implementation uses
   * a pool of web workers for block loading.
   * See https://github.com/saalfeldlab/n5
   * See https://github.com/aschampion/n5-wasm
   *
   * Source type: 14
   */
  CATMAID.NeuroglancerPrecomputedImageBlockWorkerSource = class NeuroglancerPrecomputedImageBlockWorkerSource extends CATMAID.NeuroglancerPrecomputedImageBlockSource {
    constructor(...args) {
      super(...args);

      this.promiseReady.then(() => {
        this.workers = new CATMAID.PromiseWorkerPool(
          () => { return {
            worker: new CATMAID.PromiseWorker(
              new Worker(CATMAID.makeStaticURL('libs/ngpre-wasm/ngpre_wasm_worker.js'))
            ),
            init: (worker) => worker.postMessage([
              [ngpre_wasm.__wbindgen_wasm_module],
              this.rootURL,
            ]),
          };}
        );
      });
    }

    readBlock(zoomLevel, ...sourceCoord) {
      return this.promiseReady.then(() => {
        let path = this.datasetPath(zoomLevel);
        let dataAttrs = this.datasetAttributes;

        if (!dataAttrs) return {block: null, etag: undefined};

        let blockCoord = CATMAID.tools.permute(sourceCoord, this.reciprocalSliceDims);

        return this.workers
            .postMessage([path, dataAttrs.to_json(), blockCoord.map(BigInt)])
            .then(block => {
              if (block) {
                let n = 1;
                let stride = block.size.map(s => { let rn = n; n *= s; return rn; });
                return {
                  etag: block.etag,
                  block: new nj.NdArray(nj.ndarray(block.data, block.size, stride))
                      .transpose(...this.sliceDims)
                };
              } else {
                return {block, etag: undefined};
              }
            });
      });
    }
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
                                          getOverviewURL, cropWidth, cropHeight) {
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
        if (cropWidth && cropHeight) {
          ctx.drawImage(img, 0, 0, cropWidth, cropHeight, 0, 0, this.canvas.width, this.canvas.height);
        } else {
          ctx.drawImage(img, 0, 0);
        }
      }
    }).bind(this);

    this.redraw(); // sets the img URL
  };

  CATMAID.GenericOverviewLayer.prototype = Object.create(CATMAID.ArtificialOverviewLayer.prototype);

})(CATMAID);
