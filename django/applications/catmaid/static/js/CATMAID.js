/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  login
*/

/* It's very easy to accidentally leave in a console.log if you're working with
 * Firebug, but this will break CATMAID for some browsers.  If window.console
 * isn't defined, create a noop version of console.log: */
if (!window.console) {
  window.console = {};
  window.console.log = function() {};
}


// Attach a general error handler
window.onerror = function(msg, url, lineno, colno, err)
{
  var userAgent = navigator ? navigator.userAgent : 'N/A';

  var info = 'An error occured in CATMAID and the current action can\'t be ' +
      'completed. You can try to reload the widget or tool you just used.';
  var detail = 'Error: ' + msg + ' URL: ' + url + ' Line: ' + lineno +
      ' Column: ' + colno + ' User agent: ' + userAgent + ' Stacktrace: ' +
      (err ? err.stack : 'N/A');

  // Log the error detail to the console
  console.log(detail);

  // Log the error in the backend, bypass the request queue and make a direct
  // AJAX call through jQuery.
  $.ajax({
    'url': django_url + 'log/error',
    'type': 'POST',
    'data': {
      'msg': detail,
    }
  });

  // Log the error object, if available
  if (err) {
    console.log('Error object:');
    console.log(err);
  } else {
    console.log('No error object was provided');
  }

  // Use alert() to inform the user, if the error function isn't available for
  // some reason
  if (CATMAID && CATMAID.error) {
    CATMAID.error(info, detail);
  } else {
    alert(info + ' Detail: ' + detail);
  }

  // Return true to indicate the exception is handled and doesn't need to be
  // shown to the user.
  return true;
};

// Let user cancel going back in browser history
window.onbeforeunload = function() {
  return "CATMAID's window arrangement and content won't be saved if you continue.";
};


(function(CATMAID)
 {
  CATMAID.MAX_WEBGL_CONTEXTS = 16;  // may change and/or be browser-dependent

  // The UI singleton
  var ui;
  Object.defineProperty(CATMAID, 'ui', {
    get: function() {
      // Initialize the singleton if it doesn't exist, yet
      if (!ui) {
        ui = new CATMAID.UI();
      }
      return ui;
    },
  });

  // Configuration of message position
  var messagePosition = 'tr';
  Object.defineProperty(CATMAID, 'messagePosition', {
    get: function() { return messagePosition; },
    set: function(newValue) {
      var allowedValues = ['tl', 'tr', 'bl', 'br', 'tc', 'bc'];
      if (-1 === allowedValues.indexOf(newValue)) {
        throw new CATMAID.ValueError('Please use one of these values: ' +
            allowedValues.join(','));
      }
      messagePosition = newValue;
    }
  });

  // Configuration of behavior when the (mouse) pointer hovers over a window.
  CATMAID.FOCUS_SAME = 0;
  CATMAID.FOCUS_STACKS = 1;
  CATMAID.FOCUS_ALL = 2;
  var focusBehavior = CATMAID.FOCUS_STACKS;
  Object.defineProperty(CATMAID, 'focusBehavior', {
    get: function() { return focusBehavior; },
    set: function(newValue) {
      var allowedValues = [CATMAID.FOCUS_SAME, CATMAID.FOCUS_STACKS,
          CATMAID.FOCUS_ALL];
      if (-1 === allowedValues.indexOf(newValue)) {
        throw new CATMAID.ValueError('Please use one of these values: ' +
            allowedValues.join(','));
      }
      focusBehavior = newValue;
    }
  });

  /**
   * Return a string version of the input array and replace occurences of "-1"
   * with "All". This is usefule for page length lists.
   */
  CATMAID.getPageLengthLabels = function(options) {
    return options.map(function (n) {
      return -1 === n ? "All" : n.toString();
    });
  };

  /**
   * Convenience function to show a growl message
   */
  CATMAID.msg = function(title, message, options)
  {
    var settings = {
      title: title,
      message: message,
      duration: 3000,
      size: 'large',
      location: messagePosition,
      style: undefined // Gray background by default, alternatives are:
                       // 'error' = red, 'warning' = yellow, 'notice' = green
    };

    // If an alert style wasn't provided, guess from the alert title
    if (!options || !options.style) {
      if (title.match(/error/i)) settings.style = 'error';
      else if (title.match(/warn|beware/i)) settings.style = 'warning';
      else if (title.match(/done|success/i)) settings.style = 'notice';
    }

    $.extend(settings, options);
    $.growl(settings);
  };

  /**
   * Convenience function to show a growl info message.
   */
  CATMAID.info = CATMAID.msg.bind(window, "Information");

  /**
   * Convenience function to show a growl warning message.
   */
  CATMAID.warn = CATMAID.msg.bind(window, "Warning");

  /**
   * Creates a generic JSON response handler that complains when the response
   * status is different from 200 or a JSON error is set.
   *
   * @param success Called on success
   * @param error Called on error
   * @param silent No error dialogs are shown, if true
   */
  CATMAID.jsonResponseHandler = function(success, error, silent)
  {
    return function(status, text, xml) {
      if (status >= 200 && status <= 204 &&
          (typeof text === 'string' || text instanceof String)) {
        // `text` may be empty for no content responses.
        var json = text.length ? JSON.parse(text) : {};
        if (json.error) {
          // Call error handler, if any, and force silence if it returned true.
          if (CATMAID.tools.isFn(error)) {
            silent = error(json) || silent;
          }
          if (!silent) {
            CATMAID.error(json.error, json.detail);
          }
        } else {
          CATMAID.tools.callIfFn(success, json);
        }
      } else {
        var e = {
          error: "An error occured",
          detail: "The server returned an unexpected status: " + status,
          status: status
        };
        // Call error handler, if any, and force silence if it returned true.
        if (CATMAID.tools.isFn(error)) {
          silent = error(e) || silent;
        }
        if (!silent) {
          CATMAID.error(e.msg, e.detail);
        }
      }
    };
  };

  /**
   * Convenience function to show an error dialog.
   */
  CATMAID.error = function(msg, detail)
  {
    new CATMAID.ErrorDialog(msg, detail).show();
  };

  /**
   * Open a state update dialog and send a state update event to update state
   * listeners.
   */
  CATMAID.suggestStateUpdate = function(error) {
    var refresh = CATMAID.State.trigger.bind(CATMAID.State,
        CATMAID.State.EVENT_STATE_NEEDS_UPDATE);
    var dialog = new CATMAID.StateUpdateDialog(error.message,
        error.detail, refresh);
    dialog.show();
  };

  /**
   * Look at the error type and take appropriate action.
   */
  CATMAID.handleError = function(error) {
    if (error instanceof CATMAID.Error) {
      if (error instanceof CATMAID.PermissionError) {
        new CATMAID.LoginDialog(error.error).show();
      } else if (error instanceof CATMAID.CommandHistoryError) {
        CATMAID.warn(error.message);
      } else if (error instanceof CATMAID.StateMatchingError) {
        CATMAID.suggestStateUpdate(error);
      } else {
        CATMAID.error(error.message, error.detail);
      }
    } else if (error instanceof Error) {
      CATMAID.error(error.message, error.stack);
    } else {
      CATMAID.error(error);
    }
  };

  /**
   * Make status information available through the front-ends status bar.
   */
  CATMAID.status = function(msg)
  {
    CATMAID.statusBar.replaceLast(msg);
  };

   /**
    * Return the number of WebGL contexts currently in use.
    *
    * @returns Number
    */
  CATMAID.countWebGlContexts = function() {
    // count the number of pixi layer contexts (i.e. stack viewers) and 3D viewers
    return CATMAID.PixiLayer.contexts.size + CATMAID.WebGLApplication.prototype.getInstances().length;
  };

  // Maintain a single command history, this adds execute, undo and redo
  // functions to the CATMAID namespace. Limit it to 1000 entries for now.
  CATMAID.commands = new CATMAID.CommandHistory(1000);
  CATMAID.commands.on(CATMAID.CommandHistory.EVENT_COMMAND_EXECUTED, function(command, redo) {
    // Don't confirm regular commands to reduce visual noise
    if (redo) {
      CATMAID.msg("Redo successful", command.getName());
    }
  });
  CATMAID.commands.on(CATMAID.CommandHistory.EVENT_COMMAND_UNDONE, function(command) {
    CATMAID.msg("Undo successful", command.getName());
  });

})(CATMAID);
