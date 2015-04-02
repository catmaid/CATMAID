/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {
 
  /**
   * The basic skeleton source implements the skeleton source interface and
   * maintains an ordered list of skeletons.
   */
  var BasicSkeletonSource = function(name) {
    this.name = name;
    this.registerSource();
    this.skeletonModels = {};
    this.orderedSkeletonIDs = [];
  };

  BasicSkeletonSource.prototype = new CATMAID.SkeletonSource();

  /* Implement SkeletonSource interface */

  /**
   * Get unique name of this dimension source.
   */
  BasicSkeletonSource.prototype.getName = function()
  {
    return this.name;
  };

  /**
   * Handle destruction of this skeleton source.
   */
  BasicSkeletonSource.prototype.destroy = function() {
    this.unregisterSource();
  };

  /**
   * Append a list of skeleton models. If a model is already known, the stored
   * model is updated.
   *
   * @param models {object} An object mapping skeleton IDs to skeleton models.
   */
  BasicSkeletonSource.prototype.append = function(models) {
    var skeleton_ids = Object.keys(models);
    for (var skid in models) {
      // Update existing model, if this skeleton is known
      if (skid in this.skeletonModels) {
        this.skeletonModels[skid] = models[skid];
        continue; 
      } else {
        this.skeletonModels[skid] = models[skid];
        // Store skeleton ID reference (as number)
        this.orderedSkeletonIDs.push(parseInt(skid, 10));
      }
    }

    this.updateLink(models);
  };

  /**
   * Clear all references to skeletons.
   */
  BasicSkeletonSource.prototype.clear = function(source_chain) {
    this.orderedSkeletonIDs = [];
    this.skeletonModels = {};
    // Clear link target, if any
    this.clearLink(source_chain);
  };

  /**
   * Remove all skeletons with the given IDs.
   *
   * @param skeletonIDs {Array<number>} The list of skeletons to remove
   */
  BasicSkeletonSource.prototype.removeSkeletons = function(skeletonIDs) {
    // Remove skeleton IDs
    this.orderedSkeletonIDs = this.orderedSkeletonIDs.filter(function(skid) {
      return -1 === skeletonIDs.indexOf(skid);
    });

    // Remove models
    skeletonIDs.forEach(function(skid) {
      if (skid in this.skeletonModels) {
        delete this.skeletonModels[skid];
      }
    }, this);

    // Remove skeletons from link target, if any
    if (this.linkTarget) {
      // Prevent propagation loop by checking if the target has the skeletons anymore
      if (skeletonIDs.some(this.linkTarget.hasSkeleton, this.linkTarget)) {
        this.linkTarget.removeSkeletons(skeletonIDs);
      }
    }
  };

  /**
   * Update skeleton models and propagade this to the comple source chain.
   */
  BasicSkeletonSource.prototype.updateModels = function(models, sourceChain) {
    sourceChain = sourceChain || {};
    // break propagation loop
    if (sourceChain && (this in sourceChain)) {
      return;
    }
    // Add self to source chain
    source_chain[this] = this;

    var newModels = {};
    Object.keys(models).forEach(function(skid) {
      var model = models[skid];
      if (skid in this.skeletonModels) {
        this.skeletonModels[model.id] = model.clone();
      } else {
        newModels[skid] = model;
      }
    }, this);

    if (Object.keys(new_models).length > 0) {
      this.append(new_models);
    }

    this.updateLink(models, sourceChain);
  };

  /**
   * Return true if the given skeleton ID is known to this source. Otherwise,
   * return false.
   *
   * @param skeletonID {number} The skeleton ID to test
   */
  BasicSkeletonSource.prototype.hasSkeleton = function(skeletonID) {
    return skeleton_id in this.skeletonModels;
  };


  /**
   * Return all known skeleton IDs. Override for more specific and actual
   * selection behavior.
   */
  BasicSkeletonSource.prototype.getSelectedSkeletons = function() {
    return this.orderedSkeletonIDs.slice(0);
  };

  /**
   * Return models object for all known skeleton IDs. Override for more specific
   * and actual selection behavior.
   */
  BasicSkeletonSource.prototype.getSelectedSkeletonModels = function() {
    return this.orderedSkeletonIDs.reduce((function(m, skid) {
      m[skid] = this.skeletonModels[skid].clone();
      return m;
    }).bind(this), {});
  };

  /**
   * Highlighting is not implemented in this source since it is use case
   * specific.
   */
  BasicSkeletonSource.prototype.highlight = function() {};

  // Make basic skeleton source available in CATMAID namespace
  CATMAID.BasicSkeletonSource = BasicSkeletonSource;

})(CATMAID);
