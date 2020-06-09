(function(CATMAID) {

  "use strict";

  /**
   * This cache tracks the IDs of all skeletons modeling neurons annotated
   * with (meta-)annotations registered with the cache.
   */
  var AnnotatedSkeletonsCache = function() {
    this.trackedAnnotations = {};

    /**
     * How frequently to update all tracked annotations from backend (in ms).
     * @type {number}
     */
    this.PERIODIC_REFRESH_INTERVAL = 5*60*1000;

    /**
     * Whether to refresh an annotation as soon as it is changed on the client.
     * @type {Boolean}
     */
    this.EAGER_REFRESH = false;

    this.periodicRefreshTimeout = window.setTimeout(
        this._periodicRefresh.bind(this),
        this.PERIODIC_REFRESH_INTERVAL);

    // Listen to annotation deletions so these annotations can be removed from
    // the cache.
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_DELETED,
        this._handleDeletedAnnotations, this);
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this._handleChangedAnnotations, this);
  };

  AnnotatedSkeletonsCache.prototype._getTrackedAnnotation = function (annotationName) {
    if (!this.trackedAnnotations.hasOwnProperty(annotationName)) {
      throw new CATMAID.ValueError('Annotation is not tracked by cache: ' + annotationName);
    }

    return this.trackedAnnotations[annotationName];
  };

  AnnotatedSkeletonsCache.prototype._periodicRefresh = function () {
    Object.keys(this.trackedAnnotations).forEach(function (annotationName) {
      this.refresh(annotationName);
    }, this);

    this.periodicRefreshTimeout = window.setTimeout(
        this._periodicRefresh.bind(this),
        this.PERIODIC_REFRESH_INTERVAL);
  };

  /**
   * Refresh the set of skeleton IDs (meta-)annotated with a tracked annotation,
   * and notify all registered callbacks.
   *
   * @param  {string} annotationName Name of the tracked annotation to refresh.
   */
  AnnotatedSkeletonsCache.prototype.refresh = function (annotationName) {
    var tracked = this._getTrackedAnnotation(annotationName);
    var self = this;
    var meta = [false, false];
    tracked.registered.forEach(function (registered) {
      meta[registered.includeMeta ? 1 : 0] = true;
    });

    var refreshWithMeta = function(includeMeta) {
      // If the annotation is invalid, its skeleton set is empty.
      if (!tracked.id) {
        tracked.skeletonIDs[includeMeta ? 1 : 0] = new Set();
        self.notify(annotationName, includeMeta);
        return;
      }

      var params = {annotated_with: tracked.id, types: 'neuron'};
      if (includeMeta) params.sub_annotated_with = tracked.id;
      return CATMAID
          .fetch(project.id + '/annotations/query-targets',
                 'POST', params)
          .then(function (json) {
            var skids = json.entities.reduce(function (a, e) {
              return a.concat(e.skeleton_ids);
            }, []);
            var newSkeletonIds = new Set(skids);

            if (!CATMAID.tools.areSetsEqual(tracked.skeletonIDs[includeMeta ? 1 : 0], newSkeletonIds)) {
              tracked.skeletonIDs[includeMeta ? 1 : 0] = newSkeletonIds;
              self.notify(annotationName, includeMeta);
            }
          });
    };

    var jobs = [];

    if (meta[0]) {
      jobs.push(refreshWithMeta(false));
    }

    if (meta[1]) {
      jobs.push(refreshWithMeta(true));
    }

    return Promise.all(jobs);
  };

  /**
   * Explicitly let the cache know about skeletons added or removed from an
   * annotation, so that it can notify listeners without waiting on a full
   * refresh.
   *
   * @param  {string}   annotationName     Name of the annotation to notify (if
   *                                       tracked).
   * @param  {number[]} addedSkeletonIDs   An array of skeleton IDs gaining the
   *                                       annotation.
   * @param  {number[]} removedSkeletonIDs An array of skeleton IDs removing the
   *                                       annotation.
   */
  AnnotatedSkeletonsCache.prototype.explicitChange = function (annotationName, addedSkeletonIDs, removedSkeletonIDs) {
    if (!this.trackedAnnotations.hasOwnProperty(annotationName)) return;
    var tracked = this._getTrackedAnnotation(annotationName);

    addedSkeletonIDs = addedSkeletonIDs || [];
    removedSkeletonIDs = removedSkeletonIDs || [];

    addedSkeletonIDs.forEach(function (addedSkeletonID) {
      tracked.skeletonIDs[0].add(addedSkeletonID);
      tracked.skeletonIDs[1].add(addedSkeletonID);
    });

    removedSkeletonIDs.forEach(function (removedSkeletonID) {
      tracked.skeletonIDs[0].delete(removedSkeletonID);
      tracked.skeletonIDs[1].delete(removedSkeletonID);
    });

    this.notify(annotationName);
  };

  /**
   * Notify all callbacks registered with an annotation with the current set
   * of (meta-)annotated skeleton IDs.
   *
   * @param  {string}  annotationName Name of the tracked annotation to notify.
   * @param  {Boolean} includeMeta    Whether to notify callbacks registered for
   *                                  skeletons directly annotated with the
   *                                  annotation (false) or those registered
   *                                  for both direct and meta-annotations by
   *                                  the annotation (true). If not specified,
   *                                  both sets of callbacks are notified.
   */
  AnnotatedSkeletonsCache.prototype.notify = function (annotationName, includeMeta) {
    var tracked = this._getTrackedAnnotation(annotationName);
    var includeBoth = typeof includeMeta === 'undefined';
    includeMeta = !!includeMeta;

    tracked.registered.forEach(function (registered) {
      if (includeBoth || includeMeta === registered.includeMeta) {
        registered.callback(annotationName,
                            tracked.skeletonIDs[registered.includeMeta ? 1 : 0]);
      }
    });
  };

  /**
   * Register an annotation to be tracked by the cache and a callback to notify
   * when the set of annotated skeleton IDs changes.
   *
   * @param  {string}  annotationName Name of the tracked annotation to notify.
   * @param  {Function} callback      Notification callback, takes two
   *                                  arguments: the annotation name and the
   *                                  set of skeleton IDs.
   * @param  {Boolean} includeMeta    Whether to register for skeletons directly
   *                                  annotated with the annotation (false) or
   *                                  for both direct and meta-annotations by
   *                                  the annotation (true).
   */
  AnnotatedSkeletonsCache.prototype.register = function (annotationName, callback, includeMeta) {
    var newlyTracked = false;
    if (this.trackedAnnotations.hasOwnProperty(annotationName)) {
      var tracked = this.trackedAnnotations[annotationName];
    } else {
      newlyTracked = true;
      var tracked = {
        id: CATMAID.annotations.getID(annotationName),
        registered: new Set(),
        skeletonIDs: [new Set(), new Set()],
      };
      this.trackedAnnotations[annotationName] = tracked;
    }

    tracked.registered.add({callback: callback, includeMeta: !!includeMeta});

    if (newlyTracked) this.refresh(annotationName);
  };

  /**
   * Remove a callback registered to an annotation tracked by the cache. If this
   * was the last callback registered to the annotation, it will be untracked.
   *
   * @param  {string}  annotationName Name of the annotation to unregister.
   * @param  {Function} callback      Notification callback, takes two
   *                                  arguments: the annotation name and the
   *                                  set of skeleton IDs.
   * @param  {Boolean} includeMeta    Whether the callback was registered for
   *                                  direction annotations only (false) or
   *                                  direct and meta-annotations (true). Must
   *                                  be the same as the value passed when the
   *                                  callback was registered.
   */
  AnnotatedSkeletonsCache.prototype.unregister = function (annotationName, callback, includeMeta) {
    var tracked = this._getTrackedAnnotation(annotationName);
    var includeBoth = typeof includeMeta === 'undefined';
    includeMeta = !!includeMeta;
    tracked.registered.forEach(function (entry) {
      if (callback === entry.callback && (includeBoth || includeMeta === entry.includeMeta)) {
        tracked.registered.delete(entry);
      }
    });

    if (tracked.registered.size === 0) {
      delete this.trackedAnnotations[annotationName];
    }
  };

  AnnotatedSkeletonsCache.prototype._handleDeletedAnnotations = function (annotationIDs) {
    // Cannot rely on annotation cache to get name from ID, because it may have
    // already removed this entry.

    Object.keys(this.trackedAnnotations).forEach(function (annotationName) {
      var tracked = this.trackedAnnotations[annotationName];

      if (-1 !== annotationIDs.indexOf(tracked.id)) {
        tracked.skeletonIDs[0].clear();
        tracked.skeletonIDs[1].clear();
        this.notify(annotationName);
        tracked.registered.clear();

        delete this.trackedAnnotations[annotationName];
      }
    }, this);
  };

  AnnotatedSkeletonsCache.prototype._handleChangedAnnotations = function (changedObjects, annotationList) {
    if (!this.EAGER_REFRESH) return;

    annotationList.forEach(function (a) {
      if (this.trackedAnnotations.hasOwnProperty(a.name)) {
        this.refresh(a.name);
      }
    });
  };

  // Export the annotation cache constructor and a generally available instance.
  CATMAID.AnnotatedSkeletonsCache = AnnotatedSkeletonsCache;
  CATMAID.annotatedSkeletons = new CATMAID.AnnotatedSkeletonsCache();

})(CATMAID);
