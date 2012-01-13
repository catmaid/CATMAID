/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * An action represents a command that may be run from a keyboard
 * shortcut or a button press.  These objects encapsulate:
 *   - The keys that are linked to that action
 *   - The help text associated with the action
 *   - The button IDs that can trigger the action
 *   - The tooltips for those buttons
 *   - The function that should be run to carry out the action
 */


function Action (properties) {

  var helpText = "[No help text set]";
  var buttonID = null;
  var buttonName = null;
  var keyShortcuts = {};

  /**
     Add a new key shortcut for this action.  'name' should be a
     string representation of the key, and keyCodes should be an
     array of keyCodes that correspond to that key on various
     browsers.  For example, you might call:
        action.addKey( "+", [107, 61, 187] );
  */
  this.addKey = function( name, keyCodes ) {
    if (keyShortcuts.hasOwnProperty(name)) {
      alert("BUG: replacing the keyCodes for "+name+" with Action.addKey");
    }
    keyShortcuts[name] = keyCodes;
  }

  this.hasButton = function( ) {
    return buttonID !== null;
  }

  this.getKeys = function( ) {
    return keyShortcuts;
  }

  this.getKeyShortcutsString = function( ) {
    result = [];
    for (var name in keyShortcuts) {
      if (keyShortcuts.hasOwnProperty(name)) {
        result.push(name);
      }
    }
    return result.join(', ');
  }

  this.getButtonID = function( ) {
    return buttonID;
  }

  this.getButtonName = function( ) {
    return buttonName;
  }

  this.getHelpText = function( ) {
    return helpText;
  }

  this.setButtonID = function( newButtonID ) {
    buttonID = newButtonID;
  }

  this.setButtonName = function( newButtonName ) {
    buttonName = newButtonName;
  }

  this.setHelpText = function( newHelpText ) {
    helpText = newHelpText;
  }

  this.setRun = function( newRun ) {
    this.run = newRun;
  }

  // -------------------------------------------------------------------

  for (key in properties) {
    if (properties.hasOwnProperty(key)) {
      if (key === 'helpText') {
	this.setHelpText(properties.helpText);
      }
      if (key === 'buttonID') {
	this.setButtonID(properties.buttonID);
      }
      if (key === 'buttonName') {
	this.setButtonName(properties.buttonName);
      }
      if (key === 'keyShortcuts') {
	for (name in properties.keyShortcuts) {
	  if (properties.keyShortcuts.hasOwnProperty(name)) {
	    this.addKey(name, properties.keyShortcuts[name]);
	  }
	}
      }
      if (key === 'run') {
	this.setRun(properties.run);
      }
    }
  }
}

var getKeyCodeToActionMap = function( actionArray ) {
  var i, j, keyCodeToKeyAction = {}, action;
  var keyShortcuts, keyCodes, keyCode;
  for (i = 0; i < actionArray.length; ++i) {
    action = actionArray[i];
    keyShortcuts = action.getKeys();
    for (name in keyShortcuts) {
      if (keyShortcuts.hasOwnProperty(name)) {
	keyCodes = keyShortcuts[name];
	for( j = 0; j < keyCodes.length; ++j ) {
	  keyCode = keyCodes[j];
	  if (keyCodeToKeyAction[keyCode]) {
	    alert("BUG: overwriting action for keyCode " + keyCode + " (via '" + name + "')");
	  }
	  keyCodeToKeyAction[keyCode] = action;
	}
      }
    }
  }
  return keyCodeToKeyAction;
}

/** Updates the 'alt' and 'title' attributes on the toolbar
    icons that are documented with help text and key presses.
    Also bind the onClick action for the link that contains
    those icons to the corresponding function */

function createButtonsFromActions(actions, boxID, iconPrefix) {
  var box, action, a, img, buttonID, title, shorcuts;
  box = $( '<div class="box" id="'+boxID+'"></div>' );
  for (i = 0; i < actions.length; ++i) {
    action = actions[i];
    if (action.hasButton()) {
      buttonID = action.getButtonID();
      a = document.createElement('a');
      a.setAttribute('class', 'button');
      a.setAttribute('id', action.getButtonID());
      a.onclick = action.run;
      img = document.createElement('img');
      img.setAttribute('src', 'widgets/themes/kde/' + iconPrefix + action.getButtonName() + '.png');
      img.setAttribute('alt', action.getHelpText());
      shortcuts = action.getKeyShortcutsString();
      if (shortcuts.length === 0) {
        title = action.getHelpText();
      } else {
        title = shortcuts + ': ' + action.getHelpText();
      }
      img.setAttribute('title', title);
      a.appendChild(img);
      box.append(a);
    }
  }
  return box;
}

// ---------------------------------------------------------------------

/* These actions are kept in separate arrays, since they need to be
 * added to different DIVs in the toolbar. */

var toolActions = [

	new Action({
		helpText: "Switch to the selector tool",
		buttonID: 'edit_button_select',
		buttonName: "select",
		run: function (e) {
			project.setTool( new Selector() );
			return true;
		}
	}),

	new Action({
		helpText: "Switch to the move tool",
		buttonID: 'edit_button_move',
		buttonName: "move",
		run: function (e) {
			project.setTool( new Navigator() );
			return true;
		}
	}),

	new Action({
		helpText: "Show keyboard shortcut help",
		buttonID: 'key_help_button',
		buttonName: "help",
		keyShortcuts: {
			'?': [ 63 ],
			'H': [ 72 ]
		},
		run: function (e) {
			WindowMaker.show('keyboard-shortcuts');
			return true;
		}
	})
];

var editToolActions = [

	new Action({
		helpText: "Text label tool",
		buttonID: 'edit_button_text',
		buttonName: 'text',
		keyShortcuts: {
			'X': [ 88 ]
		},
		run: function (e) {
			project.setMode( 'text' );
			return true;
		}
	}),

	new Action({
		helpText: "Crop tool",
		buttonID: 'edit_button_crop',
		buttonName: 'crop',
		keyShortcuts: {
			'C': [ 67 ]
		},
		run: function (e) {
			project.setMode( 'crop' );
			return true;
		}
	}),

	new Action({
		helpText: "Tracing tool",
		buttonID: 'edit_button_trace',
		buttonName: 'trace',
		keyShortcuts: {
			'G': [ 71 ]
		},
		run: function (e) {
			project.setTool( new TracingTool() );
			return true;
		}
	})

/*
	new Action({
		helpText: "Profile tool",
		keyShortcuts: {
			'F': [ 70 ]
		},
		run: function (e) {
			project.setMode( 'profile' );
			return true;
		}
	})
*/
];

var tracingWindowActions = [

  new Action({
    helpText: "Show treenode table",
    buttonID: "data_button_table_treenode",
    buttonName: 'table',
    run: function (e) {
      WindowMaker.show('node-table');
      return true;
    }
  }),

  new Action({
    helpText: "Show connector table",
    buttonID: "data_button_table_connector",
    buttonName: 'table_connector',
    run: function (e) {
      WindowMaker.show( 'connector-table' );
      return true;
    }
  }),

  new Action({
    helpText: "Show object tree",
    buttonID: "data_button_tree",
    buttonName: 'tree',
    run: function (e) {
      WindowMaker.show('object-tree');
      return true;
    }
  }),

  new Action({
    helpText: "Show search window",
    buttonID: "data_button_search",
    buttonName: 'search',
    keyShortcuts: {
      '/': [ 191, 47 ]
    },
    run: function (e) {
      WindowMaker.show('search');
      return true;
    }
  }),

  new Action({
    helpText: "Show project statistics",
    buttonID: "data_button_stats",
    buttonName: 'stats',
    run: function (e) {
      WindowMaker.show('statistics');
      return true;
    }
  }),

  new Action({
    helpText: "Show 3D canvas view",
    buttonID: "view_3d_button",
    buttonName: '3d-view',
    run: function (e) {
      WindowMaker.show('3d-view');
      return true;
    }
  }),

  new Action({
    helpText: "Show 3D WebGL view",
    buttonID: "view_3d_webgl_button",
    buttonName: '3d-view-webgl',
    run: function (e) {
      WindowMaker.show('3d-webgl-view');
    }
  }),
/*
  new Action({
    helpText: "Show object tree as graph",
    buttonID: "view_objecttree_graph",
    buttonName: 'objecttree-graph',
    run: function (e) {
      window.open("apps/graph/index.html?project_id="+project.id+"&lower_skeleton_count=10", "Wiring diagram");
      return true;
    }
  })
  */
   ];
