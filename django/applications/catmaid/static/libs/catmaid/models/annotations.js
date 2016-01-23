/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with annotations on neurons. All
   * of them return promises.
   */
  var Annotations = {

    /**
     * A neuron annotation namespace method to retrieve annotations from the backend
     * for the neuron modeled by a particular skeleton. If the call was successfull,
     * the passed handler is called with the annotation set as parameter.
     */
    forSkeleton: function(projectId, skeletonId) {
      CATMAID.requirePermission(projectId, 'can_browse');
      var url = CATMAID.makeURL(projectId + '/annotations/');
      var params = {
        'skeleton_id': skeletonId
      };
      return CATMAID.fetch(url, 'POST', params).then(function(json) {
        if (json.annotations && json.annotations instanceof Array) {
          return json.annotations;
        } else {
          throw new CATMAID.Error('Can\'t load annotations', json);
        }
      });
    },

    /**
     * Removes multiple annotation from a list of entities. It is not dependent on
     * any context, but asks the user for confirmation. A promise is returned.
     */
    remove: function(projectId, entityIds, annotationIds) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove annotations');
      var url = CATMAID.makeURL(projectId + '/annotations/remove');
      var params = {
        entity_ids: entityIds,
        annotation_ids: annotationIds
      };
      return CATMAID.fetch(url, 'POST', params).then(function(json) {
        if (json.deleted_annotations && json.deleted_annotations.length > 0) {
          CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_DELETED,
              json.deleted_annotations);
        }
        // Use a copy of the entity id list, because we we will use this array also
        // as a callback parameter. No deep clone required, we expect only numbers
        // (or strings).
        var changedEntities = entityIds.slice(0);
        // Use a copy of th
        CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
            changedEntities);

        return json;
      });
    },

    /**
     * Add new or existing annotations to a set of target objects.
     */
    add: function(projectId, entityIds, skeletonIds, annotations, metaAnnotations) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to add annotations');

      // Build request data structure
      var data = {
        annotations: annotations,
      };
      if (metaAnnotations) {
        data.meta_annotations = metaAnnotations;
      }
      if (entityIds) {
          data.entity_ids = entityIds;
      }
      if (skeletonIds) {
          data.skeleton_ids = skeletonIds;
      }

      return CATMAID.fetch(projectId + '/annotations/add', 'POST', data)
        .then(function(e) {
          // Pre-process part of the result
          var ann_names = e.annotations.map(function(a) { return a.name; });
          var used_annotations = e.annotations.reduce(function(o, a) {
            if (a.entities.length > 0) o.push(a.name);
            return o;
          }, []);
          // Collect updated entities
          var changedEntities = e.annotations.reduce(function(ce, a) {
            a.entities.forEach(function(e) {
              if (-1 === this.indexOf(e)) this.push(e);
            }, ce);
            return ce;
          }, []);

          CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
              changedEntities, e.annotations);

          return {
            annotations: e.annotations,
            annotation_names: ann_names,
            used_annotations: used_annotations
          };
        });
    },

  };

  // Collect annotation related events in a dedicated object
  Annotations.EVENT_ANNOTATIONS_CHANGED = "annotations_changed";
  // If annotations are deleted entirely
  Annotations.EVENT_ANNOTATIONS_DELETED = "annotations_deleted";
  CATMAID.asEventSource(Annotations);

  // Export annotation namespace
  CATMAID.Annotations = Annotations;

})(CATMAID);
