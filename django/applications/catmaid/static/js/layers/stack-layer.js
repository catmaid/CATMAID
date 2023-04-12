(function(CATMAID) {

  "use strict";

  /**
   * Base class for layers that display an image stack.
   * @constructor
   * @param {StackViewer} stackViewer Stack viewer to which this layer belongs.
   * @param {string}  displayName  Name displayed in window controls.
   * @param {Stack}   stack        Image stack to display.
   * @param {number}  mirrorId     Stack mirror ID to use as source. If
   *                               undefined, the fist available mirror is used.
   * @param {boolean} visibility   Whether the stack layer is initially visible.
   * @param {number}  opacity      Opacity to draw the layer.
   * @param {boolean} showOverview Whether to show a "minimap" overview of the
   *                               stack.
   * @param {string} interpolationMode Interpolation mode for image data.
   * @param {boolean} readState    Whether last used mirror and custom mirrors
   *                               should be read from a browser cookie.
   * @param {boolean} changeMirrorIfNoData Whether to automatically switch to
   *                               the next accessible mirror if the present one
   *                               in inaccessible. (Default: true)
   */
  function StackLayer(
      stackViewer,
      displayName,
      stack,
      mirrorId,
      visibility,
      opacity,
      showOverview,
      interpolatonMode,
      readState,
      changeMirrorIfNoData) {

    this.stackViewer = stackViewer;
    this.displayName = displayName;
    this.stack = stack;
    this.opacity = opacity; // in the range [0,1]
    this.showOverview = showOverview;
    this.visible = visibility;
    this.isOrderable = true;
    this.isHideable = false;
    this.lastMirrorStorageName = 'catmaid-last-mirror-' +
        project.id + '-' + stack.id;
    this.customMirrorStorageName = 'catmaid-custom-mirror-' +
        project.id + '-' + stack.id;

    if (readState) {
      var serializedCustomMirrorData = readStateItem(this.customMirrorStorageName);
      if (serializedCustomMirrorData) {
        var customMirrorData = JSON.parse(serializedCustomMirrorData);
        stack.addMirror(customMirrorData);
      }

      // If no mirror index is given, try to read the last used value from a
      // cookie. If this is unavailable, use the first mirror as default.
      if (undefined === mirrorId) {
        var lastUsedMirror = readStateItem(this.lastMirrorStorageName);
        if (lastUsedMirror) {
          mirrorId = parseInt(lastUsedMirror, 10);

          if (!(mirrorId in this.stack.mirrors)) {
            CATMAID.removeLocalStorageItem(this.lastMirrorStorageName);
            mirrorId = undefined;
          }
        }
      }
    }
    this._readState = readState;

    this.mirrorId = mirrorId || this.stack.mirrorsByPriority()[0].id;
    this.tileSource = stack.createTileSourceForMirror(this.mirrorId);

    /* Whether mirros should be changed automatically if image data is
     * unavailable.
     */
    this.changeMirrorIfNoData = CATMAID.tools.getDefined(changeMirrorIfNoData, true);

    /**
     * Whether to hide this tile layer if the nearest section is marked as
     * broken, rather than the default behavior of displaying the nearest
     * non-broken section.
     * @type {Boolean}
     */
    this.hideIfNearestSliceBroken = CATMAID.StackLayer.Settings.session ?
        CATMAID.StackLayer.Settings.session.hide_if_nearest_section_broken : false;


    /**
     * True to use linear tile texture interpolation, false to use nearest
     * neighbor.
     * @type {boolean}
     */
    this._interpolationMode = interpolatonMode;

    this._translation = 0;

    this.tileSource.checkCanary(project, this.stack)
        .then(this._handleCanaryCheck.bind(this));
  }

  var readStateItem = function(key) {
    var item = CATMAID.getLocalStorageItem(key);
    if (!item) {
      // Try to find information in local storage without a suffix. If the item
      // is found, it is copied to the local storage with suffix and the
      // unnamespaced version is removed. This test can be removed in future
      // versions and is only meant to not surprise users with lost defaults and
      // stale local storage information.
      item = CATMAID.getLocalStorageItem(key, true);
      if (item) {
        // Remove old local storage entry
        CATMAID.removeLocalStorageItem(key, true);
        // Add new entry
        CATMAID.setLocalStorageItem(key, item);
      }
    }
    return item;
  };

  /**
   * Return a string that represents the data source for this stack layer.
   */
  StackLayer.prototype.getSourceSpec = function() {
    return `stacklayer-${this.stack.id}`;
  };

  StackLayer.prototype.applySettings = function(settings) {
    for (let key in settings) {
      // Opacity and space bar hiding is handled separately
      if (key === 'opacity') {
        this.opacity = settings[key];
      } else if (key === 'isHideable') {
        this.isHideable = settings[key];
      } else if (key !== 'blendMode' && key !== 'layerFilters') {
        // Blending and shading is also handled separately below after all other settings have been applied.
        this.setLayerSetting(key, settings[key]);
      }
    }
    // Handle blend mode and filters
    if (this.getAvailableBlendModes) {
      for (let key in settings) {
        if (key === 'blendMode') {
          this.blendMode = settings[key];
        } else if (key === 'layerFilters') {
          // Remove all filters first
          if (this.filters) this.filters.length = 0;
          else this.filters = [];
          // Add all stored filters
          for (let f of settings[key]) {
            let availableFilters = this.getAvailableFilters();
            if (availableFilters && availableFilters[f.name]) {
              let filter = new (availableFilters[f.name])();
              if (f.params) {
                for (let p of f.params) {
                  filter.pixiFilter[p.name] = p.value;
                }
              }
              this.filters.push(filter);
            }
          }
        }
      }
    }
  };

  /**
   * Handle a canary tile check for the tile source mirror.
   *
   * If the mirror is not accessible, switch to the first accessible mirror
   * (ordered by mirror preference position). Otherwise, warn that no
   * accessible mirror is available.
   *
   * @param  {Object} accessible Check result with normal and cors booleans.
   */
  StackLayer.prototype._handleCanaryCheck = function (accessible) {
    if (!accessible.normal && this.changeMirrorIfNoData) {
      Promise
          .all(Object.values(this.stack.mirrors).map(function (mirror) {
            return this.stack.createTileSourceForMirror(mirror.id).checkCanary(
                project,
                this.stack)
              .then(access => [mirror.id, access]);
          }, this))
          .then((function (mirrorAccessible) {
            var mirrorEntry = mirrorAccessible.find(entry => entry[1].normal);
            if (mirrorEntry) {
              let mirror = this.stack.mirrors[mirrorEntry[0]];
              var oldMirrorTitle = this.stack.mirrors[this.mirrorId].title;
              var newMirrorTitle = mirror.title;
              CATMAID.warn('Stack mirror "' + oldMirrorTitle + '" is inaccessible. ' +
                           'Switching to mirror "' + newMirrorTitle + '".');
              this.switchToMirror(mirror.id);
            } else {
              CATMAID.warn('No mirrors for this stack are accessible. Image data may not load.');
            }
          }).bind(this));
    }
  };

  /**
   * Sets the interpolation mode for tile textures to linear pixel interpolation
   * nearest neighbor, or to inherit from the global settings.
   * @param {string}    mode    Values from StackLayer.INTERPOLATION_MODE.
   */
  StackLayer.prototype.setInterpolationMode = function (mode) {
    this._interpolationMode = mode;
  };

  StackLayer.prototype.setTranslation = function (translation) {
    this._translation = Number(translation);
  };

  StackLayer.prototype.getTranslation = function () {
    return this._translation;
  };

  /**
   * Refresh the currently set interpolation mode to account for any changes
   * in global settings.
   */
  StackLayer.prototype.refreshInterpolationMode = function () {
    this.setInterpolationMode(this._interpolationMode);
  };

  /**
   * Return the effective interpolation mode for this layer.
   * @return {string}
   */
  StackLayer.prototype.getEffectiveInterpolationMode = function () {
    return (this._interpolationMode === CATMAID.StackLayer.INTERPOLATION_MODES.INHERIT) ?
        (CATMAID.StackLayer.Settings.session.linear_interpolation ?
            CATMAID.StackLayer.INTERPOLATION_MODES.LINEAR :
            CATMAID.StackLayer.INTERPOLATION_MODES.NEAREST) :
        this._interpolationMode;
  };

  /**
   * Return friendly name of this layer.
   */
  StackLayer.prototype.getLayerName = function () {
    return this.displayName;
  };

  /**
   * Remove any DOM created by this layer from the stack viewer.
   */
  StackLayer.prototype.unregister = function () {
    throw new CATMAID.NotImplementedError();
  };

  /**
   * Update and draw the stack based on the current position and scale.
   */
  StackLayer.prototype.redraw = function (completionCallback, blocking) {
    throw new CATMAID.NotImplementedError();
  };

  /**
   * Resize (if necessary) the layer to cover a view of a specified size.
   * @param  {number} width  Width of the view in pixels.
   * @param  {number} height Height of the view in pixels.
   */
  StackLayer.prototype.resize = function (width, height, completionCallback, blocking) {
    throw new CATMAID.NotImplementedError();
  };

  /**
   * Loads stack image data or views centered at specified project locations,
   * but does not display them, so that they are cached for future viewing.
   * @param  {number[][]}               locations        an array of project
   *                                                     coords like:
   *                                                     [x, y, z]
   * @param  {function(number, number)} progressCallback
   */
  StackLayer.prototype.cacheLocations = function (locations, progressCallback) {
    throw new CATMAID.NotImplementedError();
  };

  /**
   * Show a dialog that give a user the option to configure a custom mirror.
   */
  StackLayer.prototype.addCustomMirror = function () {
    // Get some default values from the current tile source
    var mirror = this.stack.mirrors[this.mirrorId];
    var dialog = new CATMAID.OptionsDialog('Add custom mirror');
    dialog.appendMessage("Please specify at least a URL for the custom mirror");
    var url = dialog.appendField("URL", "customMirrorURL", "", false);
    var title = dialog.appendField("Title", "customMirrorTitle", "Custom mirror", false);
    var ext = dialog.appendField("File extension", "customMirrorExt",
        mirror.file_extension, false);
    var tileWidth = dialog.appendField("Tile width", "customMirrorTileWidth",
        mirror.tile_width, false);
    var tileHeight = dialog.appendField("Tile height", "customMirrorTileHeight",
        mirror.tile_height, false);
    var tileSrcType = dialog.appendField("Tile source type",
        "customMirrorTileSrcType", mirror.tile_source_type, false);
    var changeMirrorIfNoDataCb = dialog.appendCheckbox("Change mirror on inaccessible data",
        "change-mirror-if-no-data", false, "If this is selected, a different mirror is " +
        "selected automatically, if the custom mirror is unreachable");

    var messageContainer = dialog.appendHTML("Depending of the configuration " +
      "this mirror, you maybe have to add a SSL certificate exception. To do this, " +
      "click <a href=\"#\">here</a> after the information above is complete. " +
      "A new page will open, displaying either an image or a SSL warning. In " +
      "case of the warning, add a security exception for this (and only this) " +
      "certificate. Only after having this done and the link shows an image, " +
      "click OK below.");

    var getMirrorData = function() {
      var imageBase = url.value;
      if (!imageBase.endsWith('/')) {
        imageBase = imageBase + '/';
      }
      return {
        id: "custom-" + CATMAID.tools.uniqueId(),
        title: title.value,
        position: -1,
        image_base: imageBase,
        file_extension: ext.value,
        tile_width: parseInt(tileWidth.value, 10),
        tile_height: parseInt(tileHeight.value, 10),
        tile_source_type: parseInt(tileSrcType.value, 10)
      };
    };

    var openCanaryLink = messageContainer.querySelector('a');
    var stack = this.stack;
    openCanaryLink.onclick = function() {
      var customMirrorData = getMirrorData();
      var tileSource = CATMAID.TileSources.get(
          customMirrorData.id,
          customMirrorData.tile_source_type,
          customMirrorData.image_base,
          customMirrorData.file_extension,
          customMirrorData.tile_width,
          customMirrorData.tile_height);
      var url = tileSource.getCanaryUrl(project, stack);
      // Open a new browser window with a canary tile
      window.open(url);
    };

    var self = this;
    dialog.onOK = function() {
      self.changeMirrorIfNoData = changeMirrorIfNoDataCb.checked;
      var customMirrorData = getMirrorData();
      self.stack.addMirror(customMirrorData);
      self.switchToMirror(customMirrorData.id);
      CATMAID.setLocalStorageItem(self.customMirrorStorageName,
          JSON.stringify(customMirrorData));

      // Update layer control UI to reflect settings changes.
      if (self.stackViewer && self.stackViewer.layerControl) {
        self.layerControl.refresh();
      }
    };

    dialog.show(500, 'auto');
  };

  StackLayer.prototype.clearCustomMirrors = function () {
    var customMirrorIds = Object.keys(this.stack.mirrors)
      .filter(mid => mid.startsWith('custom'));
    var customMirrorUsed = customMirrorIds.indexOf(this.mirrorId) != -1;
    if (customMirrorUsed) {
      CATMAID.warn("Please select another mirror first");
      return;
    }
    customMirrorIds.sort().reverse().forEach(function(ci) {
      this.stack.removeMirror(ci);
    }, this);
    CATMAID.removeLocalStorageItem(this.customMirrorStorageName);
    this.switchToMirror(this.mirrorId, true);

    CATMAID.msg("Done", "Custom mirrors cleared");
  };

  /**
   * Returns a map of settings for this layer by group. This will only contain
   * anything if the tile layer's tile source provides additional settings.
   */
  StackLayer.prototype.getLayerSettings = function () {
    let settings = new Map();

    settings.set('Stack', [{
        name: 'hideIfBroken',
        displayName: 'Hide if nearest slice is broken',
        type: 'checkbox',
        value: this.hideIfNearestSliceBroken,
        help: 'Hide this tile layer if the nearest section is marked as ' +
              'broken, rather than the default behavior of displaying the ' +
              'nearest non-broken section.'
    },{
      name: 'stackInfo',
      displayName: 'Stack info',
      type: 'buttons',
      buttons: [
        {
          name: 'Open',
          onclick: (function () {WindowMaker.create('stack-info', this.stack.id);}).bind(this)
        }]
    },{
      name: 'interpolationMode',
      displayName: 'Interpolation',
      type: 'select',
      value: this._interpolationMode,
      options: Object.values(CATMAID.StackLayer.INTERPOLATION_MODES).map(mode => [mode, mode]),
    }, {
      name: 'translation',
      displayName: 'Z offset',
      type: 'number',
      step: 1,
      value: this._translation,
      help: 'A virtul Z offset for this stack in stack space coordinates'
    }]);

    settings.set('Mirrors', [{
        name: 'changeMirrorIfNoData',
        displayName: 'Change mirror on inaccessible data',
        type: 'checkbox',
        value: this.changeMirrorIfNoData,
        help: 'Automatically switch to the next accessible mirror if ' +
              'the current mirror is inaccessible. This is usually recomended ' +
              'except for some use cases involving custom mirrors.'
    },{
      name: 'mirrorSelection',
      displayName: 'Stack mirror',
      type: 'select',
      value: this.mirrorId,
      options: Object.values(this.stack.mirrors).map(function (mirror) {
        return [mirror.id, mirror.title];
      }),
      help: 'Select from which image host to request image data for this stack.'
    },{
      name: 'customMirrors',
      displayName: 'Custom mirrors',
      type: 'buttons',
      buttons: [
        {
          name: 'Add',
          onclick: this.addCustomMirror.bind(this)
        },
        {
          name: 'Clear',
          onclick: this.clearCustomMirrors.bind(this)
        }]
    }]);

    if (this.stack.isReorientable()) {
      let otherOrientations = CATMAID.Stack.ORIENTATIONS.filter(o => o !== this.stack.orientation);
      let stackSettings = settings.get('Stack');
      stackSettings.splice(stackSettings.findIndex(s => s.name === 'stackInfo') + 1, 0,
          {
            name: 'openReorientation',
            displayName: 'Open orientation',
            type: 'buttons',
            buttons: otherOrientations.map(o => ({
              name: CATMAID.Stack.ORIENTATION_NAMES[o],
              onclick: () => { CATMAID.openProjectStack(
                project.id,
                CATMAID.Stack.encodeReorientedID(this.stack.id, o),
                false,
                this.mirrorId);
              }
            }))
          });
    }

    if (this.tileSource) {
      settings = settings.set('Source', this.tileSource.getSettings());
    }

    return settings;
  };

  /**
   * Set a layer setting for this layer. The value will only have any effect if
   * the layer's tile source accepts setting changes.
   */
  StackLayer.prototype.setLayerSetting = function(name, value, redraw = true) {
    if ('hideIfBroken' === name) {
      this.hideIfNearestSliceBroken = value;
      if (!this.hideIfNearestSliceBroken) this.setOpacity(this.opacity);
    } else if ('efficiencyThreshold' === name) {
      this.efficiencyThreshold = value;
      if (redraw) this.redraw();
    } else if ('mirrorSelection' === name) {
      this.switchToMirror(value);
    } else if ('changeMirrorIfNoData' === name) {
      this.changeMirrorIfNoData = value;
      // If this was set to true, perform a canary test
      if (this.changeMirrorIfNoData && redraw) {
        this.tileSource.checkCanary(project, this.stack)
            .then(this._handleCanaryCheck.bind(this));
      }
    } else if ('webGL' === name) {
      if (value) {
        if (!(this instanceof CATMAID.PixiStackLayer)) {
          var newStackLayer = this.constructCopy({}, CATMAID.PixiStackLayer);
          var layerKey = this.stackViewer.getLayerKey(this);
          this.stackViewer.replaceStackLayer(layerKey, newStackLayer);
        }
      } else {
        if (this instanceof CATMAID.PixiStackLayer) {
          this.switchToDomStackLayer();
        }
      }
    } else if ('interpolationMode' === name) {
      this.setInterpolationMode(value);
    } else if ('translation' === name) {
      this.setTranslation(value);
    } else if (this.tileSource && CATMAID.tools.isFn(this.tileSource.setSetting)) {
      return this.tileSource.setSetting(name, value);
    }
  };

  /**
   * Get the stack.
   */
  StackLayer.prototype.getStack = function () { return this.stack; };

  /**
   * Get the stack viewer.
   */
  StackLayer.prototype.getStackViewer = function () { return this.stackViewer; };

  /**
   * Get the DOM element view for this layer.
   * @return {Element} View for this layer.
   */
  StackLayer.prototype.getView = function () {
    throw new CATMAID.NotImplementedError();
  };

  /**
   * Create a new stack layer with the same parameters as this stack layer.
   *
   * @param  {Object}    override    Constructor arguments to override.
   * @param  {function=} constructor Optional StackLayer subclass constructor.
   * @return {StackLayer}            Newly constructed StackLayer subclass.
   */
  StackLayer.prototype.constructCopy = function (override, constructor) {
    if (typeof constructor === 'undefined') constructor = this.constructor;
    var args = {
      stackViewer: this.stackViewer,
      displayName: this.displayName,
      stack: this.stack,
      mirrorId: this.mirrorId,
      visibility: this.visibility,
      opacity: this.opacity,
      showOverview: !!this.overviewLayer,
      interpolationMode: this._interpolationMode,
      readState: this._readState,
      changeMirrorIfNoData: this.changeMirrorIfNoData
    };
    $.extend(args, override);
    return new constructor(
        args.stackViewer,
        args.displayName,
        args.stack,
        args.mirrorId,
        args.visibility,
        args.opacity,
        args.showOverview,
        args.interpolationMode,
        args.readState,
        args.changeMirrorIfNoData);
  };

  /**
   * Switch to a mirror by replacing this tile layer in the stack viewer
   * with a new one for the specified mirror index.
   *
   * @param  {number}  mirrorId  ID of a mirror in the stack's mirror array.
   * @param  {boolean} force     If true, the layer will also be refreshed if
   *                             the mirror didn't change.
   */
  StackLayer.prototype.switchToMirror = function (mirrorId, force) {
    if (mirrorId === this.mirrorId && !force) return;
    var newStackLayer = this.constructCopy({mirrorId: mirrorId});
    var layerKey = this.stackViewer.getLayerKey(this);
    this.stackViewer.replaceStackLayer(layerKey, newStackLayer);

    // Store last used mirror information in cookie
    CATMAID.setLocalStorageItem(this.lastMirrorStorageName, mirrorId);
  };

  /**
   * Set opacity in the range from 0 to 1.
   * @param {number} val New opacity.
   */
  StackLayer.prototype.setOpacity = function (val) {
    throw new CATMAID.NotImplementedError();
  };

  /**
   * Get the layer opacity.
   */
  StackLayer.prototype.getOpacity = function () {
    return this.opacity;
  };

  /**
   * Get the pixel value (from the current scale level) at an (unscaled) stack
   * coordinate if it is currently in the field of view.
   *
   * @return {Promise}
   */
  StackLayer.prototype.pixelValueInScaleLevel = function (stackX, stackY, stackZ) {
    throw new CATMAID.NotImplementedError();
  };

  StackLayer.INTERPOLATION_MODES = {
    NEAREST: 'nearest',
    LINEAR: 'linear',
    INHERIT: 'inherit'
  };

  StackLayer.Settings = new CATMAID.Settings(
      // Note that for legacy compatibility this settings name is still
      // 'tile-layer'.
      'tile-layer',
      {
        version: 0,
        entries: {
          prefer_webgl: {
            default: true
          },
          linear_interpolation: {
            default: true
          },
          hide_if_nearest_section_broken: {
            default: false
          }
        },
        migrations: {}
      });

  StackLayer.preferredConstructorForStack = function (_stack) {
    return CATMAID.StackLayer.Settings.session.prefer_webgl ?
        CATMAID.PixiTileLayer :
        CATMAID.TileLayer;
  };

  CATMAID.StackLayer = StackLayer;

})(CATMAID);
