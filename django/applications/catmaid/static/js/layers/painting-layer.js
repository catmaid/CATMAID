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
   */
  PaintingLayer.prototype.paintAt = function(x, y, prevX, prevY) {
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

    // Draw a circle into the data layer's cache
    if (!(this.dataLayer instanceof CATMAID.PixiImageBlockLayer)) {
      CATMAID.warn('Painting data layer has wrong layer type');
      return;
    }

    // Convert screen coordinates to voxel coordinates. Convert voxel
    // coordinates into block coordinates.
    const screenPosition = this.stackViewer.screenPosition();
    const voxelPosX = screenPosition.left +
        x / this.stackViewer.scale / this.stackViewer.primaryStack.anisotropy(0).x;
    const voxelPosY = screenPosition.top  +
        y / this.stackViewer.scale / this.stackViewer.primaryStack.anisotropy(0).y;
    const voxelPosZ = this.stackViewer.z;

    let zoom = this.stackViewer.s;
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

    const blockSize = this.dataLayer.tileSource.blockSize(this.stackViewer.s);
    const dataType = this.dataLayer.tileSource.dataType();

    let blockCoord = [
      Math.floor(voxelPosX /  blockSize[0]),
      Math.floor(voxelPosY /  blockSize[1]),
      Math.floor(voxelPosZ /  blockSize[2]),
    ];

    // Assume block is in cache
    this.dataLayer._readBlock(this.stackViewer.s, ...blockCoord)
      .then((block) => {
        if (!block) {
          // No block found in cache and on server
          CATMAID.msg('success', 'A new block is created, because no existing block is found');
          // TODO: Init new block
          const backgroundValue = 0;
          block = nj.zeros(blockSize, dataType);
          block.assign(backgroundValue, false);
          // TODO: Needed?
          block = block.transpose(...this.dataLayer.tileSource.sliceDims);
        }

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
        for (let x = -halfBrushSize; x <= halfBrushSize; x++) {
          for (let y = -halfBrushSize; y <= halfBrushSize; y++) {
            const sqDist = x * x + y * y;
            if (sqDist <= sqBrushSize) {
              block.set(relVoxelPos[0] + x, relVoxelPos[1] + y, relVoxelPos[2], this.value);
            }
          }
        }

        // Write block back to server. This is done asynchronously in regular
        // intervals (if changes happen).
        return this.dataLayer.writeBlock(project.id, this.stackViewer.s, zoom, ...blockCoord, block);
      })
      .catch(CATMAID.handleError);
  };

  // Export layer into CATMAID namespace
  CATMAID.PaintingLayer = PaintingLayer;

})(CATMAID);
