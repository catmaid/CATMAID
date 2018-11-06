/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The annotation cache provides annotation names and their IDs.
   */
  var AnnotationCache = function() {
    // Map of annotation name vs its ID and vice versa
    this.annotation_ids = {};
    this.annotation_names = {};

    // Listen to annotation deletions so these annotations can be removed from
    // the cache.
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_DELETED,
        this.removeAll, this);
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this._handleChangedAnnotations, this);
  };

  AnnotationCache.prototype.destroy = function() {
    CATMAID.Annotations.off(CATMAID.Annotations.EVENT_ANNOTATIONS_DELETED,
        this.removeAll, this);
    CATMAID.Annotations.off(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this._handleChangedAnnotations, this);
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
    return CATMAID.fetch(project.id + '/annotations/', 'GET', {
      simple: true,
    })
      .then((function(json) {
        // Empty cache
        this.annotation_ids = {};
        this.annotation_names = {};
        // Populate cache
        json.annotations.forEach(function (a) {
         this.annotation_ids[a.name] = a.id;
         this.annotation_names[a.id] = a.name;
        }, this);
        // Call back, if requested
        CATMAID.tools.callIfFn(callback);
      }).bind(this));
  };

  /**
   * Push changed annotations to the cache.
   */
  AnnotationCache.prototype._handleChangedAnnotations = function(changedObjects, annotations) {
    this.push(annotations);
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
        throw "Annotation already known with different id/name";
      }
    }, this);
  };

  /**
   * Remove an annotation from the cache.
   */
  AnnotationCache.prototype.remove = function(annotationID) {
    var name = this.annotation_names[annotationID];
    if (name) {
      delete this.annotation_names[annotationID];
    }
    if (name in this.annotation_ids) {
      delete this.annotation_ids[name];
    }
  };

  /**
   * Remove multiple annotations from the cache.
   */
  AnnotationCache.prototype.removeAll = function(annotationIDs) {
    annotationIDs.forEach(this.remove, this);
  };

  /**
   * Add jQuery autocompletion for all cached annotations to the given input
   * element.
   */
  AnnotationCache.prototype.add_autocomplete_to_input = function(input)
  {
    // Expects the annotation cache to be up-to-date
    $(input).autocomplete({
      source: this.getAllNames()
    });
  };

  // Export the annotation cache constructor and a generally available instance.
  CATMAID.AnnotationCache = AnnotationCache;
  CATMAID.annotations = new AnnotationCache();

})(CATMAID);
