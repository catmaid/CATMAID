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
    },

    getNameMap: function(projectId, forceCacheUpdate) {
      return CATMAID.Relations.list(projectId, forceCacheUpdate)
        .then(function(relationIds) {
          let relationNames = {};
          for (let relationName in relationIds) {
            let relationId = relationIds[relationName];
            relationNames[relationId] = relationName;
          }
          return relationNames;
        });
    }
  };

  // Export
  CATMAID.Relations = Relations;

})(CATMAID);
