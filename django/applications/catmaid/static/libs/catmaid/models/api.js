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
    }


  }

  /**
   * Information on local environment.
   */
  API.LocalAPI = Object.freeze({
    name: 'Local CATMAID',
    url: '',
    apiKey: undefined,
    httpAuthUser: undefined,
    httpAuthPass: undefined,
    dataSourceId: undefined,
  });

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
      apis.set(undefined, locals);
    }

    return apis;
  };

  /**
   * Attempt to find a a data source known to the back-end that matches this API
   * definition.
   */
  API.linkDataSource = function(projectId, queryApi, queryProjectId) {
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
