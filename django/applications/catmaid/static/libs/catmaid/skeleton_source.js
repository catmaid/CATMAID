/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * A skeleton source is an object that manages a set of skeletons of which a
   * subset can be marked as selected.
   *
   * @params {Boolean} noDefaultSelection Optional, default: false, Whether or
   *                                      not to prevent this source to appear
   *                                      as a default selection in other
   *                                      widgets.
   */
  var SkeletonSource = function(register, noDefaultSelection) {
    if (register) this.registerSource();
    this.APPEND_WARNING_THRESHOLD = 50;
    // Initialize subscriptions
    this.subscriptions = [];
    this.ignoreLocal = false;
    this.noDefaultSelection = !!noDefaultSelection;
  };

  // Operations that can be used to combine multiple sources.
  SkeletonSource.UNION = 'union';
  SkeletonSource.INTERSECTION = 'intersection';
  SkeletonSource.DIFFERENCE = 'difference';
  SkeletonSource.operations = {};
  SkeletonSource.operations[SkeletonSource.UNION] = '\u222A';
  SkeletonSource.operations[SkeletonSource.INTERSECTION] = '\u2229';
  SkeletonSource.operations[SkeletonSource.DIFFERENCE] = '\u2216';


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
  // to a skeleton source, alongside an object mapping skeleton IDs to models.
  SkeletonSource.prototype.EVENT_MODELS_ADDED = "skeleton_source_models_added";
  // The EVENT_MODELS_REMOVED event is triggered when skeleton models were
  // removed from a source, alongside an object mapping skeleton IDs to models.
  SkeletonSource.prototype.EVENT_MODELS_REMOVED = "skeleton_source_models_removed";
  // The EVENT_MODELS_CHANGED event is triggered when properties of skeleton
  // source models were updated (e.g. color), alongside an object mapping
  // skeleton IDs to models.
  SkeletonSource.prototype.EVENT_MODELS_CHANGED = "skeleton_source_models_changed";
  // The EVENT_SUBSCRIPTION_ADDED event is fired once a new subscription was
  // added to a source.
  SkeletonSource.prototype.EVENT_SUBSCRIPTION_ADDED = "skeleton_source_subscription_added";
  // The EVENT_SUBSCRIPTION_REMOVED event is fired once a new subscription was
  // removed from a source.
  SkeletonSource.prototype.EVENT_SUBSCRIPTION_REMOVED = "skeleton_source_subscription_removed";

  SkeletonSource.prototype.registerSource = function() {
    this.trigger(this.EVENT_SOURCE_ADDED, this);
    CATMAID.skeletonListSources.add(this);
  };

  SkeletonSource.prototype.unregisterSource = function() {
    this.trigger(this.EVENT_SOURCE_REMOVED, this);
    CATMAID.skeletonListSources.remove(this);
    // Remove all subscriptions
    if (this.subscriptions) {
      this.subscriptions.forEach(function(s) {
        s.unregister();
      }, this);
    }
    // Remove all event listeners
    this.clearAllEvents();
  };

  /**
   * Have this source subscribe to another skeleton source. Besides storing
   * required options this method will also register the source to relevant
   * events on the source subscribed to. Cycles are not allowed.
   *
   * @param {Subscription} subscription The subscription instance to add
   * @param {boolean}      ignoreEmpty  Optional, if an initial subscription
   *                                    update should also be performed without
   *                                    source skeletons. Default is true.
   */
  SkeletonSource.prototype.addSubscription = function(subscription, ignoreEmpty) {
    // Don't allow same subscription instance to be added twice
    var index = this.subscriptions.indexOf(subscription);
    if (-1 !== index) {
      throw new CATMAID.SubscriptionError("Subscription already in use");
    }

    // Don't allow cycles, we want subscripts to form a DAG. Test if the
    // new subscription's source is already referenced.
    var seen = new Set([this]);
    var workingSet = [subscription];
    while (workingSet.length > 0) {
      var sub = workingSet.pop();
      // Raise error if this subscription's source has been seen already.
      if (seen.has(sub.source)) {
        throw new CATMAID.SubscriptionError("Cycles are not allowed when " +
            "adding subscriptions");
      }
      // If the source was not seen, check its subscriptsions
      seen.add(sub.source);
      Array.prototype.push.apply(workingSet, sub.source.subscriptions);
    }

    subscription.register(this);
    this.subscriptions.push(subscription);

    // Do initial update
    this.loadSubscriptions(ignoreEmpty);

    this.trigger(this.EVENT_SUBSCRIPTION_ADDED, this, subscription);
  };

  /**
   * Remove a subscription of this source to another source. This method will
   * also unregister this source from events of the subscribed source.
   */
  SkeletonSource.prototype.removeSubscription = function(subscription) {
    // Raise error if the subscription in question is not part of this source
    var index = this.subscriptions ? this.subscriptions.indexOf(subscription) : -1;
    if (-1 === index) {
      throw new CATMAID.ValueError("The subscription isn't part of this source");
    }

    subscription.unregister();

    // Remove subscription and update
    this.subscriptions.splice(index, 1);

    // Update
    this.loadSubscriptions();

    this.trigger(this.EVENT_SUBSCRIPTION_REMOVED, this, subscription);
  };

  /**
   * Convenience method to remove all subscriptions at once.
   */
  SkeletonSource.prototype.removeAllSubscriptions = function() {
    this.subscriptions.forEach(this.removeSubscription.bind(this));
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
   *
   * @param {boolean} ignoreEmpty Optional, if true no initial target update
   *                              will be performed if the source is empty.
   */
  SkeletonSource.prototype.loadSubscriptions = function(ignoreEmpty) {

    // Find a set of skeletons that are removed and one that is added/modified
    // to not require unnecessary reloads.
    var result = this.ignoreLocal ? {} : this.getSkeletonModels();
    for (var i=0, max=this.subscriptions.length; i<max; ++i) {
      var subscription = this.subscriptions[i];
      var subscriptionModels = subscription.getModels();
      var useTargetColor = !subscription.colors;

      // Always use union for combination with local/empty set
      var op = 0 === i ? SkeletonSource.UNION : subscription.op;
      if (SkeletonSource.UNION === op) {
        // Make models of both sources available, use target color if available
        // and no colors should by synced.
        for (var mId in subscriptionModels) {
          var targetModel = result[mId];
          var model = subscriptionModels[mId];
          if (targetModel && useTargetColor) {
            model.color.copy(targetModel.color);
          }
          result[mId] = model;
        }
      } else if (SkeletonSource.INTERSECTION === op) {
        // Make models available that appear in both sources, use target color
        // if available and no colors should by synced.
        for (var mId in result) {
          var targetModel = result[mId];
          var model = subscriptionModels[mId];
          if (model) {
            if (targetModel && useTargetColor) {
              model.color.copy(targetModel.color);
            }
            result[mId] = model;
          } else {
            delete result[mId];
          }
        }
      } else if (SkeletonSource.DIFFERENCE === op) {
        // Make models available that don't appear in the current source
        for (var mId in result) {
          if (subscriptionModels[mId]) {
            delete result[mId];
          }
        }
      } else {
        throw new CATMAID.ValueError("Unknown operation: " + op);
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
    if (!ignoreEmpty || (result && !CATMAID.tools.isEmpty(result))) {
      this.updateModels(result);
    }
  };

  /**
   * Load all skeletons from the currently selected source (of the target
   * instance).
   *
   * @param silent {bool} Optional, don't show warnings and confirmation
   *                      dialogs. Defaults to false.
   */
  SkeletonSource.prototype.loadSource = function(silent) {
    var models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    var numModels = Object.keys(models).length;
    if (0 === numModels) {
      if (!silent) {
        CATMAID.info('Selected source is empty.');
      }
      return false;
    }
    if (numModels > this.APPEND_WARNING_THRESHOLD && !silent) {
      if (!window.confirm('This will load a large number of skeletons (' +
          numModels + '). Are you sure you want to continue?')) {
        return false;
      }
    }

    this.append(models);
    return true;
  };

  /**
   * Convenience method to append lists of skeleton IDs rather than maps
   * of ID vs SkeletonModel instances.
   *
   * All this method does is create the models and call this.append.
   *
   * This method is intended for scripting from the console.
   */
  SkeletonSource.prototype.appendSkeletons = function(skids) {
    this.append(skids.reduce(function(o, skid) {
      o[skid] = new CATMAID.SkeletonModel(skid, "", new THREE.Color(255, 255, 0));
      return o;
    }, {}));
  };

  /**
   * Get a list of source skeleton IDs.
   */
  SkeletonSource.prototype.getSourceSkeletons = function(silent) {
    var skeletons = CATMAID.skeletonListSources.getSelectedSkeletons(this, silent);
    return skeletons;
  };

  SkeletonSource.prototype.updateOneModel = function(model, source_chain) {
    var models = {};
    models[model.id] = model;
    this.updateModels(models, source_chain);
  };

  SkeletonSource.prototype.triggerChange = function(models) {
    this.trigger(this.EVENT_MODELS_CHANGED, models);
  };

  SkeletonSource.prototype.triggerAdd = function(models) {
    this.trigger(this.EVENT_MODELS_ADDED, models);
  };

  SkeletonSource.prototype.triggerRemove = function(models) {
    this.trigger(this.EVENT_MODELS_REMOVED, models);
  };

  SkeletonSource.prototype.getSelectedSkeletons = function() {
      return Object.keys(this.getSelectedSkeletonModels());
  };

  SkeletonSource.prototype.annotate_skeleton_list = function() {
    CATMAID.annotate_neurons_of_skeletons(this.getSelectedSkeletons());
  };

  SkeletonSource.prototype.annotateSkeletonsWithName = function() {
    return CATMAID.annotateSkeletonsWithName(this.getSelectedSkeletons());
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
   * @param selectionBased Addition and removal are based on the selection state
   * @param op      The operation to be used to combine skeletons
   * @param mode    Optional subscription mode, which events to listen to
   * @param group   Optional group name for skeletons from source
   */
  var SkeletonSourceSubscription = function(source, colors, selectionBased, op,
      mode, group) {
    this.source = source;
    this.group = group;
    this.colors = colors;
    this.selectionBased = selectionBased;
    this.op = op;
    this.mode = mode || SkeletonSourceSubscription.ALL_EVENTS;
    this.target = null;
  };

  SkeletonSourceSubscription.ALL_EVENTS = 'all';
  SkeletonSourceSubscription.SELECTION_BASED = 'selection-based';
  SkeletonSourceSubscription.ONLY_ADDITIONS = 'additions-only';
  SkeletonSourceSubscription.ONLY_REMOVALS = 'removals-only';
  SkeletonSourceSubscription.ONLY_UPDATES = 'updates-only';

  /**
   * Register a target with this subscription and listen to events of the source
   * with respect to the selected filters. If there are any, previous targets
   * will be unregistered. A target is expected to be a skeleton source as well.
   */
  SkeletonSourceSubscription.prototype.register = function(target, keepCache) {
    // Unregister from previous target, if any
    if (this.target) {
      this.unregister(keepCache);
    }
    this.target = target;

    this.source.on(this.source.EVENT_SOURCE_REMOVED, this._onSubscribedSourceRemoved, this);

    var allEvents = this.mode === CATMAID.SkeletonSourceSubscription.ALL_EVENTS;
    var onlyRemovals = this.mode === CATMAID.SkeletonSourceSubscription.ONLY_REMOVALS;
    var onlyAdditions = this.mode === CATMAID.SkeletonSourceSubscription.ONLY_ADDITIONS;
    var onlyUpdates = this.mode === CATMAID.SkeletonSourceSubscription.ONLY_UPDATES;

    if (allEvents || onlyAdditions) {
      this.source.on(this.source.EVENT_MODELS_ADDED, this._onSubscribedModelsAdded, this);
    }
    if (allEvents || onlyRemovals) {
      this.source.on(this.source.EVENT_MODELS_REMOVED, this._onSubscribedModelsRemoved, this);
    }
    if (allEvents || onlyUpdates) {
      this.source.on(this.source.EVENT_MODELS_CHANGED, this._onSubscribedModelsChanged, this);
    }

    if (!keepCache) {
      // Populate cache with current source state
      this.modelCache = this.getModels(true);
    }
  };

  /**
   * Remove all listeners from the current source and drop cache.
   */
  SkeletonSourceSubscription.prototype.unregister = function(keepCache) {
    this.source.off(this.source.EVENT_SOURCE_REMOVED, this._onSubscribedSourceRemoved, this);

    var allEvents = this.mode === CATMAID.SkeletonSourceSubscription.ALL_EVENTS;
    var onlyRemovals = this.mode === CATMAID.SkeletonSourceSubscription.ONLY_REMOVALS;
    var onlyAdditions = this.mode === CATMAID.SkeletonSourceSubscription.ONLY_ADDITIONS;
    var onlyUpdates = this.mode === CATMAID.SkeletonSourceSubscription.ONLY_UPDATES;

    if (allEvents || onlyAdditions) {
      this.source.off(this.source.EVENT_MODELS_ADDED, this._onSubscribedModelsAdded, this);
    }
    if (allEvents || onlyRemovals) {
      this.source.off(this.source.EVENT_MODELS_REMOVED, this._onSubscribedModelsRemoved, this);
    }
    if (allEvents || onlyUpdates) {
      this.source.off(this.source.EVENT_MODELS_CHANGED, this._onSubscribedModelsChanged, this);
    }

    if (!keepCache) {
      // Drop cache entry
      this.modelCache = null;
    }

    this.target = null;
  };

  /**
   * Handle removal of a source (e.g. when its widget is closed).
   */
  SkeletonSourceSubscription.prototype._onSubscribedSourceRemoved = function(source) {
    this.target.removeSubscription(this);
  };

  /**
   * Get all models available from this subscription. By default a cached
   * version is used, which can be disabled. If this subscription is selection
   * based, only selected models will be retrieved.
   */
  SkeletonSourceSubscription.prototype.getModels = function(nocache) {
    var getModels = this.selectionBased ? this.source.getSelectedSkeletonModels :
        this.source.getSkeletonModels;
    return nocache ? getModels.call(this.source) : this.modelCache;
  };

  /**
   * Handle the addition of new models from a subscribed source.
   */
  SkeletonSourceSubscription.prototype._onSubscribedModelsAdded = function(
      models, order) {
    // Update cache
    for (var mId in models) {
      var m = models[mId];
      // Only add selected items in selection based sync
      if (this.selectionBased && !m.selected) {
        continue;
      }
      this.modelCache[mId] = models[mId];
    }

    this.target.loadSubscriptions();
  };

  /**
   * Handle update of models in a subscribed source (e.g. color change).
   */
  SkeletonSourceSubscription.prototype._onSubscribedModelsChanged = function(models) {
    // Update cache
    for (var mId in models) {
      var m = models[mId];
      // Remove unselected items for selection based sync
      if (this.selectionBased && !m.selected) {
        delete this.modelCache[mId];
      } else {
        this.modelCache[mId] = models[mId];
      }
    }
    this.target.loadSubscriptions();
  };

  /**
   * Handle removal of models in a subscribed source.
   */
  SkeletonSourceSubscription.prototype._onSubscribedModelsRemoved = function(models) {
    // Update cache
    for (var mId in models) {
      delete this.modelCache[mId];
    }
    this.target.loadSubscriptions();
  };

  /**
   * Set subscription mode of this subscription. This removes all event
   * listeners and recreates only the needed ones.
   */
  SkeletonSourceSubscription.prototype.setMode = function(mode) {
    if (mode !== this.mode) {
      // Re-register to update listeners
      var target = this.target;
      if (target) {
        this.unregister(true);
        this.mode = mode;
        this.register(target, true);
      } else {
        this.mode = mode;
      }
    }
  };

  /**
   * A simple permission error type to indicate some lack of permissions.
   */
  var SubscriptionError = function(message, detail) {
    CATMAID.Error.call(this, message, detail);
  };

  SubscriptionError.prototype = Object.create(CATMAID.Error.prototype);
  SubscriptionError.prototype.constructor = CATMAID.SubscriptionError;

  // Make skeleton source and subscription available in CATMAID namespace
  CATMAID.SkeletonSource = SkeletonSource;
  CATMAID.SkeletonSourceSubscription = SkeletonSourceSubscription;
  CATMAID.SubscriptionError = SubscriptionError;

})(CATMAID);
