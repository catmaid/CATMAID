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

$(document).ready( function() {

        $('.delete-form').submit(function(e){
                return confirm('Really delete from this neuron?');
            });

    $('.show-neuron').change(function () {
        // AArgh, all horrible.  FIXME.
        var neuronId = parseInt($(this).attr('id').substring(1));
        var neuronLink = $(this).parent().parent().find('a');
        var neuronName = neuronLink.text();
        if ($(this).attr("checked")) {
            var newColor = colors[neuronId % numberOfColors];
            $(this).parent().css("background-color",newColor);
            $('#viewer').data('viewer').setNeuron(neuronName,newColor);
        } else {
            $(this).parent().css("background-color","#fff");
            $('#viewer').data('viewer').deleteNeuron(neuronName,newColor);
        }
    });

        setNeuronView( 'viewer', [ [ neuronName, 'black' ] ] );

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
