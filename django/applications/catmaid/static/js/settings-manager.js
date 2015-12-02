(function (CATMAID) {

  "use strict";

  function Settings(name, schema, unpersisted) {
    this.name = name;
    this.schema = schema;
    this.unpersisted = unpersisted;
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

  Settings.prototype.load = function () {
    var self = this;
    this.settingsStore.get(this.name).then(function (stored) {
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
        // persisted settings, migrate them if necesssary, apply them if
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

          self.rendered[scope] = $.extend({}, rendered);
        });
    });
  };

  Settings.prototype.migrate = function (stored) {
    while (stored.version !== this.schema.version) {
      var migration = this.schema.migrations[stored.version];
      if (!migration)
        throw new Error('Settings for "' + this.name + '" cannot migrate version ' + stored.version);
      stored = migration(stored);
    }

    return stored;
  };

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
