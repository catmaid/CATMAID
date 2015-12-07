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
        var json = text.length ? $.parseJSON(text) : {};
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
   * Queue a request for the given back-end method along with the given data. It
   * expects a JSON response. A promise is returned. The URL passed in needs to
   * be relative to the back-end URL.
   */
  CATMAID.fetch = function(relativeURL, method, data)
  {
    return new Promise(function(resolve, reject) {
      var url = CATMAID.makeURL(relativeURL);
      requestQueue.register(url, method, data,
          CATMAID.jsonResponseHandler(resolve, reject, true));
    });
  };

  /**
   * Convenience function to show an error dialog.
   */
  CATMAID.error = function(msg, detail)
  {
    new CATMAID.ErrorDialog(msg, detail).show();
  };

  /**
   * Make status information available through the front-ends status bar.
   */
  CATMAID.status = function(msg)
  {
    CATMAID.statusBar.replaceLast(msg);
  };

})(CATMAID);
