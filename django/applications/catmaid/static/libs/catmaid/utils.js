"use strict";

var InstanceRegistry = function() {
  this.instances = {};
};

InstanceRegistry.prototype = {};

/** Return an array of open instances, sorted from oldest to newest. */
InstanceRegistry.prototype.getInstances = function() {
	return Object.keys(this.instances).map(function(key) {
		return [Number(key), this.instances[key]];
	}, this).sort(function(a, b) {
		return a[0] > b[0];
	}).map(function(a) { return a[1]; });
};

InstanceRegistry.prototype.noInstances = function() {
	return 0 === this.getInstances().length;
};

InstanceRegistry.prototype.registerInstance = function() {
  var pids = Object.keys(this.instances).map(Number);
  if (0 === pids.length) {
    this.instances[1] = this;
    return 1;
  }

  // Find lowest unused number
  var max = Math.max.apply(Math, pids.map(Number)),
      pid = max + 1;
  for (var i = 0; i < max; ++i) {
    if (typeof(pids[i]) === 'undefined') {
      pid = i;
      break;
    }
  }
  this.instances[pid] = this;
  return pid;
};

InstanceRegistry.prototype.unregisterInstance = function() {
  delete this.instances[this.widgetID];
};

InstanceRegistry.prototype.getFirstInstance = function() {
	var keys = Object.keys(this.instances);
	if (0 === keys.length) return null;
	return this.instances[Math.min.apply(Math, keys.map(Number))];
};

InstanceRegistry.prototype.getLastInstance = function() {
	var a = this.getInstances();
	return a[a.length-1];
};


var SkeletonSource = function() {};

SkeletonSource.prototype = {};

SkeletonSource.prototype.registerSource = function() {
	SkeletonListSources.add(this);
};

SkeletonSource.prototype.unregisterSource = function() {
	SkeletonListSources.remove(this);
};

SkeletonSource.prototype.loadSource = function() {
  var models = SkeletonListSources.getSelectedSkeletonModels(this);
  if (0 === models.length) {
		growlAlert('Info', 'Selected source is empty.');
		return;
	}
  this.append(models);
};

SkeletonSource.prototype.updateOneModel = function(model, source_chain) {
  var models = {};
  models[model.id] = model;
  this.updateModels(models, source_chain);
};

SkeletonSource.prototype.syncLink = function(select) {
  this.linkTarget = SkeletonListSources.getSource(select.value);
	if (this.linkTarget) {
		this.linkTarget.clear();
		this.linkTarget.append(this.getSelectedSkeletonModels());
	}
};

SkeletonSource.prototype.updateLink = function(models) {
  if (this.linkTarget) {
		this.linkTarget.updateModels(models);
  }
};

SkeletonSource.prototype.notifyLink = function(model, source_chain) {
  if (this.linkTarget) {
    this.linkTarget.updateOneModel(model, source_chain);
	}
};

SkeletonSource.prototype.clearLink = function(source_chain) {
	if (this.linkTarget) {
		if (source_chain && (this in source_chain)) return; // break propagation loop
		if (!source_chain) source_chain = {};
		source_chain[this] = this;

		this.linkTarget.clear();
	}
};

SkeletonSource.prototype.getLinkTarget = function() {
	return this.linkTarget;
};

SkeletonSource.prototype.getSelectedSkeletons = function() {
    return Object.keys(this.getSelectedSkeletonModels());
};

SkeletonSource.prototype.annotate_skeleton_list = function() {
  NeuronAnnotations.prototype.annotate_neurons_of_skeletons(this.getSelectedSkeletons());
};



// A prototype for a manager of existing skeleton sources
var SkeletonSourceManager = function() {
	this.sources = {};
};

SkeletonSourceManager.prototype = {};

SkeletonSourceManager.prototype.add = function(source) {
	this.sources[source.getName()] = source;
};

SkeletonSourceManager.prototype.remove = function(source) {
	delete this.sources[source.getName()];
	this.updateGUI();
	Object.keys(this.sources).forEach(function(name) {
		var s = this.sources[name];
		if (s.linkTarget === source) delete s.linkTarget;
	}, this);
};

SkeletonSourceManager.prototype.createOptions = function() {
	return Object.keys(this.sources).sort().map(function(name) {
		return new Option(name, name);
	}, this);
};

/** Updates all existing 'select' GUI elements listing sources.
 *  Assumes names are unique. */
SkeletonSourceManager.prototype.updateGUI = function() {
	var options = this.createOptions.bind(this);
	var sources = this.sources;
	$("[id^='skeleton-source-select-']").each(function(index, select) {
		var ipush = this.id.indexOf('-push-');
		var name = (-1 === ipush ? this.id.substring(23) : this.id.substring(23, ipush)).replace(/-/g, ' ');
		var selected = select.options[select.selectedIndex].value;
		select.options.length = select.options[0].value === 'None' ? 1 : 0; // preserve manually added initial void entry when present in push selects
		select.selectedIndex = 0;
		options().forEach(function(option, i) {
			if (option.value === name) return; // ignore self
			select.options.add(option);
			if (option.value === selected) select.selectedIndex = select.options.length -1;
		});
	});
};

SkeletonSourceManager.prototype.createSelectID = function(source) {
	return 'skeleton-source-select-' + source.getName().replace(/ /g, '-');
};

SkeletonSourceManager.prototype.createSelect = function(source) {
	var select = document.createElement('select');
	select.setAttribute('id', this.createSelectID(source));
	var name = source.getName();
	this.createOptions().forEach(function(option, i) {
		if (option.value !== name) select.options.add(option);
		if (option.value === 'Active skeleton') select.selectedIndex = i;
	});
	return select;
};

SkeletonSourceManager.prototype.createPushSelect = function(source, suffix) {
	var select = document.createElement('select');
	select.setAttribute('id', this.createSelectID(source) + '-push-' + suffix);
	select.options.add(new Option('None', 'None'));
	var name = source.getName();
	this.createOptions().forEach(function(option) {
		if (option.value !== name) select.options.add(option);
	});
	return select;
};

SkeletonSourceManager.prototype.getSelectedSource = function(ref_source) {
	return this.sources[$('#' + this.createSelectID(ref_source)).val()];
};

SkeletonSourceManager.prototype.getSelectedPushSource = function(ref_source, suffix) {
	return this.sources[$('#' + this.createSelectID(ref_source) + "-push-" + suffix).val()];
};

SkeletonSourceManager.prototype.getSource = function(name) {
	return this.sources[name];
};

SkeletonSourceManager.prototype.getSelectedSkeletons = function(ref_source) {
	var source = this.getSelectedSource(ref_source);
	if (!source) {
		console.log("No source found for reference source " + ref_source.getName());
		return [];
	}
	var skeletons = source.getSelectedSkeletons();
	if (0 === skeletons.length) {
    growlAlert('Info', 'No skeletons available at ' + source.getName());
	}
  return skeletons;
};

SkeletonSourceManager.prototype.getSelectedSkeletonModels = function(ref_source) {
	var source = this.getSelectedSource(ref_source);
	if (!source) {
		console.log("No source found for reference source " + ref_source.getName());
		return [];
	}
	var models = source.getSelectedSkeletonModels();
	if (0 === models.length) {
    growlAlert('Info', 'No skeletons selected at ' + source.getName());
	}
	return models;
};

/** Return the subset of models not present in source. */
SkeletonSourceManager.prototype.findDifference = function(source, models) {
    return Object.keys(models).reduce(function(o, skid) {
			if (!source.hasSkeleton(skid)) o[skid] = models[skid];
			return o;
		}, {});
};

SkeletonSourceManager.prototype.highlight = function(caller, skeleton_id) {
	Object.keys(this.sources).forEach(function(name) {
		var source = this.sources[name];
		if (source === caller) return;
		source.highlight(skeleton_id);
	}, this);
};

SkeletonSourceManager.prototype.removeSkeletons = function(skeleton_ids) {
	Object.keys(this.sources).forEach(function(name) {
		this.sources[name].removeSkeletons(skeleton_ids);
	}, this);
};

SkeletonSourceManager.prototype.setVisible = function(skeleton_ids, visible) {
	Object.keys(this.sources).forEach(function(name) {
		var source = this.sources[name];
		if (typeof(source['setVisible']) === 'function') {
			source.setVisible(skeleton_ids, visible);
		}
	}, this);
};

var SkeletonListSources = new SkeletonSourceManager();


// A Skeleton source based on the active node in the tracing layer
var ActiveSkeleton = function() {
  this.registerSource();
};

ActiveSkeleton.prototype = new SkeletonSource();

ActiveSkeleton.prototype.getName = function(skeleton_id) {
	return "Active skeleton";
};

ActiveSkeleton.prototype.append = function() {};
ActiveSkeleton.prototype.clear = function() {};
ActiveSkeleton.prototype.removeSkeletons = function() {};
ActiveSkeleton.prototype.updateModels = function() {};

ActiveSkeleton.prototype.getSelectedSkeletons = function() {
	var skid = SkeletonAnnotations.getActiveSkeletonId();
	if (!skid) return [];
	return [skid];
};

ActiveSkeleton.prototype.getSkeletonColor = function() {
	return new THREE.Color().setRGB(1, 0, 1);
};

ActiveSkeleton.prototype.hasSkeleton = function(skeleton_id) {
	return skeleton_id === SkeletonAnnotations.getActiveSkeletonId();
};

ActiveSkeleton.prototype.createModel = function() {
	var active = SkeletonAnnotations.getActiveSkeletonId();
	if (!active) return null;
	var name = $('#neuronName' + SkeletonAnnotations.getActiveStackId()).text();
	name = name.substring(0, name.lastIndexOf(' (Sk'));
  return new SelectionTable.prototype.SkeletonModel(active, name, new THREE.Color().setRGB(1, 1, 0));
};

ActiveSkeleton.prototype.getSelectedSkeletonModels = function() {
  var model = this.createModel(),
          o = {};
  if (model) o[model.id] = model;
  return o;
};

ActiveSkeleton.prototype.getSkeletonModels = ActiveSkeleton.prototype.getSelectedSkeletonModels;

ActiveSkeleton.prototype.highlight = function(skeleton_id) {
	TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeleton_id);
};


/**
 * The annotation cache provides annotation names and their IDs.
 */
var AnnotationCache = function() {
  // Map of annotation name vs its ID and vice versa
  this.annotation_ids = {};
  this.annotation_names = {};
};

AnnotationCache.prototype.getName = function(id) {
  return this.annotation_names[id];
};

AnnotationCache.prototype.getAllNames = function() {
  return Object.keys(this.annotation_ids);
};

AnnotationCache.prototype.getID = function(name) {
  return this.annotation_ids[name];
};

AnnotationCache.prototype.getAllIDs = function() {
  return Object.keys(this.annotation_names);
};

AnnotationCache.prototype.update = function(callback) {
  requestQueue.register(django_url + project.id + '/annotations/list',
      'POST', {}, (function (status, data, text) {
        var e = $.parseJSON(data);
        if (status !== 200) {
            alert("The server returned an unexpected status (" +
              status + ") " + "with error message:\n" + text);
        } else {
          if (e.error) {
            new ErrorDialog(e.error, e.detail).show();
          } else {
            // Empty cache
            this.annotation_ids = {};
            this.annotation_names = {};
            // Populate cache
            e.annotations.forEach((function(a) {
             this.annotation_ids[a.name] = a.id;
             this.annotation_names[a.id] = a.name;
            }).bind(this));
            // Call back, if requested
            if (callback) {
              callback();
            }
          }
        }
      }).bind(this));
};

/**
 * Adds new annotations from the given list to the cache. The list should
 * contain objects, each with an 'id' and a 'name' field.
 */
AnnotationCache.prototype.push = function(annotationList) {
  annotationList.forEach(function(a) {
    var known_id = this.annotation_ids.hasOwnProperty(a.name) === -1;
    var known_name = this.annotation_names.hasOwnProperty(a.id) === -1;
    if (!known_id && !known_name) {
      // Add annotation if it isn't already contained in the list.
      this.annotation_ids[a.name] = a.id;
      this.annotation_names[a.id] = a.name;
    } else if (known_id && known_name) {
      // Nothing to do, if the annotation is already known.
    } else {
      // If only the ID or the name is known, something is odd.
      throw "Annotation already known with different id/name"
    }
  }, this)
};

var annotations = new AnnotationCache();


/**
 * The neuron name service creates a name for a specific neuron. Based on the
 * user's settings, the name is the regular neuron name or based on annotations.
 * It can be configured with the help of the settings widget.
 */
var NeuronNameService = function()
{
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
    {id: 'neuronname', name: "Neuron name"}
  ];

  // Indicates if the skeleton ID should be appended to every label
  var appendSkeletonId = false;

  // An object mapping skeleton IDs to objects that contain the current name and
  // a list of clients, inerested in the particular skeleton.
  var managedSkeletons = [];

  // A list of all clients
  var clients = [];


  /**
   * Allows the caller to select whether the skeleton ID should be appende to
   * every label or not.
   */
  this.setAppendSkeletonId = function(append)
  {
    appendSkeletonId = append ? true: false;

    // Update the name representation of all neurons
    this.updateNames(null, this.notifyClients.bind(this));
  };

  /**
   * Returns copy of all available naming options.
   */
  this.getOptions = function()
  {
    return $.extend(true, [], options);
  };

  /**
   * Returns a copy of the internal fallback list.
   */
  this.getFallbackList = function()
  {
    return $.extend(true, [], fallbackList);
  };

  /**
   * Adds a labeling option to the fall back list.
   */
  this.addLabeling = function(id, option)
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
    this.updateNames(null, this.notifyClients.bind(this));
  };

  /**
   * Removes the labeling at the given index from the fallback list. All items
   * but the fist on can be removed.
   */
  this.removeLabeling = function(index)
  {
    if (index < 1 || index >= fallbackList.length) {
      return;
    }

    fallbackList.splice(index, 1);

    // Update the name representation of all neurons
    this.updateNames(null, this.notifyClients.bind(this));
  };

  /**
   * Convenience method to make a single skeleton model known to the naming
   * service and to register the given client as linked to it.
   */
  this.register = function(client, model, callback)
  {
    this.registerAll(client, [model], callback);
  }

  /**
   * Makes all given skeletons known to the naming service and registers the
   * given client as linked to these skeletons.
   */
  this.registerAll = function(client, models, callback)
  {
    // Link all skeleton IDs to the client and create a list of unknown
    // skeletons.
    var unknownSkids = [];
    for (var skid in models) {
      if (skid in managedSkeletons) {
        if (-1 !== managedSkeletons[skid].clients.indexOf(client)) {
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
    };

    // Add client to the list of known clients.
    if (-1 === clients.indexOf(client)) {
      clients.push(client);
    }

    if (0 === unknownSkids.length) {
      // Execute callback and return if here is no unknown skeleton ID
      if (callback) {
        callback();
      }
      return;
    } else {
      this.updateNames(unknownSkids, callback);
    }
  };

  /**
   * Removes all references to the given client.
   */
  this.unregister = function(client)
  {
    for (var skid in managedSkeletons) {
      var cIdx =  managedSkeletons[skid].clients.indexOf(client);
      if (-1 !== cIdx) {
        // Remove whole skeleton from managed list, if this is the only client
        // linked to it.
        if (1 ===managedSkeletons[skid].clients.length) {
          delete managedSkeletons[skid];
        } else {
          // Delete client from list
          managedSkeletons[skid].clients.splice(cIdx, 1);
        }
      }
    }

    var cIdx = clients.indexOf(client);
    if (-1 !== cIdx) {
      clients.splice(cIdx, 1);
    }
  };

  /**
   * Tries to let every registered client know that there was an update in the
   * name representation.
   */
  this.notifyClients = function() {
    clients.forEach(function(c) {
      // If a client has a method called 'updateNeuronNames', call it
      if (c.updateNeuronNames) {
        c.updateNeuronNames();
      }
    });
  };

  /**
   * Updates the name of all known skeletons, if no list of skeleton IDs is
   * passed.  Otherwise, only the given skeletons will be updated. Can execute a
   * callback, when the names were successfully updated.
   */
  this.updateNames = function(skids, callback)
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
            return skeleton.model.baseName;
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
                return label
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
                return label
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
        return 'neuronname' !== l.id && 'skeletonid' !== l.id;
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

      // Get all data that is needed for the fallback list
      requestQueue.register(django_url + project.id + '/skeleton/annotationlist',
        'POST',
        {
          skeleton_ids: Object.keys(managedSkeletons),
          metaannotations: needsMetaAnnotations ? 1 : 0,
        },
        jsonResponseHandler(function(json) {
          update(json);
        }));
    }
  };

  /**
   * Returns the name for the given skeleton ID, if available. Otherwise, return
   * null.
   */
  this.getName = function(skid)
  {
    if (skid in managedSkeletons) {
      return managedSkeletons[skid].name;
    } else {
      return null;
    }
  };

  /**
   * This is a convenience method to rename a neuron. If the neuron in question
   * is managed by the name service, an update event will be triggered and all
   * registered widgets will be notified.
   */
  this.renameNeuron = function(neuronId, skeletonIds, newName, callback)
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
          this.updateNames(updatedSkeletons, (function() {
            this.notifyClients();
            if (callback) {
              callback();
            }
          }).bind(this));
        } else {
          if (callback) {
            callback();
          }
        }
      }).bind(this)));
  };
};

var neuronNameService = new NeuronNameService();


/**
 * This a convience constructor to make it very easy to use the neuron name
 * service.
 */
var NameServiceClient = function()
{

};


/** Adds ability to pick colors almost randomly, keeping state. */
var Colorizer = function() {};

Colorizer.prototype = {};

Colorizer.prototype.COLORS = [[1, 1, 0], // yellow
                              [1, 0, 1], // magenta
                              [0, 0, 1], // blue
                              [0, 1, 0], // green
                              [1, 1, 1], // white
                              [0, 1, 1], // cyan
                              [1, 0.5, 0], // orange
                              [0.5, 1, 0], // light green
                              [0.5, 0.5, 0.5], // grey
                              [0, 1, 0.5], // pale green
                              [1, 0, 0], // red
                              [0.5, 0.5, 1], // light blue
                              [0.75, 0.75, 0.75], // silver
                              [1, 0.5, 0.5], // pinkish
                              [0.5, 1, 0.5], // light cyan
                              [1, 0, 0.5], // purplish
                              [0.5, 0, 0], // maroon
                              [0.5, 0, 0.5], // purple
                              [0, 0, 0.5], // navy blue
                              [1, 0.38, 0.28], // tomato
                              [0.85, 0.64, 0.12], // gold
                              [0.25, 0.88, 0.82], // turquoise
                              [1, 0.75, 0.79]]; // pink


Colorizer.prototype.pickColor = function() {
	if (undefined === this.next_color_index) this.next_color_index = 0;

  var c = this.COLORS[this.next_color_index % this.COLORS.length];
  var color = new THREE.Color().setRGB(c[0], c[1], c[2]);
  if (this.next_color_index < this.COLORS.length) {
    this.next_color_index += 1;
    return color;
  }
  // Else, play a variation on the color's hue (+/- 0.25) and saturation (from 0.5 to 1)
  var hsl = color.getHSL();
  color.setHSL((hsl.h + (Math.random() - 0.5) / 2.0) % 1.0,
               Math.max(0.5, Math.min(1.0, (hsl.s + (Math.random() - 0.5) * 0.3))),
               hsl.l);
  this.next_color_index += 1;
  return color;
};

/** Parse into a THREE.Color the color object returned from a Raphael color wheel. */
var parseColorWheel = function(color) {
  return new THREE.Color().setRGB(parseInt(color.r) / 255.0,
                                  parseInt(color.g) / 255.0,
                                  parseInt(color.b) / 255.0);
};

/** Load each skeleton from the skeleton_ids array one by one, invoking the fnLoadedOne
 * with the ID and the corresponding JSON.
 * If some skeletons fail to load (despite existing), the fnFailedLoading will be invoked with the ID.
 * Finally when all are loaded, fnDone is invoked without arguments.
 *
 * Additionally, when done if any skeletons don't exist anymore, a dialog will ask to remove them from all widgets that are skeleton sources.*/
var fetchCompactSkeletons = function(skeleton_ids, lean_mode, fnLoadedOne, fnFailedLoading, fnDone) {
  var i = 0,
      missing = [],
      unloadable = [],
      fnMissing = function() {
        if (missing.length > 0 && confirm("Skeletons " + missing.join(', ') + " do not exist. Remove them from selections?")) {
          SkeletonListSources.removeSkeletons(missing);
        }
        if (unloadable.length > 0) {
          alert("Could not load skeletons: " + unloadable.join(', '));
        }
      },
      post = {lean: lean_mode ? 1 : 0},
      loadOne = function(skeleton_id) {
        requestQueue.register(django_url + project.id + '/skeleton/' + skeleton_id + '/compact-json', 'POST', post,
            function(status, text) {
              try {
                if (200 === status) {
                  var json = $.parseJSON(text);
                  if (json.error) {
                    if (0 === json.error.indexOf("Skeleton #" + skeleton_id + " doesn't exist")) {
                      missing.push(skeleton_id);
                    } else {
                      unloadable.push(skeleton_id);
                    }
                    fnFailedLoading(skeleton_id);
                  } else {
                    fnLoadedOne(skeleton_id, json);
                  }
                } else {
                  unloadable.push(skeleton_id);
                  fnFailedLoading(skeleton_id);
                }
                // Next iteration
                i += 1;
                $('#counting-loaded-skeletons').text(i + " / " + skeleton_ids.length);
                if (i < skeleton_ids.length) {
                  loadOne(skeleton_ids[i]);
                } else {
                  fnDone();
                }
              } catch (e) {
                console.log(e, e.stack);
                growlAlert("ERROR", "Problem loading skeleton " + skeleton_id);
              } finally {
                if (skeleton_ids.length > 1) {
                  $.unblockUI();
                }
                fnMissing();
              }
            });
      };
  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> <h2>Loading skeletons <div id="counting-loaded-skeletons">0 / ' + skeleton_ids.length + '</div></h2>'});
  }
  loadOne(skeleton_ids[0]);
};

var saveDivSVG = function(divID, filename) {
  var div = document.getElementById(divID);
  if (!div) return; 
  var svg = div.getElementsByTagName('svg');
  if (svg && svg.length > 0) {
    var xml = new XMLSerializer().serializeToString(svg[0]);
    var blob = new Blob([xml], {type : 'text/xml'});
    saveAs(blob, filename);
  }
};
