/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * container for generic user interface actions
   */
  CATMAID.UI = function()
  {
    var self = this;

    var screenWidth = 0;
    var screenHeight = 0;

    var leftMouseDown = false;
    var rightMouseDown = false;
    var shiftKeyDown = false;
    var ctrlKeyDown = false;
    var altKeyDown = false;
    var contextMenuEnabled = false;
    var checkboxToggler = null;
    var lastX = 0;
    var lastY = 0;
    var x = 0;
    var y = 0;

    // Keep track of already pressed keys
    var currentSequence = new Set();

    var events = {};
    events[ "onpointermove" ] = []; //!< bound to eventCatcher
    events[ "onpointerdown" ] = [];
    events[ "onpointerup" ] = []; //!< bound to eventCatcher
    events[ "onwheel" ] = [];
    events[ "onresize" ] = [];    //!< bound to the window itself

    var eventCatcher = document.createElement( "div" );
    eventCatcher.id = "eventCatcher";
    document.body.appendChild( eventCatcher );

    /* The focus catcher is used as a focus target when the active element should
     * be un-focused. It is required to have a 'href' attribute. Otherwise, a
     * focus() call will not succeed. */
    var focusCatcher = document.createElement( "a" );
    focusCatcher.id = "focusCatcher";
    focusCatcher.setAttribute('draggable', 'false');
    document.body.appendChild( focusCatcher );

    /**
     * Return the result of the target's handleKeyUp() function if <released> is
     * truthy, otherwise return the result of its handleKeyPress() function. If
     * the respective function doesn't exist, return false.
     */
    var handledBy = function(target, event, released) {
      if (released) {
        if (CATMAID.tools.isFn(target.handleKeyUp)) {
          return target.handleKeyUp(event);
        }
      } else {
        if (CATMAID.tools.isFn(target.handleKeyPress)) {
          return target.handleKeyPress(event);
        }
      }
      return false;
    };

    // This list contains ket names that shouldn't be tracked on their own for
    // key combination sequences.
    var notRecordedKeyNames = new Set(["Alt", "Control", "Escape", "Meta", "Shift"]);

    /**
     * Deal wit/h key press and release in one function. If <released> is falsy,
     * the keydown handler will be called, otherwise,
     */
    var handleKeyAction = function( e, released ) {
      if (!e) {
        throw new CATMAID.ValueError("No event provided");
      }
      released = !!released;
      var projectKeyPress;
      var key;
      var keyAction;

      // The event object can't be modified directly. To be able to do this, a
      // new event object is created. The data we need is copied over.
      var fakeEvent = {};
      fakeEvent.key = e.key;
      fakeEvent.code = e.code;
      fakeEvent.shiftKey = e.shiftKey;
      fakeEvent.altKey = e.altKey;
      fakeEvent.ctrlKey = e.ctrlKey;
      fakeEvent.metaKey = e.metaKey;
      fakeEvent.repeat = e.repeat;
      fakeEvent.target = CATMAID.UI.getTargetElement(e);

      var shift = e.shiftKey;
      var alt = e.altKey;
      var ctrl = e.ctrlKey;
      var meta = e.metaKey;

      // Track key events as long as key down events or ESC removes them from
      // stack.
      if (e.key === 'Escape') {
        currentSequence.clear();
      } else {
        var keyName = CATMAID.UI.normalizeKeyComponents(fakeEvent).key;
        if (!notRecordedKeyNames.has(keyName)) {
          if (released) {
            // It would be nice if we could reliably remove only the key name
            // for the sequence, but unfortunately we have to consider the
            // sequence as broken with the first key release, because it might
            // change the key name (Shift + A) -> (release Shift) -> (a).
            // Therefore, just clearing the sequence seems more robust.
            currentSequence.clear();
          } else {
            currentSequence.add(keyName);
          }
        }
      }

      var propagate = true;

      var n = fakeEvent.target.nodeName.toLowerCase();
      var fromATextField = fakeEvent.target.getAttribute('contenteditable');
      if (n === "input") {
        var inputType = fakeEvent.target.type.toLowerCase();
        if (inputType !== 'checkbox' && inputType !== 'button') {
          fromATextField = true;
        }
      }
      if (meta) {
        // Don't intercept command-key events on Mac.
        propagate = true;
      }
      if (!(fromATextField || n == "textarea" || n == "area"))
      {
        // Let UI actions in closure only deal with key-down events.
        if (!released && handleKeyPress(fakeEvent, currentSequence)) {
          propagate = false;
        }

        // Try to handle key in this order: active widget, tool, project
        var activeWidget = CATMAID.front();
        if (activeWidget && handledBy(activeWidget, fakeEvent, released)) {
          propagate = false;
        }
        if (project) {
          var tool = project.getTool();
          if (tool && handledBy(tool, fakeEvent, released)) {
            propagate = false;
          }
          if (handledBy(project, fakeEvent, released)) {
            propagate = false;
          }
        } else if (handledBy(CATMAID.client, fakeEvent, released)) {
          propagate = false;
        }
      }

      // If the event was handled, prevent the browser's default action.
      if (!propagate) {
        e.preventDefault();
      }

      // Note that there are two different conventions for return values here:
      // the handleKeyPress() methods return true if the event has been dealt
      // with (i.e. it should not be propagated) but the onkeydown function
      // should only return true if the event should carry on for default
      // processing.
      return propagate;
    };

    var onkeydown = function( e ) {
      return handleKeyAction(e, false);
    };

    var onkeyup = function( e ) {
      return handleKeyAction(e, true);
    };

    // A set of available global actions
    var lastUndoTimestamp = 0;
    var UNDO_RATE_LIMIT = 500; // In milliseconds.
    var actions = [
      new CATMAID.Action({
        helpText: "Undo last command on history stack",
        keyShortcuts: {
          'Z': [ 'Ctrl + z' ]
        },
        run: function (e) {
          if (e.ctrlKey) {
            var time = Date.now();
            if (!e.repeat || (time - lastUndoTimestamp) > UNDO_RATE_LIMIT) {
              lastUndoTimestamp = time;
              CATMAID.commands.undo()
                .catch(CATMAID.handleError);
            }
            return true;
          }
          return false;
        }
      }),
      new CATMAID.Action({
        helpText: "Open widget",
        keyShortcuts: {
          'SPACE': [ 'Ctrl +  ' ]
        },
        run: function (e, sequence) {
          // Handle Ctrl + Space only if nothing else is pressed
          if (sequence.size > 1) {
            return false;
          }
          // Only if Ctrl + Space is pressed, the dialog will be shown
          if (e.ctrlKey) {
            var dialog = new CATMAID.OpenWidgetDialog();
            dialog.show();
            return true;
          }
          return false;
        }
      })
    ];

    /**
     * This function should return true if there was any action linked to the
     * key code, or false otherwise.
     */
    var keyToAction = CATMAID.getKeyToActionMap(actions);
    var handleKeyPress = function( e, sequence ) {

      var keyAction = CATMAID.UI.getMappedKeyAction(keyToAction, e);
      if (keyAction) {
        return keyAction.run(e, sequence);
      } else {
        return false;
      }
    };

    var updateFrameHeight = function()
    {
      if ( window.innerHeight ) screenHeight = window.innerHeight;
      else
      {
        if ( document.documentElement && document.documentElement.clientHeight )
          screenHeight = document.documentElement.clientHeight;
        else if ( document.body && document.body.clientHeight )
          screenHeight = document.body.clientHeight;
      }
      return;
    };

    var updateFrameWidth = function()
    {
      if ( window.innerWidth ) screenWidth = window.innerWidth;
      else
      {
        if ( document.documentElement && document.documentElement.clientWidth )
          screenWidth = document.documentElement.clientWidth;
        else if ( document.body && document.body.clientWidth )
          screenWidth = document.body.clientWidth;
      }
      return;
    };

    /**
     * set the cursor style
     */
    this.setCursor = function(
        c   //!< string cursor
    )
    {
      eventCatcher.style.cursor = c;
      return;
    };

    /**
     * add a function to an event's queue
     */
    this.registerEvent = function(
        e,    //!< event
        h   //!< handler function
    )
    {
      events[ e ].push( h );
      return;
    };

    /**
     * remove a function from an event's queue
     */
    this.removeEvent = function(
        e,    //!< event
        h   //!< handler function
    )
    {
      for ( var i = 0; i < events[ e ].length; ++i )
      {
        if ( events[ e ][ i ] == h )
        {
          events[ e ].splice( i, 1 );
          break;
        }
      }
      return;
    };
    /**
     * clear an event's queue
     */
    this.clearEvent = function(
        e   //!< event
    )
    {
      delete events[ e ];
      events[ e ] = [];
    };

    this.getFrameWidth = function()
    {
      return screenWidth;
    };

    this.getFrameHeight = function()
    {
      return screenHeight;
    };

    this.onblur = function(e) {
      // Reset key sequence tracker. Without this we potentially wouldn't
      // receive keyup events.
      currentSequence.clear();
    };

    this.onresize = function( e )
    {
      try // IE fails if window height <= 0
      {
        updateFrameHeight();
        updateFrameWidth();
      }
      catch ( exception ) {}

      var r = true;

      for ( var i = 0; i < events[ "onresize" ].length; ++i )
        r = r && events[ "onresize" ][ i ]( e );

      return r;
    };

    /**
     * get the pointer button normalized to gecko enumeration
     * 1 - left
     * 2 - middle
     * 3 - right
     */
    this.getMouseButton = function( e )
    {
      var which;
      if ( e && e.which )
      {
        which = e.which;
      }
      else if ( !( typeof event === "undefined" || event === null || event.button ) )
      {
        which = event.button;
        if ( which == 2 ) which = 3;  //!< right
        if ( which == 4 ) which = 2;  //!< middle
      }

      return which;
    };

    /**
     * get the direction of the mousewheel
     *  1 - up
     * -1 - down
     */
    this.getMouseWheel = function( e )
    {
      if ( e )
        return ((e.deltaX + e.deltaY) > 0 ? 1 : -1);
      else
        return undefined;
    };

    /**
     * get the pointer location absolute and relative to the element, which fired the event
     */
    this.getMouse = function( e, relativeTo, propagate )
    {
      var realPagePosition = CATMAID.UI.getRealPagePosition(e);
      var offset;
      var target;
      propagate = (typeof propagate == "undefined") ? false : propagate;
      var m = {};
      m.x = realPagePosition.x;
      m.y = realPagePosition.y;
      if (relativeTo) {
        offset = $(relativeTo).offset();
        m.offsetX = m.x - offset.left;
        m.offsetY = m.y - offset.top;
      }
      if ( e )
      {
        if (!propagate) {
          e.preventDefault();
        }
      }
      else if ( event )
      {
        if (!propagate) {
          event.cancelBubble = true;
        }
      }
      else {
        m = undefined;
      }
      m.target = CATMAID.UI.getTargetElement(e || event);
      return m;
    };

    this.onpointermove = function( e )
    {
      var m = self.getMouse(e);
      if ( m )
      {
        self.diffX = m.x - lastX;
        self.diffY = m.y - lastY;
        lastX = m.x;
        lastY = m.y;

        var r = true;
        for ( var i = 0; r && i < events[ "onpointermove" ].length; ++i )
          r = events[ "onpointermove" ][ i ]( e );

        return r;
      }
      else return false;
    };

    this.onpointerdown = function( e )
    {
      var m = self.getMouse(e);
      if ( m )
      {
        lastX = m.x;
        lastY = m.y;
        self.diffX = 0;
        self.diffY = 0;

        var which = self.getMouseButton( e );

        if ( which )
        {
          switch ( which )
          {
          case 1:
            leftMouseDown = true;
            break;
          case 3:
            rightMouseDown = true;
            break;
          }
        }

        var r = true;
        for ( var i = 0; i < events[ "onpointerdown" ].length; ++i )
          r = r && events[ "onpointerdown" ][ i ]( e );

        return r;
      }
      else return;
    };

    this.onpointerup = function( e )
    {
      var m = self.getMouse(e);
      if ( m )
      {
        lastX = m.x;
        lastY = m.y;
        self.diffX = 0;
        self.diffY = 0;

        var which = self.getMouseButton( e );

        if ( which )
        {
          switch ( which )
          {
          case 1:
            leftMouseDown = false;
            break;
          case 3:
            rightMouseDown = false;
            break;
          }
        }

        var r = true;
        for ( var i = 0; i < events[ "onpointerup" ].length; ++i )
          r = r && events[ "onpointerup" ][ i ]( e );
        return r;
      }
      else return;
    };

    /**
     * catch pointer and keyboard events
     *
     * @todo recognise pointer button, catch keyboard events
     */
    this.catchEvents = function(
        c     //!< optional cursor style
    )
    {
      if ( c ) eventCatcher.style.cursor = c;
      eventCatcher.style.display = "block";
      return;
    };

    /**
     * release pointer and keyboard events
     */
    this.releaseEvents = function()
    {
      eventCatcher.style.cursor = "auto";
      eventCatcher.style.display = "none";
      return;
    };

    /**
     * catch focus which might be at a form element or an arbitrary anchor
     */
    this.catchFocus = function()
    {
      focusCatcher.focus();
    };


    this.dispatchEvent = function(event) {
      return eventCatcher.dispatchEvent(event);
    };

    /**
     * Toggle the display of an overlay over all of the front end that allows
     * users to draw a rectangle with their pointer under which all checkboxes will
     * be toggled.
     */
    this.toggleRectCheckboxSelect = function(checkOnly) {
      if (checkboxToggler && checkboxToggler.active) {
        checkboxToggler.destroy();
        checkboxToggler = null;
      } else {
        checkboxToggler = new CATMAID.RectCheckboxSelector({
          checkOnly: checkOnly
        });
        checkboxToggler.init();
      }
    };

    /**
     * Enables or disables the browser context menu.
     */
    this.setContextMenuEnabled = function(enabled) {
      contextMenuEnabled = enabled;
      if (enabled) {
        eventCatcher.oncontextmenu = null;
      } else {
        eventCatcher.oncontextmenu = function(e) {
          return false;
        };
      }
    };

    this.setContextMenuEnabled(contextMenuEnabled);

    window.onblur = this.onblur;
    window.onresize = this.onresize;
    window.onresize();

    eventCatcher.onpointerdown = self.onpointerdown;
    eventCatcher.onpointermove = self.onpointermove;

    eventCatcher.onpointerout = self.onpointerup;
    eventCatcher.onpointerup = self.onpointerup;
    eventCatcher.onpointerleave = self.onpointerup;
    eventCatcher.onpointercancel = self.onpointerup;

    // Register global key listener
    document.onkeydown = onkeydown;
    document.onkeyup = onkeyup;
  };

  /**
   * Map a key combination to a standard key value. This will for instance
   * map 'shift + a' to A. For a list of key values
   * see: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
   */
  CATMAID.UI.makeKeyValueMap = function(keyCombo) {
    var map = new Map([
      // Symbols:
      ['Shift + `',  '~'],
      ['Shift + 1',  '!'],
      ['Shift + 2',  '@'],
      ['Shift + 3',  '#'],
      ['Shift + 4',  '$'],
      ['Shift + 5',  '%'],
      ['Shift + 6',  '^'],
      ['Shift + 7',  '&'],
      ['Shift + 8',  '*'],
      ['Shift + 9',  '('],
      ['Shift + 0',  ')'],
      ['Shift + -',  '_'],
      ['Shift + =',  '+'],
      ['Shift + [',  '{'],
      ['Shift + ]',  '}'],
      ['Shift + \\', '|'],
      ['Shift + ;',  ':'],
      ['Shift + \'', '"'],
      ['Shift + ,',  '<'],
      ['Shift + .',  '>'],
      ['Shift + /',  '?'],
    ]);

    // a-z -> A-Z
    for (var keyCode = 65, max = 90; keyCode <= max; keyCode += 1) {
      var keyValue = String.fromCharCode(keyCode + 32);
      var capitalKeyValue = String.fromCharCode(keyCode);
      map.set('Shift + ' + keyValue, capitalKeyValue);
    }

    // On Mac OS pressing Alt together with another key produces a different
    // character than the key without modifiers. The key referenced in the key
    // field of the event object reflects that. Make it so that these characters
    // are replaced by the plain key as it is the default on Linux and Windows.
    map.set('Alt + ¡', '1');
    map.set('Alt + ™', '2');
    map.set('Alt + €', '2');
    map.set('Alt + £', '3');
    map.set('Alt + #', '3');
    map.set('Alt + ¢', '4');
    map.set('Alt + ∞', '5');
    map.set('Alt + §', '6');
    map.set('Alt + ¶', '7');
    map.set('Alt + •', '8');
    map.set('Alt + ª', '9');
    map.set('Alt + º', '0');
    map.set('Alt + –', '-');
    map.set('Alt + ≠', '=');
    map.set('Alt + œ', 'q');
    map.set('Alt + ∑', 'w');
    map.set('Alt + ´', 'e');
    map.set('Alt + ®', 'r');
    map.set('Alt + †', 't');
    map.set('Alt + ¥', 'y');
    map.set('Alt + ¨', 'u');
    map.set('Alt + ˆ', 'i');
    map.set('Alt + ø', 'o');
    map.set('Alt + π', 'p');
    map.set('Alt + “', '[');
    map.set('Alt + ‘', ']');
    map.set('Alt + «', '\\');
    map.set('Alt + å', 'a');
    map.set('Alt + ß', 's');
    map.set('Alt + ∂', 'd');
    map.set('Alt + ƒ', 'f');
    map.set('Alt + ©', 'g');
    map.set('Alt + ˙', 'h');
    map.set('Alt + ∆', 'j');
    map.set('Alt + ˚', 'k');
    map.set('Alt + ¬', 'l');
    map.set('Alt + …', ';');
    map.set('Alt + æ', '\'');
    map.set('Alt + Ω', 'z');
    map.set('Alt + ≈', 'x');
    map.set('Alt + ç', 'c');
    map.set('Alt + √', 'v');
    map.set('Alt + ∫', 'b');
    map.set('Alt + ˜', 'n');
    map.set('Alt + µ', 'm');
    map.set('Alt + ≤', ',');
    map.set('Alt + ≥', '.');
    map.set('Alt + ÷', '/');

    return map;
  };

  CATMAID.UI.keyValueMap = CATMAID.UI.makeKeyValueMap();

  CATMAID.UI.getKeyValueComponents = function(keyCombo) {
    // 'Alt' and 'Ctrl' have no effect on a key'
    var noAltKeyCombo = keyCombo.replace(/[Aa]lt \+ ?/g, '');
    var altKey = keyCombo.length !== noAltKeyCombo.length;
    var noCtrlKeyCombo = noAltKeyCombo.replace(/[Cc]trl \+ ?/g, '');
    var ctrlKey = noAltKeyCombo.length !== noCtrlKeyCombo.length;
    var noMetaKeyCombo = noCtrlKeyCombo.replace(/[Mm]eta \+ ?/g, '');
    var metaKey = noCtrlKeyCombo.length !== noMetaKeyCombo.length;
    var noShiftKeyCombo = noMetaKeyCombo.replace(/Shift \+ ?/g, '');
    var shiftKey = noMetaKeyCombo.length !== noShiftKeyCombo.length;

    return {
      key: noShiftKeyCombo,
      altKey: altKey,
      ctrlKey: ctrlKey,
      metaKey: metaKey,
      shiftKey: shiftKey,
    };
  };

  /**
   * Normalize a key combination string so that modifiers (Alt, Crtl,
   * Shift) are first and sorted alphabetically and appear only once. Also,
   * known key combinations like 'Shift a' or 'Shift 3' are mapped to 'A' and
   * '#' respectively (matches US layout).
   */
  CATMAID.UI.normalizeKeyCombo = function(keyCombo) {
    var components = CATMAID.UI.getKeyValueComponents(keyCombo);
    var normalizedComponents = CATMAID.UI.normalizeKeyComponents(components);
    return CATMAID.UI.toKeyCombo(normalizedComponents);
  };

  CATMAID.UI.normalizeKeyComponents = function(components) {
    var keyValue = components.key;

    // Special case: numpad delete will produce a single character string with
    // UTF-16 code 0 (without numlock enabled). Make this a regular delete.
    if (components.code === 'NumpadDecimal' && components.key === '\0') {
      keyValue = 'Delete';
    }

    if (components.shiftKey || components.altKey) {
      var keyCombo = CATMAID.UI.toKeyCombo({
        key: components.key,
        shiftKey: components.shiftKey,
        altKey: components.altKey
      });
      keyValue = CATMAID.UI.keyValueMap.get(keyCombo);
      if (!keyValue) {
        keyValue = components.key;
      }
    }

    return {
      key: keyValue,
      altKey: components.altKey,
      ctrlKey: components.ctrlKey,
      metaKey: components.metaKey,
      shiftKey: components.shiftKey
    };
  };

  /**
   * Return a key combination string based on a set of components.
   */
  CATMAID.UI.toKeyCombo = function(components) {
    return (components.altKey && components.key !== "Alt" ? "Alt + " : "") +
           (components.ctrlKey && components.key !== "Ctrl" && components.key !== "Control" ? "Ctrl + " : "") +
           (components.metaKey && components.key !== "Meta" ? "Meta + " : "") +
           (components.shiftKey && components.key !== "Shift" ? "Shift + " : "") +
           components.key;
  };

  /**
   * Return the mapped action for an unnormailized component object.
   */
  CATMAID.UI.getMappedKeyAction = function(map, components) {
    var normalizedComponents = CATMAID.UI.normalizeKeyComponents(components);
    return map[CATMAID.UI.toKeyCombo(normalizedComponents)];
  };

  CATMAID.UI.getFrameHeight = function()
  {
    try
    {
      if (window.innerHeight)
        return window.innerHeight;
      else {
        if (document.documentElement && document.documentElement.clientHeight)
          return document.documentElement.clientHeight;
        else
          if (document.body && document.body.clientHeight)
            return document.body.clientHeight;
      }
      return 0;
    }
    catch ( exception ) { return 0; }
  };

  CATMAID.UI.getFrameWidth = function()
  {
    try
    {
      if (window.innerWidth)
        return window.innerWidth;
      else {
        if (document.documentElement && document.documentElement.clientWidth)
          return document.documentElement.clientWidth;
        else
          if (document.body && document.body.clientWidth)
            return document.body.clientWidth;
      }
      return 0;
    }
    catch ( exception ) { return 0; }
  };

  CATMAID.UI.getRealPagePosition = function (e) {
    // This function is taken from:
    //    http://www.quirksmode.org/js/events_properties.html#position
    var posx = 0;
    var posy = 0;
    if (!e)
      var e = window.event;
    if (e.pageX || e.pageY) {
      posx = e.pageX;
      posy = e.pageY;
    } else if (e.clientX || e.clientY) {
      posx = e.clientX + document.body.scrollLeft
        + document.documentElement.scrollLeft;
      posy = e.clientY + document.body.scrollTop
        + document.documentElement.scrollTop;
    }
    // posx and posy contain the pointer position relative to the document
    return {'x': posx, 'y': posy};
  };

  CATMAID.UI.getTargetElement = function (e) {
    var target;
    // This logic is from:
    // http://www.quirksmode.org/js/events_properties.html#target
    if (e.target)
      target = e.target;
    else if (e.srcElement)
      target = e.srcElement;
    if (target.nodeType == 3) // defeat Safari bug
      target = target.parentNode;
    return target;
  };

  /**
   * Global pointer position tracker.
   * @return {{x: number, y: number}} Mouse coordinates of the last bubbled event.
   */
  CATMAID.UI.getLastMouse = function () {
    var x = 0, y = 0;

    $(document).mousemove(function (e) {
      e = e || window.event;
      x = e.pageX || e.clientX;
      y = e.pageY || e.clientY;
    });

    return function () {
      // Return a copy to prevent mutation.
      return {x: x, y: y};
    };
  }();

})(CATMAID);
