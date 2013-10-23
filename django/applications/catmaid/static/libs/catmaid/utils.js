"use strict";

var InstanceRegistry = function() {
  this.instances = {};
};

InstanceRegistry.prototype = {};

/** Return an array of open instances. */
InstanceRegistry.prototype.getInstances = function() {
	return Object.keys(this.instances).map(function(key) {
		return this.instances[key];
	}, this);
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
  var max = Math.max.apply(Math, pids),
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
		var name = this.id.substring(23).replace(/-/g, ' ');
		var selected = select.options[select.selectedIndex].text;
		select.options.length = 0;
		select.selectedIndex = 0;
		options().forEach(function(option, i) {
			if (option.value === name) return; // ignore self
			select.options.add(option);
			if (option.text === selected) select.selectedIndex = i;
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
	this.createOptions().forEach(function(option) {
		if (option.value !== name) select.options.add(option);
	});
	return select;
};

SkeletonSourceManager.prototype.getSelectedSource = function(ref_source) {
	return this.sources[$('#' + this.createSelectID(ref_source)).val()];
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

SkeletonSourceManager.prototype.highlight = function(caller, skeleton_id) {
	Object.keys(this.sources).forEach(function(name) {
		var source = this.sources[name];
		if (source === caller) return;
		source.highlight(skeleton_id);
	}, this);
};

SkeletonSourceManager.prototype.removeSkeletons = function(skeleton_ids) {
	Object.keys(this.sources).forEach(function(name) {
		var source = this.sources[name];
		if (typeof(source['removeSkeletons'] === 'function')) {
			source.removeSkeletons(skeleton_ids);
		}
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

ActiveSkeleton.prototype.getSelectedSkeletonModels = function() {
	var active = SkeletonAnnotations.getActiveSkeletonId();
	if (!active) return {};
	var name = $('#neuronname' + SkeletonAnnotations.getActiveStackId()).text();
	var o = {};
	o[active] = new SelectionTable.prototype.SkeletonModel(active, name, new THREE.Color().setRGB(1, 1, 0));
	return o;
};

ActiveSkeleton.prototype.highlight = function(skeleton_id) {
	TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeleton_id);
};
