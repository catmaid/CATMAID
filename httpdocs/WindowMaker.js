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

  var addListener = function(win, container, button_bar) {
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
              // win.close();
            }
            break;
          case CMWWindow.RESIZE:
            if( button_bar !== undefined ) {
                container.style.height = ( win.getContentHeight() - $('#' + 'table_of_connector_buttons').height() ) + "px";
            } else {
                container.style.height = ( win.getContentHeight() ) + "px";
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


  var createStagingListWindow = function() {
    var win = new CMWWindow("Neuron Staging Table");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("neuron_staging_table");
    content.appendChild(container);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "add_current_to_3d_webgl_view");
    add.setAttribute("value", "Add active skeleton");
    add.onclick = WebGLApp.addActiveSkeletonToView;
    container.appendChild(add);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "store_skeleton_list");
    rand.setAttribute("value", "Store list");
    rand.onclick = WebGLApp.storeSkeletonList;
    container.appendChild(rand);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "load_skeleton_list");
    rand.setAttribute("value", "Load list");
    rand.onclick = WebGLApp.loadSkeletonList;
    container.appendChild(rand);

    var tabdiv = document.createElement('div');
    tabdiv.setAttribute("id", "view-3d-webgl-skeleton-table-div");
    tabdiv.style.height = "150px";
    tabdiv.style.overflow = "auto";
    container.appendChild(tabdiv);

    var tab = document.createElement('table');
    tab.setAttribute("id", "webgl-skeleton-table");
    tab.innerHTML =
        '<thead>' +
          '<tr>' +
            '<th width="100px">action</th>' +
            '<th>name</th>' +
            '<th>show</th>' +
            '<th>pre</th>' +
            '<th>post</th>' +
            '<th>text</th>' +
            '<th>property</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          '<tr>' +
            '<td><button type="button" id="webgl-rmall">remove all</button></td>' +
            '<td></td>' +
            '<td><button type="button" id="webgl-show">hide</button></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
            '<td></td>' +
          '</tr>' +
        '</tbody>';
    tabdiv.appendChild(tab);

    addListener(win, container, 'neuron-staging-table');

    addLogic(win);

    return win;

  }

  /** Creates and returns a new 3d webgl window */
  var create3dWebGLWindow = function()
  {

    if( $( "#neuron_staging_table").length == 0 ) {
        createStagingListWindow();
    }

    if ( !Detector.webgl ) {
      alert('Your browser does not seem to support WebGL.');
      return;
    }

    var win = new CMWWindow("3D WebGL View");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("view_in_3d_webgl_widget");
    content.appendChild(container);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "center_active_node");
    add.setAttribute("value", "Center active");
    add.onclick = WebGLApp.look_at_active_node;
    container.appendChild(add);

    var fulls = document.createElement('input');
    fulls.setAttribute("type", "button");
    fulls.setAttribute("id", "fullscreen_webgl_view");
    fulls.setAttribute("value", "Fullscreen");
    fulls.onclick = WebGLApp.fullscreenWebGL;
    container.appendChild(fulls);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "xy_plane");
    rand.setAttribute("value", "XY");
    rand.onclick =  WebGLApp.XYView;
    container.appendChild(rand);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "xz_plane");
    rand.setAttribute("value", "XZ");
    rand.onclick = WebGLApp.XZView;
    container.appendChild(rand);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "yz_plane");
    rand.setAttribute("value", "YZ");
    rand.onclick = WebGLApp.YZView;
    container.appendChild(rand);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "randomize_skeleton_color");
    rand.setAttribute("value", "Randomize color");
    rand.onclick = WebGLApp.randomizeColors;
    container.appendChild(rand);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "configure_parameters");
    rand.setAttribute("value", "Options");
    rand.onclick = WebGLApp.configure_parameters;
    container.appendChild(rand);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas");
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    canvas.style.backgroundColor = "#000000";
    container.appendChild(canvas);


    //addListener(win, container);
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
            container.style.height = win.getContentHeight() + "px";
            container.style.width = win.getWidth() + "px";
            WebGLApp.resizeView( parseInt(frame.style.width, 10), parseInt(frame.style.height, 10) );
            // Update the container height to account for the table-div having been resized
            // TODO
            break;
        }
        return true;
      });


    addLogic(win);

    // Fill in with a Raphael canvas, now that the window exists in the DOM:
    // createWebGLViewerFromCATMAID(canvas.getAttribute("id"));

    WebGLApp.init( canvas.getAttribute("id") );

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

  var createSegmentsTablesWindow = function()
  {
    console.log('create...')
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

  var createCompartmentGraphWindow = function()
  {
    var win = new CMWWindow("Compartment Graph Widget");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var contentbutton = document.createElement('div');
    contentbutton.setAttribute("id", 'compartment_graph_window_buttons');

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "confidence_compartment_show_neurons_from_3d_view");
    add.setAttribute("value", "Show graph");
    add.onclick = CompartmentGraphWidget.updateConfidenceGraphFrom3DViewer;
    contentbutton.appendChild(add);

    var label = document.createTextNode('Keep edges with confidence');
    contentbutton.appendChild(label);

    var sync = document.createElement('select');
    sync.setAttribute("id", "confidence_threshold");
    for (var i = 0; i < 6; ++i) {
      var option = document.createElement("option");
      option.text = i.toString();
      option.value = i;
      sync.appendChild(option);
    }
    contentbutton.appendChild(sync);

    var label = document.createTextNode('or higher.');
    contentbutton.appendChild(label);

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
                    /*while (new_users.length > 0)
                        new_users.remove(0);*/
                    for (var i in e) {
                        var option = document.createElement("option");
                        option.text = e[i].name + " (" + e[i].longname + ")";
                        option.value = e[i].id;
                        new_users.appendChild(option);
                    }
                    new_users.size = e.length;
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
        start.onclick = ReviewSystem.startSkeletonToReview;
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
        var win = new CMWWindow("Skeleton Connectivity");
        var content = win.getFrame();
        content.style.backgroundColor = "#ffffff";

        var contentbutton = document.createElement('div');
        contentbutton.setAttribute("id", 'skeleton_connectivity_buttons');

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "retrieve_connectivity");
        add.setAttribute("value", "Get connectivity");
        add.onclick = SkeletonConnectivity.fetchConnectivityForSkeleton;
        contentbutton.appendChild(add);

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("id", "refresh_connectivity");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = SkeletonConnectivity.refresh;
        contentbutton.appendChild(refresh);

        var sync = document.createElement('select');
        sync.setAttribute("id", "connectivity_count_threshold");

        // TODO pulldown menu for past items. When selecting one, refresh even if it is the same as currently listed. Acts as a refresh button.

        for (var i = 0; i < 21; i++) {
          var option = document.createElement("option");
          option.text = i.toString();
          option.value = i;
          sync.appendChild(option);
        }

        contentbutton.appendChild(sync);

        content.appendChild( contentbutton );

        var container = createContainer( "connectivity_widget" );
        content.appendChild( container );

        addListener(win, container, 'skeleton_connectivity_buttons');

        addLogic(win);

        SkeletonConnectivity.init();

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

      container.innerHTML =
        '<h2>Download complete microcircuit reconstruction as <a target="_new" href="'+ django_url + project.id + '/microcircuit/neurohdf' + '">NeuroHDF</a>. ' +
        'You can use the Python <a target="_new" href="https://github.com/unidesigner/microcircuit/">microcircuit package</a> to load the file and do analysis of the neural circuit.</h2>' +
        '<br />' +
        '<h2>Download annotation graph as <a target="_new" href="'+ django_url + project.id + '/annotationdiagram/nx_json ' + '">NetworkX JSON graph</a></h2>';

      addListener(win, container);

      addLogic(win);

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

    container.innerHTML =
      '<input type="button" id="refresh_stats" value="Refresh" style="display:block; float:left;" />' +
      '<br clear="all" />' +
			'<!-- piechart -->' +
      '<div class="project-stats">' +
				'<h3>Daily Statistics</h3>' +
        '<table cellpadding="0" cellspacing="0" border="0" class="project-stats" id="project_stats_table">' +
          '<tr>' +
            '<td >#skeletons created</td>' +
            '<td id="skeletons_created"></td>' +
            '</td>' +
          '</tr>' +
          '<tr>' +
            '<td >#treenodes_created</td>' +
            '<td id="treenodes_created"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#connectors_created</td>' +
            '<td id="connectors_created"></td>' +
          '</tr>' +
        '</table>' +
      '</div><br clear="all" />' +
			'<div class="piechart">' + 
				'<h3>Annotation User Contribution</h3>' +
				'<table><tr><td><div id="piechart_treenode_holder"></div></td>' +
        '<td><div id="piechart_editor_holder"></div></td>' +
        '<td><div id="piechart_reviewer_holder"></div></td></tr></table>' +
			'</div><br clear="all" />' +
      '<div class="annotation-history">' + 
				'<h3 style="text-align: left">Annotation History</h3>' +
				'<div id="linechart_treenode_holder"></div>' + 
			'</div><br clear="all" />';

    addListener(win, container);

    addLogic(win);

    ProjectStatistics.init();

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
    "compartment-graph-widget": createCompartmentGraphWindow,
    "assemblygraph-widget": createAssemblyGraphWindow,
    "segmentstable-widget": createSegmentsTablesWindow,
    "object-tree": createObjectTreeWindow,
    "statistics": createStatisticsWindow,
    "disclaimer": createDisclaimerWindow,
    "review-system": createReviewWindow,
    "connectivity-widget": createConnectivityWindow,
    "adjacencymatrix-widget": createAdjacencyMatrixWindow
  };

  /** If the window for the given name is already showing, just focus it.
   * Otherwise, create it new. */
  this.show = function( name )
  {
    if (creators.hasOwnProperty( name )) {
      if (windows[name]) {
        console.log('only focus')
        windows[name].focus();
      } else {
        windows[name] = creators[name]();
      }
    } else {
      alert("No known window with name " + name);
    }
  };

}();
