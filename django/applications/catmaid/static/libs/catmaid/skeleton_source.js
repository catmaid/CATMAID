/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var SkeletonSource = function() {};

  SkeletonSource.prototype = {};

  SkeletonSource.prototype.registerSource = function() {
    CATMAID.skeletonListSources.add(this);
  };

  SkeletonSource.prototype.unregisterSource = function() {
    CATMAID.skeletonListSources.remove(this);
  };

  SkeletonSource.prototype.loadSource = function() {
    var models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    if (0 === models.length) {
      growlAlert('Info', 'Selected source is empty.');
      return;
    }
    this.append(models);
  };

  SkeletonSource.prototype.updateOneModel = function(model, source_chain) {
    var models = {};
    models[model.id] = model;
    this.updateModels(models, source_chain);
  };

  SkeletonSource.prototype.syncLink = function(select) {
    this.linkTarget = CATMAID.skeletonListSources.getSource(select.value);
    if (this.linkTarget) {
      this.linkTarget.clear();
      this.linkTarget.append(this.getSelectedSkeletonModels());
    }
  };

  SkeletonSource.prototype.updateLink = function(models) {
    if (this.linkTarget) {
      this.linkTarget.updateModels(models);
    }
  };

  SkeletonSource.prototype.notifyLink = function(model, source_chain) {
    if (this.linkTarget) {
      this.linkTarget.updateOneModel(model, source_chain);
    }
  };

  SkeletonSource.prototype.clearLink = function(source_chain) {
    if (this.linkTarget) {
      if (source_chain && (this in source_chain)) return; // break propagation loop
      if (!source_chain) source_chain = {};
      source_chain[this] = this;

      this.linkTarget.clear();
    }
  };

  SkeletonSource.prototype.getLinkTarget = function() {
    return this.linkTarget;
  };

  SkeletonSource.prototype.getSelectedSkeletons = function() {
      return Object.keys(this.getSelectedSkeletonModels());
  };

  SkeletonSource.prototype.annotate_skeleton_list = function() {
    NeuronAnnotations.prototype.annotate_neurons_of_skeletons(this.getSelectedSkeletons());
  };

  // Make skeleton source available in CATMAID namespace
  CATMAID.SkeletonSource = SkeletonSource;

})(CATMAID);
