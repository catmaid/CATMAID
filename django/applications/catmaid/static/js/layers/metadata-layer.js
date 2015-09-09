/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Displays text metadata as a fixed position overlay.
   *
   * @class MetadataLayer
   * @constructor
   */
  function MetadataLayer(
      stackViewer,
      metadata) {
    this.stackViewer = stackViewer;
    this._metadataDisplay = document.createElement('div');
    this._metadataDisplay.className = 'metadata';
    this._metadataDisplay.appendChild(document.createElement('p'));
    this._metadataDisplay.firstChild.appendChild(document.createElement('span'));
    this._metadataDisplay.firstChild.firstChild.appendChild(document.createTextNode(metadata));
    stackViewer.getLayersView().appendChild(this._metadataDisplay);

    this.isOrderable = true;
    this.opacity = 1;
  }

  MetadataLayer.prototype = {};
  MetadataLayer.prototype.constructor = MetadataLayer;

  /**
   * Return friendly name of this layer.
   */
  MetadataLayer.prototype.getLayerName = function () {
    return 'Metadata';
  };

  /**
   * Remove any DOM created by this layer from the stack viewer.
   */
  MetadataLayer.prototype.unregister = function () {
    this.stackViewer.getLayersView().removeChild(this._metadataDisplay);
  };

  /**
   * Update and draw the layer. Because metadata is static this only invokes the
   * callback.
   */
  MetadataLayer.prototype.redraw = function (completionCallback) {
    CATMAID.tools.callIfFn(completionCallback);
  };

  /**
   * Resize th layer. Because metadata layer layout is CSS based this does
   * nothing.
   */
  MetadataLayer.prototype.resize = function () { return; };

  /**
   * Get the stack viewer.
   */
  MetadataLayer.prototype.getStackViewer = function () { return this.stackViewer; };

  /**
   * Get the DOM element view for this layer.
   * @return {Element} View for this layer.
   */
  MetadataLayer.prototype.getView = function () { return this._metadataDisplay; };

  /**
   * Set opacity in the range from 0 to 1.
   * @param {number} val New opacity.
   */
  MetadataLayer.prototype.setOpacity = function (val) {
    this._metadataDisplay.style.opacity = val + '';
    this.opacity = val;
    if (val < 0.02) {
      if (this.visible)
        $(this._metadataDisplay).css('visibility', 'hidden');
      this.visible = false;
    } else {
      if (!this.visible)
        $(this._metadataDisplay).css('visibility', 'visible');
      this.visible = true;
    }
  };

  /**
   * Get the layer opacity.
   */
  MetadataLayer.prototype.getOpacity = function () {
    return this.opacity;
  };

  CATMAID.MetadataLayer = MetadataLayer;

})(CATMAID);
