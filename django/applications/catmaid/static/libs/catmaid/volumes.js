/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* global
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  CATMAID.Volume = function(options) {
    options = options || {};
    this.id = options.id || null;
  };

  CATMAID.Volume.prototype = {};
  CATMAID.asEventSource(CATMAID.Volume.prototype);

  CATMAID.Volume.prototype.EVENT_PROPERTY_CHANGED = "volume_property_changed";

  /**
   * Set a particular field to a given value. If this changes an existing value,
   * the "property changed" event is triggered.
   */
  CATMAID.Volume.prototype.set = function(field, value) {
    var oldValue = this[field];
    if (oldValue !== value) {
      this[field] = value;
      this.trigger(this.EVENT_PROPERTY_CHANGED, field, value, oldValue);
    }
  };

  /**
   * Store a client-side volume to the server. If the ID field is null, a new
   * volume wil be created.
   */
  CATMAID.Volume.prototype.save = function() {
    if (null === this.id) {
      requestQueue.register(CATMAID.makeURL(project.id + "/volumes/add"), "POST",
          this.serialize(), CATMAID.jsonResponseHandler(function(json) {
            if (json.success) {
              CATMAID.msg("Success", "A new volume was created");
            } else {
              CATMAID.warn("Unknown status");
            }
          }));
    } else {
      requestQueue.register(CATMAID.makeURL(project.id + "/volumes/" + this.id + "/"),
          "POST", this.serialize(), CATMAID.jsonResponseHandler(function(json) {
            if (json.success) {
              CATMAID.msg("Changes saved", "The volume has been udpated");
            } else {
              CATMAID.warn("Unknown status");
            }
          }));
    }
  };

  /**
   * A box volume is a simple axis aligned box in project space.
   */
  CATMAID.BoxVolume = function(options) {
    options = options || {};
    CATMAID.Volume.call(this, options);
    this.set("minX", options.minX || 0);
    this.set("minY", options.minY || 0);
    this.set("minZ", options.minZ || 0);
    this.set("maxX", options.maxX || 1);
    this.set("maxY", options.maxY || 1);
    this.set("maxZ", options.maxZ || 1);
    this.set("title", options.title || "Box volume");
    this.set("comment", options.comment || undefined);
    this.set("id", options.id || null);
  };

  CATMAID.BoxVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.BoxVolume.prototype.constructor = CATMAID.BoxVolume;

  /**
   * Get a JSON representation of this object.
   */
  CATMAID.BoxVolume.prototype.serialize = function() {
    return {
      min_x: this.minX,
      min_y: this.minY,
      min_z: this.minZ,
      max_x: this.maxX,
      max_y: this.maxY,
      max_z: this.maxZ,
      title: this.title,
      comment: this.comment,
      type: "box"
    };
  };

  /**
   * A convex hull volume is a mesh generated around a set of points. These
   * points are not explicitly defined, but generated from a rule set. Such a
   * rule can for instance by a collection of synapse locations based on a tag.
   * could be for instance synapses. Different strategies are possible and
   * therefore they are defined separately. After such a volume has been added,
   * it is stored on the back-end as triangle mesh. Currently the generating
   * rules are not not stored along with them.
   */
  CATMAID.ConvexHullVolume = function(options) {
    options = options || {};
    CATMAID.Volume.call(this, options);
    this.set("id", options.id || null);
    this.set("title", options.title || "Convex hull volume");
    this.set("comment", options.comment || undefined);
    this.set("pointsource", options.pointsource || undefined);
    this.set("rules", options.rules || null);
    this.set("mesh", options.mesh || null);
  };

  /**
   * Get a JSON representation of this object.
   */
  CATMAID.ConvexHullVolume.prototype.serialize = function() {

    // Create mesh by creating the convex hull around a set of points. These
    // points are collected through a set of rules for an input set of neurons.
    var trimesh;

    return {
      type: "trimesh",
      title: this.title,
      comment: this.comment,
      mesh: trimesh
    };
  };

  /**
   * A skeleton rule filters accepts or reject a skeleton.
   */
  CATMAID.SkeletonRule = function(skid, strategies) {
    this.skid = skid;
    this.strategies = strategies;
  };

  CATMAID.PointFilter = {
    'tags': {
      name: "Only tagged nodes",
      filter: function(arbor, node) {
        return true;
      }
    },
    // Looks for soma tags on root nodes and make sure there is only one root
    // and only one soma tag in use on a neuron.
    "nuclei": {
      name: "Only nuclei",
    },
    // Apply filters to all input nodes
    "filtered nodes": {
      name: "Only certain filtered nodes",
    },
    "subarbor": {
      name: "Use a sub-arbor starting from a tag",
    },
    "single-region": {
      name: "Use a region",
    },
    "binary-split": {
      name: "Binary split",
    }
  };

  CATMAID.ConvexHullVolume.prototype = Object.create(CATMAID.Volume.prototype);
  CATMAID.ConvexHullVolume.prototype.constructor = CATMAID.ConvexHullVolume;

})(CATMAID);

