/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */

(function(CATMAID) {

  "use strict";

  /**
   * Displays a grid of tiles from an image stack using the Pixi.js renderer.
   *
   * See CATMAID.TileLayer for parameters.
   *
   * @class PixiTileLayer
   * @extends TileLayer
   * @uses PixiLayer
   * @constructor
   */
  function PixiTileLayer() {
    CATMAID.TileLayer.apply(this, arguments);
    CATMAID.PixiLayer.call(this);

    // If the selected source is block data, return an appropriate layer instead.
    if (this.tileSource instanceof CATMAID.AbstractImageBlockSource &&
       !(this instanceof CATMAID.PixiImageBlockLayer)) {
      this.unregister();
      return this.constructCopy({}, CATMAID.PixiImageBlockLayer);
    }

    // Replace tiles container.
    this.stackViewer.getLayersView().removeChild(this.tilesContainer);
    this.tilesContainer = this.renderer.view;
    this.tilesContainer.className = 'sliceTiles';
    this.stackViewer.getLayersView().appendChild(this.tilesContainer);

    this._oldZoom = 0;
    this._oldZ = undefined;

    this._tileRequest = {};
    this._updatePixiInterpolationMode();
  }

  PixiTileLayer.prototype = Object.create(CATMAID.TileLayer.prototype);
  $.extend(PixiTileLayer.prototype, CATMAID.PixiLayer.prototype); // Mixin/multiple inherit PixiLayer.
  PixiTileLayer.prototype.constructor = PixiTileLayer;

  /** @inheritdoc */
  PixiTileLayer.prototype._handleCanaryCheck = function (accessible) {
    if (accessible.cors) {
      return;
    } else if (accessible.normal) {
      CATMAID.warn('Stack mirror is not CORS accessible, so WebGL will not be used.');
      this.switchToDomTileLayer();
    } else {
      CATMAID.TileLayer.prototype._handleCanaryCheck.call(this, accessible);
    }
  };

  PixiTileLayer.prototype._updatePixiInterpolationMode = function () {
    let linear = this.getEffectiveInterpolationMode() === CATMAID.StackLayer.INTERPOLATION_MODES.LINEAR;
    this._pixiInterpolationMode = linear ? PIXI.SCALE_MODES.LINEAR : PIXI.SCALE_MODES.NEAREST;
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.setInterpolationMode = function (mode) {
    CATMAID.StackLayer.prototype.setInterpolationMode.call(this, mode);
    this._updatePixiInterpolationMode();

    for (var i = 0; i < this._tiles.length; ++i) {
      for (var j = 0; j < this._tiles[0].length; ++j) {
        var texture = this._tiles[i][j].texture;
        if (texture && texture.valid &&
            texture.baseTexture.scaleMode !== this._pixiInterpolationMode) {
          this._setTextureInterpolationMode(texture, this._pixiInterpolationMode);
        }
      }
    }
    this.redraw();
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.unregister = function () {
    for (var i = 0; i < this._tiles.length; ++i) {
      for (var j = 0; j < this._tiles[0].length; ++j) {
        var tile = this._tiles[i][j];
        if (tile.texture && tile.texture.valid) {
          CATMAID.PixiContext.GlobalTextureManager.dec(tile.texture.baseTexture.imageUrl);
        }
      }
    }

    CATMAID.PixiLayer.prototype.unregister.call(this);
  };

  /**
   * Initialise the tiles array and buffer.
   */
  PixiTileLayer.prototype._initTiles = function (rows, cols) {
    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);

    var graphic = new PIXI.Graphics();
    graphic.beginFill(0xFFFFFF,0);
    graphic.drawRect(0, 0, this.tileWidth, this.tileHeight);
    graphic.endFill();
    var emptyTex = graphic.generateCanvasTexture();

    this._tiles = [];
    this._tileFirstR = 0;
    this._tileFirstC = 0;

    for (var i = 0; i < rows; ++i) {
      this._tiles[i] = [];
      this._tilesBuffer[i] = [];
      for (var j = 0; j < cols; ++j) {
        this._tiles[i][j] = new PIXI.Sprite(emptyTex);
        this.batchContainer.addChild(this._tiles[i][j]);
        this._tiles[i][j].position.x = j * this.tileWidth * this._anisotropy.x;
        this._tiles[i][j].position.y = i * this.tileHeight * this._anisotropy.y;

        if (this.tileSource.transposeTiles.has(this.stack.orientation)) {
          this._tiles[i][j].scale.x = -1.0;
          this._tiles[i][j].rotation = -Math.PI / 2.0;
        }

        this._tilesBuffer[i][j] = false;
      }
    }

    this.setBlendMode(this.blendMode);
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.redraw = function (completionCallback, blocking) {
    var scaledStackPosition = this.stackViewer.scaledPositionInStack(this.stack);
    var tileInfo = this.tilesForLocation(
        scaledStackPosition.xc,
        scaledStackPosition.yc,
        scaledStackPosition.z,
        scaledStackPosition.s,
        this.efficiencyThreshold);

    if (this._anisotropy.x !== tileInfo.anisotropy.x ||
        this._anisotropy.y !== tileInfo.anisotropy.y) {
      return this.resize(this.stackViewer.viewWidth, this.stackViewer.viewHeight, completionCallback, blocking);
    }

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
        this.batchContainer.visible = false;
        showTiles = false;
      } else {
        this.setOpacity(this.opacity);
      }
    }

    var rows = this._tiles.length, cols = this._tiles[0].length;

    // If panning only (no scaling, no browsing through z)
    if (this.stackViewer.z == this.stackViewer.old_z &&
        this.stackViewer.s == this.stackViewer.old_s)
    {
      // Compute panning in X and Y
      var xd = tileInfo.firstCol - this._tileFirstC;
      var yd = tileInfo.firstRow - this._tileFirstR;

      // Update the toroidal origin in the tiles array
      this._tileOrigR = this.rowTransform(yd);
      this._tileOrigC = this.colTransform(xd);
    }

    this._tileFirstC = tileInfo.firstCol;
    this._tileFirstR = tileInfo.firstRow;

    var top = tileInfo.top;
    var left = tileInfo.left;

    // Set tile grid offset and magnification on the whole container, rather than
    // individual tiles.
    this.batchContainer.position.x = left;
    this.batchContainer.position.y = top;
    this.batchContainer.scale.x = tileInfo.mag * tileInfo.anisotropy.x;
    this.batchContainer.scale.y = tileInfo.mag * tileInfo.anisotropy.y;
    var toLoad = [];
    var loading = false;
    var y = 0;
    var slicePixelPosition = [tileInfo.z];

    // Clamping to zero can be disable in the stack.
    let clamp = this.stack.clamp;
    let [minCol, minRow] = clamp ? [0, 0] : [tileInfo.firstCol, tileInfo.firstRow];

    // Update tiles.
    for (var i = this._tileOrigR, ti = 0; ti < rows; ++ti, i = (i+1) % rows) {
      var r = tileInfo.firstRow + ti;
      var x = 0;

      for (var j = this._tileOrigC, tj = 0; tj < cols; ++tj, j = (j+1) % cols) {
        var c = tileInfo.firstCol + tj;
        var tile = this._tiles[i][j];
        // Set tile positions to handle toroidal wrapping.
        tile.position.x = x;
        tile.position.y = y;

        if (c >= minCol && c <= tileInfo.lastCol &&
            r >= minRow && r <= tileInfo.lastRow && showTiles) {
          var source = this.tileSource.getTileURL(project, this.stack, slicePixelPosition,
              c, r, tileInfo.zoom);

          if (source !== tile.texture.baseTexture.imageUrl) {
            var texture = PIXI.utils.TextureCache[source];
            if (texture) {
              if (texture.valid) {
                this._tilesBuffer[i][j] = false;
                CATMAID.PixiContext.GlobalTextureManager.inc(source);
                CATMAID.PixiContext.GlobalTextureManager.dec(tile.texture.baseTexture.imageUrl);
                if (texture.baseTexture.scaleMode !== this._pixiInterpolationMode) {
                  this._setTextureInterpolationMode(texture, this._pixiInterpolationMode);
                }
                tile.texture = texture;
                tile.visible = true;
              } else {
                loading = true;
                tile.visible = false;
              }
            } else {
              tile.visible = false;
              toLoad.push(source);
              this._tilesBuffer[i][j] = source;
            }
          } else {
            tile.visible = true;
            this._tilesBuffer[i][j] = false;
          }
        } else {
          tile.visible = false;
          this._tilesBuffer[i][j] = false;
        }
        x += this.tileWidth;
      }
      y += this.tileHeight;
    }

    if (tileInfo.z    === this._oldZ &&
        tileInfo.zoom === this._oldZoom) {
      this._renderIfReady();
    }
    this._swapZoom = tileInfo.zoom;
    this._swapZ = tileInfo.z;

    // If any tiles need to be buffered (that are not already being buffered):
    if (toLoad.length > 0) {
      // Set a timeout for slow connections to swap in the buffer whether or
      // not it has loaded. Do this before loading tiles in case they load
      // immediately, so that the buffer will be cleared.
      window.clearTimeout(this._swapBuffersTimeout);
      this._swapBuffersTimeout = window.setTimeout(this._swapBuffers.bind(this, true), 3000);
      var newRequest = CATMAID.PixiContext.GlobalTextureManager.load(
          toLoad,
          this.tileSource.getRequestHeaders(),
          this._swapBuffers.bind(this, false, this._swapBuffersTimeout));
      CATMAID.PixiContext.GlobalTextureManager.cancel(this._tileRequest);
      this._tileRequest = newRequest;
      loading = true;
    } else if (!loading) {
      this._oldZoom = this._swapZoom;
      this._oldZ    = this._swapZ;
      this._renderIfReady();
    }

    if (typeof completionCallback !== 'undefined') {
      if (loading && blocking) {
        this._completionCallback = completionCallback;
      } else {
        this._completionCallback = null;
        completionCallback();
      }
    }
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.resize = function (width, height, completionCallback, blocking) {
    CATMAID.PixiLayer.prototype.resize.call(this, width, height);
    CATMAID.TileLayer.prototype.resize.call(this, width, height, completionCallback, blocking);
  };

  /** @inheritdoc */
  PixiTileLayer.prototype._swapBuffers = function (force, timeout) {
    if (timeout && timeout !== this._swapBuffersTimeout) return;
    window.clearTimeout(this._swapBuffersTimeout);
    this._swapBuffersTimeout = null;

    for (var i = 0; i < this._tiles.length; ++i) {
      for (var j = 0; j < this._tiles[0].length; ++j) {
        var source = this._tilesBuffer[i][j];
        if (source) {
          var texture = PIXI.utils.TextureCache[source];
          var tile = this._tiles[i][j];
          // Check whether the tile is loaded.
          if (force || texture && texture.valid) {
            this._tilesBuffer[i][j] = false;
            CATMAID.PixiContext.GlobalTextureManager.inc(source);
            CATMAID.PixiContext.GlobalTextureManager.dec(tile.texture.baseTexture.imageUrl);
            tile.texture = texture || PIXI.Texture.fromImage(source);
            if (tile.texture.baseTexture.scaleMode !== this._pixiInterpolationMode) {
              this._setTextureInterpolationMode(tile.texture, this._pixiInterpolationMode);
            }
            tile.visible = true;
          }
        }
      }
    }
    this._oldZoom = this._swapZoom;
    this._oldZ    = this._swapZ;

    this._renderIfReady();

    // If the redraw was blocking, its completion callback needs to be invoked
    // now that the async redraw is finished.
    if (this._completionCallback) {
      var completionCallback = this._completionCallback;
      this._completionCallback = null;
      completionCallback();
    }
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.constructCopy = function (override, constructor) {
    var copy = CATMAID.TileLayer.prototype.constructCopy.apply(this, arguments);

    if (copy instanceof PixiTileLayer) {
      this.filters.forEach(function (filter) {
        var filterCopy = new filter.constructor(
            filter.displayName,
            filter.pixiFilter.constructor,
            filter.params,
            copy);
        copy.filters.push(filterCopy);
      });
    }

    return copy;
  };

  /**
   * Switch to a DOM tile layer by replacing this tile layer in the stack viewer
   * with a new one.
   */
  PixiTileLayer.prototype.switchToDomTileLayer = function () {
    var newTileLayer = this.constructCopy({}, CATMAID.TileLayer);
    var layerKey = this.stackViewer.getLayerKey(this);
    this.stackViewer.replaceStackLayer(layerKey, newTileLayer);
  };

  /** @inheritdoc */
  PixiTileLayer.prototype._tilePixel = function (tile, x, y) {
    var img = tile.texture.baseTexture.source;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);

    return Promise.resolve(context.getImageData(x, y, 1, 1).data);
  };

  CATMAID.PixiTileLayer = PixiTileLayer;

})(CATMAID);
