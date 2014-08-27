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
	var name = NeuronNameService.getInstance().getName(active);
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
 * Note that fnDone is invoked even when the given skeleton_ids array is empty.
 *
 * Additionally, when done if any skeletons don't exist anymore, a dialog will ask to remove them from all widgets that are skeleton sources.*/
var fetchSkeletons = function(skeleton_ids, fnMakeURL, fnPost, fnLoadedOne, fnFailedLoading, fnDone) {
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
      finish = function() {
        $.unblockUI();
        fnMissing();
      },
      loadOne = function(skeleton_id) {
        requestQueue.register(fnMakeURL(skeleton_id), 'POST', fnPost(skeleton_id),
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
                  finish();
                  fnDone();
                }
              } catch (e) {
                finish();
                console.log(e, e.stack);
                growlAlert("ERROR", "Problem loading skeleton " + skeleton_id);
              }
            });
      };
  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> <h2>Loading skeletons <div id="counting-loaded-skeletons">0 / ' + skeleton_ids.length + '</div></h2>'});
  }
  if (skeleton_ids.length > 0) {
    loadOne(skeleton_ids[0]);
  } else {
    fnDone();
  }
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

/** Parse JSON data from compact-skeleton and compact-arbor into an object
 * that contains an Arbor instance and a number of measurements related
 * to synapses and synaptic partners. */
var ArborParser = function() {
    this.arbor = null;
    this.inputs = null;
    this.outputs = null;
    this.n_inputs = null;
    // Number of post targets of pre connectors
    this.n_outputs = null;
    // Number of pre connectors
    this.n_presynaptic_sites = null;
    this.input_partners = null;
    this.output_partners = null;
};

ArborParser.prototype = {};

ArborParser.prototype.init = function(url, json) {
    this.tree(json[0]);
    switch (url) {
        case 'compact-skeleton':
            this.connectors(json[1]);
            break;
        case 'compact-arbor':
            this.synapses(json[1]);
            break;
    }
    return this;
};

ArborParser.prototype.tree = function(rows) {
  var arbor = new Arbor(),
      positions = {};
  for (var i=0; i<rows.length; ++i) {
    var row = rows[i],
        node = row[0],
        paren = row[1];
    if (paren) arbor.edges[node] = paren;
    else arbor.root = node;
    positions[node] = new THREE.Vector3(row[3], row[4], row[5]);
  };

  this.arbor = arbor;
  this.positions = positions;
  return this;
};

/** Parse connectors from compact-skeleton.
 */
ArborParser.prototype.connectors = function(rows) {
  var io = [{count: 0},
            {count: 0}];
  for (var i=0; i<rows.length; ++i) {
    var row = rows[i],
        t = io[row[2]], // 2: type: 0 for pre, 1 for post
        node = row[0], // 0: ID
        count = t[node];
    if (count) t[node] = count + 1;
    else t[node] = 1;
    t.count += 1;
  }
  this.n_presynaptic_sites = io[0].count;
  this.n_inputs = io[1].count;
  delete io[0].count;
  delete io[1].count;
  this.outputs = io[0];
  this.inputs = io[1];
  return this;
};

/** Parse connectors from compact-arbor.
 */
ArborParser.prototype.synapses = function(rows) {
  var io = [{partners: {},
             count: 0,
             connectors: {}},
            {partners: {},
             count: 0,
             connectors: {}}];
  for (var i=0; i<rows.length; ++i) {
    var row = rows[i],
        t = io[row[6]], // 6: 0 for pre, 1 for post
        node = row[0], // 0: treenode ID
        count = t[node];
    if (count) t[node] = count + 1;
    else t[node] = 1;
    t.count += 1;
    t.partners[row[5]] = true;
    t.connectors[row[2]] = true; // 2: connector ID
  }
  this.n_outputs = io[0].count;
  this.n_inputs = io[1].count;
  this.output_partners = io[0].partners;
  this.input_partners = io[1].partners;
  this.n_output_connectors = Object.keys(io[0].connectors).length;
  this.n_input_connectors = Object.keys(io[1].connectors).length;
  ['count', 'partners', 'connectors'].forEach(function(key) {
      delete io[0][key];
      delete io[1][key];
  });
  this.outputs = io[0];
  this.inputs = io[1];
  return this;
};

/** Replace in this.arbor the functions defined in the fnNames array by a function
 * that returns a cached version of their corresponding return values.
 * Order matters: later functions in the fnNames array will already be using
 * cached versions of earlier ones.
 * Functions will be invoked without arguments. */
ArborParser.prototype.cache = function(fnNames) {
    if (!this.arbor.__cache__) this.arbor.__cache__ = {};
    fnNames.forEach(function(fnName) {
        this.__cache__[fnName] = Arbor.prototype[fnName].bind(this)();
        this[fnName] = new Function("return this.__cache__." + fnName);
    }, this.arbor);
};

/** Will find terminal branches whose end node is tagged with "not a branch"
 * and remove them from the arbor, transferring any synapses to the branch node.
 * tags: a map of tag name vs array of nodes with that tag, as retrieved by compact-arbor or compact-skeleton.
 * Assumes that this.arbor, this.inputs and this.outputs exist. */
ArborParser.prototype.collapseArtifactualBranches = function(tags) {
    var notabranch = tags['not a branch'];
    if (undefined === notabranch) return;
    var be = this.arbor.findBranchAndEndNodes(),
        ends = be.ends,
        branches = be.branches,
        edges = this.arbor.edges,
        tagged = {};
    for (var i=0; i<notabranch.length; ++i) {
        tagged[notabranch[i]] = true;
    }
    for (var i=0; i<ends.length; ++i) {
        var node = ends[i];
        if (tagged[node]) {
            var n_inputs = 0,
                n_outputs = 0;
            while (node && !branches[node]) {
                var nI = this.inputs[node],
                    nO = this.outputs[node];
                if (nI) {
                    n_inputs += nI;
                    delete this.inputs[node];
                }
                if (nO) {
                    n_outputs += nO;
                    delete this.outputs[node];
                }
                // Continue to parent
                var paren = edges[node];
                delete edges[node];
                node = paren;
            }
            // node is now the branch node, or null for a neuron without branches
            if (!node) node = this.arbor.root;
            if (n_inputs > 0) this.inputs[node] = n_inputs;
            if (n_outputs > 0) this.outputs[node] = n_outputs;
        }
    }
};
