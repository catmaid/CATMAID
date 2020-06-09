/* global
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  var resizeOnRender = null;

  var activeOptions = null;
  var activeColor = null;
  var activeAlpha = null;

  function onClose(colorPicker) {
    $(colorPicker.color.options.input).colorPicker("destroy");
    resizeOnRender = null;
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
        activeOptions.onColorChange(color.rgb, color.alpha, colorChanged, alphaChanged, color.HEX);
      }
    }
  }

  function onShow(colorPicker) {
    // Create a new resize callback which will be executed after the first
    // rendering, when the widget is set up completely.
    resizeOnRender = function() {
      // Fix position
      var $colorPicker = $(colorPicker.nodes.colorPicker);
      if($colorPicker.height() + $colorPicker.offset().top - window.pageYOffset > window.innerHeight) {
        $colorPicker.css('top', (window.scrollY + window.innerHeight - $colorPicker.height())+'px');
      }
      if($colorPicker.width() + $colorPicker.offset().left - window.pageXOffset > window.innerWidth) {
        $colorPicker.css('left', (window.scrollX + window.innerWidth - $colorPicker.width())+'px');
      }
    };
    resizeOnRender();
  }

  function onDisplay(colors, mode, options) {
    CATMAID.tools.callIfFn(resizeOnRender);

    // Make sure no width or height is explicitely set on the container
    // element, which would prevent proper resizing.
    $("div.cp-app").css({
      width: "",
      height: ""
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
        afterShowCallback: onShow,
        displayCallback: onDisplay
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
        $element.css('color', CATMAID.tools.getContrastColor(hex));
        color = tc.getStyle();
        if (options.initialAlpha) {
          // Add alpha to style
          color = color.replace(/\)/, ',' + options.initialAlpha + ')');
        }
        $element.css('backgroundColor', color);
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
      resizeOnRender = null;
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
