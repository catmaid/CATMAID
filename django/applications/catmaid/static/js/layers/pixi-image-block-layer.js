(function(CATMAID) {

  "use strict";

  class PixiImageBlockLayer extends CATMAID.PixiTileLayer {
    constructor(...args) {
      super(...args);

      // This layer needs WebGL2, raise error if unavailable.
      if (this._context.webglVersion < 2) {
        throw new CATMAID.PreConditionError("PixiImageBlockLayer needs WebGL2, but it isn't available.");
      }

      this._blockCache = CATMAID.ImageBlock.GlobalCacheManager.get(this.tileSource);
      this._blockCache.on(
          CATMAID.ImageBlock.Cache.EVENT_BLOCK_CHANGED,
          this._onBlockChanged, this);
      this.fillValue = 0;

      if (this.stack instanceof CATMAID.ReorientedStack) {
        this.dimPerm = this.stack.baseToSelfPerm;
        this.recipDimPerm = this.stack.selfToBasePerm;
      } else {
        this.dimPerm = this.recipDimPerm = [0, 1, 2];
      }

      this.blockSizeZ = 1;

      this.tileSource.promiseReady.then(() => {
        let blockSize = this.tileSource.blockSize(0);
        blockSize = CATMAID.tools.permute(blockSize, this.dimPerm);
        this.tileWidth = blockSize[0];
        this.tileHeight = blockSize[1];
        this.blockSizeZ = blockSize[2];
        if (this._tiles.length) {
          // If tiles have been initialized, reinitialize.
          this.resize(this.stackViewer.viewWidth, this.stackViewer.viewHeight);
        }

        if (this.tileSource.dataType().endsWith('64')) {
          CATMAID.warn('64 bit data is not yet directly renderable, rendering as 16-bpc RGBA');
        }

        let numStackLevels = this.stack.downsample_factors.length;
        let numSourceLevels = this.tileSource.numScaleLevels();
        if (numStackLevels > numSourceLevels) {
          // If the source has more levels than the stack, it's not worth
          // warning the user since it won't break any interactions.
          CATMAID.info(`Stack mirror has ${numSourceLevels} scale levels but stack specifies ${numStackLevels}`);
        }
      });
    }

    _initTiles(rows, cols) {
      let dataType = this.tileSource.dataType();
      this._setPermissibleInterpolationMode(dataType);
      this.tileConstructor = this._dtypeTileConstructor(dataType);
      super._initTiles(rows, cols);

      for (var i = 0; i < rows; ++i) {
        for (var j = 0; j < cols; ++j) {
          this._tiles[i][j].texture = new PIXI.Texture(new PIXI.BaseTexture(new ImageData(1, 1)));
          this._tilesBuffer[i][j] = {
            coord: false,
            loaded: false,
            texture: new PIXI.Texture(new PIXI.BaseTexture(new ImageData(1, 1)))
          };
        }
      }
    }

    _onBlockChanged({zoomLevel, x, y, z}) {
      [x, y, z] = CATMAID.tools.permute([x, y, z], this.dimPerm);
      let coord = [zoomLevel, x, y, z];

      for (var i = 0; i < this._tiles.length; ++i) {
        for (var j = 0; j < this._tiles[0].length; ++j) {
          let tile = this._tiles[i][j];
          if (!tile.coord) continue;
          let tileCoord = tile.coord.slice(0, 4);

          if (CATMAID.tools.arraysEqual(coord, tileCoord)) {
            tile.coord = [-1, -1, -1, -1, -1];
            return this.redraw();
          }
        }
      }
    }

    redraw (completionCallback, blocking) {
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
      var zi = Math.floor(tileInfo.z / this.blockSizeZ);
      var blockZ = tileInfo.z % this.blockSizeZ;

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

          if (c >= tileInfo.firstCol && c <= tileInfo.lastCol && c >= 0 &&
              r >= tileInfo.firstRow && r <= tileInfo.lastRow && r >= 0 && showTiles) {
            var coord = [tileInfo.zoom, c, r, zi, tileInfo.z];

            if (!CATMAID.tools.arraysEqual(coord, tile.coord)) {
              tile.visible = false;
              toLoad.push([[i, j], coord]);
              this._tilesBuffer[i][j].coord = coord;
              this._tilesBuffer[i][j].loaded = false;
            } else {
              tile.visible = true;
              this._tilesBuffer[i][j].coord = null;
            }
          } else {
            tile.visible = false;
            this._tilesBuffer[i][j].coord = null;
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
        Promise.all(toLoad.map(([[i, j], coord]) => this
            ._readBlock(...coord.slice(0, 4))
            .then(block => {
              if (!this._tilesBuffer || !this._tilesBuffer[i] || !this._tilesBuffer[i][j] ||
                  !CATMAID.tools.arraysEqual(this._tilesBuffer[i][j].coord, coord)) return;

              let slice = this._sliceBlock(block, blockZ);

              this._sliceToTexture(slice, this._tilesBuffer[i][j].texture);
              this._tilesBuffer[i][j].coord = coord;
              this._tilesBuffer[i][j].loaded = true;
            })
        )).then(this._swapBuffers.bind(this, false, this._swapBuffersTimeout));
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
    }

    _readBlock(zoomLevel, x, y, z) {
      let blockCoord = CATMAID.tools.permute([x, y, z], this.recipDimPerm);

      return this._blockCache.readBlock(zoomLevel, ...blockCoord)
        .then(block => {
          if (block) block = block.transpose(...this.dimPerm);

          return block;
        });
    }

    _sliceBlock(block, blockZ) {
      var slice;
      if (block && block.shape[2] > blockZ) {
        slice = block.pick(null, null, blockZ);

        if (slice.shape[0] < this.tileWidth ||
            slice.shape[1] < this.tileHeight) {
          let empty = this._makeEmptySlice();

          for(let i=0; i<slice.shape[0]; ++i) {
            for(let j=0; j<slice.shape[1]; ++j) {
              empty.set(i,j, slice.get(i, j));
            }
          }
        }
      } else {
        slice = this._makeEmptySlice();
      }

      return slice;
    }

    _makeEmptySlice() {
      let empty = nj.zeros(
          [this.tileWidth, this.tileHeight],
          this.tileSource.dataType());
      empty.selection.data.fill(this.fillValue);

      return empty;
    }

    _dtypeTileConstructor(dtype) {
      switch (dtype) {
        case undefined:
        // These types use WebGL1-style implicit conversion:
        case 'uint8':
        // TODO: For now render uint32 via implicit conversion to RGBA 8-bit.
        // This should be changed once there are configurable rendering modes
        // per-datatype, so that an uint32 could either be an `gl.RGBA`,
        // `gl.R32UI`, `gl.RG16UI`, etc.
        case 'uint32':
        // Floats are fine with the default Pixi shaders:
        case 'float32':
        case 'float64':
          return PIXI.Sprite;
        default:
          return CATMAID.Pixi.TypedSprite.bind({}, dtype);
      }
    }

    _setPermissibleInterpolationMode(dtype) {
      if (typeof dtype === 'undefined') return;

      // Integer texture formats are not interpolatable.
      let current = this.getEffectiveInterpolationMode();
      if (current === CATMAID.StackLayer.INTERPOLATION_MODES.LINEAR &&
          (dtype.startsWith('uint') || dtype.startsWith('int')) &&
          dtype !== 'int8') {
        this.setInterpolationMode(CATMAID.StackLayer.INTERPOLATION_MODES.NEAREST);
      }
    }

    _dtypeWebGLParams(dtype) {
      // See table 2: https://www.khronos.org/registry/OpenGL-Refpages/es3.0/html/glTexImage2D.xhtml
      // WebGL2 documentation is often misleading because it only lists the
      // subset of this table that is supported for conversion from JS canvases,
      // etc., but WebGL2 itself supports all OpenGL ES 3.0 combinations.

      const gl = this._context.renderer.gl;
      var format, type, internalFormat, jsArrayType;

      // TODO: float64 is not supported. This may be the one current datatype
      // that should be cast (to float32) before uploading.

      switch (dtype) {
        case 'int8':
          format = gl.RED_INTEGER;
          type = gl.BYTE;
          internalFormat = gl.R8I;
          jsArrayType = Int8Array;
          break;
        case 'int16':
          format = gl.RED_INTEGER;
          type = gl.SHORT;
          internalFormat = gl.R16I;
          jsArrayType = Int16Array;
          break;
        case 'int32':
          format = gl.RED_INTEGER;
          type = gl.INT;
          internalFormat = gl.R32I;
          jsArrayType = Int32Array;
          break;
        case 'int64':
          // TODO: Once render modes per-datatype are available, this could also
          // be a `RG32I`.
          format = gl.RGBA_INTEGER;
          type = gl.SHORT;
          internalFormat = gl.RGBA16I;
          jsArrayType = Int16Array;
          break;
        case 'uint8':
          format = gl.LUMINANCE;
          type = gl.UNSIGNED_BYTE;
          internalFormat = gl.LUMINANCE;
          jsArrayType = Uint8Array;
          break;
        case 'uint16':
          format = gl.RED_INTEGER;
          type = gl.UNSIGNED_SHORT;
          internalFormat = gl.R16UI;
          jsArrayType = Uint16Array;
          break;
        case 'uint64':
          // TODO: Once render modes per-datatype are available, this could also
          // be a `RG32UI`.
          format = gl.RGBA_INTEGER;
          type = gl.UNSIGNED_SHORT;
          internalFormat = gl.RGBA16UI;
          jsArrayType = Uint16Array;
          break;
        // The default case can be hit when the layer is drawn before the
        // image block source has fully loaded.
        default:
          // This default should only catch float64 at time of writing, but
          // is a default since sources may generalize beyond N5 to backends
          // with other data types.
          CATMAID.warn(`Unsupported data type for stack layer: ${dtype}, using uint32`);
          /* falls through */
        // TODO: See note about 32-bit types in `_dtypeTileConstructor`.
        case 'uint32':
          format = gl.RGBA;
          type = gl.UNSIGNED_BYTE;
          internalFormat = gl.RGBA;
          jsArrayType = Uint8Array;
          break;
        case 'float32':
          format = gl.RED;
          type = gl.FLOAT;
          internalFormat = gl.R32F;
          jsArrayType = Float32Array;
          break;
      }

      return {format, type, internalFormat, jsArrayType};
    }

    _sliceToTexture(slice, pixiTex) {
      let renderer = this._context.renderer;
      let gl = renderer.gl;

      let dtype = sliceDtypeToBlockDtype(slice.dtype);
      let {format, type, internalFormat, jsArrayType} = this._dtypeWebGLParams(dtype);
      const glScaleMode = this._pixiInterpolationMode === PIXI.SCALE_MODES.LINEAR ?
        gl.LINEAR : gl.NEAREST;

      let baseTex = pixiTex.baseTexture;
      let texture = baseTex._glTextures[renderer.CONTEXT_UID];
      let newTex = false;

      // Since we assume array coordinates are [x][y], we want f-order since
      // OpenGL wants x most rapidly changing.
      let transpose = slice.selection.stride[0] > slice.selection.stride[1];
      if (!transpose) {
        slice = slice.transpose(1, 0);
      }
      let width = slice.shape[1];
      let height = slice.shape[0];

      if (!texture || texture.width !== width || texture.height !== height ||
          texture.format !== internalFormat || texture.type !== type) {
        // Make sure Pixi does not have the old texture bound.
        renderer.unbindTexture(baseTex);
        if (texture) gl.deleteTexture(texture.texture);
        texture = new PIXI.glCore.GLTexture(gl, width, height, internalFormat, type);
        baseTex._glTextures[renderer.CONTEXT_UID] = texture;
        pixiTex._frame.width = baseTex.width = baseTex.realWidth = width;
        pixiTex._frame.height = baseTex.height = baseTex.realHeight = height;
        newTex = true;
        pixiTex._updateUvs();
      }

      // Pixi assumes it knows which textures are bound to which units as an
      // optimization. To not corrupt these assumptions, bind through Pixi
      // and use its unit rather than directly with the texture.
      let texUnit = renderer.bindTexture(baseTex);
      gl.activeTexture(gl.TEXTURE0 + texUnit);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      let typedArr = _flattenNdarraySliceToView(slice);
      let arrayBuff = new jsArrayType(typedArr.buffer,
        typedArr.byteOffset, typedArr.byteLength/jsArrayType.BYTES_PER_ELEMENT);
      pixiTex._transpose = transpose;

      if (newTex) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0, // Level
          internalFormat,
          texture.width,
          texture.height,
          0, // Border
          format,
          texture.type,
          arrayBuff,
          0);
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0, // Level
          0, 0,
          texture.width,
          texture.height,
          format,
          texture.type,
          arrayBuff,
          0);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glScaleMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glScaleMode);

      pixiTex.valid = baseTex.hasLoaded = true;
    }

    _swapBuffers(force, timeout) {
      if (timeout && this._swapBuffersTimeout && timeout !== this._swapBuffersTimeout) return;
      window.clearTimeout(this._swapBuffersTimeout);
      this._swapBuffersTimeout = null;

      for (var i = 0; i < this._tiles.length; ++i) {
        for (var j = 0; j < this._tiles[0].length; ++j) {
          var buff = this._tilesBuffer[i][j];
          if (buff.coord) {
            var tile = this._tiles[i][j];

            if (buff.loaded) {
              let swap = tile.texture;
              tile.texture = buff.texture;
              tile.coord = buff.coord;
              buff.texture = swap;
              buff.loaded = false;
              buff.coord = null;
              if (tile.texture.baseTexture.scaleMode !== this._pixiInterpolationMode) {
                this._setTextureInterpolationMode(tile.texture, this._pixiInterpolationMode);
              }
              if (tile.texture._transpose && !tile._transpose) {
                tile.scale.x = -1.0;
                tile.rotation = -Math.PI / 2.0;
                tile._transpose = true;
              } else if (!tile.texture._transpose && tile._transpose) {
                tile.scale.x = 1.0;
                tile.rotation = 0.0;
                tile._transpose = false;
              }
              tile.visible = true;
            } else if (force) {
              tile.visible = false;
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
    }

    _tilePixel(tile, x, y) {
      let blockZ = tile.coord[4] % this.blockSizeZ;
      return this._readBlock(...tile.coord.slice(0, 4))
          .then(block => this._sliceBlock(block, blockZ).get(Math.round(x), Math.round(y)));
    }
  }

  CATMAID.PixiImageBlockLayer = PixiImageBlockLayer;

  function sliceDtypeToBlockDtype(sliceDtype) {
    if (sliceDtype.startsWith('big')) {
      return sliceDtype.slice(3);
    } else {
      return sliceDtype;
    }
  }

  /** Convert a 2-d c-order ndarray into a flattened TypedArray. */
  function _flattenNdarraySliceToView(slice) {
    let sourceArray = slice.selection.data;
    if (slice.selection.stride[1] === 1) {
      if (slice.selection.stride[0] === slice.shape[1]) {
        // In this case the data is already contiguous in memory in the correct order.
        let sourceOffset = slice.selection.offset;
        return sourceArray.subarray(sourceOffset, sourceOffset + slice.shape[0] * slice.shape[1]);
      }

      // In this case the rows are contiguous in memory, but the colums are
      // strided non-contiguously.
      let typedArr = new sourceArray.constructor(slice.shape[0] * slice.shape[1]);
      let targetOffset = 0;
      let sourceOffset = slice.selection.offset;
      for (let i = 0; i < slice.shape[0]; ++i) {
        typedArr.set(sourceArray.subarray(sourceOffset, sourceOffset + slice.shape[1]), targetOffset);
        targetOffset += slice.shape[1];
        sourceOffset += slice.selection.stride[0];
      }

      return typedArr;
    } else {

      // In this case no elements are contiguous so much be copied individually.
      return slice.flatten().selection.data;
      // Manual implementation that is somehow slower than ndarray's nested
      // Array push and joining:
      // let typedArr = new sourceArray.constructor(slice.shape[0] * slice.shape[1]);
      // let targetOffset = 0;
      // let sourceIOffset = slice.selection.offset;
      // for (let i = 0; i < slice.shape[0]; ++i) {
      //   let sourceJOffset = sourceIOffset;
      //   for (let j = 0; j < slice.shape[1]; ++j) {
      //     typedArr[targetOffset++] = sourceArray[sourceJOffset];
      //     sourceJOffset += slice.selection.stride[1];
      //   }
      //   sourceIOffset += slice.selection.stride[0];
      // }

      // return typedArr;
    }
  }

})(CATMAID);
