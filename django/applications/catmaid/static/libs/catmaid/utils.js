/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  Arbor,
  CATMAID,
  growlAlert,
  project,
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
  for (var i = 0; i < max; ++i) {
    if (typeof(pids[i]) === 'undefined') {
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


/**
 * The annotation cache provides annotation names and their IDs.
 */
var AnnotationCache = function() {
  // Map of annotation name vs its ID and vice versa
  this.annotation_ids = {};
  this.annotation_names = {};
};

AnnotationCache.prototype.getName = function(id) {
  return this.annotation_names[id];
};

AnnotationCache.prototype.getAllNames = function() {
  return Object.keys(this.annotation_ids);
};

AnnotationCache.prototype.getID = function(name) {
  return this.annotation_ids[name];
};

AnnotationCache.prototype.getAllIDs = function() {
  return Object.keys(this.annotation_names);
};

AnnotationCache.prototype.update = function(callback) {
  requestQueue.register(django_url + project.id + '/annotations/list',
      'POST', {}, (function (status, data, text) {
        var e = $.parseJSON(data);
        if (status !== 200) {
            alert("The server returned an unexpected status (" +
              status + ") " + "with error message:\n" + text);
        } else {
          if (e.error) {
            new CATMAID.ErrorDialog(e.error, e.detail).show();
          } else {
            // Empty cache
            this.annotation_ids = {};
            this.annotation_names = {};
            // Populate cache
            e.annotations.forEach((function(a) {
             this.annotation_ids[a.name] = a.id;
             this.annotation_names[a.id] = a.name;
            }).bind(this));
            // Call back, if requested
            if (callback) {
              callback();
            }
          }
        }
      }).bind(this));
};

/**
 * Adds new annotations from the given list to the cache. The list should
 * contain objects, each with an 'id' and a 'name' field.
 */
AnnotationCache.prototype.push = function(annotationList) {
  annotationList.forEach(function(a) {
    var known_id = this.annotation_ids.hasOwnProperty(a.name) === -1;
    var known_name = this.annotation_names.hasOwnProperty(a.id) === -1;
    if (!known_id && !known_name) {
      // Add annotation if it isn't already contained in the list.
      this.annotation_ids[a.name] = a.id;
      this.annotation_names[a.id] = a.name;
    } else if (known_id && known_name) {
      // Nothing to do, if the annotation is already known.
    } else {
      // If only the ID or the name is known, something is odd.
      throw "Annotation already known with different id/name";
    }
  }, this);
};

var annotations = new AnnotationCache();


/**
 * This a convience constructor to make it very easy to use the neuron name
 * service.
 */
var NameServiceClient = function()
{

};


/** Adds ability to pick colors almost randomly, keeping state. */
var Colorizer = function() {};

Colorizer.prototype = {};

Colorizer.prototype.COLORS = [[1, 1, 0], // yellow
                              [1, 0, 1], // magenta
                              [0, 0, 1], // blue
                              [0, 1, 0], // green
                              [1, 1, 1], // white
                              [0, 1, 1], // cyan
                              [1, 0.5, 0], // orange
                              [0.5, 1, 0], // light green
                              [0.5, 0.5, 0.5], // grey
                              [0, 1, 0.5], // pale green
                              [1, 0, 0], // red
                              [0.5, 0.5, 1], // light blue
                              [0.75, 0.75, 0.75], // silver
                              [1, 0.5, 0.5], // pinkish
                              [0.5, 1, 0.5], // light cyan
                              [1, 0, 0.5], // purplish
                              [0.5, 0, 0], // maroon
                              [0.5, 0, 0.5], // purple
                              [0, 0, 0.5], // navy blue
                              [1, 0.38, 0.28], // tomato
                              [0.85, 0.64, 0.12], // gold
                              [0.25, 0.88, 0.82], // turquoise
                              [1, 0.75, 0.79]]; // pink


Colorizer.prototype.pickColor = function() {
	if (undefined === this.next_color_index) this.next_color_index = 0;

  var c = this.COLORS[this.next_color_index % this.COLORS.length];
  var color = new THREE.Color().setRGB(c[0], c[1], c[2]);
  if (this.next_color_index < this.COLORS.length) {
    this.next_color_index += 1;
    return color;
  }
  // Else, play a variation on the color's hue (+/- 0.25) and saturation (from 0.5 to 1)
  var hsl = color.getHSL();
  color.setHSL((hsl.h + (Math.random() - 0.5) / 2.0) % 1.0,
               Math.max(0.5, Math.min(1.0, (hsl.s + (Math.random() - 0.5) * 0.3))),
               hsl.l);
  this.next_color_index += 1;
  return color;
};

/** Parse into a THREE.Color the color object returned from a Raphael color wheel. */
var parseColorWheel = function(color) {
  return new THREE.Color().setRGB(parseInt(color.r) / 255.0,
                                  parseInt(color.g) / 255.0,
                                  parseInt(color.b) / 255.0);
};

/** Load each skeleton from the skeleton_ids array one by one, invoking the fnLoadedOne
 * with the ID and the corresponding JSON.
 * If some skeletons fail to load (despite existing), the fnFailedLoading will be invoked with the ID.
 * Finally when all are loaded, fnDone is invoked without arguments.
 * Note that fnDone is invoked even when the given skeleton_ids array is empty.
 *
 * Additionally, when done if any skeletons don't exist anymore, a dialog will ask to remove them from all widgets that are skeleton sources.*/
var fetchSkeletons = function(skeleton_ids, fnMakeURL, fnPost, fnLoadedOne, fnFailedLoading, fnDone) {
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
        requestQueue.register(fnMakeURL(skeleton_id), 'POST', fnPost(skeleton_id),
            function(status, text) {
              try {
                if (200 === status) {
                  var json = $.parseJSON(text);
                  if (json.error) {
                    if (0 === json.error.indexOf("Skeleton #" + skeleton_id + " doesn't exist")) {
                      missing.push(skeleton_id);
                    } else {
                      unloadable.push(skeleton_id);
                    }
                    fnFailedLoading(skeleton_id);
                  } else {
                    fnLoadedOne(skeleton_id, json);
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
                growlAlert("ERROR", "Problem loading skeleton " + skeleton_id);
              }
            });
      };
  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS + 'images/busy.gif" /> <h2>Loading skeletons <div id="counting-loaded-skeletons">0 / ' + skeleton_ids.length + '</div></h2>'});
  }
  if (skeleton_ids.length > 0) {
    loadOne(skeleton_ids[0]);
  } else {
    fnDone();
  }
};
