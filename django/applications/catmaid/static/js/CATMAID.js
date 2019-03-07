/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function() {

  "use strict";

  function handleUnhandledError(err, detail) {
    // If this error is due to missing network access, handle it differently.
    if (err instanceof CATMAID.NetworkAccessError) {
      if (CATMAID) {
        CATMAID.verifyNetworkAccess(err.message);
        CATMAID.warn('No network access');
        return;
      }
    }
    console.group("Unhandled CATMAID error");
    // Log the error detail to the console
    console.log(detail);

    // Log the error object, if available
    if (err) {
      console.log('Error object:');
      console.log(err);
    } else {
      console.log('No error object was provided');
    }

    console.groupEnd();

    // Log the error in the backend, bypass the request queue and make a direct
    // AJAX call through jQuery.
    $.ajax({
      'url': django_url + 'log/error',
      'type': 'POST',
      'data': {
        'msg': detail,
      }
    });

    var generalErrorMessage = 'An error occured in CATMAID and the current ' +
        'action can\'t be completed. You can try to reload the widget or ' +
        'tool you just used.';

    // Use alert() to inform the user, if the error function isn't available for
    // some reason
    if (CATMAID && CATMAID.error) {
      CATMAID.error(generalErrorMessage, detail);
    } else {
      alert(generalErrorMessage + ' Detail: ' + detail);
    }
  }

  // Attach a general error handler
  window.onerror = function(msg, url, lineno, colno, err) {
    var userAgent = navigator ? navigator.userAgent : 'N/A';
    var detail = 'Error: ' + msg + ' URL: ' + url + ' Line: ' + lineno +
        ' Column: ' + colno + ' User agent: ' + userAgent + ' Stacktrace: ' +
        (err ? err.stack : 'N/A');

    handleUnhandledError(err, detail);

    // Return true to indicate the exception is handled and doesn't need to be
    // shown to the user.
    return true;
  };

  // Catch unhandled rejected promises. At the time of writing only Chromium
  // based browsers (like Chrome) have native suport for this.
  window.addEventListener('unhandledrejection', function handleRejection(event) {
    var reason = event.reason || {};
    var userAgent = navigator ? navigator.userAgent : 'N/A';
    var detail = 'Error: ' + reason.message + ' User agent: ' + userAgent +
        ' Stacktrace: ' + reason.stack;

    // We take care of the logging ourselves
    event.preventDefault();

    handleUnhandledError(event.promise, detail);

    return true;
  });

  // Let user cancel going back in browser history
  window.onbeforeunload = function() {
    return "CATMAID's window arrangement and content won't be saved if you continue.";
  };

})();

(function(CATMAID) {

  "use strict";

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
   * with "All". This is useful for page length lists.
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
   * Warn about network access errors in the status bar, and check every second
   * if network access is back.
   */
  CATMAID.verifyNetworkAccess = (function() {
    var NETWORK_ACCESS_TEST_INTERVAL = 500;
    var networkTestTimeout;
    var warningSet = false;
    var test = function(errorMessage) {
      // If the back-end is not accessible, set a status bar warning and
      // test again periodically. Otherwise, clear the warning.
      CATMAID.testNetworkAccess()
        .then(function(accessible) {
          if (accessible) {
            if (warningSet) {
              CATMAID.statusBar.unsetWarning();
              CATMAID.statusBar.replaceLast('Network accessible again');
              CATMAID.msg('Success', 'Network accessible again');
              warningSet = false;
            }
            networkTestTimeout = undefined;
          } else {
            if (!warningSet) {
              CATMAID.statusBar.setWarning(errorMessage || "No network connection");
              warningSet = true;
            }
            networkTestTimeout = window.setTimeout(test, NETWORK_ACCESS_TEST_INTERVAL);
          }
        })
        .catch(CATMAID.handleError);
    };
    return function(errorMessage) {
      // Only start monitoring if no timeout is already active
      if (!networkTestTimeout) {
        networkTestTimeout = window.setTimeout(test.bind(window, errorMessage),
            NETWORK_ACCESS_TEST_INTERVAL);
      }
    };
  })();

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
      } else if (error instanceof CATMAID.TooManyWebGlContextsError) {
        new CATMAID.TooManyWebGlContextsDialog(error.message, error.detail).show();
      } else if (error instanceof CATMAID.NetworkAccessError) {
        CATMAID.warn('No network access');
        CATMAID.verifyNetworkAccess();
      } else if (error instanceof CATMAID.NoWebGLAvailableError) {
        CATMAID.error("WebGL is required, but not available. Please check " +
            "your browser settings or graphics card driver", error.message);
      } else if (error instanceof CATMAID.InvalidLoginError) {
        CATMAID.warn("Invalid login");
      } else if (error instanceof CATMAID.InactiveLoginError) {
        CATMAID.warn("Account is disabled");
      } else {
        CATMAID.error(error.message, error.detail);
      }
    } else if (error instanceof Error) {
      CATMAID.error(error.message, error.stack);
    } else if (error instanceof CATMAID.Warning) {
      CATMAID.warn(error.message);
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

   /**
    * Throw a TooManyWebGlContextsError if minRequired is greater than the number of spare contexts below the limit.
    *
    * @param minRequired
    */
  CATMAID.throwOnInsufficientWebGlContexts = function (minRequired) {
    if (CATMAID.MAX_WEBGL_CONTEXTS - CATMAID.countWebGlContexts() < minRequired) {
      var errorMessage = 'Widget requires the creation of webGL contexts (used by stack viewers and 3D viewers), but' +
        ' the browser imposes a hard limit on how many can be used at once. Close other stack or 3D viewer widgets,' +
        ' or other browser tabs, and ensure that webGL contexts are being unregistered correctly.';
      var errorDetail = `Contexts in use by CATMAID: ${CATMAID.countWebGlContexts()}\n` +
        `Contexts required: ${minRequired}\n` +
        `Maximum total contexts: ${CATMAID.MAX_WEBGL_CONTEXTS}`;
      throw new CATMAID.TooManyWebGlContextsError(errorMessage, errorDetail);
    }
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
