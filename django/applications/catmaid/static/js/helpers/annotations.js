/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Ask the user for confirmation before attemting to remove a set of
   * annotations from a set of target objects. An error handler is attached to
   * the returned promise.
   */
  CATMAID.confirmAndRemoveAnnotations = function(projectId, targetIds, annotationIds,
      noCommand) {
    var annotations = annotationIds.map(function(annotationId) {
      return CATMAID.annotations.getName(annotationId);
    });

    if (!confirm('Are you sure you want to remove annotations "' +
          annotations.join(', ') + '"?')) {
      return;
    }

    var remove = noCommand ?
        CATMAID.Annotations.remove(projectId, targetIds, annotationIds) :
        CATMAID.commands.execute(new CATMAID.RemoveAnnotationsCommand(
              projectId, targetIds, annotationIds));

    return remove.then(projectId, targetIds, annotationIds)
        .then(function(data) {
          var msg = (data.deleted_links.length > 0) ?
            "Removed " + data.deleted_links.length + " annotation(s)." :
            "Couldn not delete any annotation";
          CATMAID.info(msg);
        }).catch(CATMAID.handleError);
  };

  /**
   * Show an annotation dialog which allows to specify multiple new annotations
   * and meta annotations.
   */
  CATMAID.promptForAnnotations = function(projectId, entityIds, skeletonIds) {
    var dialog = new CATMAID.OptionsDialog("Add new annotation");
    var annotationList = dialog.appendMessage("Current annotations: ");
    annotationList.classList.add('annotation-container');
    CATMAID.Annotations.forAny(projectId, entityIds, skeletonIds, true)
      .then(function(annotations) {
        if (annotations && annotations.length > 0) {
          // Annotations are already sorted
          var ul = annotations.reduce(function(o, a) {
            var li = document.createElement('li');
            li.setAttribute('title', 'Annotation ID: ' + a.id);
            li.setAttribute('class', 'show_annotation');
            li.setAttribute('data-annotation-id', a.id);
            li.appendChild(document.createTextNode(a.name));
            o.appendChild(li);
            return o;
          }, document.createElement('ul'));
          ul.setAttribute('class', 'resultTags');
          annotationList.appendChild(ul);
        } else {
          var msg = document.createElement('em');
          msg.appendChild(document.createTextNode('(none)'));
          annotationList.appendChild(msg);
        }
      })
      .catch(CATMAID.handleError);

    // Add annotation input field supporting auto-completion
    var annotation_input = dialog.appendField('New annotation: ', 'new-annotation',
        '', true);

    var helpMsg = dialog.appendMessage("Every occurrence of " +
        "'{nX}' with X being a number is replaced by a number that is " +
        "automatically incremented (starting from X) for each annotated " +
        "object.");
    helpMsg.classList.add('help');

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

    return new Promise(function(resolve, reject) {
      dialog.onOK = function() {
        // Get annotation, if any
        var annotation = annotation_input.value;
        if (!annotation) {
          throw new CATMAID.ValueError("No annotation provided");
        }
        annotation = annotation.trim();
        if (0 === annotation.length) {
          throw new CATMAID.ValueError("No annotation provided");
        }
        // Get meta annotation, if any
        var meta_annotations = this.meta_annotation_inputs.reduce(function(o, e) {
          var ma = e.value.trim();
          if (ma.length > 0) {
            o.push(ma);
          }
          return o;
        }, []);

        resolve({
          annotations: [annotation],
          metaAnnotations: meta_annotations
        });
      };

      dialog.show(500, 'auto', true);

      // Allow content to overflow the dialog borders. This is needed for
      // displaying all annotation autocompletion options.
      dialog.dialog.parentNode.style.overflow = 'visible';
      // Auto-completion has to be added after the dialog has been created to ensure
      // the auto completion controls com after the dialog in the DOM (to display
      // them above the dialog).
      CATMAID.annotations.add_autocomplete_to_input(annotation_input);
    });
  };

  CATMAID.annotate_neurons_of_skeletons = function(
      skeleton_ids, callback) {

    CATMAID.annotate(null, skeleton_ids, callback);
  };

  CATMAID.annotate_entities = function(entity_ids,
      callback) {

    CATMAID.annotate(entity_ids, null, callback);
  };

  /**
   * Prompt user for annotations to annotate either target objects directly and/or
   * to annotate the neurons of a set of skeletons.
   */
  CATMAID.annotate = function(entity_ids, skeleton_ids, callback, noCommand) {

    // Complain if the user has no annotation permissions for the current project
    if (!CATMAID.mayEdit()) {
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
    return CATMAID.promptForAnnotations(project.id, entity_ids, skeleton_ids)
      .then(function(annotationSelection) {
        var annotations = annotationSelection.annotations;
        var meta_annotations = annotationSelection.metaAnnotations;

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

        var add = noCommand ?
            CATMAID.Annotations.add(project.id,
                entity_ids, skeleton_ids, annotations, meta_annotations) :
            CATMAID.commands.execute(new CATMAID.AddAnnotationsCommand(project.id,
                entity_ids, skeleton_ids, annotations, meta_annotations));

        return add;
      })
      .then(function(result) {
        if (result.annotations.length == 1) {
          var name = result.annotation_names[0];
          if (result.used_annotations.length > 0) {
            CATMAID.info('Annotation ' + name + ' added to ' +
                result.annotations[0].entities.length +
                (result.annotations[0].entities.length > 1 ? ' entities.' : ' entity.'));
          } else {
            CATMAID.info('Couldn\'t add annotation ' + name + '.');
          }
        } else {
          if (result.used_annotations.length > 0) {
            CATMAID.info('Annotations ' + result.used_annotations.join(', ') + ' added.');
          } else {
            CATMAID.info('Couldn\'t add any of the annotations' +
                result.annotation_names.join(', ') + '.');
          }
        }

        CATMAID.tools.callIfFn(callback);
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Annotate all neurons of the passed in skeletons with the base name of their
   * neurons.
   */
  CATMAID.annotateSkeletonsWithName = function(skeletonIds) {
    return new Promise(function(resolve, reject) {

      // Complain if the user has no annotation permissions for the current project
      if (!CATMAID.mayEdit()) {
        CATMAID.error("You don't have have permission to add annotations");
        return;
      }

      // Show a confirmation dialog to the user
      var dialog = new CATMAID.OptionsDialog("Name annotation");
      dialog.appendMessage("This will make sure that each of the " +
        `${skeletonIds.length} neurons will have its neuron base name ` +
        'annotated, which in turn is annotated with the "Name" ' +
        'annotation. Continue?');
      dialog.onOK = function() {
        CATMAID.Annotations.addMissingNeuronNames(project.id, skeletonIds)
          .then(resolve)
          .catch(reject);
      };
      dialog.onCancel = function() {
        reject(new CATMAID.Warning("Canceled by user"));
      };

      dialog.show(500, 'auto', true);
    });
  };

})(CATMAID);

