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
	this.createOptions().forEach(function(option) {
		if (option.value !== name) select.options.add(option);
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

ActiveSkeleton.prototype.getSelectedSkeletonModels = function() {
	var active = SkeletonAnnotations.getActiveSkeletonId();
	if (!active) return {};
	var name = $('#neuronname' + SkeletonAnnotations.getActiveStackId()).text();
	name = name.substring(0, name.lastIndexOf(' (Sk'));
	var o = {};
	o[active] = new SelectionTable.prototype.SkeletonModel(active, name, new THREE.Color().setRGB(1, 1, 0));
	return o;
};

ActiveSkeleton.prototype.getSkeletonModels = ActiveSkeleton.prototype.getSelectedSkeletonModels;

ActiveSkeleton.prototype.highlight = function(skeleton_id) {
	TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeleton_id);
};
