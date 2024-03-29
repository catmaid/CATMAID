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
    return WindowMaker.create('keyboard-shortcuts');
  };

  /**
   * Opening the 3D viewer creates a vertical split node with the 3D Viewer on
   * top of a newly created Selection Table. To be able to use the 3D viewer in
   * with the data structures below, we need to return the newly created node
   * thats highest in the window hierarchy. In this case this is the parent of
   * the 3D Viewer.
   */
  WindowBuilder[X3D] = function() {
    var win = WindowMaker.create('3d-viewer').window;
    var splitNode = win.getParent();
    return {
      window: splitNode,
      widget: null,
    };
  };

  /**
   * For a regular 3D Viewer request, make sure no extra Selection Table is
   * created. We want to handle the Selection Table (if any) separately as well
   * as any subscriptions.
   */
  WindowBuilder['3d-viewer'] = function(state) {
    return WindowMaker.create('3d-viewer', {
      selectionTable: false,
    }, false, state);
  };

  const createWindow = function(name, options, skeletonIds, state) {
    var creator = WindowBuilder[name];
    if (!creator) {
      creator = function(widgetState) {
        return WindowMaker.create(name, options, false, widgetState);
      };
    }
    if (!creator) {
      throw new CATMAID.ValueError("Could not find window creator for: " + name);
    }
    var windowInfo = creator(state ? state.state : undefined);
    if (!windowInfo || !windowInfo.window) {
      throw new CATMAID.ValueError("Could not create window for: " + name);
    }

    // TODO: This should be better taken care of in the WindowMaker namespace,
    // but will be okay for now here.
    if (state && state.env) {
      if (state.env.ignoreLocal !== undefined){
        windowInfo.widget.ignoreLocal = state.env.ignoreLocal;
      }
    }

    // If initial skeleton IDs are provided, try to add them to the created
    // widget.
    if (skeletonIds && windowInfo.widget) {
      if (isFn(windowInfo.widget.append)) {
        let models = skeletonIds.reduce((o, skeleton) => {
          // If skeleton_ids elements are objects, we expect at least an "id" field, but also accept "color".
          if (skeleton instanceof Object) {
             o[skeleton.id] = CATMAID.SkeletonModel.deserialize(skeleton);
          } else {
            o[skeleton.id] = new CATMAID.SkeletonModel(skeleton);
          }
          return o;
        }, {});
        windowInfo.widget.append(models, true);
      }
    }

    return windowInfo.window;
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
    var a = this._a = isFn(this.a.makeNode) ?
        this.a.makeNode(windows) : windows.get(this.a).pop();
    return a;
  };

  SingleNode.prototype.makeRegularWindows = function(n, target) {
    if (n === 0) {
      return 0;
    }
    if (isFn(this.a.makeRegularWindows)) {
      n = this.a.makeRegularWindows(n, target);
    } else if (!validOrientations.has(this.a)) {
      var win = createWindow(this.a);
      var typedWindows = target.get(this.a);
      if (!typedWindows) {
        typedWindows = [];
        target.set(this.a, []);
      }
      typedWindows.push(win);
      --n;
    }
    return n;
  };

  SingleNode.prototype.getSubscriptions = function(target) {
    if (isFn(this.a.getSubscriptions)) {
      return this.a.getSubscriptions(target);
    }
    if (this.meta) {
      if (this.meta.id) {
        if (!this._a) {
          throw new CATMAID.ValueError("Expected created layout node A");
        }
        target.idIndex.set(this.meta.id, this._a);
      }

      if (this.meta.subscriptions) {
        var sub = this.meta.subscriptions;
        if (sub.length > 0 && !this._a) {
          throw new CATMAID.ValueError("Expected created layout node A");
        }
        for (var i=0; i<sub.length; ++i) {
          var sub = sub[i];
          target.subscriptions.push({
            source: sub.source,
            target: this._a,
            targetMeta: this.meta,
          });
        }
      }
    }
    return target;
  };


  const MultiNode = function() {};
  MultiNode.prototype = Object.create(LayaoutNode.prototype);
  MultiNode.prototype.constructor = MultiNode;

  MultiNode.prototype.missingViews = function(views) {
    for (var i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      if (isFn(c.missingViews)) {
          c.missingViews(views);
      } else {
        views.delete(typeof(c) === 'number' ? c : c.type);
      }
    }
  };

  MultiNode.prototype.minStackViewers = function() {
    var result = 0;
    for (var i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      result += isFn(c.minStackViewers) ?
          c.minStackViewers() : (validOrientations.has(typeof(c) === 'number' ? c : c.type) ? 1 : 0);
    }
    return result;
  };

  MultiNode.prototype.maxStackViewers = function() {
    var result = 0;
    for (var i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      result += isFn(c.maxStackViewers) ?
          c.maxStackViewers() : (validOrientations.has(typeof(c) === 'number' ? c : c.type) ? 1 : 0);
    }
    return result;
  };

  MultiNode.prototype.regularWindows = function() {
    var result = 0;
    for (var i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      result += isFn(c.regularWindows) ?
          c.regularWindows() : (validOrientations.has(typeof(c) === 'number' ? c : c.type) ? 0 : 1);
    }
    return result;
  };

  MultiNode.prototype.makeNode = function(windows) {
    var childNodes = [];
    for (var i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      var a = isFn(c.makeNode) ?
          c.makeNode(windows) : windows.get(validOrientations.has(c) ? c : c.type).pop();
      childNodes.push(a);
    }
    this._nodes = Array.from(childNodes);
    return new this.NodeType(childNodes, this.activeIndex);
  };

  MultiNode.prototype.makeRegularWindows = function(n, target) {
    if (n === 0) {
      return n;
    }
    for (var i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      if (isFn(c.makeRegularWindows)) {
        n = n - c.makeRegularWindows(n, target);
      } else if (!validOrientations.has(typeof(c) === 'number' ? c : c.type)) {
        var win = createWindow(c.type, c.meta.options, c.meta.skeletons, c.meta.state);
        var typedWindows = target.get(c.type);
        if (!typedWindows) {
          typedWindows = [];
          target.set(c.type, typedWindows);
        }
        typedWindows.push(win);
        --n;
      }
    }
    return n;
  };

  MultiNode.prototype.getSubscriptions = function(target) {
    for (let i=0; i<this.children.length; ++i) {
      var c = this.children[i];
      if (isFn(c.getSubscriptions)) {
        c.getSubscriptions(target);
      } else if (c.meta) {
        if (c.meta.id) {
          if (!this._nodes[i]) {
            throw new CATMAID.ValueError("Expected created node in multi node context");
          }
          target.idIndex.set(c.meta.id, this._nodes[i]);
        }

        if (c.meta.subscriptions) {
          var subs = c.meta.subscriptions;
          if (subs.length > 0 && !this._nodes[i]) {
            throw new CATMAID.ValueError("Expected created node in multi node context");
          }
          for (let j=0; j<subs.length; ++j) {
            var sub = subs[j];
            target.subscriptions.push({
              source: sub.source,
              target: this._nodes[j],
              targetMeta: c.meta,
            });
          }
        }
      }
    }
    return target;
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
    var a = this._a = isFn(this.a.makeNode) ?
        this.a.makeNode(windows) : windows.get(this.a).pop();
    var b = this._b = isFn(this.b.makeNode) ?
        this.b.makeNode(windows) : windows.get(this.b).pop();
    return new this.NodeType(a, b);
  };

  Node.prototype.makeRegularWindows = function(n, target) {
    if (n === 0) {
      return 0;
    }
    if (isFn(this.a.makeRegularWindows)) {
      n = this.a.makeRegularWindows(n, target);
    } else if (!validOrientations.has(this.a)) {
      var win = createWindow(this.a, this.metaA.options, this.metaA.skeletons, this.metaA.state);
      var typedWindows = target.get(this.a);
      if (!typedWindows) {
        typedWindows = [];
        target.set(this.a, typedWindows);
      }
      typedWindows.push(win);
      --n;
    }
    if (isFn(this.b.makeRegularWindows)) {
      n = this.b.makeRegularWindows(n, target);
    } else if (!validOrientations.has(this.b)) {
      var win = createWindow(this.b, this.metaB.options, this.metaB.skeletons, this.metaB.state);
      var typedWindows = target.get(this.b);
      if (!typedWindows) {
        typedWindows = [];
        target.set(this.b, typedWindows);
      }
      typedWindows.push(win);
      --n;
    }
    return n;
  };

  Node.prototype.getSubscriptions = function(target) {
    if (isFn(this.a.getSubscriptions)) {
        this.a.getSubscriptions(target);
    }
    if (isFn(this.b.getSubscriptions)) {
        this.b.getSubscriptions(target);
    }

    if (this.metaA.id) {
      if (!this._a) {
        throw new CATMAID.ValueError("Expected created layout node A");
      }
      target.idIndex.set(this.metaA.id, this._a);
    }

    if (this.metaB.id) {
      if (!this._b) {
        throw new CATMAID.ValueError("Expected created layout node B");
      }
      target.idIndex.set(this.metaB.id, this._b);
    }

    if (this.metaA.subscriptions) {
      var subA = this.metaA.subscriptions;
      if (subA.length > 0 && !this._a) {
        throw new CATMAID.ValueError("Expected created layout node A");
      }
      for (var i=0; i<subA.length; ++i) {
        var sub = subA[i];
        target.subscriptions.push({
          source: sub.source,
          target: this._a,
          targetMeta: this.metaA,
        });
      }
    }

    if (this.metaB.subscriptions) {
      var subB = this.metaB.subscriptions;
      if (subB.length > 0 && !this._b) {
        throw new CATMAID.ValueError("Expected created layout node B");
      }
      for (var i=0; i<subB.length; ++i) {
        var sub = subB[i];
        target.subscriptions.push({
          source: sub.source,
          target: this._b,
          targetMeta: this.metaB,
        });
      }
    }

    return target;
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
    return windows.get(this.a).pop();
  };

  OptionalNode.prototype.makeRegularWindows = function(n, target) {
    if (n === 0) {
      return 0;
    }
    var win = createWindow(this.a);
    var typedWindows = target.get(this.a);
    if (!typedWindows) {
      typedWindows = [];
      target.set(this.a, typedWindows);
    }
    typedWindows.push(win);
    return n - 1;
  };

  OptionalNode.prototype.getSubscriptions = function(target) {
    // No subscriptions for optional nodes for now.
    return target;
  };


  function assignNodeInfo(node, field, metaField, value) {
    if (typeof(value) === 'object' && !(value instanceof LayaoutNode)) {
      // Special case: stack viewers that come with meta data (i.e. that are
      // not only XY, YZ, XZ, will get their proper orientation used as value.
      if (value.type === 'stackviewer') {
        node[field] = value.orientation;
      } else {
        node[field] = value.type;
      }
      node[metaField] = value;
    } else {
      node[field] = value;
      node[metaField] = {};
    }
  }


  var VNode = function(a, b, ratio) {
    this.ratio = CATMAID.tools.getDefined(ratio, 0.5);
    assignNodeInfo(this, 'a', 'metaA', a);
    assignNodeInfo(this, 'b', 'metaB', b);
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
    assignNodeInfo(this, 'a', 'metaA',  a);
    assignNodeInfo(this, 'b', 'metaB', b);
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
    assignNodeInfo(this, 'a', 'meta', a);
  };

  ONode.prototype = Object.create(OptionalNode.prototype);
  ONode.prototype.constructor = ONode;


  var WNode = function(a) {
    assignNodeInfo(this, 'a', 'meta', a);
    this.NodeType = CMWWindow;
  };
  WNode.prototype = Object.create(SingleNode.prototype);
  WNode.prototype.constructor = WNode;


  var TNode = function(a, activeIndex=0) {
    this.children = a.map(function(c) {
      if (typeof(c) === 'object' && !(c instanceof LayaoutNode)) {
        let child = {};
        assignNodeInfo(child, 'type', 'meta', c);
        return child;
      } else {
        return c;
      }
    });
    this.activeIndex = activeIndex;
    this.NodeType = CMWTabbedNode;
  };
  TNode.prototype = Object.create(MultiNode.prototype);
  TNode.prototype.constructor = TNode;


  /**
   * Functions allowed for layout specification. They are run through evil eval
   * when "executing" a layout. Since these functions are only used in layouts,
   * we would normally get JSHint's "defined but never used" error. To avoid
   * this we suppress this particular error for these functions.
   *
   */

  /*jshint -W098 */

  function v(a, b, ratio) {
    return new VNode(a, b, ratio);
  }

  function h(a, b, ratio) {
    return new HNode(a, b, ratio);
  }

  function t(children, activeIndex=0) {
    return new TNode(children, activeIndex);
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

  /*jshint +W098 */

  function getViewIndex(stackViewers) {
    return stackViewers.reduce(function(o, s) {
      let views = o[s.primaryStack.orientation];
      if (!views) {
        o[s.primaryStack.orientation] = views = [];
      }
      views.push(s);
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

  /**
   * Switch to a new layout.
   */
  CATMAID.switchToLayout = function(newLayout, silent = false) {
    if (!silent && !confirm("Are you sure you want close all existing widgets?")) {
      return;
    }

    var stackViewers = project.getStackViewers();
    var viewIndex = getViewIndex(stackViewers);

    if (!stackViewerCountMatchesLayout(stackViewers, newLayout._layout)) {
      CATMAID.warn("Can't load layout, Other stack viewer configuration expected");
      return;
    }

    // Close all open widgets
    CATMAID.WindowMaker.closeAllButStackViewers(stackViewers);

    // Now test if the layout really matches
    var matchResult = newLayout.matches(stackViewers, viewIndex);
    if (!matchResult.matches) {
      CATMAID.warn("Can't load layout, Other window configuration expected");
      return;
    }

    // Run new layout
    newLayout.run(stackViewers, viewIndex, matchResult);

    // Unfocus any active element after 50ms
    setTimeout(function() {
      if (document.activeElement) {
        document.activeElement.blur();
      }
    }, 50);

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

  function orientationToKeyword(orientation) {
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

  /**
   * Glue code for map().
   */
  function mapNodeToLayoutSpec(node) {
    /* jshint validthis: true */
    return nodeToLayoutSpec(node, this.stackViewerMapping,
        this.subscriptionInfo, this.withSkeletons, this.withWidgetSettings,
        this.ignoredWindowTitle);
  }

  function nodeToLayoutSpec(node, stackViewerMapping, subscriptionInfo, withSkeletons = true,
      withWidgetSettings = true, ignoredWindowTitle = null) {
    if (node instanceof CMWHSplitNode) {
      if (ignoredWindowTitle) {
        if (ignoredWindowTitle === node.child1.title) {
          return nodeToLayoutSpec(node.child2, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle);
        } else if (ignoredWindowTitle === node.child2.title){
          return nodeToLayoutSpec(node.child1, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle);
        }
      }
      return 'h(' +
          nodeToLayoutSpec(node.child1, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle) + ', ' +
          nodeToLayoutSpec(node.child2, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle) + ', ' +
          Number(node.widthRatio).toFixed(2) + ')';
    } else if (node instanceof CMWVSplitNode) {
      if (ignoredWindowTitle) {
        if (ignoredWindowTitle === node.child1.title) {
          return nodeToLayoutSpec(node.child2, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle);
        } else if (ignoredWindowTitle === node.child2.title){
          return nodeToLayoutSpec(node.child1, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle);
        }
      }
      return 'v(' +
          nodeToLayoutSpec(node.child1, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle) + ', ' +
          nodeToLayoutSpec(node.child2, stackViewerMapping, subscriptionInfo,
              withSkeletons, withWidgetSettings, ignoredWindowTitle) + ', ' +
          Number(node.heightRatio).toFixed(2) + ')';
    } else if (node instanceof CMWTabbedNode) {
      return 't([' + node.children.map(mapNodeToLayoutSpec, {
          stackViewerMapping: stackViewerMapping,
          subscriptionInfo: subscriptionInfo,
          withSkeletons: withSkeletons,
          withWidgetSettings: withWidgetSettings,
          ignoredWindowTitle: ignoredWindowTitle,
        }).filter((c, i) => {
          return !ignoredWindowTitle || ignoredWindowTitle !== node.children[i].title;
        }).join(', ') + `], ${node.children.indexOf(node.activeChild)})`;
    } else if (node instanceof CMWWindow) {
      var stackViewer = stackViewerMapping.get(node);
      if (stackViewer) {
        let orientation = orientationToKeyword(stackViewer.primaryStack.orientation);
        // Check if there are subscriptions on any tracing layer shown in this
        // viewer. If so, return an extended version of this stack reference to
        // include this information.
        let layers = stackViewer.getLayers();
        let subscriptionComponents = [];
        for (let [key, l] of layers) {
          if (l instanceof CATMAID.TracingLayer) {
            let skeletonSource = l.tracingOverlay._skeletonDisplaySource;
            if (skeletonSource) {
              let subs = skeletonSource.getSourceSubscriptions();
              // If this widget contains any subscriptions, add them to the output.
              var isSubscriptionTaget = subscriptionInfo.subscriptions.has(skeletonSource) &&
                  subscriptionInfo.subscriptions.get(skeletonSource).length > 0;
              if (isSubscriptionTaget) {
                var subscriptions = subscriptionInfo.subscriptions.get(skeletonSource);
                for (var i=0; i<subscriptions.length; ++i) {
                  subscriptionComponents.push(subscriptions[i]);
                }
              }
            }
          }
        }
        if (subscriptionComponents.length > 0) {
          var components = [`{ type: "stackviewer", orientation: ${orientation}`];
          var isSubscriptionSource = subscriptionInfo.idIndex.has(stackViewer);
           if (isSubscriptionSource) {
            components.push(', id: "', subscriptionInfo.idIndex.get(skeletonSource), '"');
          }
          components.push(', subscriptions: [');
          for (let s of subscriptionComponents) {
            components.push('{ source: "',
                subscriptionInfo.idIndex.get(s.source), '"');
            components.push(', target: "',
                subscriptionInfo.idIndex.get(s.target), '" }');
          }
          components.push(']');
          components.push(' }');
          return components.join('');
        } else {
          return orientation;
        }
      }
      // Figure out what window the current display
      var widgetInfo = CATMAID.WindowMaker.getWidgetKeyForWindow(node);
      if (!widgetInfo) {
        throw new CATMAID.ValueError('Could not find key for window ' +
            node.id + ' of type ' + node.constructor.name);
      }

      // Store skeletons, if any.
      let widgetSkeletons;
      if (withSkeletons) {
        let models;
        if (widgetInfo.widget) {
          if (CATMAID.tools.isFn(widgetInfo.widget.getInputModels)) {
            models = widgetInfo.widget.getInputModels();
          } else if (CATMAID.tools.isFn(widgetInfo.widget.getSkeletonModels)) {
            models = widgetInfo.widget.getSkeletonModels();
          }
        }
        if (models) {
          let skeletons = Object.values(models).map(m => m.serialize());
          if (skeletons.length > 0) {
            widgetSkeletons = `"skeletons": [${skeletons.join(',')}]`;
          }
        }
      }

      // Store widget settings, if requested
      let widgetSettings;
      if (withWidgetSettings && widgetInfo.widget) {
        let state = CATMAID.getWidgetState(widgetInfo.widget, true);
        if (state) {
          state = state.replace(/"/g, "'");
          widgetSettings = `"state": ${state}`;
        }
      }

      // If this widget contains any subscriptions, add them to the output.
      var isSubscriptionSource = subscriptionInfo.idIndex.has(widgetInfo.widget);
      var isSubscriptionTaget = subscriptionInfo.subscriptions.has(widgetInfo.widget) &&
          subscriptionInfo.subscriptions.get(widgetInfo.widget).length > 0;
      if (isSubscriptionSource || isSubscriptionTaget) {
        var components = ['{ type: "', widgetInfo.key, '"'];
        if (widgetSkeletons) {
          components.push(', ', widgetSkeletons);
        }
        if (widgetSettings) {
          components.push(', ', widgetSettings);
        }
        if (isSubscriptionSource) {
          components.push(', id: "', subscriptionInfo.idIndex.get(widgetInfo.widget), '"');
        }
        if (isSubscriptionTaget) {
          components.push(', subscriptions: [');
          var subscriptions = subscriptionInfo.subscriptions.get(widgetInfo.widget);
          for (var i=0; i<subscriptions.length; ++i) {
            components.push('{ source: "',
                subscriptionInfo.idIndex.get(subscriptions[i].source), '" }');
          }
          components.push(']');
        }
        components.push(' }');
        return components.join('');
      } else {
        return "'" + widgetInfo.key + "'";
      }
    } else {
      throw new CATMAID.ValueError('Unknown window type: ' + node);
    }
  }

  function toWindowMapping(stackViewer) {
    return [stackViewer.getWindow(), stackViewer];
  }

  function getSubscriptionInfo(node, target) {
    if (node instanceof CMWHSplitNode || node instanceof CMWVSplitNode) {
      getSubscriptionInfo(node.child1, target);
      getSubscriptionInfo(node.child2, target);
    } else if (node instanceof CMWTabbedNode) {
      for (var i=0; i<node.children.length; ++i) {
        getSubscriptionInfo(node.children[i], target);
      }
    } else if (node instanceof CMWWindow) {
      // Figure out what window the current display is
      var widgetInfo = CATMAID.WindowMaker.getWidgetKeyForWindow(node);
      if (widgetInfo) {
        // Keep track of widgets per type
        var typeCount = target.typeCount.get(widgetInfo.key);
        if (!typeCount) {
          typeCount = 0;
        }
        ++typeCount;
        target.typeCount.set(widgetInfo.key, typeCount);

        // Add widget to ID index
        target.idIndex.set(widgetInfo.widget, widgetInfo.key + '-' + typeCount);
      } else {
        let stackViewerWindowMapping = new Map(project.getStackViewers().map(toWindowMapping));
        let stackViewer = stackViewerWindowMapping.get(node);
        if (stackViewer) {
          for (let [key, l] of stackViewer.getLayers()) {
            if (l instanceof CATMAID.TracingLayer) {
              let source = l.tracingOverlay._skeletonDisplaySource;
              const key = 'tracinglayer';
              if (source) {
                // Keep track of widgets per type
                var typeCount = target.typeCount.get(key);
                if (!typeCount) {
                  typeCount = 0;
                }
                ++typeCount;
                target.typeCount.set(key, typeCount);

                // Add widget to ID index
                target.idIndex.set(source, key + '-' + typeCount);
              }
            }
          }
        }
      }
      return target;
    } else {
      throw new CATMAID.ValueError('Unknown window type: ' + node);
    }
    return target;
  }

  function getSubscriptions(node) {
    var subscriptionInfo = getSubscriptionInfo(node, {
      'idIndex': new Map(),
      'typeCount': new Map(),
      'subscriptions': new Map(),
      'sources': new Set(),
    })  ;

    let regularSources = Object.values(CATMAID.skeletonListSources.sources);
    let sources = [
        ...regularSources,
        ...regularSources.reduce((o, s) => {
          if (s instanceof CATMAID.TracingOverlay) {
            o.push(s._skeletonDisplaySource);
          }
          return o;
        }, [])
    ];

    // Add actual subscriptions. Widgets can only have subscriptions if they
    // are registered skeleton sources.
    for (var source of sources) {
      var subscriptions = source.getSourceSubscriptions();
      if (subscriptions && subscriptions.length > 0) {
        var subList = subscriptionInfo.subscriptions.get(source);
        if (!subList) {
          subList = [];
          subscriptionInfo.subscriptions.set(source, subList);
        }
        for (var i=0; i<subscriptions.length; ++i) {
          subList.push(subscriptions[i]);
          subscriptionInfo.sources.add(subscriptions[i].source);
        }
      }
    }

    // Remove all dbIndex entry that is actually not refenced in a subscription
    for (var indexedWidget of subscriptionInfo.idIndex) {
      if (!subscriptionInfo.sources.has(indexedWidget)) {
        subscriptionInfo.idIndex.delete(indexedWidget);
        continue;
      }
    }

    return subscriptionInfo;
  }

  /**
   * Create a new layout specification for the passed in window or return null
   * of this is not possible.
   */
  Layout.makeLayoutSpecForWindow = function(rootNode, withSkeletons = true,
      withWidgetSettings = true, ignoredWindowTitle = null) {
    if (!rootNode.child) {
      return null;
    }
    let stackViewerWindowMapping = new Map(project.getStackViewers().map(toWindowMapping));
    return nodeToLayoutSpec(rootNode.child, stackViewerWindowMapping,
        getSubscriptions(rootNode.child), withSkeletons, withWidgetSettings, ignoredWindowTitle);
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
      var stackViewersWithO = views[o];
      var typedWindows = windows.get(o);
      if (stackViewersWithO) {
        if (!typedWindows) {
          typedWindows = [];
          windows.set(o, typedWindows);
        }
        for (let stackViewer of stackViewersWithO) {
          var w = stackViewer.getWindow();
          typedWindows.push(w);
          seenWindows.add(w);
        }
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

    // Windows are consumed by makeNode().
    CATMAID.rootWindow.replaceChild(this._layout.makeNode(windows));

    // Set up any referenced subscriptions
    var subscriptionInfo = this._layout.getSubscriptions({
      'idIndex': new Map(),
      'subscriptions': [],
    });
    for (var i=0; i<subscriptionInfo.subscriptions.length; ++i) {
      var sub = subscriptionInfo.subscriptions[i];
      var Subscription = CATMAID.SkeletonSourceSubscription;

      var sourceWindow = subscriptionInfo.idIndex.get(sub.source);
      if (!sourceWindow) {
        CATMAID.warn('Could not find source window: ' + sub.source);
        continue;
      }

      var sourceWidget = CATMAID.WindowMaker.getWidgetKeyForWindow(sourceWindow);
      var targetWidget = CATMAID.WindowMaker.getWidgetKeyForWindow(sub.target);
      if (!sourceWindow || !targetWidget) {
        let stackViewerWindowMapping = new Map(project.getStackViewers().map(toWindowMapping));
        if (!sourceWidget) {
          CATMAID.warn('Could not find subscription source: ' + subscription.source);
          continue;
        }

        if (!targetWidget) {
          let stackViewer = stackViewerWindowMapping.get(sub.target);
          if (!stackViewer) {
            CATMAID.warn('Could not find target widget');
            continue;
          }
          // In order to add subscriptions to e.g. tracing layers without
          // knowing when they are ininitialized, we let the stack viewer
          // know it should add a subscription when layers are added that
          // match the target pattern.
          if (sub.targetMeta && sub.targetMeta.subscriptions) {
            for (let layerSub of sub.targetMeta.subscriptions) {
              var layerSubSourceWindow = subscriptionInfo.idIndex.get(layerSub.source);
              var layerSubSourceWidget = CATMAID.WindowMaker.getWidgetKeyForWindow(layerSubSourceWindow);
              if (!layerSubSourceWidget) {
                CATMAID.warn('Could not find soure widget for layer subscripton');
                continue;
              }
              stackViewer.addDefaultSubscription(layerSubSourceWidget.widget, layerSub.target, layerSub);
              continue;
            }
            continue;
          }
        }
      }

      var subscription = new Subscription(sourceWidget.widget,
          CATMAID.tools.getDefined(sub.colors, true),
          CATMAID.tools.getDefined(sub.selectionBased, false),
          CATMAID.tools.getDefined(sub.op, CATMAID.SkeletonSource.UNION),
          CATMAID.tools.getDefined(sub.group, Subscription.ALL_EVENTS));

      targetWidget.widget.addSubscription(subscription, true);

      // Override existing local models if subscriptions are updated
      if (sub.ignoreLocal) {
        targetWidget.widget.ignoreLocal = true;
      }
    }
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
