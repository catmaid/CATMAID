/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * An action represents a command that may be run from a keyboard
   * shortcut or a button press.  These objects encapsulate:
   *   - The keys that are linked to that action
   *   - The help text associated with the action
   *   - The button IDs that can trigger the action
   *   - The tooltips for those buttons
   *   - An optional explicit icon URL
   *   - The function that should be run to carry out the action
   */


  function Action (properties) {

    var helpText = "[No help text set]";
    var buttonID = null;
    var buttonName = null;
    var iconURL = null;
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
    };

    this.hasButton = function( ) {
      return buttonID !== null;
    };

    this.getKeys = function( ) {
      return keyShortcuts;
    };

    this.getKeyShortcutsString = function( ) {
      var result = [];
      for (var name in keyShortcuts) {
        if (keyShortcuts.hasOwnProperty(name)) {
          result.push(name);
        }
      }
      return result.join(', ');
    };

    this.getButtonID = function( ) {
      return buttonID;
    };

    this.getButtonName = function( ) {
      return buttonName;
    };

    this.getIconURL = function( ) {
      return iconURL;
    };

    this.getHelpText = function( ) {
      return helpText;
    };

    this.setButtonID = function( newButtonID ) {
      buttonID = newButtonID;
    };

    this.setButtonName = function( newButtonName ) {
      buttonName = newButtonName;
    };

    this.setIconURL = function( newIconURL ) {
      iconURL = newIconURL;
    };

    this.setHelpText = function( newHelpText ) {
      helpText = newHelpText;
    };

    this.setRun = function( newRun ) {
      this.run = newRun;
    };

    // -------------------------------------------------------------------

    for (var key in properties) {
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
        if (key === 'iconURL') {
          this.setIconURL(properties.iconURL);
        }
        if (key === 'keyShortcuts') {
          for (var name in properties.keyShortcuts) {
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
      for (var name in keyShortcuts) {
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
  };

  /** Updates the 'alt' and 'title' attributes on the toolbar
      icons that are documented with help text and key presses.
      Also bind the onClick action for the link that contains
      those icons to the corresponding function */

  function createButtonsFromActions(actions, boxID, iconPrefix) {
    var box, action, a, img, buttonID, title, shortcuts;
    box = $( '<div class="box" id="'+boxID+'"></div>' );
    for (var i = 0; i < actions.length; ++i) {
      action = actions[i];
      if (action.hasButton()) {
        buttonID = action.getButtonID();
        a = document.createElement('a');
        a.setAttribute('class', 'button');
        a.setAttribute('id', buttonID);
        a.onclick = action.run;

        img = document.createElement('img');
        img.setAttribute('id', buttonID + '_img');
        // Prioritize an explicit icon URL
        var iconFilename = action.getIconURL();
        if (iconFilename) {
          img.setAttribute('src', iconFilename);
        } else {
          iconFilename = CATMAID.makeStaticURL('images/' + iconPrefix +
              action.getButtonName());
          img.setAttribute('src', iconFilename + '.svg');
          // If an SVG icon is not found, fallback to a PNG icon
          img.setAttribute('onerror', 'this.onerror = null; this.src="' + iconFilename + '.png";');
        }
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

  CATMAID.toolActions = [

    new Action({
      helpText: "Switch to the selector tool",
      buttonID: 'edit_button_select',
      buttonName: "select",
      run: function (e) {
        project.setTool( new CATMAID.Selector() );
        return true;
      }
    }),

    new Action({
      helpText: "Switch to the move tool",
      buttonID: 'edit_button_move',
      buttonName: "move",
      run: function (e) {
        project.setTool( new CATMAID.Navigator() );
        return true;
      }
    }),

    new Action({
      helpText: "Show settings",
      buttonID: 'settings_button',
      buttonName: "settings",
      run: function (e) {
      WindowMaker.show('settings');
        return true;
      }
    }),

    new Action({
      helpText: "Show keyboard shortcut help",
      buttonID: 'key_help_button',
      buttonName: "help",
      keyShortcuts: {
        'F1': [ 112 ]
      },
      run: function (e) {
        WindowMaker.show('keyboard-shortcuts');
        return true;
      }
    }),
  ];

  // Make Action available in CATMAID namespace
  CATMAID.Action = Action;
  CATMAID.getKeyCodeToActionMap = getKeyCodeToActionMap;
  CATMAID.createButtonsFromActions = createButtonsFromActions;

})(CATMAID);
