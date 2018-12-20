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
      var url = projectId + '/annotations/';
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
     * Get all annotations for a list of skeletons.
     */
    forSkeletons: function(projectId, skeletonIds) {
      var validSkeletonIds = skeletonIds.filter(function(skeletonId) {
        return skeletonId || skeletonId === 0;
      });
      if (validSkeletonIds.length !== skeletonIds.length) {
        throw new CATMAID.ValueError("No skeleton ID can be null or undefiend");
      }
      return CATMAID.fetch(projectId + '/annotations/forskeletons', 'POST', {
        skeleton_ids: validSkeletonIds
      });
    },

    /**
     * Get all annotations for a list of target entities like neurons or
     * other annotations.
     */
    forTarget: function(projectId, entityIds) {
      return CATMAID.fetch(project.id + '/annotations/query', 'POST', {
        object_ids: entityIds
      });
    },

    /**
     * Get a set of all annotations linked to either the passed in entity IDs or
     * the neurons that the passed in skeleton IDs model.
     */
    forAny: function(projectId, entityIds, skeletonIds, sort) {
      var requestAnnotations = Promise.resolve({
        uniqueIds: new Set(),
        nameMap: new Map()
      });
      var collectAnnotations = function(ann, annotationInfo) {
        if (annotationInfo && annotationInfo.annotations) {
          for (var annotationId in annotationInfo.annotations) {
            annotationId = parseInt(annotationId, 10);
            if (!ann.uniqueIds.has(annotationId)) {
              ann.uniqueIds.add(annotationId);
              ann.nameMap.set(annotationId,
                  annotationInfo.annotations[annotationId]);
            }
          }
        }
        return ann;
      };
      if (entityIds && entityIds.length > 0) {
        requestAnnotations = requestAnnotations.then(function(ann) {
          return CATMAID.Annotations.forTarget(project.id, entityIds)
            .then(function(annotationInfo) {
              return collectAnnotations(ann, annotationInfo);
            });
        });
      }
      if (skeletonIds && skeletonIds.length > 0) {
        requestAnnotations = requestAnnotations.then(function(ann) {
          return CATMAID.Annotations.forSkeletons(project.id, skeletonIds)
            .then(function(annotationInfo) {
              return collectAnnotations(ann, annotationInfo);
            });
        });
      }
      return requestAnnotations
        .then(function(ann) {
          var annotations = Array.from(ann.uniqueIds);
          for (var i=0; i<annotations.length; ++i) {
            var id = annotations[i];
            annotations[i] = {
              id: id,
              name: ann.nameMap.get(id)
            };
          }
          return sort ? annotations.sort(function(a, b) {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          }) : annotations;
        });
    },

    /**
     * Removes multiple annotation from a list of entities. It is not dependent on
     * any context, but asks the user for confirmation. A promise is returned.
     */
    remove: function(projectId, entityIds, annotationIds) {
      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to remove annotations');
      var url = projectId + '/annotations/remove';
      var params = {
        entity_ids: entityIds,
        annotation_ids: annotationIds
      };
      return CATMAID.fetch(url, 'POST', params).then(function(json) {
        if (json.deleted_annotations) {
          var deletedAnnotationIds = [];
          var changedEntities = [];
          for (var da in json.deleted_annotations) {
            var entry = json.deleted_annotations[da];
            if (0 === json.left_uses[da]) {
              // Only consider an annotation as deleted if it is not used at all
              // anymore.
              deletedAnnotationIds.push(da);
            }
            if (entry.targetIds) {
              changedEntities = changedEntities.concat(entry.targetIds);
            }
          }

          if (deletedAnnotationIds.length > 0) {
            CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_DELETED,
                deletedAnnotationIds);
          }

          if (changedEntities.length > 0) {
            // An empty annotation list is used as parameter, because this
            // parameter represents added neurons.
            CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
                changedEntities, []);
          }
        }

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
            used_annotations: used_annotations,
            new_annotations: e.new_annotations
          };
        });
    },

    /**
     * Annotate all neurons of the passed in skeletons with the base name of their
     * neurons.
     */
    addMissingNeuronNames: function(projectId, skeletonIds) {
      return CATMAID.fetch(projectId + '/annotations/add-neuron-names', 'POST', {
          'skeleton_ids': skeletonIds,
        });
    }

  };

  // Collect annotation related events in a dedicated object
  Annotations.EVENT_ANNOTATIONS_CHANGED = "annotations_changed";
  // If annotations are deleted entirely
  Annotations.EVENT_ANNOTATIONS_DELETED = "annotations_deleted";
  CATMAID.asEventSource(Annotations);

  // Export annotation namespace
  CATMAID.Annotations = Annotations;

  /**
   * Wrap linking new and existing annotations to other class instances.
   */
  CATMAID.AddAnnotationsCommand = CATMAID.makeCommand(function(projectId,
        entityIds, skeletonIds, annotations, metaAnnotations) {

    var exec = function(done, command) {
      var addAnnotations = CATMAID.Annotations.add(projectId, entityIds, skeletonIds,
          annotations, metaAnnotations);

      return addAnnotations.then(function(result) {
        command._createdLinks = result.annotations;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._createdLinks) {
        throw new CATMAID.ValueError('Can\'t undo creation of annotation, history data not available');
      }

      // Build one promise for each link and return a super promise that
      // resolves once all removal promises are resolved.
      var promises = command._createdLinks.map(function(annotation) {
        return CATMAID.Annotations.remove(projectId, annotation.entities, [annotation.id]);
      });
      return Promise.all(promises).then(done);
    };

    // Prepare command label
    var type = (annotations.length === 1) ? "annotation" : "annoations";
    var targetInfo = [];
    if (skeletonIds) { targetInfo.push(" to skeletons " + skeletonIds.join(", ")); }
    if (entityIds) { targetInfo.push(" to objects " + entityIds.join(", ")); }
    var metaInfo = (metaAnnotations && metaAnnotations.length > 0) ?
        (" and meta annotation(s) " + metaAnnotations.join(", ")) : "";
    var info = "Add " + type + targetInfo.join(' and ') + ": " +
        annotations.join(", ") + metaInfo;

    this.init(info, exec, undo);
  });

  /**
   * Remove annotations with this command. This can be undone if the execution
   * the initial execution had an actual removal as effect.
   */
  CATMAID.RemoveAnnotationsCommand = CATMAID.makeCommand(function(projectId,
        targetIds, annotationIds) {

    // Get current annotation id/mapping
    var annotationMap = annotationIds.reduce(function(o, annotationId) {
      o[annotationId] = CATMAID.annotations.getName(annotationId);
      return o;
    }, {});

    var exec = function(done, command) {
      var removeAnnotations = CATMAID.Annotations.remove(projectId, targetIds,
          annotationIds);

      return removeAnnotations.then(function(result) {
        command._removed_annotations = result.deleted_annotations;
        done();
        return result;
      });
    };

    var undo = function(done, command) {
      // Fail if expected undo parameters are not available from command
      if (undefined === command._removed_annotations) {
        throw new CATMAID.ValueError('Can\'t undo removal of annotation, history data not available');
      }

      // Build one promise for each link and return a super promise that
      // resolves once all removal promises are resolved.
      var remAnnotationIds = command._removed_annotations;
      var promises = Object.keys(remAnnotationIds).map(function(annotationId) {
        var annotation = annotationMap[annotationId];
        if (!annotation) {
          throw new CATMAID.ValueError("Can't undo removal of annotation, can't find annotation name for ID " + annotationId);
        }
        return CATMAID.Annotations.add(projectId, this[annotationId].targetIds, null,
            [annotation]);
      }, remAnnotationIds);
      return Promise.all(promises).then(done);
    };

    // Prepare command label
    var atype = (annotationIds.length > 1) ? "annotations" : "annoation";
    var otype = (targetIds.length > 1) ? "objects" : "object";
    var info = "Remove " + atype + " \"" + Object.keys(annotationMap).join("\", \"") +
         "\" from " + otype + targetIds.join(", ");

    this.init(info, exec, undo);
  });

})(CATMAID);
