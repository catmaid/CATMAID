(function(CATMAID) {

  'use strict';

  /**
   * Encapsulate an API reference, a project ID a skeleton model object and a
   * list of skeleton IDs. This mainly useful to separate a set of model objects
   * into API/project pairs.
   */
  let ModelCollection = function(api, projectId, skeletonModels = {}) {
    this.api = api;
    this.projectId = projectId;
    this.models = skeletonModels;
    this.skeletonIds = Object.keys(skeletonModels).map(skid => skeletonModels[skid].id);
  };

  // Add an additional model to this collection.
  ModelCollection.prototype.addModel = function(model) {
    if (this.models.hasOwnProperty(model.id)) {
      throw new CATMAID.ValueError(`Skeleton model ${model.id} is already part of this collection.`);
    }
    if (model.api !== this.api) {
      throw new CATMAID.ValueError(`Skeleton model ${model.id} is linked to an API different from this collection.`);
    }
    if (model.projectId !== this.projectId) {
      throw new CATMAID.ValueError(`Skeleton model ${model.id} is from a different projct than this collection.`);
    }
    this.models[model.id] = model;
    this.skeletonIds.push(model.id);
  };

  CATMAID.ModelCollection = ModelCollection;

})(CATMAID);
