QUnit.test('Neuron name service test', function( assert ) {
  // Create a new name service
  var nns = CATMAID.NeuronNameService.getInstance();

  // Expect two items in the default fallback list
  assert.ok( 2 === nns.getComponentList().length, "Has correct number of default elements!" );
});
