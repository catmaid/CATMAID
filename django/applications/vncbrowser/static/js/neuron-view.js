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
        var groups = $(this).attr('id').match('p([0-9]+)c([0-9]+)');
        var neuronId = parseInt(groups[2]);
        var projectId = parseInt(groups[1]);
        var neuronLink = $(this).parent().parent().find('a');
        var neuronName = neuronLink.text();
        var newColor = colors[neuronId % numberOfColors];
        var add = $(this).attr("checked");
        var cellBackgroundColor = add ? newColor : "#fff";
        $(this).parent().css("background-color", cellBackgroundColor);
        addOrRemoveNeuron("viewer",
                          add,
                          neuronName,
                          neuronId,
                          newColor );
    });

    setNeuronView( 'viewer', [ [neuronName, neuronID, 'black'] ] );

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
