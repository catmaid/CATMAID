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
    return "Neuron Annotations " + this.widgetID;
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
  return this.queryResults.map( function(e) { return e.skeleton_id; } );
};

NeuronAnnotations.prototype.hasSkeleton = function(skeleton_id) {
  return this.queryResults.some(
      function(e) { return e.skeleton_id === skeleton_id; } );
};

NeuronAnnotations.prototype.getSelectedSkeletonModels = function() {
  return this.queryResults.reduce(function(o, e) {
      o[e.skeleton_id] = new SelectionTable.prototype.SkeletonModel(
          e.skeleton_id, e.name, new THREE.Color().setRGB(1, 1, 0));
      return o;
  }, {});
};

NeuronAnnotations.prototype.highlight = function(skeleton_id)
{
  // Remove any highlighting
  $('[id^=neuron_annotation_result_row' + this.widgetID + '_]').css(
      'background-color', 'white');
  // Highlight the requesten skelton, if available
  $('#neuron_annotation_result_row' + this.widgetID + '_' + skeleton_id).css(
      'background-color', SelectionTable.prototype.highlighting_color);
};

/* Non-interface methods */

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
            for (var i = 0; i < this.queryResults.length; i++) {
              // Build list of annotations
              var annotation_names = this.queryResults[i].annotations.reduce(
                function(o, e) {
                  o.push(e.name);
                  return o;
                }, []);

              // Build table row
              $tableBody.append(
                  '<tr id="neuron_annotation_result_row' + this.widgetID +
                      '_' + this.queryResults[i].skeleton_id + '">' +
                    '<td><input type="checkbox" id="result' + this.widgetID + '_' +
                        this.queryResults[i].skeleton_id + '"/></td>' +
                    '<td><a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(' +
                        '\'skeleton\', ' +
                        this.queryResults[i].skeleton_id + '); return false;">' +
                        this.queryResults[i].name + '</a></td>' +
                    '<td>' + annotation_names.join(', ') + '</td>' +
                  '</tr>');
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
  var selected_neurons = [];
  for (var i = 0; i < this.queryResults.length; i++) {
      var $input = $("#neuron_annotations_query_results_table" +
          this.widgetID).find('input[id=result' + this.widgetID +
              '_' + this.queryResults[i].skeleton_id + ']');
      if ($input[0].checked) {
          selected_neurons.push(this.queryResults[i]);
      }
  }
  return selected_neurons;
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

  requestQueue.register(django_url + this.pid + '/neuron/annotate',
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
