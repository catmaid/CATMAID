/* global
  CATMAID,
  */

"use strict";

var InstanceRegistry = function() {
  this.instances = {};
};

InstanceRegistry.prototype = {};

/** Return an array of open instances, sorted from oldest to newest. */
InstanceRegistry.prototype.getInstances = function() {
	return Object.keys(this.instances).map(function(key) {
		return [Number(key), this.instances[key]];
	}, this).sort(function(a, b) {
		return a[0] > b[0];
	}).map(function(a) { return a[1]; });
};

InstanceRegistry.prototype.noInstances = function() {
	return 0 === this.getInstances().length;
};

InstanceRegistry.prototype.registerInstance = function() {
  var pids = Object.keys(this.instances).map(Number);
  if (0 === pids.length) {
    this.instances[1] = this;
    return 1;
  }

  // Find lowest unused number
  var max = Math.max.apply(Math, pids.map(Number)),
      pid = max + 1;
  for (var i = 1; i < max; ++i) {
    // Check if i doesn't exist yet as an instance ID
    if (typeof(this.instances[i]) === 'undefined') {
      pid = i;
      break;
    }
  }
  this.instances[pid] = this;
  return pid;
};

InstanceRegistry.prototype.unregisterInstance = function() {
  delete this.instances[this.widgetID];
};

InstanceRegistry.prototype.getFirstInstance = function() {
	var keys = Object.keys(this.instances);
	if (0 === keys.length) return null;
	return this.instances[Math.min.apply(Math, keys.map(Number))];
};

InstanceRegistry.prototype.getLastInstance = function() {
	var a = this.getInstances();
	return a[a.length-1];
};

/** Load each skeleton from the skeleton_ids array one by one, invoking the fnLoadedOne
 * with the ID and the corresponding JSON.
 * If some skeletons fail to load (despite existing), the fnFailedLoading will be invoked with the ID.
 * Finally when all are loaded, fnDone is invoked without arguments.
 * Note that fnDone is invoked even when the given skeleton_ids array is empty.
 *
 * Additionally, when done if any skeletons don't exist anymore, a dialog will ask to remove them from all widgets that are skeleton sources.
 *
 * @param {String}       method  (Optional) The HTTP method to use. By default
 *                               "POST" is used.
 * @param {API|Function} api     (Optional) Either an API instance to use for
 *                               all requested skeletons or a function that
 *                               returns an API instance given a skeleton ID.
 */
var fetchSkeletons = function(skeleton_ids, fnMakeURL, fnPost, fnLoadedOne, // jshint ignore:line
    fnFailedLoading, fnDone, method, binaryTransfer, api = undefined) {
  method = method || "POST";
  var cancelationRequested = false;
  var i = 0,
      missing = [],
      unloadable = [],
      fnMissing = function() {
        if (missing.length > 0 && confirm("Skeletons " + missing.join(', ') + " do not exist. Remove them from selections?")) {
          CATMAID.skeletonListSources.removeSkeletons(missing);
        }
        if (unloadable.length > 0) {
          alert("Could not load skeletons: " + unloadable.join(', '));
        }
      },
      finish = function() {
        $.unblockUI();
        fnMissing();
      },
      cancelError = null,
      loadOne = function(skeleton_id) {
        CATMAID.fetch({
            url: fnMakeURL(skeleton_id),
            method: method,
            data: fnPost(skeleton_id),
            responseType: (binaryTransfer ? 'arraybuffer' : undefined),
            decoder: binaryTransfer ? 'msgpack' : 'json',
            api: CATMAID.tools.isFn(api) ? api(skeleton_id) : api,
          })
          .then(data => {
            try {
              fnLoadedOne(skeleton_id, data);
            } catch (e) {
              cancelError = e;
            }
          })
          .catch(error => {
            if (error instanceof CATMAID.ResourceUnavailableError) {
              missing.push(skeleton_id);
            } else {
              unloadable.push(skeleton_id);
            }
            fnFailedLoading(skeleton_id);
          })
          .then(() => {
            if (cancelError) {
              finish();
              CATMAID.handleError(cancelError);
              CATMAID.msg("ERROR", `Problem loading skeleton ${skeleton_id}`);
            } else {
               // Cancel if requested
               if (cancelationRequested) {
                 CATMAID.warn("Canceled skeleton loading");
                 finish();
                 fnDone();
                 return;
               }
              // Next iteration
              i += 1;
              $('#counting-loaded-skeletons').text(i + " / " + skeleton_ids.length);
              if (i < skeleton_ids.length) {
                loadOne(skeleton_ids[i]);
              } else {
                finish();
                fnDone();
              }
            }
          });
      };

  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS +
      'images/busy.gif" /> <span>Loading skeletons <div id="counting-loaded-skeletons">0 / ' +
      skeleton_ids.length + '</div></span><div id="cancel-skeleton-loading"><p id="cancel-msg" style="display: none">Canceling loading after current skeleton"<p><p><input type="button" value="Cancel" ' +
      'id="block-ui-dialog-btn"></p></div>'});

      // Provide option to cancel
      $(document).on('click', '#block-ui-dialog-btn', (function(){
        cancelationRequested = true;
        let cancelMsg = document.querySelector('#cancel-skeleton-loading #cancel-msg');
        if (cancelMsg) {
          cancelMsg.style.display = 'block';
        }
        let cancelBtn = document.querySelector('#cancel-skeleton-loading #block-ui-dialog-btn');
        if (cancelBtn) {
          cancelBtn.disabled = true;
        }
      }).bind(this));
  }
  if (skeleton_ids.length > 0) {
    loadOne(skeleton_ids[0]);
  } else {
    fnDone();
  }
};
