/** Namespace NeuronAnnotations */
var NeuronAnnotations = new function()
{
    var self = this; // reference to this namespace
    
    var nextFieldID = 1;    // unique ID for annotation fields added by the "+" button
    
    self.query = function() {
        var posting = $.post(django_url + self.pid + '/neuron/query-by-annotations', $('#neuron_query_by_annotations').serialize());
        posting.done(function(data) {
            var $tableBody = $('#neuron_annotations_query_results').find('tbody');
            $tableBody.empty();
            data = JSON.parse(data);
            for (var i = 0; i < data.length; i++) {
                $tableBody.append('<tr><td><input type="checkbox"/></td>' + 
                                      '<td><a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\', ' + data[i].skeleton_id + '); return false;">' + data[i].name + '</a></td></tr>');
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
    
    self.get_selected_neurons = function()
    {
        // TODO: this function is not working yet
        
        var keys = [];
            for( var skeleton_id in skeletonmodels ) {    
                if( skeletonmodels.hasOwnProperty(skeleton_id) &&
                    skeletonmodels[ skeleton_id ].selected ) {
                        keys.push( skeleton_id )
                }
            }
            return keys;
    }
    
    self.add_to_selection = function() {
        // TODO: this function is not working yet
        
        var neuron_ids = self.get_selected_neurons();
        if (0 === neuron_ids.length) return;
        
    }
    
    self.annotate = function() {
        // TODO: this function is not working yet
        
        var neuron_ids = self.get_selected_neurons();
        if (0 === neuron_ids.length) return;
        
        requestQueue.register(django_url + project.id + '/neurons/annotate', "POST",
            {neuron_ids: neuron_ids},
            function(status, text) {
                if (200 !== status) return;
                var json = $.parseJSON(text);
                if (json.error) {
                    alert(json.error);
                    return;
                }
                SkeletonMeasurementsTable.populate(json.map(function(row) {
                    row.unshift(skeletonmodels[row[0]].baseName);
                    return row;
                }));
            });
    };
}
