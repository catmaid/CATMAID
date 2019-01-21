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
   * A re-usable component for widgets designed to show multiple positions in a stack.
   *
   * Usage: The parent widget should instantiate a StackViewerGrid in its init function, as the stack viewer grid
   * modifies both the controls and the content of the parent.
   *
   * @param parentID - an ID unique to the widget instance calling the stack viewer grid
   * @param contentContainer - the content element of the parent. If undefined, gets `#${parentID}-content`.
   * @param gridControlsContainer - the element to which grid controls other than paging should be added. If
   * undefined, gets `#${parentID}-controls`
   * @param pageControlsContainer - the element to which page controls should be added. If undefined, gets the grid
   * controls' container.
   * @constructor
   */
  var StackViewerGrid = function (parentID, contentContainer, gridControlsContainer, pageControlsContainer) {
    var parentIdPrefix = parentID.replace(/-*$/, '-');
    this.idPrefix = parentIdPrefix + 'stackviewers-';

    this.contentContainer = contentContainer || document.getElementById(parentIdPrefix + 'content');
    this.gridControlsContainer = gridControlsContainer || document.getElementById(parentIdPrefix + 'controls');
    this.pageControlsContainer = pageControlsContainer || this.gridControlsContainer;

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

    var freeWebGlContexts = CATMAID.MAX_WEBGL_CONTEXTS - CATMAID.countWebGlContexts();
    var allowedSides = Math.floor(Math.sqrt(freeWebGlContexts));
    this.dimensions = [Math.min(DEFAULT_HEIGHT, allowedSides), Math.min(DEFAULT_WIDTH, allowedSides)];

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
    this.createControls();

    this.initGridWindow();
    this.redrawPanels();
  };

  StackViewerGrid.prototype.getGridWindow = function () {
    var gridFrame = $(this.contentContainer).closest('.' + CMWNode.FRAME_CLASS).get(0);
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

  StackViewerGrid.prototype.createControls = function() {
    var self = this;

    // SETTINGS CONTROLS
    if (this.gridControlsContainer.hasChildNodes()) {
      this.gridControlsContainer.append(document.createElement('br'));
    }

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
    this.gridControlsContainer.appendChild(sourceStackViewerLabel);

    var tileCounts = document.createElement('div');
    tileCounts.style.display = 'inline-block';
    this.gridControlsContainer.appendChild(tileCounts);

    var makeTileCountOptions = function(max) {
      var arr = [];
      for (var i = 1; i <= max; i++) {
        arr.push({title: i, value:i});
      }
      return arr;
    };

    /**
     *
     * @param selectObject
     * @param maxValue - inclusive
     */
    var disableHighOptions = function(selectObject, maxValue) {
      var highestValidIdx = 0;
      $(selectObject).find('option').each(function(idx, option) {
        if ($(option).val() > maxValue){
          if (selectObject.selectedIndex > highestValidIdx) {
            selectObject.selectedIndex = highestValidIdx;
          }
          $(option).prop('disabled', true);
        } else {
          $(option).prop('disabled', false);
          highestValidIdx = idx;
        }
      });
    };

    var hTileCount = CATMAID.DOM.createSelect(
      self.idPrefix + "h-tile-count",
      makeTileCountOptions(MAX_HEIGHT),
      String(self.dimensions[0])
    );

    var hTileCountLabel = document.createElement('label');
    hTileCountLabel.appendChild(document.createTextNode('Height'));
    hTileCountLabel.appendChild(hTileCount);
    tileCounts.appendChild(hTileCountLabel);

    var wTileCount = CATMAID.DOM.createSelect(
      self.idPrefix + "w-tile-count",
      makeTileCountOptions(MAX_WIDTH),
      String(self.dimensions[1])
    );

    var wTileCountLabel = document.createElement('label');
    wTileCountLabel.appendChild(document.createTextNode('Width'));
    wTileCountLabel.appendChild(wTileCount);
    tileCounts.appendChild(wTileCountLabel);

    var allowedContexts = CATMAID.MAX_WEBGL_CONTEXTS - CATMAID.countWebGlContexts();
    disableHighOptions(hTileCount, Math.floor(allowedContexts/self.dimensions[1]));
    disableHighOptions(wTileCount, Math.floor(allowedContexts/self.dimensions[0]));

    hTileCount.onchange = function() {
      var highestOtherDimVal = Math.floor(
        (CATMAID.MAX_WEBGL_CONTEXTS - CATMAID.countWebGlContexts() + self.stackViewers.length) / this.value
      );
      disableHighOptions(wTileCount, highestOtherDimVal);
      self.redrawPanels();
      self.update();
    };

    wTileCount.onchange = function() {
      var highestOtherDimVal = Math.floor(
        (CATMAID.MAX_WEBGL_CONTEXTS - CATMAID.countWebGlContexts() + self.stackViewers.length) / this.value
      );
      disableHighOptions(hTileCount, highestOtherDimVal);
      self.redrawPanels();
      self.update();
    };

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
    this.gridControlsContainer.appendChild(scaleBarCbLabel);

    var zoomInput = document.createElement('input');
    zoomInput.setAttribute('type', 'text');
    zoomInput.setAttribute('pattern', '^\-?\d?\.?\d*$');
    zoomInput.setAttribute('size', '5');
    zoomInput.setAttribute('value', self.sourceStackViewer.s);
    zoomInput.onchange = function() {
      if (this.value === '') {
        this.value = self.sourceStackViewer.s;
      }

      var val = Number(this.value);
      if (val > 5) {
        this.value = val = 5;
      } else if (val < -2) {
        this.value = val = -2;
      }

      for (var stackViewer of self.stackViewers) {
        self.moveStackViewer(stackViewer, {s: self.sourceStackViewer.primaryStack.stackToProjectSMP(val)});
      }
    };

    var zoomLabel = document.createElement('label');
    zoomLabel.appendChild(document.createTextNode('Zoom'));
    zoomLabel.appendChild(zoomInput);
    this.gridControlsContainer.append(zoomLabel);

    var recentreButton = document.createElement('input');
    recentreButton.setAttribute('type', 'button');
    recentreButton.setAttribute('value', 'Recentre');
    recentreButton.onclick = function () {
      var zoomVal = Number(zoomInput.value);
      self.getVisibleTargets().forEach(function(target, idx) {
        self.moveStackViewer(self.stackViewers[idx], {
          z: target.coords.z,
          y: target.coords.y,
          x: target.coords.x,
          s: self.sourceStackViewer.primaryStack.stackToProjectSMP(zoomVal)
        });
      });
    };

    this.gridControlsContainer.append(recentreButton);

    // PAGINATION CONTROLS

    if (this.pageControlsContainer.hasChildNodes()) {
      this.pageControlsContainer.appendChild(document.createElement('br'));
    }

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
    this.pageControlsContainer.appendChild(prevButton);

    var pageCountContainer = document.createElement('div');
    pageCountContainer.style.display = 'inline-block';
    this.pageControlsContainer.appendChild(pageCountContainer);

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
    this.pageControlsContainer.appendChild(nextButton);

    var showing = document.createElement('p');
    showing.setAttribute('id', self.idPrefix + 'showing');
    showing.style.display = 'inline-block';
    showing.innerHTML = 'Showing <b class="start">0</b>-<b class="stop">0</b> of <b class="total">0</b>';
    this.pageControlsContainer.appendChild(showing);
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
      return set.addAll(tracingLayer.tracingOverlay.nodes.keys());
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

    // destroy existing
    this.closeStackViewers();
    this.stackViewers.length = 0;
    this.panelWindows.length = 0;
    while (this.contentContainer.lastChild) {
      this.contentContainer.removeChild(this.contentContainer.lastChild);
    }

    var gridWindow = this.getGridWindow();

    var stack = this.sourceStackViewer.primaryStack;

    for (var iIdx = 0; iIdx < this.dimensions[0]; iIdx++) {
      for (var jIdx = 0; jIdx < this.dimensions[1]; jIdx++) {
        // split the widget content into equal-sized panels
        var panelContainer = document.createElement('div');
        panelContainer.style.position = 'absolute';
        panelContainer.style.height = `${100 / this.dimensions[0]}%`;
        panelContainer.style.width = `${100 / this.dimensions[1]}%`;
        panelContainer.style.top = `${(100 / this.dimensions[0]) * iIdx}%`;
        panelContainer.style.left = `${(100 / this.dimensions[1]) * jIdx}%`;

        this.contentContainer.appendChild(panelContainer);

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
        $(panelWindow.getFrame()).children('.stackInfo_selected').get(0).onpointerdown = function () {return true;};
        panelWindow.parent = gridWindow;

        var panel = panelWindow.getFrame();
        panel.style.position = 'absolute';
        panel.classList.add('stack-viewer-grid-panel', `i${iIdx}`, `j${jIdx}`);

        var panelStackViewer = new CATMAID.StackViewer(project, stack, panelWindow);

        var stackLayer = this.sourceStackViewer.getLayer('StackLayer').constructCopy(
          {stackViewer: panelStackViewer, displayName: `Image data (${stack.title})`}
          );

        panelStackViewer.addLayer("StackLayer", stackLayer);

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
    var $content = $(this.contentContainer);
    $content.find('.active-element').hide();
    $content.find('.stackClose').hide();
    $content.find('.smallMapView_hidden').hide();  // doesn't work anyway
  };

  StackViewerGrid.prototype.moveStackViewer = function(stackViewer, coords, completionCallback) {
    var currentCoords = stackViewer.projectCoordinates();

    stackViewer.moveToProject(
      'z' in coords ? coords.z : currentCoords.z,
      'y' in coords ? coords.y : currentCoords.y,
      'x' in coords ? coords.x : currentCoords.x,
      's' in coords ? coords.s : this.sourceStackViewer.primaryStack.stackToProjectSMP(this.sourceStackViewer.s),
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
