"use strict";

/**
 * The neuron name service is a singlton that creates a name for a specific
 * neuron. Based on the user's settings, the name is the regular neuron name or
 * based on annotations.  It can be configured with the help of the settings
 * widget.
 */
var NeuronNameService = (function()
{
  // The NeuronNameService is a singlton
  var instance;

  /**
   * Creates a new instance of the neuron name service.
   */
  function init() {
    // All available naming options. If an entry needs a parameter and includes
    // the pattern "..." in its name, this pattern will be replaced by the
    // parameter when added to the actual fallback list.
    var options = [
      {id: 'neuronname', name: "Neuron name", needsParam: false},
      {id: 'skeletonid', name: "Skeleton ID", needsParam: false},
      {id: 'all', name: "All annotations", needsParam: false},
      {id: 'all-meta', name: "All annotations annotated with ...", needsParam: true},
      {id: 'own', name: "Own annotations", needsParam: false},
      {id: 'own-meta', name: "Own annotations annotated with ...", needsParam: true},
    ];

    // The current fallback/naming list
    var fallbackList = [
      {id: 'skeletonid', name: "Skeleton ID"},
      {id: 'neuronname', name: "Neuron name"}
    ];

    // Indicates if the skeleton ID should be appended to every label
    var appendSkeletonId = false;

    // An object mapping skeleton IDs to objects that contain the current name and
    // a list of clients, inerested in the particular skeleton.
    var managedSkeletons = {};

    // A list of all clients
    var clients = [];

    return {

      /**
       * Allows the caller to select whether the skeleton ID should be appende to
       * every label or not.
       */
      setAppendSkeletonId: function(append)
      {
        appendSkeletonId = append ? true: false;

        // Update the name representation of all neurons
        this.refresh();
      },

      /**
       * Returns copy of all available naming options.
       */
      getOptions: function()
      {
        return $.extend(true, [], options);
      },

      /**
       * Returns a copy of the internal fallback list.
       */
      getFallbackList: function()
      {
        return $.extend(true, [], fallbackList);
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
        fallbackList.push(newLabeling);

        // Update the name representation of all neurons
        this.refresh();
      },

      /**
       * Removes the labeling at the given index from the fallback list. All items
       * but the first on can be removed.
       */
      removeLabeling: function(index)
      {
        if (index < 1 || index >= fallbackList.length) {
          return;
        }

        fallbackList.splice(index, 1);

        // Update the name representation of all neurons
        this.refresh();
      },

      /**
       * Convenience method to make a single skeleton model known to the naming
       * service and to register the given client as linked to it.
       */
      register: function(client, model, callback)
      {
        this.registerAll(client, [model], callback);
      },

      /**
       * Makes all given skeletons known to the naming service and registers the
       * given client as linked to these skeletons.
       */
      registerAll: function(client, models, callback)
      {
        // Link all skeleton IDs to the client and create a list of unknown
        // skeletons.
        var unknownSkids = [];
        for (var skid in models) {
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
          if (callback) callback();
        } else {
          this.updateNames(unknownSkids, callback);
        }
      },

      /**
       * Unregisters the skeletons in skids from the client, removing them from the
       * set of skeletons managed by the service if no other clients are registered
       * to those skeletons.
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

        for (var idx in skids) {
          var skid = skids[idx];
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
        }

        if (unregisterAll) {
          var cIdx = clients.indexOf(client);
          if (-1 !== cIdx) {
            clients.splice(cIdx, 1);
          }
        }
      },

      /**
       * Tries to let every registered client know that there was an update in the
       * name representation.
       */
      notifyClients: function() {
        clients.forEach(function(c) {
          // If a client has a method called 'updateNeuronNames', call it
          if (c.updateNeuronNames) {
            c.updateNeuronNames();
          }
        });
      },

      /**
       * Updates the name representation of every managed neuron and notifies all
       * clients about it.
       */
      refresh: function(callback)
      {
        this.updateNames(null, (function() {
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
       */
      updateNames: function(skids, callback)
      {
        /**
         * The actual update function---see below for call.
         */
        var update = function(data) {
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

            // Walk backwars through fallback list to name the current skeleton
            for (var i=fallbackList.length - 1; i > -1; --i) {
              var l = fallbackList[i];
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
                  var label = metaLabel(annotations.getID(l.option));
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
                  var label = metaLabel(annotations.getID(l.option), session.userid);
                  if (null !== label) {
                    return label;
                  }
                }
              }
            }

            // Return the skeleton ID as last option
            return "" + skid;
          };

          if (skids) {
            skids.forEach(function(skid) {
              managedSkeletons[skid].name = name(skid) +
                   (appendSkeletonId ? " #" + skid : "");
            });
          } else {
            for (var skid in managedSkeletons) {
              managedSkeletons[skid].name = name(skid) +
                   (appendSkeletonId ? " #" + skid : "");
            }
          }

          // Execute callback, if available
          if (callback) {
            callback();
          }
        };

        // Request information only, if needed
        var needsNoBackend = 0 === fallbackList.filter(function(l) {
            return 'skeletonid' !== l.id;
        }).length;

        if (needsNoBackend) {
          // If no back-end is needed, call the update method right away, without
          // any data.
          update(null);
        } else {
          // Check if we need meta annotations
          var needsMetaAnnotations = fallbackList.some(function(l) {
              return 'all-meta' ===  l.id || 'own-meta' === l.id;
          });
          // Check if we need neuron names
          var needsNeueonNames = fallbackList.some(function(l) {
              return 'neuronname' === l.id;
          });

          // Get all data that is needed for the fallback list
          requestQueue.register(django_url + project.id + '/skeleton/annotationlist',
            'POST',
            {
              skeleton_ids: Object.keys(managedSkeletons),
              metaannotations: needsMetaAnnotations ? 1 : 0,
              neuronnames: needsNeueonNames ? 1 : 0,
            },
            jsonResponseHandler(function(json) {
              update(json);
            }));
        }
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
        requestQueue.register(django_url + project.id + '/object-tree/instance-operation',
          'POST',
          {operation: "rename_node",
           id: neuronId,
           title: newName,
           classname: "neuron",
           pid: project.id
          },
          jsonResponseHandler((function(data) {
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
      }
    };
  };

  return {
    getInstance: function() {
      if (!instance) {
        instance = init();
      }

      return instance;
    }
  };
})();
