/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  const DEFAULT_WIDTH = 3;
  const DEFAULT_HEIGHT = 3;
  const MAX_WIDTH = 5;
  const MAX_HEIGHT = 5;

  const HIDER_Z_INDEX = 100;  // must be < 101 (for error alerts)
  const PANEL_PADDING = 1;

  const TRACING_OVERLAY_BUFFER = 64;

  const DEFAULT_SHOW_SCALE_BAR = false;

  const COORD_ORDER = ['x', 'y', 'z'];

  /**
   *
   *
   * @param container - the DOM object which will contain the stack viewer grid
   * @param parentID - an ID unique to the widget instance calling the stack viewer grid
   * @constructor
   */
  var StackViewerGrid = function (container, parentID) {
    this.container = container;
    this.idPrefix = parentID.replace(/-*$/, '-stackviewers-');

    /**
     *  [
     *    {
     *      'coords': {
     *        'x': _,
     *        'y': _,
     *        'z': _
     *      },
     *      'title': topLeftText,  // will be replaced by coordinate string if undefined
     *      'sortVal': bottomRightText,
     *      'note': topRightText
     *    },
     *    {
     *      ...
     *    },
     *    ...
     *  ]
     *
     * @type {Array}
     */
    this.targets = [];

    this.firstTargetIdx = 0;

    this.dimensions = [DEFAULT_HEIGHT, DEFAULT_WIDTH];

    this.sourceStackViewer = project.getStackViewers()[0];
    this.stackViewers = [];
    this.panelWindows = [];
    this.showScaleBar = DEFAULT_SHOW_SCALE_BAR;

    this.init();
  };

  StackViewerGrid.prototype = {};

  StackViewerGrid.prototype.destroy = function() {
    this.closeStackViewers();
  };

  /**
   * Update the text describing which targets are shown.
   */
  StackViewerGrid.prototype.updateShowingText = function() {
    var total = this.targets.length;
    var start = Math.min(this.firstTargetIdx + 1, total);
    var stop = Math.min(this.firstTargetIdx + this.dimensions[0] * this.dimensions[1], total);

    var showingTextSelector = $(`#${this.idPrefix}showing`);
    showingTextSelector.find(`.start`).text(start);
    showingTextSelector.find(`.stop`).text(stop);
    showingTextSelector.find(`.total`).text(total);
  };

  /**
   *
   * @param newPage zero-indexed
   */
  StackViewerGrid.prototype.changePage = function(newPage) {
    var pageElement = document.getElementById(this.idPrefix + 'current-page');

    var total = this.targets.length;

    if (total === 0) {
      pageElement.value = 1;
      this.update();
      return 0;
    }

    var newFirstTargetIdx = newPage * this.dimensions[0] * this.dimensions[1];

    if (this.firstTargetIdx === newFirstTargetIdx) {  // page may not be changing
      this.update();
      return Number(pageElement.value) - 1;
    } else if (newPage < 0 || newFirstTargetIdx >= total) {  // page out of bounds
      CATMAID.warn('This page does not exist! Returning to page 1.');
      return this.changePage(0);
    } else {
      this.firstTargetIdx = newFirstTargetIdx;
      pageElement.value = newPage + 1;
      this.update();
      return newPage;
    }
  };

  /**
   *  [
   *    {
   *      'coords': {
   *        'x': _,
   *        'y': _,
   *        'z': _
   *      },
   *      'title': topLeftText,  // will be replaced by coordinate string if undefined
   *      'sortVal': bottomRightText,
   *      'note': topRightText
   *    },
   *    {
   *      ...
   *    },
   *    ...
   *  ]
   *
   * @param arr
   * @returns {StackViewerGrid}
   */
  StackViewerGrid.prototype.append = function(arr){
    for (var item of arr) {
      this.targets.push(item);
    }

    var maxPage = Math.ceil(this.targets.length / (this.dimensions[0]*this.dimensions[1]));
    document.getElementById(this.idPrefix + 'max-page').innerHTML = Math.max(maxPage, 1).toString();

    this.update();
    return this;
  };

  StackViewerGrid.prototype.clear = function() {
    this.targets.length = 0;
    this.firstTargetIdx = 0;

    this.update();
    return this;
  };

  /**
   *  [
   *    {
   *      'coords': {
   *        'x': _,
   *        'y': _,
   *        'z': _
   *      },
   *      'title': topLeftText,  // will be replaced by coordinate string if undefined
   *      'sortVal': bottomRightText,
   *      'note': topRightText
   *    },
   *    {
   *      ...
   *    },
   *    ...
   *  ]
   *
   * @param arr
   * @returns {StackViewerGrid}
   */
  StackViewerGrid.prototype.setTargets = function(arr) {
    this.targets.length = 0;
    this.firstTargetIdx = 0;
    return this.append(arr);
  };

  StackViewerGrid.prototype.closeStackViewers = function () {
    for (var stackViewer of this.stackViewers) {
      stackViewer.destroy();
    }
  };

  StackViewerGrid.prototype.getVisibleTargets = function() {
    var firstConnIdx = this.firstTargetIdx;

    return this.targets.slice(
      firstConnIdx,
      firstConnIdx + this.dimensions[0] * this.dimensions[1]
    );
  };

  /**
   * Returns a list of stack windows not inside a stack viewer grid.
   *
   * @returns {Array} of objects {'title': stackViewerWindowTitle, 'value': stackViewerInstance}
   */
  StackViewerGrid.prototype.getOtherStackViewerOptions = function () {
    return project.getStackViewers()
      .filter(function(stackViewer) {
        // only stack viewers not living in a stack viewer grid panel window
        return !stackViewer.getWindow().frame.classList.contains('stack-viewer-grid-panel');
      })
      .map(function(stackViewer) {
        return {
          title: stackViewer.getWindow().title,
          value: stackViewer
        };
      });
  };

  StackViewerGrid.prototype.init = function() {
    var controlsContainer;
    controlsContainer = document.createElement("div");
    controlsContainer.setAttribute("id", this.idPrefix + 'controls');
    controlsContainer.setAttribute("class", "buttonpanel");
    this.container.appendChild(controlsContainer);
    this.createControls(controlsContainer);
    // DOM.addButtonDisplayToggle(win);

    var contentContainer =  document.createElement("div");
    contentContainer.setAttribute("id", this.idPrefix + 'content');
    contentContainer.setAttribute("class", "windowContent");
    this.container.appendChild(contentContainer);

    this.initGridWindow();
    this.redrawPanels();
  };

  StackViewerGrid.prototype.getGridContent = function () {
    return document.getElementById(this.idPrefix + 'content');
  };

  StackViewerGrid.prototype.getGridWindow = function () {
    var gridContent = this.getGridContent();
    var gridFrame = $(gridContent).closest('.' + CMWNode.FRAME_CLASS).get(0);
    return CATMAID.rootWindow.getWindows().find(function(w) {
      return w.getFrame() === gridFrame;
    });
  };

  StackViewerGrid.prototype.initGridWindow = function () {
    var gridWindow = this.getGridWindow();
    var self = this;

    gridWindow.getWindows = function() {
      return [this].concat(self.panelWindows);
    };

    gridWindow.redraw = function() {
      this.callListeners(CMWWindow.RESIZE);
      self.panelWindows.forEach(function(w) {
        w.redraw();
      });
    };
  };

  StackViewerGrid.prototype.createControls = function(controlsContainer) {
    var self = this;

    // WIDGET SETTINGS CONTROLS

    var sourceStackViewer = CATMAID.DOM.createSelect(
      self.idPrefix + 'source-stack-viewer',
      self.getOtherStackViewerOptions(),
      this.sourceStackViewer._stackWindow.title
    );
    sourceStackViewer.onchange = function() {
      self.sourceStackViewer = this.value;
      self.redrawPanels();
    };

    var sourceStackViewerLabel = document.createElement('label');
    sourceStackViewerLabel.appendChild(document.createTextNode('Source stack viewer'));
    sourceStackViewerLabel.appendChild(sourceStackViewer);
    controlsContainer.appendChild(sourceStackViewerLabel);

    var tileCounts = document.createElement('div');
    tileCounts.style.display = 'inline-block';
    controlsContainer.appendChild(tileCounts);

    var makeTileCountOptions = function(max) {
      var arr = [];
      for (var i = 1; i <= max; i++) {
        arr.push({title: i, value:i});
      }
      return arr;
    };

    var hTileCount = CATMAID.DOM.createSelect(
      self.idPrefix + "h-tile-count",
      makeTileCountOptions(MAX_HEIGHT),
      String(DEFAULT_HEIGHT)
    );
    hTileCount.onchange = function() {
      self.redrawPanels();
      self.update();
    };

    var hTileCountLabel = document.createElement('label');
    hTileCountLabel.appendChild(document.createTextNode('Height'));
    hTileCountLabel.appendChild(hTileCount);
    tileCounts.appendChild(hTileCountLabel);

    var wTileCount = CATMAID.DOM.createSelect(
      self.idPrefix + "w-tile-count",
      makeTileCountOptions(MAX_WIDTH),
      String(DEFAULT_WIDTH)
    );
    wTileCount.onchange = function() {
      self.redrawPanels();
      self.update();
    };

    var wTileCountLabel = document.createElement('label');
    wTileCountLabel.appendChild(document.createTextNode('Width'));
    wTileCountLabel.appendChild(wTileCount);
    tileCounts.appendChild(wTileCountLabel);

    var scaleBarCb = document.createElement('input');
    scaleBarCb.setAttribute('type', 'checkbox');
    scaleBarCb.checked = DEFAULT_SHOW_SCALE_BAR;
    scaleBarCb.onchange = function() {
      self.showScaleBar = this.checked;
      for (var stackViewer of self.stackViewers) {
        stackViewer.updateScaleBar(self.showScaleBar);
      }
    };

    var scaleBarCbLabel = document.createElement('label');
    scaleBarCbLabel.appendChild(document.createTextNode('Scale bars'));
    scaleBarCbLabel.appendChild(scaleBarCb);
    controlsContainer.appendChild(scaleBarCbLabel);

    controlsContainer.appendChild(document.createElement('br'));

    // PAGINATION CONTROLS

    var prevButton = document.createElement('input');
    prevButton.setAttribute('type', 'button');
    prevButton.setAttribute('id', self.idPrefix + "prev");
    prevButton.setAttribute('value', 'Previous');
    prevButton.onclick = function() {
      var prevPageIdx = Number(document.getElementById(self.idPrefix + "current-page").value) - 2;
      if (prevPageIdx >= 0) {
        self.changePage(prevPageIdx);
      }
    };
    controlsContainer.appendChild(prevButton);

    var pageCountContainer = document.createElement('div');
    pageCountContainer.style.display = 'inline-block';
    controlsContainer.appendChild(pageCountContainer);

    var currentPage = document.createElement('input');
    currentPage.setAttribute('type', 'text');
    currentPage.setAttribute('size', '4');
    currentPage.setAttribute('pattern', '\d+');
    currentPage.style.textAlign = 'right';
    currentPage.setAttribute('id', self.idPrefix + "current-page");
    currentPage.setAttribute('value', '1');
    currentPage.onchange = function() {
      self.changePage(Number(this.value) - 1);
    };

    pageCountContainer.appendChild(currentPage);

    pageCountContainer.appendChild(document.createTextNode(' / '));

    var maxPage = document.createElement('p');
    maxPage.innerHTML = '1';
    maxPage.setAttribute('id', self.idPrefix + 'max-page');

    pageCountContainer.appendChild(maxPage);

    var nextButton = document.createElement('input');
    nextButton.setAttribute('type', 'button');
    nextButton.setAttribute('id', self.idPrefix + 'next');
    nextButton.setAttribute('value', 'Next');
    nextButton.onclick = function() {
      // going from 1-base to 0-base so no +1 needed
      var nextPageIdx = Number(document.getElementById(self.idPrefix + 'current-page').value);

      var maxPageIdx = Number(document.getElementById(self.idPrefix + 'max-page').innerHTML) - 1;
      if (nextPageIdx <= maxPageIdx) {
        self.changePage(nextPageIdx);
      }
    };
    controlsContainer.appendChild(nextButton);

    var showing = document.createElement('p');
    showing.setAttribute('id', self.idPrefix + 'showing');
    showing.style.display = 'inline-block';
    showing.innerHTML = 'Showing <b class="start">0</b>-<b class="stop">0</b> of <b class="total">0</b>';
    controlsContainer.appendChild(showing);
  };

  /**
   * Set the suspend state of a stack viewer's tracing layers, and redraw if waking it. Stack viewers set to
   * navigate with the project cannot be suspended.
   *
   * @param stackViewer
   * @param suspended - new suspend state, 'true' to suspend, 'false' to wake and redraw
   */
  var setStackViewerSuspendState = function(stackViewer, suspended) {
    // do not suspend if the stack viewer is set to navigate with project
    suspended = stackViewer.navigateWithProject ? false : suspended;

    for (var tracingLayer of stackViewer.getLayersOfType(CATMAID.TracingLayer)) {
      tracingLayer.tracingOverlay.suspended = suspended;
      if (!suspended) {
        tracingLayer.tracingOverlay.redraw(true);
      }
    }
  };

  /**
   * Return the set of nodes associated with any tracing overlay associated with the given stack viewer.
   *
   * @param stackViewer
   */
  var getNodeSet = function(stackViewer) {
    return stackViewer.getLayersOfType(CATMAID.TracingLayer).reduce(function (set, tracingLayer) {
      return set.addAll(Object.keys(tracingLayer.tracingOverlay.nodes));
    }, new Set());
  };

  /**
   * A listener to add to CMWWindows which will suspend tracing overlays which do not share nodes with the stack
   * viewer in the focused window.
   *
   * EDGE CASE: suspend decisions are made on focus change, so if you trace in one stack viewer, into the field of
   * view of a stack viewer which had been suspended due to being too far away, the latter will not unsuspend until
   * focused.
   *
   * @param cmwWindow
   * @param signal
   */
  StackViewerGrid.prototype.focusSuspendListener = function(cmwWindow, signal) {
    if (signal === CMWWindow.FOCUS) {
      var focusedStackViewer = this.stackViewers[this.panelWindows.indexOf(cmwWindow)];
      var focusedNodes = getNodeSet(focusedStackViewer);

      for (var stackViewer of this.stackViewers) {
        if (stackViewer === focusedStackViewer) {
          // avoid doing unnecessary set operations for the focused stack viewer
          setStackViewerSuspendState(stackViewer, false);
        } else {
          // suspend unless nodes in the focused stack viewer also appear in this stack viewer
          var otherNodes = getNodeSet(stackViewer);
          setStackViewerSuspendState(stackViewer, !focusedNodes.intersection(otherNodes).size);
        }
      }
    }
  };

  /**
   * Handle the redrawing of stack viewer panels, e.g. in the case of changing dimensions or the first draw.
   */
  StackViewerGrid.prototype.redrawPanels = function() {
    this.dimensions = [$(`#${this.idPrefix}h-tile-count`).val(), $(`#${this.idPrefix}w-tile-count`).val()];
    var gridContent = this.getGridContent();

    // destroy existing
    this.closeStackViewers();
    this.stackViewers.length = 0;
    this.panelWindows.length = 0;
    while (gridContent.lastChild) {
      gridContent.removeChild(gridContent.lastChild);
    }

    var gridWindow = this.getGridWindow();

    var stack = this.sourceStackViewer.primaryStack;
    var tileSource = this.sourceStackViewer.getLayer('TileLayer').tileSource;

    var tileLayerConstructor = CATMAID.TileLayer.Settings.session.prefer_webgl ?
      CATMAID.PixiTileLayer :
      CATMAID.TileLayer;

    for (var iIdx = 0; iIdx < this.dimensions[0]; iIdx++) {
      for (var jIdx = 0; jIdx < this.dimensions[1]; jIdx++) {
        // split the widget content into equal-sized panels
        var panelContainer = document.createElement('div');
        panelContainer.style.position = 'absolute';
        panelContainer.style.height = `${100 / this.dimensions[0]}%`;
        panelContainer.style.width = `${100 / this.dimensions[1]}%`;
        panelContainer.style.top = `${(100 / this.dimensions[0]) * iIdx}%`;
        panelContainer.style.left = `${(100 / this.dimensions[1]) * jIdx}%`;

        gridContent.appendChild(panelContainer);

        // put a smaller div inside each of these panels, to allow for padding/ border
        var panelInnerContainer = document.createElement('div');
        panelInnerContainer.style.position = 'absolute';
        panelInnerContainer.style.top = `${PANEL_PADDING}px`;
        panelInnerContainer.style.bottom = `${iIdx === this.dimensions[0]-1 ? 0 : PANEL_PADDING}px`;
        panelInnerContainer.style.left = `${jIdx ? PANEL_PADDING: 0}px`;
        panelInnerContainer.style.right = `${jIdx === this.dimensions[1]-1 ? 0 : PANEL_PADDING}px`;

        panelContainer.appendChild(panelInnerContainer);

        // create the CMWWindow, stack viewer etc.
        var panelWindow = new CMWWindow('Mini stack viewer');
        this.panelWindows.push(panelWindow);
        // prevent dragging
        $(panelWindow.getFrame()).children('.stackInfo_selected').get(0).onmousedown = function () {return true;};
        panelWindow.parent = gridWindow;

        var panel = panelWindow.getFrame();
        panel.style.position = 'absolute';
        panel.classList.add('stack-viewer-grid-panel', `i${iIdx}`, `j${jIdx}`);

        var panelStackViewer = new CATMAID.StackViewer(project, stack, panelWindow);

        var tileLayer = new tileLayerConstructor(
          panelStackViewer,
          "Image data (" + stack.title + ")",
          stack,
          tileSource,
          true,
          1,
          false,
          CATMAID.TileLayer.Settings.session.linear_interpolation
        );

        panelStackViewer.addLayer("TileLayer", tileLayer);

        panelStackViewer.layercontrol.refresh();
        this.stackViewers.push(panelStackViewer);

        panelInnerContainer.appendChild(panel);
        panelStackViewer.resize();

        // add the note to the top right of the title bar
        var stackInfo = panelStackViewer._stackWindow.frame.querySelector('.stackInfo_selected');
        var noteElem = document.createElement('p');
        noteElem.classList.add('note');

        stackInfo.appendChild(noteElem);

        // add the sort value to the bottom right of the frame
        var sortVal = document.createElement('p');
        sortVal.classList.add('sort-val');
        panel.appendChild(sortVal);

        // create div to hide stack viewers if they don't have a target to show
        var panelHider = document.createElement('div');
        panelHider.style.position = 'absolute';
        panelHider.style.height = '100%';
        panelHider.style.width = '100%';
        panelHider.style.backgroundColor = '#3d3d3d';
        panelHider.style.zIndex = HIDER_Z_INDEX;
        panelHider.setAttribute('id', `${this.idPrefix}hider-${iIdx}-${jIdx}`);

        panelInnerContainer.appendChild(panelHider);

        var hiderText = document.createElement('p');
        hiderText.style.color = 'white';
        hiderText.style.backgroundColor = 'transparent';
        hiderText.innerHTML = 'No more targets to show';

        panelHider.appendChild(hiderText);

        project.addStackViewer(panelStackViewer);

        for (var tracingLayer of panelStackViewer.getLayersOfType(CATMAID.TracingLayer)) {
          tracingLayer.tracingOverlay.padding = TRACING_OVERLAY_BUFFER;
        }

        panelWindow.redraw();

        panelWindow.addListener(this.focusSuspendListener.bind(this));

        setStackViewerSuspendState(panelStackViewer, true);
      }
    }

    // todo: do this in the stack viewers rather than here
    // hide window controls
    var containerJq = $(gridContent);
    containerJq.find('.neuronname').hide();
    containerJq.find('.stackClose').hide();
    containerJq.find('.smallMapView_hidden').hide();  // doesn't work anyway
  };

  StackViewerGrid.prototype.moveStackViewer = function(stackViewer, coords, completionCallback) {
    stackViewer.moveToProject(
      coords.z, coords.y, coords.x,
      this.sourceStackViewer.primaryStack.stackToProjectSX(this.sourceStackViewer.s),
      typeof completionCallback === "function" ? completionCallback : undefined
    );
  };

  StackViewerGrid.prototype.makeCoordStr = function(coordObj) {
    var middleString = COORD_ORDER.map(function(key) {
      return `${key}=${coordObj[key].toFixed(0)}`;
    }).join(', ');
    return `(${middleString})`;
  };

  /**
   * Update panel stack viewer state (hidden, title, position etc.) based on current skeleton source content. Used when
   * dimensions or page changed.
   */
  StackViewerGrid.prototype.update = function() {
    var self = this;

    var visibleTargets = this.getVisibleTargets();
    for (var iIdx = 0; iIdx < self.dimensions[0]; iIdx++) {
      for (var jIdx = 0; jIdx < self.dimensions[1]; jIdx++) {
        var panelIdx = jIdx + iIdx*self.dimensions[1];
        var hider = document.getElementById(`${self.idPrefix}hider-${iIdx}-${jIdx}`);

        var panelStackViewer = self.stackViewers[panelIdx];
        panelStackViewer.navigateWithProject = false;
        panelStackViewer.updateScaleBar(self.showScaleBar);

        var target = visibleTargets[panelIdx];
        if (target) {
          var panel = panelStackViewer._stackWindow.frame;

          // allow the tracing overlay to update for the move
          setStackViewerSuspendState(panelStackViewer, false);
          self.moveStackViewer(
            panelStackViewer, target.coords,
            setStackViewerSuspendState.bind(self, panelStackViewer, true)  // suspend on completion
          );
          panelStackViewer.getLayersOfType(CATMAID.TracingLayer).forEach(function(tracingLayer) {
            tracingLayer.forceRedraw();
          });

          // change title to user-defined string if it exists, or the coordinates
          panelStackViewer._stackWindow.setTitle(target.title ? target.title : self.makeCoordStr(target.coords));
          panel.querySelector('.stackTitle').onclick = self.moveStackViewer
            .bind(self, self.sourceStackViewer, target.coords);

          // show note if it exists
          var noteElem = panel.querySelector('.note');
          if (target.note) {
            noteElem.innerHTML = target.note;
            noteElem.style.display = 'initial';
          } else {
            noteElem.style.display = 'none';
          }

          // show sort value if it exists
          var sortValElem = panel.querySelector('.sort-val');
          if (target.sortVal) {
            sortValElem.innerHTML = target.sortVal;
            sortValElem.style.display = 'initial';
          } else {
            sortValElem.style.display = 'none';
          }

          hider.style.display = 'none';
        } else {
          hider.style.display = 'block';
        }
      }
    }

    self.updateShowingText();
  };

  CATMAID.StackViewerGrid = StackViewerGrid;

})(CATMAID);
