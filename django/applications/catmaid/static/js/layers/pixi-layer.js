/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */

(function(CATMAID) {

  "use strict";

  // Suppress display of the PIXI banner message in the console.
  PIXI.utils.skipHello();

  PixiLayer.contexts = new Map();

  /**
   * A WebGL/Pixi context shared by all WebGL layers in the same stack viewer.
   *
   * @class PixiContext
   * @constructor
   * @param {StackViewer} stackViewer The stack viewer to which this context belongs.
   */
  function PixiContext(stackViewer) {
    let options = {
        transparent: true,
        backgroundColor: 0x000000,
        antialias: true,
        stencil: true};
    let view = document.createElement('canvas');

    // Try to get WebGL 2 context, if WebGL 2 is unavailable fall back to WebGl 1.
    let rawContext = view.getContext('webgl2', options);
    if (rawContext) {
      this.webglVersion = 2;
    } else {
      this.webglVersion = 1;
      rawContext = view.getContext('webgl', options);
    }

    options.context = rawContext;
    options.view = view;
    this.renderer = new PIXI.autoDetectRenderer(
        stackViewer.getView().clientWidth,
        stackViewer.getView().clientHeight,
        options);
    this.stage = new PIXI.Container();
    this.layersRegistered = new Set();

    // Disable the renderer's accessibility plugin (if available), because it
    // requires the renderer view to be part of the DOM at all times (which we
    // cannot guarantee).
    if (this.renderer.plugins['accessibility']) {
      this.renderer.plugins['accessibility'].destroy();
      delete this.renderer.plugins['accessibility'];
    }
  }

  /**
   * Release any Pixi resources owned by this context.
   */
  PixiContext.prototype.destroy = function () {
    this.renderer.destroy();
    this.renderer = null;
    this.stage = null;
  };

  /**
   * Mark all layers using this context as not being ready for rendering.
   */
  PixiContext.prototype.resetRenderReadiness = function () {
    this.layersRegistered.forEach(function (layer) {
      layer.readyForRender = false;
    });
  };

  /**
   * Render the Pixi context if all layers using it are ready.
   */
  PixiContext.prototype.renderIfReady = function () {
    if (!this.renderer) return;

    var allReady = true;
    this.layersRegistered.forEach(function (layer) {
        allReady = allReady && (layer.readyForRender || !layer.visible);
    });

    if (allReady) this.renderer.render(this.stage);
  };

  /**
   * Renderer the content of this context to a URL-encoded type.
   * @param  {@string} type               URL encoding format, e.g., 'image/png'
   * @param  {@PIXI.RenderTexture} canvas Target render texture, to reuse.
   * @return {string}                     URL-encoded content.
   */
  PixiContext.prototype.toDataURL = function (type, canvas) {
    canvas = canvas || new PIXI.RenderTexture.create(this.renderer.width, this.renderer.height);
    this.renderer.render(this.stage, canvas);
    return this.renderer.plugins.extract.canvas(canvas).toDataURL(type);
  };


  function Loader() {
    this._queue = new Set();
  }

  Loader.prototype.constructor = Loader;

  Loader.prototype.add = function (url, headers, completionCallback) {
    var request = new Request(
        url,
        {mode: 'cors', credentials: 'same-origin', headers: headers});
    this._queue.add(request);
    var remove = (function () { this._queue.delete(request); }).bind(this);
    fetch(request)
        .then(function (response) {
          return response.blob();
        })
        .then(function (blob) {
          var objUrl = window.URL.createObjectURL(blob);
          var image = new Image();

          image.onload = function () {
            var texture = PIXI.Texture.fromLoader(this, url);
            window.URL.revokeObjectURL(objUrl);
            completionCallback({url: url, texture: texture});
          };

          image.src = objUrl;
        })
        .catch(error => this.handleError(error, url))
        .then(remove);
  };

  Loader.prototype.handleError = function (error, url) {
    console.log(error, url);
  };

  Loader.prototype.queueLength = function () {
    return this._queue.size;
  };


  /**
   * Loads textures from URLs, tracks use through reference counting, caches
   * unused textures, and frees evicted textures.
   *
   * @class
   * @constructor
   */
  PixiContext.TextureManager = function () {
    this._boundResourceLoaded = this._resourceLoaded.bind(this);
    this._concurrency = 16;
    this._counts = {};
    this._loader = new Loader(this._concurrency);
    this._loading = {};
    this._loadingQueue = [];
    this._loadingQueueHeaders = {};
    this._loadingRequests = new Set();
    this._unused = [];
    this._unusedCapacity = 256;
    this._unusedOut = 0;
    this._unusedIn = 0;
  };

  PixiContext.TextureManager.prototype.constructor = PixiContext.TextureManager;

  /**
   * Create a load request for a set of texture URLs and callback once they
   * have all loaded. Requests can be fulfilled from caches and are deduplicated
   * with other loading requests.
   *
   * @param  {string[]} urls     The set of texture URLs to load.
   * @param  {Function} callback Callback when the request successfully completes.
   * @return {Object}            A request tracking object that can be used to
   *                             to cancel this request.
   */
  PixiContext.TextureManager.prototype.load = function (urls, headers, callback) {
    var request = {urls: urls, callback: callback, remaining: 0};
    // Remove any URLs already cached or being loaded by other requests.
    var newUrls = urls.filter(function (url) {
      if (this._counts.hasOwnProperty(url)) return false;
      request.remaining++;
      if (this._loading.hasOwnProperty(url)) {
        this._loading[url].add(request);
        return false;
      } else {
        this._loading[url] = new Set([request]);
        return true;
      }
    }, this);

    newUrls.forEach(function (url) {
      this._loadingQueueHeaders[url] = headers;
    }, this);

    if (request.remaining === 0) {
      callback();
      return request;
    }
    this._loadingRequests.add(request);

    Array.prototype.push.apply(this._loadingQueue, newUrls);
    this._loadFromQueue();

    return request;
  };

  /**
   * Passes URLs from the TextureManager's loading queue to the loader.
   *
   * @private
   */
  PixiContext.TextureManager.prototype._loadFromQueue = function () {
    var toDequeue = this._concurrency - this._loader.queueLength();
    if (toDequeue < 1) return;
    var remainingQueue = this._loadingQueue.splice(toDequeue);
    var toLoad = this._loadingQueue;
    this._loadingQueue = remainingQueue;
    toLoad.forEach(function (url) {
      this._loader.add(url,
                       this._loadingQueueHeaders[url],
                       this._boundResourceLoaded);
      delete this._loadingQueueHeaders[url];
    }, this);
  };

  /**
   * Callback when a resources has loaded to remove it from the loading queues,
   * add it to the cache, and execute any request callbacks.
   *
   * @private
   * @param  {Object} resource PIXI's resource loaded object.
   */
  PixiContext.TextureManager.prototype._resourceLoaded = function (resource) {
    var url = resource.url;
    var requests = this._loading[url];
    delete this._loading[url];

    if (url in PIXI.utils.TextureCache) {
      if (resource.texture && !resource.texture.valid) {
        // If there was an error, remove texture from Pixi's cache.
        resource.texture.destroy(true);
      } else if (!this._counts.hasOwnProperty(url)) {
        this._counts[url] = 0;
        this._markUnused(url);
      }
    }

    // Notify any requests for this resource of its completion.
    if (requests) requests.forEach(function (request) {
      request.remaining--;
      // If the request is complete, execute its callback.
      if (request.remaining === 0) {
        this._loadingRequests.delete(request);
        request.callback();
      }
    }, this);

    this._loadFromQueue();
  };

  /**
   * Cancels a texture loading request, removing any resources from the loading
   * queue that have not already loaded or are not required by other requests.
   *
   * @param  {Object} request A request tracking object returned by `load`.
   */
  PixiContext.TextureManager.prototype.cancel = function (request) {
    if (this._loadingRequests.delete(request)) {
      request.urls.forEach(function (url) {
        if (this._loading.hasOwnProperty(url)) {
          this._loading[url].delete(request);
          // If this was the last request for this resource, remove it from the
          // loader's queue.
          if (this._loading[url].size === 0) {
            var queuePosition = this._loadingQueue.indexOf(url);
            if (queuePosition !== -1) {
              this._loadingQueue.splice(queuePosition, 1);
              // Only delete this URL from the loading object if it was still
              // in the queue. Otherwise it has already been picked up by the
              // loader, so we must let it load normally for consistency.
              delete this._loading[url];
            }
          }
        }
      }, this);
    }
  };

  /**
   * Increment the reference counter for a texture.
   *
   * @param  {string} key Texture resource key, usually a URL.
   */
  PixiContext.TextureManager.prototype.inc = function (key) {
    var count = this._counts[key];

    if (typeof count !== 'undefined') { // Key is already tracked by cache.
      this._counts[key] += 1;
    } else {
      this._counts[key] = 1;
    }

    if (count === 0) { // Remove this key from the unused set.
      this._unused[this._unused.indexOf(key)] = null;
    }
  };

  /**
   * Decrement the reference counter for a texture. If the texture is no longer
   * used, it will be moved to the unused cache and possibly freed.
   *
   * @param  {string} key Texture resource key, usually a URL.
   */
  PixiContext.TextureManager.prototype.dec = function (key) {
    if (typeof key === 'undefined' || key === null) return;
    var count = this._counts[key];

    if (typeof count !== 'undefined') { // Key is already tracked by cache.
      this._counts[key] -= 1;
    } else {
      console.warn('Attempt to release reference to untracked key: ' + key);
      return;
    }

    if (count === 1) { // Add this key to the unused set.
      this._markUnused(key);
    }
  };

  /**
   * Mark a texture as being unused, move it to the unused cache, and free other
   * unused cache textures if necessary.
   *
   * @private
   * @param  {string} key Texture resource key, usually a URL.
   */
  PixiContext.TextureManager.prototype._markUnused = function (key) {
    // Check if the circular array is full.
    if ((this._unusedIn + 1) % this._unusedCapacity === this._unusedOut) {
      var outKey = this._unused[this._unusedOut];

      if (outKey !== null) {
        delete this._counts[outKey];
        // While it is reasonable to expect the texture cache entry to be there,
        // there are reports where the destroy() call on a cached texture
        // failed, because of an unavailable entry. To mitigate this, an extra
        // check is performed until the root cause for this problem is found.
        if (PIXI.utils.TextureCache[outKey]) {
          PIXI.utils.TextureCache[outKey].destroy(true);
        }
        delete PIXI.utils.TextureCache[outKey];
      }

      this._unusedOut = (this._unusedOut + 1) % this._unusedCapacity;
    }

    this._unused[this._unusedIn] = key;
    this._unusedIn = (this._unusedIn + 1) % this._unusedCapacity;
  };

  PixiContext.GlobalTextureManager = new PixiContext.TextureManager();

  CATMAID.PixiContext = PixiContext;


  /**
   * A layer that shares a common Pixi renderer with other layers in this stack
   * viewer. Creates a renderer and stage context for the stack viewer if none
   * exists.
   *
   * Must be used as a mixin for an object with a `stackViewer` property.
   *
   * @class PixiLayer
   * @constructor
   */
  function PixiLayer() {
    this.batchContainer = null;
    this._context = PixiLayer.contexts.get(this.stackViewer);
    if (!this._context) {
      this._context = new PixiContext(this.stackViewer);
      PixiLayer.contexts.set(this.stackViewer, this._context);
    }
    this._context.layersRegistered.add(this);
    this.renderer = this._context.renderer;
    this.stage = this._context.stage;
    this.blendMode = 'normal';
    this.filters = [];
    this.readyForRender = false;
  }

  /**
   * Free any pixi display objects associated with this layer.
   */
  PixiLayer.prototype.unregister = function () {
    if (this.batchContainer) {
      this.batchContainer.removeChildren();
      this.stage.removeChild(this.batchContainer);
    }

    this._context.layersRegistered.delete(this);

    // If this was the last layer using this Pixi context, remove it.
    if (this._context.layersRegistered.size === 0) {
      this._context.destroy();
      PixiLayer.contexts.delete(this.stackViewer);
    }
  };

  /**
   * Initialise the layer's batch container.
   */
  PixiLayer.prototype._initBatchContainer = function () {
    if (!this.batchContainer) {
      this.batchContainer = new PIXI.Container();
      this.syncFilters();
      this.stage.addChild(this.batchContainer);
    } else this.batchContainer.removeChildren();
  };

  /**
   * Render the Pixi context if all layers using it are ready.
   */
  PixiLayer.prototype._renderIfReady = function () {
    this.readyForRender = true;
    this._context.renderIfReady();
  };

  /**
   * Handle a resize event by updating the renderer size if necessary.
   *
   * @param  {number} width  New visible width of the layer in pixels.
   * @param  {number} height New visible height of the layer in pixels.
   */
  PixiLayer.prototype.resize = function (width, height) {
    if (width !== this.renderer.width || height !== this.renderer.height)
      this.renderer.resize(width, height);
  };

  /**
   * Set opacity in the range from 0 to 1.
   * @param {number} val New opacity.
   */
  PixiLayer.prototype.setOpacity = function (val) {
    this.opacity = val;
    this.visible = val >= 0.02;
    if (this.batchContainer) {
      // Some filters must handle opacity alpha themselves. If such a filter is
      // applied to this layer, do not use the built-in Pixi alpha.
      var filterBasedAlpha = false;

      this.filters.forEach(function (filter) {
        if (filter.pixiFilter.uniforms.hasOwnProperty('containerAlpha')) {
          filter.pixiFilter.uniforms.containerAlpha = val;
          filterBasedAlpha = true;
        }
      });

      if (!filterBasedAlpha) this.batchContainer.alpha = val;
      this.batchContainer.visible = this.visible;
    }
  };

  /**
   * Get the layer opacity.
   */
  PixiLayer.prototype.getOpacity = function () {
    return this.opacity;
  };

  /**
   * Notify this layer that it has been reordered to be before another layer.
   * While the stack viewer orders DOM elements, layers are responsible for any
   * internal order representation, such as in a scene graph.
   * @param  {Layer} beforeLayer The layer which this layer was inserted before,
   *                             or null if this layer was moved to the end (top).
   */
  PixiLayer.prototype.notifyReorder = function (beforeLayer) {
    // PixiLayers can only reorder around other PixiLayers, since their ordering
    // is independent of the DOM. Use batchContainer to check for PixiLayers,
    // since instanceof does not work with MI/mixin inheritance.
    if (!(beforeLayer === null || beforeLayer.batchContainer)) return;

    // Internal reordering requires an initialized batch container. To support
    // reordering before tiles are initialized, make sure the batch container is
    // available for reordering.
    if (!this.batchContainer) {
      this._initBatchContainer();
    }

    var newIndex = beforeLayer === null ?
        this.stage.children.length - 1 :
        this.stage.getChildIndex(beforeLayer.batchContainer);
    this.stage.setChildIndex(this.batchContainer, newIndex);
  };

  /**
   * Retrieve blend modes supported by this layer.
   * @return {string[]} Names of supported blend modes.
   */
  PixiLayer.prototype.getAvailableBlendModes = function () {
    var glBlendModes = this._context.renderer.state.blendModes;
    var normBlendFuncs = glBlendModes[PIXI.BLEND_MODES.NORMAL];
    return Object.keys(PIXI.BLEND_MODES)
        .filter(function (modeKey) { // Filter modes that are not different from normal.
          var glBlendFuncs = glBlendModes[PIXI.BLEND_MODES[modeKey]];
          return modeKey == 'NORMAL' ||
              !CATMAID.tools.arraysEqual(glBlendFuncs, normBlendFuncs); })
        .map(function (modeKey) {
          return modeKey.toLowerCase().replace(/_/, ' '); });
  };

  /**
   * Return the current blend mode for this layer.
   * @return {string} Name of the current blend mode.
   */
  PixiLayer.prototype.getBlendMode = function () {
    return this.blendMode;
  };

  /**
   * Set the current blend mode for this layer.
   * @param {string} modeKey Name of the blend mode to use.
   */
  PixiLayer.prototype.setBlendMode = function (modeKey) {
    this.blendMode = modeKey;
    modeKey = modeKey.replace(/ /, '_').toUpperCase();
    this.batchContainer.children.forEach(function (child) {
      child.blendMode = PIXI.BLEND_MODES[modeKey];
    });
    this.syncFilters();
  };

  PixiLayer.prototype._setTextureInterpolationMode = function (texture, pixiInterpolationMode) {
    let renderer = this._context.renderer;
    let gl = renderer.gl;
    const glScaleMode = pixiInterpolationMode === PIXI.SCALE_MODES.LINEAR ?
        gl.LINEAR : gl.NEAREST;

    if (texture && texture.valid) {
      texture.baseTexture.scaleMode = pixiInterpolationMode;

      let glTexture = texture.baseTexture._glTextures[renderer.CONTEXT_UID];

      if (glTexture) {
        texture.baseTexture._glTextures[renderer.CONTEXT_UID].bind();

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glScaleMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glScaleMode);
      }
    }
  };

  /**
   * Retrieve filters supported by this layer.
   * @return {Object.<string,function>} A map of filter names to constructors.
   */
  PixiLayer.prototype.getAvailableFilters = function () {
    // PIXI Canvas renderer does not currently support filters.
    if (this.renderer instanceof PIXI.CanvasRenderer) return {};

    return {
      'Gaussian Blur': PixiLayer.FilterWrapper.bind(null, 'Gaussian Blur', PIXI.filters.BlurFilter, [
        {displayName: 'Width (px)', name: 'blurX', type: 'slider', range: [0, 32]},
        {displayName: 'Height (px)', name: 'blurY', type: 'slider', range: [0, 32]}
      ], this),
      'Invert': PixiLayer.FilterWrapper.bind(null, 'Invert', PixiLayer.Filters.Invert, [
        {displayName: 'Strength', name: 'strength', type: 'slider', range: [0, 1]}
      ], this),
      'Brightness, Contrast & Saturation': PixiLayer.FilterWrapper.bind(null, 'Brightness, Contrast & Saturation', PixiLayer.Filters.BrightnessContrastSaturationFilter, [
        {displayName: 'Brightness', name: 'brightness', type: 'slider', range: [0, 3]},
        {displayName: 'Contrast', name: 'contrast', type: 'slider', range: [0, 3]},
        {displayName: 'Saturation', name: 'saturation', type: 'slider', range: [0, 3]}
      ], this),
      'Color Transform': PixiLayer.FilterWrapper.bind(null, 'Color Transform', PIXI.filters.ColorMatrixFilter, [
        {displayName: 'RGBA Matrix', name: 'matrix', type: 'matrix', size: [4, 5]}
      ], this),
      'Intensity Thresholded Transparency': PixiLayer.FilterWrapper.bind(null, 'Intensity Thresholded Transparency', PixiLayer.Filters.IntensityThresholdTransparencyFilter, [
        {displayName: 'Intensity Threshold', name: 'intensityThreshold', type: 'slider', range: [0, 1]},
        {displayName: 'Luminance Coefficients', name: 'luminanceCoeff', type: 'matrix', size: [1, 3]}
      ], this),
      'Randomised Label Color Map': PixiLayer.FilterWrapper.bind(null, 'Randomised Label Color Map', PixiLayer.Filters.RandomisedLabelColorMap, [
        {displayName: 'Map Seed', name: 'seed', type: 'slider', range: [0, 1]},
      ], this),
      'Object Label Color Map': PixiLayer.FilterWrapper.bind(null, 'Object Label Color Map', PixiLayer.Filters.ObjectLabelColorMap, [
        {displayName: "'Unknown' label", name: 'unknownLabel', type: 'integerLabel'},
        {displayName: "'Unknown' color", name: 'unknownColor', type: 'color'},
        {displayName: "'Background' label", name: 'backgroundLabel', type: 'integerLabel'},
        {displayName: "'Background' color", name: 'backgroundColor', type: 'color'},
        {displayName: "'Foreground' alpha", name: 'foregroundAlpha', type: 'slider', range: [0, 1]},
        {displayName: 'Map Seed', name: 'seed', type: 'slider', range: [0, 1]},
      ], this),
    };
  };

  /**
   * Retrieve the set of active filters for this layer.
   * @return {Array} The collection of active filter objects.
   */
  PixiLayer.prototype.getFilters = function () {
    return this.filters;
  };

  /**
   * Update filters in the renderer to match filters set for the layer.
   */
  PixiLayer.prototype.syncFilters = function () {
    if (this.filters.length > 0) {
      var modeKey = this.blendMode.replace(/ /, '_').toUpperCase();
      var filters = this.filters.map(function (f) {
        f.pixiFilter.blendMode = PIXI.BLEND_MODES[modeKey];
        return f.pixiFilter;
      });
      // This is a currently needed work-around for issue #1598 in Pixi.js
      if (1 === this.filters.length) {
        var noopFilter = new PIXI.filters.ColorMatrixFilter();
        noopFilter.blendMode = PIXI.BLEND_MODES[modeKey];
        filters.push(noopFilter);
      }
      this.batchContainer.filters = filters;
    } else {
      this.batchContainer.filters = null;
    }
  };

  /**
   * Add a filter to the set of active filters for this layer.
   * @param {Object} filter The filter object to add.
   */
  PixiLayer.prototype.addFilter = function (filter) {
    this.filters.push(filter);
    this.syncFilters();
  };

  /**
   * Remove a filter from the set of active filters for this layer.
   * @param  {Object} filter The filter object to remove.
   */
  PixiLayer.prototype.removeFilter = function (filter) {
    var index = this.filters.indexOf(filter);
    if (index === -1) return;
    this.filters.splice(index, 1);
    this.syncFilters();
  };

  /**
   * Change the rendering order for a filter of this layer.
   * @param  {number} currIndex Current index of the filter to move.
   * @param  {number} newIndex  New insertion index of the filter to move.
   */
  PixiLayer.prototype.moveFilter = function (currIndex, newIndex) {
    this.filters.splice(newIndex, 0, this.filters.splice(currIndex, 1)[0]);
    this.syncFilters();
  };

  /**
   * A wrapper for PixiJS WebGL filters to provide the control and UI for use as
   * a layer filter.
   * @constructor
   * @param {string} displayName      Display name of this filter in interfaces.
   * @param {function(new:PIXI.Filter)} pixiConstructor
   *                                  Constructor for the underlying Pixi filter.
   * @param {Array}   params               Parameters to display in control UI and
   *                                  their mapping to Pixi properties.
   * @param {CATMAID.TileLayer} layer The layer to which this filter belongs.
   */
  PixiLayer.FilterWrapper = function (displayName, pixiConstructor, params, layer) {
    this.displayName = displayName;
    this.pixiFilter = new pixiConstructor();
    this.params = params;
    this.layer = layer;
  };

  PixiLayer.FilterWrapper.prototype = {};
  PixiLayer.FilterWrapper.prototype.constructor = PixiLayer.FilterWrapper;

  /**
   * Set a filter parameter.
   * @param {string} key   Name of the parameter to set.
   * @param {Object} value New value for the parameter.
   */
  PixiLayer.FilterWrapper.prototype.setParam = function (key, value) {
    this.pixiFilter[key] = value;
    if (this.layer) this.layer.redraw();
  };

  /**
   * Draw control UI for the filter and its parameters.
   * @param  {JQuery}   container Element where the UI will be inserted.
   * @param  {Function} callback  Callback when parameters are changed.
   */
  PixiLayer.FilterWrapper.prototype.redrawControl = function (container, callback) {
    var self = this;
    container.append('<h5>' + this.displayName + '</h5>');
    for (var paramIndex = 0; paramIndex < this.params.length; paramIndex++) {
      var param = this.params[paramIndex];

      switch (param.type) {
        case 'slider':
          var slider = new CATMAID.Slider(
              CATMAID.Slider.HORIZONTAL,
              true,
              param.range[0],
              param.range[1],
              201,
              this.pixiFilter[param.name],
              this.setParam.bind(this, param.name));
          var paramSelect = $('<div class="setting"/>');
          paramSelect.append('<span>' + param.displayName + '</span>');
          paramSelect.append(slider.getView());
          // TODO: fix element style. Slider should use CSS.
          var inputView = $(slider.getInputView());
          inputView.css('display', 'inline-block').css('margin', '0 0.5em');
          inputView.children('img').css('vertical-align', 'middle');
          paramSelect.append(inputView);
          container.append(paramSelect);
          break;

        case 'matrix':
          var mat = this.pixiFilter[param.name];
          var matTable = $('<table />');
          var setParam = this.setParam.bind(this, param.name);
          var setMatrix = function () {
            var newMat = [];
            var inputInd = 0;
            matTable.find('input').each(function () {
              newMat[inputInd++] = $(this).val();
            });
            setParam(newMat);
          };

          for (var i = 0; i < param.size[0]; ++i) {
            var row = $('<tr/>');
            for (var j = 0; j < param.size[1]; ++j) {
              var ind = i*param.size[1] + j;
              var cell = $('<input type="number" step="0.1" value="' + mat[ind] + '"/>');
              cell.change(setMatrix);
              cell.css('width', '4em');
              row.append($('<td/>').append(cell));
            }
            matTable.append(row);
          }

          var paramSelect = $('<div class="setting"/>');
          paramSelect.append('<span>' + param.displayName + '</span>');
          paramSelect.append(matTable);
          container.append(paramSelect);
          break;

        case 'integerLabel':
          var numberDiv = document.createElement('div');
          numberDiv.classList.add('setting');
          var label = document.createElement('span');
          label.innerText = param.displayName;
          numberDiv.appendChild(label);
          var numberInput = document.createElement('input');
          numberInput.type = 'number';
          numberInput.min = '0';
          numberInput.max = '16777215';
          numberInput.step = '1';
          numberInput.value = PixiLayer.Filters.arr2int(this.pixiFilter[param.name]);
          (function(setParam, numberInput) {
            numberInput.onchange = function() {
              setParam(PixiLayer.Filters.int2arr(Number(this.value)));
            };
          })(self.setParam.bind(self, param.name), numberInput);
          numberDiv.appendChild(numberInput);
          container.append(numberDiv);
          break;

        case 'color':
          var colorDiv = document.createElement('div');
          colorDiv.classList.add('setting');
          var colorLabel = document.createElement('span');
          colorLabel.innerText = param.displayName;
          colorDiv.appendChild(colorLabel);
          var colorButton = document.createElement('button');
          colorButton.innerText = 'Select Color';
          var initCol = this.pixiFilter[param.name].slice();
          initCol[0] = initCol[0] / initCol[3];
          initCol[1] = initCol[1] / initCol[3];
          initCol[2] = initCol[2] / initCol[3];
          (function(setParam, colorButton, initCol){
            CATMAID.ColorPicker.enable(colorButton, {
              initialColor: CATMAID.tools.rgbToHex(Math.round(initCol[0] * 255),
                                                 Math.round(initCol[1] * 255),
                                                 Math.round(initCol[2] * 255)),
              onColorChange: (function(rgb, alpha, colorChanged, alphaChanged) {
                if (colorChanged || alphaChanged) {
                  setParam([rgb.r*alpha, rgb.g*alpha, rgb.b*alpha, alpha]);
                }
              }).bind(this)
            });
          })(self.setParam.bind(self, param.name), colorButton, initCol);
          colorDiv.appendChild(colorButton);
          container.append(colorDiv);

          break;
      }
    }
  };

  /**
   * Custom Pixi/WebGL filters.
   */
  PixiLayer.Filters = {};

  /**
   * A simple intensity inversion filter.
   * @constructor
   */
  PixiLayer.Filters.Invert = function () {
    PIXI.filters.ColorMatrixFilter.call(this);

    this._strength = 1.0;

    this.updateMatrix();
  };

  PixiLayer.Filters.Invert.prototype = Object.create(PIXI.filters.ColorMatrixFilter.prototype);
  PixiLayer.Filters.Invert.prototype.constructor = PixiLayer.Filters.Invert;

  PixiLayer.Filters.Invert.prototype.updateMatrix = function () {
    var s = -this._strength;

    this.uniforms.m = [
      s, 0, 0, 0, 1,
      0, s, 0, 0, 1,
      0, 0, s, 0, 1,
      0, 0, 0, 1, 0];
  };

  Object.defineProperty(PixiLayer.Filters.Invert.prototype, 'strength', {
    get: function () {
      return this._strength;
    },
    set: function (value) {
      this._strength = value;
      this.updateMatrix();
    }
  });

  /**
   * This filter allows basic linear brightness, contrast and saturation
   * adjustments in RGB space.
   * @constructor
   */
  PixiLayer.Filters.BrightnessContrastSaturationFilter = function () {

    var uniforms = {
      brightness: {type: '1f', value: 1},
      contrast: {type: '1f', value: 1},
      saturation: {type: '1f', value: 1}
    };

    var fragmentSrc =
        'precision mediump float;' +
        'uniform float brightness;' +
        'uniform float contrast;' +
        'uniform float saturation;' +

        'varying vec2 vTextureCoord;' +
        'uniform sampler2D uSampler;' +

        'const vec3 luminanceCoeff = vec3(0.2125, 0.7154, 0.0721);' +
        'const vec3 noContrast = vec3(0.5, 0.5, 0.5);' +

        'void main(void) {' +
          'vec4 frag = texture2D(uSampler, vTextureCoord);' +
          'vec3 color = frag.rgb;' +

          'color = color * brightness;' +
          'float intensityMag = dot(color, luminanceCoeff);' +
          'vec3 intensity = vec3(intensityMag, intensityMag, intensityMag);' +
          'color = mix(intensity, color, saturation);' +
          'color = mix(noContrast, color, contrast);' +

          'frag.rgb = color;' +
          'gl_FragColor = frag;' +
        '}';

    PIXI.Filter.call(this, null, fragmentSrc, uniforms);
  };

  PixiLayer.Filters.BrightnessContrastSaturationFilter.prototype = Object.create(PIXI.Filter.prototype);
  PixiLayer.Filters.BrightnessContrastSaturationFilter.prototype.constructor = PixiLayer.Filters.BrightnessContrastSaturationFilter;

  ['brightness', 'contrast', 'saturation'].forEach(function (prop) {
    Object.defineProperty(PixiLayer.Filters.BrightnessContrastSaturationFilter.prototype, prop, {
      get: function () {
        return this.uniforms[prop];
      },
      set: function (value) {
        this.uniforms[prop] = value;
      }
    });
  });

  /**
   * This filter makes pixels transparent according to an intensity threshold.
   * The luminance projection used to determine intensity is configurable.
   * @constructor
   */
  PixiLayer.Filters.IntensityThresholdTransparencyFilter = function () {

    var uniforms = {
      luminanceCoeff: {type: '3fv', value: [0.2125, 0.7154, 0.0721]},
      intensityThreshold: {type: '1f', value: 0.01}
    };

    var fragmentSrc =
        'precision mediump float;' +
        'uniform vec3 luminanceCoeff;' +
        'uniform float intensityThreshold;' +

        'varying vec2 vTextureCoord;' +
        'uniform sampler2D uSampler;' +

        'void main(void) {' +
        '  vec4 frag = texture2D(uSampler, vTextureCoord);' +
        '  vec3 color = frag.rgb;' +
        '  float intensityMag = dot(color, luminanceCoeff);' +

        '  frag.a = min(step(intensityThreshold, intensityMag), frag.a);' +
        '  frag.rgb = frag.rgb * frag.a;' + // Use premultiplied RGB
        '  gl_FragColor = frag;' +
        '}';

    PIXI.Filter.call(this, null, fragmentSrc, uniforms);
  };

  PixiLayer.Filters.IntensityThresholdTransparencyFilter.prototype = Object.create(PIXI.Filter.prototype);
  PixiLayer.Filters.IntensityThresholdTransparencyFilter.prototype.constructor = PixiLayer.Filters.IntensityThresholdTransparencyFilter;

  ['luminanceCoeff', 'intensityThreshold'].forEach(function (prop) {
    Object.defineProperty(PixiLayer.Filters.IntensityThresholdTransparencyFilter.prototype, prop, {
      get: function () {
        return this.uniforms[prop];
      },
      set: function (value) {
        this.uniforms[prop] = value;
      }
    });
  });

  /**
   * This filter maps label image pixels to a false coloring. Because of Pixi's
   * textue handling, etc., this is very lossy to distinguishing similar label
   * values.
   * @constructor
   */
  PixiLayer.Filters.RandomisedLabelColorMap = function () {

    var uniforms = {
      seed: {type: '1f', value: 1.0},
      containerAlpha: {type: '1f', value: 1.0}
    };

    var fragmentSrc =
        'precision highp float;' +
        'uniform float seed;' +
        'uniform float containerAlpha;' +

        'vec3 hash_to_color(vec4 label) {' +
        '  const float SCALE = 33452.5859;' + // Some large constant to make the truncation interesting.
        '  label = fract(label * SCALE);' + // Truncate some information.
        '  label += dot(label, label.wzyx + 100.0 * seed);' + // Mix channels and add the salt.
        '  return fract((label.xzy + label.ywz) * label.zyw);' + // Downmix to three channels and truncate to a color.
        '}' +

        'varying vec2 vTextureCoord;' +
        'uniform sampler2D uSampler;' +

        'void main(void) {' +
        '  vec4 frag = texture2D(uSampler, vTextureCoord);' +
        '  vec3 color = frag.rgb;' +

        '  frag.rgb = hash_to_color(frag.rgba) * containerAlpha;' +
        '  frag.a = containerAlpha;' +
        '  gl_FragColor = frag;' +
        '}';

    PIXI.Filter.call(this, null, fragmentSrc, uniforms);
  };

  PixiLayer.Filters.RandomisedLabelColorMap.prototype = Object.create(PIXI.Filter.prototype);
  PixiLayer.Filters.RandomisedLabelColorMap.prototype.constructor = PixiLayer.Filters.RandomisedLabelColorMap;

  ['seed', 'containerAlpha'].forEach(function (prop) {
    Object.defineProperty(PixiLayer.Filters.RandomisedLabelColorMap.prototype, prop, {
      get: function () {
        return this.uniforms[prop];
      },
      set: function (value) {
        this.uniforms[prop] = value;
      }
    });
  });

  /**
   * Treating `num` as if it were a 24-bit unsigned integer, pack it into a 3-length array of numbers between 0 and
   * 1, each carrying 8 bits of information, with the least significant number first. 1 is appended to the end of
   * the array, giving it a final length of 4.
   *
   * This allows us to pass a 24-bit integer label into webGL for comparison to that same label packed into a PNG by
   * PIL. The alpha (4th) channel must be 1 because the other values are premultiplied by it; disabling
   * sprite.texture.baseTexture.premultipliedAlpha messes with webGL's blend modes.
   *
   * e.g.
   * 1 => [1/255, 0, 0, 1]
   * 257 => [1/255, 1/255, 0, 1]
   * 300 => [44/255, 1/255, 0, 1]
   *
   * @param num
   * @returns {Array.<*>}
   */
  PixiLayer.Filters.int2arr = function(num) {
    var arr = [];
    var divisor;
    var remainder = num;
    for (var i = 2; i >= 0; i--) {
      divisor = 1 << 8*i;
      arr.push(Math.floor(remainder/divisor)/255);
      remainder = remainder % divisor;
    }

    arr.reverse().push(1);
    return arr;
  };

  PixiLayer.Filters.arr2int = function(arr) {
    var out = 0;
    for (var i = 0; i < arr.length-1; i++) {
      out += Math.floor(arr[i]*255) * Math.pow(256, i);
    }
    return out;
  };

  /**
   * This filter reserves two special labels, 'unknown' and 'background', with user-defined Colors, and then
   * selects random Colors (seeded on the label) for all other pixel values.
   *
   * It expects labels to be 32-bit unsigned integers packed into 4x8bit unsigned integers, whose first byte is the
   * least significant. See the int2arr function for packing numbers in this way.
   *
   * @constructor
   */
  PixiLayer.Filters.ObjectLabelColorMap = function () {
    var uniforms = {
      unknownLabel: {type: '4f', value: [-1, -1, -1, -1]},
      backgroundLabel: {type: '4f', value: [-1, -1, -1, -1]},
      unknownColor: {type: '4f', value: [0.2, 0.0, 0.0, 0.2]},
      backgroundColor: {type: '4f', value: [0.0, 0.0, 0.0, 0.0]},
      foregroundAlpha: {type: 'f', value: 0.5},
      seed: {type: 'f', value: 0.5}
    };

    var fragmentSrc = `
      uniform vec4 unknownLabel;
      uniform vec4 unknownColor;

      uniform vec4 backgroundLabel;
      uniform vec4 backgroundColor;

      uniform float foregroundAlpha;
      uniform float seed;

      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;

      float whenEq(vec4 x, vec4 y) {
          return 1.0 - sign(distance(x, y));
      }

      vec4 hashToColor(vec4 label) {
          const float SCALE = 33452.5859; // Some large constant to make the truncation interesting.
          label = fract(label * SCALE); // Truncate some information.
          label += dot(label, label.wzyx + 100.0 * seed); // Mix channels and add the salt.
          return vec4(fract((label.xzy + label.ywz) * label.zyw), 1.0) * foregroundAlpha;
      }

      void main(void){
          vec4 current = texture2D(uSampler, vTextureCoord);

          float isUnknown = whenEq(current, unknownLabel);
          float isBackground = whenEq(current, backgroundLabel);

          vec4 final = unknownColor * isUnknown;
          final += backgroundColor * isBackground;
          final += hashToColor(current) * (1.0 - min(isUnknown + isBackground, 1.0));

          gl_FragColor.rgba = final;
      }
    `;

    PIXI.Filter.call(this, null, fragmentSrc, uniforms);
  };

  PixiLayer.Filters.ObjectLabelColorMap.prototype = Object.create(PIXI.Filter.prototype);
  PixiLayer.Filters.ObjectLabelColorMap.prototype.constructor = PixiLayer.Filters.ObjectLabelColorMap;

  ['unknownLabel', 'unknownColor', 'backgroundLabel', 'backgroundColor', 'foregroundAlpha', 'seed'].forEach(function (prop) {
    Object.defineProperty(PixiLayer.Filters.ObjectLabelColorMap.prototype, prop, {
      get: function () {
        return this.uniforms[prop];
      },
      set: function (value) {
        this.uniforms[prop] = value;
      }
    });
  });

  CATMAID.PixiLayer = PixiLayer;

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED,
      function (project) {
        project.on(CATMAID.Project.EVENT_STACKVIEW_CLOSED,
            function (stackViewer) {
              var context = PixiLayer.contexts.get(stackViewer);
              if (context) {
                context.renderer.destroy();
                PixiLayer.contexts.delete(stackViewer);
              }
            });
      });

})(CATMAID);
