/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  CATMAID.prompt_for_annotations = function(success_fn)
  {
    var dialog = new CATMAID.OptionsDialog("Add new annotation");
    dialog.appendMessage("Add a new annotation for the selected objects.");

    var helpMsg = dialog.appendMessage("Click here for details");
    $(helpMsg).click(function() {
      $(this).empty().append(document.createTextNode("Every occurrence of " +
        "'{nX}' with X being a number is replaced by a number that is " +
        "automatically incremented (starting from X) for each annotated " +
        "object."));
    });

    // Add annotation input field supporting auto-completion
    var annotation_input = dialog.appendField('Annotation: ', 'new-annotation',
        '', true);
    // Add button to toggle display of meta annotation input field
    var $meta_toggle = $(dialog.appendMessage(
        "Click here to also add a meta annotation"));
    dialog.meta_annotation_inputs = [];
    // Have a method to create new meta annotation fields
    var add_meta_annotation_fields = function(continuation) {
      // Add meta annotation input field with autocompletion
      var meta_annotation_input = dialog.appendField('Meta annotation: ',
          'new-meta-annotation' + dialog.meta_annotation_inputs.length, '', true);
      CATMAID.annotations.add_autocomplete_to_input(meta_annotation_input);
      // Add text to append new field
      var $new_meta_field = $(dialog.appendMessage(
          "Click to add another meta annotation to basic annotation"));
      $new_meta_field.click(add_meta_annotation_fields.bind(this,
          $new_meta_field.hide.bind($new_meta_field)));
      // Increase meta annotation counter in dialog
      dialog.meta_annotation_inputs.push(meta_annotation_input);
      // Call continuation
      continuation();
    };
    // Add toggle functionalty to text and hide meta input box
    $meta_toggle.click(add_meta_annotation_fields.bind(this,
        $meta_toggle.hide.bind($meta_toggle)));

    dialog.onOK = function() {
      // Get annotation, if any
      var annotation = annotation_input.value;
      if (!annotation) return;
      annotation = annotation.trim();
      if (0 === annotation.length) return; // can't annotate with nothing
      // Get meta annotation, if any
      var meta_annotations = this.meta_annotation_inputs.reduce(function(o, e) {
        var ma = e.value.trim();
        if (ma.length > 0) {
          o.push(ma);
        }
        return o;
      }, []);
      // Call handler
      success_fn([annotation], meta_annotations);
    };

    dialog.show(400, 'auto', true);

    // Allow content to overflow the dialog borders. This is needed for
    // displaying all annotation autocompletion options.
    dialog.dialog.parentNode.style.overflow = 'visible';
    // Auto-completion has to be added after the dialog has been created to ensure
    // the auto completion controls com after the dialog in the DOM (to display
    // them above the dialog).
    CATMAID.annotations.add_autocomplete_to_input(annotation_input);
  };

  CATMAID.annotate_neurons_of_skeletons = function(
      skeleton_ids, callback)
  {
    CATMAID.annotate(null, skeleton_ids, callback);
  };

  CATMAID.annotate_entities = function(entity_ids,
      callback)
  {
    CATMAID.annotate(entity_ids, null, callback);
  };

  CATMAID.annotate = function(entity_ids, skeleton_ids,
      callback)
  {
    // Complain if the user has no annotation permissions for the current project
    if (!checkPermission('can_annotate')) {
      CATMAID.error("You don't have have permission to add annotations");
      return;
    }

    // Complain if there is no target
    var has_target = (entity_ids && entity_ids.length > 0) ||
        (skeleton_ids && skeleton_ids.length > 0);
    if (!has_target) {
      CATMAID.error("Please select at least one annotation, neuron or skeleton!");
      return;
    }

    // Get annotation terms
    var annotations = CATMAID.prompt_for_annotations(function(annotations,
        meta_annotations) {
      if (!annotations) return;
      // Build request data structure
      var data = {
        annotations: annotations,
      };
      if (meta_annotations) {
        data.meta_annotations = meta_annotations;
      }
      if (entity_ids) {
          data.entity_ids = entity_ids;
      }
      if (skeleton_ids) {
          data.skeleton_ids = skeleton_ids;
      }
      // Do request
      requestQueue.register(django_url + project.id + '/annotations/add',
          'POST', data, function(status, text, xml) {
            if (status === 200) {
              var e = $.parseJSON(text);
              if (e.error) {
                new CATMAID.ErrorDialog(e.error, e.detail).show();
              } else {
                var ann_names = e.annotations.map(function(a) { return a.name; });
                var used_annotations = e.annotations.reduce(function(o, a) {
                  if (a.entities.length > 0) o.push(a.name);
                  return o;
                }, []);
                if (e.annotations.length == 1)
                  if (used_annotations.length > 0) {
                    CATMAID.info('Annotation ' + ann_names[0] + ' added to ' +
                        e.annotations[0].entities.length +
                        (e.annotations[0].entities.length > 1 ? ' entities.' : ' entity.'));
                  } else {
                    CATMAID.info('Couldn\'t add annotation ' + ann_names[0] + '.');
                  }
                else
                  if (used_annotations.length > 0) {
                    CATMAID.info('Annotations ' + used_annotations.join(', ') + ' added.');
                  } else {
                    CATMAID.info('Couldn\'t add any of the annotations' +
                        ann_names.join(', ') + '.');
                  }
                // Update the annotation cache with new annotations, if any
                try {
                  CATMAID.annotations.push(e.annotations);
                } catch(err) {
                  new CATMAID.ErrorDialog("There was a problem updating the " +
                      "annotation cache, please close and re-open the tool",
                      err).show();
                }

                // Collect updated entities
                var changedEntities = e.annotations.reduce(function(ce, a) {
                  a.entities.forEach(function(e) {
                    if (-1 === this.indexOf(e)) this.push(e);
                  }, ce);
                  return ce;
                }, []);

                CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
                    changedEntities);

                // Let the neuron name service update itself and execute the
                // callbackback after this is done
                NeuronNameService.getInstance().refresh(function() {
                  if (callback) callback();
                });
              }
            }
          });
    });
  };

  /**
   * This neuron annotation namespace method removes an annotation from another
   * entity. It is not dependent on any context, but asks the user for
   * confirmation. A callback can be executed in the case of success.
   */
  CATMAID.remove_annotation = function(entity_id,
      annotation_id, callback)
  {
    CATMAID.remove_annotation_from_entities([entity_id],
        annotation_id, callback);
  };

  /**
   * This neuron annotation namespace method removes an annotation from a list of
   * entities. It is not dependent on any context, but asks the user for
   * confirmation. A callback can be executed in the case of success.
   */
  CATMAID.remove_annotation_from_entities = function(entity_ids,
      annotation_id, callback)
  {
    // Complain if the user has no annotation permissions for the current project
    if (!checkPermission('can_annotate')) {
      CATMAID.error("You don't have have permission to remove annotations");
      return;
    }

    if (!confirm('Are you sure you want to remove annotation "' +
          CATMAID.annotations.getName(annotation_id) + '"?')) {
      return;
    }

    requestQueue.register(django_url + project.id + '/annotations/' +
        annotation_id + '/remove',
        'POST', {
          entity_ids: entity_ids
        },
        $.proxy(function(status, text, xml) {
          if (status === 200) {
            var e = $.parseJSON(text);
            if (e.error) {
              new CATMAID.ErrorDialog(e.error, e.detail).show();
            } else {
              // If the actual annotation was removed, update cache
              if (e.deleted_annotation) CATMAID.annotations.remove(annotation_id);

              // Let the neuron name service update itself
              NeuronNameService.getInstance().refresh();

              // Use a copy of the entity id list, because we we will use this array also
              // as a callback parameter. No deep clone required, we expect only numbers
              // (or strungs).
              var changed_entities = entity_ids.slice(0);

              // Use a copy of th
              CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
                  entity_ids);
              if (callback) callback(e.message);
            }
          }
        }, this));
  };

  /**
   * Removes multiple annotation from a list of entities. It is not dependent on
   * any context, but asks the user for confirmation. A promise is returned.
   */
  CATMAID.remove_annotations_from_entities = function(entity_ids,
      annotation_ids, callback) {
    // Complain if the user has no annotation permissions for the current project
    if (!checkPermission('can_annotate')) {
      CATMAID.error("You don't have have permission to remove annotations");
      return;
    }

    var annotations = annotation_ids.map(function(annotation_id) {
      return CATMAID.annotations.getName(annotation_id);
    });

    if (!confirm('Are you sure you want to remove annotations "' +
          annotations.join(', ') + '"?')) {
      return;
    }

    requestQueue.register(django_url + project.id + '/annotations/remove',
        'POST', {
          entity_ids: entity_ids,
          annotation_ids: annotation_ids
        },
        CATMAID.jsonResponseHandler(function(json) {
          // Let the neuron name service update itself
          NeuronNameService.getInstance().refresh();

          // Use a copy of the entity id list, because we we will use this array also
          // as a callback parameter. No deep clone required, we expect only numbers
          // (or strungs).
          var changed_entities = entity_ids.slice(0);

          // Use a copy of th
          CATMAID.Annotations.trigger(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
              entity_ids);
          if (callback) callback(json);
        }));
  };

  /**
   * A neuron annotation namespace method to retrieve annotations from the backend
   * for the neuron modeled by a particular skeleton. If the call was successfull,
   * the passed handler is called with the annotation set as parameter.
   */
  CATMAID.retrieve_annotations_for_skeleton = function(skid, handler) {
    requestQueue.register(django_url + project.id +  '/annotations/',
      'POST', {'skeleton_id': skid}, function(status, text) {
        if (status !== 200) {
          alert("Unexpected status code: " + status);
          return false;
        }
        if (text && text !== " ") {
          var json = $.parseJSON(text);
          if (json.error) {
            new CATMAID.ErrorDialog(json.error, json.detail).show();
          } else if (handler) {
            handler(json.annotations);
          }
        }
      });
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
    requestQueue.register(django_url + project.id + '/annotations/',
        'POST', {}, (function (status, data, text) {
          var e = $.parseJSON(data);
          if (status !== 200) {
              alert("The server returned an unexpected status (" +
                status + ") " + "with error message:\n" + text);
          } else {
            if (e.error) {
              new CATMAID.ErrorDialog(e.error, e.detail).show();
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

  // Collect annotation related events in a dedicated object
  CATMAID.Annotations = {};
  CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED = "annotations_changed";
  CATMAID.asEventSource(CATMAID.Annotations);

})(CATMAID);
