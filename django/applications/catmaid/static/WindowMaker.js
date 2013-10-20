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

  var addListener = function(win, container, button_bar, destroy) {
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


  var createStagingListWindow = function( webglwin ) {

    var win = new CMWWindow("Selection Table");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("neuron_staging_table");
    
    var buttons = document.createElement("div");
    buttons.id = "view-3d-webgl-skeleton-buttons-div";

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "add_current_active_object_to_staging");
    add.setAttribute("value", "Add active object");
    add.onclick = NeuronStagingArea.fn("addActive");
    buttons.appendChild(add);

    var prev = document.createElement('input');
    prev.setAttribute("type", "button");
    prev.setAttribute("id", "selection_table_prev");
    prev.setAttribute("value", "<");
    prev.onclick = NeuronStagingArea.fn("showPrevious");
    buttons.appendChild(prev);

    var range = document.createElement('span');
    range.innerHTML = "[<span id='selection_table_first'>0</span>, <span id='selection_table_last'>0</span>] of <span id='selection_table_length'>0</span>";
    buttons.appendChild(range);

    var next = document.createElement('input');
    next.setAttribute("type", "button");
    next.setAttribute("id", "selection_table_next");
    next.setAttribute("value", ">");
    next.onclick = NeuronStagingArea.fn("showNext");
    buttons.appendChild(next);

    var save = document.createElement('input');
    save.setAttribute("type", "button");
    save.setAttribute("id", "save_skeleton_list");
    save.setAttribute("value", "Save list");
    save.style.marginLeft = '1em';
    save.onclick = NeuronStagingArea.fn("save_skeleton_list");
    buttons.appendChild(save);

    var load = document.createElement('input');
    load.setAttribute("type", "button");
    load.setAttribute("id", "load_skeleton_list");
    load.setAttribute("value", "Load list");
    load.onclick = NeuronStagingArea.fn("load_skeleton_list");
    buttons.appendChild(load);
    
    var colorLabel = document.createElement('div');
    colorLabel.innerHTML = 'Color:';
    colorLabel.style.display = 'inline';
    colorLabel.style.marginLeft = '1em';
    buttons.appendChild(colorLabel);
    var colorMenu = document.createElement('select');
    colorMenu.setAttribute("id", "skeletons_base_color");
    $('<option/>', {value : 'random', text: 'Random', selected: true}).appendTo(colorMenu);
    $('<option/>', {value : 'creator', text: 'By Creator'}).appendTo(colorMenu);
    $('<option/>', {value : 'reviewer', text: 'By Reviewer'}).appendTo(colorMenu);
    $('<option/>', {value : 'manual', text: 'Manual'}).appendTo(colorMenu);
    colorMenu.onchange = NeuronStagingArea.fn("set_skeletons_base_color");
    buttons.appendChild(colorMenu);
    
    var map = document.createElement('input');
    map.setAttribute("type", "button");
    map.setAttribute("id", "user_colormap_dialog");
    map.setAttribute("value", "User colormap");
    map.style.marginLeft = '1em';
    map.onclick = NeuronStagingArea.fn("usercolormap_dialog");
    buttons.appendChild(map);

    var measure = document.createElement('input');
    measure.setAttribute('type', 'button');
    measure.setAttribute('id', 'selection_table_measure');
    measure.setAttribute('value', 'Measure');
    measure.onclick = NeuronStagingArea.fn("measure");
    buttons.appendChild(measure);
    
    win.getFrame().appendChild(buttons);
    content.appendChild(container);
    
    var tab = document.createElement('table');
    tab.setAttribute("id", "webgl-skeleton-table");
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
            '<td><img src="' + STATIC_URL_JS + 'widgets/themes/kde/delete.png" id="webgl-rmall" title="Remove all"></td>' +
            '<td></td>' +
            '<td><input type="checkbox" id="webgl-show" checked /></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
          '</tr>' +
        '</tbody>';
    container.appendChild(tab);

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
              NeuronStagingArea.clear();
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
        }            
    }

    NeuronStagingArea.reinit_list_with_existing_skeleton();

    return win;
  }

  /** Creates and returns a new 3d webgl window */
  var create3dWebGLWindow = function()
  {

    if ( !Detector.webgl ) {
      alert('Your browser does not seem to support WebGL.');
      return;
    }

    var win = new CMWWindow("3D WebGL View");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var buttons = document.createElement( "div" );
    buttons.id = "buttons_in_3d_webgl_widget";
    content.appendChild(buttons);
    
    var container = createContainer("view_in_3d_webgl_widget");
    content.appendChild(container);

    var reload = document.createElement('input');
    reload.setAttribute("type", "button");
    reload.setAttribute("id", "refresh_skeletons");
    reload.setAttribute("value", "Reload skeletons");
    reload.onclick = WebGLApp.fn('refresh_skeletons');
    buttons.appendChild(reload);
    
    var center = document.createElement('input');
    center.setAttribute("type", "button");
    center.setAttribute("id", "center_active_node");
    center.setAttribute("value", "Center active");
    center.style.marginLeft = '1em';
    center.onclick = WebGLApp.fn('look_at_active_node');
    buttons.appendChild(center);

    var fulls = document.createElement('input');
    fulls.setAttribute("type", "button");
    fulls.setAttribute("id", "fullscreen_webgl_view");
    fulls.setAttribute("value", "Fullscreen");
    fulls.style.marginLeft = '1em';
    fulls.onclick = WebGLApp.fn('fullscreenWebGL');
    buttons.appendChild(fulls);

    var xy = document.createElement('input');
    xy.setAttribute("type", "button");
    xy.setAttribute("id", "xy_plane");
    xy.setAttribute("value", "XY");
    xy.style.marginLeft = '1em';
    xy.onclick =  WebGLApp.fn('XYView');
    buttons.appendChild(xy);

    var xz = document.createElement('input');
    xz.setAttribute("type", "button");
    xz.setAttribute("id", "xz_plane");
    xz.setAttribute("value", "XZ");
    xz.onclick = WebGLApp.fn('XZView');
    buttons.appendChild(xz);

    var zy = document.createElement('input');
    zy.setAttribute("type", "button");
    zy.setAttribute("id", "zy_plane");
    zy.setAttribute("value", "ZY");
    zy.onclick = WebGLApp.fn('ZYView');
    buttons.appendChild(zy);

    var zx = document.createElement('input');
    zx.setAttribute("type", "button");
    zx.setAttribute("id", "zx_plane");
    zx.setAttribute("value", "ZX");
    zx.onclick = WebGLApp.fn('ZXView');
    buttons.appendChild(zx);

    // Restrict display to shared connectors between visible skeletons
    var connectors = document.createElement('input');
    connectors.setAttribute("type", "button");
    connectors.setAttribute("id", "toggle_connector");
    connectors.setAttribute("value", "Restrict connectors");
    connectors.style.marginLeft = '1em';
    connectors.onclick = WebGLApp.fn('toggleConnectors');
    buttons.appendChild(connectors);

    var options = document.createElement('input');
    options.setAttribute("type", "button");
    options.setAttribute("id", "configure_parameters");
    options.setAttribute("value", "Options");
    options.style.marginLeft = '1em';
    options.onclick = WebGLApp.fn('configureParameters');
    buttons.appendChild(options);
    
    var shadingLabel = document.createElement('div');
    shadingLabel.innerHTML = 'Shading:';
    shadingLabel.style.display = 'inline';
    shadingLabel.style.marginLeft = '1em';
    buttons.appendChild(shadingLabel);
    var shadingMenu = document.createElement('select');
    shadingMenu.setAttribute("id", "skeletons_shading");
    $('<option/>', {value : 'none', text: 'None', selected: true}).appendTo(shadingMenu);
    $('<option/>', {value : 'betweenness_centrality', text: 'Betweenness centrality'}).appendTo(shadingMenu);
    $('<option/>', {value : 'branch_centrality', text: 'Branch centrality'}).appendTo(shadingMenu);
    shadingMenu.onchange = WebGLApp.fn('set_shading_method');
    buttons.appendChild(shadingMenu);
    
    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas");
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
              WebGLApp.destroy();
              // win.close(); // it is done anyway
            }
            break;
          case CMWWindow.RESIZE:
            var frame = win.getFrame();
            var w = win.getAvailableWidth();
            var h = win.getContentHeight() - buttons.offsetHeight;
            container.style.width = w + "px";
            container.style.height = h + "px";
            WebGLApp.resizeView( w, h );
            // Update the container height to account for the table-div having been resized
            // TODO
            break;
        }
        return true;
      });


    addLogic(win);

    var stagewin = null;
    if( !NeuronStagingArea.is_widget_open() ) {
        createStagingListWindow( win );
    }

    // Fill in with a Raphael canvas, now that the window exists in the DOM:
    // createWebGLViewerFromCATMAID(canvas.getAttribute("id"));

    WebGLApp.init( 800, 600, canvas.getAttribute("id") );
    WebGLApp.refresh_skeletons();
    win.callListeners( CMWWindow.RESIZE );

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
    var win = new CMWWindow("Compartment Graph Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'compartment_graph_window_buttons');

    var show = document.createElement('input');
    show.setAttribute("type", "button");
    show.setAttribute("id", "confidence_compartment_show_neurons_from_3d_view");
    show.setAttribute("value", "Generate graph");
    show.onclick = CompartmentGraphWidget.updateFromSelectionTable.bind(CompartmentGraphWidget);
    contentbutton.appendChild(show);

    var layout = appendSelect(contentbutton, "compartment_layout", ["Force-directed", "Grid"]);
    layout.onchange = function() {
      CompartmentGraphWidget.updateLayout(layout.selectedIndex);
    };

    var props = document.createElement('input');
    props.setAttribute("type", "button");
    props.setAttribute("id", "graph_properties");
    props.setAttribute("value", "Properties");
    props.onclick = CompartmentGraphWidget.graph_properties;
    contentbutton.appendChild(props);

    var gml = document.createElement('input');
    gml.setAttribute("type", "button");
    gml.setAttribute("value", "Export GML");
    gml.onclick = CompartmentGraphWidget.exportGML;
    contentbutton.appendChild(gml);

    contentbutton.appendChild(document.createElement('br'));

    contentbutton.appendChild(document.createTextNode('Grow '));

    var circles = document.createElement('input');
    circles.setAttribute("type", "button");
    circles.setAttribute("id", "graph_circles");
    circles.setAttribute("value", "Circles");
    circles.onclick = CompartmentGraphWidget.growGraph.bind(CompartmentGraphWidget);
    contentbutton.appendChild(circles);

    contentbutton.appendChild(document.createTextNode(" or "));

    var paths = document.createElement('input');
    paths.setAttribute("type", "button");
    paths.setAttribute("id", "graph_paths");
    paths.setAttribute("value", "Paths");
    paths.onclick = CompartmentGraphWidget.growPaths.bind(CompartmentGraphWidget);
    contentbutton.appendChild(paths);

    contentbutton.appendChild(document.createTextNode(" by "));

    var n_circles = document.createElement('select');
    n_circles.setAttribute("id", "n_circles_of_hell");
    [1, 2, 3, 4, 5].forEach(function(title, i) {
      var option = document.createElement("option");
      option.text = title;
      option.value = title;
      n_circles.appendChild(option);
    });
    contentbutton.appendChild(n_circles);


    contentbutton.appendChild(document.createTextNode(" limit:"));

    var f = function(name) {
      var e = document.createElement('select');
      e.setAttribute("id", "n_circles_min_" + name);
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

    content.appendChild( contentbutton );

    var container = createContainer("compartment_graph_widget");
    content.appendChild(container);

    var graph = document.createElement('div');
    graph.setAttribute("id", "cyelement");
    graph.style.width = "100%";
    graph.style.height = "100%";
    graph.style.backgroundColor = "#FFFFF0";
    container.appendChild(graph);

    addListener(win, container, 'compartment_graph_window_buttons');

    addLogic(win);

    CompartmentGraphWidget.init();

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

    var sync = document.createElement('input');
    sync.setAttribute("type", "checkbox");
    sync.setAttribute("id", "synchronize_treenodetable");
    sync.setAttribute("label", "Synchronize");
    contentbutton.appendChild(sync);

    var label = document.createTextNode('Synchronize');
    contentbutton.appendChild(label);

    var sync = document.createElement('select');
    sync.setAttribute("id", "treenodetable_lastskeletons");
    var option = document.createElement("option");
    option.text = "None";
    option.value = -1;
    sync.appendChild(option);
    contentbutton.appendChild(sync);

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

    var sync = document.createElement('select');
    sync.setAttribute("id", "connector_relation_type");
    var objOption = document.createElement("option");
    objOption.innerHTML = "Incoming connectors";
    objOption.value = "0";
    sync.appendChild(objOption);
    var objOption2 = document.createElement("option");
    objOption2.innerHTML = "Outgoing connectors";
    objOption2.value = "1";
    objOption2.selected = "selected";
    sync.appendChild(objOption2);
    contentbutton.appendChild(sync);

    var rand = document.createTextNode('Synchronize');
    contentbutton.appendChild(rand);
    var sync = document.createElement('input');
    sync.setAttribute("type", "checkbox");
    sync.setAttribute("id", "synchronize_connectortable");
    sync.setAttribute("label", "Synchronize");
    contentbutton.appendChild(sync);

    var sync = document.createElement('select');
    sync.setAttribute("id", "connectortable_lastskeletons");
    var option = document.createElement("option");
    option.text = "None";
    option.value = -1;
    sync.appendChild(option);
    contentbutton.appendChild(sync);

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
    var win = new CMWWindow("Skeleton Analytics");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var div = document.createElement('div');
    div.setAttribute('id', 'skeleton_analytics');
    content.appendChild(div);

    appendSelect(div, "source", ["Active skeleton", "Selected skeletons"]);
    appendSelect(div, "extra", ["No others", "Downstream skeletons", "Upstream skeletons", "Both upstream and downstream"]);
    var adjacents = [];
    for (var i=0; i<20; ++i) adjacents.push(i);
    appendSelect(div, "adjacents", adjacents);

    var update = document.createElement('input');
    update.setAttribute('type', 'button');
    update.setAttribute('id', 'update_skeleton_analytics_table');
    update.setAttribute('value', 'Update');
    update.onclick = SkeletonAnalytics.update;
    div.appendChild(update);

    var container = createContainer('skeleton_analytics_widget');
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeletonanalyticstable">' +
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

    addListener(win, container, 'skeleton_analytics');
    addLogic(win);
    SkeletonAnalytics.init();

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

        addListener(win, container, 'review_window_buttons');

        addLogic(win);

        ReviewSystem.init();

        return win;
    };

    var createConnectivityWindow = function()
    {
        var SC = new SkeletonConnectivity();
        var widgetid = SC.widgetid;

        var win = new CMWWindow("Skeleton Connectivity " + widgetid);
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'skeleton_connectivity_buttons' + widgetid);

        var source = document.createElement('select');
        source.setAttribute('id', 'connectivity_source' + widgetid);
        ['Active neuron', 'Selected neurons'].forEach(function(text, i) {
          var option = document.createElement('option');
          option.text = text;
          option.value = text;
          source.appendChild(option);
        });
        contentbutton.appendChild(source);

        var op = document.createElement('select');
        op.setAttribute('id', 'connectivity_operation' + widgetid);
        var option = document.createElement('option');
        option.text = 'AND';
        option.value = 'logic-AND'; // added prefix, otherwise gets sent as nonsense
        op.appendChild(option);
        var option = document.createElement('option');
        option.text = 'OR';
        option.value = 'logic-OR';
        op.appendChild(option);
        contentbutton.appendChild(op);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "retrieve_connectivity" + widgetid);
        add.setAttribute("value", "Get connectivity");
        add.onclick = SC.fetchConnectivityForSkeleton.bind(SC);
        contentbutton.appendChild(add);

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("id", "refresh_connectivity" + widgetid);
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = SC.refresh.bind(SC);
        contentbutton.appendChild(refresh);

        var threshold_label = document.createTextNode(' Synapse threshold: ');
        contentbutton.appendChild(threshold_label);

        var threshold = document.createElement('select');
        threshold.setAttribute("id", "connectivity_count_threshold" + widgetid);

        for (var i = 0; i < 21; i++) {
          var option = document.createElement("option");
          option.text = i.toString();
          option.value = i;
          threshold.appendChild(option);
        }

        contentbutton.appendChild(threshold);

        content.appendChild( contentbutton );

        var container = createContainer( "connectivity_widget" + widgetid );
        content.appendChild( container );

        addListener(win, container, 'skeleton_connectivity_buttons' + widgetid, SC.destroy.bind(SC));

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

      $('#project_export_widget').load( django_url + project.id + '/exportwidget' )

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

    keysHTML = '<h4>Search</h4>';
    keysHTML += '<form onsubmit="TracingTool.search(); return false">';
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

    container.innerHTML =
      '<input type="button" id="refresh_object_tree" value="refresh" style="display:block; float:left;" />' +
      '&nbsp; Synchronize <input type="checkbox" id="synchronize_object_tree" checked="yes" />' +
      '<br clear="all" />' +
      '<div id="tree_object"></div>';

    addListener(win, container);

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

  /** Always create a new instance of the widget. */
  this.create = function(name) {
    if (creators.hasOwnProperty(name)) {
      windows[name] = creators[name]();
    } else {
      alert("No known window with name " + name);
    }
  };

}();
