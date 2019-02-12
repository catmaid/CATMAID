/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This context menu will pop up at a location provided through a mouse event
   * passed to its onClick handler. The provided options object can have the
   * following fields:
   *
   * items:         a list of objects with at least a title field, passed to
   *                callback
   * select:        a function called when an item is selected
   * provideLocation: if true, the callback parameter object will also contain
   *                the clicked stack location
   */
  var ContextMenu = function(options) {
    options = options || {};
    this.options = options;

    var self = this;

    // Keep state ob whether a menu is currently displayed and on what location
    var menuVisible = false;
    var menuX = 0;
    var menuY = 0;

    var innerSelect = CATMAID.tools.isFn(options.select) ?
        options.select : CATMAID.noop;
    var select = function(item, event) {
      var selection = {
        item: item
      };
      this.hide(true);

      if (options.provideLocation) {
        // Get focused stack viewer to get click coordinates
        var stackViewer = project.focusedStackViewer;
        if (!stackViewer) {
          CATMAID.warn("Couldn't find focused stack viewer");
          return;
        }

        // Figure out stack space coordinates from screen space location
        var stack = stackViewer.primaryStack;
        var scaledOffsetX = menuX / stackViewer.scale;
        var scaledOffsetY = menuY / stackViewer.scale;
        var screenTopLeft = stackViewer.screenPosition();
        var stackX = selection.stackX = screenTopLeft.left + scaledOffsetX;
        var stackY = selection.stackY = screenTopLeft.top + scaledOffsetY;
        var stackZ = selection.stackZ = stackViewer.z;
        selection.stackId = stack.id;

        // Provide project location as well
        selection.projectX = stack.stackToProjectX(stackZ, stackY, stackX);
        selection.projectY = stack.stackToProjectY(stackZ, stackY, stackX);
        selection.projectZ = stack.stackToProjectZ(stackZ, stackY, stackX);
      }

      innerSelect.call(this, selection);
    };

    // This basic context menu offers so far only the option to jump to raw data.
    var contextMenu = new Menu();
    contextMenu.update(options.items.reduce(function(config, item, i) {
      // Use array index as key
      config[i] = {
        "title": item.title,
        "action": select.bind(self, item),
        "note": item.note || ""
      };
      return config;
    }, {}));

    // Append context menu to body and hide it by default
    var menuElement = contextMenu.getView();
    var container = document.createElement('div');
    container.appendChild(menuElement);
    container.classList.add("pulldown");
    container.style.display = "block";
    container.style.cursor = "pointer";
    var wrapper = document.createElement('div');
    wrapper.classList.add("menu_item");
    wrapper.style.display = "none";
    wrapper.style.zIndex = 1000;
    wrapper.style.position = "absolute";
    wrapper.appendChild(container);

    if (options.disableDefaultContextMenu) {
      $(wrapper).on('contextmenu', function(e) {
        e.stopPropagation();
        e.preventDefault();
        return false;
      });
    }

    /**
     * Show the context menu at the current pointer location.
     *
     * @param {Object} mouseEvent A CATMAID UI generated mouse event
     */
    this.onClick = function(mouseEvent) {
      // React only to *left* mouse button clicks
      if (!mouseEvent || 1 !== CATMAID.ui.getMouseButton(mouseEvent)) {
        return true;
      }

      // Don't interfer with other event handling and let other handlers do their
      // work first. This is useful to not pan the view when leaving the menu.
      var mouse = CATMAID.ui.getMouse(mouseEvent);
      menuX = mouse.x;
      menuY = mouse.y;
      setTimeout(this._boundToggleContextMenu, 10);
      return true;
    };

    this._boundOnClick = this.onClick.bind(this);

    /**
     * Make context menu visible.
     *
     * @param {Boolean} useCurrentLocation Whether the context menu should use
     *                                     the current mouse location or the one
     *                                     recorded last.
     */
    this.show = function(useCurrentLocation) {
      CATMAID.ui.registerEvent("onpointerup", this._boundOnClick);
      CATMAID.ui.catchEvents();
      document.body.appendChild(wrapper);
      if (useCurrentLocation) {
        var mouse = CATMAID.UI.getLastMouse();
        menuX = mouse.x;
        menuY = mouse.y;
      }
      wrapper.style.left = menuX + "px";
      wrapper.style.top = menuY + "px";
      wrapper.style.display = "block";
      menuVisible = true;

      // Attach a handler for the ESC key to cancel context menu
      var self = this;
      $('body').on('keydown.catmaidContextMenu', function(event) {
        if ('Escape' === event.key) {
          self.hide();
          return true;
        }
        return false;
      });
    };

    /**
     * Hide the currently displayed context menu.
     */
    this.hide = function(selected) {
      CATMAID.ui.removeEvent("onpointerup", this._boundOnClick);
      CATMAID.ui.releaseEvents();
      wrapper.style.display = "none";
      menuVisible = false;
      document.body.removeChild(wrapper);
      // Unbind key handler and hide context menu
      $('body').off('keydown.catmaidContextMenu');
      // Execute hide callback, if any
      CATMAID.tools.callIfFn(this.options.hide, selected || false);
    };

    /**
     * Show a menu if it is hidden and hide it, if it is visible, optionally
     * setting the location if shown.
     *
     * @param {Boolean} useCurrentLocation Whether the context menu should use
     *                                     the current mouse location or the one
     *                                     recorded last.
     */
    this.toggleContextMenu = function(useCorrentLocation) {
      if (menuVisible) {
        this.hide(false);
      } else {
        this.show(useCorrentLocation);
      }
    };

    this._boundToggleContextMenu = this.toggleContextMenu.bind(this);
  };

  /**
   * Will create a new context menu once the DOM is fully loaded and binds its
   * onclick handler to the UI's onpointerup event. If no contextMenu is provided,
   * a new one is created and returned as a promise result
   */
  ContextMenu.registerGlobally = function(contextMenu) {
    return new Promise(function(resolve, reject) {
      // Wait for the DOM to be loaded completely and then attach to the UI
      document.addEventListener("DOMContentLoaded", function(event) {
        contextMenu = contextMenu || new ContextMenu();
        // Liste to mouse down events generated through CATMAID's event catcher
        if (CATMAID.ui) {
          CATMAID.ui.registerEvent("onpointerup", contextMenu.onClick.bind(contextMenu));
        } else {
          CATMAID.warn("UI not initialized yet");
        }
        resolve(contextMenu);
      });
    });
  };

  // Export
  CATMAID.ContextMenu = ContextMenu;

})(CATMAID);
