(function(CATMAID) {

  "use strict";

  /**
   * Obtain the nodes for the passed in skeleton IDs.
   *
   * @param {API} api (Optional) An API from which the node should be queried.
   */
  var RegularNodeProvider = function(api = undefined) {
    this.api = api;
  };

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

    return new Promise((resolve, reject) => {
      fetchSkeletons(skeletonIds,
        function(skeletonId) {
          return `${projectId}/skeletons/${skeletonId}/compact-detail`;
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
        binaryTransfer,
        this.api);
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

  class APINodeProvider {
    constructor(models) {
      this.apiMap = Object.keys(models).reduce((o, e) => {
        o[e] = models[e].api;
        return o;
      }, {});
      this.models = models;
    }

    /**
     * Group skeleton IDs by API and use a dedicated node provider with each
     * one.
     */
    get(projectId, skeletonIds, options, progressCallback, errorCallback) {
      let skeletonsPerPromise = skeletonIds.reduce((o, skeletonId) => {
          // The apiName `undefiend` represents the regular back-end.
          let api = this.apiMap[skeletonId];
          let apiKey = api ? api.name : undefined;
          if (o.has(apiKey)) {
            o.get(apiKey).push(skeletonId);
          } else {
            o.set(apiKey, [skeletonId]);
          }
          return o;
        }, new Map());
      let apiPromises = Array.from(skeletonsPerPromise.keys()).map(apiName => {
          let api = apiName ? CATMAID.Remote.getAPI(apiName) : undefined;
          let nodeProvider = new CATMAID.RegularNodeProvider(api);
          return nodeProvider.get(projectId, skeletonIds, options,
              progressCallback, errorCallback);
        });

      return Promise.all(apiPromises);
    }
  }

  // Export node providers
  CATMAID.RegularNodeProvider = RegularNodeProvider;
  CATMAID.ArborParserNodeProvider = ArborParserNodeProvider;
  CATMAID.APINodeProvider = APINodeProvider;

})(CATMAID);
