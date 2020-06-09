(function(CATMAID) {

  "use strict";

	/** Optional arguments. */
	var SkeletonGroup = function(models, name, color) {
		this.models = models || {};
		this.name = name || "group";
		this.color = color || new THREE.Color(1, 1, 0);
	};

	SkeletonGroup.prototype = {};
	SkeletonGroup.prototype.constructor = SkeletonGroup;

	SkeletonGroup.prototype.append = function(models) {
		Object.keys(models).forEach(function(skid) {
			this.models[skid] = models[skid];
		}, this);
	};

	SkeletonGroup.prototype.remove = function(models) {
		Object.keys(models).forEach(function(skid) {
			delete this.models[skid];
		}, this);
	};

	// Deep clone: makes new SkeletonModel instances
	SkeletonGroup.prototype.clone = function() {
		var copy = new SkeletonGroup({}, this.name, this.color.clone());
		Object.keys(this.models).forEach(function(skid) {
			copy.models[skid] = this.models[skid].clone();
		}, this);
		return copy;
	};

  // Export skeleton group
  CATMAID.SkeletonGroup = SkeletonGroup;

})(CATMAID);
