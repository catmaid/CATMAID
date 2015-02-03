/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */

function PixiTileLayer() {
  TileLayer.apply(this, arguments);
  this.batchContainer = null;
  this.renderer = new PIXI.autoDetectRenderer(
      this.stack.getView().clientWidth,
      this.stack.getView().clientHeight);
  this.stage = new PIXI.Stage(0x000000);

  // Replace tiles container.
  this.stack.getView().removeChild(this.tilesContainer);
  this.tilesContainer = this.renderer.view;
  this.tilesContainer.className = 'sliceTiles';
  this.stack.getView().appendChild(this.tilesContainer);
}

PixiTileLayer.prototype = Object.create(TileLayer.prototype);
PixiTileLayer.prototype.constructor = PixiTileLayer;

/**
 * Initialise the tiles array and buffer.
 */
PixiTileLayer.prototype._initTiles = function (rows, cols) {
  if (!this.batchContainer) {
    this.batchContainer = new PIXI.DisplayObjectContainer();
    this.stage.addChild(this.batchContainer);
  } else this.batchContainer.removeChildren();

  var graphic = new PIXI.Graphics();
  graphic.beginFill(0xFFFFFF,0);
  graphic.drawRect(0,0,this.tileWidth,this.tileHeight);
  graphic.endFill();
  var emptyTex = graphic.generateTexture(false);

  this._tiles = [];

  for (var i = 0; i < rows; ++i) {
    this._tiles[i] = [];
    for (var j = 0; j < cols; ++j) {
      this._tiles[i][j] = new PIXI.Sprite(emptyTex);
      this.batchContainer.addChild(this._tiles[i][j]);
      this._tiles[i][j].position.x = j * this.tileWidth;
      this._tiles[i][j].position.y = i * this.tileHeight;
    }
  }
};

/** @inheritdoc */
PixiTileLayer.prototype.redraw = function (completionCallback) {
  var pixelPos = [this.stack.x, this.stack.y, this.stack.z];
  var tileBaseName = getTileBaseName(pixelPos);

  var tileInfo = this.tilesForLocation(this.stack.xc, this.stack.yc, this.stack.z, this.stack.s);

  var effectiveTileWidth = this.tileWidth * tileInfo.mag;
  var effectiveTileHeight = this.tileHeight * tileInfo.mag;

  var rows = this._tiles.length, cols = this._tiles[0].length;

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

  this.batchContainer.position.x = left;
  this.batchContainer.position.y = top;
  this.batchContainer.scale.x = tileInfo.mag;
  this.batchContainer.scale.y = tileInfo.mag;

  // Update tiles.
  for (var i = this._tileOrigR, ti = 0; ti < rows; ++ti, i = (i+1) % rows) {
    var r = tileInfo.first_row + ti;

    for (var j = this._tileOrigC, tj = 0; tj < cols; ++tj, j = (j+1) % cols) {
      var c = tileInfo.first_col + tj;
      var tile = this._tiles[i][j];

      if (c >= 0 && c <= tileInfo.last_col &&
          r >= 0 && r <= tileInfo.last_row) {
        var source = this.tileSource.getTileURL(project, this.stack,
            tileBaseName, this.tileWidth, this.tileHeight,
            c, r, tileInfo.zoom);

        if (source != tile.texture.baseTexture.imageUrl)
          tile.setTexture(PIXI.Texture.fromImage(source));

        tile.visible = true;
      } else {
        tile.visible = false;
      }
    }
  }

  this.renderer.render(this.stage);

  if (typeof completionCallback !== 'undefined') {
    completionCallback();
  }
};

PixiTileLayer.prototype.resize = function (width, height) {
  if (width === this.renderer.width && height === this.renderer.height) return;
  this.renderer.resize(width, height);
  TileLayer.prototype.resize.call(this, width, height);
};
