/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  'use strict';

  // Keep a copy of the available relations.
  var relationCache = null;

  var Relations = {
    list: function(projectId, forceCacheUpdate) {
      if (forceCacheUpdate || !relationCache) {
        return CATMAID.fetch(projectId + '/ontology/relations')
          .then(function(result) {
            relationCache = result;
            return result;
          });
      } else {
        return Promise.resolve(relationCache);
      }
    }
  };

  // Export
  CATMAID.Relations = Relations;

})(CATMAID);
