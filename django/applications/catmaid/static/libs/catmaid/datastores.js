(function (CATMAID) {

  "use strict";

  /**
   * Persists key-value data through a backend API.
   *
   * @class DataStore
   * @constructor
   * @param {string} name Name of this datastore, alphanumeric and hyphens only.
   */
  function DataStore(name) {
    this.name = name;
    this.entries = null;

    CATMAID.asEventSource(this);
  }

  /**
   * Enumerate the user and project scopes for unique key-value entries provided
   * by the datastore.
   * @type {[string]}
   */
  DataStore.SCOPES = [
    'USER_PROJECT',
    'USER_DEFAULT',
    'PROJECT_DEFAULT',
    'GLOBAL'
  ];

  DataStore.EVENT_LOADED = 'event_loaded';

  /**
   * Clear any listeners to this store's events.
   */
  DataStore.prototype.destroy = function () {
    this.clear(DataStore.EVENT_LOADED);
  };

  /**
   * Load datastore values for the current user and project as well as
   * defaults.
   *
   * @return {Promise} Promise resolving once the datastore values are loaded.
   */
  DataStore.prototype.load = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      requestQueue.register(
          CATMAID.makeURL('/client/datastores/' + self.name + '/'),
          'GET',
          {project_id: project ? project.id : undefined},
          CATMAID.jsonResponseHandler(
              function (data) {
                self.entries = data.reduce(
                    function (e, d) {
                      if (d.project) {
                        var scope = d.user ? 'USER_PROJECT' : 'PROJECT_DEFAULT';
                      } else {
                        var scope = d.user ? 'USER_DEFAULT' : 'GLOBAL';
                      }

                      if (!e.has(d.key)) {
                        e.set(d.key, {});
                      }
                      e.get(d.key)[scope] = {
                        dirty: false,
                        value: $.parseJSON(d.value)
                      };
                      return e;
                    },
                    new Map());
                self.trigger(DataStore.EVENT_LOADED, self);
                resolve();
              },
              function (error) {
                if (error.status === 404) {
                  self.entries = new Map();
                  self.trigger(DataStore.EVENT_LOADED, self);
                  resolve();
                  return true;
                } else {
                  reject();
                }
              }));
    });
  };

  /**
   * Retrieve values present in the datastore for a given key. Up to four
   * values may be returned, one for each scope.
   *
   * @param  {string} key Key in this datastore whose values to retrieve.
   * @return {Promise}    Promise yielding a values object, whose attributes
   *                      are scopes.
   */
  DataStore.prototype.get = function (key) {
    if (this.entries === null) {
      return this.load().then(this.get.bind(this, key));
    }

    var values = $.extend({}, this.entries.get(key));
    values = Object.keys(values).reduce(function (o, scope) {
      o[scope] = values[scope].value;
      return o;
    }, {});
    return Promise.resolve(values);
  };

  /**
   * Set a value in this datastore for a specified key and scope. Replaces any
   * existing value for the specified key and scope.
   *
   * @param  {string}  key          Key in this datastore whose value to set.
   * @param  {Object}  value        Object to store as the value.
   * @param  {string}  scope        Scope (from DataStore.SCOPES) for which to
   *                                set the specified key.
   * @param  {boolean} writeThrough True to immediately write the new value to
   *                                the backend.
   * @return {Promise}              Promise resolving once the backend store is
   *                                complete, or immediately if writeThrough is
   *                                false.
   */
  DataStore.prototype.set = function (key, value, scope, writeThrough) {
    if (DataStore.SCOPES.indexOf(scope) === -1)
      throw new TypeError('Unknown datastore scope.');

    if (!this.entries.has(key)) {
      this.entries.set(key, {});
    }
    this.entries.get(key)[scope] = {
      dirty: true,
      value: value
    };

    if (writeThrough) return this._store(key, scope);
    else Promise.resolve();
  };

  /**
   * Store the current value for a specified key and scope to the backend.
   *
   * @param  {string}  key          Key in this datastore whose value to store.
   * @param  {string}  scope        Scope (from DataStore.SCOPES) to store.
   * @return {Promise}              Promise resolving once the backend store is
   *                                complete.
   */
  DataStore.prototype._store = function (key, scope) {
    var entry = this.entries.get(key)[scope];
    entry.dirty = false;
    var self = this;
    return new Promise(function (resolve, reject) {
      requestQueue.register(
          CATMAID.makeURL('/client/datastores/' + self.name + '/'),
          'PUT',
          {
            project_id: (scope === 'USER_DEFAULT' ||
                         scope === 'GLOBAL') ?
                undefined : project.id,
            ignore_user: scope === 'PROJECT_DEFAULT' ||
                         scope === 'GLOBAL',
            key: key,
            value: JSON.stringify(entry.value)
          },
          CATMAID.jsonResponseHandler(resolve, reject));
    });
  };

  /**
   * Store any values that are dirty, that is, values that have been changed
   * using set but have not been stored to the backend.
   */
  DataStore.prototype._storeDirty = function () {
    this.entries.forEach(function (scopes, key) {
      Object.keys(scopes).forEach(function (scope) {
        var entry = scopes[scope];
        if (entry.dirty) {
          this._store(key, scope);
        }
      }, this);
    }, this);
  };

  CATMAID.DataStore = DataStore;

  /**
   * A manager for loading, retrieving and reloading DataStores. Most access
   * to stores should be through this manager's get method.
   */
  CATMAID.DataStoreManager = (function () {
    var datastores = new Map();

    return {
      get: function (name) {
        if (datastores.has(name)) {
          return datastores.get(name);
        } else {
          var store = new DataStore(name);
          datastores.set(name, store);
          return store;
        }
      },

      reloadAll: function () {
        var loaders = [];
        datastores.forEach(function (datastore) {
          loaders.push(datastore.load());
        });
        return Promise.all(loaders);
      }
    };
  })();

})(CATMAID);
