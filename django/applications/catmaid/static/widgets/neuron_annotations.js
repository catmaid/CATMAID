/** Namespace NeuronAnnotations */
var NeuronAnnotations = new function()
{
    var self = this; // reference to this namespace
    
    var nextFieldID = 1;    // unique ID for annotation fields added by the "+" button
    
    self.queryResults = [];
    
    self.query = function() {
        var posting = $.post(django_url + self.pid + '/neuron/query-by-annotations', $('#neuron_query_by_annotations').serialize());
        posting.done(function(data) {
            var $tableBody = $('#neuron_annotations_query_results').find('tbody');
            $tableBody.empty();
            self.queryResults = JSON.parse(data);
            for (var i = 0; i < self.queryResults.length; i++) {
                $tableBody.append('<tr><td><input type="checkbox" id="result_' + i + '"/></td>' + 
                                      '<td><a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\', ' + self.queryResults[i].skeleton_id + '); return false;">' + self.queryResults[i].name + '</a></td></tr>');
            }
        });
    };
    
    self.init = function (pid)
    {
        self.pid = pid;
    };
    
    self.add_query_field = function()
    {
        // Create a copy of the first row.
        var $newRow = $("#neuron_query_by_annotation").clone();
        $newRow.attr({id: 'neuron_query_by_annotation_' + nextFieldID, 
                    name: 'neuron_query_by_annotation_' + nextFieldID});
    
        $newRow.children()[0].innerHTML = 'and:'
    
        // Update the text field attributes.
        var $text = $newRow.find("input[type='text']");
        $text.attr({id: 'neuron_query_by_annotation_' + nextFieldID, 
                  name: 'neuron_query_by_annotation_' + nextFieldID,
                 value: ''});
    
        // Update the button attributes.
        var $button = $newRow.find("input[type='button']");
        $button.attr({onclick: 'NeuronAnnotations.remove_query_field(' + nextFieldID + ');', 
                        value: '-'});
        $("#neuron_query_by_annotator").before($newRow);
        
        nextFieldID += 1;
    };
    
    self.remove_query_field = function(rowNum)
    {
        $row = $("#neuron_query_by_annotation_" + rowNum);
        $row.remove();
    };
    
    self.toggle_neuron_selections = function() {
        var newValue = $("#neuron_annotations_toggle_neuron_selections_checkbox")[0].checked;
        $("#neuron_annotations_query_results_table").find('tbody tr td input[id*=result_]').each(function(i, element) { element.checked = newValue; });
    };
    
    self.get_selected_neurons = function()
    {
        var selected_neurons = [];
        for (var i = 0; i < self.queryResults.length; i++) {
            var $input = $("#neuron_annotations_query_results_table").find('input[id=result_' + i + ']');
            if ($input[0].checked) {
                selected_neurons.push(self.queryResults[i]);
            }
        }
        return selected_neurons;
    }
    
    self.add_to_selection = function() {
        // Add the selected neurons to the list in the staging area.
        // TODO: is this handling multiple skeletons per neuron correctly?
        
        var selected_neurons = self.get_selected_neurons();
        for (var i = 0; i < selected_neurons.length; i++)
            NeuronStagingArea.add_skeleton_to_stage(selected_neurons[i].skeleton_id, selected_neurons[i].name);
    }
    
    self.annotate_neurons = function() {
        // Add a new annotation to the selected neurons.
        // TODO: is this handling multiple skeletons per neuron correctly?
        
        // TODO: prompt for annotations
        var annotation = prompt('Annotation:');
        if (!annotation) return;
        annotation = annotation.trim();
        if (0 === annotation.length) return; // can't annotate with nothing
        annotations = [annotation]

        var selected_neurons = self.get_selected_neurons();
        var neuron_ids = [];
        selected_neurons.forEach(function(neuron) { neuron_ids.push(neuron.id); });
        
        jQuery.ajax({
            url: django_url + project.id + '/neuron/annotate',
            data: {
                annotations: annotations,
                 neuron_ids: neuron_ids
            },
            type: "POST",
            dataType: "json",
            success: function () {
                if (annotations.length == 1)
                    growlAlert('Information', 'Annotation ' + annotations[0] + ' added.');
                else
                    growlAlert('Information', 'Annotations ' + annotations.join(', ') + ' added.');
            }
        });
//         requestQueue.register(django_url + project.id + '/neuron/annotate', "POST",
//             {annotations: annotations, 
//               neuron_ids: neuron_ids},
//             function(status, text) {
//                 if (200 !== status) return;
//                 var json = $.parseJSON(text);
//                 if (json.error) {
//                     alert(json.error);
//                     return;
//                 }
//                 if (annotations.length == 1)
//                     growlAlert('Information', 'Annotation ' + annotations[0] + ' added.');
//                 else
//                     growlAlert('Information', 'Annotations ' + annotations.join(', ') + ' added.');
//             });
    };
}
