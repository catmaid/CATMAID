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
    var win = new CMWWindow("Skeleton Measurements Table");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("skeleton_measurements_widget");
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeleton_measurements_table">' +
        '<thead>' +
          '<tr>' +
            '<th>Neuron</th>' +
            '<th>Skeleton</th>' +
            '<th>Raw cable (nm)</th>' +
            '<th>Smooth cable (nm)</th>' +
            '<th>N inputs</th>' +
            '<th>N outputs</th>' +
            '<th>N nodes</th>' +
            '<th>N branch nodes</th>' +
            '<th>N end nodes</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>Neuron</th>' +
            '<th>Skeleton</th>' +
            '<th>Raw cable (nm)</th>' +
            '<th>Smooth cable (nm)</th>' +
            '<th>N inputs</th>' +
            '<th>N outputs</th>' +
            '<th>N nodes</th>' +
            '<th>N branch nodes</th>' +
            '<th>N end nodes</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>' +
        '</tbody>' +
      '</table>';
    // ABOVE, notice the table needs one dummy row

    addListener(win, container);
    addLogic(win);
    SkeletonMeasurementsTable.init(); // MUST go after adding the container to the window, otherwise one gets "cannot read property 'aoData' of null" when trying to add data to the table

    return win;
  };


  var createStagingListWindow = function( webglwin, webglwin_name ) {

    var ST = new SelectionTable();

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
    filterButton.setAttribute('value', 'Filter by');
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
            '<th>selected</th>' +
            '<th>pre</th>' +
            '<th>post</th>' +
            '<th>text</th>' +
            '<th>property  </th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr>' +
            '<td><img src="' + STATIC_URL_JS + 'widgets/themes/kde/delete.png" id="selection-table-remove-all' + ST.widgetID + '" title="Remove all"></td>' +
            '<td><input type="button" id="selection-table-sort-by-name' + ST.widgetID + '" value="Sort by name" /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all' + ST.widgetID + '" checked /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all-pre' + ST.widgetID + '" checked /></td>' +
            '<td><input type="checkbox" id="selection-table-show-all-post' + ST.widgetID + '" checked /></td>' +
            '<td></td>' +
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

    var buttons = document.createElement( "div" );
    buttons.id = "buttons_in_3d_webgl_widget";
    content.appendChild(buttons);
    
    var container = createContainer("view_in_3d_webgl_widget" + WA.widgetID);
    content.appendChild(container);

    buttons.appendChild(document.createTextNode('From'));
    var select_source = SkeletonListSources.createSelect(WA);
    buttons.appendChild(select_source);

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("value", "Append");
    load.onclick = WA.loadSource.bind(WA);
    buttons.appendChild(load);

    var reload = document.createElement('input');
    reload.setAttribute("type", "button");
    reload.setAttribute("value", "Refresh");
    reload.onclick = WA.updateSkeletons.bind(WA);
    buttons.appendChild(reload);

    var append = document.createElement('input');
    append.setAttribute("type", "button");
    append.setAttribute("value", "Clear");
    append.onclick = WA.clear.bind(WA);
    buttons.appendChild(append);
    
    var center = document.createElement('input');
    center.setAttribute("type", "button");
    center.setAttribute("value", "Center active");
    center.style.marginLeft = '1em';
    center.onclick = WA.look_at_active_node.bind(WA);
    buttons.appendChild(center);

    var fulls = document.createElement('input');
    fulls.setAttribute("type", "button");
    fulls.setAttribute("value", "Fullscreen");
    fulls.style.marginLeft = '1em';
    fulls.onclick = WA.fullscreenWebGL.bind(WA);
    buttons.appendChild(fulls);

    var xy = document.createElement('input');
    xy.setAttribute("type", "button");
    xy.setAttribute("value", "XY");
    xy.style.marginLeft = '1em';
    xy.onclick =  WA.XYView.bind(WA);
    buttons.appendChild(xy);

    var xz = document.createElement('input');
    xz.setAttribute("type", "button");
    xz.setAttribute("value", "XZ");
    xz.onclick = WA.XZView.bind(WA);
    buttons.appendChild(xz);

    var zy = document.createElement('input');
    zy.setAttribute("type", "button");
    zy.setAttribute("value", "ZY");
    zy.onclick = WA.ZYView.bind(WA);
    buttons.appendChild(zy);

    var zx = document.createElement('input');
    zx.setAttribute("type", "button");
    zx.setAttribute("value", "ZX");
    zx.onclick = WA.ZXView.bind(WA);
    buttons.appendChild(zx);

    // Restrict display to shared connectors between visible skeletons
    var connectors = document.createElement('input');
    connectors.setAttribute("type", "button");
    connectors.setAttribute("value", "Restrict connectors");
    connectors.style.marginLeft = '1em';
    connectors.onclick = WA.toggleConnectors.bind(WA);
    buttons.appendChild(connectors);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("value", "Options");
    options.style.marginLeft = '1em';
    options.onclick = WA.configureParameters.bind(WA);
    buttons.appendChild(options);
    
    var shadingLabel = document.createElement('div');
    shadingLabel.innerHTML = 'Shading:';
    shadingLabel.style.display = 'inline';
    shadingLabel.style.marginLeft = '1em';
    buttons.appendChild(shadingLabel);
    var shadingMenu = document.createElement('select');
    shadingMenu.setAttribute("id", "skeletons_shading" + WA.widgetID);
    $('<option/>', {value : 'none', text: 'None', selected: true}).appendTo(shadingMenu);
    $('<option/>', {value : 'active_node_split', text: 'Active node split'}).appendTo(shadingMenu);
    $('<option/>', {value : 'betweenness_centrality', text: 'Betweenness centrality'}).appendTo(shadingMenu);
    $('<option/>', {value : 'slab_centrality', text: 'Slab centrality'}).appendTo(shadingMenu);
    $('<option/>', {value : 'distance_to_root', text: 'Distance to root'}).appendTo(shadingMenu);
    $('<option/>', {value : 'partitions', text: 'Principal branch length'}).appendTo(shadingMenu);
    shadingMenu.onchange = WA.set_shading_method.bind(WA);
    buttons.appendChild(shadingMenu);

    buttons.appendChild(document.createTextNode(" Color:"));
    var colorMenu = document.createElement('select');
    $('<option/>', {value : 'none', text: 'Source', selected: true}).appendTo(colorMenu);
    $('<option/>', {value : 'creator', text: 'By Creator'}).appendTo(colorMenu);
    $('<option/>', {value : 'reviewer', text: 'By Reviewer'}).appendTo(colorMenu);
    colorMenu.onchange = WA.updateSkeletonColors.bind(WA, colorMenu);
    buttons.appendChild(colorMenu);

    buttons.appendChild(document.createTextNode(" Synapse color:"));
    var synColors = document.createElement('select');
    synColors.options.add(new Option('Type: pre/red, post/cyan', 'cyan-red'));
    synColors.options.add(new Option('N with partner: pre[red > blue], post[yellow > cyan]', 'by-amount'));
    synColors.onchange = WA.updateConnectorColors.bind(WA, synColors);
    buttons.appendChild(synColors);

    var map = document.createElement('input');
    map.setAttribute("type", "button");
    map.setAttribute("value", "User colormap");
    map.style.marginLeft = '1em';
    map.onclick = WA.usercolormap_dialog.bind(WA);
    buttons.appendChild(map);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas" + WA.widgetID);
    // canvas.style.width = "800px";
    // canvas.style.height = "600px";
    canvas.style.backgroundColor = "#000000";
    container.appendChild(canvas);


    // addListener(win, container);

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
                    // console.log("deleted " + name);
                    break;
                  }
                }
              }
              WA.destroy();
              // win.close(); // it is done anyway
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


    addLogic(win);

    // Create a Selection Table, preset as the sync target
    createStagingListWindow( win, WA.getName() );

    WA.init( 800, 600, canvas.getAttribute("id") );
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

  var createCytoscapeGraphWindow = function()
  {
    var win = new CMWWindow("Cytoscape Graph Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("cytoscape_graph_widget");
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cyto");
    graph.style.height = "100%";
    graph.style.width = "100%";
    container.appendChild(graph);

    addListener(win, container);

    addLogic(win);

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

  var createCompartmentGraphWindow = function()
  {
    var CGW = new CompartmentGraphWidget();

    var win = new CMWWindow(CGW.getName());
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'compartment_graph_window_buttons' + CGW.widgetID);

    contentbutton.appendChild(document.createTextNode('From'));
    contentbutton.appendChild(SkeletonListSources.createSelect(CGW));

    var show = document.createElement('input');
    show.setAttribute("type", "button");
    show.setAttribute("value", "Append");
    show.onclick = CGW.loadSource.bind(CGW);
    contentbutton.appendChild(show);

    var show = document.createElement('input');
    show.setAttribute("type", "button");
    show.setAttribute("value", "Clear");
    show.onclick = CGW.clear.bind(CGW);
    contentbutton.appendChild(show);

    var show = document.createElement('input');
    show.setAttribute("type", "button");
    show.setAttribute("value", "Refresh");
    show.onclick = CGW.update.bind(CGW);
    contentbutton.appendChild(show);

    var annotate = document.createElement('input');
    annotate.setAttribute("type", "button");
    annotate.setAttribute("value", "Annotate");
    annotate.onclick = CGW.annotate_skeleton_list.bind(CGW);
    contentbutton.appendChild(annotate);

    var props = document.createElement('input');
    props.setAttribute("type", "button");
    props.setAttribute("value", "Properties");
    props.onclick = CGW.graph_properties.bind(CGW);
    contentbutton.appendChild(props);

    contentbutton.appendChild(document.createTextNode(' - '));

    var layout = appendSelect(contentbutton, "compartment_layout", ["Force-directed", "Hierarchical", "Grid", "Circle", "Random", "Compound Spring Embedder" ]);

    var trigger = document.createElement('input');
    trigger.setAttribute('type', 'button');
    trigger.setAttribute('value', 'Re-layout');
    trigger.onclick = CGW.updateLayout.bind(CGW, layout);
    contentbutton.appendChild(trigger);

    contentbutton.appendChild(document.createElement('br'));

    contentbutton.appendChild(document.createTextNode('Grow '));

    var circles = document.createElement('input');
    circles.setAttribute("type", "button");
    circles.setAttribute("value", "Circles");
    circles.onclick = CGW.growGraph.bind(CGW);
    contentbutton.appendChild(circles);

    contentbutton.appendChild(document.createTextNode(" or "));

    var paths = document.createElement('input');
    paths.setAttribute("type", "button");
    paths.setAttribute("value", "Paths");
    paths.onclick = CGW.growPaths.bind(CGW);
    contentbutton.appendChild(paths);

    contentbutton.appendChild(document.createTextNode(" by "));

    var n_circles = document.createElement('select');
    n_circles.setAttribute("id", "n_circles_of_hell" + CGW.widgetID);
    [1, 2, 3, 4, 5].forEach(function(title, i) {
      var option = document.createElement("option");
      option.text = title;
      option.value = title;
      n_circles.appendChild(option);
    });
    contentbutton.appendChild(n_circles);


    contentbutton.appendChild(document.createTextNode("hops, limit:"));

    var f = function(name) {
      var e = document.createElement('select');
      e.setAttribute("id", "n_circles_min_" + name + CGW.widgetID);
      var option = document.createElement("option");
      option.text = "All " + name;
      option.value = 0;
      e.appendChild(option);
      option = document.createElement("option");
      option.text = "No " + name;
      option.value = -1;
      e.appendChild(option)
      for (var i=1; i<51; ++i) {
        option = document.createElement("option");
        option.text = i;
        option.value = i;
        e.appendChild(option);
      }
      e.selectedIndex = 3; // value of 2 pre or post min
      return e;
    };

    contentbutton.appendChild(f("pre"));
    contentbutton.appendChild(f("post"));

    contentbutton.appendChild(document.createTextNode(' - '));

    var hide = document.createElement('input');
    hide.setAttribute('type', 'button');
    hide.setAttribute('value', 'Hide selected');
    hide.onclick = CGW.hideSelected.bind(CGW);
    contentbutton.appendChild(hide);

    var show = document.createElement('input');
    show.setAttribute('type', 'button');
    show.setAttribute('id', 'graph_show_hidden' + CGW.widgetID);
    show.setAttribute('value', 'Show hidden');
    show.setAttribute('disabled', true);
    show.onclick = CGW.showHidden.bind(CGW);
    contentbutton.appendChild(show);

    contentbutton.appendChild(document.createElement('br'));

    contentbutton.appendChild(document.createTextNode('Color:'));
    var color = document.createElement('select');
    color.setAttribute('id', 'graph_color_choice' + CGW.widgetID);
    color.options.add(new Option('source', 'source'));
    color.options.add(new Option('review status', 'review'));
    color.options.add(new Option('input/output', 'I/O'));
    color.options.add(new Option('betweenness centrality', 'betweenness_centrality'));
    color.options.add(new Option('circles of hell', 'circles_of_hell')); // inspired by Tom Jessell's comment
    color.onchange = CGW._colorize.bind(CGW, color);
    contentbutton.appendChild(color);

    contentbutton.appendChild(document.createTextNode(' - '));

    var gml = document.createElement('input');
    gml.setAttribute("type", "button");
    gml.setAttribute("value", "Export GML");
    gml.onclick = CGW.exportGML.bind(CGW);
    contentbutton.appendChild(gml);

    var adj = document.createElement('input');
    adj.setAttribute("type", "button");
    adj.setAttribute("value", "Export Adjacency Matrix");
    adj.onclick = CGW.exportAdjacencyMatrix.bind(CGW);
    contentbutton.appendChild(adj);

    var plot = document.createElement('input');
    plot.setAttribute("type", "button");
    plot.setAttribute("value", "Open plot");
    plot.onclick = CGW.openPlot.bind(CGW);
    contentbutton.appendChild(plot);

    content.appendChild( contentbutton );

    var container = createContainer("compartment_graph_widget" + CGW.widgetID);
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cyelement" + CGW.widgetID);
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#FFFFF0";
    container.appendChild(graph);

    addListener(win, container, 'compartment_graph_window_buttons' + CGW.widgetID, CGW.destroy.bind(CGW));

    addLogic(win);

    CGW.init();

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
    // add.onclick = CompartmentGraphWidget.updateConfidenceGraphFrom3DViewer;
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

  var createGraphWindow = function()
  {
    var win = new CMWWindow("Graph Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'graph_window_buttons');

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "show_neurons_from_3d_view");
    add.setAttribute("value", "Show graph of selected 3D viewer neuron(s)");
    add.onclick = GraphWidget.updateGraphFrom3DViewer;
    contentbutton.appendChild(add);

    var exp = document.createElement('input');
    exp.setAttribute("type", "button");
    exp.setAttribute("id", "export_graphml");
    exp.setAttribute("value", "Export GraphML");
    exp.onclick = GraphWidget.exportGraphML;
    contentbutton.appendChild(exp);

    content.appendChild( contentbutton );

    var container = createContainer("graph_widget");
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.innerHTML = '<div id="cytoscapeweb"></div>';
    container.appendChild(graph);

    addListener(win, container, 'graph_window_buttons');

    addLogic(win);

    GraphWidget.init();

    return win;
  };

  var createNodeTableWindow = function()
  {
    var win = new CMWWindow("Table of Skeleton Nodes");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'table_of_skeleton_buttons');

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "update_treenodetable_current_skeleton");
    add.setAttribute("value", "List active skeleton");
    add.onclick = TreenodeTable.update; // function declared in table_treenode.js
    contentbutton.appendChild(add);

    var refresh = document.createElement('input');
    refresh.setAttribute("type", "button");
    refresh.setAttribute("id", "refresh_treenodetable");
    refresh.setAttribute("value", "Refresh");
    refresh.onclick = TreenodeTable.refresh; // function declared in table_treenode.js
    contentbutton.appendChild(refresh);

    var last = document.createElement('select');
    last.setAttribute("id", "treenodetable_lastskeletons");
    var option = document.createElement("option");
    option.text = "None";
    option.value = -1;
    last.appendChild(option);
    contentbutton.appendChild(last);

    content.appendChild( contentbutton );

    var container = createContainer("treenode_table_widget");
    content.appendChild( container );

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="treenodetable">' +
        '<thead>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type' +
        '' +
        '<select name="search_type" id="search_type" class="search_init">' +
        '<option value="">Any</option><option value="R">Root</option><option value="LR" selected="selected">Leaf</option>' +
        '<option value="B">Branch</option><option value="S">Slab</option></select>' +
        '</th>' +
        // <input type="text" name="search_type" value="Search" class="search_init" />
            '<th>tags<input type="text" name="search_labels" id="search_labels" value="Search" class="search_init" /></th>' +
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

    addListener(win, container, 'table_of_skeleton_buttons');

    addLogic(win);

    TreenodeTable.init( project.getId() );

    return win;
  };

  var createConnectorTableWindow = function()
  {
    var win = new CMWWindow("Table of Connectors");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'table_of_connector_buttons');

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "update_connectortable_current_skeleton");
    add.setAttribute("value", "List current skeleton");
    add.onclick = ConnectorTable.updateConnectorTable;
    contentbutton.appendChild(add);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "refresh_connectortable_current_skeleton");
    add.setAttribute("value", "Refresh");
    add.onclick = ConnectorTable.refreshConnectorTable;
    contentbutton.appendChild(add);

    var direction = document.createElement('select');
    direction.setAttribute("id", "connector_relation_type");
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

    var last = document.createElement('select');
    last.setAttribute("id", "connectortable_lastskeletons");
    var option = document.createElement("option");
    option.text = "None";
    option.value = -1;
    last.appendChild(option);
    contentbutton.appendChild(last);

    content.appendChild( contentbutton );

    var container = createContainer("connectortable_widget");
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectortable">' +
        '<thead>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_top">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</ht>' +
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_top"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_top">target treenode ID</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_bottom">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>s</ht>' +
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_bottom"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_bottom">target treenode ID</th>' +
          '</tr>' +
        '</tfoot>' +
      '</table>';


    addListener(win, container, 'table_of_connector_buttons');

    addLogic(win);

    ConnectorTable.init( project.getId() );

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
        start.setAttribute("id", "start_review_skeleton");
        start.setAttribute("value", "Start to review skeleton");
        start.onclick = function(ev) { ReviewSystem.startSkeletonToReview(); };
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

        var reset = document.createElement('input');
        reset.setAttribute("type", "button");
        reset.setAttribute("id", "reset_skeleton_review");
        reset.setAttribute("value", "Reset revisions");
        reset.onclick = ReviewSystem.resetAllRevisions;
        contentbutton.appendChild(reset);

        var resetOwns = document.createElement('input');
        resetOwns.setAttribute("type", "button");
        resetOwns.setAttribute("id", "reset_skeleton_review_owns");
        resetOwns.setAttribute("value", "Reset own revisions");
        resetOwns.onclick = ReviewSystem.resetOwnRevisions;
        contentbutton.appendChild(resetOwns);

        var resetOthers = document.createElement('input');
        resetOthers.setAttribute("type", "button");
        resetOthers.setAttribute("id", "reset_skeleton_review_owns");
        resetOthers.setAttribute("value", "Reset revisions by others");
        resetOthers.onclick = ReviewSystem.resetRevisionsByOthers;
        contentbutton.appendChild(resetOthers);

        var cacheImages = document.createElement('input');
        cacheImages.setAttribute("type", "button");
        cacheImages.setAttribute("id", "cache_images_of_skeleton");
        cacheImages.setAttribute("value", "Cache tiles");
        cacheImages.onclick = ReviewSystem.cacheImages;
        contentbutton.appendChild(cacheImages);

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

        var threshold_label = document.createTextNode(' Synapse threshold: ');
        contentbutton.appendChild(threshold_label);

        var threshold = document.createElement('select');
        threshold.setAttribute("id", "connectivity_count_threshold" + widgetID);
        for (var i = 0; i < 21; i++) {
          var option = document.createElement("option");
          option.text = i.toString();
          option.value = i;
          threshold.appendChild(option);
        }
        contentbutton.appendChild(threshold);

        contentbutton.appendChild(document.createTextNode(' Sync to:'));
        var link = SkeletonListSources.createPushSelect(SC, 'link');
        link.onchange = SC.syncLink.bind(SC, link);
        contentbutton.appendChild(link);

        content.appendChild( contentbutton );

        var container = createContainer( "connectivity_widget" + widgetID );
        content.appendChild( container );

        addListener(win, container, 'skeleton_connectivity_buttons' + widgetID, SC.destroy.bind(SC));

        addLogic(win);
        SkeletonListSources.updateGUI();

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

    keysHTML = '<p id="keyShortcutsText">';
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

    keysHTML = '<form onsubmit="TracingTool.search(); return false">';
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


  var createObjectTreeWindow = function()
  {
    var win = new CMWWindow( "Object Tree" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "object_tree_widget" );
    content.appendChild( container );

    var refresh = document.createElement('input');
    refresh.setAttribute('type', 'button');
    refresh.setAttribute('value', 'Refresh');
    refresh.onclick = ObjectTree.refresh.bind(ObjectTree);
    container.appendChild(refresh);

    container.appendChild(document.createTextNode(' Synchronize '));

    var sync = document.createElement('input');
    sync.setAttribute('type', 'checkbox');
    sync.setAttribute('id', 'synchronize_object_tree');
    sync.checked = true;
    container.appendChild(sync);

    container.appendChild(document.createTextNode(' - Push to:'));
    container.appendChild(SkeletonListSources.createPushSelect(ObjectTree, 'link'));

    var div = document.createElement('div');
    div.setAttribute('id', 'tree_object');
    container.appendChild(div);

    addListener(win, container, undefined, ObjectTree.destroy.bind(ObjectTree));

    addLogic(win);

    ObjectTree.init( project.getId() );

    return win;
  };

  var createDisclaimerWindow = function()
  {
    var win = new CMWWindow( "Disclaimer" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "disclaimer_widget" );
    content.appendChild( container );

    container.innerHTML =
      '<p>CATMAID v0.24, &copy;&nbsp;2007&ndash;2012 <a href="http://fly.mpi-cbg.de/~saalfeld/">Stephan Saalfeld</a>,' +
      '<a href="http://www.unidesign.ch/">Stephan Gerhard</a> and <a href="http://longair.net/mark/">Mark Longair</a><br />' +
      'Funded by <a href="http://www.mpi-cbg.de/research/research-groups/pavel-tomancak.html">Pavel Toman&#x010d;&aacute;k</a>, MPI-CBG, Dresden, Germany and' +
      ' <a href="http://albert.rierol.net/">Albert Cardona</a>, Uni/ETH, Z&uuml;rich, Switzerland.<br />' +
      '<br />' +
      'Visit the <a href="http://www.catmaid.org/" target="_blank">CATMAID homepage</a> for further information.</p>';

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
    queryFields_html =
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
                'id="neuron_query_by_annotation_name{{NA-ID}}" value="" class=""/>' +
            '<input type="checkbox" name="neuron_query_include_subannotation" ' +
                'id="neuron_query_include_subannotation{{NA-ID}}" value="" class=""/>' +
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
    container_html =
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

    // Add autocompletion to the first name input field
    NA.add_autocomplete_to_input($('#neuron_query_by_annotation_name' +
        NA.widgetID));

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
        });;
        this.annotate_entities(selected_entity_ids);
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
          var opts = {value: user.id, text: user.fullName}
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

    return win
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
    "graph-widget": createGraphWindow,
    "neuron-staging-area": createStagingListWindow,
    "create-connector-selection": createConnectorSelectionWindow,
    "skeleton-measurements-table": createSkeletonMeasurementsTable,
    "compartment-graph-widget": createCompartmentGraphWindow,
    "assemblygraph-widget": createAssemblyGraphWindow,
    "sliceinfo-widget": createSliceInfoWindow,
    "object-tree": createObjectTreeWindow,
    "statistics": createStatisticsWindow,
    "disclaimer": createDisclaimerWindow,
    "review-system": createReviewWindow,
    "connectivity-widget": createConnectivityWindow,
    "adjacencymatrix-widget": createAdjacencyMatrixWindow,
    "skeleton-analytics-widget": createSkeletonAnalyticsWindow,
    "ontology-editor": createOntologyWidget,
    "classification-editor": createClassificationWidget,
    "notifications": createNotificationsWindow,
    "clustering-widget": createClusteringWidget,
    "circuit-graph-plot": createCircuitGraphPlot,
    "neuron-annotations": createNeuronAnnotationsWindow,
    "neuron-navigator": createNeuronNavigatorWindow,
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
