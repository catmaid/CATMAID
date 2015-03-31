/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  // A Skeleton source based on the active node in the tracing layer
  var ActiveSkeleton = function() {
    this.registerSource();
  };

  ActiveSkeleton.prototype = new CATMAID.SkeletonSource();

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
    var name = NeuronNameService.getInstance().getName(active);
    return new SelectionTable.prototype.SkeletonModel(active, name, new THREE.Color().setRGB(1, 1, 0));
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

  // Make ActiveSkeleton available in CATMAID namespace
  CATMAID.ActiveSkeleton = ActiveSkeleton;

})(CATMAID);
