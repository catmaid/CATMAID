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

  // Export layer into CATMAID namespace
  CATMAID.PaintingLayer = PaintingLayer;

})(CATMAID);
