QUnit.test('Neuron name service test', function( assert ) {
  // Create a new name service
  var nns = new NeuronNameService();

  // Expect two items in the default fallback list
  assert.ok( 2 === nns.getFallbackList().length, "Has correct number of default elements!" );
});
