(function(CATMAID) {

  'use strict';

  // Keep a copy of the available relations for each back-end.
  var relationCaches = new Map();

  var Relations = {
    list: function(projectId, forceCacheUpdate, api = undefined) {
      let relationCache = relationCaches.get(api ? api.name : null);
      if (forceCacheUpdate || !relationCache) {
        return CATMAID.fetch({
            url: `${projectId}/ontology/relations`,
            api: api,
          })
          .then(function(result) {
            relationCaches.set(api ? api.name : null, result);
            return result;
          });
      } else {
        return Promise.resolve(relationCache);
      }
    },

    /**
     * Get a mapping from relation ID to relation name.
     *
     * @param {API} api (Optional The back-end to talk to.
     */
    getNameMap: function(projectId, forceCacheUpdate, api = undefined) {
      return CATMAID.Relations.list(projectId, forceCacheUpdate, api)
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
