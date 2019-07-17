/**
 * Tiled window manager for frame-like Javascript-`windows'.
 *
 * Tiled window configurations are expressed as a binary tree with branch
 * nodes being split horizontally or vertically and leaf-nodes being the
 * actual windows.
 */

/**
 * Node prototype
 */
function CMWNode(){}

CMWNode.CMWNodeUniqueId = 0;

CMWNode.FRAME_CLASS = 'CMWFrame';

CMWNode.prototype.uniqueId = function()
{
  return CMWNode.CMWNodeUniqueId++;
};

/**
 * @return width of the node in pixels
 */
CMWNode.prototype.getWidth = function()
{
  var frame = this.getFrame();
  if ( frame.offsetWidth )
    return frame.offsetWidth;
  else
    return 0;
};

/**
 * @return height of the node in pixels
 */
CMWNode.prototype.getHeight = function()
{
  var frame = this.getFrame();
  if ( frame.offsetHeight )
    return frame.offsetHeight;
  else
    return 0;
};

/**
 * @return available width of the node in pixels (without resize handle or alike structures)
 */
CMWNode.prototype.getAvailableWidth = function()
{
  var parent = this.getParent();
  var w = this.getWidth();
  if ( !parent )
    return w;
  else if ( parent.getResizeHandleView && parent.getLeftChild && parent.getLeftChild() == this )
    return w - parent.getResizeHandleView().offsetWidth;
  else
    return w - parent.getWidth() + parent.getAvailableWidth();
};

/**
 * @return available height of the node in pixels (without resize handle or alike structures)
 */
CMWNode.prototype.getAvailableHeight = function()
{
  var parent = this.getParent();
  var h = this.getHeight();
  if ( !parent )
    return h;
  else if ( parent.getResizeHandleView && parent.getTopChild && parent.getTopChild() == this )
    return h - parent.getResizeHandleView().offsetHeight;
  else
    return h - parent.getHeight() + parent.getAvailableHeight();
};

/**
 * @return left position of the node in pixels
 */
CMWNode.prototype.getLeft = function()
{
  var frame = this.getFrame();
  if ( frame.style.left )
    return parseInt( frame.style.left );
  else
    return 0;
};

/**
 * @return top position of the node in pixels
 */
CMWNode.prototype.getTop = function()
{
  var frame = this.getFrame();
  if ( frame.style.top )
    return parseInt( frame.style.top );
  else
    return 0;
};



/**
 * Root node
 */
function CMWRootNode() {
  this.child = null;

  this.id = this.uniqueId();

  this.frame = document.createElement("div");
  this.frame.style.position = "absolute";
  this.frame.id = "CMW" + this.id;
  this.frame.style.top = "0px";
}

CMWRootNode.prototype = new CMWNode();
CMWRootNode.prototype.constructor = CMWRootNode;

CMWRootNode.prototype.getId = function () {
  return this.id;
};

CMWRootNode.prototype.getFrame = function () {
  return this.frame;
};

CMWRootNode.prototype.getChild = function () {
  return this.child;
};

CMWRootNode.prototype.getChildren = function () {
  var children = [];
  if (this.child !== null)
  {
    children.push(this.child);
    children = children.concat(this.child.getChildren());
  }
  return children;
};

CMWRootNode.prototype.getWindows = function () {
  if (this.child !== null)
    return this.child.getWindows();
  else
    return [];
};

CMWRootNode.prototype.replaceChild = function (newChild) {
  this.child = newChild;
  if (this.frame.lastChild)
    this.frame.removeChild(this.frame.lastChild);
  this.frame.appendChild(this.child.getFrame());
  this.child.setParent(this);
  this.redraw();
};

/**
 * @return {CMWRootNode} this (allows chains of calls like myRootNode.redraw().show())
 */
CMWRootNode.prototype.redraw = function () {
  if (this.child) this.child.redraw();

  return this;
};

CMWRootNode.prototype.getAvailableWidth = function () {
  return this.getWidth();
};

CMWRootNode.prototype.getAvailableHeight = function () {
  return this.getHeight();
};

CMWRootNode.prototype.catchDrag = function () {
  this._boundReleaseDrag = this._boundReleaseDrag || this.releaseDrag.bind(this);
  CATMAID.ui.catchFocus();
  CATMAID.ui.registerEvent("onpointerup", this._boundReleaseDrag);
  CATMAID.ui.catchEvents();
  if (this.child !== null) this.child.catchDrag();
};

CMWRootNode.prototype.releaseDrag = function () {
  CATMAID.ui.releaseEvents();
  CATMAID.ui.removeEvent("onpointerup", this._boundReleaseDrag);
  if (this.child !== null) this.child.releaseDrag();
};

CMWRootNode.prototype.toXML = function () {
  return "<root id\"" + this.id + "\">\n" + this.child.toXML("\t") + "\n</root>";
};

/**
 * Empty close method that can be overridden to any needs.  The method is
 * called by the last open window on closing.
 */
CMWRootNode.prototype.close = function () {
  this.child = null;
};

CMWRootNode.prototype.getRootNode = function () {
  return this;
};

/**
 * Closes all children of the root node. Because closing one node can
 * implicitly cause the closing of other windows (e.g. if a project is
 * destroyed), each window to close is fetched one after the other.
 * This prevents closing a window object twice.
 */
CMWRootNode.prototype.closeAllChildren = function () {
  var windows = this.getWindows();
  while (windows.length > 0) {
    windows[0].close();
    // Refresh list of windows still open
    windows = this.getWindows();
  }
};



/**
 * Horizontal split node
 */
function CMWHSplitNode(child1, child2) {
  this.id = this.uniqueId();

  this.parent = null;

  this.child1 = child1;

  this.child2 = child2;

  if (typeof this.child1 === "undefined")
    this.child1 = new CMWWindow("Window 1");
  if (typeof this.child2 === "undefined")
    this.child2 = new CMWWindow("Window 2");

  this.child1.setParent(this);
  this.child2.setParent(this);

  this.frame = document.createElement("div");
  this.frame.className = CMWNode.FRAME_CLASS;
  this.frame.style.position = "absolute";
  this.frame.id = "CMW" + this.id;
  this.frame.style.top = "0px";
  this.frame.style.bottom = "0px";

  this.resizeHandle = new ResizeHandle("h", this);

  var child1Frame = this.child1.getFrame();
  child1Frame.style.left = "0px";
  child1Frame.style.top = "0px";
  child1Frame.style.width = "";
  child1Frame.style.height = "";

  var child2Frame = this.child2.getFrame();
  child2Frame.style.left = "0px";
  child2Frame.style.top = "0px";
  child2Frame.style.width = "";
  child2Frame.style.height = "";

  this.frame.appendChild(child1Frame);
  this.frame.appendChild(child2Frame);

  child1Frame.appendChild(this.resizeHandle.getView());


  this.widthRatio = 0.5;
}

CMWHSplitNode.prototype = new CMWNode();
CMWHSplitNode.prototype.constructor = CMWHSplitNode;

CMWHSplitNode.prototype.getId = function () {
  return this.id;
};

CMWHSplitNode.prototype.getFrame = function () {
  return this.frame;
};

CMWHSplitNode.prototype.getParent = function () {
  return this.parent;
};

/**
 * Set the parent node.
 *
 * @param {Object} newParent
 * @return former parent node
 */
CMWHSplitNode.prototype.setParent = function (newParent) {
  var oldParent = this.parent;
  this.parent = newParent;
  return oldParent;
};

CMWHSplitNode.prototype.getRootNode = function () {
  return this.parent.getRootNode();
};

CMWHSplitNode.prototype.getLeftChild = function () {
  return this.child1;
};

CMWHSplitNode.prototype.getRightChild = function () {
  return this.child2;
};

CMWHSplitNode.prototype.getChildren = function () {
  return [this.child1, this.child2]
      .concat(this.child1.getChildren())
      .concat(this.child2.getChildren());
};

CMWHSplitNode.prototype.getWindows = function () {
  return this.child1.getWindows().concat(this.child2.getWindows());
};

CMWHSplitNode.prototype.redraw = function () {
  var f1 = this.child1.getFrame();
  var f2 = this.child2.getFrame();
  var w = this.getWidth();
  var h = this.getHeight();
  w1 = Math.max(20, Math.min(w - 20, Math.round(w * this.widthRatio)));

  f1.style.width = w1 + "px";
  f1.style.height = h + "px";
  f1.style.left = "0";
  f1.style.top = "0";

  f2.style.width = (w - w1) + "px";
  f2.style.height = h + "px";
  f2.style.left = w1 + "px";
  f2.style.top = "0";

  this.child1.redraw();
  this.child2.redraw();

  return this;
};

CMWHSplitNode.prototype.changeWidth = function (d) {
  var f1 = this.child1.getFrame();
  var f2 = this.child2.getFrame();
  var w = this.getWidth();
  var w1 = Math.max(20, Math.min(w - 20, this.child1.getWidth() + d));
  this.widthRatio = w1 / w;

  return this.redraw();
};

CMWHSplitNode.prototype.removeResizeHandle = function () {
  return this.child1.getFrame().removeChild(this.resizeHandle.getView());
};

CMWHSplitNode.prototype.replaceChild = function (newChild, oldChild) {
  if (oldChild == this.child1)
    return this.replaceLeftChild(newChild);
  else if (oldChild == this.child2)
    return this.replaceRightChild(newChild);
};

CMWHSplitNode.prototype.replaceLeftChild = function (newChild) {
  var oldChild = this.child1;
  this.removeResizeHandle();

  if (newChild.getFrame().parentNode !== null)
    newChild.getFrame().parentNode.removeChild(newChild.getFrame());
  newChild.getFrame().appendChild(this.resizeHandle.getView());

  if (this.child1.getFrame().parentNode == this.frame)
    this.frame.replaceChild(newChild.getFrame(), this.child1.getFrame());
  else
    this.frame.appendChild(newChild.getFrame());

  this.child1 = newChild;
  newChild.setParent(this);
  this.redraw();

  return oldChild;
};

CMWHSplitNode.prototype.replaceRightChild = function (newChild) {
  var oldChild = this.child2;

  if (newChild.getFrame().parentNode !== null)
    newChild.getFrame().parentNode.removeChild(newChild.getFrame());

  if (this.child2.getFrame().parentNode == this.frame)
    this.frame.replaceChild(newChild.getFrame(), this.child2.getFrame());
  else
    this.frame.appendChild(newChild.getFrame());

  this.child2 = newChild;
  newChild.setParent(this);
  this.redraw();

  return oldChild;
};

CMWHSplitNode.prototype.getSiblingOf = function (child) {
  if (this.child1 == child)
    return this.child2;
  else if (this.child2 == child)
    return this.child1;
  else
    return null;
};

CMWHSplitNode.prototype.getResizeHandleView = function () {
  return this.resizeHandle.getView();
};

CMWHSplitNode.prototype.catchDrag = function () {
  this.child1.catchDrag();
  this.child2.catchDrag();
};

CMWHSplitNode.prototype.releaseDrag = function () {
  this.child1.releaseDrag();
  this.child2.releaseDrag();
};

CMWHSplitNode.prototype.toXML = function (tabs)
{
  return tabs + "<hsplitnode id\"" + this.id + "\">\n" +
      this.child1.toXML(tabs + "\t") + "\n" +
      this.child2.toXML(tabs + "\t") + "\n" +
      tabs + "</hsplitnode>";
};



/**
 * Vertical split node.
 */
function CMWVSplitNode(child1, child2) {
  this.id = this.uniqueId();

  this.parent = null;

  this.child1 = child1;

  this.child2 = child2;

  if (typeof this.child1 === "undefined")
    this.child1 = new CMWWindow("Window 1");
  if (typeof this.child2 === "undefined")
    this.child2 = new CMWWindow("Window 2");

  this.child1.setParent(this);
  this.child2.setParent(this);

  this.frame = document.createElement("div");
  this.frame.className = CMWNode.FRAME_CLASS;
  this.frame.style.position = "absolute";
  this.frame.id = "CMW" + this.id;
  this.frame.style.top = "0px";
  this.frame.style.bottom = "0px";

  this.resizeHandle = new ResizeHandle("v", this);

  var child1Frame = this.child1.getFrame();
  child1Frame.style.left = "0px";
  child1Frame.style.top = "0px";
  child1Frame.style.width = "";
  child1Frame.style.height = "";

  var child2Frame = this.child2.getFrame();
  child2Frame.style.left = "0px";
  child2Frame.style.top = "0px";
  child2Frame.style.width = "";
  child2Frame.style.height = "";

  this.frame.appendChild(child1Frame);
  this.frame.appendChild(child2Frame);

  child1Frame.appendChild(this.resizeHandle.getView());

  this.heightRatio = 0.5;
}

CMWVSplitNode.prototype = new CMWNode();
CMWVSplitNode.prototype.constructor = CMWVSplitNode;

CMWVSplitNode.prototype.getId = function () {
  return this.id;
};

CMWVSplitNode.prototype.getFrame = function () {
  return this.frame;
};

CMWVSplitNode.prototype.getParent = function () {
  return this.parent;
};

/**
 * Set the parent node.
 *
 * @param {Object} newParent
 * @return former parent node
 */
CMWVSplitNode.prototype.setParent = function (newParent) {
  var oldParent = this.parent;
  this.parent = newParent;
  return oldParent;
};

CMWVSplitNode.prototype.getRootNode = function () {
  return this.parent.getRootNode();
};

CMWVSplitNode.prototype.getTopChild = function () {
  return this.child1;
};

CMWVSplitNode.prototype.getBottomChild = function () {
  return this.child2;
};

CMWVSplitNode.prototype.getChildren = function () {
  return [this.child1, this.child2]
      .concat(this.child1.getChildren())
      .concat(this.child2.getChildren());
};

CMWVSplitNode.prototype.getWindows = function () {
  return this.child1.getWindows().concat(this.child2.getWindows());
};

CMWVSplitNode.prototype.redraw = function () {
  var f1 = this.child1.getFrame();
  var f2 = this.child2.getFrame();
  var h = this.getHeight();
  var w = this.getWidth();
  h1 = Math.max(20, Math.min(h - 20, Math.round(h * this.heightRatio)));

  f1.style.height = h1 + "px";
  f1.style.width = w + "px";
  f1.style.top = "0";
  f1.style.left = "0";

  f2.style.height = (h - h1) + "px";
  f2.style.width = w + "px";
  f2.style.top = h1 + "px";
  f2.style.left = "0";

  this.child1.redraw();
  this.child2.redraw();

  return this;
};

CMWVSplitNode.prototype.changeHeight = function (d) {
  var f1 = this.child1.getFrame();
  var f2 = this.child2.getFrame();
  var h = this.getHeight();
  var h1 = Math.max(20, Math.min(h - 20, this.child1.getHeight() + d));
  this.heightRatio = h1 / h;

  return this.redraw();
};

CMWVSplitNode.prototype.removeResizeHandle = function () {
  return this.child1.getFrame().removeChild(this.resizeHandle.getView());
};

CMWVSplitNode.prototype.replaceChild = function (newChild, oldChild) {
  if (oldChild == this.child1)
    return this.replaceTopChild(newChild);
  else if (oldChild == this.child2)
    return this.replaceBottomChild(newChild);
};

CMWVSplitNode.prototype.replaceTopChild = function (newChild) {
  var oldChild = this.child1;
  this.removeResizeHandle();

  var newChildFrame = newChild.getFrame();
  if (newChildFrame.parentNode !== null)
    newChildFrame.parentNode.removeChild(newChildFrame);
  newChildFrame.appendChild(this.resizeHandle.getView());

  if (this.child1.getFrame().parentNode == this.frame)
    this.frame.replaceChild(newChildFrame, this.child1.getFrame());
  else
    this.frame.appendChild(newChildFrame);

  this.child1 = newChild;
  newChild.setParent(this);
  this.redraw();

  return oldChild;
};

CMWVSplitNode.prototype.replaceBottomChild = function (newChild) {
  var oldChild = this.child2;

  if (newChild.getFrame().parentNode !== null)
    newChild.getFrame().parentNode.removeChild(newChild.getFrame());

  if (this.child2.getFrame().parentNode == this.frame)
    this.frame.replaceChild(newChild.getFrame(), this.child2.getFrame());
  else
    this.frame.appendChild(newChild.getFrame());

  this.child2 = newChild;
  newChild.setParent(this);
  this.redraw();

  return oldChild;
};

CMWVSplitNode.prototype.getSiblingOf = function (child) {
  if (this.child1 == child)
    return this.child2;
  else if (this.child2 == child)
    return this.child1;
  else
    return null;
};

CMWVSplitNode.prototype.getResizeHandleView = function () {
  return this.resizeHandle.getView();
};

CMWVSplitNode.prototype.catchDrag = function () {
  this.child1.catchDrag();
  this.child2.catchDrag();
};

CMWVSplitNode.prototype.releaseDrag = function () {
  this.child1.releaseDrag();
  this.child2.releaseDrag();
};

CMWVSplitNode.prototype.toXML = function (tabs) {
  return tabs + "<vsplitnode id\"" + this.id + "\">\n" +
      this.child1.toXML(tabs + "\t") + "\n" +
      this.child2.toXML(tabs + "\t") + "\n" +
      tabs + "</vsplitnode>";
};



/**
 * Tabbed split node
 */
function CMWTabbedNode(children) {
  this.id = this.uniqueId();

  this.parent = null;

  this.children = children;
  this.activeChild = children[0];

  this.children.forEach(function (c) {
    c.setParent(this);
  }, this);

  this.frame = document.createElement("div");
  this.frame.className = CMWNode.FRAME_CLASS;
  this.frame.style.position = "absolute";
  this.frame.id = "CMW" + this.id;
  this.frame.style.top = "0px";
  this.frame.style.bottom = "0px";

  this.tabContainer = document.createElement("div");
  this.tabContainer.className = "CMWTabs";
  this.tabFrameContainer = document.createElement("div");
  this.tabFrameContainer.style.display = "none";

  this.tabs = [];

  this.children.forEach(function (t) { this._addTab(t); }, this);

  this.frame.appendChild(this.tabContainer);
  this.frame.appendChild(this.tabFrameContainer);

  this.activeChildFrame = this.activeChild.getFrame();
  this.activeChildFrame.style.left = "0px";
  this.activeChildFrame.style.top = "0px";
  this.activeChildFrame.style.width = "";
  this.activeChildFrame.style.height = "";

  this.frame.appendChild(this.activeChildFrame);
}

CMWTabbedNode.prototype = new CMWNode();
CMWTabbedNode.prototype.constructor = CMWTabbedNode;

CMWTabbedNode.prototype.getId = function () {
  return this.id;
};

CMWTabbedNode.prototype.getFrame = function () {
  return this.frame;
};

CMWTabbedNode.prototype.getParent = function () {
  return this.parent;
};

/**
 * Set the parent node.
 *
 * @param {Object} newParent
 * @return former parent node
 */
CMWTabbedNode.prototype.setParent = function (newParent) {
  var oldParent = this.parent;
  this.parent = newParent;
  return oldParent;
};

CMWTabbedNode.prototype.getRootNode = function () {
  return this.parent.getRootNode();
};

CMWTabbedNode.prototype.getActiveChild = function () {
  return this.activeChild;
};

CMWTabbedNode.prototype.getChildren = function () {
  return this.children.reduce(function (children, child) {
    return children.concat(child.getChildren());
  }, this.children.slice());
};

CMWTabbedNode.prototype.addChild = function (newChild) {
  this.children.push(newChild);

  var newChildFrame = newChild.getFrame();
  if (newChildFrame.parentNode !== null)
    newChildFrame.parentNode.removeChild(newChildFrame);
  newChild.setParent(this);

  this._addTab(newChild);

  this.redraw();
};

CMWTabbedNode.prototype._addTab = function (child, index) {
  var tab = document.createElement("span");
  if (child === this.activeChild) tab.className = "active";

  tab.addEventListener("click", (function () {
    this.activateChild(child); return true;
  }).bind(this));

  if (typeof index === 'undefined') {
    this.tabContainer.appendChild(tab);
    this.tabs.push(tab);
  } else {
    this.tabContainer.replaceChild(tab, this.tabContainer.childNodes[index]);
    this.tabs[index] = tab;
  }

  this._updateTabTitle(child);

  return tab;
};

CMWTabbedNode.prototype._updateTabTitle = function (child) {
  var childIndex = this.children.indexOf(child);
  if (childIndex === -1) return;
  var tab = this.tabs[childIndex];
  if (!tab) return;

  tab.innerText = child.getTitle ?
      child.getTitle() :
      (child.getWindows().length + ' windows');
};

CMWTabbedNode.prototype.activateChild = function (child) {
  if (this.activeChild === child) return;

  var childIndex = this.children.indexOf(child);
  if (childIndex === -1) return;

  this.tabs.forEach(function (t) { t.classList.remove("active"); });
  this.tabs[childIndex].classList.add("active");

  var newActiveChildFrame = child.getFrame();
  if (this.activeChildFrame.parentNode === this.frame) {
    this.frame.replaceChild(newActiveChildFrame, this.activeChildFrame);
    this.tabFrameContainer.appendChild(this.activeChildFrame);
  } else {
    this.frame.appendChild(newActiveChildFrame);
  }
  this.activeChild = child;
  this.activeChildFrame = newActiveChildFrame;
  this.activeChildFrame.style.left = "0px";
  this.activeChildFrame.style.top = "0px";
  this.activeChildFrame.style.width = "";
  this.activeChildFrame.style.height = "";

  this.redraw();

  if (this.activeChild.focus) {
    this.activeChild.focus();
  } else {
    this.activeChild.getWindows()[0].focus();
  }
};

CMWTabbedNode.prototype.getWindows = function () {
  return this.children.reduce(function (w, c) {
    return w.concat(c.getWindows());
  }, []);
};

CMWTabbedNode.prototype.redraw = function () {
  var childFrame = this.activeChild.getFrame();
  childFrame.style.top = this.tabContainer.offsetHeight + "px";
  childFrame.style.left = "0";
  childFrame.style.width = this.getWidth() + "px";
  childFrame.style.height = (this.getHeight() - this.tabContainer.offsetHeight) + "px";

  this.activeChild.redraw();

  return this;
};

CMWTabbedNode.prototype.replaceChild = function (newChild, oldChild) {
  var oldChildInd = this.children.indexOf(oldChild);
  if (oldChildInd === -1) return;

  this.children[oldChildInd] = newChild;
  newChild.setParent(this);
  this._addTab(newChild, oldChildInd);

  if (this.activeChild === oldChild) {
    this.activateChild(newChild);
  } else {
    this.redraw();
  }
};

CMWTabbedNode.prototype.getSiblingOf = function (child) {
  var childIndex = this.children.indexOf(child);
  if (childIndex !== -1) {
    if (this.children.length === 1) {
      // Should not occur (should always have at least 2 tabs), but this
      // is the semantically correct behavior.
      return this.parent.getSiblingOf(this);
    } else if (this.children.length === 2) {
      return this.children[(childIndex + 1) % this.children.length];
    } else {
      var siblings = this.children.slice();
      siblings.splice(childIndex, 1);
      return new CMWTabbedNode(siblings);
    }
  } else {
    return null;
  }
};

CMWTabbedNode.prototype.removeResizeHandle = function () {};

CMWTabbedNode.prototype.catchDrag = function () {
  this.activeChild.catchDrag();
};

CMWTabbedNode.prototype.releaseDrag = function () {
  this.children.forEach(function (c) {
    c.releaseDrag();
  });
};

CMWTabbedNode.prototype.toXML = function (tabs) {
  return tabs + "<tabbednode id=\"" + this.id + "\">\n" +
      this.children.map(function (c) {
        return c.toXML(tabs + "\t");
      }).join("\n") + "\n" +
      tabs + "</tabbednode>";
};

CMWTabbedNode.prototype.childChanged = function (child) {
  this._updateTabTitle(child);
};


/**
 * Window is leaf of the binary tree.
 */
function CMWWindow(title) {
  this.id = this.uniqueId();

  this.parent = null;

  this.title = title;

  this.titleText = document.createElement("p");
  this.titleText.className = "stackTitle";
  this.titleText.appendChild(document.createTextNode(this.title));

  var closeHandle = document.createElement("p");
  closeHandle.className = "stackClose";
  closeHandle.onpointerdown = this.close.bind(this);
  closeHandle.appendChild(document.createTextNode("close [ x ]"));

  var titleBar = document.createElement("div");
  titleBar.className = "stackInfo_selected";
  titleBar.style.position = "relative";
  titleBar.style.cursor = "move";
  titleBar.appendChild(this.titleText);
  titleBar.appendChild(closeHandle);

  this.frame = document.createElement("div");
  this.frame.className = CMWNode.FRAME_CLASS;
  this.frame.style.position = "absolute";
  this.frame.id = "CMW" + this.id;
  this.frame.style.top = "0px";
  this.frame.style.bottom = "0px";
  this.frame.appendChild(titleBar);

  this.eventCatcher = document.createElement("div");
  this.eventCatcher.className = "eventCatcher";
  this.frame.appendChild(this.eventCatcher);

  this.listeners = [];

  this.frame.onpointerdown = this.focus.bind(this);

  var self = this;

  this.frame.onpointerenter = function (e) {
    self.callListeners(CMWWindow.POINTER_ENTER);
    return false;
  };

  titleBar.onpointerdown = function (e) {
    CMWWindow.selectedWindow = self;
    self.getRootNode().catchDrag();
    return false;
  };

  this.eventCatcher.onpointermove = function (e) {
    if (self != CMWWindow.selectedWindow) {
      var m = CATMAID.ui.getMouse(e, self.eventCatcher);
      var min = Infinity;
      var s = "Middle";
      if ( m.offsetY < self.getHeight() / 3 )
      {
        min = m.offsetY;
        s = "Top";
      }
      else if ( m.offsetY > ( 2 * self.getHeight() / 3 ) )
      {
        min = self.getHeight() - m.offsetY;
        s = "Bottom";
      }
      if ( (m.offsetX < self.getWidth() / 3) && (m.offsetX < min) )
      {
        s = "Left";
      }
      if ( (m.offsetX > (2 * self.getWidth() / 3)) && (self.getWidth() - m.offsetX < min) )
      {
        s = "Right";
      }

      self.eventCatcher.className = "eventCatcher" + s;
    }
    return false;
  };

  this.eventCatcher.onpointerout = function () {
    self.eventCatcher.className = "eventCatcher";
    return false;
  };

  this.eventCatcher.onpointerup = function (e) {
    if ( !( CMWWindow.selectedWindow == self || self.eventCatcher.className == "eventCatcher" ) )
    {
      var sourceSplitNode = CMWWindow.selectedWindow.getParent();
      var sourceSibling = sourceSplitNode.getSiblingOf( CMWWindow.selectedWindow );
      var sourceSiblingFrame = sourceSibling.getFrame();

      sourceSplitNode.removeResizeHandle();
      sourceSplitNode.getParent().replaceChild( sourceSibling, sourceSplitNode );

      sourceSiblingFrame.style.top = "0px";
      sourceSiblingFrame.style.left = "0px";
      sourceSiblingFrame.style.width = "";
      sourceSiblingFrame.style.height = "";

      // If parent is a tabbed node and shift is not held, perform the
      // rearrangement relative to parent rather than self.
      var parentOrSelf = !e.shiftKey && self.parent instanceof CMWTabbedNode ? self.parent : self;

      if ( self.eventCatcher.className == "eventCatcherTop" )
      {
        parentOrSelf.getParent().replaceChild( new CMWVSplitNode( CMWWindow.selectedWindow, parentOrSelf ), parentOrSelf );
      }
      else if ( self.eventCatcher.className == "eventCatcherBottom" )
      {
        parentOrSelf.getParent().replaceChild( new CMWVSplitNode( parentOrSelf, CMWWindow.selectedWindow ), parentOrSelf );
      }
      else if ( self.eventCatcher.className == "eventCatcherLeft" )
      {
        parentOrSelf.getParent().replaceChild( new CMWHSplitNode( CMWWindow.selectedWindow, parentOrSelf ), parentOrSelf );
      }
      else if ( self.eventCatcher.className == "eventCatcherRight" )
      {
        parentOrSelf.getParent().replaceChild( new CMWHSplitNode( parentOrSelf, CMWWindow.selectedWindow ), parentOrSelf );
      }
      else if ( self.eventCatcher.className == "eventCatcherMiddle" )
      {
        if ( self.parent instanceof CMWTabbedNode )
          self.parent.addChild(CMWWindow.selectedWindow);
        else
          self.parent.replaceChild( new CMWTabbedNode( [self, CMWWindow.selectedWindow] ), self );
      }
    }

    var rootNode = self.getRootNode();
    rootNode.releaseDrag();
    CMWWindow.selectedWindow = null;
    self.eventCatcher.className = "eventCatcher";
    rootNode.redraw();

    return false;
  };
}

CMWWindow.prototype = new CMWNode();
CMWWindow.prototype.constructor = CMWWindow;

/**
 * @return height of the window minus titlebar in pixels
 */
CMWWindow.prototype.getContentHeight = function () {
  var frame = this.getFrame();
  var h = this.getAvailableHeight();
  if (this.frame.firstChild && this.frame.firstChild.offsetHeight)
    h -= this.frame.firstChild.offsetHeight;
  return h;
};

/**
 * Remove this window from tree. Optionally, if this was the sole child of root,
 * remove the root frame from document as well, unless <keep_root> is set to
 * true.
 *
 * Call all listeners with a CLOSE event.
 *
 * @param e
 */
CMWWindow.prototype.close = function (e, keep_root = false) {
  if (e) e.stopPropagation();
  else if (typeof event != "undefined" && event) event.cancelBubble = true;

  var root = this.getRootNode();

  if (root == this.parent) {
    var rootFrame = root.getFrame();

    // Remove all child views from root
    while (rootFrame.firstChild) {
      rootFrame.removeChild(rootFrame.firstChild);
    }

    // Remove root frame from DOM, if not disabled
    if (!keep_root) {
      if (rootFrame.parentNode)
        rootFrame.parentNode.removeChild(rootFrame);
      root.close();
    }
  } else {
    var sibling = this.parent.getSiblingOf(this);
    var siblingFrame = sibling.getFrame();

    this.parent.removeResizeHandle();
    this.parent.getParent().replaceChild(sibling, this.parent);

    siblingFrame.style.top = "0px";
    siblingFrame.style.left = "0px";
    siblingFrame.style.width = "";
    siblingFrame.style.height = "";

    if (this.hasFocus())
      sibling.getWindows()[0].focus();

    root.redraw();
  }

  this.callListeners(CMWWindow.CLOSE);

  return false;
};

CMWWindow.prototype.hasFocus = function () {
  return this.frame.firstChild.className == "stackInfo_selected";
};

CMWWindow.prototype.focus = function () {
  var root = this.getRootNode();
  var windows = root.getWindows();
  for (var i = 0; i < windows.length; ++i) {
    var w = windows[i];
    // Unfocus other window, if it has focus. Don't unfocus this window, if
    // focus is called multiple times.
    if (w !== this && w.hasFocus()) {
      w.getFrame().firstChild.className = "stackInfo";
      w.callListeners(CMWWindow.BLUR);
    }
  }

  if(!this.hasFocus()) {
    this.frame.firstChild.className = "stackInfo_selected";
    this.callListeners(CMWWindow.FOCUS);
  }

  return this;
};

CMWWindow.prototype.catchDrag = function () {
  this.eventCatcher.style.display = "block";
  return false;
};

CMWWindow.prototype.releaseDrag = function () {
  this.eventCatcher.style.display = "none";
  return false;
};

CMWWindow.prototype.addListener = function (listener) {
  this.listeners.push(listener);
};

CMWWindow.prototype.removeListener = function (listener) {
  for (var i = 0; i < this.listeners.length; ++i) {
    if (this.listeners[i] == listener) {
      this.listeners.splice(i, 1);
      break;
    }
  }
};

/**
 * Call all listeners with a RESIZE event, the actual window redrawing is
 * done by parent.
 *
 * @return {CMWWindow} this (allows chains of calls like myWindow.setTitle( "new" ).show())
 */
CMWWindow.prototype.redraw = function () {
  return this.callListeners(CMWWindow.RESIZE);
};

CMWWindow.prototype.getId = function () {
  return this.id;
};

CMWWindow.prototype.getFrame = function () {
  return this.frame;
};

CMWWindow.prototype.getParent = function () {
  return this.parent;
};

CMWWindow.prototype.getTitle = function () {
  return this.title;
};

CMWWindow.prototype.getSibling = function () {
  return this.parent.getSiblingOf(this);
};

/**
 * Set the parent node.
 *
 * @param {Object} newParent
 * @return former parent node
 */
CMWWindow.prototype.setParent = function (newParent) {
  var oldParent = this.parent;
  this.parent = newParent;
  return oldParent;
};

CMWWindow.prototype.getChildren = function () {
  return [];
};

CMWWindow.prototype.getWindows = function () {
  return [this];
};

/**
 * Set the window title
 *
 * @param {String} title
 * @return {CMWWindow} this (allows chains of calls like myWindow.setTitle( "new" ).show())
 */
CMWWindow.prototype.setTitle = function (newTitle) {
  this.title = newTitle;
  this.titleText.replaceChild(document.createTextNode(this.title), this.titleText.firstChild);
  // Notify parent node about changed title.
  if (this.parent && CATMAID.tools.isFn(this.parent.childChanged)) {
    this.parent.childChanged(this);
  }
  return this;
};

/**
 * @return root node
 */
CMWWindow.prototype.getRootNode = function () {
  return this.parent.getRootNode();
};

/**
 * Call all listeners with a signal.
 *
 * @param {Number} signal one of the CMWWindow constants
 * @return {CMWWindow} this (allows chains of calls like myWindow.setTitle( "new" ).show())
 */
CMWWindow.prototype.callListeners = function(signal) {
  for (var i = 0; i < this.listeners.length; ++i)
    this.listeners[i](this, signal);

  return this;
};

CMWWindow.prototype.toXML = function(tabs) {
  return tabs + "<window id\"" + this.id + "\" title=\"" + this.title + "\" />";
};



/**
 * Constants
 */
CMWWindow.CLOSE = 0;
CMWWindow.RESIZE = 1;
CMWWindow.FOCUS = 2;
CMWWindow.BLUR = 3;
CMWWindow.POINTER_ENTER = 4;

CMWWindow.signalName = {};
CMWWindow.signalName[CMWWindow.CLOSE] = 'CLOSE';
CMWWindow.signalName[CMWWindow.RESIZE] = 'RESIZE';
CMWWindow.signalName[CMWWindow.FOCUS] = 'FOCUS';
CMWWindow.signalName[CMWWindow.BLUR] = 'BLUR';
CMWWindow.signalName[CMWWindow.POINTER_ENTER] = 'POINTER_ENTER';


/**
 * a vertical or horizontal resize handle
 */
function ResizeHandle(type, node) {
  /**
   * returns the html-element
   */
  this.getView = function () {
    return view;
  };

  var onpointermove = {
    h: function (e) {
      node.changeWidth( CATMAID.ui.diffX );
      return false;
    },
    v: function (e) {
      node.changeHeight( CATMAID.ui.diffY );
      return false;
    }
  };

  var onpointerup = {
    h: function (e) {
      CATMAID.ui.releaseEvents();
      CATMAID.ui.removeEvent("onpointermove", onpointermove.h);
      CATMAID.ui.removeEvent("onpointerup", onpointerup.h);
      return false;
    },
    v: function (e) {
      CATMAID.ui.releaseEvents();
      CATMAID.ui.removeEvent("onpointermove", onpointermove.v);
      CATMAID.ui.removeEvent("onpointerup", onpointerup.v);
      return false;
    }
  };

  var onpointerdown = {
    h: function (e) {
      CATMAID.ui.registerEvent("onpointermove", onpointermove.h);
      CATMAID.ui.registerEvent("onpointerup", onpointerup.h);
      CATMAID.ui.catchEvents("e-resize");
      CATMAID.ui.onpointerdown(e);
      CATMAID.ui.catchFocus();

      return false;
    },
    v: function (e) {
      CATMAID.ui.registerEvent("onpointermove", onpointermove.v);
      CATMAID.ui.registerEvent("onpointerup", onpointerup.v);
      CATMAID.ui.catchEvents("s-resize");
      CATMAID.ui.onpointerdown(e);
      CATMAID.ui.catchFocus();

      return false;
    }
  };


  // initialise
  var self = this;

  if (type != "v") type = "h";
  var view = document.createElement("div");
  view.className = "resize_handle_" + type;
  view.onpointerdown = onpointerdown[type];
  view.onpointerup = onpointerup[type];
}
