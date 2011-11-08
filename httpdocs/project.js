/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * project.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 request.js
 *
 */

/**
 */

/**
 * A TrakEM2 Web project.
 *
 * - contains abstract objects on top of a common project-specific semantic framework
 * - is related to one or more stacks of statically aligned layers
 *   ( all stacks of a project are related by translation using physical dimensions )
 */

/* Define any new keybindings here.

   There's a helpful page with the different key codes for different
   browsers here:

     http://unixpapa.com/js/key.html
 */

var arrowKeyCodes = {
  left: 37,
  up: 38,
  right: 39,
  down: 40
};

var stringToKeyAction = {
  "A": {
    helpText: "Go to active node",
    buttonID: 'trace_button_goactive',
    run: function (e) {
      project.tracingCommand('goactive');
      return false;
    }
  },
  "+": {
    helpText: "Zoom in",
    specialKeyCodes: [107, 61, 187],
    run: function (e) {
      slider_s.move(1);
      slider_trace_s.move(1);
      return false;
    }
  },
  "-": {
    helpText: "Zoom out",
    specialKeyCodes: [109, 189, 45],
    run: function (e) {
      slider_s.move(-1);
      slider_trace_s.move(-1);
      return false;
    }
  },
  ",": {
    helpText: "Move up 1 slice in z (or 10 with Shift held)",
    specialKeyCodes: [188, 44],
    run: function (e) {
      slider_z.move(-(e.shiftKey ? 10 : 1));
      slider_trace_z.move(-(e.shiftKey ? 10 : 1));
      return false;
    }
  },
  ".": {
    helpText: "Move down 1 slice in z (or 10 with Shift held)",
    specialKeyCodes: [190, 46],
    run: function (e) {
      slider_z.move((e.shiftKey ? 10 : 1));
      slider_trace_z.move((e.shiftKey ? 10 : 1));
      return false;
    }
  },
  "\u2190": {
    helpText: "Move left (towards negative x)",
    specialKeyCodes: [arrowKeyCodes.left],
    run: function (e) {
      input_x.value = parseInt(input_x.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_x.onchange(e);
      return false;
    }
  },
  "\u2192": {
    helpText: "Move right (towards positive x)",
    specialKeyCodes: [arrowKeyCodes.right],
    run: function (e) {
      input_x.value = parseInt(input_x.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_x.onchange(e);
      return false;
    }
  },
  "\u2191": {
    helpText: "Move up (towards negative y)",
    specialKeyCodes: [arrowKeyCodes.up],
    run: function (e) {
      input_y.value = parseInt(input_y.value, 10) - (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_y.onchange(e);
      return false;
    }
  },
  "\u2193": {
    helpText: "Move down (towards positive y)",
    specialKeyCodes: [arrowKeyCodes.down],
    run: function (e) {
      input_y.value = parseInt(input_y.value, 10) + (e.shiftKey ? 100 : (e.altKey ? 1 : 10));
      input_y.onchange(e);
      return false;
    }
  },
  "1": {
    helpText: "Switch to skeleton tracing mode",
    buttonID: 'trace_button_skeleton',
    run: function (e) {
      project.tracingCommand('skeletontracing');
      return false;
    }
  },
  "2": {
    helpText: "Switch to synapse dropping mode",
    buttonID: 'trace_button_synapse',
    run: function (e) {
      project.tracingCommand('synapsedropping');
      return false;
    }
  },
  "M": {
    helpText: "Deselect the active node",
    run: function (e) {
      activateNode(null);
      return false;
    }
  },
  "P": {
    helpText: "Go to the parent of the active node (?)",
    run: function (e) {
      project.tracingCommand('goparent');
      return false;
    }
  },
  "E": {
    helpText: "Go to last edited node in this skeleton",
    run: function (e) {
      project.tracingCommand('golastedited');
      return false;
    }
  },
  "5": {
    helpText: "Split this skeleton at the active node",
    buttonID: 'trace_button_skelsplitting',
    run: function (e) {
      project.tracingCommand('skeletonsplitting');
      return false;
    }
  },
  "6": {
    helpText: "Re-root this skeleton at the active node",
    buttonID: 'trace_button_skelrerooting',
    run: function (e) {
      project.tracingCommand('skeletonreroot');
      return false;
    }
  },
  "7": {
    helpText: "Toggle the display of tags",
    buttonID: 'trace_button_togglelabels',
    run: function (e) {
      project.tracingCommand('togglelabels');
      return false;
    }
  },
  "S": {
    helpText: "Export to SWC",
    buttonID: 'trace_button_exportswc',
    run: function (e) {
      project.tracingCommand('exportswc');
      return false;
    }
  },
  "T": {
    helpText: "Tag the active node",
    run: function (e) {
      if (!(e.ctrlKey || e.metaKey)) {
        project.tracingCommand('tagging');
      }
      return true;
    }
  },
  "G": {
    helpText: "Select the nearest node to the mouse cursor",
    run: function (e) {
      if (!(e.ctrlKey || e.metaKey)) {
        project.activateNearestNode();
      }
      return true;
    }
  },
  "Tab": {
    helpText: "Switch to the next open stack (or the previous with Shift+Tab)",
    specialKeyCodes: [9],
    run: function (e) {
      if (e.shiftKey) {
        project.switchFocus(-1);
      } else {
        project.switchFocus(1);
      }
      //e.stopPropagation();
      return false;
    }
  }
};

var withAliases = jQuery.extend({}, stringToKeyAction);
withAliases["4"] = withAliases["A"];

/* We now turn that structure into an object for
   fast lookups from keyCodes */

var keyCodeToKeyAction = {};

{
  var i;
  for (i in withAliases) {
    var keyCodeFromKey = null;
/* If the string representation of the key is a single upper case
       letter or a number, we just use its ASCII value as the key
       code */
    if (i.length === 1) {
      k = i.charCodeAt(0);
      if ((k >= 65 && k <= 90) || (k >= 48 && k <= 57)) {
        keyCodeFromKey = k;
      }
    }
    var o = withAliases[i]; /* Add any more unusual key codes for that action */
    var allKeyCodes = o.specialKeyCodes || [];
    if (keyCodeFromKey && $.inArray(keyCodeFromKey, allKeyCodes) < 0) {
      allKeyCodes.push(keyCodeFromKey);
    }

    /* Now add to the keyCodeToKeyAction object */
    var ki, k;
    for (ki in allKeyCodes) {
      k = allKeyCodes[ki];
      if (keyCodeToKeyAction[k]) {
        alert("Attempting to define a second action for keyCode " + k + " via '" + i + "'");
      } else {
        keyCodeToKeyAction[k] = o;
      }
    }
  }
}

/** Updates the 'alt' and 'title' attributes on the toolbar
 icons that are documented with help text and key presses.
 Also bind the onClick action for the link that contains
 those icons to the corresponding function */

function setButtons() {
  for (var i in stringToKeyAction) {
    var o = stringToKeyAction[i];
    if (o.buttonID) {
      var link = $('#' + o.buttonID);
      link.attr('href', 'foo');
      link.click(o.run);
      var img = link.find('img');
      img.attr('alt', o.helpText);
      var title = i + ': ' + o.helpText;
      img.attr('title', title);
    }
  }
}

function Project(pid) {
  this.lastX = null;
  this.lastY = null;
  this.lastStackID = null;

  this.getView = function () {
    return view;
  }

  /**
   * add a stack to the project
   */
  this.addStack = function (stack) {
    var opened = false;
    for (var i = 0; i < stacks.length; ++i) {
      if (stacks[i].id == stack.id) {
        stack = stacks[i];
        opened = true;
        break;
      }
    }
    if (!opened) {
      stacks.push(stack);
      view.appendChild(stack.getView());
      ui.onresize();
    }
    if (stacks.length > 1) {
      var message_widget_resize_handle = new ResizeHandle("h");
      stacks[stacks.length - 2].getView().insertBefore(message_widget_resize_handle.getView(), stacks[stacks.length - 2].getView().firstChild);
      self.moveTo(self.coordinates.z, self.coordinates.y, self.coordinates.x);
    } else {
      var c = stack.projectCoordinates();
      self.moveTo(c.z, c.y, c.x);
    }

    self.setMode(mode);

    stack.focus();
    return;
  }

  /**
   * get one of the projects currently opened stacks
   */
  this.getStack = function (sid) {
    for (var i = 0; i < stacks.length; ++i) {
      if (stacks[i].id == sid) return stacks[i];
    }
    return false;
  }

  /**
   * remove a stack from the list
   */
  this.removeStack = function (sid) {
    for (var i = 0; i < stacks.length; ++i) {
      if (stacks[i].id == sid) {
        stacks[i].unregister();
        view.removeChild(stacks[i].getView());
        stacks.splice(i, 1);
        if (stacks.length == 0) self.unregister();
        else {
          if (stacks[stacks.length - 1].getView().firstChild.className.match(/resize_handle/)) stacks[stacks.length - 1].getView().removeChild(stacks[stacks.length - 1].getView().firstChild);
          stacks[(i + 1) % stacks.length].focus();
        }
      }
    }
    ui.onresize();
    return;
  }

  /**
   * focus one stack and blur the rest
   */
  this.focusStack = function (stack) {
    self.focusedStack = stack;
    for (var i = 0; i < stacks.length; ++i) {
      if (stack != stacks[i]) stacks[i].blur();
    }
    return;
  }

  /**
   * focus the next or prior stack
   */
  this.switchFocus = function (s) {
    var i;
    for (i = 0; i < stacks.length; ++i) {
      if (self.focusedStack == stacks[i]) break;
    }
    stacks[(i + stacks.length + s) % stacks.length].focus();
    return;
  }


/*
 * resize the view and its content on window.onresize event
 */
  var resize = function (e) {
    var stack_view_width;
    var top = document.getElementById("toolbar_container").offsetHeight;
    if (message_widget.offsetHeight) top += message_widget.offsetHeight;
    //var bottom = document.getElementById( 'console' ).offsetHeight;
    var bottom = 64;
    var height = Math.max(0, ui.getFrameHeight() - top - bottom);
    var left = 0;
    var width = ui.getFrameWidth();
    if (table_widget.offsetWidth) {
      width -= table_widget.offsetWidth;
      left += table_widget.offsetWidth;
    }
    if (table_connector_widget.offsetWidth) {
      table_connector_widget.style.left = left + "px";
      width -= table_connector_widget.offsetWidth;
      left += table_connector_widget.offsetWidth;
    }
    if (project_stats_widget.offsetWidth) {
      project_stats_widget.style.left = left + "px";
      width -= project_stats_widget.offsetWidth;
      left += project_stats_widget.offsetWidth;
    }
    if (key_shortcut_widget.offsetWidth) {
      key_shortcut_widget.style.left = left + "px";
      width -= key_shortcut_widget.offsetWidth;
      left += key_shortcut_widget.offsetWidth;
    }
    if (view_in_3d_widget.offsetWidth) {
      view_in_3d_widget.style.left = left + "px";
      width -= view_in_3d_widget.offsetWidth;
      left += view_in_3d_widget.offsetWidth;
    }
    if (object_tree_widget.offsetWidth) {
      object_tree_widget.style.left = left + "px";
      width -= object_tree_widget.offsetWidth;
      left += object_tree_widget.offsetWidth;
    }
    width = Math.max(width,0);
    var old_width = 0;
    for (var i = 0; i < stacks.length; ++i) {
      old_width += stacks[i].getView().offsetWidth;
    }
    var width_ratio = width / old_width;

    //var stack_view_width = Math.floor( width / stacks.length );
    view.style.left = left + "px";
    left = 0;
    for (var i = 0; i < stacks.length; ++i) {
      if (isFinite(width_ratio)) {
        //stacks[ i ].resize( i * stack_view_width, 0, stack_view_width, height );
        stack_view_width = Math.floor(stacks[i].getView().offsetWidth * width_ratio);
        stacks[i].resize(left, 0, stack_view_width, height);
        left += stack_view_width;
      } else {
        // If width_ratio is Infinity, then all the stacks were shrunk
        // down to zero width on the last resize.  In that case, just
        // split the space equally between them when expanding again:
        stack_view_width = width / stacks.length;
        stacks[i].resize(left, 0, stack_view_width, height);
        left += stack_view_width;
      }
    }

    view.style.top = top + "px";
    view.style.width = width + "px";
    view.style.height = height + "px";

    return true;
  }

  this.getMode = function () {
    return mode;
  }


/*
 * Shows the tree view for the loaded project
 */
  this.showTreeviewWidget = function (m) {
    switch (m) {
    case "entities":
      var tw_status = document.getElementById('object_tree_widget').style.display;
      // check if not opened before to prevent messing up with event handlers
      if (tw_status != 'block') {
        document.getElementById('object_tree_widget').style.display = 'block';
        ui.onresize();
        initObjectTree(this.id);
      }
      break;
    }
    return;
  }

/*
 * Shows the datatable for the loaded project
 */
  this.showDatatableWidget = function (m) {
    switch (m) {
    case "treenode":
      document.getElementById('treenode_table_widget').style.display = 'block';
      ui.onresize();
      initTreenodeTable(this.id);
      break;
    case "connector":
      document.getElementById('connectortable_widget').style.display = 'block';
      ui.onresize();
      initConnectorTable(this.id);
      break;  
    }
    return;
  }


/*
 * Shows the project statistics widget
 */
  this.showStatisticsWidget = function () {
    document.getElementById('project_stats_widget').style.display = 'block';
    ui.onresize();
    initProjectStats();
    refresh_project_statistics();
    return;
  }

  this.showKeyShortcutHelp = function () {
    var i;
    var widget = $('#key_shortcut_widget');
    var divForText = widget.find('#keyShortcutsText');
    var keysHTML = '';
    for (i in stringToKeyAction) {
      keysHTML += '<strong><tt>' + i + '</tt></strong>: ' + stringToKeyAction[i].helpText + "<br>";
    }
    divForText.html(keysHTML);
    widget.css('display', 'block');
    ui.onresize();
    return;
  }

  this.show3DView = function () {
    var widget = $('#view_in_3d_widget');
    widget.css('display', 'block');
    ui.onresize();
    createViewerFromCATMAID('viewer-3d-canvas');
    return;
  }

  this.addTo3DView = function () {
    if (!atn) {
      alert("You must have an active node selected to add its skeleton to the 3D View.");
      return;
    }
    if (atn.type != "treenode") {
      alert("You can only add skeletons to the 3D View at the moment - please select a node of a skeleton.");
      return;
    }
    var tnid = atn.id;

    requestQueue.register('model/treenode.info.php', 'POST', {
      pid: project.id,
      tnid: atn.id
    }, function (status, text, xml) {
      if (status == 200) {
        var e = eval("(" + text + ")");
        if (e.error) {
          alert(e.error);
        } else {
          e['project_id'] = project.id;
          addNeuronFromCATMAID('viewer-3d-canvas', e);
        }
      } else {
        alert("Bad status code " + status + " mapping treenode ID to skeleton and neuron");
      }
      return true;
    });
  }

  this.setMode = function (m) {
    document.getElementById("edit_button_select").className = "button";
    document.getElementById("edit_button_move").className = "button";
    document.getElementById("edit_button_text").className = "button";
    document.getElementById("edit_button_crop").className = "button";
    document.getElementById("edit_button_trace").className = "button";
    //document.getElementById( "edit_button_profile" ).className = "button";
    document.getElementById("toolbar_nav").style.display = "none";
    document.getElementById("toolbar_text").style.display = "none";
    document.getElementById("toolbar_crop").style.display = "none";
    document.getElementById("toolbar_trace").style.display = "none";
    switch (m) {
    case "select":
      break;
    case "move":
      document.getElementById("toolbar_nav").style.display = "block";
      break;
    case "text":
      document.getElementById("toolbar_text").style.display = "block";
      if (!show_textlabels) self.toggleShow("text");
      break;
    case "crop":
      document.getElementById("toolbar_crop").style.display = "block";
      break;
    case "trace":
      document.getElementById("toolbar_trace").style.display = "block";
      //if ( !show_traces ) self.toggleShow( "trace" );
      break;
    }

    mode = m;
    document.getElementById("edit_button_" + mode).className = "button_active";

    for (var i = 0; i < stacks.length; ++i) {
      stacks[i].setMode(mode);
      if (stacks[i] != self.focusedStack) stacks[i].blur();
    }

    window.onresize();
    return;
  }

  this.toggleShow = function (m) {
    switch (m) {
    case "text":
      if (show_textlabels && mode != "text") {
        show_textlabels = false;
        document.getElementById("show_button_text").className = "button";
        for (var i = 0; i < stacks.length; ++i)
        stacks[i].showTextlabels(false);
      } else {
        show_textlabels = true;
        for (var i = 0; i < stacks.length; ++i)
        stacks[i].showTextlabels(true);
        document.getElementById("show_button_text").className = "button_active";
      }
    }
    return;
  }

  this.tracingCommand = function (m) {
    for (var i = 0; i < stacks.length; ++i)
    stacks[i].tracingCommand(m);
    return;
  }

  this.showTags = function (m) {
    for (var i = 0; i < stacks.length; ++i)
    stacks[i].showTags(m);
    return;
  }

  this.selectNode = function (id) {
    // select the node in the current overlay
    // if it is existing
    for (var i = 0; i < stacks.length; ++i)
    stacks[i].selectNode(id);
    return;
  }

  this.activateNearestNode = function () {
    if (project.lastStackID === null) {
      alert("No last stack ID was found");
    } else {
      for (var i = 0; i < stacks.length; ++i) {
        if (stacks[i].id === project.lastStackID) {
          stacks[i].tracingCommand("selectnearestnode");
          return;
        }
      }
      alert("Couldn't find the stack with ID "+project.lastStackID);
    }
  }

  this.recolorAllNodes = function () {
    var i;
    for (i = 0; i < stacks.length; ++i) {
      stacks[i].recolorAllNodes();
    }
  }

  /**
   * register all GUI elements
   */
  this.register = function () {
    document.getElementById("content").style.display = "none";
    document.body.appendChild(view);
    ui.registerEvent("onresize", resize);
    window.onresize();

    // Use jQuery so we can get the 'e.which' normalized keyCode:
    $(document).keydown(onkeydown);

    return;
  }

  /**
   * unregister and remove all stacks, free the event-handlers, hide the stack-toolbar
   *
   * @todo: should not the stack handle the navigation toolbar?
   */
  this.unregister = function () {
    //! close all stacks
    for (var i = 0; i < stacks.length; ++i) {
      stacks[i].unregister();
      view.removeChild(stacks[i].getView());
      stacks.splice(i, 1);
    }

    ui.removeEvent("onresize", resize);
    try {
      document.body.removeChild(view);
      document.getElementById("toolbar_nav").style.display = "none";
      document.getElementById("toolbar_text").style.display = "none";
      document.getElementById("toolbox_project").style.display = "none";
      document.getElementById("toolbox_edit").style.display = "none";
      document.getElementById("toolbox_data").style.display = "none";
      document.getElementById("toolbox_show").style.display = "none";
      document.getElementById("toolbar_crop").style.display = "none";
      document.getElementById("toolbar_trace").style.display = "none";

      // hide data table and tree view widgets
      // in order to reload the data for a new project
      document.getElementById("treenode_table_widget").style.display = "none";
      document.getElementById("connectortable_widget").style.display = "none";
      document.getElementById("object_tree_widget").style.display = "none";
      document.getElementById("project_stats_widget").style.display = "none";

    } catch (error) {}
    self.id = 0;
    document.onkeydown = null;
    document.getElementById("content").style.display = "block";
    return;
  }

  /**
   * set the project to be editable or not
   */
  this.setEditable = function (bool) {
    editable = bool;
    if (editable) {
      document.getElementById("toolbox_edit").style.display = "block";
      document.getElementById("toolbox_data").style.display = "block";
    } else {
      document.getElementById("toolbox_edit").style.display = "none";
      document.getElementById("toolbox_data").style.display = "none";
    }
    window.onresize();

    return;
  }

  /**
   * move all stacks to the physical coordinates
   */
  this.moveTo = function (
  zp, yp, xp, sp) {
    self.coordinates.x = xp;
    self.coordinates.y = yp;
    self.coordinates.z = zp;

    for (var i = 0; i < stacks.length; ++i) {
      stacks[i].moveTo(zp, yp, xp, sp);
    }
    return;
  }

  /**
   * create a URL to the current view
   */
  this.createURL = function () {
    var coords;
    var url = "?pid=" + self.id;
    if (stacks.length > 0) {
      //coords = stacks[ 0 ].projectCoordinates();		//!< @todo get this from the SELECTED stack to avoid approximation errors!
      url += "&zp=" + self.coordinates.z + "&yp=" + self.coordinates.y + "&xp=" + self.coordinates.x;
      for (var i = 0; i < stacks.length; ++i) {
        url += "&sid" + i + "=" + stacks[i].id + "&s" + i + "=" + stacks[i].screenCoordinates().s;
      }
    }
    return url;
  }

/*
 * create a link between two locations
 */
  this.createLink = function (fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype) {
    for (var i = 0; i < stacks.length; ++i)
    stacks[i].createLink(fromid, toid, link_type, from_type, to_type, from_nodetype, to_nodetype);
    return;
  }
/*
 * updates nodes in all stacks
 */

  this.updateNodes = function () {
    for (var i = 0; i < stacks.length; ++i)
    stacks[i].updateNodes();
    return;
  }

/*
 * create a link between two treenodes (join them)
 * toid has to be root of a skeleton
 */
  this.createTreenodeLink = function (fromid, toid) {
    for (var i = 0; i < stacks.length; ++i)
    stacks[i].createTreenodeLink(fromid, toid);
    return;
  }

  /**
   * create a textlabel on the server
   */
  this.createTextlabel = function (tlx, tly, tlz, tlr, scale) {
    icon_text_apply.style.display = "block";
    requestQueue.register('model/textlabel.create.php', 'POST', {
      pid: project.id,
      x: tlx,
      y: tly,
      z: tlz,
      r: parseInt(document.getElementById("fontcolourred").value) / 255,
      g: parseInt(document.getElementById("fontcolourgreen").value) / 255,
      b: parseInt(document.getElementById("fontcolourblue").value) / 255,
      a: 1,
      type: "text",
      scaling: (document.getElementById("fontscaling").checked ? 1 : 0),
      fontsize: (document.getElementById("fontscaling").checked ? Math.max(16 / scale, parseInt(document.getElementById("fontsize").value)) : parseInt(document.getElementById("fontsize").value)) * tlr,
      fontstyle: (document.getElementById("fontstylebold").checked ? "bold" : "")
    }, function (status, text, xml) {
      statusBar.replaceLast(text);

      if (status == 200) {
        icon_text_apply.style.display = "none";
        for (var i = 0; i < stacks.length; ++i) {
          stacks[i].updateTextlabels();
        }
        if (text && text != " ") {
          var e = eval("(" + text + ")");
          if (e.error) {
            alert(e.error);
          } else {}
        }
      }
      return true;
    });
    return;
  }

  /* Implements the key bindings. */
  var onkeydown = function (e) {
    var key;
    var target;
    var shift;
    var alt;
    var ctrl;
    if (e) {
      key = e.which;
      target = e.target;
      shift = e.shiftKey;
      alt = e.altKey;
      ctrl = e.ctrlKey;
    } else if (event && event.keyCode) {
      key = event.keyCode;
      target = event.srcElement;
      shift = event.shiftKey;
      alt = event.altKey;
      ctrl = event.ctrlKey;
    }
    var n = target.nodeName.toLowerCase();
    var fromATextField = false;
    if (n == "input") {
      var inputType = target.type.toLowerCase();
      if (inputType == "text" || inputType == "password") fromATextField = true;
    }
    if (!(fromATextField || n == "textarea" || n == "area")) //!< @todo exclude all useful keyboard input elements e.g. contenteditable...
    {
      keyAction = keyCodeToKeyAction[key];
      if (keyAction) return keyAction.run(e || event);
      return true;
    } else
    return true;
  }


  // initialise
  var self = this;
  this.id = pid;
  if (typeof ui == "undefined") ui = new UI();
  if (typeof requestQueue == "undefined") requestQueue = new RequestQueue();

  var view = document.createElement("div");
  view.className = "projectView";

  view.onselectstart = function() {
      return false;
  }

  var templateView = document.createElement("div");
  templateView.className = "projectTemplateView";

  var dataView = document.createElement("div");
  templateView.className = "projectDataView";

  var editToolbar = document.getElementById("");

/*
  view.appendChild( templateView );
  view.appendChild( dataView );
*/

  this.coordinates = {
    x: 0,
    y: 0,
    z: 0
  };

  var template; //!< DTD like abstract object tree (classes)
  var data; //!< instances in a DOM representation
  var stacks = new Array(); //!< a list of stacks related to the project
  this.focusedStack;

  var editable = false;
  var mode = "move";
  var show_textlabels = true;

  var icon_text_apply = document.getElementById("icon_text_apply");

  //!< associative array of selected objects
  // in the treenode table and object tree
  // (not used for anything sensible right now)
  var selectedObjects = {
    'tree_object': {},
    'table_treenode': {},
    'selectedneuron': null,
    'selectedskeleton': null
  };
  this.selectedObjects = selectedObjects;

}
