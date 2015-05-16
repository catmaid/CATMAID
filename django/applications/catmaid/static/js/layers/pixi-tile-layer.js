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
    this.stack.getLayersView().removeChild(this.tilesContainer);
    this.tilesContainer = this.renderer.view;
    this.tilesContainer.className = 'sliceTiles';
    this.stack.getLayersView().appendChild(this.tilesContainer);
  }

  PixiTileLayer.prototype = Object.create(CATMAID.TileLayer.prototype);
  $.extend(PixiTileLayer.prototype, CATMAID.PixiLayer.prototype); // Mixin/multiple inherit PixiLayer.
  PixiTileLayer.prototype.constructor = PixiTileLayer;

  /**
   * Initialise the tiles array and buffer.
   */
  PixiTileLayer.prototype._initTiles = function (rows, cols) {
    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);

    var graphic = new PIXI.Graphics();
    graphic.beginFill(0xFFFFFF,0);
    graphic.drawRect(0,0,this.tileWidth,this.tileHeight);
    graphic.endFill();
    var emptyTex = graphic.generateTexture(false);

    this._tiles = [];

    for (var i = 0; i < rows; ++i) {
      this._tiles[i] = [];
      this._tilesBuffer[i] = [];
      for (var j = 0; j < cols; ++j) {
        this._tiles[i][j] = new PIXI.Sprite(emptyTex);
        this.batchContainer.addChild(this._tiles[i][j]);
        this._tiles[i][j].position.x = j * this.tileWidth;
        this._tiles[i][j].position.y = i * this.tileHeight;

        this._tilesBuffer[i][j] = false;
      }
    }

    this.setBlendMode(this.blendMode);
  };

  /** @inheritdoc */
  PixiTileLayer.prototype.redraw = function (completionCallback) {
    var pixelPos = [this.stack.x, this.stack.y, this.stack.z];
    var tileBaseName = CATMAID.getTileBaseName(pixelPos);

    var tileInfo = this.tilesForLocation(this.stack.xc, this.stack.yc, this.stack.z, this.stack.s);

    var effectiveTileWidth = this.tileWidth * tileInfo.mag;
    var effectiveTileHeight = this.tileHeight * tileInfo.mag;

    var rows = this._tiles.length, cols = this._tiles[0].length;

    // If panning only (no scaling, no browsing through z)
    if (this.stack.z == this.stack.old_z && this.stack.s == this.stack.old_s)
    {
      var old_fr = Math.floor(this.stack.old_yc / effectiveTileHeight);
      var old_fc = Math.floor(this.stack.old_xc / effectiveTileWidth);

      // Compute panning in X and Y
      var xd = tileInfo.first_col - old_fc;
      var yd = tileInfo.first_row - old_fr;

      // Update the toroidal origin in the tiles array
      this._tileOrigR = this.rowTransform(yd);
      this._tileOrigC = this.colTransform(xd);
    }

    var top;
    var left;

    if (this.stack.yc >= 0)
      top  = -(this.stack.yc % effectiveTileHeight);
    else
      top  = -((this.stack.yc + 1) % effectiveTileHeight) - effectiveTileHeight + 1;
    if (this.stack.xc >= 0)
      left = -(this.stack.xc % effectiveTileWidth);
    else
      left = -((this.stack.xc + 1) % effectiveTileWidth) - effectiveTileWidth + 1;

    // Set tile grid offset and magnification on the whole container, rather than
    // individual tiles.
    this.batchContainer.position.x = left;
    this.batchContainer.position.y = top;
    this.batchContainer.scale.x = tileInfo.mag;
    this.batchContainer.scale.y = tileInfo.mag;
    var toLoad = [];
    var y = 0;

    // Update tiles.
    for (var i = this._tileOrigR, ti = 0; ti < rows; ++ti, i = (i+1) % rows) {
      var r = tileInfo.first_row + ti;
      var x = 0;

      for (var j = this._tileOrigC, tj = 0; tj < cols; ++tj, j = (j+1) % cols) {
        var c = tileInfo.first_col + tj;
        var tile = this._tiles[i][j];
        // Set tile positions to handle toroidal wrapping.
        tile.position.x = x;
        tile.position.y = y;

        if (c >= 0 && c <= tileInfo.last_col &&
            r >= 0 && r <= tileInfo.last_row) {
          var source = this.tileSource.getTileURL(project, this.stack,
              tileBaseName, this.tileWidth, this.tileHeight,
              c, r, tileInfo.zoom);

          if (source !== tile.texture.baseTexture.imageUrl) {
            tile.visible = false;
            if (source !== this._tilesBuffer[i][j]) {
              toLoad.push(source);
              this._tilesBuffer[i][j] = source;
            }
          } else tile.visible = true;
        } else {
          tile.visible = false;
          this._tilesBuffer[i][j] = false;
        }
        x += this.tileWidth;
      }
      y += this.tileHeight;
    }

    if (this.stack.z === this.stack.old_z &&
        tileInfo.zoom === Math.max(0, Math.ceil(this.stack.old_s)))
      this.renderer.render(this.stage);

    // If any tiles need to be buffered (that are not already being buffered):
    if (toLoad.length > 0) {
      var loader = new PIXI.AssetLoader(toLoad);
      loader.once('onComplete', this._swapBuffers.bind(this, false));
      // Set a timeout for slow connections to swap in the buffer whether or
      // not it has loaded. Do this before loading tiles in case they load
      // immediately, so that the buffer will be cleared.
      window.clearTimeout(this._swapBuffersTimeout);
      this._swapBuffersTimeout = window.setTimeout(this._swapBuffers.bind(this, true), 3000);
      loader.load();
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
  PixiTileLayer.prototype._swapBuffers = function (force) {
    window.clearTimeout(this._swapBuffersTimeout);

    for (var i = 0; i < this._tiles.length; ++i) {
      for (var j = 0; j < this._tiles[0].length; ++j) {
        var source = this._tilesBuffer[i][j];
        if (source) {
          var texture = PIXI.TextureCache[source];
          // Check whether the tile is loaded.
          if (force || texture && texture.valid) {
            this._tilesBuffer[i][j] = false;
            this._tiles[i][j].setTexture(texture ? texture : PIXI.Texture.fromImage(source));
            this._tiles[i][j].visible = true;
          }
        }
      }
    }

    this.renderer.render(this.stage);
  };

  CATMAID.PixiTileLayer = PixiTileLayer;

})(CATMAID);
