/* global
  project,
  */

(function (CATMAID) {

  "use strict";

  /**
   * The neuron name service is a singleton that creates a name for a specific
   * neuron. Based on the user's settings, the name is the regular neuron name or
   * based on annotations.It can be configured with the help of the settings
   * widget. All potentially asynchronous methods return a promise that is
   * resolved once the asynchronous action is complete.
   */
  CATMAID.NeuronNameService = (function()
  {
    // The NeuronNameService is a singleton, one per API.
    var instances = new Map();

    var DEFAULT_COMPONENT_LIST = [
          {id: 'skeletonid', name: "Skeleton ID"},
          {id: 'neuronname', name: "Neuron name"}
        ];

    var DEFAULT_FORMAT_STRING = '%f{, }';

    /**
     * Creates a new instance of the neuron name service. If empty is true, the
     * component list is empty.
     */
    function init(empty, api = undefined) {
      // All available naming options. If an entry needs a parameter and includes
      // the pattern "..." in its name, this pattern will be replaced by the
      // parameter when added to the actual label component list.
      var options = [
        {id: 'neuronname', name: "Neuron name", needsParam: false},
        {id: 'skeletonid', name: "Skeleton ID", needsParam: false},
        {id: 'all', name: "All annotations", needsParam: false},
        {id: 'all-meta', name: "All annotations annotated with ...", needsParam: true},
        {id: 'own', name: "Own annotations", needsParam: false},
        {id: 'own-meta', name: "Own annotations annotated with ...", needsParam: true},
      ];

      // The current label component/naming list
      var componentList = empty ? [] : $.extend(true, [], DEFAULT_COMPONENT_LIST);

      // The format string mapping components into a final neuron name.
      var formatString = DEFAULT_FORMAT_STRING;

      // The delimiter used for listing annotations in a neuron name.
      var listDelimiter = ", ";

      // Whether empty components should be trimmed
      var autoTrimEmptyValues = true;

      // Whether neighboring duplicate components should be removed.
      var removeDuplicates = true;

      // An object mapping skeleton IDs to objects that contain the current name and
      // a list of clients, interested in the particular skeleton.
      var managedSkeletons = {};

      // A list of all clients
      var clients = [];

      // A promise that keeps track of an active update, should there be any.
      // This allows subsequent refresh calls (e.g. when loading a large list
      // of skeletons through a deep link and the NNS needs to load its
      // settings) to not query for the same skeletons in parallel.
      let activeUpdate = Promise.resolve();

      // Returns null if at least one skeleton has never been refreshed before. Otherwise,
      // the oldest update time is returned.
      function getOldestUpdateTime(skeletonIds, ignoreUncached=false) {
        let oldest;
        for (let skeletonId of skeletonIds) {
          // If we find the first skeleton that was not updated before,
          // stop search and update all.
          let updateTime = managedSkeletons[skeletonId].updateTime;
          if (!updateTime) {
            if (ignoreUncached) {
              continue;
            }
            oldest = null;
            break;
          }
          if (oldest === undefined) {
            oldest = updateTime;
            continue;
          }
          if (oldest > updateTime) {
            oldest = updateTime;
          }
        }
        return oldest;
      }

      /**
       * Support function to create a label, based on meta annotations. Id a
       * user ID is provided, it is also checked for the user ID. If a label
       * can't be created, null is returned.
       */
      var metaLabel = function(skeleton, maID, userID) {
          var ma = skeleton.annotations.reduce(function(o, a) {
            // Test if current annotation has meta annotations
            if (skeleton.metaAnnotations && a.id in skeleton.metaAnnotations) {
              var hasID = function(ma) {
                return ma.id === maID;
              };
              // Remember this annotation for display if is annotated with
              // the requested meta annotation.
              if (skeleton.metaAnnotations[a.id].annotations.some(hasID)) {
                // Also test against user ID, if provided
                if (undefined === userID || a.uid === userID) {
                  o.push(CATMAID.annotations.getName(a.id));
                }
              }
            }
            return o;
          }, []);
          // Return only if there are own annotations
          if (ma.length > 0) {
            return ma.sort(compareAnnotations).join(listDelimiter);
          }

          return null;
      };

      let extractComponentValue = function(skeleton, entry) {
        if ('neuronname' === entry.id) {
          return [skeleton.neuronName];
        } else if ('skeletonid' === entry.id) {
          return ['' + skeleton.id];
        } else if ('all' === entry.id) {
          if (skeleton.annotations) {
            return skeleton.annotations.map(function(a) {
              return CATMAID.annotations.getName(a.id);
            }).sort(compareAnnotations);
          }
        } else if ('all-meta' === entry.id) {
          if (skeleton.annotations) {
            // Collect all annotations annotated with the requested meta
            // annotation.
            var label = metaLabel(skeleton, CATMAID.annotations.getID(entry.option));
            if (null !== label) {
              return [label];
            }
          }
        } else if ('own' === entry.id) {
          if (skeleton.annotations) {
            // Collect own annotations
            var oa = skeleton.annotations.reduce(function(o, a) {
              if (a.uid === CATMAID.session.userid) {
                o.push(CATMAID.annotations.getName(a.id));
              }
              return o;
            }, []);
            // Return only if there are own annotations
            if (oa.length > 0) {
              return oa.sort(compareAnnotations);
            }
          }
        } else if ('own-meta' === entry.id) {
          if (skeleton.annotations) {
            // Collect all annotations that are annotated with requested meta
            // annotation.
            var label = metaLabel(skeleton, CATMAID.annotations.getID(entry.option),
                CATMAID.session.userid);
            if (null !== label) {
              return [label];
            }
          }
        }

        return null;
      };

      /**
       * The actual update function---see below for call.
       */
      let updateNeuronNames = function(skidsToUpdate, data, skids, callback, resolve, reject) {
        var name = function(skeleton) {

          // Find values for component in the list, each component is a list
          // of strings, or null if no value is available.
          var componentValues = componentList.map(l => extractComponentValue(skeleton, l));

          var fallbackValue = null;
          for (var i = 0; i < componentList.length; ++i) {
            if (componentValues[i] !== null && componentValues[i].length > 0)
              fallbackValue = componentValues[i];
          }

          var componentsRegEx = /%(f|\d+)(?:\{(.*)\})?/g;
          var replace = function (match, component, delimiter) {
            delimiter = delimiter === undefined ? ", " : delimiter;

            if (component === 'f') {
              return fallbackValue ? fallbackValue.join(delimiter) : fallbackValue;
            }

            var index = parseInt(component, 10);
            if (index >= 0 && index < componentValues.length) {
              var cv = componentValues[index];
              return cv ? cv.join(delimiter) : '';
            } else return match;
          };

          var removeDuplicates = CATMAID.NeuronNameService.Settings.session.remove_neighboring_duplicates;
          var autoTrim = CATMAID.NeuronNameService.Settings.session.auto_trim_empty;

          // Split format string in format components and regular
          // components.
          var components = formatString.split(/((?:%f|%\d+)(?:\{.*\})?)/g);
          var leftTrimmed = false;
          var rightTrimmed = false;
          var lastMappedElement = null;
          components = components.map(function(c) {
            return c.replace(componentsRegEx, replace);
          }).filter(function(c, i, mappedComponents) {
            if (removeDuplicates) {
              if (c.trim().length !== 0) {
                if (lastMappedElement === c) {
                  return false;
                }
                lastMappedElement = c;
              }
            }
            return true;
          }).map(function(c, i, mappedComponents) {
            // Left trim current component if last component is empty. If the
            // name is not empty and if a right-trim operation happened for the
            // last non-empty element or a left trim operation happened on the
            // current element, retain one space.
            if (autoTrim) {
              // Empty elements don't need any trimming.
              if (c.length === 0) {
                return c;
              }

              if (i > 0) {
                var l = c.length;
                var lastComponent = mappedComponents[i - 1];
                if (lastComponent.length === 0) {
                  c = c.trimLeft();
                  leftTrimmed = c.length !== l;
                } else {
                  leftTrimmed = false;
                }
                if (c.length > 0 && (rightTrimmed || leftTrimmed)) {
                  c = " " + c;
                }
              }

              // Add a single space if there just happened a trim to the
              // right just before a new left trim action. This indicates an
              // enclosed missing mapped component. Not doing this results
              // in the neighboring elements being squashed together. Since
              // we need to access the past right trimming information, this
              // is done before this information is updated.
              if (leftTrimmed && rightTrimmed) {
                 c = c + ' ';
              }

              // Right-trim current component, if next components is empty
              if (i < (mappedComponents.length - 1)) {
                var l = c.length;
                var nextComponent = mappedComponents[i + 1];
                if (nextComponent.length === 0) {
                  c = c.trimRight();
                  rightTrimmed = c.length !== l;
                } else {
                  rightTrimmed = false;
                }
              }
            }

            return c;
          });
          return components.join('');
        };

        let nChanged = 0;

        if (skidsToUpdate) {
          skidsToUpdate.forEach(function(skid) {
            // Ignore unknown skeletons
            if (!managedSkeletons[skid]) {
              return;
            }
            const skeletonName = name(managedSkeletons[skid]);
            if (managedSkeletons[skid].name !== skeletonName) {
              nChanged++;
              managedSkeletons[skid].name = skeletonName;
            }
          });
        } else if (skids) {
          skids.forEach(function(skid) {
            // Ignore unknown skeletons
            if (!managedSkeletons[skid]) {
              return;
            }
            const skeletonName = name(managedSkeletons[skid]);
            if (managedSkeletons[skid].name !== skeletonName) {
              nChanged++;
              managedSkeletons[skid].name = skeletonName;
            }
          });
        } else {
          for (var skid in managedSkeletons) {
            const skeletonName = name(managedSkeletons[skid]);
            if (managedSkeletons[skid].name !== skeletonName) {
              nChanged++;
              managedSkeletons[skid].name = skeletonName;
            }
          }
        }

        // Resolve the promise and execute callback, if any
        if (resolve) resolve(nChanged);
        if (callback) callback(nChanged);
      };

      return {

        /**
         * Load configuration for this name service instance from the persistent
         * settings manager.
         *
         * @param  {string=} scope Name of the settings scope to load, defaults
         *                         to 'session'.
         * @param  {boolean=} sync Whether to load synchronously. Default false.
         * @return {Promise=}      A promise, if loading asynchronously.
         */
        loadConfigurationFromSettings: function (scope, sync) {
          if (!(scope in CATMAID.Settings.SCOPES))
            scope = 'session';
          if (!CATMAID.NeuronNameService.Settings) {
            CATMAID.NeuronNameService.Settings = new CATMAID.Settings(
                'neuron-name-service',
                {
                  version: 0,
                  entries: {
                    component_list: {
                      default: DEFAULT_COMPONENT_LIST
                    },
                    format_string: {
                      default: DEFAULT_FORMAT_STRING
                    },
                    auto_trim_empty: {
                      default: true
                    },
                    remove_neighboring_duplicates: {
                      default: true
                    }
                  },
                  migrations: {}
                });
          }

          var loadValues = (function () {
            componentList = $.extend(true, [], CATMAID.NeuronNameService.Settings[scope].component_list);
            formatString = CATMAID.NeuronNameService.Settings[scope].format_string;
            autoTrimEmptyValues = CATMAID.NeuronNameService.Settings[scope].auto_trim_empty;
            removeDuplicates = CATMAID.NeuronNameService.Settings[scope].remove_neighboring_duplicates;
            this.refresh();
          }).bind(this);

          if (sync) {
            loadValues();
          } else {
            return CATMAID.NeuronNameService.Settings
                .load()
                .then(loadValues);
          }
        },

        /**
         * Mutator for the format string that maps componenets to a final neuron
         * name.
         */
        setFormatString: function(format)
        {
          formatString = format;

          // Update the name representation of all neurons
          this.refresh();
        },

        /**
         * Accessor for the format string.
         */
        getFormatString: function()
        {
          return formatString;
        },

        /**
         * Mutator for the auto trim setting for the format string replacement.
         */
        setAutoTrimEmpty: function(trim)
        {
          autoTrimEmptyValues = trim;

          // Update the name representation of all neurons
          this.refresh();
        },

        /**
         * Accessor for the auto trim setting.
         */
        getAutoTrimEmpty: function()
        {
          return autoTrimEmptyValues;
        },

        /**
         * Mutator for the duplicate removal setting for the format string replacement.
         */
        setRemoveDuplicates: function(remove)
        {
          removeDuplicates = remove;

          // Update the name representation of all neurons
          this.refresh();
        },

        /**
         * Accessor for the duplicate removal setting.
         */
        getRemoveDuplicates: function()
        {
          return removeDuplicates;
        },

        /**
         * Returns copy of all available naming options.
         */
        getOptions: function()
        {
          return $.extend(true, [], options);
        },

        /**
         * Returns a copy of the internal label component list.
         */
        getComponentList: function()
        {
          return $.extend(true, [], componentList);
        },

        /**
         * Adds a labeling option to the fall back list.
         */
        addLabeling: function(id, option)
        {
          // Make sure there is an option with the given ID
          var type = options.filter(function(o) { return o.id === id; });
          // Return if no type was found
          if (type.length === 0) {
            return;
          } else {
            // Expect only one element
            type = type[0];
          }

          // Cancel if this type needs a parameter, but non was given
          if (type.needsParam && !option) {
            return;
          }

          // Create new labeling
          var newLabeling = {id: id};
          if (option) {
            newLabeling.option = option;
            if (type.needsParam) {
              // If this type needs a parameter, replace '...' in its name with the
              // given parameter
              newLabeling.name = type.name.replace(/\.\.\./, "\"" + option + "\"");
            } else {
              newLabeling.name = type.name;
            }
          } else {
            newLabeling.name = type.name;
          }

          // Add new labeling to list
          componentList.push(newLabeling);

          // Update the name representation of all neurons
          this.refresh();
        },

        /**
         * Removes the labeling at the given index from the component list. All
         * items but the first on can be removed.
         */
        removeLabeling: function(index)
        {
          if (index < 1 || index >= componentList.length) {
            return;
          }

          componentList.splice(index, 1);

          // Update the name representation of all neurons
          this.refresh();
        },

        /**
         * Convenience method to make a single skeleton model known to the naming
         * service and to register the given client as linked to it.
         *
         * @returns a promise that will be resolved once registering is finished.
         */
        register: function(client, model, callback)
        {
          var models = {};
          models[model.id] = model;
          return this.registerAll(client, models, callback);
        },

        registerAllFromList: function(client, skeletonIds, projectId = undefined)
        {
          let models = skeletonIds.reduce((o, skid) => {
            o[skid] = new CATMAID.SkeletonModel(skid, undefined, undefined, api, projectId);
            return o;
          }, {});
          return this.registerAll(client, models);
        },

        /**
         * Makes all given skeletons known to the naming service and registers the
         * given client as linked to these skeletons.
         *
         * @param notifyClients {Boolean} (Optional) Notify all clients and trigger
         *                                a neuron name update after successful
         *                                registration. False by default.
         *
         * @returns a promise that will be resolved once registering is finished.
         */
        registerAll: function(client, models, callback, notifyClients=false)
        {
          if (!client) {
            throw new CATMAID.ValueError("Please provide a valid client");
          }

          // Make sure all skeletons have valid integer IDs.
          var validIDs = [];
          for (var skid in models) {
            var id = parseInt(skid, 10);
            if (!id) throw new CATMAID.ValueError("Please provide valid IDs");
            else validIDs.push(id);
          }

          // Link all skeleton IDs to the client and create a list of unknown
          // skeletons.
          var unknownSkids = [];
          for (var i=0; i<validIDs.length; ++i) {
            var skid = validIDs[i];
            if (skid in managedSkeletons) {
              if (-1 === managedSkeletons[skid].clients.indexOf(client)) {
                managedSkeletons[skid].clients.push(client);
              }
            } else {
              managedSkeletons[skid] = {
                id: skid,
                clients: [client],
                name: null,
                model: models[skid],
                annotations: null,
                metaAnnotations: null,
                neuronName: null,
                // A timestamp that is set once the name is set
                updateTime: null,
                // Whether the last update included meta annotations
                metaUpdated: false,
                // Whether the name was updated during the last update
                nameUpdated: false,
              };
              unknownSkids.push(skid);
            }
          }

          if (0 === unknownSkids.length) {
            // Add client to the list of known clients.
            if (-1 === clients.indexOf(client)) {
              clients.push(client);
            }

            // Execute callback and return if there aren't any unknown
            // skeleton IDs, once the active update is done.
            return activeUpdate
              .then(() => CATMAID.tools.callIfFn(callback));
          } else {
            return this.updateNames(unknownSkids, callback)
              .then(() => {
                try {
                  if (notifyClients) {
                    this.notifyClients();
                  }
                } catch (e) {
                  CATMAID.handleError(e);
                }
                // Add client to the list of known clients after all other clients have been notified
                // about updated names. This is done to avoid calling the new client already about a
                // name update.
                if (-1 === clients.indexOf(client)) {
                  clients.push(client);
                }
            });
          }
        },

        /**
         * Unregisters the skeletons in skids from the client, removing them from the
         * set of skeletons managed by the service if no other clients are registered
         * to those skeletons. The skids parameter is expected to be an array of
         * skeleton IDs.
         *
         * If called with only one argument, removes all references to the given
         * client.
         */
        unregister: function(client, skids)
        {
          // If only one argument was passed, unregister the client completely.
          var unregisterAll = typeof skids === "undefined";
          // If skids is undefined or null, unregister from all managedSkeletons.
          // Note that this allows a client to call unregister(this, null), which
          // will unregister all of its skeletons without unregistering the client
          // from being notified on update.
          skids = skids || Object.keys(managedSkeletons);

          skids.forEach(function(skid) {
            if (skid in managedSkeletons) {
              var cIdx = managedSkeletons[skid].clients.indexOf(client);
              if (-1 !== cIdx) {
                // Remove whole skeleton from managed list, if this is the only client
                // linked to it.
                if (1 === managedSkeletons[skid].clients.length) {
                  delete managedSkeletons[skid];
                } else {
                  // Delete client from list
                  managedSkeletons[skid].clients.splice(cIdx, 1);
                }
              }
            }
          });

          if (unregisterAll) {
            var cIdx = clients.indexOf(client);
            if (-1 !== cIdx) {
              clients.splice(cIdx, 1);
            }
          }
        },

        /**
         * Unregister a list of skeletons from all clients that reference it. This
         * is used for instance to unregister deleted neurons.
         */
        unregisterFromAllClients: function(skids)
        {
          clients.forEach(function(c) {
            this.unregister(c, skids);
          }, this);
        },

        /**
         * Unregisters a single neuron from all clients that reference it.
         */
        unregisterSingleFromAllClients: function(skid)
        {
          this.unregisterFromAllClients([skid]);
        },

        /**
         * When the current is destroyed, we clear this name service to prevent
         * leaking of information and for consistency.
         */
        handleProjectDestruction: function()
        {
          this.clear();
        },

        /**
         * Unregister all clients and remove all managed skeletons.
         */
        clear: function() {
          var skeletonIds = Object.keys(managedSkeletons);
          clients.forEach(function(c) {
            this.unregister(c, skeletonIds);
          }, this);
        },

        /**
         * Tries to let every registered client know that there was an update in the
         * name representation.
         */
        notifyClients: function() {
          clients.forEach(function(c) {
            // If a client has a method called 'updateNeuronNames', call it
            if (c && c.updateNeuronNames) {
              c.updateNeuronNames();
            }
          });
        },

        handleAnnotationChange: function(changedEntities) {
            this.refresh();
        },

        handleNeuronNameChange: function(neuonId, newName) {
            // TODO: only refresh if neuron is currently managed
            this.refresh();
        },

        /**
         * Updates the name representation of every managed neuron and notifies all
         * clients about it.
         *
         * @returns a promise that is resolved once the refresh is complete
         */
        refresh: function(callback, force=false)
        {
          return this.updateNames(null, nChanged  => {
            // Only notify clients if there were actual changes or it is enforced.
            if (nChanged > 0 || force) {
              this.notifyClients();
            }
            if (callback) {
              callback();
            }
          });
        },

        /**
         * Updates the name of all known skeletons, if no list of skeleton IDs is
         * passed.  Otherwise, only the given skeletons will be updated. Can execute a
         * callback, when the names were successfully updated.
         *
         * @returns a promise that is resolved once the update is complete
         */
        updateNames: function(skids, callback)
        {
          // Request information only, if needed
          var needsNoBackend = 0 === componentList.filter(function(l) {
              return 'skeletonid' !== l.id;
          }).length;

          activeUpdate = activeUpdate
            .then(() => new Promise(function(resolve, reject) {
              // Get all skeletons to query, either all known ones or all known ones
              // of the given list.
              var querySkids = !skids ? Object.keys(managedSkeletons) :
                skids.filter(function(skid) {
                  return skid in managedSkeletons;
                });

              if (needsNoBackend || 0 === querySkids.length) {
                // If no back-end is needed, call the update method right away, without
                // any data.
                updateNeuronNames(null, null, skids, callback, resolve, reject);
              } else {
                // Check if we need meta annotations
                var needsMetaAnnotations = componentList.some(function(l) {
                    return 'all-meta' ===  l.id || 'own-meta' === l.id;
                });
                // Check if we need neuron names
                var needsNeueonNames = componentList.some(function(l) {
                    return 'neuronname' === l.id;
                });

                // Sort queries by API
                let querySkidsByAPI = querySkids.reduce((o, s) => {
                  let entry = managedSkeletons[s];
                  // If either the model has an API defined or the neuron name
                  // server instance has an API defined, use it.
                  let key = entry && entry.model ? (entry.model.api || api || undefined) : undefined;
                  let apiModels = o.get(key);
                  if (!apiModels) {
                    apiModels = [];
                    o.set(key, apiModels);
                  }
                  apiModels.push(s);
                  return o;
                }, new Map());

                let promiseAnnotations = [];
                for (let [api, apiSkids] of querySkidsByAPI) {
                  // Try to find the first attached project ID for this API.  We
                  // assue it is the same for all skeletons from this API.  TODO:
                  // There has to be a better way to do this.
                  let managedSkeleton = managedSkeletons[apiSkids[0]];
                  let projectId = project.id;
                  if (managedSkeleton && managedSkeleton.model && managedSkeleton.model.projectId !== undefined) {
                    projectId = managedSkeleton.model.projectId;
                  }

                  // We pass two lists of skeletons to the server: a list of
                  // skeletons to get the annotations for without further checks
                  // and a second list to *maybe* get annotations for, depending
                  // on whether there were annotation changes since the last
                  // update timestamp.
                  let cond_skeleton_ids = [];
                  let def_skeleton_ids = [];
                  for (let skid of apiSkids) {
                    let sk = managedSkeletons[skid];
                    if (!sk.updateTime || (needsMetaAnnotations && !sk.metaUpdated) || (needsNeueonNames && !sk.neuronName)) {
                      def_skeleton_ids.push(skid);
                    } else {
                      cond_skeleton_ids.push(skid);
                    }
                  }

                  // For conditional skeleton IDs, we ask the back-end to only
                  // return data for them if there have been updates since the
                  // oldest date we find in the set. This is a compromise to not
                  // send a date for every skeleton ID, but still allow cache hits
                  // in many cases.
                  let skipDate = getOldestUpdateTime(apiSkids, true);
                  if (skipDate) {
                    skipDate = new Date(skipDate).toISOString();
                  }

                  promiseAnnotations.push(
                      CATMAID.fetch({
                        url: `${projectId}/skeleton/annotationlist`,
                        method: 'POST',
                        data: {
                          skeleton_ids: def_skeleton_ids,
                          annotations: 0,
                          metaannotations: needsMetaAnnotations ? 1 : 0,
                          neuronnames: needsNeueonNames ? 1 : 0,
                          // Conditional query skeletons with condition
                          conditional_skeleton_ids: cond_skeleton_ids,
                          if_modified_since: skipDate,
                        },
                        api: api,
                      })
                      .then(result => {
                        const updateTime = Date.now();

                        // Assign annotation info to each skeleton
                        for (let skeletonId in result.skeletons) {
                          managedSkeletons[skeletonId].annotations = result.skeletons[skeletonId].annotations;
                          managedSkeletons[skeletonId].updateTime = updateTime;
                          if (result.metaannotations) {
                            managedSkeletons[skeletonId].metaUpdated = true;
                            managedSkeletons[skeletonId].metaAnnotations = result.metaannotations;
                          } else {
                            managedSkeletons[skeletonId].metaUpdated = false;
                          }
                        }

                        if (needsNeueonNames && result.neuronnames) {
                          for (let skeletonId in result.neuronnames) {
                            managedSkeletons[skeletonId].neuronName = result.neuronnames[skeletonId];
                          }
                        }

                        return updateNeuronNames(apiSkids, result, skids, callback);
                      }));
                }

                return Promise.all(promiseAnnotations)
                  .then(resolve)
                  .catch(reject);
              }
            }));
          return activeUpdate;
        },

        /**
         * Returns the name for the given skeleton ID, if available. Otherwise, return
         * null or an optional default value.
         */
        getName: function(skid, defaultValue = null)
        {
          if (skid in managedSkeletons) {
            return managedSkeletons[skid].name;
          }
          return defaultValue;
        },

        /**
         * Listen to the neuron controller's delete event and remove neurons
         * automatically from the name service. Also register to changed
         * annotation links so that the name service can update itself.
         */
        registerEventHandlers: function() {
          let instance = instances.get(api);
          if (!instance) {
            throw new CATMAID.ValueError('Could not find neuron name service for API');
          }
          CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
              this.unregisterSingleFromAllClients, instance);
          CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
              this.handleAnnotationChange, instance);
          CATMAID.Neurons.on(CATMAID.Neurons.EVENT_NEURON_RENAMED,
              this.handleNeuronNameChange, instance);
          CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED,
              this.loadConfigurationFromSettings, instance);
          CATMAID.Project.on(CATMAID.Project.EVENT_PROJECT_DESTROYED,
              this.handleProjectDestruction, instance);
        },

        /**
         * Unregister from the neuron controller's delete and the annotation
         * change events.
         */
        unregisterEventHandlers: function() {
          let instance = instances.get(api);
          if (!instance) {
            throw new CATMAID.ValueError('Could not find neuron name service for API');
          }
          CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
              this.unregisterSingleFromAllClients, instance);
          CATMAID.Annotations.off(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
              this.handleAnnotationChange, instance);
          CATMAID.Neurons.off(CATMAID.Neurons.EVENT_NEURON_RENAMED,
              this.handleNeuronNameChange, instance);
          CATMAID.Init.off(CATMAID.Init.EVENT_PROJECT_CHANGED,
              this.loadConfigurationFromSettings, instance);
          CATMAID.Project.off(CATMAID.Project.EVENT_PROJECT_DESTROYED,
              this.handleProjectDestruction, instance);
        },

        /*
         * Whether missing name components should be trimmed automatically.
         */
        autoTrimEmptyValues: true
      };
    }

    return {

      /**
       * Return a singleton instance of the NeuronNameService.
       *
       * @param {API} api (optional) The back-end to use. By default the regular
       *                             back-end is used.
       */
      getInstance: function(api = undefined) {
        // If no API is provided (the default), null is used as a unique index
        // for the regular back-end. Make sure an API is only referenced if it
        // is not the local back-end we are talking to.
        let apiRef = (api && !api.isLocal)? api : undefined;
        let instance = instances.get(apiRef);
        if (!instance) {
          instance = init(undefined, apiRef);
          instances.set(apiRef, instance);
          instance.registerEventHandlers();
          instance.loadConfigurationFromSettings();
        }

        return instance;
      },

      /**
       * Remove a previously created singleton.
       *
       * @param {API} api (optional) The back-end to use. By default the regular
       *                             back-end is used.
       */
      forgetInstance: function(api = undefined) {
        instances.delete(api ? api : undefined);
      },

      /**
       * Crate a new name service instance which is independent from the
       * singleton.
       *
       * @param {API} api (optional) The back-end to use. By default the regular
       *                             back-end is used.
       */
      newInstance: function(empty, api = undefined) {
        return init(empty, api);
      },

      /**
       * Register all models for the passed in client. This is done for each API
       * defined by the models.
       */
      registerAll: function(client, models, callback) {
        let modelsPerAPI = CATMAID.API.splitByAPI(models);
        let promises = [];
        for (let [apiName, apiModels] of modelsPerAPI.entries()) {
          promises.push(CATMAID.NeuronNameService.getInstance(apiName).registerAll(client, apiModels));
        }
        let result = Promise.all(promises);
        if (callback) result.then(callback).catch(CATMAID.handleError);
        return result;
      },

      unregister: function(client, skids) {
        for (let instance of instances.values()) {
          instance.unregister(client, skids);
        }
      },
    };
  })();

  /**
   * Compare strings ignoring case.
   */
  function compareAnnotations(a, b) {
    return a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"});
  }

})(CATMAID);
