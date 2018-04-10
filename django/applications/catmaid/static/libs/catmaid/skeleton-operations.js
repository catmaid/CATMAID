/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  'use strict';

  /**
   * A skeleton node matcher is an abstract configuration that provides a
   * predicate for deciding whether a particular node is matched by it. Matches
   * can happeen based on a universal match, a meta annotation or the creator
   * ID.
   */
  CATMAID.SkeletonNodeMatcher = function() {

    this.state = {
      metaAnnotationName: null,
      creatorID: null,
      skeletonIDs: new Set(),
      matchAll: false,
      callback: (function (metaAnnotationName, skeletonIDs) {
        this.state.skeletonIDs = skeletonIDs;
      }).bind(this),
    };

    /**
    * Reset the event listener configuration for the currently set mode.
    */
    this.setFilters = function(modeSetting) {
      let state = this.state;

      if (state.metaAnnotationName !== null) {
        CATMAID.annotatedSkeletons.unregister(state.metaAnnotationName, state.callback, true);
      }

      state.skeletonIDs = new Set();
      state.metaAnnotationName = null;
      state.creatorID = null;
      state.matchAll = false;
      if (modeSetting.hasOwnProperty('metaAnnotationName')) {
        state.metaAnnotationName = modeSetting.metaAnnotationName;
        CATMAID.annotatedSkeletons.register(state.metaAnnotationName, state.callback, true);
      } else if (modeSetting.hasOwnProperty('creatorID')) {
        state.creatorID = modeSetting.creatorID;
      } else if (modeSetting.hasOwnProperty('universal')) {
        state.matchAll = modeSetting.universal === 'all';
      }
    };

    /**
    * Refresh any meta-annotation-based filters from the backed.
    */
    this.refresh = function () {
      var jobs = [];
      if (this.state.metaAnnotationName) {
        jobs.push(CATMAID.annotatedSkeletons.refresh(this.state.metaAnnotationName, true));
      }
      return Promise.all(jobs);
    };

    /**
    * Predicate for whether a tracing overlay node is matched by a filter.
    *
    * @param  {Object}  node    Tracing overlay treenode or connector node.
    * @return {Boolean}         True if matched, false otherwise.
    */
    this.isNodeMatched = function (node) {
      var state = this.state;

      if (state.matchAll) return true;
      else if (state.creatorID) return node.user_id === state.creatorID;
      else return state.skeletonIDs.has(node.skeleton_id);
    };
  };

})(CATMAID);
