/** Namespace NeuronAnnotations */
var NeuronAnnotations = new function()
{
    var ns = this; // reference to the namespace
    ns.oTable = null;
    
    var nextFieldID = 1;

    /** Update the table to ... */
    this.query = function() {
        var posting = $.post(django_url + ns.pid + '/neuron/query-by-annotations', $('#neuron_query_by_annotations').serialize());
        posting.done(function(data) {
            var $tableBody = $('#neuron_annotations_query_results').find('tbody');
            $tableBody.empty();
            data = JSON.parse(data);
            for (var i = 0; i < data.length; i++) {
                $tableBody.append('<tr><td></td><td><a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\', ' + data[i].skeleton_id + '); return false;">' + data[i].name + '</a></td></tr>');
            }
        });
    };

    this.init = function (pid)
    {
        ns.pid = pid;
    };

    this.addQueryField = function()
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
        $button.attr({onclick: 'NeuronAnnotations.removeQueryField(' + nextFieldID + ');', 
                        value: '-'});
        $("#neuron_query_by_annotator").before($newRow);
        
        nextFieldID += 1;
    };

    this.removeQueryField = function(rowNum)
    {
        $row = $("#neuron_query_by_annotation_" + rowNum);
        $row.remove();
    };
}
