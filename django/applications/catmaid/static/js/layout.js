(function(CATMAID) {

  "use strict";

  const Stack = CATMAID.Stack;

  const XY = Stack.ORIENTATION_XY;
  const XZ = Stack.ORIENTATION_XZ;
  const ZY = Stack.ORIENTATION_ZY;
  const F1 = "f1";
  const X3D = "3d";

  const validOrientations = new Set([XY, XZ, ZY]);
  const isFn = CATMAID.tools.isFn;

  const WindowBuilder = {};
  WindowBuilder[F1] = function() {
    return WindowMaker.create('keyboard-shortcuts').window;
  };

  /**
   * Opening the 3D viewer creates a vertical split node with the 3D Viewer on
   * top of a newly created Selection Table. To be able to use the 3D viewer in
   * with the data structures below, we need to return the newly created node
   * thats highest in the window hierarchy. In this case this is the parent of
   * the 3D Viewer.
   */
  WindowBuilder[X3D] = function() {
    var win = WindowMaker.create('3d-webgl-view').window;
    var splitNode = win.getParent();
    return splitNode;
  };

  const createWindow = function(name) {
    var creator = WindowBuilder[name];
    if (!creator) {
      creator = function() {
        return WindowMaker.create(name).window;
      };
    }
    if (!creator) {
      throw new CATMAID.ValueError("Could not find window creator for: " + name);
    }
    var win = creator();
    if (!win) {
      throw new CATMAID.ValueError("Could not create window for: " + name);
    }
    return win;
  };

  const Node = {
    missingViews: function(views) {
      if (isFn(this.a.missingViews)) {
          this.a.missingViews(views);
      } else {
        views.delete(this.a);
      }
      if (isFn(this.b.missingViews)) {
          this.b.missingViews(views);
      } else {
        views.delete(this.b);
      }
    },
    minStackViewers: function() {
      var result = isFn(this.a.minStackViewers) ?
          this.a.minStackViewers() : (validOrientations.has(this.a) ? 1 : 0);
      result += isFn(this.b.minStackViewers) ?
          this.b.minStackViewers() : (validOrientations.has(this.b) ? 1 : 0);
      return result;
    },
    maxStackViewers: function() {
      var result = isFn(this.a.maxStackViewers) ?
          this.a.maxStackViewers() : (validOrientations.has(this.a) ? 1 : 0);
      result += isFn(this.b.maxStackViewers) ?
          this.b.maxStackViewers() : (validOrientations.has(this.b) ? 1 : 0);
      return result;
    },
    regularWindows: function() {
      var result = isFn(this.a.regularWindows) ?
          this.a.regularWindows() : (validOrientations.has(this.a) ? 0 : 1);
      result += isFn(this.b.regularWindows) ?
          this.b.regularWindows() : (validOrientations.has(this.b) ? 0 : 1);
      return result;
    },
    makeNode: function(windows) {
      var a = isFn(this.a.makeNode) ?
          this.a.makeNode(windows) : windows.get(this.a);
      var b = isFn(this.b.makeNode) ?
          this.b.makeNode(windows) : windows.get(this.b);
      return new this.NodeType(a, b);
    },
    makeRegularWindows: function(n, target) {
      if (n === 0) {
        return target;
      }
      if (isFn(this.a.makeRegularWindows)) {
        n = this.a.makeRegularWindows(n, target);
      } else if (!validOrientations.has(this.a)) {
        var win = createWindow(this.a);
        target.set(this.a, win);
        --n;
      }
      if (isFn(this.b.makeRegularWindows)) {
        n = this.b.makeRegularWindows(n, target);
      } else if (!validOrientations.has(this.b)) {
        var win = createWindow(this.b);
        target.set(this.b, win);
        --n;
      }
      return n;
    }
  };

  const OptionalNode = {
    missingViews: function(views) {
      views.delete(this.a);
    },
    minStackViewers: function() {
      return 0;
    },
    maxStackViewers: function() {
      return validOrientations.has(this.a) ? 1 : 0;
    },
    regularWindows: function() {
      return 1;
    },
    makeNode: function(windows) {
      // At the moment no duplicate windows are allowed
      return windows.get(this.a);
    },
    makeRegularWindows: function(n, target) {
      if (n === 0) {
        return;
      }
      var win = createWindow(this.a);
      target.set(this.a, win);
      return n - 1;
    }
  };

  var VNode = function(a, b) {
    this.a = a;
    this.b = b;
    this.NodeType = CMWVSplitNode;
  };
  VNode.prototype = Node;

  var HNode = function(a, b) {
    this.a = a;
    this.b = b;
    this.NodeType = CMWHSplitNode;
  };
  HNode.prototype = Node;

  var ONode = function(a) {
    this.a = a;
  };
  ONode.prototype = OptionalNode;

  /**
   * Functions allowed for layout specification.
   */

  function v(a, b) {
    return new VNode(a, b);
  }

  function h(a, b) {
    return new HNode(a, b);
  }

  function o(a) {
    return new ONode(a);
  }

  /**
   * Layout currently open stack viewers. Currently, this only changes the layout
   * if there are three ortho-views present.
   */
  CATMAID.layoutStackViewers = function() {
    var stackViewers = project.getStackViewers();
    var views = stackViewers.reduce(function(o, s) {
      o[s.primaryStack.orientation] = s;
      return o;
    }, {});

    var layouts = CATMAID.Layout.Settings.session.default_layouts;
    for (var i=0; i<layouts.length; ++i) {
      var layout = new CATMAID.Layout(layouts[i]);

      var matchResult = layout.matches(stackViewers, views);
      if (matchResult.matches) {
        layout.run(stackViewers, views, matchResult);
        break;
      }
    }
  };

  var Layout = function(spec) {
    try {
      // Replace special case "3D" token with X3D. This allow to specify the 3D
      // viewer more easily. This is needed because we run eval() below.
      spec = spec.replace(/([^X])3D/g, '$1X3D');
      this._layout = eval(spec);
    } catch (error) {
      CATMAID.warn("Can't parse layout: " + spec + ", using default");
      var defaultLayout = CATMAID.Layout.Settings.schema.entries['default_layout'].default;
      this._layout = eval(defaultLayout);
    }
  };

  /**
   * Parse comma separated lists of layout specs into a list of strings.
   */
  Layout.parseLayoutSpecList = function(spec) {
    let defaultLayouts = [];
    let pCount = 0, start = 0;
    for (var i=0, max=spec.length; i<max; ++i) {
      var c = spec[i];
      if (c === '(') {
        ++pCount;
      } else if (c === ')') {
        --pCount;
      }
      var lastCharacter = i === max - 1;
      if (pCount === 0 && (c === ',' || lastCharacter)) {
        var layout = spec.slice(start, lastCharacter ? (i + 1) : i).trim();
        defaultLayouts.push(layout);
        start = i + 1;
      }
    }
    return defaultLayouts;
  };

  /**
   * A layout is valid if all expected views are found.
   */
  Layout.prototype.matches = function(stackViewers, views) {
    var allWindows = CATMAID.rootWindow.getWindows();
    var minStackViewers = this._layout.minStackViewers();
    var maxStackViewers = this._layout.maxStackViewers();

    // Get references to stack viewer windows
    var windows = new Map();
    var seenWindows = new Set();
    validOrientations.forEach(function(o) {
      var stackViewer = views[o];
      if (stackViewer) {
        var w = stackViewer.getWindow();
        windows.set(o, w);
        seenWindows.add(w);
      }
    });

    var nonStackViewerWindows = allWindows.filter(function(w) {
      return !seenWindows.has(w);
    });

    var neededExtraWindows = this._layout.regularWindows();
    // Excess windows are windows that can't be used by the layout and if there
    // are any, the layout won't match.
    var excessWindows = Math.max(0,
        nonStackViewerWindows.length - neededExtraWindows);
    // The number of regular windows to create
    var regularWindowsToCreate = Math.max(0,
        neededExtraWindows - nonStackViewerWindows.length);
    var missingViews = new Set(stackViewers.map(function(s) {
      return s.primaryStack.orientation;
    }));
    this._layout.missingViews(missingViews);

    return {
      matches: excessWindows === 0 &&
          missingViews.size === 0 &&
          stackViewers.length >= minStackViewers &&
          stackViewers.length <= maxStackViewers,
      allWindows: allWindows,
      minStackViewers: minStackViewers,
      maxStackViewers: maxStackViewers,
      neededExtraWindows: neededExtraWindows,
      regularWindowsToCreate: regularWindowsToCreate,
      validOrientations: validOrientations,
      windows: windows
    };
  };

  Layout.prototype.run = function(stackViewers, views, matchResult) {
    var windows = matchResult.windows;

    // Create all needed extra windows
    if (matchResult.regularWindowsToCreate > 0) {
      let windowsLeftToCreate = this._layout.makeRegularWindows(
          matchResult.regularWindowsToCreate, windows);
      if (windowsLeftToCreate > 0) {
        CATMAID.warn('Could not createa ' + windowsLeftToCreate + ' regular windows');
      }
    }

    CATMAID.rootWindow.replaceChild(this._layout.makeNode(windows));
  };

  Layout.Settings = new CATMAID.Settings(
    'layout-settings',
    {
      version: 0,
      entries: {
        default_layouts: {
          // If there are three different ortho stacks, arrange viewers in
          // four-pane layout. On the left side XY on top of XZ, on the righ ZY
          // on top of a selection table.
          default: ["h(v(XY, XZ), v(ZY, o(F1)))"]
        }
      }
    });


  // Export layout
  CATMAID.Layout = Layout;

})(CATMAID);
