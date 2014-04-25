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
	var name = $('#neuronname' + SkeletonAnnotations.getActiveStackId()).text();
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

