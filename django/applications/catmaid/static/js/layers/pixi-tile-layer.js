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

    // Replace tiles container.
    this.stackViewer.getLayersView().removeChild(this.tilesContainer);
    this.tilesContainer = this.renderer.view;
    this.tilesContainer.className = 'sliceTiles';
    this.stackViewer.getLayersView().appendChild(this.tilesContainer);

    this._oldZoom = 0;
    this._oldZ = undefined;

    this._tileRequest = {};
  }

  PixiTileLayer.prototype = Object.create(CATMAID.TileLayer.prototype);
  $.extend(PixiTileLayer.prototype, CATMAID.PixiLayer.prototype); // Mixin/multiple inherit PixiLayer.
  PixiTileLayer.prototype.constructor = PixiTileLayer;

  /** @inheritdoc */
  PixiTileLayer.prototype.unregister = function () {
    for (var i = 0; i < this._tiles.length; ++i) {
      for (var j = 0; j < this._tiles[0].length; ++j) {
        var tile = this._tiles[i][j];
        if (tile.texture && tile.texture.valid) {
          CATMAID.PixiContext.GlobalTextureManager.dec(tile.texture.baseTexture.source.src);
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
    graphic.drawRect(0,0,this.tileSource.tileWidth,this.tileSource.tileHeight);
    graphic.endFill();
    var emptyTex = graphic.generateTexture(false);

    this._tiles = [];
    this._tileFirstR = 0;
    this._tileFirstC = 0;

    for (var i = 0; i < rows; ++i) {
      this._tiles[i] = [];
      this._tilesBuffer[i] = [];
      for (var j = 0; j < cols; ++j) {
        this._tiles[i][j] = new PIXI.Sprite(emptyTex);
        this.batchContainer.addChild(this._tiles[i][j]);
        this._tiles[i][j].position.x = j * this.tileSource.tileWidth;
        this._tiles[i][j].position.y = i * this.tileSource.tileHeight;

        this._tilesBuffer[i][j] = false;
      }
    }

    this.setBlendMode(this.blendMode);
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.redraw = function (completionCallback) {
    var scaledStackPosition = this.stackViewer.scaledPositionInStack(this.stack);
    var tileInfo = this.tilesForLocation(
        scaledStackPosition.xc,
        scaledStackPosition.yc,
        scaledStackPosition.z,
        scaledStackPosition.s);

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

      // Update the toroidal origin in the tiles array
      this._tileOrigR = this.rowTransform(yd);
      this._tileOrigC = this.colTransform(xd);
    }

    this._tileFirstC = tileInfo.firstCol;
    this._tileFirstR = tileInfo.firstRow;

    var top;
    var left;

    if (scaledStackPosition.yc >= 0)
      top  = -(scaledStackPosition.yc % effectiveTileHeight);
    else
      top  = -((scaledStackPosition.yc + 1) % effectiveTileHeight) - effectiveTileHeight + 1;
    if (scaledStackPosition.xc >= 0)
      left = -(scaledStackPosition.xc % effectiveTileWidth);
    else
      left = -((scaledStackPosition.xc + 1) % effectiveTileWidth) - effectiveTileWidth + 1;

    // Set tile grid offset and magnification on the whole container, rather than
    // individual tiles.
    this.batchContainer.position.x = left;
    this.batchContainer.position.y = top;
    this.batchContainer.scale.x = tileInfo.mag;
    this.batchContainer.scale.y = tileInfo.mag;
    var toLoad = [];
    var loading = false;
    var y = 0;
    var slicePixelPosition = [tileInfo.z];

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

        if (c >= 0 && c <= tileInfo.lastCol &&
            r >= 0 && r <= tileInfo.lastRow) {
          var source = this.tileSource.getTileURL(project, this.stack, slicePixelPosition,
              c, r, tileInfo.zoom);

          if (source !== tile.texture.baseTexture.source.src) {
            var texture = PIXI.utils.TextureCache[source];
            if (texture) {
              if (texture.valid) {
                this._tilesBuffer[i][j] = false;
                CATMAID.PixiContext.GlobalTextureManager.inc(source);
                CATMAID.PixiContext.GlobalTextureManager.dec(tile.texture.baseTexture.source.src);
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
        x += this.tileSource.tileWidth;
      }
      y += this.tileSource.tileHeight;
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
      var newRequest = CATMAID.PixiContext.GlobalTextureManager.load(toLoad, this._swapBuffers.bind(this, false, this._swapBuffersTimeout));
      CATMAID.PixiContext.GlobalTextureManager.cancel(this._tileRequest);
      this._tileRequest = newRequest;
    } else if (!loading) {
      this._oldZoom = this._swapZoom;
      this._oldZ    = this._swapZ;
      this._renderIfReady();
    }

    if (typeof completionCallback !== 'undefined') {
      completionCallback();
    }
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.resize = function (width, height) {
    if (width !== this.renderer.width || height !== this.renderer.height)
      this.renderer.resize(width, height);
    CATMAID.TileLayer.prototype.resize.call(this, width, height);
  };

  /** @inheritdoc */
  PixiTileLayer.prototype._swapBuffers = function (force, timeout) {
    if (timeout && timeout !== this._swapBuffersTimeout) return;
    window.clearTimeout(this._swapBuffersTimeout);

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
            CATMAID.PixiContext.GlobalTextureManager.dec(tile.texture.baseTexture.source.src);
            tile.texture = texture || PIXI.Texture.fromImage(source);
            tile.visible = true;
          }
        }
      }
    }
    this._oldZoom = this._swapZoom;
    this._oldZ    = this._swapZ;

    this._renderIfReady();
  };

  CATMAID.PixiTileLayer = PixiTileLayer;

})(CATMAID);
