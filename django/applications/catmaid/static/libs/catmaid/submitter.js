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
 *         {all: true},
 *         function(json) { alert('Continuation OK! JSON reply: ' + json); });
 *
 */
var submitterFn = function() {
		// Accumulate invocations
		var queue = [];

		var handlerFn = function(fn) {
				return function(status, text) {
						if (200 !== status) {
								alert("Unexpected request response status: " + status);
								queue.length = 0; // reset
								return;
						}
						var json = $.parseJSON(text);
						if (json.error) {
								alert(json.error);
								queue.length = 0; // reset
								return;
						}
						// Invoke handler
						fn(json);
						// ... then remove this call
						queue.shift();
						// ... and invoke the oldest of any accumulated requests
						next();
				};
		};

		var next = function() {
				if (0 === queue.length) return;
				var q = queue[0];
				if (q.url) {
						requestQueue.register(q.url, "POST", q.post, handlerFn(q.fn));
				} else {
						q.fn();
						queue.shift();
				}
		};

		return function(url, post, fn) {
				queue.push({url: url,
										post: post,
										fn: fn});
				next();
		};
};

