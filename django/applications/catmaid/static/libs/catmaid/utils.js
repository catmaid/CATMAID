/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  Arbor,
  CATMAID,
  msgpack,
  requestQueue
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
 * If no <method> parameter is passed in, POST is assumed.*/
var fetchSkeletons = function(skeleton_ids, fnMakeURL, fnPost, fnLoadedOne,
    fnFailedLoading, fnDone, method, binaryTransfer) {
  method = method || "POST";
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
      loadOne = function(skeleton_id) {
        requestQueue.register(fnMakeURL(skeleton_id), method, fnPost(skeleton_id),
            function(status, text, xml, dataSize, contentType) {
              try {
                if (200 === status) {
                  var data;
                  if (binaryTransfer && contentType === 'application/octet-stream') {
                    data = msgpack.decode(new Uint8Array(text));
                  } else {
                    data = JSON.parse(text);
                  }
                  if (data.error) {
                    if (0 === data.error.indexOf("Skeleton #" + skeleton_id + " doesn't exist")) {
                      missing.push(skeleton_id);
                    } else {
                      unloadable.push(skeleton_id);
                    }
                    fnFailedLoading(skeleton_id);
                  } else {
                    fnLoadedOne(skeleton_id, data);
                  }
                } else {
                  unloadable.push(skeleton_id);
                  fnFailedLoading(skeleton_id);
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
              } catch (e) {
                finish();
                console.log(e, e.stack);
                CATMAID.msg("ERROR", "Problem loading skeleton " + skeleton_id);
              }
            },
            undefined,
            binaryTransfer ? 'arraybuffer' : undefined);
      };
  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS +
      'images/busy.gif" /> <span>Loading skeletons <div id="counting-loaded-skeletons">0 / ' +
      skeleton_ids.length + '</span>'});
  }
  if (skeleton_ids.length > 0) {
    loadOne(skeleton_ids[0]);
  } else {
    fnDone();
  }
};
