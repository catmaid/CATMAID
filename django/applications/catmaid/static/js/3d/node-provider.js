/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var RegularNodeProvider = function() {};

  RegularNodeProvider.prototype.get = function(projectId, skeletonIds, options,
      progressCallback, errorCallback) {
    progressCallback = progressCallback || CATMAID.noop;
    errorCallback = errorCallback || CATMAID.noop;
    options = options || {};

    // Transfer nodes in binary mode by default to save space.
    if (!options.format && CATMAID.Client.Settings.session.binary_data_transfer) {
      options.format = 'msgpack';
    }
    var binaryTransfer = options.format === 'msgpack';

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
        'GET',
        binaryTransfer);
    });
  };

  var ArborParserNodeProvider = function(arborParserMapping) {
    this.skeletonMap = this.parse(arborParserMapping);
  };

  // The context (this) is expected to be an arbor Parser
  var treenodeFromArborParser = function(id) {
    let pos = this.positions[id];
    if (!pos) {
      throw new CATMAID.ValueError("Can't find position for node " + id);
    }
    let parentId = this.arbor.edges[id];
    let userId = -1;
    return [
      parseInt(id, 10),
      parentId,
      userId,
      pos.x,
      pos.y,
      pos.z,
      0,
      5
    ];
  };

  ArborParserNodeProvider.prototype.parse = function(arborParserMapping) {
    let dataMap = new Map();
    arborParserMapping.forEach(function(value, key, map) {
      // Mimic compact-detail API
      let treenodes = value.arbor.nodesArray().map(treenodeFromArborParser, value);
      let parsedData = [treenodes, [], {}, [], []];
      this.set(key, parsedData);
    }, dataMap);
    return dataMap;
  };

  ArborParserNodeProvider.prototype.get = function(projectId, skeletonIds,
      options, progressCallback, errorCallback) {
    progressCallback = progressCallback || CATMAID.noop;
    errorCallback = errorCallback || CATMAID.noop;
    let skeletonMap = this.skeletonMap;
    return new Promise(function(resolve, reject) {
      for (let i=0; i<skeletonIds.length; ++i) {
        let skeletonId = skeletonIds[i];
        let skeletonData = skeletonMap.get(skeletonId);
        if (!skeletonData) {
          errorCallback(skeletonId);
          continue;
        }
        progressCallback(skeletonId, skeletonData);
      }
      resolve();
    });
  };

  // Export node providers
  CATMAID.RegularNodeProvider = RegularNodeProvider;
  CATMAID.ArborParserNodeProvider = ArborParserNodeProvider;

})(CATMAID);
