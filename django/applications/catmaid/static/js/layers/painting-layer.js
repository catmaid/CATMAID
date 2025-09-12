(function(CATMAID) {

  "use strict";

  /**
   * The painting layer allows to add data by clicking in space. Added data can
   * be stored server-side in N5 files.
   */
  function PaintingLayer (stackViewer, tool, dataLayer) {
    if (!WEBGL.isWebGLAvailable()) {
      throw new CATMAID.NoWebGLAvailableError("WebGL is required by the painting layer, but not available");
    }

    // The stack viewer is needed by the PixiLayer constructor
    this.stackViewer = stackViewer;
    this.dataLayer = dataLayer;
    this.paintingTool = tool;
    //CATMAID.PixiLayer.call(this);

    this.view = document.createElement('canvas');
    this.view.classList.add('paintinglayer');

    this.context = this.view.getContext('2d');

    // internal opacity variable
    this.opacity = 1;
    this.visible = true;
    this.isHideable = true;
    this.name = "Data Painting";

    //CATMAID.PixiLayer.prototype._initBatchContainer.call(this);

    this.color = 'red';
    this.value = 1;
    this.dtype ='uint8';
    this.brushSize = 5;

    // add view to DOM
    if (this.visible) {
      this.stackViewer.getView().appendChild(this.view);
    }

    this.updateContextConfiguration();
  }

  /**
   * Return friendly name of this layer.
   */
  PaintingLayer.prototype.getLayerName = function () {
    return "Painting layer";
  };

  PaintingLayer.prototype.updateContextConfiguration = function() {
    this.context.strokeStyle = this.color;
    this.context.lineWidth = this.brushSize;
  };

  PaintingLayer.prototype.setOpacity = function (val) {
    this.view.style.opacity = val;
    this.opacity = val;
  };

  PaintingLayer.prototype.getOpacity = function () {
    return this.opacity;
  };

  PaintingLayer.prototype.redraw = function (completionCallback) {
    if (completionCallback) {
      completionCallback();
    }

    return;
  };

  PaintingLayer.prototype.resize = function (width, height) {
    this.view.width = width;
    this.view.height = height;
    this.updateContextConfiguration();
    this.redraw();
  };

  PaintingLayer.prototype.show = function () {
    this.view.style.display = "block";
  };

  PaintingLayer.prototype.hide = function () {
    this.view.style.display = "none";
  };

  PaintingLayer.prototype.getView = function () {
    return this.view;
  };

  PaintingLayer.prototype.unregister = function () {
    if (this.stackViewer && this.view.parentNode == this.stackViewer.getView()) {
      this.stackViewer.getView().removeChild(this.view);
    }
  };

  PaintingLayer.prototype.setActive = function (active) {
    this.is_active = active;
  };

  PaintingLayer.prototype.setLayerSetting = function (name, value) {
    if (name === 'color') {
      this.color = value;
      this.updateContextConfiguration();
    } else if (name === 'value') {
      this.value = value;
      this.dataLayer.setLayerSetting('backgroundLabel', value);
    } else if (name === 'dtype') {
      this.dtype = dtype;
    } else if (name === 'brushSize') {
      this.brushSize = value;
      this.updateContextConfiguration();
    }
  };

  PaintingLayer.prototype.getLayerSettings = function () {
    return new Map([[null, [{
      name: 'dtype',
      displayName: 'Data type',
      type: 'select',
      value: this.dtype,
      options: [
        ['uint8', 'UInt8'],
        ['uint32', 'UInt32'],
        ['float32', 'Float32']
      ],
      help: 'Data type of the values to paint'
    }, {
      name: 'value',
      displayName: 'Label value',
      type: 'text',
      value: this.value,
      help: 'The value to persist for the painting',
    }, {
      name: 'color',
      displayName: 'Color to paint',
      type: 'text',
      value: this.color,
      help: 'The color to paint',
    }, {
      name: 'brushSize',
      displayName: 'Brush size (px)',
      type: 'number',
      step: 1,
      min: 0,
      value: this.brushSize,
      help: 'Size of the paint brush in pixels.',
    }]]]);
  };

  /**
   * Paint into data layer with current settings.
   *
   * @param shiftX float Shift painting by this amount in X.
   * @param shiftY float Shift painting by this amount in Y.
   */
  PaintingLayer.prototype.paintAt = function(x, y, prevX, prevY, shiftX=0, shiftY=0) {
    const projectId = project.id;

    if (prevX === undefined || prevX === null) {
      prevX = x;
    }
    if (prevY === undefined || prevY === null) {
      prevY = y;
    }

    const canvasDrawing = false;

    if (canvasDrawing) {
      if (x === prevX && y === prevY) {
        this.context.beginPath();
        this.context.moveTo(x, y);
        this.context.fillStyle = this.color;
        this.context.arc(x, y, this.brushSize / 2.0, 0, 2 * Math.PI);
        this.context.fill();
        this.context.closePath();
      } else {
        this.context.beginPath();
        this.context.moveTo(prevX, prevY);
        this.context.lineTo(x, y);
        this.context.strokeStyle = this.color;
        this.context.lineWidth = this.brushSize;
        this.context.lineJoin = "round";
        this.context.lineCap = "round";
        this.context.stroke();
        this.context.closePath();
      }
    }

    const activeWritableStack = this.paintingTool.getActiveWritableStack();
    const activeWritableStackId = this.paintingTool.getActiveWritableStackId();

    if (!activeWritableStackId || !activeWritableStack) {
      CATMAID.warn('No active writable stack selected');
      return;
    }

    // Draw a circle into the data layer's cache
    if (!(this.dataLayer instanceof CATMAID.PixiImageBlockLayer)) {
      const msg = 'Painting data layer has wrong layer type';
      CATMAID.warn(msg);
      return Promise.reject(CATMAID.ValueError(msg));
    }

    // Convert screen coordinates to voxel coordinates. Convert voxel
    // coordinates into block coordinates.
    let zoom = this.stackViewer.s;
    const screenPosition = this.stackViewer.screenPosition();
    const voxelPosX = (screenPosition.left +
        x * Math.pow(2, zoom) / this.stackViewer.primaryStack.anisotropy(0).x) / Math.pow(2, zoom);
    const voxelPosY = (screenPosition.top  +
        y * Math.pow(2, zoom) / this.stackViewer.primaryStack.anisotropy(0).y) / Math.pow(2, zoom);
    const voxelPosZ = this.stackViewer.z;

    var mag = 1.0;

    //var anisotropy = this.dataLayer.stack.anisotropy(zoom);
    //let [tileWidth, tileHeight] = this.dataLayer.tileSizeForZoom(zoom);
    //var effectiveTileWidth = tileWidth * mag * anisotropy.x;
    //var effectiveTileHeight = tileHeight * mag * anisotropy.y;

    // The minimum zoom level indicates down to what scale level data is
    // available. Usually this is zoom level zero.
    var minZoom = this.stackViewer.primaryStack.minZoomLevel;

    /* If the zoom is below our minimum zoom level (usually this means negative)
     * we zoom in digitally. For this we take the zero zoom level and adjust the
     * tile properties. This way we let the browser do the zooming work.
     */
    if (zoom < minZoom || zoom % 1 !== 0) {
      /* For nonintegral zoom levels the ceiling is used to select
       * source image zoom level. While using the floor would allow
       * better image quality, it would requiring dynamically
       * increasing the number of tiles to fill the viewport since
       * in that case effectiveTileWidth < tileWidth.
       */
      zoom = Math.min(this.stackViewer.primaryStack.MAX_S, Math.max(minZoom, Math.ceil(zoom)));
      /* Magnification is positive for digital zoom beyond image
       * resolution and negative for non-integral zooms within
       * image resolution.
       */
      if (s < 0 || zoom === this.stackViewer.primaryStack.MAX_S) {
        mag = Math.pow(2, zoom - s);
      } else {
        mag = this.stackViewer.primaryStack.effectiveDownsampleFactor(zoom) /
            this.stackViewer.primaryStack.effectiveDownsampleFactor(this.stackViewer.s);
      }
    }

    // Use meta data from data layer, because it actually shows the
    // server-side N5 file.
    const dataType = this.dataLayer.tileSource.dataType();
    const blockSize = this.dataLayer.tileSource.blockSize(this.stackViewer.s);
    const blockCoordBounds = this.dataLayer.tileSource.blockCoordBounds(zoom);
    // The +1 is needed, because the bounds are inclusice.
    const datasetSize = [
      (blockCoordBounds.max[0] - blockCoordBounds.min[0] + 1) * blockSize[0],
      (blockCoordBounds.max[1] - blockCoordBounds.min[1] + 1) * blockSize[1],
      (blockCoordBounds.max[2] - blockCoordBounds.min[2] + 1) * blockSize[2],
    ];
    const blockShape = [
      datasetSize[0] / blockSize[0],
      datasetSize[1] / blockSize[1],
      datasetSize[2] / blockSize[2],
    ];

    let blockCoord = [
      Math.floor(voxelPosX /  blockSize[0]),
      Math.floor(voxelPosY /  blockSize[1]),
      Math.floor(voxelPosZ /  blockSize[2]),
    ];

    // FIXME: This should be handled more nicely
    if (blockCoord[0] < 0 || blockCoord[1] < 0) {
      return Promise.resolve();
    }

    let ensureBlock = (block) => {
      if (!block) {
        // No block found in cache and on server, create new block
        const backgroundValue = 0;
        block = nj.zeros(blockSize, dataType);
        block.assign(backgroundValue, false);
        // TODO: Needed?
        block = block.transpose(...this.dataLayer.tileSource.sliceDims);
      }
      return block;
    };

    let writeBlock = (bS, bX, bY, bZ, block) => {
      const url = `${projectId}/writable-stacks/${activeWritableStackId}/write-block`;
      return this.paintingTool.writeDeduper.dedup(
        `${url}-${bX}-${bY}-${bZ}-${bS}`,
        () => {
          const getMostRecentBlock = this.dataLayer._readBlock(bS, bX, bY, bZ);

          return getMostRecentBlock.then(mostRecentBlock => {
            return CATMAID.fetch({
                url: url,
                method: 'POST',
                parallel: true,
                data: {
                  scale_level: bS,
                  //compression: 'raw',
                  //data: mostRecentBlock.tolist().join(','),
                  compression: 'msgpack',
                  // msgpack data is sent as string for now.
                  // TODO: Send all parameters as single JSON.
                  data: msgpack.encode(mostRecentBlock.tolist()).join(','),
                  data_bounds: [
                    [
                      bX * blockSize[0],
                      bY * blockSize[1],
                      bZ * blockSize[2],
                    ],
                    [
                      (bX + 1) * blockSize[0] - 1,
                      (bY + 1) * blockSize[1] - 1,
                      (bZ + 1) * blockSize[2] - 1,
                    ]
                  ],
                },
                api: this.api,
              });
          });
        })
        .catch(CATMAID.handleError);
    };

    // Assume block is in cache
    return this.dataLayer._readBlock(this.stackViewer.s, ...blockCoord)
      .then((block) => {
        block = ensureBlock(block);

        // Update block data and write to cache if not already there. The block is
        // a nj.NdArray instance.
        const relVoxelPos = [
          Math.floor(voxelPosX - blockCoord[0] * blockSize[0]),
          Math.floor(voxelPosY - blockCoord[1] * blockSize[1]),
          Math.floor(voxelPosZ - blockCoord[2] * blockSize[2])
        ];

        // Draw a coarse circle
        const halfBrushSize = Math.floor(this.brushSize / 2.0);
        const sqBrushSize = halfBrushSize * halfBrushSize;
        // Remember painting requests into adjacent blocks by a key of block
        // coordinates (x,y) and the data to paint.
        const adjacentBlockPainting = new Map();
        const seenLocations = new Set();
        for (let x = -halfBrushSize; x <= halfBrushSize; x++) {
          for (let y = -halfBrushSize; y <= halfBrushSize; y++) {
            const sqDist = x * x + y * y;
            const curPos = [
              relVoxelPos[0] + x + shiftX,
              relVoxelPos[1] + y + shiftY,
            ];
            if (sqDist <= sqBrushSize) {
              if (curPos[0] < 0 ||
                  curPos[1] < 0 ||
                  curPos[0] >= blockSize[0] ||
                  curPos[1] >= blockSize[1])
              {
                // Paint in adjacent block with the following block coordinate
                let adjBlockCoord = [
                  blockCoord[0] + Math.floor(curPos[0] / blockSize[0]),
                  blockCoord[1] + Math.floor(curPos[1] / blockSize[1]),
                ];
                // If this block coordinate is outside of the dataset
                // dimensions, ignore it.
                if (adjBlockCoord[0] < 0 ||
                    adjBlockCoord[1] < 0 ||
                    adjBlockCoord[0] > blockShape[0] ||
                    adjBlockCoord[1] > blockShape[1]) {
                  continue;
                }
                let adjBlockKey = `${adjBlockCoord[0]},${adjBlockCoord[1]}`;
                let adjBlock = adjacentBlockPainting.get(adjBlockKey);
                if (!adjBlock) {
                  adjBlock = [];
                  adjacentBlockPainting.set(adjBlockKey, adjBlock);
                }
                // Don't save same position twice
                const adjLocationString = `${curPos[0]}-${curPos[1]}-${relVoxelPos[2]}`;
                if (!seenLocations.has(adjLocationString)) {
                  adjBlock.push([
                      CATMAID.tools.mod(curPos[0], blockSize[0]),
                      CATMAID.tools.mod(curPos[1], blockSize[1]),
                      relVoxelPos[2]
                  ]);
                  seenLocations.add(adjLocationString);
                }
              } else {
                block.set(curPos[0], curPos[1], relVoxelPos[2], this.value);
              }
            }
          }
        }

        // Write block to data layer cache, to display it quickly.
        // TODO: Pin unsaved changed blocks in cache, because cache is used
        // below to get latest actual block data.
        this.dataLayer.writeBlock(projectId, zoom, ...blockCoord, block);

        // Second, write to back-end asynchronously. De-duplicate request to write
        // data back and queue the write request. For this, always use latest
        // block data available. This is done instead of regular write
        // operations (like every minute). # TODO: Test if this is reasonable.
        const blockWritePromises = [
          writeBlock(this.stackViewer.s, ...blockCoord, block)
        ];

        // Paint in adjacent blocks:
        for (let [key, paintingPositions] of adjacentBlockPainting) {
          // We don't expect many entries here, so the following should be okay.
          let [adjX, adjY] = key.split(',').map(Number);
          // We currently assume only planar painting
          let adjZ = blockCoord[2];
          blockWritePromises.push(
              this.dataLayer._readBlock(this.stackViewer.s, adjX, adjY, adjZ)
              .then(adjBlock => {
                  adjBlock = ensureBlock(adjBlock);
                  for (let [paintX, paintY, paintZ] of paintingPositions) {
                    adjBlock.set(paintX, paintY, paintZ, this.value);
                  }
                  // Write block back to cache and back-end
                  this.dataLayer.writeBlock(projectId, zoom, adjX, adjY, adjZ, adjBlock);
                  return writeBlock(this.stackViewer.s, adjX, adjY, adjZ, adjBlock);
              })
          );
        }

        return Promise.all(blockWritePromises);
      });
  };

  // Export layer into CATMAID namespace
  CATMAID.PaintingLayer = PaintingLayer;

})(CATMAID);
