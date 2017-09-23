/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */

(function(CATMAID) {

  "use strict";

  /**
   * Displays a grid of tiles from an image stack.
   * @constructor
   * @param {StackViewer} stackViewer Stack viewer to which this layer belongs.
   * @param {string}  displayname  Name displayed in window controls.
   * @param {Stack}   stack        Image stack from which to draw tiles.
   * @param {number}  mirrorIndex  Stack mirror index to use as tile source. If
   *                               undefined, the fist available mirror is used.
   * @param {boolean} visibility   Whether the tile layer is initially visible.
   * @param {number}  opacity      Opacity to draw the layer.
   * @param {boolean} showOverview Whether to show a "minimap" overview of the
   *                               stack.
   * @param {boolean} linearInterpolation Whether to use linear or nearest
   *                               neighbor tile texture interpolation.
   * @param {boolean} readState    Whether last used mirror and custom mirrors
   *                               should be read from a browser cookie.
   * @param {boolean} changeMirrorIfNoData Whether to automatically switch to
   *                               the next accessible mirror if the present one
   *                               in inaccessible. (Default: true)
   */
  function TileLayer(
      stackViewer,
      displayname,
      stack,
      mirrorIndex,
      visibility,
      opacity,
      showOverview,
      linearInterpolation,
      readState,
      changeMirrorIfNoData) {
    this.stackViewer = stackViewer;
    this.displayname = displayname;
    this.stack = stack;
    this.opacity = opacity; // in the range [0,1]
    this.visible = visibility;
    this.isOrderable = true;
    this.isHideable = false;
    this.lastMirrorStorageName = 'catmaid-last-mirror-' +
        project.id + '-' + stack.id;
    this.customMirrorStorageName = 'catmaid-custom-mirror-' +
        project.id + '-' + stack.id;

    if (readState) {
      var serializedCustomMirrorData = readStateItem(this.customMirrorStorageName);
      if (serializedCustomMirrorData) {
        var customMirrorData = JSON.parse(serializedCustomMirrorData);
        stack.addMirror(customMirrorData);
      }

      // If no mirror index is given, try to read the last used value from a
      // cookie. If this is unavailable, use the first mirror as default.
      if (undefined === mirrorIndex) {
        var lastUsedMirror = readStateItem(this.lastMirrorStorageName);
        if (lastUsedMirror) {
          mirrorIndex = parseInt(lastUsedMirror, 10);

          if (mirrorIndex >= this.stack.mirrors.length) {
            localStorage.removeItem(this.lastMirrorStorageName);
            mirrorIndex = undefined;
          }
        }
      }
    }
    this._readState = readState;

    this.mirrorIndex = mirrorIndex || 0;
    this.tileSource = stack.createTileSourceForMirror(this.mirrorIndex);

    /* Whether mirros should be changed automatically if image data is
     * unavailable.
     */
    this.changeMirrorIfNoData = CATMAID.tools.getDefined(changeMirrorIfNoData, true);

    /**
     * Whether to hide this tile layer if the nearest section is marked as
     * broken, rather than the default behavior of displaying the nearest
     * non-broken section.
     * @type {Boolean}
     */
    this.hideIfNearestSliceBroken = CATMAID.TileLayer.Settings.session.hide_if_nearest_section_broken;

    /**
     * Omit tiles with less area than this threshold visible.
     * @type {Number}
     */
    this.efficiencyThreshold = 0.0;

    /**
     * Contains all tiles in a 2D toroidal array
     * @type {Element[][]}
     */
    this._tiles = [];
    /**
     * Current origin row in the tiles array.
     * @type {Number}
     */
    this._tileOrigR = 0;
    /**
     * Current origin column in the tiles array.
     * @type {Number}
     */
    this._tileOrigC = 0;
    /**
     * Current stack tile row of the tiles array origin.
     * @type {Number}
     */
    this._tileFirstR = 0;
    /**
     * Current stack tile column of the tiles array origin.
     * @type {Number}
     */
    this._tileFirstC = 0;
    this._tilesBuffer = [];
    this._buffering = false;
    this._swapBuffersTimeout = null;

    this.tilesContainer = document.createElement('div');
    this.tilesContainer.className = 'sliceTiles';

    /**
     * True to use linear tile texture interpolation, false to use nearest
     * neighbor.
     * @type {boolean}
     */
    this._interpolationMode = linearInterpolation;
    this.tilesContainer.classList.add('interpolation-mode-' + (this._interpolationMode ? 'linear' : 'nearest'));

    if (this.tileSource.transposeTiles && this.tileSource.transposeTiles.has(stack.orientation)) {
      // Some tile sources may provide transposed tiles versus CATMAID's
      // expectation, e.g., YZ tiles for a ZY oriented stack. In these cases
      // the tile layer is responsible for transposing them back to CATMAID's
      // preferred orientation in the client.
      this.tilesContainer.classList.add('transpose');
      this._transpose = true;
    }

    stackViewer.getLayersView().appendChild(this.tilesContainer);

    if (showOverview) {
      // Initialize the OverviewLayer on the bottom-right with the correct
      // path to the small thumbnail images depending on the tile source type
      // This is only run for the TileLayer which usually holds the primary
      // raw data, and not for additional overlay layers. Overlay layers are
      // currently not shown with a small image.
      this.overviewLayer = this.tileSource.getOverviewLayer(this);
    }

    CATMAID.checkTileSourceCanary(project, this.stack, this.tileSource)
        .then(this._handleCanaryCheck.bind(this));
  }

  var readStateItem = function(key) {
    var item = localStorage.getItem(key);
    if (!item) {
    // Try to load custom mirror from cookie if no local storage information
    // is found. This is removed in a future release and is only meant to not
    // cause surprising defaults after an update.
      item = CATMAID.getCookie(key);
      if (item) {
        localStorage.setItem(key, item);
        // Remove old cookie entry
        CATMAID.setCookie(key, '', -1);
      }
    }
    return item;
  };

  /**
   * Handle a canary tile check for the tile source mirror.
   *
   * If the mirror is not accessible, switch to the first accessible mirror
   * (ordered by mirror preference position). Otherwise, warn that no
   * accessible mirror is available.
   *
   * @param  {Object} accessible Check result with normal and cors booleans.
   */
  TileLayer.prototype._handleCanaryCheck = function (accessible) {
    if (!accessible.normal && this.changeMirrorIfNoData) {
      Promise
          .all(this.stack.mirrors.map(function (mirror, index) {
            return CATMAID.checkTileSourceCanary(
                project,
                this.stack,
                this.stack.createTileSourceForMirror(index));
          }, this))
          .then((function (mirrorAccessible) {
            var mirrorIndex = mirrorAccessible.findIndex(function (accessible) {
              return accessible.normal;
            });

            if (mirrorIndex !== -1) {
              var oldMirrorTitle = this.stack.mirrors[this.mirrorIndex].title;
              var newMirrorTitle = this.stack.mirrors[mirrorIndex].title;
              CATMAID.warn('Stack mirror "' + oldMirrorTitle + '" is inaccessible. ' +
                           'Switching to mirror "' + newMirrorTitle + '".');
              this.switchToMirror(mirrorIndex);
            } else {
              CATMAID.warn('No mirrors for this stack are accessible. Image data may not load.');
            }
          }).bind(this));
    }
  };

  /**
   * Sets the interpolation mode for tile textures to linear pixel interpolation
   * or nearest neighbor.
   * @param {boolean} linear True for linear, false for nearest neighbor.
   */
  TileLayer.prototype.setInterpolationMode = function (linear) {
    this.tilesContainer.classList.remove('interpolation-mode-' + (this._interpolationMode ? 'linear' : 'nearest'));
    this._interpolationMode = linear;
    this.tilesContainer.classList.add('interpolation-mode-' + (this._interpolationMode ? 'linear' : 'nearest'));
  };

  /**
   * Return friendly name of this layer.
   */
  TileLayer.prototype.getLayerName = function () {
    return this.displayname;
  };

  /**
   * Remove any DOM created by this layer from the stack viewer.
   */
  TileLayer.prototype.unregister = function () {
    this.stackViewer.getLayersView().removeChild(this.tilesContainer);
  };

  /**
   * Initialise the tiles array and buffer.
   */
  TileLayer.prototype._initTiles = function (rows, cols) {
    while (this.tilesContainer.firstChild)
      this.tilesContainer.removeChild(this.tilesContainer.firstChild);

    var tileOnload = function () {
      if (this.alt === 'h') return;
      this.style.visibility = 'visible';
      this.alt = 'l'; // Set a flag to indicate this image has loaded
    };

    this._tiles = [];

    this._tilesBuffer = [];

    this._tileOrigR = 0;
    this._tileOrigC = 0;
    this._tileFirstR = 0;
    this._tileFirstC = 0;

    for (var i = 0; i < rows; ++i) {
      this._tiles[i] = [];
      this._tilesBuffer[i] = [];
      for (var j = 0; j < cols; ++j) {
        var tile = document.createElement( 'img' );
        // The alt attribute of these and the buffer's images is abused
        // to indicate states for buffering resilience: empty for
        // loading an image, 'l' for a loaded image, and 'h' for hidden.
        tile.alt = '';
        tile.style.visibility = 'hidden';
        tile.onload = tileOnload;
        this._tiles[i][j] = tile;

        this._tilesBuffer[i][j] = document.createElement('img');
        this._tilesBuffer[i][j].alt = '';
        this._tilesBuffer[i][j].visibility = 'hidden';

        this.tilesContainer.appendChild(tile);
      }
    }
  };

  TileLayer.prototype.rowTransform = function (r) {
    var rows = this._tiles.length;
    return ((r % rows) + rows + this._tileOrigR) % rows;
  };

  TileLayer.prototype.colTransform = function (c) {
    var cols = this._tiles[0].length;
    return ((c % cols) + cols + this._tileOrigC) % cols;
  };

  /**
   * Update and draw the tile grid based on the current stack position and scale.
   */
  TileLayer.prototype.redraw = function (completionCallback, blocking) {
    var scaledStackPosition = this.stackViewer.scaledPositionInStack(this.stack);
    var tileInfo = this.tilesForLocation(
        scaledStackPosition.xc,
        scaledStackPosition.yc,
        scaledStackPosition.z,
        scaledStackPosition.s,
        this.efficiencyThreshold);

    // By default all needed tiles are shown. This can be changed so that all
    // tiles are hidden, e.g. if the current location is on a broken slice and
    // CATMAID is configured to hide these sections.
    var showTiles = true;

    if (this.hideIfNearestSliceBroken) {
      // Re-project the stack z without avoiding broken sections to determine
      // if the nearest section is broken.
      var linearStackZ = this.stack.projectToLinearStackZ(
          this.stackViewer.projectCoordinates().z);
      if (this.stack.isSliceBroken(linearStackZ)) {
        this.tilesContainer.style.opacity = '0';
        showTiles = false;
      } else {
        this.setOpacity(this.opacity);
      }
    }

    var effectiveTileWidth = this.tileSource.tileWidth * tileInfo.mag;
    var effectiveTileHeight = this.tileSource.tileHeight * tileInfo.mag;

    var rows = this._tiles.length, cols = this._tiles[0].length;

    // If panning only (no scaling, no browsing through z)
    if (this.stackViewer.z == this.stackViewer.old_z &&
        this.stackViewer.s == this.stackViewer.old_s)
    {
      // Compute panning in X and Y
      var xd = tileInfo.firstCol - this._tileFirstC;
      var yd = tileInfo.firstRow - this._tileFirstR;

      // Hide wrapped tiles. Here it is assumed abs({xd|yd}) <= 1, i.e.,
      // it is impossible to pan more than one tile in a single redraw.
      if (xd !== 0) {
        // Panning to the left or right:
        // hide the former last or first column of tiles, respectively.
        var col = this.colTransform(xd < 0 ? -1 : 0);
        for (var i = rows - 1; i >= 0; --i)
          this._tiles[i][col].style.visibility = 'hidden';
      }

      if (yd !== 0) {
        // Panning to the top or bottom:
        // hide the former last or first row of tiles, respectively.
        var row = this.rowTransform(yd < 0 ? -1 : 0);
        for (var j = cols - 1; j >= 0; --j)
          this._tiles[row][j].style.visibility = 'hidden';
      }

      // Update the toroidal origin in the tiles array
      this._tileOrigR = this.rowTransform(yd); //(tileOrigR + yd + tiles.length) % tiles.length;
      this._tileOrigC = this.colTransform(xd); //(tileOrigC + xd + tiles[0].length) % tiles[0].length;
    }

    this._tileFirstC = tileInfo.firstCol;
    this._tileFirstR = tileInfo.firstRow;

    var top = tileInfo.top;
    var left = tileInfo.left;

    var t = top;
    var l = left;

    // If zooming or changing z sections (not panning), attempt to preload
    // images to paint at once (but let regular code run for new stacks.)
    this._buffering = this.stackViewer.z !== this.stackViewer.old_z ||
                      this.stackViewer.s !== this.stackViewer.old_s;

    var to_buffer =
        (tileInfo.lastCol - Math.max(0, tileInfo.firstCol) + 1) *
        (tileInfo.lastRow - Math.max(0, tileInfo.firstRow) + 1);
    var buffered = 0;

    // Set a timeout for slow connections to swap in the buffer whether or
    // not it has loaded.
    if (this._buffering) {
      window.clearTimeout(this._swapBuffersTimeout);
      this._swapBuffersTimeout = window.setTimeout(this._swapBuffers.bind(this), 3000);
    }

    // Callback to deal with buffered image loading. Calls swapBuffers once
    // all requested images have been loaded in the tile buffer.
    var self = this;
    function bufferLoadDeferred() {
      return function () {
        if (!self._buffering || this.alt === 'h') return;
        buffered = buffered + 1;
        this.alt = 'l';
        if (buffered === to_buffer) {
          window.clearTimeout(self._swapBuffersTimeout);
          self._swapBuffers();
        }
      };
    }

    var nextL, nextT, seamRow;
    var slicePixelPosition = [tileInfo.z];

    // Update tiles (or the tile buffer).
    for (var i = this._tileOrigR, ti = 0; ti < rows; ++ti, i = (i+1) % rows) {
      var r = tileInfo.firstRow + ti;

      nextT = t + effectiveTileHeight;
      seamRow = Math.round(nextT) - nextT > 0;

      for (var j = this._tileOrigC, tj = 0; tj < cols; ++tj, j = (j+1) % cols) {
        var c = tileInfo.firstCol + tj;
        var tile = this._buffering ? this._tilesBuffer[i][j] : this._tiles[i][j];

        nextL = l + effectiveTileWidth;

        if (c >= 0 && c <= tileInfo.lastCol &&
            r >= 0 && r <= tileInfo.lastRow && showTiles) {
          var source = this.tileSource.getTileURL(project, this.stack, slicePixelPosition,
              c, r, tileInfo.zoom);

          tile.style.top = t + 'px';
          tile.style.left = l + 'px';

          var width, height;

          // To prevent tile seams when the browser is going to round the
          // edge of the next column up a pixel, grow the width of this
          // column slightly to fill the gap
          if (Math.round(nextL) - nextL > 0) {
            width = Math.ceil(effectiveTileWidth) + 'px';
          } else {
            width = effectiveTileWidth + 'px';
          }

          // As above, prevent tile seams when the next row will round up
          if (seamRow) {
            height = Math.ceil(effectiveTileHeight) + 'px';
          } else {
            height = effectiveTileHeight + 'px';
          }

          if (this._transpose) {
            // CSS dimensions are applied before transforms
            tile.style.width = height;
            tile.style.height = width;
          } else {
            tile.style.width = width;
            tile.style.height = height;
          }

          if (tile.src === source) {
            if (tile.alt === 'h') tile.alt = 'l';
            if (this._buffering) {
              bufferLoadDeferred().call(tile);
            }
            // If a tile was hidden earlier, but we now wish to
            // show it again and it happens to have the same src,
            // Chrome will not fire the onload event if we set src.
            // Instead check the flag we set in alt when loaded.
            else if (tile.alt) {
              tile.style.visibility = 'visible';
            }
          } else {
            tile.alt = ''; // Mark that the correct image for this
                     // tile has not yet loaded.
            if (this._buffering) tile.onload = bufferLoadDeferred();
            tile.src = source;
          }
        } else {
          tile.alt = 'h';
          tile.style.visibility = 'hidden';
        }

        l = nextL;
      }

      l = left;
      t = nextT;
    }

    if (typeof completionCallback !== 'undefined') {
      if (this._buffering && blocking) {
        this._completionCallback = completionCallback;
      } else {
        this._completionCallback = null;
        completionCallback();
      }
    }
  };

  /**
   * Helper function to swap source images from tilesBuffer into tiles.
   */
  TileLayer.prototype._swapBuffers = function () {
    if (!this._buffering) return;
    this._buffering = false; // If timeout, prevent load callbacks from calling
    var rows = this._tiles.length, cols = this._tiles[0].length;
    for (var i = 0; i < rows; ++i) {
      for (var j = 0; j < cols; ++j) {
        var tile = this._tiles[i][j];
        var buf = this._tilesBuffer[i][j];

        tile.alt = buf.alt;
        tile.style.visibility = (buf.alt === 'h') ? 'hidden' : 'visible';
        tile.style.width = buf.style.width;
        tile.style.height = buf.style.height;
        tile.style.top = buf.style.top;
        tile.style.left = buf.style.left;
        tile.src = buf.src;
      }
    }

    // If the redraw was blocking, its completion callback needs to be invoked
    // now that the async redraw is finished.
    if (this._completionCallback) {
      var completionCallback = this._completionCallback;
      this._completionCallback = null;
      completionCallback();
    }
  };

  /**
   * Resize (if necessary) the tile grid to cover a view of a specified size.
   * @param  {number} width  Width of the view in pixels.
   * @param  {number} height Height of the view in pixels.
   */
  TileLayer.prototype.resize = function (width, height) {
    var rows = Math.ceil(height / this.tileSource.tileHeight) + 1;
    var cols = Math.ceil(width / this.tileSource.tileWidth) + 1;
    if (this._tiles.length === 0 || this._tiles.length !== rows || this._tiles[0].length !== cols)
      this._initTiles(rows, cols);
    this.redraw();
  };

  /**
   * Loads tiles at specified indices, but does not display them, so that
   * they are cached for future viewing.
   * @param  {number[][]}               tileIndices      an array of tile
   *                                                     indices like:
   *                                                     [c, r, z, s]
   * @param  {function(number, number)} progressCallback
   */
  TileLayer.prototype.cacheTiles = function (tileIndices, progressCallback, cachedCounter, loaders) {
    if (typeof cachedCounter === 'undefined') cachedCounter = 0;

    // Truncate request to no more than 3000 tiles.
    if (tileIndices.length > 3000) tileIndices.splice(3000);

    CATMAID.tools.callIfFn(progressCallback, tileIndices.length, cachedCounter);
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

    var self = this;
    tileIndices.splice(0, numLoaders).forEach(function (tileInd, i) {
      var img = loaders[i];
      img.onload = img.onerror = function () {
        loaded += 1;
        if (loaded >= numLoaders)
          self.cacheTiles(tileIndices, progressCallback, cachedCounter + numLoaders, loaders);
      };
      img.src = self.tileSource.getTileURL(
          project, self.stack, [tileInd[2]],
          tileInd[0], tileInd[1], tileInd[3]);
    });
  };

  /**
   * Loads tiles for views centered at specified project locations, but does
   * not display them, so that they are cached for future viewing.
   * @param  {number[][]}               locations        an array of project
   *                                                     coords like:
   *                                                     [x, y, z]
   * @param  {function(number, number)} progressCallback
   */
  TileLayer.prototype.cacheLocations = function (locations, progressCallback) {
    var s = this.stack.projectToStackSX(this.stackViewer.primaryStack.stackToProjectSX(this.stackViewer.s));
    var self = this;

    var tileIndices = locations.reduce(function (tileInds, loc) {
      var px = self.stack.projectToStackX(loc[2], loc[1], loc[0]);
      var py = self.stack.projectToStackY(loc[2], loc[1], loc[0]);
      var pz = self.stack.projectToStackZ(loc[2], loc[1], loc[0]);

      var tileInfo = self.tilesForLocation(
          // Convert project coords to scaled stack coords of a view corner.
          px / Math.pow(2, s) - self.stackViewer.viewWidth / 2,
          py / Math.pow(2, s) - self.stackViewer.viewHeight / 2,
          pz,
          s,
          self.efficiencyThreshold);
      for (var i = tileInfo.firstCol; i <= tileInfo.lastCol; ++i)
        for (var j = tileInfo.firstRow; j <= tileInfo.lastRow; ++j)
          tileInds.push([i, j, tileInfo.z, tileInfo.zoom]);

      return tileInds;
    }, []);

    this.cacheTiles(tileIndices, progressCallback);
  };

  /**
   * Generate bounds on the tile indices for a specified view using the current
   * stack view size.
   * @param  {number} xc Left view origin in scaled stack coordinates.
   * @param  {number} yc Top view origin in scaled stack coordinates.
   * @param  {number} z  Stack section number.
   * @param  {number} s  Stack scale.
   * @param  {number} efficiencyThreshold Omit tiles with less area than this
   *                                      threshold visible.
   * @return {Object}    Object containing information sufficient to generate
   *                     tile indicies for all tiles in the requested view.
   */
  TileLayer.prototype.tilesForLocation = function (xc, yc, z, s, efficiencyThreshold) {
    if (typeof efficiencyThreshold === 'undefined') efficiencyThreshold = 0.0;
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
      zoom = Math.min(this.stack.MAX_S, Math.max(0, Math.ceil(zoom)));
      /* Magnification is positive for digital zoom beyond image
       * resolution and negative for non-integral zooms within
       * image resolution.
       */
      mag = Math.pow(2, zoom - s);
    }

    var effectiveTileWidth = this.tileSource.tileWidth * mag;
    var effectiveTileHeight = this.tileSource.tileHeight * mag;

    var fr = Math.floor(yc / effectiveTileHeight);
    var fc = Math.floor(xc / effectiveTileWidth);

    // Location of the first tile relative to the viewport.
    var top, left;

    if (yc >= 0)
      top  = -(yc % effectiveTileHeight);
    else
      top  = -((yc + 1) % effectiveTileHeight) - effectiveTileHeight + 1;
    if (xc >= 0)
      left = -(xc % effectiveTileWidth);
    else
      left = -((xc + 1) % effectiveTileWidth) - effectiveTileWidth + 1;

    // Efficient mode: omit tiles at the periphery that are only partially
    // visible.
    if (efficiencyThreshold > 0.0) {
      // If the efficiency margins would cause no tile be drawn, limit it to a
      // value that guarantees at least one tile will be drawn.
      efficiencyThreshold = Math.min(
          efficiencyThreshold,
          Math.min(
              this.stackViewer.viewHeight / effectiveTileHeight,
              this.stackViewer.viewWidth / effectiveTileWidth) / 2);
      efficiencyThreshold = Math.max(0.0, efficiencyThreshold);

      if ((top + effectiveTileHeight) < (effectiveTileHeight * efficiencyThreshold)) {
        top += effectiveTileHeight;
        fr += 1;
      }

      if ((left + effectiveTileWidth) < (effectiveTileWidth * efficiencyThreshold)) {
        left += effectiveTileWidth;
        fc += 1;
      }
    }

    var lr, lc;

    // Adjust last tile index to display to the one intersecting the bottom right
    // of the field of view. The purpose: to hide images beyond the stack edges.
    // Notice that we add the panning xd, yd as well (which is already in tile units).
    lc = Math.floor((xc + this.stackViewer.viewWidth - efficiencyThreshold * effectiveTileWidth) / effectiveTileWidth);
    lr = Math.floor((yc + this.stackViewer.viewHeight - efficiencyThreshold * effectiveTileHeight) / effectiveTileHeight);

    // Clamp last tile coordinates within the slice edges.
    lc = Math.min(lc, Math.floor((this.stack.dimension.x * Math.pow(2, -zoom) - 1) / this.tileSource.tileWidth));
    lr = Math.min(lr, Math.floor((this.stack.dimension.y * Math.pow(2, -zoom) - 1) / this.tileSource.tileHeight));

    return {
      firstRow:  fr,
      firstCol:  fc,
      lastRow:   lr,
      lastCol:   lc,
      top:       top,
      left:      left,
      z:         z,
      zoom:      zoom,
      mag:       mag
    };
  };

  /**
   * Show a dialog that give a user the option to configure a custom mirror.
   */
  TileLayer.prototype.addCustomMirror = function () {
    // Get some default values from the current tile source
    var mirror = this.stack.mirrors[this.mirrorIndex];
    var dialog = new CATMAID.OptionsDialog('Add custom mirror');
    dialog.appendMessage("Please specify at least a URL for the custom mirror");
    var url = dialog.appendField("URL", "customMirrorURL", "", false);
    var title = dialog.appendField("Title", "customMirrorTitle", "Custom mirror", false);
    var ext = dialog.appendField("File extension", "customMirrorExt",
        mirror.file_extension, false);
    var tileWidth = dialog.appendField("Tile width", "customMirrorTileWidth",
        mirror.tile_width, false);
    var tileHeight = dialog.appendField("Tile height", "customMirrorTileHeight",
        mirror.tile_height, false);
    var tileSrcType = dialog.appendField("Tile source type",
        "customMirrorTileSrcType", mirror.tile_source_type, false);
    var changeMirrorIfNoDataCb = dialog.appendCheckbox("Change mirror on inaccessible data",
        "change-mirror-if-no-data", false, "If this is selected, a different mirror is " +
        "selected automatically, if the custom mirror is unreachable");

    var messageContainer = dialog.appendHTML("Depending of the configuration " +
      "this mirror, you maybe have to add a SSL certificate exception. To do this, " +
      "click <a href=\"#\">here</a> after the information above is complete. " +
      "A new page will open, displaying either an image or a SSL warning. In " +
      "case of the warning, add a security exception for this (and only this) " +
      "certificate. Only after having this done and the link shows an image, " +
      "click OK below.");

    var getMirrorData = function() {
      var imageBase = url.value;
      if (!imageBase.endsWith('/')) {
        imageBase = imageBase + '/';
      }
      return {
        id: "custom",
        title: title.value,
        position: -1,
        image_base: imageBase,
        file_extension: ext.value,
        tile_width: parseInt(tileWidth.value, 10),
        tile_height: parseInt(tileHeight.value, 10),
        tile_source_type: parseInt(tileSrcType.value, 10)
      };
    };

    var openCanaryLink = messageContainer.querySelector('a');
    var stack = this.stack;
    openCanaryLink.onclick = function() {
      var customMirrorData = getMirrorData();
      var tileSource = CATMAID.getTileSource(
          customMirrorData.tile_source_type,
          customMirrorData.image_base,
          customMirrorData.file_extension,
          customMirrorData.tile_width,
          customMirrorData.tile_height);
      var url = CATMAID.getTileSourceCanaryUrl(project, stack, tileSource);
      // Open a new browser window with a canary tile
      var win = window.open(url);
    };

    var self = this;
    dialog.onOK = function() {
      self.changeMirrorIfNoData = changeMirrorIfNoDataCb.checked;
      var customMirrorData = getMirrorData();
      var newMirrorIndex = self.stack.addMirror(customMirrorData);
      self.switchToMirror(newMirrorIndex);
      localStorage.setItem(self.customMirrorStorageName,
          JSON.stringify(customMirrorData));

      // Update layer control UI to reflect settings changes.
      if (self.stackViewer && self.stackViewer.layerControl) {
        self.layerControl.refresh();
      }
    };

    dialog.show(500, 'auto');
  };

  TileLayer.prototype.clearCustomMirrors = function () {
    var customMirrorIndices = this.stack.mirrors.reduce(function(o, m, i, mirrors) {
      if (mirrors[i].id === 'custom') {
        o.push(i);
      }
      return o;
    }, []);
    var customMirrorUsed = customMirrorIndices.indexOf(this.mirrorIndex) != -1;
    if (customMirrorUsed) {
      CATMAID.warn("Please select another mirror first");
      return;
    }
    customMirrorIndices.sort().reverse().forEach(function(ci) {
      this.stack.removeMirror(ci);
    }, this);
    localStorage.removeItem(this.customMirrorStorageName);
    this.switchToMirror(this.mirrorIndex, true);

    CATMAID.msg("Done", "Custom mirrors cleared");
  };

  /**
   * Returns a set of set settings for this layer. This will only contain
   * anything if the tile layer's tile source provides additional settings.
   */
  TileLayer.prototype.getLayerSettings = function () {
    var settings = [{
        name: 'hideIfBroken',
        displayName: 'Hide if nearest slice is broken',
        type: 'checkbox',
        value: this.hideIfNearestSliceBroken,
        help: 'Hide this tile layer if the nearest section is marked as ' +
              'broken, rather than the default behavior of displaying the ' +
              'nearest non-broken section.'
    },{
        name: 'changeMirrorIfNoData',
        displayName: 'Change mirror on inaccessible data',
        type: 'checkbox',
        value: this.changeMirrorIfNoData,
        help: 'Automatically switch to the next accessible mirror if ' +
              'the current mirror is inaccessible. This is usually recomended ' +
              'except for some use cases involving custom mirrors.'
    },{
        name: 'efficiencyThreshold',
        displayName: 'Tile area efficiency threshold',
        type: 'number',
        range: [0, 1],
        step: 0.1,
        value: this.efficiencyThreshold,
        help: 'Omit tiles with less area visible than this threshold. This ' +
              'is useful to reduce data use on bandwidth-limited connections.'
    },{
      name: 'mirrorSelection',
      displayName: 'Stack mirror',
      type: 'select',
      value: this.mirrorIndex,
      options: this.stack.mirrors.map(function (mirror, idx) {
        return [idx, mirror.title];
      }),
      help: 'Select from which image host to request image data for this stack.'
    }, {
      name: 'customMirrors',
      displayName: 'Custom mirrors',
      type: 'buttons',
      buttons: [
        {
          name: 'Add',
          onclick: this.addCustomMirror.bind(this)
        },
        {
          name: 'Clear',
          onclick: this.clearCustomMirrors.bind(this)
        }]
    }];

    if (this.tileSource && CATMAID.tools.isFn(this.tileSource.getSettings)) {
      settings = settings.concat(this.tileSource.getSettings());
    }

    return settings;
  };

  /**
   * Set a layer setting for this layer. The value will only have any effect if
   * the layer's tile source accepts setting changes.
   */
  TileLayer.prototype.setLayerSetting = function(name, value) {
    if ('hideIfBroken' === name) {
      this.hideIfNearestSliceBroken = value;
      if (!this.hideIfNearestSliceBroken) this.setOpacity(this.opacity);
    } else if ('efficiencyThreshold' === name) {
      this.efficiencyThreshold = value;
      this.redraw();
    } else if ('mirrorSelection' === name) {
      this.switchToMirror(value);
    } else if ('changeMirrorIfNoData' === name) {
      this.changeMirrorIfNoData = value;
      // If this was set to true, perform a canary test
      if (this.changeMirrorIfNoData) {
        CATMAID.checkTileSourceCanary(project, this.stack, this.tileSource)
            .then(this._handleCanaryCheck.bind(this));
      }
    } else if (this.tileSource && CATMAID.tools.isFn(this.tileSource.setSetting)) {
      return this.tileSource.setSetting(name, value);
    }
  };

  /**
   * Get the stack.
   */
  TileLayer.prototype.getStack = function () { return this.stack; };

  /**
   * Get the stack viewer.
   */
  TileLayer.prototype.getStackViewer = function () { return this.stackViewer; };

  /**
   * Get the DOM element view for this layer.
   * @return {Element} View for this layer.
   */
  TileLayer.prototype.getView = function () { return this.tilesContainer; };

  /**
   * Create a new tile layer with the same parameters as this tile layer.
   *
   * @param  {Object}    override    Constructor arguments to override.
   * @param  {function=} constructor Optional PixiLayer subclass constructor.
   * @return {PixiLayer}             Newly constructed PixiLayer subclass.
   */
  TileLayer.prototype.constructCopy = function (override, constructor) {
    if (typeof constructor === 'undefined') constructor = this.constructor;
    var args = {
      stackViewer: this.stackViewer,
      displayName: this.displayName,
      stack: this.stack,
      mirrorIndex: this.mirrorIndex,
      visibility: this.visibility,
      opacity: this.opacity,
      showOverview: !!this.overviewLayer,
      linearInterpolation: this._interpolationMode,
      readState: this._readState,
      changeMirrorIfNoData: this.changeMirrorIfNoData
    };
    $.extend(args, override);
    return new constructor(
        args.stackViewer,
        args.displayName,
        args.stack,
        args.mirrorIndex,
        args.visibility,
        args.opacity,
        args.showOverview,
        args.linearInterpolation,
        args.readState,
        args.changeMirrorIfNoData);
  };

  /**
   * Switch to a mirror by replacing this tile layer in the stack viewer
   * with a new one for the specified mirror index.
   *
   * @param  {number}  mirrorIdx Index of a mirror in the stack's mirror array.
   * @param  {boolean} force     If true, the layer will also be refreshed if
   *                             the mirror didn't change.
   */
  TileLayer.prototype.switchToMirror = function (mirrorIndex, force) {
    if (mirrorIndex === this.mirrorIndex && !force) return;
    var newTileLayer = this.constructCopy({mirrorIndex: mirrorIndex});
    var layerKey = this.stackViewer.getLayerKey(this);
    this.stackViewer.replaceStackLayer(layerKey, newTileLayer);

    // Store last used mirror information in cookie
    localStorage.setItem(this.lastMirrorStorageName, mirrorIndex);
  };

  /**
   * Set opacity in the range from 0 to 1.
   * @param {number} val New opacity.
   */
  TileLayer.prototype.setOpacity = function (val) {
    this.tilesContainer.style.opacity = val + '';
    this.opacity = val;
    if (val < 0.02) {
      if (this.visible)
        $(this.tilesContainer).css('visibility', 'hidden');
      this.visible = false;
    } else {
      if (!this.visible)
        $(this.tilesContainer).css('visibility', 'visible');
      this.visible = true;
    }
  };

  /**
   * Get the layer opacity.
   */
  TileLayer.prototype.getOpacity = function () {
    return this.opacity;
  };

  TileLayer.Settings = new CATMAID.Settings(
      'tile-layer',
      {
        version: 0,
        entries: {
          prefer_webgl: {
            default: false
          },
          linear_interpolation: {
            default: true
          },
          hide_if_nearest_section_broken: {
            default: false
          }
        },
        migrations: {}
      });

  CATMAID.TileLayer = TileLayer;

})(CATMAID);
