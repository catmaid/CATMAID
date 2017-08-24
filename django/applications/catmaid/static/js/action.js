/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

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
  function Action(properties) {

    this.helpText = "[No help text set]";
    this.buttonID = null;
    this.buttonName = null;
    this.iconURL = null;
    this.keyShortcuts = {};

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

  /**
   * Add a new key shortcut for this action. For example, you might call:
   *    action.addKey( "+", ['+'] );
   *
   * @param {string}   name   Display string of the bound key.
   * @param {number[]} keys   Array of key names that will trigger this action.
   */
  Action.prototype.addKey = function (name, keys) {
    if (this.keyShortcuts.hasOwnProperty(name)) {
      CATMAID.warn("Replacing the key for " + name + " with Action.addKey");
    }
    this.keyShortcuts[name] = keys;
  };

  Action.prototype.hasButton = function () {
    return this.buttonID !== null;
  };

  Action.prototype.getKeys = function () {
    return this.keyShortcuts;
  };

  Action.prototype.getKeyShortcutsString = function () {
    var result = [];
    for (var name in this.keyShortcuts) {
      if (this.keyShortcuts.hasOwnProperty(name)) {
        result.push(name);
      }
    }
    return result.join(', ');
  };

  Action.prototype.getButtonID = function () {
    return this.buttonID;
  };

  Action.prototype.getButtonName = function () {
    return this.buttonName;
  };

  Action.prototype.getIconURL = function () {
    return this.iconURL;
  };

  Action.prototype.getHelpText = function () {
    return this.helpText;
  };

  Action.prototype.setButtonID = function (newButtonID) {
    this.buttonID = newButtonID;
  };

  Action.prototype.setButtonName = function (newButtonName) {
    this.buttonName = newButtonName;
  };

  Action.prototype.setIconURL = function (newIconURL) {
    this.iconURL = newIconURL;
  };

  Action.prototype.setHelpText = function (newHelpText) {
    this.helpText = newHelpText;
  };

  Action.prototype.setRun = function (newRun) {
    this.run = newRun;
  };


  var getKeyToActionMap = function( actionArray ) {
    var keyToKeyAction = {};
    for (var i = 0; i < actionArray.length; ++i) {
      var action = actionArray[i];
      var keyShortcuts = action.getKeys();
      for (var name in keyShortcuts) {
        if (keyShortcuts.hasOwnProperty(name)) {
          var keys = keyShortcuts[name];
          for(var j = 0; j < keys.length; ++j) {
            var key = CATMAID.UI.normalizeKeyCombo(keys[j]);
            if (keyToKeyAction[key]) {
              CATMAID.warn("Overriding action for key " + key + " (via '" + name + "')");
            }
            keyToKeyAction[key] = action;
          }
        }
      }
    }
    return keyToKeyAction;
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
      helpText: "Open new widget",
      buttonID: 'edit_button_newwidget',
      buttonName: "newwindow",
      run: function (e) {
        var dialog = new CATMAID.OpenWidgetDialog();
        dialog.show();
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
        'F1': [ 'F1' ]
      },
      run: function (e) {
        WindowMaker.show('keyboard-shortcuts');
        return true;
      }
    }),
  ];

  // Make Action available in CATMAID namespace
  CATMAID.Action = Action;
  CATMAID.getKeyToActionMap = getKeyToActionMap;
  CATMAID.createButtonsFromActions = createButtonsFromActions;

})(CATMAID);
