/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The tracing layer that hosts the tracing data
   *
   * @param {StackViewer} stackViewer Stack viewer containing this layer.
   * @param {Object=}     options     Options passed to the tracing overlay.
   */
  function TracingLayer(stackViewer, options) {
    if (!WEBGL.isWebGLAvailable()) {
      throw new CATMAID.NoWebGLAvailableError("WebGL is required by the tracing layer, but not available");
    }

    this.stackViewer = stackViewer;
    CATMAID.PixiLayer.call(this);

    options = options || {};

    this.opacity = options.opacity || 1.0; // in the range [0,1]

    CATMAID.PixiLayer.prototype._initBatchContainer.call(this);
    this.tracingOverlay = new CATMAID.TracingOverlay(stackViewer, this, options);
    this.isHideable = true;

    // If the tracing layer state should be updated even though it is hidden
    this.updateHidden = false;

    if (!this.stackViewer.getLayersView().contains(this.renderer.view)) {
      this.stackViewer.getLayersView().appendChild(this.renderer.view);
      this.renderer.view.className = 'sliceTiles';
    }

    this.renderer.plugins.interaction.autoPreventDefault = false;

    Object.defineProperty(this, 'transferFormat', {
      get: function() {
        return this.tracingOverlay.transferFormat;
      },
      set: function(value) {
        this.tracingOverlay.transferFormat = value;
      }
    });

    Object.defineProperty(this, 'nLargestSkeletonsLimit', {
      get: function() {
        return this.tracingOverlay.nLargestSkeletonsLimit;
      },
      set: function(value) {
        this.tracingOverlay.nLargestSkeletonsLimit = value;
      }
    });

    Object.defineProperty(this, 'nLastEditedSkeletonLimit', {
      get: function() {
        return this.tracingOverlay.nLastEditedSkeletonLimit;
      },
      set: function(value) {
        this.tracingOverlay.nLastEditedSkeletonLimit = value;
      }
    });

    Object.defineProperty(this, 'hiddenLastEditorId', {
      get: function() {
        return this.tracingOverlay.hiddenLastEditorId;
      },
      set: function(value) {
        this.tracingOverlay.hiddenLastEditorId = value;
      }
    });

    Object.defineProperty(this, 'minSkeletonLength', {
      get: function() {
        return this.tracingOverlay.minSkeletonLength;
      },
      set: function(value) {
        this.tracingOverlay.minSkeletonLength = value;
      }
    });

    Object.defineProperty(this, 'minSkeletonNodes', {
      get: function() {
        return this.tracingOverlay.minSkeletonNodes;
      },
      set: function(value) {
        this.tracingOverlay.minSkeletonNodes = value;
      }
    });

    Object.defineProperty(this, 'nodeProviderOverride', {
      get: function() {
        return this.tracingOverlay.nodeProviderOverride;
      },
      set: function(value) {
        this.tracingOverlay.nodeProviderOverride = value;
      }
    });

    Object.defineProperty(this, 'tracingWindowWidth', {
      get: function() {
        return this.tracingOverlay.tracingWindowWidth;
      },
      set: function(value) {
        this.tracingOverlay.tracingWindowWidth = value;
      }
    });

    Object.defineProperty(this, 'tracingWindowHeight', {
      get: function() {
        return this.tracingOverlay.tracingWindowHeight;
      },
      set: function(value) {
        this.tracingOverlay.tracingWindowHeight = value;
      }
    });

    Object.defineProperty(this, 'applyTracingWindow', {
      get: function() {
        return this.tracingOverlay.applyTracingWindow;
      },
      set: function(value) {
        this.tracingOverlay.applyTracingWindow = value;
      }
    });

    Object.defineProperty(this, 'updateWhilePanning', {
      get: function() {
        return this.tracingOverlay.updateWhilePanning;
      },
      set: function(value) {
        this.tracingOverlay.updateWhilePanning = value;
      }
    });

    Object.defineProperty(this, 'levelOfDetail', {
      get: function() {
        return this.tracingOverlay.levelOfDetail;
      },
      set: function(value) {
        this.tracingOverlay.levelOfDetail = value;
      }
    });

    Object.defineProperty(this, 'levelOfDetailMode', {
      get: function() {
        return this.tracingOverlay.levelOfDetailMode;
      },
      set: function(value) {
        this.tracingOverlay.levelOfDetailMode = value;
      }
    });
  }

  TracingLayer.prototype = Object.create(CATMAID.PixiLayer.prototype);
  TracingLayer.prototype.constructor = TracingLayer;

  /**
   * Return friendly name of this layer.
   */
  TracingLayer.prototype.getLayerName = function () {
    return "Neuron tracing";
  };

  TracingLayer.prototype.resize = function (width, height) {
    CATMAID.PixiLayer.prototype.resize.call(this, width, height);
    this.tracingOverlay.redraw();
  };

  TracingLayer.prototype.beforeMove = function () {
    return this.tracingOverlay.updateNodeCoordinatesInDB();
  };

  TracingLayer.prototype.getClosestNode = function (x, y, z, radius, respectVirtualNodes) {
    return this.tracingOverlay.getClosestNode(x, y, z, radius, respectVirtualNodes);
  };

  TracingLayer.prototype.setOpacity = function (val) {
    CATMAID.PixiLayer.prototype.setOpacity.call(this, val);

    this.tracingOverlay.paper.style('display', this.visible ? 'inherit' : 'none');

    if (this.tracingImage) {
      this.tracingImage.style.opacity = val;
    }
  };

  /** */
  TracingLayer.prototype.redraw = function (completionCallback) {
    this.tracingOverlay.redraw(false, completionCallback);
  };

  /**
   * Force redraw of the tracing layer.
   */
  TracingLayer.prototype.forceRedraw = function (completionCallback) {
    this.tracingOverlay.redraw(true, completionCallback);
  };

  TracingLayer.prototype.unregister = function () {
    this.tracingOverlay.destroy();

    CATMAID.PixiLayer.prototype.unregister.call(this);

    if (this.tracingImage) {
      let view = this.stackViewer.getLayersView();
      view.removeChild(this.tracingImage);
    }
  };

  /**
   * Execute the passed in function, optionally asyncronously as a promise,
   * while making sure nodes get updated even though this layer might not be
   * visible.
   */
  TracingLayer.prototype.withHiddenUpdate = function(isPromise, fn) {
    // Explicitly reset this value to false, because executing many requests in
    // a row won't have individual requests wait until the previous one finishes
    // and resets this value. Therefore, reading out the original value isn't
    // necessarily reliable.
    return CATMAID.with(this, 'updateHidden', true, isPromise, fn, false);
  };

  TracingLayer.prototype.getLayerSettings = function() {
    return [{
      name: 'updateWhilePanning',
      displayName: 'Update tracing data while panning',
      type: 'checkbox',
      value: this.updateWhilePanning,
      help: 'Whether or not to update the visible tracing data while panning the view.'
    }, {
      name: 'levelOfDetailMode',
      displayName: 'Level of detail mode',
      type: 'select',
      value: this.levelOfDetailMode,
      options: [
        ['absolute', 'Absolute'],
        ['adaptive', 'Zoom adaptive'],
        ['mapping', 'Zoom mapping']
      ],
      help: 'Level-of-detail can be used with certain node caches (grid cache). In "absolute" mode, the LOD number below will be used to collect data buckets of the respective cache. In "Zoom adaptive" mode the LOD number is the inverse of the current zoom level relative to the number of zoom levels. The "Zoom mapping" option allows to map zoom levels explicitly to LOD levels.'
    }, {
      name: 'levelOfDetail',
      displayName: 'Level of detail',
      type: 'number',
      step: 1,
      min: 0,
      value: this.levelOfDetail,
      help: 'Level-of-detail, use 0 for all levels (most detail)',
    }, {
      name: 'applyTracingWindow',
      displayName: 'Apply and show tracing window',
      type: 'checkbox',
      value: this.applyTracingWindow,
      help: 'Whether or not to apply and show a view centered tracing window, outside of which no tracing data will be loaded.'
    }, {
      name: 'tracingWindowWidth',
      displayName: 'Tracing window width',
      type: 'number',
      step: 10,
      min: 0,
      value: this.tracingWindowWidth,
      help: 'The width of a view centered tracing window.'
    }, {
      name: 'tracingWindowHeight',
      displayName: 'Tracing window height',
      type: 'number',
      step: 10,
      min: 0,
      value: this.tracingWindowHeight,
      help: 'The height of a view centered tracing window.'
    }, {
      name: 'transferFormat',
      displayName: 'Tracing data transfer mode',
      type: 'select',
      value: this.transferFormat,
      options: [
        ['json', 'JSON'],
        ['msgpack', 'Msgpack'],
        ['gif', 'GIF image'],
        ['png', 'PNG image']
      ],
      help: 'Transferring tracing data as msgpack or image can reduce its size and loading time. Image data doesn\'t allow much interaction.'
    }, {
      name: 'nLargestSkeletonsLimit',
      displayName: 'Limit to N largest skeletons',
      type: 'number',
      step: 100,
      min: 0,
      value: this.nLargestSkeletonsLimit,
      help: 'Limit the displayed skeletons to the N largest in terms of cable length. A value of zero disables the limit.'
    }, {
      name: 'nLastEditedSkeletonLimit',
      displayName: 'Limit to N last edited skeletons',
      type: 'number',
      step: 100,
      min: 0,
      value: this.nLastEditedSkeletonLimit,
      help: 'Limit the displayed skeletons to the N most recently edited ones. A value of zero disables the limit.'
    }, {
      name: 'hiddenLastEditorId',
      displayName: 'Hide data last edited by',
      type: 'select',
      value: this.hiddenLastEditorId,
      options: [['none', '(None)']].concat(CATMAID.User.list('id-login')),
      help: 'Limit the displayed skeletons to those that have not been edited last by the specified user.',
    }, {
      name: 'minSkeletonLength',
      displayName: 'Min skeleton length (nm)',
      type: 'number',
      step: 5000,
      min: 0,
      value: this.minSkeletonLength,
      help: 'Limit the displayed skeletons to the ones of skeletons of at least this length in nm.'
    }, {
      name: 'minSkeletonNodes',
      displayName: 'Min skeleton nodes',
      type: 'number',
      step: 50,
      min: 0,
      value: this.minSkeletonNodes,
      help: 'Limit the displayed skeletons to the ones of skeletons of at least this many nodes.'
    }, {
      name: 'nodeProviderOverride',
      displayName: 'Node provider',
      type: 'select',
      value: this.nodeProviderOverride,
      options: [['none', 'Auto'], ['postgis2d', '2D index'],
          ['postgis2dblurry', '2D index blurry'],
          ['postgis2dmultijoin', '2D index multi-join'],
          ['postgis3d', '3D index'],
          ['postgis3dblurry', '3D index blurry'],
          ['postgis3dmultijoin', '3D index multi-join'],
          ['postgis3dspgist', '3D index unbalanced']],
      help: 'Override the back-end selected node provider',
    }];
  };

  TracingLayer.prototype.setLayerSetting = function(name, value) {
    let update = true;
    if ('transferFormat' === name) {
      this.transferFormat = value;
    } else if ('nLargestSkeletonsLimit' === name) {
      this.nLargestSkeletonsLimit = value;
    } else if ('nLastEditedSkeletonLimit' === name) {
      this.nLastEditedSkeletonLimit = value;
    } else if ('hiddenLastEditorId' === name) {
      this.hiddenLastEditorId = value;
    } else if ('minSkeletonLength' === name) {
      this.minSkeletonLength = value;
    } else if ('minSkeletonNodes' === name) {
      this.minSkeletonNodes = value;
    } else if ('nodeProviderOverride' === name) {
      this.nodeProviderOverride = value;
    } else if ('tracingWindowWidth' === name) {
      this.tracingWindowWidth = parseInt(value, 10);
      this.tracingOverlay.updateTracingWindow();
    } else if ('tracingWindowHeight' === name) {
      this.tracingWindowHeight = parseInt(value, 10);
      this.tracingOverlay.updateTracingWindow();
    } else if ('applyTracingWindow' === name) {
      this.applyTracingWindow = value;
      this.tracingOverlay.updateTracingWindow();
    } else if ('updateWhilePanning' === name) {
      this.updateWhilePanning = value;
      update = false;
    } else if ('levelOfDetail' === name) {
      this.levelOfDetail = value;
    } else if ('levelOfDetailMode' === name) {
      this.levelOfDetailMode = value;
    } else {
      update = false;
    }

    if (update) {
      this.tracingOverlay.updateNodes(this.tracingOverlay.redraw.bind(this.tracingOverlay, true));
    }
  };

  TracingLayer.prototype.getTracingImage = function() {
    let view = this.stackViewer.getLayersView();
    if (!this.tracingImage) {
      this.tracingImage = new Image();
      this.tracingImage.classList.add('tracing-data');
      view.appendChild(this.tracingImage);
    }
    return this.tracingImage;
  };

  CATMAID.TracingLayer = TracingLayer;

})(CATMAID);
