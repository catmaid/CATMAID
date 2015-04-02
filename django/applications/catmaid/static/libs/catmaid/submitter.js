/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  requestQueue
  */

/** The queue of submitted requests is reset if any returns an error.
 *  The returned function accepts null URL as argument, which signals
 *  that no request to the server is necessary and the handler fn must be invoked directly. 
 *  A request is executed only when the request submitted before it returned and its continuation was successfully invoked. Any number of request can be queued.
 *  The continuation function will be given the parsed JSON as argument.
 *
 *  Usage: create a submitter queue first:
 *
 *  var submit = submitterFn();
 *  
 *  ... then submit requests like:
 *
 *  submit(django_url + '/skeleton_id/' + skeleton_id,
 *     {all: true},
 *     function(json) { alert('Continuation OK! JSON reply: ' + json); });
 *
 *  An optional fourth argument specifies whether the UI has to be blocked.
 *  An optional fifth argument specifies calls with replace rather than register.
 *
 */

"use strict";

var submitterFn = function() {
  // Accumulate invocations
  var queue = [];
  // Store last result
  var lastResult;

  var complete = function(q) {
    // Remove this call
    queue.shift();
    //
    if (q.blockUI) $.unblockUI();
    // ... and invoke the oldest of any accumulated requests
    next();
  };

  var invoke = function(q, json) {
    try {
      lastResult = q.fn(json);
    } catch (e) {
      alert(e);
    } finally {
      // If the result of the invocation is a promise (i.e. has a then()
      // method), wait with completion for its fulfillment.
      if (lastResult && typeof(lastResult.then) === "function") {
        lastResult.then(function(result) {
          // Make the result of the promise the new result
          lastResult = result;
          complete(q);
        }, function(error) {
          reset(q, error);
        });
      } else {
        complete(q);
      }
    }
  };

  var reset = function(q, error) {
    if (q.blockUI) $.unblockUI();
    // Collect all error callbacks from all queued items. The current item is
    // expected to be still the first element.
    var callbacks = queue.reduce(function(o, e) {
      if (e.errCallback) {
        o.push(e.errCallback);
      }
      return o;
    }, []);

    // Reset queue
    queue.length = 0;
    // Reset result cache
    lastResult = undefined;

    // Call all callbacks
    var handled = false;
    var callbackError;
    try {
      callbacks.forEach(function(errCallback, i) {
        var result =  errCallback(error);
        // The andler of the failed request, can mark this error as handled.
        handled = (errCallback === q.errCallback) ? result : handled;
      });
    } catch (e) {
     callbackError = e;
    }

    // If the error was handled, don't print console message or show a dialog.
    if (!handled) {
      console.log(error, q);
      if (!q.quiet && error.error) {
        CATMAID.error(error.error, error.detail);
      }
    }

    // If there was an error in one of the callbacks, report this as well.
    if (callbackError) {
      CATMAID.error(callbackError);
    }
  };

  var handlerFn = function(q) {
    return function(status, text) {
      if (200 !== status) {
        return reset(q, "Unexpected request response status: " + status + "\n for URL: " + q.url);
      }
      if (!text) {
        return reset(q, "Unexpected request response text: " + text + "\n for URL: " + q.url);
      }
      var json;
      try {
        json = $.parseJSON(text);
      } catch (e) {
        alert(e);
        return reset(q, "Unable to parse json text: " + text + "\n for URL: " + q.url);
      }
      if (!json) {
        return reset(q, "Unexpected json: " + json + "\n for URL: " + q.url);
      }
      if (json.error) {
        if (q.replace && 'REPLACED' === json.error) {
          return complete(q);
        } else {
          return reset(q, json);
        }
      }
      invoke(q, json);
    };
  };

  var next = function() {
    if (0 === queue.length) return;

    // Process the first element of the queue
    var q = queue[0];

    // Block UI prior to placing a request, if desired
    if (q.blockUI) {
      $.blockUI({message: '<h2><img src="' + STATIC_URL_JS + 'images/busy.gif" /> Just a moment...</h2>'});
    }

    if (q.url) {
      if (q.replace) {
        requestQueue.replace(q.url, "POST", q.post, handlerFn(q), q.url);
      } else {
        requestQueue.register(q.url, "POST", q.post, handlerFn(q));
      }
    } else {
      // No url: direct execution with last result
      invoke(q, lastResult);
    }
  };

  var submit = function(url, post, fn, blockUI, replace, errCallback, quiet) {
    queue.push({url: url,
          post: post,
          fn: fn,
          blockUI: blockUI,
          replace: replace,
          errCallback: errCallback,
          quiet: quiet});
    // Invoke if the queue contains only the new entry
    if (1 === queue.length) {
      next();
    }
  };

  /**
   * Allow submitter to be used as a Promise.
   */
  submit.then = function(onResolve, onReject, blockUI) {
    submit(null, null, onResolve, blockUI, false, onReject, false);
    return submit;
  };

  return submit;
};
