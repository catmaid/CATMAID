/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  var activeOptions;
  var activeColor;
  var activeAlpha;

  function onClose(colorPicker) {
    $(colorPicker.color.options.input).colorPicker("destroy");
  }

  function onConvert(color, mode) {
    // Corner case for new instances, the first conversion for initialization
    // doesn't count.
    var colorChanged = activeColor ? (activeColor !== color.HEX) : false;
    var alphaChanged = activeAlpha ? (activeAlpha !== color.alpha) : false;

    activeColor = color.HEX;
    activeAlpha = color.alpha;

    if (colorChanged || alphaChanged) {
      if (activeOptions && activeOptions.onColorChange) {
        console.log(color);
        activeOptions.onColorChange(color.rgb, color.alpha, colorChanged, alphaChanged);
      }
    }
  }

  function onShow(colorPicker) {
    // Fix position
    var cp = $(colorPicker.nodes.colorPicker);
    var pos = {left: parseFloat(cp.css('left')), top: parseFloat(cp.css('top'))};
    var dim = {x: cp.width(), y: cp.height()};
    var win = {width: $(window).width(), height: $(window).height()};
    var newLeft = pos.left < 0 ? 0 :
      ((pos.left + dim.x) > win.width ? win.width - dim.x : pos.left);
    var newTop = pos.top < 0 ? 0 :
      ((pos.top + dim.y) > win.height ? win.height - dim.y : pos.top);

    cp.css({
      left: newLeft,
      top: newTop
    });
  }

  /**
   * This color picker abstraction allows easier access to color picker based
   * functionality.
   */  
  var ColorPicker = {

    /**
     * Show color picker for a specific DOM element.
     */
    show: function(element, options) {
      options = options || {};
      activeOptions = options;

      var config = {
        size: 0,
        animationSpeed: 0,
        draggable: true,
        beforeHideCallback: onClose,
        convertCallback: onConvert,
        afterShowCallback: onShow
      };
      var $element = $(element).colorPicker(config);
      $element.focus();

      return $element;
    },


    /**
     * Hide color picker for a specific DOM element.
     */
    hide: function(element) {
      // Detach event handlers
      $(element).colorPicker("destroy");
      // Hide color picker
      $("div.cp-app").hide();
      // Remove options reference
      activeOptions = null;
      activeColor = null;
      activeAlpha = null;
    },

    /**
     * Returns true if and only if a color picker is visible for the given
     * DOM element.
     */
    visible: function() {
      var display = $("div.cp-app").css("display");
      var opacity = $("div.cp-app").css("opacity");
      return !(display === "none" || display === undefined || opacity < 1);
    },

    /**
     * Shows color picker if it is not visible for a DOM given element, hides it
     * otherwise.
     */
    toggle: function(element, options) {
      return ColorPicker.visible() ? ColorPicker.hide(element) :
          ColorPicker.show(element, options);
    }

  };

  // Make color picker available in CATMAID namespace
  CATMAID.ColorPicker = ColorPicker;

})(CATMAID);
