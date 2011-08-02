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
    var buttonIDs = [];
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
	    alert("BUG: reaplcing the keyCodes for "+name+" with Action.addKey");
	}
	keyShortcuts[name] = keyCodes;
    }

    this.getKeys = function( ) {
	return keyShortcuts
    }

    this.getButtonIDs = function( ) {
	return buttonIDs;
    }

    /**
       Add an array of button IDs, for example:
         action.addButtonIDs(['trace_button_togglelabels')
    */
    this.addButtonIDs = function( newButtonIDs ) {
	buttonIDs.push( newButtonIDs );
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
	    if (key === 'buttonIDs') {
		this.addButtonIDs(properties.buttonIDs);
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
			alert("BUG: overwriting action for keyCode " + k + " (via '" + name + "')");
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

function setButtonClicksFromActions(actions) {
    var i, j, buttonIDs, buttonID;
    for (i = 0; i < actions.length; ++i) {
	action = actions[i];
	buttonIDs = actions.getButtonIDs();
	for(j = 0; j < buttonIDs.length; ++j ) {
	    buttonID = buttonIDs[j];
	    var link = $('#' + buttonID);
	    link.attr('href', 'foo');
	    link.click(o.run);
	    var img = link.find('img');
	    img.attr('alt', o.helpText);
	    var title = i + ': ' + o.helpText;
	    img.attr('title', title);
	}
    }
}
