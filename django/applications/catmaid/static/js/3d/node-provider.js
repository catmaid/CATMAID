/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var RegularNodeProvider = function() {};

  RegularNodeProvider.prototype.get = function(projectId, skeletonIds, options,
      progressCallback, errorCallback) {
    progressCallback = progressCallback || CATMAID.tools.noop;
    errorCallback = errorCallback || CATMAID.tools.noop;
    return new Promise(function(resolve, reject) {
      var url1 = CATMAID.makeURL(projectId + '/skeletons/');
      var url2 = '/compact-detail';

      fetchSkeletons(skeletonIds,
        function(skeletonId) {
          return url1 + skeletonId + url2;
        },
        function(skeletonId) {
          return options;
        },
        progressCallback,
        errorCallback,
        function() {
          resolve();
        },
        'GET');
    });
  };

  // Export node providers
  CATMAID.RegularNodeProvider = RegularNodeProvider;

})(CATMAID);
