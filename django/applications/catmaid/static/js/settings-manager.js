(function (CATMAID) {

  "use strict";

  /**
   * Stores and persists key-value client settings.
   *
   * Settings are cascaded through a series of scopes (CATMAID defaults,
   * global, project-defaults, user-defaults, and user- project session).
   * Each scope may declare a value to be not overridable (i.e., locked),
   * preventing more specific scopes from changing the value.
   *
   * The results of applying this cascade at each scope level are
   * accessible through attributes on this Settings object, e.g.:
   *
   *     var foo = new Settings(...)
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
   * @param {string} name        Name of this Settings group, used as a key
   *                             in the backend 'settings' DataStore.
   * @param {Object} schema      Description of the entries in this settings
   *                             group and optional migrations between settings
   *                             version. See JSDoc for more.
   */
  function Settings(name, schema) {
    this.name = name;
    this.schema = schema;
    this.rendered = {};
    this.settingsStore = CATMAID.DataStoreManager.get(Settings.DATA_STORE_NAME);
    this._boundLoad = this.load.bind(this);
    this.settingsStore.on(CATMAID.DataStore.EVENT_LOADED, this._boundLoad);
    this.load();
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

  Settings.prototype.destroy = function () {
    this.settingsStore.off(CATMAID.DataStore.EVENT_LOADED, this._boundLoad);
  };

  /**
   * Load settings values for all scopes by retrieving persisted values from
   * the DataStore and cascading values across scopes.
   *
   * @return {Promise} Promise yielding once loading is complete.
   */
  Settings.prototype.load = function () {
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
              self.settingsStore.set(self.name, scopeValues, datastoreScope, true);
            }

            Object.keys(scopeValues.entries).forEach(function (k) {
              if (rendered[k].overridable) {
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
    });
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
            scopeValues.entries[key].value = value;
          }

          return self.settingsStore
              .set(self.name, scopeValues, datastoreScope, true)
              .then(function () {
                CATMAID.msg('Success', 'User profile updated successfully.');
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
