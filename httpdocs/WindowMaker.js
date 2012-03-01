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
    container.style.overflow = "auto";
    container.style.backgroundColor = "#ffffff";
    return container;
  };

  var addListener = function(win, container) {
    win.addListener(
      function(callingWindow, signal) {
        switch (signal) {
          case CMWWindow.CLOSE:
            if (typeof project == undefined || project == null) {
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
            container.style.height = win.getContentHeight() + "px";
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

    if (rootWindow.getChild() == null)
      rootWindow.replaceChild(win);
    else
      rootWindow.replaceChild(new CMWHSplitNode(rootWindow.getChild(), win));

    win.focus();
  };


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

    var container = createContainer("view_in_3d_webgl_widget");
    content.appendChild(container);

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "add_current_to_3d_webgl_view");
    add.setAttribute("value", "Add current skeleton to 3D view");
    add.onclick = addTo3DWebGLView; // function declared in webglapp.js
    container.appendChild(add);

    var active = document.createElement('input');
    active.setAttribute("type", "button");
    active.setAttribute("id", "update_current_atn_3d_webgl_view");
    active.setAttribute("value", "Update current active node position");
    active.onclick = update3DWebGLViewATN; // function declared in webglapp.js
    container.appendChild(active);

    var fulls = document.createElement('input');
    fulls.setAttribute("type", "button");
    fulls.setAttribute("id", "fullscreen_webgl_view");
    fulls.setAttribute("value", "Fullscreen");
    fulls.onclick = fullscreenWebGL; // function declared in webglapp.js
    container.appendChild(fulls);

    var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "randomize_skeleton_color");
    rand.setAttribute("value", "Randomize color");
    rand.onclick = randomizeWebGLColor; // function declared in webglapp.js
    container.appendChild(rand);

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "enable_z_plane");
    rand.setAttribute("value", "Enable z-plane");
    rand.onclick = updateZPlane; // function declared in webglapp.js
    container.appendChild(rand);
    var rand = document.createTextNode('Enable z-plane');
    container.appendChild(rand);

    var introduction = document.createElement('p')
    introduction.setAttribute("id", "view3DWebGLIntroduction");
    container.appendChild(introduction);

    var list = document.createElement('ul');
    list.setAttribute("id", "view-3d-webgl-object-list")
    container.appendChild(list);

    var canvas = document.createElement('div');
    canvas.setAttribute("id", "viewer-3d-webgl-canvas");
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    canvas.style.backgroundColor = "#000000";
    container.appendChild(canvas);

    addListener(win, container);

    addLogic(win);

    // Fill in with a Raphael canvas, now that the window exists in the DOM:
    createWebGLViewerFromCATMAID(canvas.getAttribute("id"));

    return win;
  }

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
    add.onclick = addTo3DView; // function declared in overlay.js
    container.appendChild(add);

    var introduction = document.createElement('p')
    introduction.setAttribute("id", "view3DIntroduction");
    container.appendChild(introduction);

    var list = document.createElement('ul');
    list.setAttribute("id", "view-3d-object-list")
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
    createViewerFromCATMAID(canvas.getAttribute("id"));

    return win;
  };


  var createNodeTableWindow = function()
  {
    var win = new CMWWindow("Table of Skeleton Nodes");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var add = document.createElement('input');
    add.setAttribute("type", "button");
    add.setAttribute("id", "update_treenodetable_current_skeleton");
    add.setAttribute("value", "Update table for current skeleton");
    add.onclick = updateTreenodeTable; // function declared in table_treenode.js
    content.appendChild(add);

    var sync = document.createElement('input');
    sync.setAttribute("type", "checkbox");
    sync.setAttribute("id", "synchronize_treenodetable");
    sync.setAttribute("label", "Synchronize");
    content.appendChild(sync);

    var label = document.createTextNode('Synchronize');
    content.appendChild(label);

    var container = createContainer("treenode_table_widget");
    content.appendChild(container);

    container.innerHTML =
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="treenodetable">' +
        '<thead>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type' +
        '' +
        '<select name="search_type" id="search_type" class="search_init">' +
        '<option value="">None</option><option value="R">Root</option><option value="L">Leaf</option>' +
        '<option value="B">Branch</option><option value="S">Slab</option></select>' +
        '</th>' +
        // <input type="text" name="search_type" value="Search" class="search_init" />
            '<th>tags<input type="text" name="search_labels" id="search_labels" value="Search" class="search_init" /></th>' +
            '<th>confidence</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>radius</th>' +
            '<th>username</th>' +
            '<th>last modified</th>' +
          '</tr>' +
        '</thead>' +
        '<tfoot>' +
          '<tr>' +
            '<th>id</th>' +
            '<th>type</th>' +
            '<th>tags</th>' +
            '<th>confidence</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
            '<th>radius</th>' +
            '<th>username</th>' +
            '<th>last modified</th>' +
          '</tr>' +
        '</tfoot>' +
        '<tbody>' +
          '<tr><td colspan="10"></td></tr>' +
        '</tbody>' +
      '</table>';

    addListener(win, container);

    addLogic(win);

    TreenodeTable.init( project.getId() );

    return win;
  };

  var createConnectorTableWindow = function()
  {
    var win = new CMWWindow("Table of Connectors");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("connectortable_widget");
    content.appendChild(container);

    container.innerHTML =
      '<select id="connector_relation_type">' +
        '<option value="0">Incoming connectors</option>' +
        '<option value="1" selected="yes">Outgoing connectors</option>' +
      '</select>' +
      '&nbsp; Synchronize <input type="checkbox" id="synchronize_connectortable" />' +
      '<table cellpadding="0" cellspacing="0" border="0" class="display" id="connectortable">' +
        '<thead>' +
          '<tr>' +
            '<th>connector id</th>' +
            '<th id="other_skeleton_top">target skeleton ID</th>' +
            '<th>x</th>' +
            '<th>y</th>' +
            '<th>z</th>' +
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
            '<th>tags</th>' +
            '<th id="connector_nr_nodes_bottom"># nodes for target(s)</th>' +
            '<th>username</th>' +
            '<th id="other_treenode_bottom">target treenode ID</th>' +
          '</tr>' +
        '</tfoot>' +
      '</table>';


    addListener(win, container);

    addLogic(win);

    ConnectorTable.init( project.getId() );

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
  }

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
  }

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
    keysHTML += '<input type="submit" style="display: hidden">'
    keysHTML += '</form>';
    keysHTML += '<div id="search-results">';
    keysHTML += '</div>';

    container.innerHTML = keysHTML;
    return container;
  }

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
      '<div id="project_stats">' +
        '<table cellpadding="0" cellspacing="0" border="0" class="display" id="project_stats_table">' +
          '<tr>' +
            '<td >#users</td>' +
            '<td id="proj_users"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#neurons</td>' +
            '<td id="proj_neurons"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#synapses</td>' +
            '<td id="proj_synapses"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#treenodes</td>' +
            '<td id="proj_treenodes"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#skeletons</td>' +
            '<td id="proj_skeletons"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#presynaptic contacts</td>' +
            '<td id="proj_presyn"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#postsynaptic contacts</td>' +
            '<td id="proj_postsyn"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#textlabels</td>' +
            '<td id="proj_textlabels"></td>' +
          '</tr>' +
          '<tr>' +
            '<td >#tags</td>' +
            '<td id="proj_tags"></td>' +
          '</tr>' +
        '</table>' +
      '</div>' +
      '<!-- piechart -->' +
      '<h3>Annotation User Contribution</h3>' +
      '<div id="piechart_treenode_holder"></div>';

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
    "object-tree": createObjectTreeWindow,
    "statistics": createStatisticsWindow,
    "disclaimer": createDisclaimerWindow
  };

  /** If the window for the given name is already showing, just focus it.
   * Otherwise, create it new. */
  this.show = function( name )
  {
    if (creators.hasOwnProperty( name )) {
      if (windows[name]) {
        windows[name].focus();
      } else {
        windows[name] = creators[name]();
      }
    } else {
      alert("No known window with name " + name);
    }
  }

};
