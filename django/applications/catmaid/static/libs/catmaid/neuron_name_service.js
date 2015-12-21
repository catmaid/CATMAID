/* global
  project,
  requestQueue,
  session
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
    // The NeuronNameService is a singleton
    var instance;

    /**
     * Creates a new instance of the neuron name service. If empty is true, the
     * component list is empty.
     */
    function init(empty) {
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
      var componentList = empty ? [] : [
        {id: 'skeletonid', name: "Skeleton ID"},
        {id: 'neuronname', name: "Neuron name"}
      ];

      // The format string mapping components into a final neuron name.
      var formatString = '%f';

      // An object mapping skeleton IDs to objects that contain the current name and
      // a list of clients, interested in the particular skeleton.
      var managedSkeletons = {};

      // A list of all clients
      var clients = [];

      return {

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

        /**
         * Makes all given skeletons known to the naming service and registers the
         * given client as linked to these skeletons.
         *
         * @returns a promise that will be resolved once registering is finished.
         */
        registerAll: function(client, models, callback)
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
                clients: [client],
                name: null,
                model: models[skid],
              };
              unknownSkids.push(skid);
            }
          }

          // Add client to the list of known clients.
          if (-1 === clients.indexOf(client)) {
            clients.push(client);
          }

          if (0 === unknownSkids.length) {
            // Execute callback and return if there aren't any unknown skeleton ID
            return new Promise(function(resolve, reject) {
              resolve();
              if (callback) {
                  callback();
              }
            });
          } else {
            return this.updateNames(unknownSkids, callback)
              .then(this.notifyClients.bind(this));
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

        /**
         * Updates the name representation of every managed neuron and notifies all
         * clients about it.
         *
         * @returns a promise that is resolved once the refresh is complete
         */
        refresh: function(callback)
        {
          return this.updateNames(null, (function() {
            this.notifyClients();
            if (callback) {
              callback();
            }
          }).bind(this));
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
          /**
           * The actual update function---see below for call.
           */
          var update = function(data, resolve, reject) {
            var name = function(skid) {
              /**
               * Support function to creat a label, based on meta annotations. Id a
               * user ID is provided, it is also checked for the user ID. If a label
               * can't be created, null is returned.
               */
              var metaLabel = function(maID, userID) {
                  var ma = data.skeletons[skid].annotations.reduce(function(o, a) {
                    // Test if current annotation has meta annotations
                    if (a.id in data.metaannotations) {
                      var hasID = function(ma) {
                        return ma.id === maID;
                      };
                      // Remember this annotation for display if is annotated with
                      // the requested meta annotation.
                      if (data.metaannotations[a.id].annotations.some(hasID)) {
                        // Also test against user ID, if provided
                        if (undefined === userID) {
                          o.push(data.annotations[a.id]);
                        } else if (a.uid === userID) {
                          o.push(data.annotations[a.id]);
                        }
                      }
                    }
                    return o;
                  }, []);
                  // Return only if there are own annotations
                  if (ma.length > 0) {
                    return ma.join(', ');
                  }

                  return null;
              };

              var skeleton = managedSkeletons[skid];

              // Find values for component in the list.
              var componentValues = componentList.map(function (l) {
                if ('neuronname' === l.id) {
                  return data.neuronnames[skid];
                } else if ('skeletonid' === l.id) {
                  return '' + skid;
                } else if ('all' === l.id) {
                  if (skid in data.skeletons) {
                    return data.skeletons[skid].annotations.map(function(a) {
                      return data.annotations[a.id];
                    }).join(', ');
                  }
                } else if ('all-meta' === l.id) {
                  if (skid in data.skeletons) {
                    // Collect all annotations annotated with the requested meta
                    // annotation.
                    var label = metaLabel(CATMAID.annotations.getID(l.option));
                    if (null !== label) {
                      return label;
                    }
                  }
                } else if ('own' === l.id) {
                  if (skid in data.skeletons) {
                    // Collect own annotations
                    var oa = data.skeletons[skid].annotations.reduce(function(o, a) {
                      if (a.uid === session.userid) {
                        o.push(data.annotations[a.id]);
                      }
                      return o;
                    }, []);
                    // Return only if there are own annotations
                    if (oa.length > 0) {
                      return oa.join(', ');
                    }
                  }
                } else if ('own-meta' === l.id) {
                  if (skid in data.skeletons) {
                    // Collect all annotations that are annotated with requested meta
                    // annotation.
                    var label = metaLabel(CATMAID.annotations.getID(l.option),
                        session.userid);
                    if (null !== label) {
                      return label;
                    }
                  }
                }

                return null;
              });

              var fallbackValue = null;
              for (var i = 0; i < componentList.length; ++i) {
                if (componentValues[i] !== null)
                  fallbackValue = componentValues[i];
              }

              var name = formatString.replace(/%(f|\d+)/g, function (match, component) {
                if (component === 'f') {
                  return fallbackValue;
                }

                var index = parseInt(component, 10);
                if (index >= 0 && index < componentValues.length) {
                  return componentValues[index];
                } else return match;
              });

              return name;
            };

            if (skids) {
              skids.forEach(function(skid) {
                // Ignore unknown skeletons
                if (!managedSkeletons[skid]) {
                  return;
                }
                managedSkeletons[skid].name = name(skid);
              });
            } else {
              for (var skid in managedSkeletons) {
                managedSkeletons[skid].name = name(skid);
              }
            }

            // Resolve the promise and execute callback, if any
            resolve();
            if (callback) {
              callback();
            }
          };

          // Request information only, if needed
          var needsNoBackend = 0 === componentList.filter(function(l) {
              return 'skeletonid' !== l.id;
          }).length;

          return new Promise(function(resolve, reject) {
            // Get all skeletons to query, either all known ones or all known ones
            // of the given list.
            var querySkids = !skids ? Object.keys(managedSkeletons) :
              skids.filter(function(skid) {
                return skid in managedSkeletons;
              });

            if (needsNoBackend || 0 === querySkids.length) {
              // If no back-end is needed, call the update method right away, without
              // any data.
              update(null, resolve, reject);
            } else {
              // Check if we need meta annotations
              var needsMetaAnnotations = componentList.some(function(l) {
                  return 'all-meta' ===  l.id || 'own-meta' === l.id;
              });
              // Check if we need neuron names
              var needsNeueonNames = componentList.some(function(l) {
                  return 'neuronname' === l.id;
              });

              // Get all data that is needed for the component list
              requestQueue.register(django_url + project.id + '/skeleton/annotationlist',
                'POST',
                {
                  skeleton_ids: querySkids,
                  metaannotations: needsMetaAnnotations ? 1 : 0,
                  neuronnames: needsNeueonNames ? 1 : 0,
                },
                CATMAID.jsonResponseHandler(function(json) {
                  update(json, resolve, reject);
                }, reject));
            }
          });
        },

        /**
         * Returns the name for the given skeleton ID, if available. Otherwise, return
         * null.
         */
        getName: function(skid)
        {
          if (skid in managedSkeletons) {
            return managedSkeletons[skid].name;
          } else {
            return null;
          }
        },

        /**
         * This is a convenience method to rename a neuron. If the neuron in question
         * is managed by the name service, an update event will be triggered and all
         * registered widgets will be notified.
         */
        renameNeuron: function(neuronId, skeletonIds, newName, callback)
        {
          requestQueue.register(django_url + project.id + '/neurons/' + neuronId + '/rename',
            'POST', { name: newName },
            CATMAID.jsonResponseHandler((function(data) {
              // Update all skeletons of the current neuron that are managed
              var updatedSkeletons = skeletonIds.filter(function(skid) {
                if (skid in managedSkeletons) {
                  // Update skeleton model
                  managedSkeletons[skid].model.baseName = newName;
                  return true;
                }
                return false;
              });

              // Only update the names if there was indeed a skeleton update.
              // Otherwise, execute callback directly.
              if (updatedSkeletons.length > 0) {
                // Update the names of the affected skeleton IDs and notify clients if
                // there was a change. And finally execute the callback.
                this.refresh(callback);
              } else {
                if (callback) {
                  callback();
                }
              }
            }).bind(this)));
        },

        /**
         * Listen to the neuron controller's delete event and remove neurons
         * automatically from the name service.
         */
        registerEventHandlers: function() {
          CATMAID.neuronController.on(CATMAID.neuronController.EVENT_SKELETON_DELETED,
              this.unregisterSingleFromAllClients, instance);
        },

        /**
         * Unregister from the neuron controller's delete event.
         */
        unregisterEventHandlers: function() {
          CATMAID.neuronController.off(CATMAID.neuronController.EVENT_SKELETON_DELETED,
              this.unregisterSingleFromAllClients, instance);
        }
      };
    }

    return {
      getInstance: function() {
        if (!instance) {
          instance = init();
          instance.registerEventHandlers();
        }

        return instance;
      },

      /**
       * Crate a new name service instance which is independent from the
       * singleton.
       */
      newInstance: function(empty) {
        return init(empty);
      },
    };
  })();

})(CATMAID);
