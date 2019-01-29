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
   */
  class API {
    constructor(name, url, apiKey, httpAuthUser, httpAuthPass) {
      this.name = name;
      this.url = url;
      this.apiKey = apiKey;
      this.httpAuthUser = httpAuthUser;
      this.httpAuthPass = httpAuthPass;
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
  });

  /**
   * Create a new API object based on a Client class setting. It is expected to
   * have at least the fields name and url.
   */
  API.fromSetting = function(setting) {
    return new API(setting.name, setting.url, setting.api_key,
        setting.http_auth_user, setting.http_auth_pass);
  };

  CATMAID.API = API;

})(CATMAID);
