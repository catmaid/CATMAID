/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var NeuronAnnotations = function()
{
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.nextFieldID = 1;    // unique ID for annotation fields added by the "+" button
  this.queryResults = [];
  this.pid = project.id;
};

NeuronAnnotations.prototype = {};
$.extend(NeuronAnnotations.prototype, new InstanceRegistry());
$.extend(NeuronAnnotations.prototype, new SkeletonSource());

/* Implement interfaces */

NeuronAnnotations.prototype.getName = function()
{
    return "Neuron Search " + this.widgetID;
};

NeuronAnnotations.prototype.destroy = function()
{
  this.unregisterInstance();
  this.unregisterSource();
};

NeuronAnnotations.prototype.append = function() {};
NeuronAnnotations.prototype.clear = function(source_chain) {};
NeuronAnnotations.prototype.removeSkeletons = function() {};
NeuronAnnotations.prototype.updateModels = function() {};

NeuronAnnotations.prototype.getSelectedSkeletons = function() {
  return this.get_selected_neurons().reduce( function(o, e) {
    if (e.type === 'neuron') {
      o = o.concat(e.skeleton_ids);
    }
    return o;
  }, []);
};

NeuronAnnotations.prototype.hasSkeleton = function(skeleton_id) {
  return this.queryResults.some(function(e) {
    return e.type === 'neuron' && e.skeleton_ids.some(function(id) {
      return id === skeleton_id;
    });
  });
};

NeuronAnnotations.prototype.getSelectedSkeletonModels = function() {
  return this.get_selected_neurons().reduce(function(o, e) {
    if (e.type === 'neuron') {
      e.skeleton_ids.forEach(function(s) {
        o[s] = new SelectionTable.prototype.SkeletonModel(
            s, e.name, new THREE.Color().setRGB(1, 1, 0));
      });
    }
    return o;
  }, {});
};

NeuronAnnotations.prototype.highlight = function(skeleton_id)
{
  // Find neuron containing this skeleton_id
  var neurons = this.queryResults.filter(function(e) {
    if (e.type == 'neuron') {
      return e.skeleton_ids.some(function(s) {
        return s == skeleton_id;
      });
    } else {
      return false;
    }
  });

  if (neurons) {
    // Remove any highlighting
    $('[class^=neuron_annotation_result_row' + this.widgetID + '_]').css(
        'background-color', '');
    // Highlight the neuron, containing the requested skeleton, if available.
    // Altough the code works for multiple neurons, it should be normally the
    // case that there is only one neuron, belonging to the skeleton.
    neurons.forEach($.proxy(function(n) {
      $('.neuron_annotation_result_row' + this.widgetID + '_' + n.id).css(
          'background-color', SelectionTable.prototype.highlighting_color);
    }, this));
  }
};

/* Non-interface methods */

/**
 * Create a table row and passes it to add_row_fn which should it add it
 * whereever it wants. The third parameter specifies the number of indentation
 * steps that should be used.
 */
NeuronAnnotations.prototype.add_result_table_row = function(entity, add_row_fn,
    indent)
{
  // Build table row
  var tr = document.createElement('tr');
  tr.setAttribute('class', 'neuron_annotation_result_row' +
          this.widgetID + '_' + entity.id);
  tr.setAttribute('type', entity.type);

  // Checkbox & name column, potentially indented
  var td_cb = document.createElement('td');
  td_cb.setAttribute('colspan', '2');
  var div_cb = document.createElement('div');
  // Make sure the line isn't wrapped
  div_cb.style.whiteSpace = 'nowrap';
  // Add indentation
  div_cb.style.marginLeft = indent * 1.5 + 'em';
  var cb = document.createElement('input');
  cb.setAttribute('type', 'checkbox');
  cb.setAttribute('entity_id', entity.id);
  cb.setAttribute('class', 'result' + this.widgetID + '_' +
          entity.id);
  var a = document.createElement('a');
  a.setAttribute('href', '#');
  a.appendChild(document.createTextNode(entity.name));
  var label = document.createElement('label');
  label.appendChild(cb);
  label.appendChild(a);
  div_cb.appendChild(label);
  td_cb.appendChild(div_cb);
  tr.appendChild(td_cb);

  // Type column
  var td_type = document.createElement('td');
  td_type.appendChild(document.createTextNode(
          entity.type));
  tr.appendChild(td_type);

  // Annotations column
  var td_ann = document.createElement('td');
  // Build list of annotations and use layout of jQuery tagbox
  var ul = entity.annotations.reduce(
    function(o, e) {
      var li = document.createElement('li');
      li.setAttribute('title', 'Remove annotation');
      li.setAttribute('class', 'remove_annotation');
      li.setAttribute('neuron_id', entity.id);
      li.setAttribute('annotation_id', e.id);
      li.setAttribute('user_id', e.uid);
      li.appendChild(document.createTextNode(e.name));
      o.appendChild(li);
      return o;
    }, document.createElement('ul'));
  ul.setAttribute('class', 'tagEditor');
  td_ann.appendChild(ul);
  tr.appendChild(td_ann);

  // Add row to table
  add_row_fn(tr);

  // Wire up handlers
  if (entity.type == 'neuron') {
    var create_handler = function(skid) {
      return function() {
        TracingTool.goToNearestInNeuronOrSkeleton( 'skeleton', skid );
      }
    }
    // Go to nearest
    if (entity.skeleton_ids.length > 0) {
      $(a).click(create_handler(entity.skeleton_ids[0]));
    } else {
      $(a).click(function() { alert("No skeleton found!"); });
    }
  } else if (entity.type == 'annotation') {
    // Add annotation attribute to link
    a.setAttribute('annotation', entity.name);
    // Expand
    var self = this;
    $(a).click(function() {
      // If expanded, collapse it. Expand it otherwise.
      if ($(this).is('[expanded]')) {
        // TODO: Collapse it
      } else {
        // Mark link expanded
        this.setAttribute('expanded', 'true');
        // Request entities that are annotated with this annotation
        // and replace the clicked on annotation with the result.
        var query_data = {
          'neuron_query_by_annotation': $(this).attr('annotation'),
        };
        requestQueue.register(django_url + project.id + '/neuron/query-by-annotations',
            'POST', query_data, function(status, text, xml) {
              if (status === 200) {
                var e = $.parseJSON(text);
                if (e.error) {
                  alert(e.error);
                } else {
                  //Append new content right after the current node
                  var appender = function(new_tr) {
                    $(tr).after(new_tr)
                  };

                  e.forEach((function(entity) {
                    self.add_result_table_row(entity, appender, indent + 1);
                  }).bind(self));

                  // The order of the query result array doesn't matter.
                  // It is therefore possible to just append the new results.
                  self.queryResults = self.queryResults.concat(e);
                  // Update current result table classes
                  self.update_result_row_classes();
                }
              }
        });
      }
    });
  }
  // Add click handlers to remove tags from nodes
  var NA = this;
  $(".remove_annotation", $(ul)).click( function() {
      NA.remove_annotation($(this).attr('neuron_id'),
          $(this).attr('annotation_id'));
  });
  // Add handler to the checkbox infront of each entity
  var create_cb_handler = function(widget) {
    return function() {
          var clicked_cb = this;
          var is_checked = $(this).is(':checked');
          var entity_id = $(this).attr('entity_id');
          // Update sync link
          widget.updateLink(widget.getSelectedSkeletonModels());
          // Potentially remove skeletons from link target
          if (!is_checked && widget.linkTarget) {
            var skids = widget.queryResults.reduce(function(o, e) {
              if (e.id == entity_id) {
                o = o.concat(e.skeleton_ids);
              }
              return o;
            }, []);
            // Prevent propagation loop by checking if the target has the skeletons anymore
            if (skids.some(widget.linkTarget.hasSkeleton, widget.linkTarget)) {
              widget.linkTarget.removeSkeletons(skids);
            }
          }
          // Due to expanded annotations, an entity can appear multiple times. Look
          // therefore for copies of the current one to toggle it as well.
          $("#neuron_annotations_query_results_table" + widget.widgetID).find(
              'td input[entity_id=' + entity_id + ']').each(function() {
                  if (this != clicked_cb) {
                    // Set property without firing event
                    $(this).prop('checked', is_checked);
                  }
              });
      };
  };
  $(cb).change(create_cb_handler(this));
};

NeuronAnnotations.prototype.query = function()
{
  var form_data = $('#neuron_query_by_annotations' +
      this.widgetID).serializeArray().reduce(function(o, e) {
        o[e.name] = e.value;
        return o;
      }, {});

  // Here, $.proxy is used to bind 'this' to the anonymous function
  requestQueue.register(django_url + this.pid + '/neuron/query-by-annotations',
      'POST', form_data, $.proxy( function(status, text, xml) {
        if (status === 200) {
          var e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            var $tableBody = $('#neuron_annotations_query_results' +
                this.widgetID).find('tbody');
            $tableBody.empty();
            this.queryResults = e;
            // create appender function which adds rows to table
            var appender = function(tr) {
              $tableBody.append(tr);
            };
            // Create result table rows
            this.queryResults.forEach((function(entity) {
              this.add_result_table_row(entity, appender, 0);
            }).bind(this));

            // If there are results, display the result table
            if (this.queryResults.length > 0) {
              $('#neuron_annotations_query_no_results' + this.widgetID).hide();
              $('#neuron_annotations_query_results' + this.widgetID).show();
              this.update_result_row_classes();
            } else {
              $('#neuron_annotations_query_results' + this.widgetID).hide();
              $('#neuron_annotations_query_no_results' + this.widgetID).show();
            }
          }
        }
      }, this));
};

NeuronAnnotations.prototype.update_result_row_classes = function()
{
  var $tableBody = $('#neuron_annotations_query_results' +
      this.widgetID + ' tbody');
  // First, remove all 'odd' classes
  $("tr", $tableBody).removeClass("odd");
  // Re-add class for currently 'odd' rows
  $("tr:nth-child(odd)", $tableBody).addClass("odd");
};

NeuronAnnotations.prototype.add_query_field = function()
{
  // Create a copy of the first row.
  var $newRow = $("#neuron_query_by_annotation" + this.widgetID).clone();
  $newRow.attr({
      id: 'neuron_query_by_annotation' + this.widgetID + '_' +
          this.nextFieldID,
      name: 'neuron_query_by_annotation' + this.widgetID + '_' +
          this.nextFieldID
  });

  $newRow.children()[0].innerHTML = 'and:'

  // Update the text field attributes.
  var $text = $newRow.find("input[type='text']");
  $text.attr({
      id: 'neuron_query_by_annotation' + this.widgetID + '_' +
          this.nextFieldID,
      name: 'neuron_query_by_annotation' + this.widgetID + '_' +
          this.nextFieldID,
      value: ''
  });
  // Add autocompletion to it
  this.add_autocomplete_to_input($text);

  // Update the button attributes.
  var $button = $newRow.find("input[type='button']");
  $button.attr('value', '-');
  $button.click(this.remove_query_field.bind(this, this.nextFieldID));
  $("#neuron_query_by_annotator" + this.widgetID).before($newRow);

  this.nextFieldID += 1;
};

NeuronAnnotations.prototype.remove_query_field = function(rowNum)
{
  var $row = $("#neuron_query_by_annotation" + this.widgetID + "_" + rowNum);
  $row.remove();
};

NeuronAnnotations.prototype.toggle_neuron_selections = function()
{
  var newValue = $("#neuron_annotations_toggle_neuron_selections_checkbox" +
      this.widgetID)[0].checked;
  $("#neuron_annotations_query_results_table" + this.widgetID).find(
      'tbody tr td input[class*=result' + this.widgetID + '_]').each(
          function(i, element) {
            element.checked = newValue;
          });
  // Update sync link
  this.updateLink(this.getSelectedSkeletonModels());
  // Potentially remove skeletons from link target
  if (this.linkTarget) {
    var unselected_skids = this.get_unselected_neurons().reduce(function(o, e) {
      if (e.type === 'neuron') {
        o = o.concat(e.skeleton_ids);
      }
      return o;
    }, []);
    // Prevent propagation loop by checking if the target has the skeletons anymore
    if (unselected_skids.some(this.linkTarget.hasSkeleton, this.linkTarget)) {
      this.linkTarget.removeSkeletons(unselected_skids);
    }
  }
};

/**
 * If passed true, this function returns a list of selected entities.
 * Otherweise, a list of unselected entities is returned.
 */
NeuronAnnotations.prototype.get_entities = function(checked)
{
  var visited = {};
  return this.queryResults.reduce((function(o, e) {
      // Test if one of the checkboxes for a particular neuron is checked
      var is_checked = $("#neuron_annotations_query_results_table" +
          this.widgetID).find('tr[type=neuron]').find('input[class=result' +
              this.widgetID + '_' + e.id + ']').is(':checked');
      // Avoid duplicates if the same neuron is checked multiple times and
      // add it only if not yet present.
      if (is_checked == checked && !(e.id in visited)) {
          o.push(e);
          visited[e.id] = true;
      }
      return o;
    }).bind(this), []);
}

NeuronAnnotations.prototype.get_selected_neurons = function()
{
  return this.get_entities(true);
}

NeuronAnnotations.prototype.get_unselected_neurons = function()
{
  return this.get_entities(false);
}

NeuronAnnotations.prototype.prompt_for_annotations = function(success_fn)
{
  var dialog = new OptionsDialog("Add new annotation");
  dialog.appendMessage("Add a new annotation for the selected objects");
  // Add annotation input field supporting auto-completion
  var annotation_input = dialog.appendField('Annotation: ', 'new-annotation', '');
  this.add_autocomplete_to_input(annotation_input);
  // Add button to toggle display of meta annotation input field
  var $meta_toggle = $(dialog.appendMessage(
      "Click here to also add a meta annotation"));
  dialog.meta_annotation_inputs = [];
  // Have a method to create new meta annotation fields
  var add_meta_annotation_fields = function(continuation) {
    // Add meta annotation input field with autocompletion
    var meta_annotation_input = dialog.appendField('Meta annotation: ',
        'new-meta-annotation' + dialog.meta_annotation_inputs.length, '');
    this.add_autocomplete_to_input(meta_annotation_input);
    // Add text to append new field
    var $new_meta_field = $(dialog.appendMessage(
        "Click here to add another meta annotation"));
    $new_meta_field.click(add_meta_annotation_fields.bind(this,
        $new_meta_field.hide.bind($new_meta_field)));
    // Increase meta annotation counter in dialog
    dialog.meta_annotation_inputs.push(meta_annotation_input)
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

  dialog.show('auto', 'auto', true);
}

NeuronAnnotations.prototype.annotate_neurons_of_skeletons = function(
    skeleton_ids, callback)
{
  this.annotate(null, skeleton_ids, callback);
};

NeuronAnnotations.prototype.annotate_neurons = function(neuron_ids,
    callback)
{
  this.annotate(neuron_ids, null, callback);
};

NeuronAnnotations.prototype.annotate = function(neuron_ids, skeleton_ids,
    callback)
{
  // Get annotation terms
  var annotations = this.prompt_for_annotations(function(annotations,
      meta_annotations) {
    if (!annotations) return;
    // Build request data structure
    var data = {
      annotations: annotations,
    };
    if (meta_annotations) {
      data.meta_annotations = meta_annotations;
    }
    if (neuron_ids) {
        data.neuron_ids = neuron_ids;
    }
    if (skeleton_ids) {
        data.skeleton_ids = skeleton_ids;
    }
    // Do request
    requestQueue.register(django_url + project.id + '/neuron/annotate',
        'POST', data, function(status, text, xml) {
          if (status === 200) {
            var e = $.parseJSON(text);
            if (e.error) {
              alert(e.error);
            } else {
              if (annotations.length == 1)
                growlAlert('Information', 'Annotation ' + annotations[0] + ' added.');
              else
                growlAlert('Information', 'Annotations ' + annotations.join(', ') + ' added.');
              // Execute callback, if any
              if (callback) callback();
            }
          }
        });
  });
};

NeuronAnnotations.prototype.remove_annotation = function(neuron_id,
    annotation_id)
{
  if (!confirm('Are you sure you want to remove this annotation?')) {
    return;
  }

  requestQueue.register(django_url + this.pid + '/neuron/' + neuron_id +
      '/annotation/' + annotation_id + '/remove',
      'POST', {}, $.proxy(function(status, text, xml) {
        if (status === 200) {
          var e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            // Display message returned by the server
            growlAlert('Information', e.message);
            // Remove current annotation from displayed list
            var result_tr = $('#neuron_annotations_query_results' +
                this.widgetID).find('.remove_annotation[neuron_id=' +
                neuron_id + '][annotation_id=' + annotation_id + ']');
            result_tr.fadeOut(1000, function() { $(this).remove(); });
          }
        }
      }, this));
};

NeuronAnnotations.prototype.add_autocomplete_to_input = function(input)
{
  // Get a JSON list with all available annotations and initialize
  // autocompletion for the name field.
  requestQueue.register(django_url + project.id + '/annotations/list',
      'GET', {}, function (status, data, text) {
        var e = $.parseJSON(data);
        if (status !== 200) {
            alert("The server returned an unexpected status (" +
              status + ") " + "with error message:\n" + text);
        } else {
          if (e.error) {
            alert(e.error);
          } else {
            var annotation_names = e.annotations.map(function(a) {
              return a.name;
            });
            $(input).autocomplete({
              source: annotation_names
            });
          }
        }
      });
};

/**
 * If passed 'true', this function will hide all annotation objects within the
 * result table that hasn't been linked by the user passed as second argument.
 * Otherwise, it will show all annotations.
 */
NeuronAnnotations.prototype.toggle_annotation_display = function(
    show_only_user, user_id)
{
  var $results= $('#neuron_annotations_query_results' + this.widgetID);
  if (show_only_user) {
    $results.find('li[user_id!=' + user_id + ']').hide();
    $results.find('li[user_id=' + user_id + ']').show();
  } else {
    $results.find('li').show();
  }
};
