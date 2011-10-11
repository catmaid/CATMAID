// This function from: http://stackoverflow.com/questions/962802/is-it-correct-to-use-javascript-array-sort-method-for-shuffling
function shuffle(array) {
    var tmp, current, top = array.length;

    if(top) while(--top) {
        current = Math.floor(Math.random() * (top + 1));
        tmp = array[current];
        array[current] = array[top];
        array[top] = tmp;
    }

    return array;
}

var numberOfColors = 100;
var colors = [];
for( var i = 0; i < numberOfColors; ++i ) {
    var h = i / (numberOfColors + 1);
    colors.push( Raphael.hsb2rgb({ h:h, s:1, b:1 }).hex)
}
shuffle(colors);

function addOrRemoveNeuron( add, neuronName, neuronId, color ) {
    var self = this;
    $.get('/'+projectId+'/neuron-to-skeletons/'+neuronId,
          function (data) {
              var i, skeletonID, swcURL, skeletonName;
              for (var i in data) {
                  skeletonID = data[i];
                  skeletonName = neuronName+'(skeleton: '+skeletonID+')';
                  swcURL = '/'+projectId+'/skeleton/'+skeletonID+'/swc';
                  if (add) {
                      $(self).parent().css("background-color",color);
                      $('#viewer').data('viewer').setNeuron(skeletonName,swcURL,color);
                  } else {
                      $(self).parent().css("background-color","#fff");
                      $('#viewer').data('viewer').deleteNeuron(skeletonName,color);
                  }
              }
          },
          "json");
}

$(document).ready( function() {

    $('.delete-form').submit(function(e){
        return confirm('Really delete from this neuron?');
    });

    $('.show-neuron').change(function () {
        // AArgh, all horrible.  FIXME.
        var groups = $(this).attr('id').match('p([0-9]+)c([0-9]+)');
        var neuronId = parseInt(groups[2]);
        var projectId = parseInt(groups[1]);
        var neuronLink = $(this).parent().parent().find('a');
        var neuronName = neuronLink.text();
        var newColor = colors[neuronId % numberOfColors];
        addOrRemoveNeuron($(this).attr("checked"),
                          neuronName,
                          neuronId,
                          newColor );
    });

    setNeuronView( 'viewer', [] );

    addOrRemoveNeuron(true,
                      neuronName,
                      neuronID,
                      'black');

    $('#xy-button').click( function () {
        $('#viewer').data('viewer').changeView( 0, 0, 0 );
    } );

    $('#xz-button').click( function () {
        $('#viewer').data('viewer').changeView( -Math.PI / 2, 0, 0 );
    } );

    $('#zy-button').click( function () {
        $('#viewer').data('viewer').changeView( 0, -Math.PI / 2, 0 );
    } );

});
