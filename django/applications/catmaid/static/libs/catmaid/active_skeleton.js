/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * A proxy skeleton source based on the active node in the tracing layer.
   */
  var ActiveSkeleton = function() {
    CATMAID.SkeletonSource.call(this, true);

    // Create current model for active skeleton
    this.model = this.createModel();

    // Listen to active skeleton changes and create skeleton source events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this._handleActiveNodeChange, this);
  };

  ActiveSkeleton.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  ActiveSkeleton.prototype.constructor = ActiveSkeleton;

  ActiveSkeleton.prototype.getName = function(skeleton_id) {
    return "Active skeleton";
  };

  ActiveSkeleton.prototype.append = function() {};
  ActiveSkeleton.prototype.clear = function() {};
  ActiveSkeleton.prototype.removeSkeletons = function() {};
  ActiveSkeleton.prototype.updateModels = function() {};

  ActiveSkeleton.prototype.getSelectedSkeletons = function() {
    var skid = SkeletonAnnotations.getActiveSkeletonId();
    if (!skid) return [];
    return [skid];
  };

  ActiveSkeleton.prototype.getSkeletonColor = function() {
    return new THREE.Color().setRGB(1, 0, 1);
  };

  ActiveSkeleton.prototype.hasSkeleton = function(skeleton_id) {
    return skeleton_id === SkeletonAnnotations.getActiveSkeletonId();
  };

  ActiveSkeleton.prototype.createModel = function() {
    var active = SkeletonAnnotations.getActiveSkeletonId();
    if (!active) return null;
    var name = CATMAID.NeuronNameService.getInstance().getName(active);
    return new CATMAID.SkeletonModel(active, name, new THREE.Color().setRGB(1, 1, 0));
  };

  ActiveSkeleton.prototype.getSelectedSkeletonModels = function() {
    var model = this.createModel(),
            o = {};
    if (model) o[model.id] = model;
    return o;
  };

  ActiveSkeleton.prototype.getSkeletonModels = ActiveSkeleton.prototype.getSelectedSkeletonModels;

  ActiveSkeleton.prototype.highlight = function(skeleton_id) {
    TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeleton_id);
  };

  ActiveSkeleton.prototype._handleActiveNodeChange = function(node, skeletonChange) {
    if (skeletonChange) {
      if (this.model) {
        var oldModel = this.model;
        this.model = null;
        this.triggerRemove(CATMAID.tools.idMap(oldModel.clone()));
      }
      this.model = this.createModel();
      if (this.model) {
        this.triggerAdd(CATMAID.tools.idMap(this.model.clone()));
      }
    }
  };

  // Make ActiveSkeleton available in CATMAID namespace
  CATMAID.ActiveSkeleton = ActiveSkeleton;

})(CATMAID);
