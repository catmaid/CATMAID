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

  /**
   * For a regular 3D Viewer request, make sure no extra Selection Table is
   * created. We want to handle the Selection Table (if any) separately as well
   * as any subscriptions.
   */
  WindowBuilder['3d-webgl-view'] = function() {
    return WindowMaker.create('3d-webgl-view', {
      selectionTable: false,
    }).window;
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

  const LayaoutNode = function() {};

  const SingleNode = function() {};
  SingleNode.prototype = Object.create(LayaoutNode.prototype);
  SingleNode.prototype.constructor = SingleNode;

  SingleNode.prototype.missingViews = function(views) {
    if (isFn(this.a.missingViews)) {
        this.a.missingViews(views);
    } else {
      views.delete(this.a);
    }
  };

  SingleNode.prototype.minStackViewers = function() {
    var result = isFn(this.a.minStackViewers) ?
        this.a.minStackViewers() : (validOrientations.has(this.a) ? 1 : 0);
    return result;
  };

  SingleNode.prototype.maxStackViewers = function() {
    var result = isFn(this.a.maxStackViewers) ?
        this.a.maxStackViewers() : (validOrientations.has(this.a) ? 1 : 0);
    return result;
  };

  SingleNode.prototype.regularWindows = function() {
    var result = isFn(this.a.regularWindows) ?
        this.a.regularWindows() : (validOrientations.has(this.a) ? 0 : 1);
    return result;
  };

  SingleNode.prototype.makeNode = function(windows) {
    var a = isFn(this.a.makeNode) ?
        this.a.makeNode(windows) : windows.get(this.a);
    return a;
  };

  SingleNode.prototype.makeRegularWindows = function(n, target) {
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
    return n;
  };


  const Node = function() {};
  Node.prototype = Object.create(LayaoutNode.prototype);
  Node.prototype.constructor = Node;

  Node.prototype.missingViews = function(views) {
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
  };

  Node.prototype.minStackViewers = function() {
    var result = isFn(this.a.minStackViewers) ?
        this.a.minStackViewers() : (validOrientations.has(this.a) ? 1 : 0);
    result += isFn(this.b.minStackViewers) ?
        this.b.minStackViewers() : (validOrientations.has(this.b) ? 1 : 0);
    return result;
  };

  Node.prototype.maxStackViewers = function() {
    var result = isFn(this.a.maxStackViewers) ?
        this.a.maxStackViewers() : (validOrientations.has(this.a) ? 1 : 0);
    result += isFn(this.b.maxStackViewers) ?
        this.b.maxStackViewers() : (validOrientations.has(this.b) ? 1 : 0);
    return result;
  };

  Node.prototype.regularWindows = function() {
    var result = isFn(this.a.regularWindows) ?
        this.a.regularWindows() : (validOrientations.has(this.a) ? 0 : 1);
    result += isFn(this.b.regularWindows) ?
        this.b.regularWindows() : (validOrientations.has(this.b) ? 0 : 1);
    return result;
  };

  Node.prototype.makeNode = function(windows) {
    var a = isFn(this.a.makeNode) ?
        this.a.makeNode(windows) : windows.get(this.a);
    var b = isFn(this.b.makeNode) ?
        this.b.makeNode(windows) : windows.get(this.b);
    return new this.NodeType(a, b);
  };

  Node.prototype.makeRegularWindows = function(n, target) {
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
  };

  const OptionalNode = function() {
    LayaoutNode.call(this);
  };
  OptionalNode.prototype = Object.create(LayaoutNode.prototype);
  OptionalNode.prototype.constructor = OptionalNode;


  OptionalNode.prototype.missingViews = function(views) {
    views.delete(this.a);
  };

  OptionalNode.prototype.minStackViewers = function() {
    return 0;
  };

  OptionalNode.prototype.maxStackViewers = function() {
    return validOrientations.has(this.a) ? 1 : 0;
  };

  OptionalNode.prototype.regularWindows = function() {
    return 1;
  };

  OptionalNode.prototype.makeNode = function(windows) {
    // At the moment no duplicate windows are allowed
    return windows.get(this.a);
  };

  OptionalNode.prototype.makeRegularWindows = function(n, target) {
    if (n === 0) {
      return;
    }
    var win = createWindow(this.a);
    target.set(this.a, win);
    return n - 1;
  };


  function assignNodeInfo(node, field, value) {
    if (typeof(value) === 'object' && !(value instanceof LayaoutNode)) {
      node[field] = value.type;
      node.meta = value;
    } else {
      node[field] = value;
      node.meta = {};
    }
  }


  var VNode = function(a, b, ratio) {
    this.ratio = CATMAID.tools.getDefined(ratio, 0.5);
    assignNodeInfo(this, 'a', a);
    assignNodeInfo(this, 'b', b);
    this.NodeType = CMWVSplitNode;

    this.makeNode = function(windows) {
      var node = VNode.prototype.makeNode.call(this, windows);
      node.heightRatio = this.ratio;
      return node;
    };
  };

  VNode.prototype = Object.create(Node.prototype);
  VNode.prototype.constructor = VNode;


  var HNode = function(a, b, ratio) {
    this.ratio = CATMAID.tools.getDefined(ratio, 0.5);
    assignNodeInfo(this, 'a', a);
    assignNodeInfo(this, 'b', b);
    this.NodeType = CMWHSplitNode;

    this.makeNode = function(windows) {
      var node = HNode.prototype.makeNode.call(this, windows);
      node.widthRatio = this.ratio;
      return node;
    };
  };

  HNode.prototype = Object.create(Node.prototype);
  HNode.prototype.constructor = HNode;


  var ONode = function(a) {
    OptionalNode.call(this);
    assignNodeInfo(this, 'a', a);
  };

  ONode.prototype = Object.create(OptionalNode.prototype);
  ONode.prototype.constructor = ONode;


  var WNode = function(a) {
    assignNodeInfo(this, 'a', a);
    this.NodeType = CMWWindow;
  };
  WNode.prototype = Object.create(SingleNode.prototype);
  WNode.prototype.constructor = WNode;


  /**
   * Functions allowed for layout specification.
   */

  function v(a, b, ratio) {
    return new VNode(a, b, ratio);
  }

  function h(a, b, ratio) {
    return new HNode(a, b, ratio);
  }

  function o(a) {
    return new ONode(a);
  }

  function w(a) {
    return new WNode(a);
  }

  function layout(alias, pattern) {
    return eval(pattern);
  }

  function getViewIndex(stackViewers) {
    return stackViewers.reduce(function(o, s) {
      o[s.primaryStack.orientation] = s;
      return o;
    }, {});
  }

  /**
   * Layout currently open stack viewers. Currently, this only changes the layout
   * if there are three ortho-views present.
   */
  CATMAID.layoutStackViewers = function() {
    var stackViewers = project.getStackViewers();
    var views = getViewIndex(stackViewers);

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

  function stackViewerCountMatchesLayout(stackViewers, layout) {
    return stackViewers.length >= layout.minStackViewers() &&
          stackViewers.length <= layout.maxStackViewers();
  }

  function windowIsStackViewer(stackViewers, win) {
    for (var i=0; i<stackViewers.length; ++i) {
      var stackViewer = stackViewers[i];
      if (stackViewer._stackWindow === win) {
        return true;
      }
    }
    return false;
  }

  function closeAllButStackViewers(stackViewers) {
    var allWindows = CATMAID.rootWindow.getWindows();
    while (allWindows.length > 0) {
      var win = allWindows.pop();
      if (!windowIsStackViewer(stackViewers, win)) {
        win.close();
      }
    }
  }

  /**
   * Switch to a new layout.
   */
  CATMAID.switchToLayout = function(newLayout) {
    if (!confirm("Are you sure you want close all existing widgets?")) {
      return;
    }

    var stackViewers = project.getStackViewers();
    var viewIndex = getViewIndex(stackViewers);

    if (!stackViewerCountMatchesLayout(stackViewers, newLayout._layout)) {
      CATMAID.warn("Can't load layout, other stack viewer configuration expected");
      return;
    }
    
    // Close all open widgets
    closeAllButStackViewers(stackViewers);

    // Now test if the layout really matches
    var matchResult = newLayout.matches(stackViewers, viewIndex);
    if (!matchResult.matches) {
      CATMAID.warn("Can't load layout, other window configuration expected");
      return;
    }

    // Run new layout
    newLayout.run(stackViewers, viewIndex, matchResult);

    return true;
  };

  var Layout = function(spec) {
    try {
      // Replace special case "3D" token with X3D. This allow to specify the 3D
      // viewer more easily. This is needed because we run eval() below.
      spec = spec.replace(/([^X])3D/g, '$1X3D');
      this._layout = eval(spec);
    } catch (error) {
      CATMAID.warn("Can't parse layout: " + spec + ", using default");
      var defaultLayouts = CATMAID.Layout.Settings.schema.entries['default_layouts'].default;
      if (!defaultLayouts || !defaultLayouts.length) {
        this._layout = eval("h(v(XY, XZ), v(ZY, o(F1)))");
      } else {
        this._layout = eval(defaultLayouts[0]);
      }
    }

    // Special case: only a singly orientation is passed in as spec, e.g. "XY"
    if (this._layout === XY || this._layout === XZ || this._layout === ZY) {
      this._layout = w(this._layout);
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

  var aliasedLayout = /layout\(['"]([^'"]+)['"],\s*(.+)\)/;

  /**
   * Return an object of form { name: <name>, spec: <layout-spec> } from an
   * input of the format "layout(<name>, <layout-spec>)".
   */
  Layout.parseAliasedLayout = function(aliasedLayoutSpec) {
    if (!aliasedLayoutSpec) {
      throw new CATMAID.ValueError('Need layout spec');
    }
    var match = aliasedLayoutSpec.match(aliasedLayout);
    if (!match || match.length !== 3) {
      throw new CATMAID.ValueError('Couldn\'t parse layout: ' + aliasedLayoutSpec);
    }
    return {
      name: match[1],
      spec: match[2]
    };
  };

  /**
   * Add a new user layout for the passed in rootWindow.
   *
   * @param {String} layoutName The name of the new layout
   * @param {Object} win        The window to create the layout from.
   * @returns {Promise} Resolves when new layout is successfully stored.
   */
  Layout.addUserLayout = function(layoutName, win) {
    var layoutSpec = CATMAID.Layout.makeLayoutSpecForWindow(win);
    if (!layoutSpec) {
      return Promise.reject(new CATMAID.ValueError(
          'Could not create layout for passed in CATMAID window'));
    }
    layoutSpec = 'layout(\'' + layoutName + '\', ' + layoutSpec + ')';
    let newUserLayouts = CATMAID.Layout.Settings.session.user_layouts.concat([layoutSpec]);
    return CATMAID.Layout.Settings
        .set( 'user_layouts', newUserLayouts, 'session')
        .then(function() {
          CATMAID.Layout.trigger(CATMAID.Layout.EVENT_USER_LAYOUT_CHANGED);
        });
  };

  /**
   * Glue code for map().
   */
  function mapNodeToLayoutSpec(node) {
    /* jshint validthis: true */
    return nodeToLayoutSpec(node, this);
  }

  function nodeToLayoutSpec(node, stackViewerMapping) {
    if (node instanceof CMWHSplitNode) {
      return 'h(' + nodeToLayoutSpec(node.child1, stackViewerMapping) + ', ' +
          nodeToLayoutSpec(node.child2, stackViewerMapping) + ', ' +
          Number(node.widthRatio).toFixed(2) + ')';
    } else if (node instanceof CMWVSplitNode) {
      return 'v(' + nodeToLayoutSpec(node.child1, stackViewerMapping) + ', ' +
          nodeToLayoutSpec(node.child2, stackViewerMapping) + ', ' +
          Number(node.heightRatio).toFixed(2) + ')';
    } else if (node instanceof CMWTabbedNode) {
      return 't(' + node.children.map(mapNodeToLayoutSpec, stackViewerMapping).join(', ') + ')';
    } else if (node instanceof CMWWindow) {
      var stackViewer = stackViewerMapping.get(node);
      if (stackViewer) {
        var orientation = stackViewer.primaryStack.orientation;
        if (orientation === CATMAID.Stack.ORIENTATION_XY) {
          return 'XY';
        } else if (orientation === CATMAID.Stack.ORIENTATION_ZY) {
          return 'ZY';
        } else if (orientation === CATMAID.Stack.ORIENTATION_XZ) {
          return 'XZ';
        } else {
          throw new CATMAID.ValueError("Unknown orientation " + orientation +
              " of node " + stackViewer);
        }
      }
      // Figure out what window the current display
      var widgetInfo = CATMAID.WindowMaker.getWidgetKeyForWindow(node);
      if (!widgetInfo) {
        throw new CATMAID.ValueError('Could not find key for window ' +
            node.id + ' of type ' + node.constructor.name);
      }
      return "'" + widgetInfo.key + "'";
    } else {
      throw new CATMAID.ValueError('Unknown window type: ' + node);
    }
  }

  function toWindowMapping(stackViewer) {
    return [stackViewer.getWindow(), stackViewer];
  }

  /**
   * Create a new layout specification for the passed in window or return null
   * of this is not possible.
   */
  Layout.makeLayoutSpecForWindow = function(rootNode) {
    if (!rootNode.child) {
      return null;
    }
    let stackViewerWindowMapping = new Map(project.getStackViewers().map(toWindowMapping));
    return nodeToLayoutSpec(rootNode.child, stackViewerWindowMapping);
  };

  /**
   * A layout is valid if all expected views are found.
   */
  Layout.prototype.matches = function(stackViewers, views) {
    var allWindows = CATMAID.rootWindow.getWindows();

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
          stackViewerCountMatchesLayout(stackViewers, this._layout),
      regularWindowsToCreate: regularWindowsToCreate,
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
        CATMAID.warn('Could not create ' + windowsLeftToCreate + ' regular windows');
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
        },
        user_layouts: {
          // Users can store custom layouts in objects of the following form:
          // layout("A layout name", h(v(XY, XZ), v(ZY, o(F1)))).
          default: []
        },
      }
    });

  CATMAID.asEventSource(Layout);
  Layout.EVENT_USER_LAYOUT_CHANGED = "init_user_layouts_changed";

  // Export layout
  CATMAID.Layout = Layout;

})(CATMAID);
