/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  requestQueue
  */

(function(CATMAID) {

  "use strict";

  /**
   * The queue of submitted requests is reset if any returns an error. The
   * returned function accepts null URL as argument, which signals that no
   * request to the server is necessary and the handler fn must be invoked
   * directly. A request is executed only when the request submitted before it
   * returned and its continuation was successfully invoked. Any number of
   * request can be queued. The continuation function will be given the parsed
   * JSON as argument.
   *
   * Usage: create a submitter queue first:
   *
   * var submit = CATMAID.submitterFn();
   *
   * ... then submit requests like:
   *
   * submit(CATMAID.makeURL('/skeleton_id/' + skeleton_id),
   *    'POST',
   *    {all: true},
   *    function(json) { alert('Continuation OK! JSON reply: ' + json); });
   *
   * An optional fourth argument specifies whether the UI has to be blocked. An
   * optional fifth argument specifies calls with replace rather than register.
   */
  CATMAID.submitterFn = function() {
    // Accumulate invocations
    var queue = [];
    // Store last result
    var lastResult;
    // The time in ms before a UI blocking dialog is shown, if enabled
    var blockingTimeout = 300;
    // The timeout for a blocking UI
    var blockingTimeoutHandle;

    var blockUI = function() {
      // Block UI after a defined amount of time
      blockingTimeoutHandle = setTimeout(function() {
        $.blockUI({
          message: '<img src="' + STATIC_URL_JS +
            'images/busy.gif" /><span>Just a moment...</span>'
        });
      }, blockingTimeout);
    };

    var unblockUI = function() {
      if (blockingTimeoutHandle) {
        clearTimeout(blockingTimeoutHandle);
        blockingTimeoutHandle = undefined;
      }
      $.unblockUI();
    };

    var complete = function(q) {
      // Remove this call
      queue.shift();
      //
      if (q.blockUI) unblockUI();
      // ... and invoke the oldest of any accumulated requests
      next();
    };

    var invoke = function(q, json, dataSize) {
      try {
        lastResult = q.fn ? q.fn(json, dataSize) : json;
      } catch (e) {
        CATMAID.error(e, e.stack);
      } finally {
        // If the result of the invocation is a promise (i.e. has a then()
        // method), wait with completion for its fulfillment.
        if (lastResult && CATMAID.tools.isFn(lastResult.then)) {
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
      if (q.blockUI) unblockUI();
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
          // The handler of the failed request, can mark this error as handled.
          handled = (errCallback === q.errCallback) ? result : handled;
        });
      } catch (e) {
       callbackError = e;
      }

      // If the error was handled, don't print console message or show a dialog.
      if (!handled) {
        console.log('[Submitter] An unhandled error occured');
        console.log(error, q);
        if (!q.quiet) {
          var err = (error && error.error) ? CATMAID.parseErrorResponse(error) :
            new CATMAID.Error('An unknown error occured');
          CATMAID.handleError(err);
        }
      }

      // If there was an error in one of the callbacks, report this as well.
      if (callbackError) {
        CATMAID.error(callbackError);
      }
    };

    var handlerFn = function(q) {
      return function(status, text, xml, dataSize) {
        if (200 !== status) {
          return reset(q, "Unexpected request response status: " + status + "\n for URL: " + q.url);
        }
        if (!text) {
          return reset(q, "Unexpected request response text: " + text + "\n for URL: " + q.url);
        }
        var json;
        try {
          if (q.raw) {
            json = text;
          } else {
            json = JSON.parse(text);
          }
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
        invoke(q, json, dataSize);
      };
    };

    var next = function() {
      if (0 === queue.length) return;

      // Process the first element of the queue
      var q = queue[0];

      // Block UI prior to placing a request, if desired
      if (q.blockUI) {
        blockUI();
      }

      if (q.url) {
        if (q.replace) {
          requestQueue.replace(q.url, q.method, q.params, handlerFn(q), q.id, q.responseType, q.headers);
        } else {
          requestQueue.register(q.url, q.method, q.params, handlerFn(q), q.id, q.responseType, q.headers);
        }
      } else {
        // No url: direct execution with last result
        invoke(q, lastResult);
      }
    };

    var submit = function(url, method, params, fn, blockUI, replace, errCallback,
        quiet, id, raw, responseType, headers) {
      queue.push({url: url,
            method: method,
            params: params,
            fn: fn,
            blockUI: blockUI,
            replace: replace,
            errCallback: errCallback,
            quiet: quiet,
            id: id || url,
            raw: raw,
            responseType: responseType,
            headers: headers,
      });
      // Invoke if the queue contains only the new entry
      if (1 === queue.length) {
        next();
      }
      // Return self to allow chaining
      return submit;
    };

    /**
     * Allow submitter to be used as a Promise.
     */
    submit.then = function(onResolve, onReject, blockUI) {
      submit(null, null, null, onResolve, blockUI, false, onReject, false);
      return submit;
    };

    /**
     * Get a promise that resolves (or rejects) after the current queue is
     * submitted. Optionally, resolve and rejection functions can be passed in for
     * convenience.
     */
    submit.promise = function(onResolve, onReject, blockUI) {
      var promise = new Promise(function(resolve, reject) {
        submit(null, null, null, resolve, blockUI, false, reject, false);
        return submit;
      });
      if (onResolve) {
        promise = promise.then(onResolve);
      }
      if (onReject) {
        promise = promise.catch(onReject);
      }
      return promise;
    };


    return submit;
  };

})(CATMAID);
