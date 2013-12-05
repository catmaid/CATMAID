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
    $('[id^=neuron_annotation_result_row' + this.widgetID + '_]').css(
        'background-color', 'white');
    // Highlight the neuron, containing the requested skeleton, if available.
    // Altough the code works for multiple neurons, it should be normally the
    // case that there is only one neuron, belonging to the skeleton.
    neurons.forEach($.proxy(function(n) {
      $('#neuron_annotation_result_row' + this.widgetID + '_' + n.id).css(
          'background-color', SelectionTable.prototype.highlighting_color);
    }, this));
  }
};

/* Non-interface methods */

NeuronAnnotations.prototype.add_result_table_row = function(entity, add_row_fn)
{
  // Build table row
  var tr = document.createElement('tr');
  tr.setAttribute('id', 'neuron_annotation_result_row' +
          this.widgetID + '_' + entity.id);
  tr.setAttribute('type', entity.type);

  // Checkbox column
  var td_cb = document.createElement('td');
  var cb = document.createElement('input');
  cb.setAttribute('type', 'checkbox');
  cb.setAttribute('id', 'result' + this.widgetID + '_' +
          entity.id);
  td_cb.appendChild(cb);
  tr.appendChild(td_cb);

  // Name column
  var td_name = document.createElement('td');
  var a = document.createElement('a');
  a.setAttribute('href', '#');
  a.appendChild(document.createTextNode(entity.name));
  td_name.appendChild(a);
  tr.appendChild(td_name);

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
    // Expand
    $(a).click(function() {
      }).bind(this));
    });
  }
  // Add click handlers to remove tags from nodes
  var NA = this;
  $(".remove_annotation", $(ul)).click( function() {
      NA.remove_annotation($(this).attr('neuron_id'),
          $(this).attr('annotation_id'));
  });
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
              this.add_result_table_row(entity, appender);
            }).bind(this));

            // If there are results, display the result table
            if (this.queryResults.length > 0) {
              $('#neuron_annotations_query_no_results' + this.widgetID).hide();
              $('#neuron_annotations_query_results' + this.widgetID).show();
            } else {
              $('#neuron_annotations_query_results' + this.widgetID).hide();
              $('#neuron_annotations_query_no_results' + this.widgetID).show();
            }
          }
        }
      }, this));
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
      'tbody tr td input[id*=result' + this.widgetID + '_]').each(
          function(i, element) {
            element.checked = newValue;
          });
};

NeuronAnnotations.prototype.get_selected_neurons = function()
{
  return this.queryResults.reduce((function(o, e) {
      var $input = $("#neuron_annotations_query_results_table" +
          this.widgetID).find('tr[type=neuron]').find('input[id=result' + this.widgetID +
              '_' + e.id + ']');
      if ($input.length > 0 && $input[0].checked) {
          o.push(e);
      }
      return o;
    }).bind(this), []);
}

NeuronAnnotations.prototype.annotate_neurons = function()
{
  // Add a new annotation to the selected neurons.
  // TODO: is this handling multiple skeletons per neuron correctly?

  // TODO: prompt for annotations
  var annotation = prompt('Annotation:');
  if (!annotation) return;
  annotation = annotation.trim();
  if (0 === annotation.length) return; // can't annotate with nothing
  var annotations = [annotation];

  var selected_neurons = this.get_selected_neurons();
  var neuron_ids = [];
  selected_neurons.forEach(function(neuron) { neuron_ids.push(neuron.id); });

  var form_data = {
      annotations: annotations,
      neuron_ids: neuron_ids,
  };

  requestQueue.register(django_url + project.id + '/neuron/annotate',
      'POST', form_data, function(status, text, xml) {
        if (status === 200) {
          var e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
          } else {
            if (annotations.length == 1)
              growlAlert('Information', 'Annotation ' + annotations[0] + ' added.');
            else
              growlAlert('Information', 'Annotations ' + annotations.join(', ') + ' added.');
          }
        }
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
          var annotations = e.map(function(aobj) {
            return aobj.aname;
          });
          $(input).autocomplete({
            source: annotations
          });
        }
      });
};
