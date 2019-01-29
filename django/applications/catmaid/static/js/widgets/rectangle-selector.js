/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Draw a rectangle anywhere in the window and get when the pointer is released.
   */
  function RectangleSelector(options) {
    options = options || {};

    this.active = false;
    
    // Disable the toggle layer automatically after five seconds of inactivity
    // by default.
    this.autoDisableAfter = CATMAID.tools.getDefined(options.autoDisableAfter, 5);
    this.handler = CATMAID.tools.getDefined(options.handler, null);
    this.message = CATMAID.tools.getDefined(options.message, null);
    // The actual bounding box
    this.boundingBox = document.createElement('div');
    this.boundingBox.style.display = "none";
    this.boundingBox.classList.add("selection-box");
    // Add an informative message
    this.message = document.createElement('div');
    this.message.style.display = "none";
    this.message.classList.add("selection-box-text");
    if (this.message) {
      this.message.appendChild(document.createTextNode(options.message));
    }

    // Bounding box properties
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.offsetX = 0;
    this.offsetY = 0;

    this.updatePosition = function() {
      this.boundingBox.style.left = (this.x + this.offsetX) + "px";
      this.boundingBox.style.top = (this.y + this.offsetY) + "px";
      this.boundingBox.style.width = this.width + "px";
      this.boundingBox.style.height = this.height + "px";
      this.message.style.left = this.boundingBox.style.left;
      this.message.style.top = "calc(" + (this.y + this.offsetY) + "px - 2em)";
    };

    this.handlePointerDown = (function(event) {
      var mouse = CATMAID.ui.getMouse(event);
      this.x = mouse.x;
      this.y = mouse.y;
      this.width = this.offsetX = 0;
      this.height = this.offsetY = 0;
      this.boundingBox.style.display = "block";
      this.message.style.display = "block";
      this.updatePosition();
    }).bind(this);

    this.handlePointerMove = (function(event) {
      var mouse = CATMAID.ui.getMouse(event);
      this.width = mouse.x - this.x;
      this.height = mouse.y - this.y;
      // If width and height are negative, shift top and left of selection box.
      if (this.width < 0) {
        this.offsetX = this.width;
        this.width = Math.abs(this.width);
      } else {
        this.offsetX = 0;
      }
      if (this.height < 0) {
        this.offsetY = this.height;
        this.height = Math.abs(this.height);
      } else {
        this.offsetY = 0;
      }
      this.updatePosition();
    }).bind(this);

    this.handlePointerUp = (function(event) {
      var wasActive = this.active;
      this.boundingBox.style.display = "none";
      this.message.style.display = "none";
      this.destroy();
      if (wasActive) {
        CATMAID.tools.callIfFn(this.handler);
      }
    }).bind(this);

    this.init = function() {
      this.active = true;
      // Attach pre-bound handlers
      CATMAID.ui.registerEvent("onpointerdown", this.handlePointerDown);
      CATMAID.ui.registerEvent("onpointermove", this.handlePointerMove);
      CATMAID.ui.registerEvent("onpointerup", this.handlePointerUp);
      CATMAID.ui.catchEvents('crosshair');
      // Append bounding box to DOM
      document.body.appendChild(this.boundingBox);
      document.body.appendChild(this.message);
    };

    this.destroy = function() {
      this.active = false;
      CATMAID.ui.releaseEvents();
      // Remove bounding box from DOM
      document.body.removeChild(this.boundingBox);
      document.body.removeChild(this.message);
      // Detach pre-bound handlers
      CATMAID.ui.removeEvent("onpointerdown", this.handlePointerDown);
      CATMAID.ui.removeEvent("onpointermove", this.handlePointerMove);
      CATMAID.ui.removeEvent("onpointerup", this.handlePointerUp);
    };
  }


  /**
   * A rectangle selector that will toggle all checkboxes below it.
   */
  function RectCheckboxSelector(options) {
    options = options || {};

    // Optionally, don't toggle checkboxes, but only check them.
    this.checkOnly = CATMAID.tools.getDefined(options.checkOnly, false);

    $.extend(options, {
      handler: this.toggleCheckboxes.bind(this),
      message: this.checkOnly ? "Check all checkboxes behind rectangle" :
          "Toggle all checkboxes behind rectangle"
    });

    RectangleSelector.call(this, options);
  }

  RectCheckboxSelector.prototype = Object.create(RectangleSelector.prototype);
  RectCheckboxSelector.prototype.constructor = RectCheckboxSelector;

  /**
   * Use the current x, y, width and height to find checkboxes in the same
   * area and toggle them.
   */
  RectCheckboxSelector.prototype.toggleCheckboxes = function() {
    var minX = this.x + this.offsetX;
    var minY = this.y + this.offsetY;
    var maxX = minX + this.width;
    var maxY = minY + this.height;

    // Find intersecting checkboxes
    var $elements = $("body input[type=checkbox]").map(function() {
      var $this = $(this);
      // Ignore hidden elements
      if (!$this.is(":visible")) {
        return null;
      }
      var offset = $this.offset();
      var elementMinX = offset.left;
      var elementMinY = offset.top;
      var elementMaxX = elementMinX + $(this).width();
      var elementMaxY = elementMinY + $(this).height();

      return (minY <= elementMaxY && maxY >= elementMinY) &&
          (minX <= elementMaxX && maxX >= elementMinX) ? $this : null;
    });

    if ($elements.length === 0) {
      CATMAID.warn("No checkboxes found");
      return;
    }

    // Toggle or check all matched elements. This has to be done by one, because
    // browsers seem to filter if one click event is sent do multiple elements.
    var msg;
    if (this.checkOnly) {
      var count = 0;
      $elements.each(function(i, e) {
        if (!e.prop('checked')) {
          e.click();
          ++count;
        }
      });
      msg = "Checked " + count + " of " + $elements.length + " checkboxes";
    } else {
      $elements.each(function(i, e) {
        e.click();
      });
      msg = "Toggled all " + $elements.length + " checkboxes";
    }
    CATMAID.msg('Success', msg);
  };

  // Export widgets
  CATMAID.RectangleSelector = RectangleSelector;
  CATMAID.RectCheckboxSelector = RectCheckboxSelector;

})(CATMAID);
