/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/** An object that encapsulates the functions for creating accessory windows. */
var WindowMaker = new function()
{
  /** The table of window names versus their open instances..
   * Only windows that are open are stored. */
  var windows = {};
  var self = this;

  var createContainer = function(id) {
    var container = document.createElement("div");
    container.setAttribute("id", id);
    container.setAttribute("class", "sliceView");
    container.style.position = "relative";
    container.style.bottom = "0px";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.overflow = "auto";
    container.style.backgroundColor = "#ffffff";
    return container;
  };

  var addListener = function(win, container, button_bar, destroy, resize) {
    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof(destroy) === "function") {
              destroy();
            }
            if (typeof(project) === "undefined" || project === null) {
              rootWindow.close();
              document.getElementById("content").style.display = "none";
            } else {
              // Remove from listing
              for (var name in windows) {
                if (windows.hasOwnProperty(name)) {
                  if (win === windows[name]) {
                    // console.log("deleted " + name, windows[name]);
                    delete windows[name];
                    break;
                  }
                }
              }
              // win.close();
            }
            break;
          case CMWWindow.RESIZE:
            if( button_bar !== undefined ) {
                container.style.height = ( win.getContentHeight() - $('#' + button_bar).height() ) + "px";
            } else {
                container.style.height = ( win.getContentHeight() ) + "px";
            }
            container.style.width = ( win.getAvailableWidth() + "px" );

            if (typeof(resize) === "function") {
              resize();
            }

            break;
        }
        return true;
      });
  };

  var addLogic = function(win) {
    document.getElementById("content").style.display = "none";

    /* be the first window */
    if (rootWindow.getFrame().parentNode != document.body) {
      document.body.appendChild(rootWindow.getFrame());
      document.getElementById("content").style.display = "none";
    }

    if (rootWindow.getChild() === null)
      rootWindow.replaceChild(win);
    else
      rootWindow.replaceChild(new CMWHSplitNode(rootWindow.getChild(), win));

    win.focus();
  };


  var createConnectorSelectionWindow = function()
  {
    var win = new CMWWindow("Connector Selection Table");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var div = document.createElement('div');
    div.setAttribute('id', 'connector-selection-label');
    content.appendChild(div);

    var container = createContainer("connector_selection_widget");
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectorselectiontable">' +
        '<thead>' +
          '<tr>' +
            '<th>Connector</th>' +
            '<th>Node 1</th>' +
            '<th>Sk 1</th>' +
            '<th>C 1</th>' +
            '<th>Creator 1</th>' +
            '<th>Node 2</th>' +
            '<th>Sk 2</th>' +
            '<th>C 2</th>' +
            '<th>Creator 2</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>Connector</th>' +
            '<th>Node 1</th>' +
            '<th>Sk 1</th>' +
            '<th>C 1</th>' +
            '<th>Creator 1</th>' +
            '<th>Node 2</th>' +
            '<th>Sk 2</th>' +
            '<th>C 2</th>' +
            '<th>Creator 2</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container);
    addLogic(win);
    ConnectorSelection.init(); // MUST go after adding the container to the window, otherwise one gets "cannot read property 'aoData' of null" when trying to add data to the table

    return win;
  };

  var createSkeletonMeasurementsTable = function()
  {
    var SMT = new SkeletonMeasurementsTable();
    var win = new CMWWindow("Skeleton Measurements Table " + SMT.widgetID);
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement("div");

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(SkeletonListSources.createSelect(SMT));

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = SMT.loadSource.bind(SMT);
    buttons.appendChild(load);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = SMT.clear.bind(SMT);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = SMT.update.bind(SMT);
    buttons.appendChild(update);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("value", "Options");
    options.onclick = SMT.adjustOptions.bind(SMT);
    buttons.appendChild(options);

    var csv = document.createElement('input');
    csv.setAttribute("type", "button");
    csv.setAttribute("value", "Export CSV");
    csv.onclick = SMT.exportCSV.bind(SMT);
    buttons.appendChild(csv);

    var container = createContainer("skeleton_measurements_widget" + SMT.widgetID);

    content.appendChild(buttons);
    content.appendChild(container);

    var headings = '<tr>' + SMT.labels.map(function(label) { return '<th>' + label + '</th>'; }).join('') + '</tr>';

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeleton_measurements_table' + SMT.widgetID + '">' +
        '<thead>' + headings + '</thead>' +
        '<tfoot>' + headings + '</tfoot>' +
        '<tbody>' +
          '<tr>' + SMT.labels.map(function() { return '<td></td>'; }).join('') + '</tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container, null, SMT.destroy.bind(SMT));
    addLogic(win);

    SMT.init(); // Must be invoked after the table template has been created above.

    return win;
  };


  var createAnalyzeArbor = function() {
    var AA = new AnalyzeArbor();
    var win = new CMWWindow(AA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement("div");

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(SkeletonListSources.createSelect(AA));

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = AA.loadSource.bind(AA);
    buttons.appendChild(load);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = AA.clear.bind(AA);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = AA.update.bind(AA);
    buttons.appendChild(update);

    var pies = document.createElement('input');
    pies.setAttribute("type", "button");
    pies.setAttribute("value", "Export charts as SVG");
    pies.onclick = AA.exportSVG.bind(AA);
    buttons.appendChild(pies);

    content.appendChild(buttons);

    var container = createContainer("table_analyze_arbor_widget" + AA.widgetID);
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="analyzearbor' + AA.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th rowspan="2">Neuron name</th>' +
            '<th colspan="5">Arbor</th>' +
            '<th colspan="5">Backbone</th>' +
            '<th colspan="5">Dendrites</th>' +
            '<th colspan="5">Axon terminals</th>' +
          '</tr>' +
          '<tr>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
            '<th>Cable (nm)</th>' +
            '<th>Inputs</th>' +
            '<th>Outputs</th>' +
            '<th>Time (min)</th>' +
            '<th>Mito -chondria</th>' +
          '</tr>' +
        '</thead>' +
      '</table>';

    container.appendChild(document.createElement('br'));
    container.appendChild(createContainer('analyze_widget_charts_div' + AA.widgetID));

    addListener(win, container, 'analyze_arbor' + AA.widgetID, AA.destroy.bind(AA));

    addLogic(win);

    SkeletonListSources.updateGUI();
    AA.init();

    return win;
  };


  var createNeuronDendrogram = function(ndInstance) {
    var ND = ndInstance ? ndInstance : new NeuronDendrogram();
    var win = new CMWWindow(ND.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement("div");
    buttons.setAttribute("id", "dendrogram_buttons" + ND.widgetID);
    buttons.setAttribute("class", "buttonpanel");

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Display active skeleton");
    load.onclick = ND.loadActiveSkeleton.bind(ND);
    buttons.appendChild(load);

    var exportSVG = document.createElement('input');
    exportSVG.setAttribute("type", "button");
    exportSVG.setAttribute("value", "Export SVG");
    exportSVG.onclick = ND.exportSVG.bind(ND);
    buttons.appendChild(exportSVG);

    var tag = document.createElement('label');
    tag.appendChild(document.createTextNode('Tag'));
    var tagInput = document.createElement('input');
    tagInput.setAttribute('type', 'text');
    tagInput.setAttribute('id', 'dendrogram-tag-' + ND.widgetID);
    tagInput.onkeypress = function(e) {
      if (13 === e.keyCode) {
        ND.update();
      }
    };
    tag.appendChild(tagInput);
    buttons.appendChild(tag);

    var minStrahler = document.createElement('label');
    minStrahler.appendChild(document.createTextNode('Collapse Strahler <'));
    var minStrahlerInput = document.createElement('input');
    minStrahlerInput.setAttribute('type', 'number');
    minStrahlerInput.setAttribute('min', 1);
    minStrahlerInput.setAttribute('max', 999);
    minStrahlerInput.setAttribute('id', 'dendrogram-minStrahler-' + ND.widgetID);
    if (ND.minStrahler) {
      minStrahlerInput.value = ND.minStrahler;
    }
    minStrahlerInput.onchange = function(e) {
        ND.setMinStrahler(parseInt(this.value));
        ND.update();
    };
    minStrahlerInput.oninput = function(e) {
      if (13 === e.keyCode) {
        ND.update();
      } else {
        ND.setMinStrahler(parseInt(this.value));
      }
    };
    minStrahlerInput.onmousewheel = function(e) {
        if (e.wheelDelta < 0) {
          if (this.value > 0) {
            ND.setMinStrahler(parseInt(this.value) - 1);
            ND.update();
          }
        } else {
          ND.setMinStrahler(parseInt(this.value) + 1);
          ND.update();
        }
    };
    minStrahler.appendChild(minStrahlerInput);
    buttons.appendChild(minStrahler);

    var collapse = document.createElement('label');
    var collapseInput = document.createElement('input');
    collapseInput.setAttribute('type', 'checkbox');
    if (ND.collapsed) {
      collapseInput.setAttribute('checked', 'checked');
    }
    collapseInput.onchange = function() {
      ND.setCollapsed(this.checked);
      ND.update();
    };
    collapse.appendChild(collapseInput);
    collapse.appendChild(document.createTextNode('Only branches and tagged nodes'));
    buttons.appendChild(collapse);

    var collapseNotABranch = document.createElement('label');
    var collapseNotABranchInput = document.createElement('input');
    collapseNotABranchInput.setAttribute('type', 'checkbox');
    if (ND.collapseNotABranch) {
      collapseNotABranchInput.setAttribute('checked', 'checked');
    }
    collapseNotABranchInput.onchange = function() {
      ND.setCollapseNotABranch(this.checked);
      ND.update();
    };
    collapseNotABranch.appendChild(collapseNotABranchInput);
    collapseNotABranch.appendChild(document.createTextNode('Collapse \"not a branch\" nodes'));
    buttons.appendChild(collapseNotABranch);

    var naming = document.createElement('label');
    var namingInput = document.createElement('input');
    namingInput.setAttribute('type', 'checkbox');
    if (ND.showNodeIDs) {
      namingInput.setAttribute('checked', 'checked');
    }
    namingInput.onchange = function() {
      ND.setShowNodeIds(this.checked);
      ND.update();
    };
    naming.appendChild(namingInput);
    naming.appendChild(document.createTextNode('Show node IDs'));
    buttons.appendChild(naming);

    var showTags = document.createElement('label');
    var showTagsInput = document.createElement('input');
    showTagsInput.setAttribute('type', 'checkbox');
    if (ND.showTags) {
      showTagsInput.setAttribute('checked', 'checked');
    }
    showTagsInput.onchange = function() {
      ND.setShowTags(this.checked);
      ND.update();
    };
    showTags.appendChild(showTagsInput);
    showTags.appendChild(document.createTextNode('Show tags'));
    buttons.appendChild(showTags);

    var showStrahler = document.createElement('label');
    var showStrahlerInput = document.createElement('input');
    showStrahlerInput.setAttribute('type', 'checkbox');
    if (ND.showStrahler) {
      showStrahlerInput.setAttribute('checked', 'checked');
    }
    showStrahlerInput.onchange = function() {
      ND.setShowStrahler(this.checked);
      ND.update();
    };
    showStrahler.appendChild(showStrahlerInput);
    showStrahler.appendChild(document.createTextNode('Show Strahler'));
    buttons.appendChild(showStrahler);

    var radial = document.createElement('label');
    var radialInput = document.createElement('input');
    radialInput.setAttribute('type', 'checkbox');
    if (ND.radialDisplay) {
      radialInput.setAttribute('checked', 'checked');
    }
    radialInput.onchange = function() {
      ND.setRadialDisplay(this.checked);
      ND.update();
    };
    radial.appendChild(radialInput);
    radial.appendChild(document.createTextNode('Radial'));
    buttons.appendChild(radial);

    content.appendChild(buttons);

    var container = createContainer("dendrogram" + ND.widgetID);
    content.appendChild(container);

    addListener(win, container, 'dendrogram_buttons' + ND.widgetID,
        ND.destroy.bind(ND), ND.resize.bind(ND));
    addLogic(win);

    ND.init(container);

    return win;
  };


  var createStagingListWindow = function( instance, webglwin, webglwin_name ) {

    var ST = instance ? instance : new SelectionTable();

    var win = new CMWWindow(ST.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("neuron_staging_table" + ST.widgetID);

    var buttons = document.createElement("div");
    buttons.setAttribute('id', 'ST_button_bar' + ST.widgetID);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(SkeletonListSources.createSelect(ST));

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = ST.loadSource.bind(ST);
    buttons.appendChild(load);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = ST.clear.bind(ST);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = ST.update.bind(ST);
    buttons.appendChild(update);

    var prev = document.createElement('input');
    prev.setAttribute("type", "button");
    prev.setAttribute("id", "selection_table_prev");
    prev.setAttribute("value", "<");
    prev.onclick = ST.showPrevious.bind(ST);
    buttons.appendChild(prev);

    var range = document.createElement('span');
    range.innerHTML = "[<span id='selection_table_first" + ST.widgetID  + "'>0</span>, <span id='selection_table_last" + ST.widgetID  + "'>0</span>] of <span id='selection_table_length" + ST.widgetID  + "'>0</span>";
    buttons.appendChild(range);

    var next = document.createElement('input');
    next.setAttribute("type", "button");
    next.setAttribute("value", ">");
    next.onclick = ST.showNext.bind(ST);
    buttons.appendChild(next);

    buttons.appendChild(document.createTextNode(' Sync to:'));
    var link = SkeletonListSources.createPushSelect(ST, 'link');
    link.onchange = ST.syncLink.bind(ST, link);
    buttons.appendChild(link);

    buttons.appendChild(document.createElement('br'));

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("id", "annotate_skeleton_list");
    annotate.setAttribute("value", "Annotate");
    annotate.style.marginLeft = '1em';
    annotate.onclick = ST.annotate_skeleton_list.bind(ST);
    buttons.appendChild(annotate);
    
    var random = document.createElement('input');
    random.setAttribute("type", "button");
    random.setAttribute("value", "Randomize colors");
    random.onclick = ST.randomizeColorsOfSelected.bind(ST);
    buttons.appendChild(random);
    
    var measure = document.createElement('input');
    measure.setAttribute('type', 'button');
    measure.setAttribute('value', 'Measure');
    measure.onclick = ST.measure.bind(ST);
    buttons.appendChild(measure);

    buttons.appendChild(document.createElement('br'));

    var filterButton = document.createElement('input');
    filterButton.setAttribute('type', 'button');
    filterButton.setAttribute('value', 'Filter by regex:');
    filterButton.onclick = function() { ST.filterBy(filter.value); };
    buttons.appendChild(filterButton);

    var filter = document.createElement('input');
    filter.setAttribute('type', 'text');
    filter.setAttribute('id', 'selection-table-filter' + ST.widgetID);
    filter.onkeyup = function(ev) { if (13 === ev.keyCode) ST.filterBy(filter.value); };
    buttons.appendChild(filter);

    buttons.appendChild(document.createTextNode(' Batch color:'));
    var batch = document.createElement('input');
    batch.setAttribute('type', 'button');
    batch.setAttribute('value', 'color');
    batch.setAttribute('id', 'selection-table-batch-color-button' + ST.widgetID);
    batch.style.backgroundColor = '#ffff00';
    batch.onclick = ST.toggleBatchColorWheel.bind(ST);
    buttons.appendChild(batch);

    var colorwheeldiv = document.createElement('div');
    colorwheeldiv.setAttribute('id', 'selection-table-batch-color-wheel' + ST.widgetID);
    colorwheeldiv.innerHTML = '<div class="batch-colorwheel-' + ST.widgetID + '"></div>';
    buttons.appendChild(colorwheeldiv);

    win.getFrame().appendChild(buttons);
    content.appendChild(container);
    
    var tab = document.createElement('table');
    tab.setAttribute("id", "skeleton-table" + ST.widgetID);
    tab.innerHTML =
        '<thead>' +
          '<tr>' +
            '<th width="60px">action</th>' +
            '<th>name</th>' +
            '<th>% reviewed</th>' +
            '<th>selected</th>' +
            '<th>pre</th>' +
            '<th>post</th>' +
            '<th>text</th>' +
            '<th>meta</th>' +
            '<th>property  </th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr>' +
            '<td><img src="' + STATIC_URL_JS + 'images/delete.png" id="selection-table-remove-all' + ST.widgetID + '" title="Remove all"></td>' +
            '<td><input type="button" id="selection-table-sort-by-name' + ST.widgetID + '" value="Sort by name" /></td>' +
            '<td></td>' +
            '<td><input type="checkbox" id="selection-table-show-all' + ST.widgetID + '" checked /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all-pre' + ST.widgetID + '" checked /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all-post' + ST.widgetID + '" checked /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all-text' + ST.widgetID + '" /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all-meta' + ST.widgetID + '" checked /></td>' +
            '<td><input type="button" id="selection-table-sort-by-color' + ST.widgetID + '" value="Sort by color" /></td>' +
          '</tr>' +
        '</tbody>';
    container.appendChild(tab);

    //addListener(win, container, buttons, ST.destroy.bind(ST));
    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof project === undefined || project === null) {
              rootWindow.close();
              document.getElementById("content").style.display = "none";
            }
            else {
              // Remove from listing
              for (var name in windows) {
                if (windows.hasOwnProperty(name)) {
                  if (win === windows[name]) {
                    // console.log("deleted " + name, windows[name]);
                    delete windows[name];
                    break;
                  }
                }
              }
              ST.destroy();
              // win.close();
            }
            break;
          case CMWWindow.FOCUS:
            ST.setLastFocused();
            break;
          case CMWWindow.RESIZE:
            if( buttons.id !== undefined ) {
                container.style.height = ( win.getContentHeight() - $('#' + buttons.id).height() ) + "px";
            } else {
                container.style.height = ( win.getContentHeight() ) + "px";
            }
            container.style.width = ( win.getAvailableWidth() + "px" );

            break;
        }
        return true;
      });

    // addLogic(win);

    document.getElementById("content").style.display = "none";

    /* be the first window */
    if (rootWindow.getFrame().parentNode != document.body) {
      document.body.appendChild(rootWindow.getFrame());
      document.getElementById("content").style.display = "none";
    }

    if (rootWindow.getChild() === null)
      rootWindow.replaceChild(win);
    else {
        if( webglwin === undefined) {
            rootWindow.replaceChild(new CMWHSplitNode(rootWindow.getChild(), win));
        } else {
          webglwin.getParent().replaceChild(new CMWVSplitNode(webglwin, win), webglwin);
          // Set as push target
          for (var i = 0; i < link.options.length; ++i) {
            if (link.options[i].value === webglwin_name) {
              link.selectedIndex = i;
              link.onchange(); // set the linkTarget
              break;
            }
          }
        }
    }

    SkeletonListSources.updateGUI();
    ST.init();
    win.focus();

    return win;
  };

  /** Creates and returns a new 3d webgl window */
  var create3dWebGLWindow = function()
  {

    if ( !Detector.webgl ) {
      alert('Your browser does not seem to support WebGL.');
      return;
    }

    var WA = new WebGLApplication();

    var win = new CMWWindow(WA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement( "div" );
    bar.id = "3d_viewer_buttons";
    bar.setAttribute('class', 'buttonpanel');

    var titles = document.createElement('ul');
    bar.appendChild(titles);
    var tabs = ['Main', 'View', 'Shading', 'Skeleton filters', 'View settings', 'Shading parameters', 'Export'].reduce(function(o, name) {
          var id = name.replace(/ /, '') + WA.widgetID;
          titles.appendChild($('<li><a href="#' + id + '">' + name + '</a></li>')[0]);
          var div = document.createElement('div');
          div.setAttribute('id', id);
          bar.appendChild(div);
          o[name] = div;
          return o;
    }, {});

    var appendToTab = function(tab, elems) {
      elems.forEach(function(e) {
        switch (e.length) {
          case 1: tab.appendChild(e[0]); break;
          case 2: appendButton(tab, e[0], e[1]); break;
          case 3: appendButton(tab, e[0], e[1], e[2]); break;
          case 4: appendCheckbox(tab, e[0], e[1], e[2], e[3]); break;
          case 5: appendNumericField(tab, e[0], e[1], e[2], e[3], e[4]); break;
        }
      });
    };

    var select_source = SkeletonListSources.createSelect(WA);

    appendToTab(tabs['Main'],
        [
          [document.createTextNode('From')],
          [select_source],
          ['Append', WA.loadSource.bind(WA)],
          ['Clear', WA.clear.bind(WA)],
          ['Refresh', WA.updateSkeletons.bind(WA)],
          [document.createTextNode(' - ')],
          ['Spatial select', WA.spatialSelect.bind(WA)],
        ]);

    var storedViewsSelect = document.createElement('select');

    appendToTab(tabs['View'],
        [
          ['Center active', WA.look_at_active_node.bind(WA)],
          ['Follow active', false, function() { WA.setFollowActive(this.checked); }, false],
          ['XY', WA.XYView.bind(WA)],
          ['XZ', WA.XZView.bind(WA)],
          ['ZY', WA.ZYView.bind(WA)],
          ['ZX', WA.ZXView.bind(WA)],
          [storedViewsSelect],
          ['Save view', storeView],
          ['Restrict connectors', WA.toggleConnectors.bind(WA)],
          ['Fullscreen', WA.fullscreenWebGL.bind(WA)],
          ['Refresh active skeleton', WA.updateActiveSkeleton.bind(WA)],
        ]);

    // Wait for the 3D viewer to have initialized to get existing views
    var initInterval = window.setInterval(function() {
      if (WA.initialized) {
        window.clearInterval(initInterval);
        updateAvailableViews();
      }
    }, 200);

    // Change view if the drop down is changed or clicked
    storedViewsSelect.onchange = function() {
      if (-1 === this.selectedIndex || 0 === WA.getStoredViews().length) {
        return;
      }
      var name = this.options[this.selectedIndex].value;
      WA.activateView(name);
    };
    storedViewsSelect.onclick = storedViewsSelect.onchange;
    // Update the list when the element is focused
    storedViewsSelect.onfocus = updateAvailableViews;

    function storeView()
    {
      WA.storeCurrentView(null, function() {
        updateAvailableViews();
        storedViewsSelect.selectedIndex = storedViewsSelect.options.length - 1;
      });
    };

    function updateAvailableViews()
    {
      // Get currently selected view
      var lastIdx = storedViewsSelect.selectedIndex;
      var lastView = -1 === lastIdx ? -1 : storedViewsSelect[lastIdx].value;
      // Re-populate the view
      $(storedViewsSelect).empty();
      var views = WA.getStoredViews();
      if (views.length > 0) {
        views.forEach(function(name, i) {
          storedViewsSelect.options.add(new Option(name, name));
        });
        // Select view that was selected before
        var newIndex = -1;
        for (var i=0; i<views.length; ++i) {
          var view = storedViewsSelect.options[i].value;
          if (view === lastView) {
            newIndex = i;
            break;
          }
        }
        storedViewsSelect.selectedIndex = newIndex;
      } else {
        storedViewsSelect.options.add(new Option("(None)", -1));
        storedViewsSelect.selectedIndex = 0;
      }
    };
    
    var shadingMenu = document.createElement('select');
    shadingMenu.setAttribute("id", "skeletons_shading" + WA.widgetID);
    [['none', 'None'],
     ['active_node_split', 'Active node split'],
     ['near_active_node', 'Near active node'],
     ['downstream_amount', 'Downstream cable'],
     ['betweenness_centrality', 'Betweenness centrality'],
     ['slab_centrality', 'Slab centrality'],
     ['flow_centrality', 'Flow centrality'],
     ['centrifugal flow_centrality', 'Centrifugal flow centrality'],
     ['centripetal flow_centrality', 'Centripetal flow centrality'],
     ['distance_to_root', 'Distance to root'],
     ['partitions', 'Principal branch length'],
     ['strahler', 'Strahler analysis']
    ].forEach(function(e) {
       shadingMenu.options.add(new Option(e[1], e[0]));
     });
    shadingMenu.selectedIndex = 0;
    shadingMenu.onchange = WA.set_shading_method.bind(WA);

    var colorMenu = document.createElement('select');
    colorMenu.setAttribute('id', 'webglapp_color_menu' + WA.widgetID);
    [['none', 'Source'],
     ['creator', 'By Creator'],
     ['all-reviewed', 'All Reviewed'],
     ['own-reviewed', 'Own Reviewed'],
     ['axon-and-dendrite', 'Axon and dendrite'],
     ['downstream-of-tag', 'Downstream of tag']
    ].forEach(function(e) {
       colorMenu.options.add(new Option(e[1], e[0]));
    });
    colorMenu.selectedIndex = 0;
    colorMenu.onchange = WA.updateColorMethod.bind(WA, colorMenu);

    var synColors = document.createElement('select');
    synColors.options.add(new Option('Type: pre/red, post/cyan', 'cyan-red'));
    synColors.options.add(new Option('N with partner: pre[red > blue], post[yellow > cyan]', 'by-amount'));
    synColors.options.add(new Option('Synapse clusters', 'synapse-clustering'));
    synColors.options.add(new Option('Max. flow cut: axon (green) and dendrite (blue)', 'axon-and-dendrite'));
    synColors.onchange = WA.updateConnectorColors.bind(WA, synColors);

    appendToTab(tabs['Shading'],
        [
          [document.createTextNode('Shading: ')],
          [shadingMenu],
          [' Inv:', false, WA.toggleInvertShading.bind(WA), true],
          [document.createTextNode(' Color:')],
          [colorMenu],
          [document.createTextNode(' Synapse color:')],
          [synColors],
          ['User colormap', WA.toggle_usercolormap_dialog.bind(WA)],
        ]);

    var adjustFn = function(param_name) {
      return function() {
        WA.options[param_name] = this.checked;
        WA.adjustStaticContent();
      };
    };
    var o = WebGLApplication.prototype.OPTIONS;

    appendToTab(tabs['View settings'],
        [
          ['Meshes ', false, function() { WA.options.show_meshes = this.checked; WA.adjustContent()}, false],
          [WA.createMeshColorButton()],
          ['Active node', true, function() { WA.options.show_active_node = this.checked; WA.adjustContent(); }, false],
          ['Black background -', true, adjustFn('show_background'), false],
          ['Floor -', true, adjustFn('show_floor'), false],
          ['Bounding box -', true, adjustFn('show_box'), false],
          ['Z plane -', false, adjustFn('show_zplane'), false],
          ['Missing sections', false, adjustFn('show_missing_sections'), false],
          [' with height: ', o.missing_section_height, ' % - ', function() {
              WA.options.missing_section_height = Math.max(0, Math.min(this.value, 100));
              WA.adjustStaticContent();
            }, 10],
          ['Line width ', o.skeleton_line_width, null, function() { WA.updateSkeletonLineWidth(this.value); }, 10],
        ]);

    appendToTab(tabs['Skeleton filters'],
        [
          ['Smooth ', o.smooth_skeletons, function() { WA.options.smooth_skeletons = this.checked; WA.updateSkeletons(); }, false],
          [' with sigma ', o.smooth_skeletons_sigma, ' nm -', function() { WA.updateSmoothSkeletonsSigma(this.value); }, 10],
          ['Resample ', o.resample_skeletons, function() { WA.options.resample_skeletons = this.checked; WA.updateSkeletons(); }, false],
          [' with delta ', o.resampling_delta, ' nm -', function() { WA.updateResampleDelta(this.value); }, 10],
          ['Lean mode (no synapses, no tags)', o.lean_mode, function() { WA.options.lean_mode = this.checked; WA.updateSkeletons();}, false],
        ]);

    appendToTab(tabs['Shading parameters'],
        [
          ['Synapse clustering bandwidth ', o.synapse_clustering_bandwidth, ' nm - ', function() { WA.updateSynapseClusteringBandwidth(this.value); }, 8],
          ['Near active node ', o.distance_to_active_node, ' nm', function() {
            WA.updateActiveNodeNeighborhoodRadius(this.value); }, 8]
        ]);

    appendToTab(tabs['Export'],
        [
          ['Export PNG', WA.exportPNG.bind(WA)],
          ['Export SVG', WA.exportSVG.bind(WA)],
          ['Export catalog SVG', WA.exportCatalogSVG.bind(WA)],
        ]);

    content.appendChild( bar );

    $(bar).tabs();

    var buttons = document.createElement( "div" );
    buttons.id = "buttons_in_3d_webgl_widget";
    content.appendChild(buttons);

    var container = createContainer("view_in_3d_webgl_widget" + WA.widgetID);
    content.appendChild(container);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas" + WA.widgetID);
    canvas.style.backgroundColor = "#000000";
    container.appendChild(canvas);

    // Add window to DOM, init WebGLView (requires element in DOM) and
    // create a staging list. The listeners are added last to prevent
    // the execution of the RESIZE handler before the canvas is
    // initialized.
    addLogic(win);
    WA.init( 800, 600, canvas.getAttribute("id") );
    // Create a Selection Table, preset as the sync target
    createStagingListWindow( null, win, WA.getName() );

    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof project === undefined || project === null) {
              rootWindow.close();
              document.getElementById("content").style.display = "none";
            }
            else {
              // Remove from listing
              for (var name in windows) {
                if (windows.hasOwnProperty(name)) {
                  if (win === windows[name]) {
                    delete windows[name];
                    break;
                  }
                }
              }
              WA.destroy();
            }
            break;
          case CMWWindow.RESIZE:
            var frame = win.getFrame();
            var w = win.getAvailableWidth();
            var h = win.getContentHeight() - buttons.offsetHeight;
            container.style.width = w + "px";
            container.style.height = h + "px";
            WA.resizeView( w, h );
            // Update the container height to account for the table-div having been resized
            // TODO
            break;
        }
        return true;
      });

    // Resize WebGLView after staging list has been added
    win.callListeners( CMWWindow.RESIZE );

    SkeletonListSources.updateGUI();

    // Now that a Selection Table exists, set it as the default pull source
    for (var i=select_source.length; --i; ) {
      if (0 === select_source.options[i].value.indexOf("Selection ")) {
        select_source.selectedIndex = i;
        break;
      }
    }

    return win;
  };

  /** Creates and returns a new 3d window. */
  var create3dWindow = function()
  {
    var win = new CMWWindow("3D View");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("view_in_3d_widget");
    content.appendChild(container);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "add_current_to_3d_view");
    add.setAttribute("value", "Add current skeleton to 3D view");
    add.onclick = Treelines.addTo3DView; // function declared in treeline.js
    container.appendChild(add);

    var introduction = document.createElement('p');
    introduction.setAttribute("id", "view3DIntroduction");
    container.appendChild(introduction);

    var list = document.createElement('ul');
    list.setAttribute("id", "view-3d-object-list");
    container.appendChild(list);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-canvas");
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    container.appendChild(canvas);

    var buttons = document.createElement('div');
    ['xy', 'xz', 'zy'].map(function (s) {
      var b = document.createElement('input');
      b.setAttribute("id", s + "-button");
      b.setAttribute("type", "button");
      b.setAttribute("value", s.toUpperCase());
      buttons.appendChild(b);
    });
    container.appendChild(buttons);

    addListener(win, container);

    addLogic(win);

    // Fill in with a Raphael canvas, now that the window exists in the DOM:
    Treelines.createViewerFromCATMAID(canvas.getAttribute("id"));

    return win;
  };

  var createSliceInfoWindow = function()
  {
    var win = new CMWWindow("Slice Info Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("table-container");
    content.appendChild( container );

    var slicetable = document.createElement('div');
    slicetable.innerHTML =
      '<table cellpadding="0" cellspacing="2" border="0" class="display" id="slicetable"></table>';

    var segmentstable = document.createElement('div');
    segmentstable.innerHTML =
      '<table cellpadding="0" cellspacing="2" border="0" class="display" id="segmentstable"></table>';

    container.appendChild( slicetable );
    container.appendChild( segmentstable );

    addListener(win, container);

    addLogic(win);

    return win;
  };

  var createGraphWindow = function()
  {
    var GG = new GroupGraph();

    var win = new CMWWindow(GG.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var bar = document.createElement('div');
    bar.setAttribute("id", 'compartment_graph_window_buttons' + GG.widgetID);
    bar.setAttribute('class', 'buttonpanel');

    var titles = document.createElement('ul');
    bar.appendChild(titles);
    var tabs = ['Main', 'Grow', 'Layout', 'Selection', 'Subgraphs', 'Align', 'Export'].reduce(function(o, name) {
          titles.appendChild($('<li><a href="#' + name + GG.widgetID + '">' + name + '</a></li>')[0]);
          var div = document.createElement('div');
          div.setAttribute('id', name + GG.widgetID);
          bar.appendChild(div);
          o[name] = div;
          return o;
    }, {});

    var appendToTab = function(tab, elems) {
      elems.forEach(function(e) {
        switch (e.length) {
          case 1: tab.appendChild(e[0]); break;
          case 2: appendButton(tab, e[0], e[1]); break;
          case 3: appendButton(tab, e[0], e[1], e[2]); break;
        }
      });
    };

    appendToTab(tabs['Main'],
        [[document.createTextNode('From')],
         [SkeletonListSources.createSelect(GG)],
         ['Append', GG.loadSource.bind(GG)],
         ['Append as group', GG.appendAsGroup.bind(GG)],
         ['Clear', GG.clear.bind(GG)],
         ['Refresh', GG.update.bind(GG)],
         ['Properties', GG.graph_properties.bind(GG)]]);

    var color = document.createElement('select');
    color.setAttribute('id', 'graph_color_choice' + GG.widgetID);
    color.options.add(new Option('source', 'source'));
    color.options.add(new Option('review status (union)', 'union-review'));
    color.options.add(new Option('review status (own)', 'own-review'));
    color.options.add(new Option('input/output', 'I/O'));
    color.options.add(new Option('betweenness centrality', 'betweenness_centrality'));
    color.options.add(new Option('circles of hell (upstream)', 'circles_of_hell_upstream')); // inspired by Tom Jessell's comment
    color.options.add(new Option('circles of hell (downstream)', 'circles_of_hell_downstream'));
    color.onchange = GG._colorize.bind(GG, color);

    var layout = appendSelect(tabs['Layout'], "compartment_layout",
        ["Force-directed", "Hierarchical", "Grid", "Circle",
         "Concentric (degree)", "Concentric (out degree)", "Concentric (in degree)",
         "Random", "Compound Spring Embedder", "Manual"]);

    appendToTab(tabs['Layout'],
        [['Re-layout', GG.updateLayout.bind(GG, layout)],
         [document.createTextNode(' - Color: ')],
         [color]]);

    appendToTab(tabs['Selection'],
        [['Annotate', GG.annotate_skeleton_list.bind(GG)],
         [document.createTextNode(' - ')],
         ['Measure edge risk', GG.annotateEdgeRisk.bind(GG)],
         [document.createTextNode(' - ')],
         ['Group', GG.group.bind(GG)],
         ['Ungroup', GG.ungroup.bind(GG)],
         [document.createTextNode(' - ')],
         ['Hide', GG.hideSelected.bind(GG)],
         ['Show hidden', GG.showHidden.bind(GG), {id: 'graph_show_hidden' + GG.widgetID, disabled: true}],
         [document.createTextNode(' - ')],
         ['Remove', GG.removeSelected.bind(GG)],
         [document.createTextNode(' - ')],
        ]);

    appendToTab(tabs['Align'],
        [[document.createTextNode('Align: ')],
         [' X ', GG.equalizeCoordinate.bind(GG, 'x')],
         [' Y ', GG.equalizeCoordinate.bind(GG, 'y')],
         [document.createTextNode(' - Distribute: ')],
         [' X ', GG.distributeCoordinate.bind(GG, 'x')],
         [' Y ', GG.distributeCoordinate.bind(GG, 'y')]]);

    var n_circles = document.createElement('select');
    n_circles.setAttribute("id", "n_circles_of_hell" + GG.widgetID);
    [1, 2, 3, 4, 5].forEach(function(title, i) {
      var option = document.createElement("option");
      option.text = title;
      option.value = title;
      n_circles.appendChild(option);
    });

    var f = function(name) {
      var e = document.createElement('select');
      e.setAttribute("id", "n_circles_min_" + name + GG.widgetID);
      var option = document.createElement("option");
      option.text = "All " + name;
      option.value = 0;
      e.appendChild(option);
      option = document.createElement("option");
      option.text = "No " + name;
      option.value = -1;
      e.appendChild(option);
      for (var i=1; i<51; ++i) {
        option = document.createElement("option");
        option.text = i;
        option.value = i;
        e.appendChild(option);
      }
      e.selectedIndex = 3; // value of 2 pre or post min
      return e;
    };

    appendToTab(tabs['Grow'],
        [[document.createTextNode('Grow ')],
         ['Circles', GG.growGraph.bind(GG)],
         [document.createTextNode(" or ")],
         ['Paths', GG.growPaths.bind(GG)],
         [document.createTextNode(" by ")],
         [n_circles],
         [document.createTextNode("hops, limit:")],
         [f("upstream")],
         [f("downstream")]]);

    appendToTab(tabs['Export'],
        [['Export GML', GG.exportGML.bind(GG)],
         ['Export SVG', GG.exportSVG.bind(GG)],
         ['Export Adjacency Matrix', GG.exportAdjacencyMatrix.bind(GG)],
         ['Open plot', GG.openPlot.bind(GG)],
         ['Quantify', GG.quantificationDialog.bind(GG)]]);

    appendToTab(tabs['Subgraphs'],
        [[document.createTextNode('Select node(s) and split by: ')],
         ['Axon & dendrite', GG.splitAxonAndDendrite.bind(GG)],
         ['Axon, backbone dendrite & dendritic terminals', GG.splitAxonAndTwoPartDendrite.bind(GG)], 
         ['Synapse clusters', GG.splitBySynapseClustering.bind(GG)],
         ['Reset', GG.unsplit.bind(GG)]]);

    content.appendChild( bar );

    $(bar).tabs();

    /* Create graph container and assure that it's overflow setting is set to
     * 'hidden'. This is required, because cytoscape.js' redraw can be delayed
     * (e.g. due to animation). When the window's size is reduced, it can happen
     * that the cytoscape canvas is bigger than the container. The default
     * 'auto' setting then introduces scrollbars, triggering another resize.
     * This somehow confuses cytoscape.js and causes the graph to disappear.
     */
    var container = createContainer("graph_widget" + GG.widgetID);
    container.style.overflow = 'hidden';
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cyelement" + GG.widgetID);
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#FFFFF0";
    container.appendChild(graph);

    addListener(win, container, 'compartment_graph_window_buttons' + GG.widgetID,
        GG.destroy.bind(GG), GG.resize.bind(GG));

    addLogic(win);

    GG.init();

    SkeletonListSources.updateGUI();

    return win;
  };

  var createCircuitGraphPlot = function() {

    var GP = new CircuitGraphPlot();

    var win = new CMWWindow(GP.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'circuit_graph_plot_buttons' + GP.widgetID);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(SkeletonListSources.createSelect(GP));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append");
    add.onclick = GP.loadSource.bind(GP);
    buttons.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = GP.clear.bind(GP);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = GP.update.bind(GP);
    buttons.appendChild(update);

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("value", "Annotate");
    annotate.onclick = GP.annotate_skeleton_list.bind(GP);
    buttons.appendChild(annotate);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("value", "Options");
    options.onclick = GP.adjustOptions.bind(GP);
    buttons.appendChild(options);


    buttons.appendChild(document.createTextNode(' - X:'));

    var axisX = document.createElement('select');
    axisX.setAttribute('id', 'circuit_graph_plot_X_' + GP.widgetID);
    buttons.appendChild(axisX);

    buttons.appendChild(document.createTextNode(' Y:'));

    var axisY = document.createElement('select');
    axisY.setAttribute('id', 'circuit_graph_plot_Y_' + GP.widgetID);
    buttons.appendChild(axisY);

    var redraw = document.createElement('input');
    redraw.setAttribute("type", "button");
    redraw.setAttribute("value", "Draw");
    redraw.onclick = GP.redraw.bind(GP);
    buttons.appendChild(redraw);

    buttons.appendChild(document.createTextNode(" Names:"));
    var toggle = document.createElement('input');
    toggle.setAttribute("type", "checkbox");
    toggle.checked = true;
    toggle.onclick = GP.toggleNamesVisible.bind(GP, toggle);
    buttons.appendChild(toggle);

    var xml = document.createElement('input');
    xml.setAttribute("type", "button");
    xml.setAttribute("value", "Export SVG");
    xml.onclick = GP.exportSVG.bind(GP);
    buttons.appendChild(xml);

    var csv = document.createElement('input');
    csv.setAttribute("type", "button");
    csv.setAttribute("value", "Export CSV");
    csv.onclick = GP.exportCSV.bind(GP);
    buttons.appendChild(csv);

    var csva = document.createElement('input');
    csva.setAttribute("type", "button");
    csva.setAttribute("value", "Export CSV (all)");
    csva.onclick = GP.exportCSVAll.bind(GP);
    buttons.appendChild(csva);

    content.appendChild(buttons);

    var container = createContainer('circuit_graph_plot_div' + GP.widgetID);
    content.appendChild(container);

    var plot = document.createElement('div');
    plot.setAttribute('id', 'circuit_graph_plot' + GP.widgetID);
    plot.style.width = "100%";
    plot.style.height = "100%";
    plot.style.backgroundColor = "#FFFFF0";
    container.appendChild(plot);

    addListener(win, container, 'circuit_graph_plot_buttons' + GP.widgetID, GP.destroy.bind(GP), GP.resize.bind(GP));

    addLogic(win);

    SkeletonListSources.updateGUI();

    return win;
  };


  var createMorphologyPlotWindow = function() {
  
    var MA = new MorphologyPlot();

    var win = new CMWWindow(MA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'morphology_plot_buttons' + MA.widgetID);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(SkeletonListSources.createSelect(MA));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append");
    add.onclick = MA.loadSource.bind(MA);
    buttons.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = MA.clear.bind(MA);
    buttons.appendChild(clear);

    var update = document.createElement('input');
    update.setAttribute("type", "button");
    update.setAttribute("value", "Refresh");
    update.onclick = MA.update.bind(MA);
    buttons.appendChild(update);

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("value", "Annotate");
    annotate.onclick = MA.annotate_skeleton_list.bind(MA);
    buttons.appendChild(annotate);

    buttons.appendChild(document.createTextNode(' - '));

    var csv = document.createElement('input');
    csv.setAttribute("type", "button");
    csv.setAttribute("value", "Export CSV");
    csv.onclick = MA.exportCSV.bind(MA);
    buttons.appendChild(csv);

    var svg = document.createElement('input');
    svg.setAttribute("type", "button");
    svg.setAttribute("value", "Export SVG");
    svg.onclick = MA.exportSVG.bind(MA);
    buttons.appendChild(svg);

    buttons.appendChild(document.createElement('br'));

    appendSelect(buttons, "function",
        ['Sholl analysis',
         'Radial density of cable',
         'Radial density of branch nodes',
         'Radial density of ends',
         'Radial density of input synapses',
         'Radial density of output synapses']);

    buttons.appendChild(document.createTextNode(' Radius (nm): '));
    var radius = document.createElement('input');
    radius.setAttribute("id", "morphology_plot_step" + MA.widgetID);
    radius.setAttribute("type", "text");
    radius.setAttribute("value", "1000");
    radius.style.width = "40px";
    buttons.appendChild(radius);

    buttons.appendChild(document.createTextNode(' Center: '));
    appendSelect(buttons, "center",
        ['First branch node',
         'Root node',
         'Active node',
         'Bounding box center',
         'Average node position',
         'Highest centrality node',
         'Highest signal flow centrality']);

    var redraw = document.createElement('input');
    redraw.setAttribute("type", "button");
    redraw.setAttribute("value", "Draw");
    redraw.onclick = MA.redraw.bind(MA);
    buttons.appendChild(redraw);

    content.appendChild(buttons);

    var container = createContainer('morphology_plot_div' + MA.widgetID);
    content.appendChild(container);

    addListener(win, container, 'morphology_plot_buttons' + MA.widgetID, MA.destroy.bind(MA), MA.resize.bind(MA));

    addLogic(win);

    SkeletonListSources.updateGUI();

    return win;
  };

  var createVennDiagramWindow = function() {
  
    var VD = new VennDiagram();

    var win = new CMWWindow(VD.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'venn_diagram_buttons' + VD.widgetID);

    buttons.appendChild(document.createTextNode('From'));
    buttons.appendChild(SkeletonListSources.createSelect(VD));

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("value", "Append as group");
    add.onclick = VD.loadSource.bind(VD);
    buttons.appendChild(add);

    var clear = document.createElement('input');
    clear.setAttribute("type", "button");
    clear.setAttribute("value", "Clear");
    clear.onclick = VD.clear.bind(VD);
    buttons.appendChild(clear);

    var svg = document.createElement('input');
    svg.setAttribute("type", "button");
    svg.setAttribute("value", "Export SVG");
    svg.onclick = VD.exportSVG.bind(VD);
    buttons.appendChild(svg);

    var sel = document.createElement('span');
    sel.innerHTML = ' Selected: <span id="venn_diagram_sel' + VD.widgetID + '">none</span>';
    buttons.appendChild(sel);

    content.appendChild(buttons);

    var container = createContainer('venn_diagram_div' + VD.widgetID);
    content.appendChild(container);

    addListener(win, container, 'venn_diagram_buttons' + VD.widgetID, VD.destroy.bind(VD), VD.resize.bind(VD));

    addLogic(win);

    SkeletonListSources.updateGUI();

    return win;
  };


  var createAssemblyGraphWindow = function()
  {

    var win = new CMWWindow("Assembly graph Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'assembly_graph_window_buttons');

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "testbutton");
    add.setAttribute("value", "Show graph");
    contentbutton.appendChild(add);

    content.appendChild( contentbutton );

    var container = createContainer("assembly_graph_widget");
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cytograph");
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#FFFFF0";
    container.appendChild(graph);

    addListener(win, container);

    addLogic(win);

    return win;
  };


  var createSegmentsTablesWindow = function()
  {

    var win = new CMWWindow("Segments Table Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    /*
    var container = createContainer("segments_table_widget");
    content.appendChild(container);

    
    var graph = document.createElement('div');
    graph.setAttribute("id", "segmentstable-div");
    graph.style.height = "100%";
    graph.style.width = "100%";
    container.appendChild(graph);
    */

    var container = createContainer("segmentstable-container");
    content.appendChild( container );

    container.innerHTML =
      '<table cellpadding="0" cellspacing="2" border="0" class="display" id="segmentstable"></table>';

    addListener(win, container);

    addLogic(win);

    return win;
  };

  var createNodeTableWindow = function(tnt_instance)
  {
    var TNT = tnt_instance ? tnt_instance : new TreenodeTable();
    var win = new CMWWindow(TNT.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'table_of_skeleton_buttons' + TNT.widgetID);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "update_treenodetable_current_skeleton" + TNT.widgetID);
    add.setAttribute("value", "List active skeleton");
    add.onclick = TNT.update.bind(TNT);
    contentbutton.appendChild(add);

    var refresh = document.createElement('input');
    refresh.setAttribute("type", "button");
    refresh.setAttribute("id", "refresh_treenodetable" + TNT.widgetID);
    refresh.setAttribute("value", "Refresh");
    refresh.onclick = TNT.refresh.bind(TNT);
    contentbutton.appendChild(refresh);

    content.appendChild( contentbutton );

    var container = createContainer("treenode_table_widget" + TNT.widgetID);
    content.appendChild( container );

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="treenodetable' + TNT.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type' +
        '' +
        '<select name="search_type" id="search_type' + TNT.widgetID + '" class="search_init">' +
        '<option value="">Any</option><option value="R">Root</option><option value="LR" selected="selected">Leaf</option>' +
        '<option value="B">Branch</option><option value="S">Slab</option></select>' +
        '</th>' +
        // <input type="text" name="search_type" value="Search" class="search_init" />
            '<th>tags<input type="text" name="search_labels" id="search_labels' + TNT.widgetID + '" value="Search" class="search_init" /></th>' +
            '<th>c</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</th>' +
            '<th>r</th>' +
            '<th>user</th>' +
            '<th>last modified</th>' +
            '<th>reviewer</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>tags</th>' +
            '<th>c</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</th>' +
            '<th>r</th>' +
            '<th>user</th>' +
            '<th>last modified</th>' +
            '<th>reviewer</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td colspan="10"></td></tr>' +
        '</tbody>' +
      '</table>';

    addListener(win, container, 'table_of_skeleton_buttons' + TNT.widgetID, TNT.destroy.bind(TNT));

    addLogic(win);

    TNT.init( project.getId() );

    return win;
  };

  var createConnectorTableWindow = function(ct_instance)
  {
    var CT = ct_instance ? ct_instance : new ConnectorTable();
    var win = new CMWWindow(CT.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'table_of_connector_buttons' + CT.widgetID);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "update_connectortable_current_skeleton" + CT.widgetID);
    add.setAttribute("value", "List current skeleton");
    add.onclick = CT.updateConnectorTable.bind(CT);
    contentbutton.appendChild(add);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "refresh_connectortable_current_skeleton" + CT.widgetID);
    add.setAttribute("value", "Refresh");
    add.onclick = CT.refreshConnectorTable.bind(CT);
    contentbutton.appendChild(add);

    var direction = document.createElement('select');
    direction.setAttribute("id", "connector_relation_type" + CT.widgetID);
    var objOption = document.createElement("option");
    objOption.innerHTML = "Incoming connectors";
    objOption.value = "0";
    direction.appendChild(objOption);
    var objOption2 = document.createElement("option");
    objOption2.innerHTML = "Outgoing connectors";
    objOption2.value = "1";
    objOption2.selected = "selected";
    direction.appendChild(objOption2);
    contentbutton.appendChild(direction);

    content.appendChild( contentbutton );

    var container = createContainer("connectortable_widget" + CT.widgetID);
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectortable'+ CT.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_top' + CT.widgetID + '">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</ht>' +
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_top' + CT.widgetID + '"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_top' + CT.widgetID + '">target treenode ID</th>' +
            '<th>last modified</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_bottom' + CT.widgetID + '">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</ht>' +
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_bottom' + CT.widgetID + '"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_bottom' + CT.widgetID + '">target treenode ID</th>' +
            '<th>last modified</th>' +
          '</tr>' +
        '</tfoot>' +
      '</table>';


    addListener(win, container, 'table_of_connector_buttons' + CT.widgetID, CT.destroy.bind(CT));

    addLogic(win);

    CT.init( project.getId() );

    return win;
  };

  var appendSelect = function(div, name, entries) {
    var select = document.createElement('select');
    select.setAttribute("id", div.id + "_" + name);
    entries.forEach(function(title, i) {
      var option = document.createElement("option");
      option.text = title;
      option.value = i;
      select.appendChild(option);
    });
    div.appendChild(select);
    return select;
  };

  var appendButton = function(div, title, onclickFn, attr) {
    var b = document.createElement('input');
    if (attr) Object.keys(attr).forEach(function(key) { b.setAttribute(key, attr[key]); });
    b.setAttribute('type', 'button');
    b.setAttribute('value', title);
    b.onclick = onclickFn;
    div.appendChild(b);
    return b;
  };

  var appendCheckbox = function(div, title, value, onclickFn, left) {
    var cb = document.createElement('input');
    cb.setAttribute('type', 'checkbox');
    cb.checked = value ? true : false;
    cb.onclick = onclickFn;
    var elems = [cb, document.createTextNode(title)];
    if (left) elems.reverse();
    elems.forEach(function(elem) { div.appendChild(elem); });
    return cb;
  };

  var appendNumericField = function(div, label, value, postlabel, onchangeFn, length) {
    var nf = document.createElement('input');
    nf.setAttribute('type', 'text');
    nf.setAttribute('value', value);
    if (length) nf.setAttribute('size', length);
    if (onchangeFn) nf.onchange = onchangeFn;
    if (label) div.appendChild(document.createTextNode(label));
    div.appendChild(nf);
    if (postlabel) div.appendChild(document.createTextNode(postlabel));
    return nf;
  };


  var createSkeletonAnalyticsWindow = function()
  {
    var SA = new SkeletonAnalytics();

    var win = new CMWWindow(SA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var div = document.createElement('div');
    div.setAttribute('id', 'skeleton_analytics');
    content.appendChild(div);

    div.appendChild(SkeletonListSources.createSelect(SA));

    appendSelect(div, "extra" + SA.widgetID, ["No others", "Downstream skeletons", "Upstream skeletons", "Both upstream and downstream"]);
    var adjacents = [];
    for (var i=0; i<5; ++i) adjacents.push(i);
    appendSelect(div, "adjacents" + SA.widgetID, adjacents);

    var update = document.createElement('input');
    update.setAttribute('type', 'button');
    update.setAttribute('value', 'Update');
    update.onclick = SA.load.bind(SA);
    div.appendChild(update);

    var container = createContainer('skeleton_analytics_widget');
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeletonanalyticstable' + SA.widgetID + '">' +
        '<thead>' +
          '<tr>' +
            '<th>Issue</th>' +
            '<th>Neuron ID</th>' +
            '<th>Treenode ID</th>' +
            '<th>Skeleton ID</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>Issue</th>' +
            '<th>Neuron ID</th>' +
            '<th>Treenode ID</th>' +
            '<th>Skeleton ID</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td></td><td></td><td></td><td></td></tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container, 'skeleton_analytics', SA.destroy.bind(SA));
    addLogic(win);

    SA.init(); // must be called after the above placeholder table is created
    SkeletonListSources.updateGUI();

    return win;
  };

    var createLogTableWindow = function()
    {
        var win = new CMWWindow("Log");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'table_of_log_buttons');

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "update_logtable");
        add.setAttribute("value", "Update table");
        add.onclick = updateLogTable; // function declared in table_log.js
        contentbutton.appendChild(add);

        /* users */
        var sync = document.createElement('select');
        sync.setAttribute("id", "logtable_username");
        var option = document.createElement("option");
        option.text = "All";
        option.value = -1;
        sync.appendChild(option);
        contentbutton.appendChild(sync);

        requestQueue.register(django_url + 'user-list', 'GET', undefined,
            function (status, data, text) {
                var e = $.parseJSON(data);
                if (status !== 200) {
                    alert("The server returned an unexpected status (" + status + ") " + "with error message:\n" + text);
                } else {
                    var new_users = document.getElementById("logtable_username");
                    for (var i in e) {
                        var option = document.createElement("option");
                        option.text = e[i].login + " (" + e[i].full_name + ")";
                        option.value = e[i].id;
                        new_users.appendChild(option);
                    }
                }
        });

        var sync = document.createElement('select');
        sync.setAttribute("id", "logtable_operationtype");
        var option = document.createElement("option");
        option.text = "All";
        option.value = -1;
        sync.appendChild(option);
        var operation_type_array = [
        "rename_root",
        "create_neuron",
        "rename_neuron",
        "remove_neuron",
        "move_neuron",

        "create_group",
        "rename_group",
        "remove_group",
        "move_group",

        "create_skeleton",
        "rename_skeleton",
        "remove_skeleton",
        "move_skeleton",

        "split_skeleton",
        "join_skeleton",
        "reroot_skeleton",

        "change_confidence"
        ];
        for( var i = 0; i < operation_type_array.length; i++ ) {
          var option = document.createElement("option");
            option.text = operation_type_array[i];
            option.value = operation_type_array[i];
            sync.appendChild(option);            
        }
        contentbutton.appendChild(sync);
        content.appendChild( contentbutton );

        var container = createContainer("logtable_widget");
        content.appendChild(container);

        container.innerHTML =
            '<table cellpadding="0" cellspacing="0" border="0" class="display" id="logtable">' +
                '<thead>' +
                '<tr>' +
                    '<th>user</th>' +
                    '<th>operation</th>' +
                    '<th>timestamp</th>' +
                    '<th>x</th>' +
                    '<th>y</th>' +
                    '<th>z</th>' +
                    '<th>freetext<input type="text" name="search_freetext" id="search_freetext" value="" class="search_init" /></th>' +
                '</tr>' +
                '</thead>' +
                '<tfoot>' +
                '<tr>' +
                    '<th>user</th>' +
                    '<th>operation</th>' +
                    '<th>timestamp</th>' +
                    '<th>x</th>' +
                    '<th>y</th>' +
                    '<th>z</th>' +
                    '<th>freetext</th>' +
                '</tr>' +
                '</tfoot>' +
            '</table>';

        addListener(win, container, 'table_of_log_buttons');

        addLogic(win);

        LogTable.init( project.getId() );

        return win;
    };

    var createReviewWindow = function()
    {
        var win = new CMWWindow("Review System");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'review_window_buttons');

        var start = document.createElement('input');
        start.setAttribute("type", "button");
        start.setAttribute("id", "start_review_whole skeleton");
        start.setAttribute("value", "Start to review skeleton");
        start.onclick = ReviewSystem.startReviewActiveSkeleton.bind(ReviewSystem, false);
        contentbutton.appendChild(start);

        var start = document.createElement('input');
        start.setAttribute("type", "button");
        start.setAttribute("id", "start_review_subarbor");
        start.setAttribute("value", "Start to review current sub-arbor");
        start.onclick = ReviewSystem.startReviewActiveSkeleton.bind(ReviewSystem, true);
        contentbutton.appendChild(start);

        var end = document.createElement('input');
        end.setAttribute("type", "button");
        end.setAttribute("id", "end_review_skeleton");
        end.setAttribute("value", "End review");
        end.onclick = ReviewSystem.endReview;
        contentbutton.appendChild(end);

        content.appendChild( contentbutton );

        var label = document.createElement('div');
        label.setAttribute("id", "reviewing_skeleton");
        content.appendChild(label);

        var container = document.createElement("div");
        container.setAttribute("id", "project_review_widget");
        container.style.position = "relative";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.overflow = "auto";
        container.style.backgroundColor = "#ffffff";
        content.appendChild(container);

        var resetOwns = document.createElement('input');
        resetOwns.setAttribute("type", "button");
        resetOwns.setAttribute("id", "reset_skeleton_review_owns");
        resetOwns.setAttribute("value", "Reset own revisions");
        resetOwns.onclick = ReviewSystem.resetOwnRevisions;
        contentbutton.appendChild(resetOwns);

        var cacheImages = document.createElement('input');
        cacheImages.setAttribute("type", "button");
        cacheImages.setAttribute("id", "cache_images_of_skeleton");
        cacheImages.setAttribute("value", "Cache tiles");
        cacheImages.onclick = ReviewSystem.cacheImages;
        contentbutton.appendChild(cacheImages);

        var autoCenter = document.createElement('input');
        autoCenter.setAttribute('type', 'checkbox');
        autoCenter.setAttribute('id', 'review_auto_center');
        autoCenter.setAttribute('checked', 'checked');
        autoCenter.onchange = function() {
          ReviewSystem.setAutoCentering(this.checked);
        };
        var autoCenterLabel = document.createElement('label');
        autoCenterLabel.appendChild(autoCenter);
        autoCenterLabel.appendChild(document.createTextNode('Auto centering'));
        contentbutton.appendChild(autoCenterLabel);

        var sync = document.createElement('input');
        sync.setAttribute('type', 'checkbox');
        sync.setAttribute('id', 'remote_review_skeleton');
        sync.checked = false;
        contentbutton.appendChild(sync);
        contentbutton.appendChild(document.createTextNode(' Remote? '));

        var cacheCounter = document.createElement('div');
        cacheCounter.setAttribute("id", "counting-cache");
        contentbutton.appendChild(cacheCounter);

        var cacheInfoCounter = document.createElement('div');
        cacheInfoCounter.setAttribute("id", "counting-cache-info");
        contentbutton.appendChild(cacheInfoCounter);

        addListener(win, container, 'review_window_buttons');

        addLogic(win);

        ReviewSystem.init();

        return win;
    };

    var createConnectivityWindow = function()
    {
        var SC = new SkeletonConnectivity();
        var widgetID = SC.widgetID;

        var win = new CMWWindow(SC.getName());
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("class", "buttonpanel");
        contentbutton.setAttribute("id", 'skeleton_connectivity_buttons' + widgetID);

        contentbutton.appendChild(document.createTextNode('From'));
        contentbutton.appendChild(SkeletonListSources.createSelect(SC));

        var op = document.createElement('select');
        op.setAttribute('id', 'connectivity_operation' + widgetID);
        op.appendChild(new Option('All partners', 'logic-OR'));
        op.appendChild(new Option('Common partners', 'logic-AND')); // added prefix, otherwise gets sent as nonsense
        contentbutton.appendChild(op);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Append");
        add.onclick = SC.loadSource.bind(SC);
        contentbutton.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = SC.clear.bind(SC);
        contentbutton.appendChild(clear);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = SC.update.bind(SC);
        contentbutton.appendChild(update);

        contentbutton.appendChild(document.createTextNode(' Sync to:'));
        var link = SkeletonListSources.createPushSelect(SC, 'link');
        link.onchange = SC.syncLink.bind(SC, link);
        contentbutton.appendChild(link);

        var plot = document.createElement('input');
        plot.setAttribute("type", "button");
        plot.setAttribute("value", "Open plot");
        plot.onclick = SC.openPlot.bind(SC);
        contentbutton.appendChild(plot);

        var layoutToggle = document.createElement('input');
        layoutToggle.setAttribute('id', 'connectivity-layout-toggle-' + widgetID);
        layoutToggle.setAttribute('type', 'checkbox');
        if (SC.tablesSideBySide) {
          layoutToggle.setAttribute('checked', 'checked');
        }
        layoutToggle.onchange = (function() {
          this.tablesSideBySide = this.checked;
        }).bind(SC);
        var layoutLabel = document.createElement('label');
        layoutLabel.appendChild(document.createTextNode('Tables side by side'));
        layoutLabel.appendChild(layoutToggle);
        contentbutton.appendChild(layoutLabel);

        content.appendChild( contentbutton );

        var container = createContainer( "connectivity_widget" + widgetID );
        container.setAttribute('class', 'connectivity_widget');
        content.appendChild( container );

        addListener(win, container, 'skeleton_connectivity_buttons' + widgetID, SC.destroy.bind(SC));

        addLogic(win);
        SkeletonListSources.updateGUI();

        return win;
    };

  var createConnectivityGraphPlot = function(instance) {
    var GP = instance ? instance : new ConnectivityGraphPlot();

    var win = new CMWWindow(GP.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement('div');
    buttons.setAttribute('id', 'connectivity_graph_plot_buttons' + GP.widgetID);

    var xml = document.createElement('input');
    xml.setAttribute("type", "button");
    xml.setAttribute("value", "Export SVG");
    xml.onclick = GP.exportSVG.bind(GP);
    buttons.appendChild(xml);

    content.appendChild(buttons);

    var container = createContainer('connectivity_graph_plot_div' + GP.widgetID);
    content.appendChild(container);

    var plot = document.createElement('div');
    plot.setAttribute('id', 'connectivity_graph_plot' + GP.widgetID);
    plot.style.width = "100%";
    plot.style.height = "100%";
    plot.style.backgroundColor = "#FFFFFF";
    container.appendChild(plot);

    addListener(win, container, 'connectivity_graph_plot_buttons' + GP.widgetID,
            GP.destroy.bind(GP), GP.resize.bind(GP));

    addLogic(win);

    return win;
  };

    var createAdjacencyMatrixWindow = function()
    {
        var win = new CMWWindow("Adjacency Matrix");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'skeleton_adjmatrix_buttons');

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "retrieve_adjmatrix");
        add.setAttribute("value", "Get matrix");
        add.onclick = AdjacencyMatrix.fetchMatrixForSkeletons;
        contentbutton.appendChild(add);

        content.appendChild( contentbutton );

        var container = createContainer( "adjacencymatrix_widget" );
        content.appendChild( container );

        addListener(win, container, 'skeleton_adjmatrix_buttons');

        addLogic(win);

        AdjacencyMatrix.init();

        return win;
    };

  var createExportWidget = function()
  {
      var win = new CMWWindow("Export widget");
      var content = win.getFrame();
      content.style.backgroundColor = "#ffffff";

      var container = createContainer( "project_export_widget" );
      content.appendChild( container );

      addListener(win, container);

      addLogic(win);

      $('#project_export_widget').load(django_url + project.id + '/exportwidget',
        function(response, status, xhr) {
          if (status == "success") {
            // Bind NetworkX JSON link to handler
            $(this).find('#export-networkx').click(function() {
              graphexport_nxjson();
            });
            // Bind NeuroML link to handler
            $(this).find('#export-neuroml181').click(function() {
              graphexport_NeuroML181();
            });
            // Bind treenode export link to handler
            $(this).find('#export-treenode-archive').click(function() {
              // Show dialog to select
              export_treenodes();
            });
            // Bind connector export link to handler
            $(this).find('#export-connector-archive').click(function() {
              // Show dialog to select
              export_connectors();
            });
          }
        });

      return win;
  };


  var createOntologyWidget = function()
  {
    var win = new CMWWindow( "Ontology editor" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "ontology_editor_widget" );
    content.appendChild( container );

    container.innerHTML =
      '<input type="button" id="refresh_ontology_editor" value="refresh" style="display:block; float:left;" />' +
      '<br clear="all" />' +
      '<div id="ontology_known_roots">Known root class names: <span id="known_root_names"></span></div>' +
      '<div id="ontology_warnings"></div>' +
      '<div id="ontology_tree_name"><h4>Ontology</h4>' +
      '<div id="ontology_tree_object"></div></div>' +
      '<div id="ontology_relations_name"><h4>Relations</h4>' +
      '<div id="ontology_relations_tree"></div></div>' +
      '<div id="ontology_classes_name"><h4>Classes</h4>' +
      '<div id="ontology_classes_tree"></div></div>' +
      '<div id="ontology_add_dialog" style="display:none; cursor:default">' +
      '<div id="input_rel"><p>New relation name: <input type="text" id="relname" /></p></div>' +
      '<div id="input_class"><p>New class name: <input type="text" id="classname" /></p></div>' +
      '<div id="select_class"><p>Subject: <select id="classid"></p></select></div>' +
      '<div id="select_rel"></p>Relation: <select id="relid"></select></p></div>' +
      '<div id="target_rel"><p>Relation: <span id="name"></span></p></div>' +
      '<div id="target_object"><p>Object: <span id="name"></span></p></div>' +
      '<p><input type="button" id="cancel" value="Cancel" />' +
      '<input type="button" id="add" value="Add" /></p></div>' +
      '<div id="cardinality_restriction_dialog" style="display:none; cursor:default">' +
      '<p><div id="select_type">Cardinality type: <select id="cardinality_type"></select></div>' +
      '<div id="input_value">Cardinality value: <input type="text" id="cardinality_val" /></div></p>' +
      '<p><input type="button" id="cancel" value="Cancel" />' +
      '<input type="button" id="add" value="Add" /></p></div>';

    addListener(win, container);

    addLogic(win);

    OntologyEditor.init();

    return win;
  };

  var createOntologySearchWidget = function(osInstance)
  {
    // If available, a new instance passed as parameter will be used.
    var OS = osInstance ? osInstance : new OntologySearch();
    var win = new CMWWindow(OS.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("ontology-search" + OS.widgetID);
    container.setAttribute('class', 'ontology_search');

    // Add container to DOM
    content.appendChild(container);

    // Wire it up.
    addListener(win, container, undefined, OS.destroy.bind(OS));
    addLogic(win);

    // Let the ontology search initialize the interface within the created
    // container.
    OS.init_ui(container);

    return win;
  };

  var createClassificationWidget = function()
  {
    var win = new CMWWindow( "Classification editor" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "classification_editor_widget" );
    content.appendChild( container );

    addListener(win, container);

    addLogic(win);

    ClassificationEditor.init();

    return win;
  };

  var createClusteringWidget = function()
  {
    var win = new CMWWindow( "Clustering" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "clustering_widget" );
    content.appendChild( container );

    container.innerHTML = '<div id="clustering_content"></div>';

    addListener(win, container);

    addLogic(win);

    ClusteringWidget.init();

    return win;
  };

  var getHelpForActions = function(actions)
  {
    var action, keys, i, k, result = '';
    for( i = 0; i < actions.length; ++i ) {
      action = actions[i];
      keys = action.getKeys();
      for( k in keys ) {
        result += '<kbd>' + k + '</kbd> ' + action.getHelpText() + "<br />";
      }
    }
    return result;
  };

  this.setKeyShortcuts = function(win)
  {
    var actions, action, i, tool, content, container;

    // If a window hasn't been passed in, look it up.
    if (typeof win == 'undefined') {
      win = windows['keyboard-shortcuts'];
      if (!win) {
        return;
      }
    }

    content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    container = document.getElementById("keyboard-shortcuts-window");
    if (!container) {
      container = createContainer("keyboard-shortcuts-window");
      content.appendChild( container );
    }

    var keysHTML = '<p id="keyShortcutsText">';
    keysHTML += '<h4>Global Key Help</h4>';

    actions = project.getActions();
    keysHTML += getHelpForActions(actions);

    tool = project.getTool();
    if (tool) {
      if (tool.hasOwnProperty('getMouseHelp')) {
        keysHTML += '<h4>Tool-specific Mouse Help</h4>';
        keysHTML += tool.getMouseHelp();
      }

      if (tool.hasOwnProperty('getActions')) {
        keysHTML += '<h4>Tool-specific Key Help</h4>';
        keysHTML += getHelpForActions(tool.getActions());
      }
    }
    keysHTML += '</p>';

    container.innerHTML = keysHTML;
    return container;
  };

  this.setSearchWindow = function(win)
  {
    var actions, action, i, tool, content, container;

    // If a window hasn't been passed in, look it up.
    if (typeof win == 'undefined') {
      win = windows['search'];
      if (!win) {
        return;
      }
    }

    content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    container = document.getElementById("search-window");
    if (!container) {
      container = createContainer("search-window");
      content.appendChild( container );
    }

    var keysHTML = '<form onsubmit="TracingTool.search(); return false">';
    keysHTML += '<input type="text" id="search-box" name="search-box">';
    keysHTML += '<input type="submit" style="display: hidden">';
    keysHTML += '</form>';
    keysHTML += '<div id="search-results">';
    keysHTML += '</div>';

    container.innerHTML = keysHTML;
    return container;
  };

  var createKeyboardShortcutsWindow = function()
  {
    var win = new CMWWindow( "Keyboard Shortcuts" );
    var container = self.setKeyShortcuts(win);

    $(container)
      .append($('<h4 />').text('Contributors'))
      .append('CATMAID v0.24, &copy;&nbsp;2007&ndash;2014 ' +
          '<a href="http://fly.mpi-cbg.de/~saalfeld/">Stephan Saalfeld</a>, ' +
          '<a href="http://www.unidesign.ch/">Stephan Gerhard</a>, ' +
          '<a href="http://longair.net/mark/">Mark Longair</a>, ' +
          '<a href="http://albert.rierol.net/">Albert Cardona</a> and ' +
          'Tom Kazimiers.<br /><br />' +
          'Funded by <a href="http://www.mpi-cbg.de/research/research-groups/pavel-tomancak.html">' +
          'Pavel Toman&#x010d;&aacute;k</a>, MPI-CBG, Dresden, Germany and ' +
          '<a href="http://albert.rierol.net/">Albert Cardona</a>, ' +
          'HHMI Janelia Farm, U.S..<br /><br />' +
          'Visit the <a href="http://www.catmaid.org/" target="_blank">' +
          'CATMAID homepage</a> for further information. You can find the ' +
          'source code on <a href="https://github.com/acardona/CATMAID">' +
          'GitHub</a>, where you can also <a href="https://github.com/acardona/CATMAID/issues">' +
          'report</a> bugs and problems.');

    addListener(win, container);

    addLogic(win);

    return win;
  };

  var createSearchWindow = function()
  {
    var win = new CMWWindow( "Search" );
    var container = self.setSearchWindow(win);

    addListener(win, container);

    addLogic(win);

    return win;
  };


  var createStatisticsWindow = function()
  {
    var win = new CMWWindow( "Statistics" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "project_stats_widget" );
    content.appendChild( container );

    addListener(win, container);

    addLogic(win);

    ProjectStatistics.init();

    return win;
  };
  
  
  var createNotificationsWindow = function()
  {
    var win = new CMWWindow( "Notifications" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "notifications_widget" );
    content.appendChild( container );

    container.innerHTML = '<table cellpadding="0" cellspacing="0" border="0" class="display" id="notificationstable">' +
        '<thead>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>description</th>' +
            '<th>status' +
              '<select name="search_type" id="search_type" class="search_init">' +
                '<option value="">Any</option>' + 
                '<option value="0">Open</option>' + 
                '<option value="1">Approved</option>' +
                '<option value="2">Rejected</option>' + 
                '<option value="3">Invalid</option>' + 
              '</select>' +
            '</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>node id</th>' +
            '<th>skeleton id</th>' +
            '<th>from</th>' +
            '<th>date</th>' +
            '<th>actions</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>description</th>' +
            '<th>status</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>node id</th>' +
            '<th>skeleton id</th>' +
            '<th>from</th>' +
            '<th>date</th>' +
            '<th>actions</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td colspan="8"></td></tr>' +
        '</tbody>' +
      '</table>';

    addListener(win, container);

    addLogic(win);

    NotificationsTable.init();
    
    return win;
  };
  
  var createNeuronAnnotationsWindow = function()
  {
    var NA = new NeuronAnnotations();
    var win = new CMWWindow(NA.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";
    
    var queryFields = document.createElement('div');
    queryFields.setAttribute('id', 'neuron_annotations_query_fields' + NA.widgetID);
    // Create the query fields HTML and use {{NA-ID}} as template for the
    // actual NA.widgetID which will be replaced afterwards.
    var queryFields_html =
      '<form id="neuron_query_by_annotations{{NA-ID}}">' +
      '<table cellpadding="0" cellspacing="0" border="0" ' +
          'class="neuron_annotations_query_fields" ' +
          'id="neuron_annotations_query_fields{{NA-ID}}">' +
        '<tr id="neuron_query_by_name{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">named as:</td> ' +
          '<td class="neuron_annotations_query_field">' +
            '<input type="text" name="neuron_query_by_name" ' +
                'id="neuron_query_by_name{{NA-ID}}" value="" class="" />' +
            '<em>(optional)</em>' +
          '</td> ' +
        '</tr>' +
        '<tr id="neuron_query_by_annotation{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">annotated:</td> ' +
          '<td class="neuron_annotations_query_field">' +
            '<input type="text" name="neuron_query_by_annotation" ' +
                'class="neuron_query_by_annotation_name{{NA-ID}}" value="" />' +
            '<input type="checkbox" name="neuron_query_include_subannotation" ' +
                'class="neuron_query_include_subannotation{{NA-ID}}" value="" />' +
            'Include sub-annotations ' +
            '<input type="button" name="neuron_annotations_add_annotation" ' +
                'id="neuron_annotations_add_annotation{{NA-ID}}" value="+" ' +
                'class="" />' +
          '</td> ' +
        '</tr>' +
        '<tr id="neuron_query_by_annotator{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">by:</td>' +
          '<td class="neuron_annotations_query_field">' +
            '<select name="neuron_query_by_annotator" ' +
                'id="neuron_query_by_annotator{{NA-ID}}" class="">' +
              '<option value="-2">Anyone</option>' +
            '</select>' +
          '</td>' +
        '</tr>' +
        '<tr id="neuron_query_by_date_range{{NA-ID}}">' +
          '<td class="neuron_annotations_query_field_label">between:</td>' +
          '<td class="neuron_annotations_query_field">' +
            '<input type="text" name="neuron_query_by_start_date" ' +
                'id="neuron_query_by_start_date{{NA-ID}}" size="10" ' +
                'value="" class=""/>' +
            ' and ' +
            '<input type="text" name="neuron_query_by_end_date" ' +
                'id="neuron_query_by_end_date{{NA-ID}}" size="10" ' +
                'value="" class=""/> ' +
          '</td>' +
        '</tr>' +
      '</table>' +
      '<input type="submit" />' +
      '</form>';
    // Replace {{NA-ID}} with the actual widget ID
    queryFields.innerHTML = queryFields_html.replace(/{{NA-ID}}/g, NA.widgetID);
    content.appendChild(queryFields);
    
    var container = createContainer("neuron_annotations_query_results" + NA.widgetID);
    // Create container HTML and use {{NA-ID}} as template for the
    // actual NA.widgetID which will be replaced afterwards.
    var container_html =
      '<div id="neuron_annotations_query_footer{{NA-ID}}" ' +
          'class="neuron_annotations_query_footer">' +
        '<input type="button" id="neuron_annotations_annotate{{NA-ID}}" ' +
            'value="Annotate..." />' +
        '<input id="neuron_annotation_prev_page{{NA-ID}}" type="button" value="<" />' +
        '<span id="neuron_annotations_paginattion{{NA-ID}}">[0, 0] of 0</span>' +
        '<input id="neuron_annotation_next_page{{NA-ID}}" type="button" value=">" />' +
        '<label id="neuron_annotations_add_to_selection{{NA-ID}}">' +
          'Sync to: ' +
        '</label>' +
      '</div>' +
      '<table cellpadding="0" cellspacing="0" border="0" ' +
            'class="neuron_annotations_query_results_table display" ' +
            'id="neuron_annotations_query_results_table{{NA-ID}}">' +
        '<thead>' +
          '<tr>' +
            '<th>' +
              '<input type="checkbox" ' +
                  'id="neuron_annotations_toggle_neuron_selections_checkbox{{NA-ID}}" />' +
            '</th>' +
            '<th>' +
              'Entity Name' +
            '</th>' +
            '<th>Type</th>' +
            '<th>' +
              '<div class="result_annotations_column">Annotations</div>' +
              '<div>' +
                '<label for="neuron_annotations_user_filter{{NA-ID}}">' +
                    'By ' +
                '</label>' +
                '<select name="annotator_filter" class="" ' +
                    'id="neuron_annotations_user_filter{{NA-ID}}">' +
                  '<option value="show_all" selected>Anyone</option>' +
                '</select>' +
              '</div>' +
            '</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr><td colspan="3"></td></tr>' +
        '</tbody>' +
      '</table>';
    // Replace {{NA-ID}} with the actual widget ID
    container.innerHTML = container_html.replace(/{{NA-ID}}/g, NA.widgetID);
    content.appendChild( container );

    // Add a container that gets displayed if no results could be found
    var no_results = createContainer("neuron_annotations_query_no_results" + NA.widgetID);
    no_results.innerHTML = '<em>No results could be found.</em>';
    content.appendChild(no_results);
    $(no_results).hide();

    
    // Wire it up.
    addListener(win, container, queryFields.id, NA.destroy.bind(NA));
    addLogic(win);

    // Update annotation cache and add autocompletion to annotation input field
    annotations.update(function() {
      NA.add_autocomplete_to_input($('.neuron_query_by_annotation_name' +
          NA.widgetID));
    });

    $('#neuron_annotations_add_annotation' + NA.widgetID)[0].onclick =
        NA.add_query_field.bind(NA);
    $('#neuron_query_by_annotations' + NA.widgetID).submit(function(event) {
          NA.query.call(NA, true);
          event.preventDefault();
        });
    $('#neuron_annotations_annotate' + NA.widgetID)[0].onclick = (function() {
        // Get IDs of selected entities
        var selected_entity_ids = this.get_selected_neurons().map( function(e) {
          return e.id;
        });
        // Refresh display after annotations have been added
        this.annotate_entities(selected_entity_ids,
            this.refresh_annotations.bind(this));
    }).bind(NA);
    $('#neuron_annotation_prev_page' + NA.widgetID)[0].onclick =
        NA.prev_page.bind(NA);
    $('#neuron_annotation_next_page' + NA.widgetID)[0].onclick =
        NA.next_page.bind(NA);

    $('#neuron_annotations_toggle_neuron_selections_checkbox' + NA.widgetID)[0].onclick =
        NA.toggle_neuron_selections.bind(NA);
    var select = SkeletonListSources.createPushSelect(NA, 'link');
    select.onchange = NA.syncLink.bind(NA, select);
    $('#neuron_annotations_add_to_selection' + NA.widgetID).append(select);

    // Fill user select boxes
    var $select = $('tr #neuron_query_by_annotator' + NA.widgetID);
    var $filter_select = $("#neuron_annotations_query_results_table" +
        NA.widgetID + ' select[name=annotator_filter]');
    var users = User.all();
    for (var userID in users) {
      if (users.hasOwnProperty(userID) && userID !== "-1") {
        var user = users[userID];
        {
          // Add entry to query select
          var opts = {value: user.id, text: user.fullName};
          $("<option />", opts).appendTo($select);
          // Add entry to filter select and select current user by default
          if (userID == session.userid) { opts.selected = true; }
          $("<option />", opts).appendTo($filter_select);
        }
      }
    }

    // Make it support autocompletion
    $select.combobox();

    // Make annotation filter select support autocompletion and attach the
    // selected event handler right away. Unfortunately, this can't be done
    // later.
    $filter_select.combobox({
      selected: function(event, ui) {
        var val = $(this).val();
        NA.toggle_annotation_display(val != 'show_all', val);
      }
    });
    
    $( "#neuron_query_by_start_date" + NA.widgetID ).datepicker(
        { dateFormat: "yy-mm-dd" });
    $( "#neuron_query_by_end_date" + NA.widgetID ).datepicker(
        { dateFormat: "yy-mm-dd" });

    // Hide the result container by default. It would be more logical to do this
    // right after the contaienr creation. However, adding auto completion to
    // the filter select box doesn't work when it is hidden.
    $(container).hide();

    SkeletonListSources.updateGUI();

    return win;
  };

  var createNeuronNavigatorWindow = function(new_nn_instance)
  {
    // If available, a new instance passed as parameter will be used.
    var NN = new_nn_instance ? new_nn_instance : new NeuronNavigator();
    var win = new CMWWindow(NN.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("neuron-navigator" + NN.widgetID);
    container.setAttribute('class', 'navigator_widget');

    // Add container to DOM
    content.appendChild(container);

    // Wire it up.
    addListener(win, container, undefined, NN.destroy.bind(NN));
    addLogic(win);

    // Let the navigator initialize the interface within
    // the created container.
    NN.init_ui(container);

    SkeletonListSources.updateGUI();

    return win;
  };

  var createSettingsWindow = function()
  {
    var win = new CMWWindow("Settings");
    var content = win.getFrame();
    var container = createContainer("settings");
    container.setAttribute('id', 'settings_widget');
    content.appendChild( container );
    content.style.backgroundColor = "#ffffff";

    // Wire it up
    addListener(win, container);
    addLogic(win);

    // Initialize settings window with container added to the DOM
    var SW = new SettingsWidget();
    SW.init(container);

    return win;
  };
  
  var creators = {
    "keyboard-shortcuts": createKeyboardShortcutsWindow,
    "search": createSearchWindow,
    "3d-view": create3dWindow,
    "3d-webgl-view": create3dWebGLWindow,
    "node-table": createNodeTableWindow,
    "connector-table": createConnectorTableWindow,
    "log-table": createLogTableWindow,
    "export-widget": createExportWidget,
    "neuron-staging-area": createStagingListWindow,
    "create-connector-selection": createConnectorSelectionWindow,
    "skeleton-measurements-table": createSkeletonMeasurementsTable,
    "graph-widget": createGraphWindow,
    "connectivity-graph-plot": createConnectivityGraphPlot,
    "assemblygraph-widget": createAssemblyGraphWindow,
    "sliceinfo-widget": createSliceInfoWindow,
    "statistics": createStatisticsWindow,
    "review-system": createReviewWindow,
    "connectivity-widget": createConnectivityWindow,
    "adjacencymatrix-widget": createAdjacencyMatrixWindow,
    "skeleton-analytics-widget": createSkeletonAnalyticsWindow,
    "ontology-editor": createOntologyWidget,
    "ontology-search": createOntologySearchWidget,
    "classification-editor": createClassificationWidget,
    "notifications": createNotificationsWindow,
    "clustering-widget": createClusteringWidget,
    "circuit-graph-plot": createCircuitGraphPlot,
    "morphology-plot": createMorphologyPlotWindow,
    "venn-diagram": createVennDiagramWindow,
    "neuron-annotations": createNeuronAnnotationsWindow,
    "neuron-navigator": createNeuronNavigatorWindow,
    "settings": createSettingsWindow,
    "analyze-arbor": createAnalyzeArbor,
    "neuron-dendrogram": createNeuronDendrogram,
  };

  /** If the window for the given name is already showing, just focus it.
   * Otherwise, create it new. */
  this.show = function(name)
  {
    if (creators.hasOwnProperty(name)) {
      if (windows[name]) {
        windows[name].focus();
      } else {
        windows[name] = creators[name]();
      }
    } else {
      alert("No known window with name " + name);
    }
  };

  /** Always create a new instance of the widget. The caller is allowed to hand
   * in extra parameters that will be passed on to the actual creator method. */
  this.create = function(name, init_params) {
    if (creators.hasOwnProperty(name)) {
      windows[name] = creators[name](init_params);
    } else {
      alert("No known window with name " + name);
    }
  };

}();
