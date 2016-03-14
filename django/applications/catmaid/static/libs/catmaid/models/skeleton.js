/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with skeletons, which model
   * neurons. All of them return promises.
   */
  var Skeletons = {};

  // Provide some basic events
  Skeletons.EVENT_SKELETON_DELETED = "skeleton_deleted";
  Skeletons.EVENT_SKELETON_CHANGED = "skeleton_changed";
  CATMAID.asEventSource(Skeletons);

  // Export Skeleton namespace
  CATMAID.Skeletons = Skeletons;

})(CATMAID);

