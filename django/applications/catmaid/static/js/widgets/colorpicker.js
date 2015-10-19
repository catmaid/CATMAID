/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  var activeOptions = null;
  var activeColor = null;
  var activeAlpha = null;

  function onClose(colorPicker) {
    $(colorPicker.color.options.input).colorPicker("destroy");
    activeOptions = null;
    activeColor = null;
    activeAlpha = null;
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
     * Bind a click handler to the given element. This DOM element can be a
     * jQuery object, but doesn't need to be. If the optiopns contain an initial
     * color and an initial opacity, these will be set.
     *
     * Options can contain the following fields:
     *
     *   initialColor: hex string, e.g. #22EE44
     *   initialAlpha: float between 0 and 1, e.g. 0.4
     *   onColorChange: function that is called on a color change
     */
    enable: function(element, options) {
      options = options || {};
      // Use jQuery to update element. This way also jQuery elements can be
      // passed in.
      var $element = $(element);
      var color;
      if (options.initialColor) {
        // Use three.js for color conversion
        var tc = new THREE.Color(options.initialColor);
        var hex = '#' + tc.getHexString();
        $element.css('backgroundColor', hex);
        $element.css('color', CATMAID.tools.getContrastColor(hex));
        color = tc.getStyle();
        if (options.initialAlpha) {
          // Add alpha to style
          color = color.replace(/\)/, ',' + options.initialAlpha + ')');
        }
      } else {
        // Set to yellow as default
        color = 'rgb(255, 255, 0)';
      }

      // The currently used color picker implementation expects this attribute
      // to be set to the initial color.
      $element.attr('value', color);

      $element.on('click', function() {
        CATMAID.ColorPicker.toggle(this, options);
      });
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
