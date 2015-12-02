/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * A skeleton source is an object that manages a set of skeletons of which a
   * subset can be marked as selected.
   */
  var SkeletonSource = function(register) {
    this.setOperation = SkeletonSource.prototype.OR;
    // Keeps references to subscribed skeleton sources
    this.subscriptions = [];
    this.widgetId = register ? this.registerSource() : null;
  };

  // Operations that can be used to combine multiple sources.
  SkeletonSource.UNION = 'union';
  SkeletonSource.INTERSECTION = 'intersection';
  SkeletonSource.DIFFERENCE = 'difference';

  SkeletonSource.prototype = {};
  CATMAID.asEventSource(SkeletonSource.prototype);

  // Define event constants on prototype so they can be used on inherting
  // classes directly. THE EVENT_SOURCE_ADDED event is triggered when a skeleton
  // source was created.
  SkeletonSource.prototype.EVENT_SOURCE_ADDED = "skeleton_source_added";
  // The EVENT_SOURCE_REMOVED event is triggered when a skeleton source is
  // removed or closed.
  SkeletonSource.prototype.EVENT_SOURCE_REMOVED = "skeleton_source_removed";
  // The EVENT_MODELS_ADDED event is triggered when skeleton models were added
  // to a skeleton source. The list of skeleton IDs is expected as paramter.
  SkeletonSource.prototype.EVENT_MODELS_ADDED = "skeleton_source_models_added";
  // The EVENT_MODELS_REMOVED event is triggered when skeleton models were
  // removed from a source. The list of skeleton IDs is expected as paramter.
  SkeletonSource.prototype.EVENT_MODELS_REMOVED = "skeleton_source_models_removed";
  // The EVENT_MODELS_CHANGED event is triggered when properties of skeleton
  // source models were updated (e.g. color). The list of changed skeleton IDs
  // is expected as parameter
  SkeletonSource.prototype.EVENT_MODELS_CHANGED = "skeleton_source_models_changed";

  SkeletonSource.prototype.registerSource = function() {
    CATMAID.skeletonListSources.add(this);
  };

  SkeletonSource.prototype.unregisterSource = function() {
    CATMAID.skeletonListSources.remove(this);
    // Remove all event listeners
    this.clearAllEvents();
  };

  /**
   * Have this source subscribe to another skeleton source. Besides storing
   * required options this method will also register the source to relevant
   * events on the source subscribed to.
   */
  SkeletonSource.prototype.addSubscription = function(subscription) {
    // Don't allow multiple subscriptions to the same source
    var index = this.subscriptions.indexOf(subscription);
    if (-1 !== index) {
      throw new CATMAID.ValueError("Already subscribed to this source");
    }

    var source = subscription.source;
    source.on(source.EVENT_SOURCE_REMOVED, this._onSubscribedSourceRemoved, this);

    var allEvents = subscription.mode === CATMAID.SkeletonSourceSubscription.ALL_EVENTS;
    var onlyRemovals = subscription.mode === CATMAID.SkeletonSourceSubscription.ONLY_REMOVALS;
    var onlyAdditions = subscription.mode === CATMAID.SkeletonSourceSubscription.ONLY_ADDITIONS;
    var onlyUpdates = subscription.mode === CATMAID.SkeletonSourceSubscription.ONLY_UPDATES;

    if (allEvents || onlyAdditions) {
      source.on(source.EVENT_MODELS_ADDED, this._onSubscribedModelsAdded, this);
    }
    if (allEvents || onlyRemovals) {
      source.on(source.EVENT_MODELS_REMOVED, this._onSubscribedModelsRemoved, this);
    }
    if (allEvents || onlyUpdates) {
      source.on(source.EVENT_MODELS_CHANGED, this._onSubscribedModelsChanged, this);
    }

    var models = source.getSelectedSkeletonModels();

    this.subscriptions.push(subscription);

    // Do initial update
    this.loadSubscriptions(models);
  };

  /**
   * Remove a subscription of this source to another source. This method will
   * also unregister this source from events of the subscribed source.
   */
  SkeletonSource.prototype.removeSubscripition = function(subscription) {
    // Raise error if the subscription in question is not part of this source
    var index = this.subscriptions.indexOf(subscription);
    if (-1 === index) {
      throw new CATMAID.ValueError("The subscription isn't part of this source");
    }

    var source = subscription.source;
    source.off(source.EVENT_SOURCE_REMOVED, this._onSubscribedSourceRemoved);

    var allEvents = subscription.mode === CATMAID.SkeletonSourceSubscription.ALL_EVENTS;
    var onlyRemovals = subscription.mode === CATMAID.SkeletonSourceSubscription.ONLY_REMOVALS;
    var onlyAdditions = subscription.mode === CATMAID.SkeletonSourceSubscription.ONLY_ADDITIONS;
    var onlyUpdates = subscription.mode === CATMAID.SkeletonSourceSubscription.ONLY_UPDATES;

    if (allEvents || onlyAdditions) {
      source.off(source.EVENT_MODELS_ADDED, this._onSubscribedModelsAdded);
    }
    if (allEvents || onlyRemovals) {
      source.off(source.EVENT_MODELS_REMOVED, this._onSubscribedModelsRemoved);
    }
    if (allEvents || onlyUpdates) {
      source.off(source.EVENT_MODELS_CHANGED, this._onSubscribedModelsChanged);
    }

    // Remove subscription and update
    this.subscriptions.splice(index);

    // Update
    this.loadSubscriptions({});
  };

  /**
   * Handle removal of a source (e.g. when its widget is closed).
   */
  SkeletonSource.prototype._onSubscribedSourceRemoved = function(source) {
    // Remove all subscriptions with this source
    this.subscriptiona.filter(function(subscription) {
      return this === subscription.source;
    }, source).forEach(function(subscription) {
      this.removeSubscripition(subscription);
    }, this);
  };

  /**
   * Update a single subscription based on its operation.
   *
   * @param subscription Subscription to refresh data for
   * @param op           The type of update
   */
  SkeletonSource.prototype.updateSubscription = function(subscription) {
    // Update this source based on the subscription.
    var models = subscription.source.getSelectedSkeletonModels();
    this.updateModels(models);
  };

  /**
   * Handle the addition of new models from a subscribed source.
   */
  SkeletonSource.prototype._onSubscribedModelsAdded = function(source, models) {
    this.loadSubscriptions(models);
  };

  /**
   * Handle update of models in a subscribed source (e.g. color change).
   */
  SkeletonSource.prototype._onSubscribedModelsUpdated = function(source, models) {
    var subscriptions = this.getSubscriptionsHavingSource(source);
    this.updateFromSubscriptions(subscriptions, models);
  };

  /**
   * Handle removal of models in a subscribed source.
   */
  SkeletonSource.prototype._onSubscribedModelsRemoved = function(source, models) {
    this.loadSubscriptions(models);
  };

  /**
   * Get all skeleton sources this source has subscribed to.
   */
  SkeletonSource.prototype.getSourceSubscriptions = function() {
    return this.subscriptions;
  };

  /**
   * Clear and rebuild skeleton selection of this widget, based on current
   * subscription states. This is currently done in the most naive way without
   * incorporating any hinting to avoid recomputation.
   */
  SkeletonSource.prototype.loadSubscriptions = function(models) {

    // Find a set of skeletons that are removed and one that is added/modified
    // to not require unnecessary reloads.
    var result;
    for (var i=0, max=this.subscriptions.length; i<max; ++i) {
      var sbs = this.subscriptions[i];
      var sbsModels = sbs.source.getSelectedSkeletonModels();
      if (0 === i) {
        result = sbsModels;
        continue;
      }
      if (SkeletonSource.UNION === sbs.op) {
        // Make models of both sources available
        for (var mId in sbsModels) {
          // Use model of earleir source
          if (!result[mId]) {
            result[mId] = sbsModels[mId];
          }
        }
      } else if (SkeletonSource.INTERSECTION === sbs.op) {
        // Make models available that appear in both sources
        for (var mId in result) {
          if (!sbsModels[mId]) {
            delete result[mId]
          }
        }
      } else if (SkeletonSource.DIFFERENCE === sbs.op) {
        // Make models available that don't appear in the current source
        for (var mId in result) {
          if (sbsModels[mId]) {
            delete result[mId]
          }
        }
      } else {
        throw new CATMAID.ValueError("Unknown operation: " + sbs.op);
      }
    }

    // We now know the expected result set, compare it with the current set and
    // remove elements that are not expected anymore. Update the remainder.
    var currentSet = this.getSkeletonModels();
    if (currentSet) {
      var toRemove = [];
      for (var skid in currentSet) {
        if (!result || !(skid in result)) {
          toRemove.push(skid);
        }
      }
      if (toRemove.length > 0) {
        this.removeSkeletons(toRemove);
      }
    }

    // Update all others
    if (result) {
      this.updateModels(result);
    }
  };

  /**
   * Load all subscriptions with their left-associtive operators.
   */
  SkeletonSource.prototype.updateFromSubscriptions = function(subscriptions,
      skeletonIds) {

    // Find all models that are actually used in this source. Depending on the
    // combination of different subscriptions, not all models of all source will
    // be part of the final set.
    var usedSkeletonIds = skeletonIds.filter(function(s) {
      return this.hasSkeleton(s);
    }, this);

    // Update all used models
    this.updateModels(usedSkeletonIds);
  };

  SkeletonSource.prototype.loadSource = function() {
    var models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    if (0 === models.length) {
      CATMAID.info('Selected source is empty.');
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
    CATMAID.annotate_neurons_of_skeletons(this.getSelectedSkeletons());
  };

  /**
   * Return an array of source subscriptions that have the given source
   * associated.
   *
   * @param source The source a returned subscription will have
   */
  SkeletonSource.prototype.getSubscriptionsHavingSource = function(source) {
    return this.subscriptions.filter(function(subscription) {
      return this === subscription.source;
    }, source);
  };

  /**
   * A no-op implementation for highliing a skeleton.
   */
  SkeletonSource.prototype.highlight = function() {};

  /**
   * Represents a subscription to a skeleton source.
   *
   * @param source  The source subscribed to
   * @param colors  Indicates if source colors should be used on update
   * @param op      The operation to be used to combine skeletons
   * @param mode    Optional subscription mode, which events to listen to
   * @param group   Optional group name for skeletons from source
   */
  var SkeletonSourceSubscription = function(source, colors, op, mode, group) {
    this.source = source;
    this.group = group;
    this.colors = colors;
    this.op = op;
    this.mode = mode || SkeletonSourceSubscription.ALL_EVENTS;
  };

  SkeletonSourceSubscription.ALL_EVENTS = 'all';
  SkeletonSourceSubscription.ONLY_ADDITIONS = 'additions-only';
  SkeletonSourceSubscription.ONLY_REMOVALS = 'removals-only';
  SkeletonSourceSubscription.ONLY_UPDATES = 'updates-only';

  // Make skeleton source and subscription available in CATMAID namespace
  CATMAID.SkeletonSource = SkeletonSource;
  CATMAID.SkeletonSourceSubscription = SkeletonSourceSubscription;

})(CATMAID);
