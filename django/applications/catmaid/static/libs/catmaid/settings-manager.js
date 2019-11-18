(function (CATMAID) {

  "use strict";

  /**
   * Manages and persists key-value client settings.
   *
   * Settings are cascaded through a series of scopes:
   *
   *   - CATMAID defaults
   *   - global
   *   - project-defaults
   *   - user-defaults
   *   - user-project session
   *
   * Each scope may declare a value to be not overridable (i.e., locked),
   * preventing more specific scopes from changing the value.
   *
   * The results of applying this cascade at each scope level are
   * accessible through attributes on this Settings object, e.g.:
   *
   *     var foo = new CATMAID.Settings(...)
   *     var a = foo.session.<setting entry name>
   *     foo.session.<setting entry name> = 'test'
   *
   * The 'session' scope setting value should be used when applying settings.
   * Setting a scope setting value in this way also persists it and updates
   * the cascaded settings values for all scopes.
   *
   * Scoped values are persisted to the backend through the 'settings'
   * DataStore. Values in this datastore are keyed by this Settings object
   * name and are of the form:
   *
   *     {
   *       version: <version #>,
   *       entries: {
   *         <setting entry name>: {
   *           value: <value>,
   *           overridable: <boolean value>
   *         }
   *       }
   *     }
   *
   * For example:
   *
   *     myModuleSettings = new CATMAID.Settings(
   *         'my-module',
   *         {
   *           version: 0,
   *           entries: {
   *             example_setting_name: {
   *               default: "some default value"
   *             }
   *           },
   *           migrations: {}
   *         });
   *
   * The settings module identifier, 'my-module', must be unique. The useful
   * value of the setting is then accessible as:
   *
   *     var a = myModuleSettings.session.example_setting_name;
   *
   * Version number, the name of settings entries, and their default CATMAID
   * value are specified by this Settings object's schema. Schemas may also
   * specify migrations between different schema versions. Schemas take the
   * form:
   *
   *     {
   *       version: <current schema version #>,
   *       entries: {
   *         <setting entry name>: {
   *           default: <default setting value>
   *         }
   *       },
   *       migrations: {
   *         <old schema version #>: <function taking an old settings value and
   *                                  returning a new one, also changing the
   *                                  version #>
   *       }
   *     }
   *
   * If a settings value is retrieved from the datastore which is not a current
   * version, migrations will be attempted until the settings value's version
   * is current, or, if no migration is found or a migration exceptions, the
   * settings will be discarded. After migration, the resulting settings are
   * stored back to the datastore.
   *
   * Generally it is not necessary to change the schema version or add a
   * migration when adding a setting, only when modifying its type or name.
   *
   * @param {string} name        Name of this Settings group, used as a key
   *                             in the backend 'settings' DataStore.
   * @param {Object} schema      Description of the entries in this settings
   *                             group and optional migrations between settings
   *                             version. See JSDoc for more.
   * @param {DataStore} store    (Optional) The data store to use.
   * @param {Boolean}   load     (Optional) Whether to load the settings
   *                             initially. Default is true.
   */
  function Settings(name, schema, anonymousWriteBack = false, store = undefined, load = true) {
    this.name = name;
    this.schema = schema;
    this.anonymousWriteBack = anonymousWriteBack;
    this.rendered = {};
    this.settingsStore = store ? store : CATMAID.DataStoreManager.get(Settings.DATA_STORE_NAME);
    this._boundLoad = this.load.bind(this, undefined);
    this._storeThrottleTimeout = null;
    this.settingsStore.on(CATMAID.DataStore.EVENT_LOADED, this._boundLoad);
    if (load) {
      this.load();
    }
  }

  /**
   * Map of settings scope levels to corresponding datastore scope levels.
   * @type {Object}
   */
  Settings.SCOPES = {
    default: undefined,
    global:  'GLOBAL',
    project: 'PROJECT_DEFAULT',
    user:    'USER_DEFAULT',
    session: 'USER_PROJECT'
  };

  Settings.DATA_STORE_NAME = 'settings';
  Settings.STORE_THROTTLE_INTERVAL = 1*1000;

  Settings.prototype.destroy = function () {
    this.settingsStore.off(CATMAID.DataStore.EVENT_LOADED, this._boundLoad);
  };

  /**
   * Load settings values for all scopes by retrieving persisted values from
   * the DataStore and cascading values across scopes.
   *
   * @param {Boolean} anonymousWriteBack (optional) Whether to write changed or
   *                                     migrated settings back to the server if
   *                                     the current user is not logged in.
   *
   * @return {Promise} Promise yielding once loading is complete.
   */
  Settings.prototype.load = function (anonymousWriteBack = undefined) {
    if (anonymousWriteBack === undefined) {
      anonymousWriteBack = this.anonymousWriteBack;
    }
    var self = this;
    return this.settingsStore.get(this.name).then(function (stored) {
        var rendered = Object.keys(self.schema.entries).reduce(function (r, k) {
          var entry = self.schema.entries[k];
          r[k] = {
                value: entry.default,
                overridable: true,
                valueScope: 'default'
              };
          return r;
        }, {});

        let work = [];

        // For scope level, in order of increasing specificity, check
        // persisted settings, migrate them if necesssary, merge them if
        // possible, then create an object allowing direct access and
        // mutation at that scope level.
        ['global', 'project', 'user', 'session'].forEach(function (scope) {
          var datastoreScope = Settings.SCOPES[scope];
          if (stored.hasOwnProperty(datastoreScope)) {
            var scopeValues = stored[datastoreScope];
            if (scopeValues.version !== self.schema.version) {
              try {
                scopeValues = self.migrate(scopeValues);
              } catch (error) {
                CATMAID.msg('Warn',
                    'Unable to migrate ' + scope + ' ' + self.name +
                    ' settings, resetting to defaults.');
                scopeValues = {version: self.schema.version, entries: {}};
              }
              let writeThrough = anonymousWriteBack || (!!CATMAID.session && CATMAID.session.is_authenticated);
              work.push(self.settingsStore.set(self.name, scopeValues, datastoreScope, writeThrough));
            }

            Object.keys(scopeValues.entries).forEach(function (k) {
              if (self.schema.entries.hasOwnProperty(k) // Ignore properties not in the schema
                  && rendered[k].overridable) {
                var entry = scopeValues.entries[k];
                rendered[k].value = entry.value;
                rendered[k].overridable = entry.overridable;
                rendered[k].valueScope = scope;
              }
            });
          }

          self[scope] = {};
          Object.defineProperties(
            self[scope],
            Object.keys(rendered).reduce(function (o, k) {
                  var value = rendered[k].value;
                  if (rendered[k].overridable ||
                      rendered[k].valueScope === scope) {
                    o[k] = {
                          enumerable: true,
                          get: function () { return value; },
                          set: function (val) { self.set(k, val, scope); }
                        };
                  } else {
                    o[k] = {
                          enumerable: true,
                          value: value,
                          writable: false
                        };
                  }
                  return o;
                }, {}));

          self.rendered[scope] = $.extend(true, {}, rendered);
        });

        return Promise.all(work);
    });
  };

  /**
   * Create an immutable copy of this Settings object with data from the
   * provided back-end.
   */
  Settings.prototype.fromAPI = function(api, load = false) {
    let store = new CATMAID.DataStore(Settings.DATA_STORE_NAME, api);
    let settingsClone = new CATMAID.Settings(this.name, this.schema, false,
        store, load);
    return settingsClone;
  };

  /**
   * Migrate a settings value from the DataStore using the schema until the
   * settings value's version is current to the schmea. If a migration cannot
   * be applied, throw an error.
   *
   * @param  {Object} stored Settings value from the DataStore.
   * @return {Object}        Settings value whose version matches the schema.
   */
  Settings.prototype.migrate = function (stored) {
    while (stored.version !== this.schema.version) {
      var migration = this.schema.migrations[stored.version];
      if (!migration)
        throw new Error('Settings for "' + this.name + '" cannot migrate version ' + stored.version);
      stored = migration(stored);
    }

    return stored;
  };

  /**
   * Set a settings value for the specified settings name key and scope.
   *
   * @param  {string} key   Name of the settings entry to set.
   * @param  {Object} value Value to set.
   * @param  {string} scope Scope of the settings entry to set, from the
   *                        keys of Settings.SCOPES.
   * @return {Promise}      Promise yielding once the setting is stored to the
   *                        backend datastore.
   */
  Settings.prototype.set = function (key, value, scope) {
    var self = this;
    return this.settingsStore
        .get(this.name)
        .then(function (stored) {
          var datastoreScope = Settings.SCOPES[scope];
          var scopeValues = stored.hasOwnProperty(datastoreScope) ?
              stored[datastoreScope] :
              {version: self.schema.version, entries: {}};
          if (!scopeValues.entries.hasOwnProperty(key)) {
            scopeValues.entries[key] = {
              value: value,
              overridable: true
            };
          } else {
            if (scopeValues.entries[key].value === value) {
              // Nothing has changed. Bail early to avoid needless work.
              return Promise.resolve();
            }
            scopeValues.entries[key].value = value;
          }

          if (self._storeThrottleTimeout) {
            window.clearTimeout(self._storeThrottleTimeout);
          }

          self._storeThrottleTimeout = window.setTimeout(function () {
            self.settingsStore._storeDirty();
            self.load();
            self._storeThrottleTimeout = null;
          }, Settings.STORE_THROTTLE_INTERVAL);

          return self.settingsStore
              .set(self.name, scopeValues, datastoreScope, false)
              .then(function () {
                self.load();
              });
        });
  };

  /**
   * Unset a settings value for the specified settings name key and scope.
   *
   * @param  {string} key   Name of the settings entry to set.
   * @param  {string} scope Scope of the settings entry to set, from the
   *                        keys of Settings.SCOPES.
   * @return {Promise}      Promise yielding once the setting is stored to the
   *                        backend datastore.
   */
  Settings.prototype.unset = function (key, scope) {
    var self = this;
    return this.settingsStore
        .get(this.name)
        .then(function (stored) {
          var datastoreScope = Settings.SCOPES[scope];
          // If there are no settings stored for this scope, nothing to unset.
          if (!stored.hasOwnProperty(datastoreScope)) return;
          var scopeValues = stored[datastoreScope];
          if (!scopeValues.entries.hasOwnProperty(key)) return;
          delete scopeValues.entries[key];

          return self.settingsStore
              .set(self.name, scopeValues, datastoreScope, true)
              .then(function () {
                CATMAID.msg('Success', 'User profile updated successfully.');
                self.load();
              });
        });
  };
  /**
   * Set a settings value for the specified settings name key and scope.
   *
   * @param  {string}  key         Name of the settings entry to set.
   * @param  {boolean} overridable Whether the settings value can be
   *                               overridden by more specific scopes.
   * @param  {string}  scope       Scope of the settings entry to set, from the
   *                               keys of Settings.SCOPES.
   * @return {Promise}             Promise yielding once the setting is stored
   *                               to the backend datastore.
   */
  Settings.prototype.setOverridable = function (key, overridable, scope) {
    var self = this;
    return this.settingsStore
        .get(this.name)
        .then(function (stored) {
          var datastoreScope = Settings.SCOPES[scope];
          var scopeValues = stored.hasOwnProperty(datastoreScope) ?
              stored[datastoreScope] :
              {version: self.schema.version, entries: {}};
          if (!scopeValues.entries.hasOwnProperty(key)) {
            scopeValues.entries[key] = {
              value: self[scope][key],
              overridable: overridable
            };
          } else {
            scopeValues.entries[key].overridable = overridable;
          }

          return self.settingsStore
              .set(self.name, scopeValues, datastoreScope, true)
              .then(function () {
                CATMAID.msg('Success', 'User profile updated successfully.');
                self.load();
              });
        });
  };

  CATMAID.Settings = Settings;

})(CATMAID);
