/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
      q.fn(json);
    } catch (e) {
      alert(e);
    } finally {
      complete(q);
    }
  };

  var reset = function(q, error) {
    if (q.blockUI) $.unblockUI();
    console.log(error, q);
    if (error.error) new ErrorDialog(error.error, error.detail).show();
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

    // Call all callbacks
    callbacks.forEach(function(errCallback) {
      errCallback();
    });
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
      $.blockUI({message: '<h2><img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> Just a moment...</h2>'});
    }

    if (q.url) {
      if (q.replace) {
        requestQueue.replace(q.url, "POST", q.post, handlerFn(q), q.url);
      } else {
        requestQueue.register(q.url, "POST", q.post, handlerFn(q));
      }
    } else {
      // No url: direct execution with null json
      invoke(q, null);
    }
  };

  return function(url, post, fn, blockUI, replace, errCallback) {
    queue.push({url: url,
          post: post,
          fn: fn,
          blockUI: blockUI,
          replace: replace,
          errCallback: errCallback});
    // Invoke if the queue contains only the new entry
    if (1 === queue.length) {
      next();
    }
  };
};
