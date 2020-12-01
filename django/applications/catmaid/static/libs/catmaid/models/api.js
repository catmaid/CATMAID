(function(CATMAID) {

  'use strict';

  /**
   * A generic API.
   *
   * @param {string} name      A name for this API
   * @param {string} url       The URL of the API
   * @param {string} api_key   (optional) An API key used for this API
   * @param {string} http_user (optional) HTTP authentication user
   * @param {string} http_pass (optional) HTTP authentication password
   * @param {string} apiType   (optional) A token to represent the type of API.
   *                           If not probided, 'catmaid' is assumed.
   */
  class API {
    constructor(name, url, apiKey, httpAuthUser, httpAuthPass, apiType) {
      this.name = name;
      this.url = url;
      this.apiKey = apiKey;
      this.httpAuthUser = httpAuthUser;
      this.httpAuthPass = httpAuthPass;
      this.dataSourceId = undefined;
      this.type = apiType || 'catmaid';
      this.isLocal = !url;
    }
  }

  /**
   * Information on local environment.
   */
  API.LocalAPI = Object.freeze(new API('This CATMAID'));

  /**
   * Get the most simple API there is. It doesn't contain any particular
   * parameters and is treated as the local CATMAID instance.
   */
  API.getLocalAPI = function(name = "This CATMAID") {
    return new API(name);
  };

  /**
   * Create a new API object based on a Client class setting. It is expected to
   * have at least the fields name and url.
   */
  API.fromSetting = function(setting) {
    return new API(setting.name, setting.url, setting.api_key,
        setting.http_auth_user, setting.http_auth_pass, setting.type);
  };

  /**
   * Test if two API instances have the same name.
   */
  API.equals = function(a, b) {
    return (!a && !b) || (a && b && a.name === b.name);
  };

  /**
   * Find all models for each API instance.
   */
  API.splitByAPI = function(obj) {
    let apis = new Map();
    let remoteApiModelsSeen = 0;
    let localApiModelsSeen = 0;

    for (let o in obj) {
      let model = obj[o];
      // Common case: a single API (the regular back-end). Therefore, first assign
      // the passed in object first to the local back-end.
      if (model.api) {
        let target = apis.get(model.api.name);
        if (!target) {
          target = {};
          apis.set(model.api.name, target);
        }
        target[o] = model;
        ++remoteApiModelsSeen;
      } else if (localApiModelsSeen === 0) {
        apis.set(undefined, obj);
      }
    }

    // If the common case assumption was wrong, create a new models object for
    // the local-backend.
    if (remoteApiModelsSeen > 0) {
      let locals = {};
      for (let o in obj) {
        let model = obj[o];
        if (!model.api) {
          locals[o] = model;
        }
      }
      if (!CATMAID.tools.isEmpty(locals)) {
        apis.set(undefined, locals);
      }
    }

    return apis;
  };

  /**
   * Similar to API.splitByAPI, but also respects the project ID and will return
   * return a list of RemoteProject instances.
   *
   * @param {Object} models     An object mapping skeleton IDs to skelteon model objects
   * @returns {RemoteProject[]} A list of remote project objects.
   */
  API.getModelCollections = function(models, defaultProjectId) {
    // Fast path for case with only local models:
    if (!CATMAID.API.hasRemoteData(models)) {
      return [new CATMAID.ModelCollection(CATMAID.API.LocalAPI, defaultProjectId, models)];
    }

    let modelCollections = new Map();
    for (let key in models) {
      let model = models[key];
      let api = model.api || CATMAID.API.LocalAPI;
      let mcKey = `${api.name}-${model.projectId}`;
      let mc = modelCollections.get(mcKey);
      if (!mc) {
        let projectId = model.projectId ? model.projectId : defaultProjectId;
        mc = new CATMAID.ModelCollection(api, projectId);
        modelCollections.set(mcKey, mc);
      }
      mc.addModel(model);
    }
    return Array.from(modelCollections.values());
  };

  /**
   * A predicate to test if a skeleton map object cotnains remote data.
   */
  API.hasRemoteData = function(obj) {
    for (let s in obj) {
      if (obj[s].api) return true;
    }
    return false;
  };

  /**
   * Attempt to find a a data source known to the back-end that matches this API
   * definition.
   */
  API.linkDataSource = function(projectId, queryApi, queryProjectId) {
    if (queryApi.isLocal) {
      return Promise.resolve(true);
    }
    return CATMAID.fetch(`${projectId}/origins/`)
      .then(datasources => {
        let normalizeUrl = /^(\w+:\/\/)?(.*)/;
        let normalizeUrl2 = /\/$/;
        let found = false;
        for (let datasource of datasources) {
          // Compare URLs by removing the protocol and enforce trailing slash
          let dsUrl = datasource.url.replace(normalizeUrl, '$2').replace(normalizeUrl2, '') + '/';
          let apiUrl = queryApi.url.replace(normalizeUrl, '$2').replace(normalizeUrl2, '') + '/';

          if (apiUrl === dsUrl && queryProjectId == datasource.project) {
            queryApi.dataSourceId = datasource.id;
            found = true;
            break;
          }
        }
        return found;
      });
  };

  CATMAID.API = API;

})(CATMAID);
