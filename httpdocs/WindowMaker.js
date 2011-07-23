/** An object that encapsulates the functions for creating accessory windows. */
var WindowMaker = new function()
{
  var windows = {};

  var createContainer = function(id) {
    var container = document.createElement("div");
    container.setAttribute("id", id);
    container.setAttribute("class", "sliceView");
    container.style.position = "absolute";
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
                    console.log("deleted " + name);
                    break;
                  }
                }
              }
              //
              win.close();
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


  /** Creates and returns a new 3d window. */
  this.create3dWindow = function()
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
    canvas.style.width = "500px";
    canvas.style.height = "500px";
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


  this.createNodeTableWindow = function()
  {
    var win = new CMWWindow("Node Table");
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer("treenode_table_widget");
    content.appendChild(container);

    container.innerHTML =
      '<div id="treenode_table_container" style="position:absolute; top:20px; bottom:4px; width:100%; overflow:auto">' +
        '&nbsp; Synchronize <input type="checkbox" id="synchronize_treenodetable" />' +
        '<table cellpadding="0" cellspacing="0" border="0" class="display" id="treenodetable">' +
          '<thead>' +
            '<tr>' +
              '<th>id</th>' +
              '<th>x</th>' +
              '<th>y</th>' +
              '<th>z</th>' +
              '<th>type</th>' +
              '<th>confidence</th>' +
              '<th>radius</th>' +
              '<th>username</th>' +
              '<th>tags</th>' +
              '<th>last modified</th>' +
            '</tr>' +
          '</thead>' +
          '<tfoot>' +
            '<tr>' +
              '<th>id</th>' +
              '<th>x</th>' +
              '<th>y</th>' +
              '<th>z</th>' +
              '<th><input type="text" name="search_type" value="Search" class="search_init" size="5" /></th>' +
              '<th>confidence</th>' +
              '<th>radius</th>' +
              '<th>username</th>' +
              '<th><input type="text" name="search_labels" value="Search" class="search_init" size="5" /></th>' +
              '<th>last modified</th>' +
            '</tr>' +
          '</tfoot>' +
          '<tbody>' +
            '<tr><td colspan="10"></td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>';

    addListener(win, container);

    addLogic(win);

    return win;
  };
  
  this.createKeyboardShortcutsWindow = function()
  {
    var win = new CMWWindow( "KeyboardShortcuts" );
    var content = win.getFrame();
    content.style.backgroundColor = "#ffffff";

    var container = createContainer( "keyboard-shortcuts-window" );
    content.appendChild( container );
    
    var list = document.createElement( "p" );
    list.id = "keyShortcutsText";
    var keysHTML = '';
    for (i in stringToKeyAction) {
      keysHTML += '<button style="width:3em; margin-right:1em">' + i + '</button>' + stringToKeyAction[i].helpText + "<br />";
    }
    list.innerHTML = keysHTML;
    container.appendChild( list );

    addListener(win, container);

    addLogic(win);

    return win;
  };

  var creators = {
    "keyboard-shortcuts": this.createKeyboardShortcutsWindow,
    "3d-view": this.create3dWindow,
    "node-table": this.createNodeTableWindow
  };

  /** If the window for the fiven name is already showing, just focus it.
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