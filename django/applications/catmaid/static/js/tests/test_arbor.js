QUnit.test('Arbor.js test', function( assert ) {
  // Create a new arbor that resembles the example from
  // http://en.wikipedia.org/wiki/Strahler_number
  var arbor = new Arbor();
  var node = function(v) { return v; };
  var nodes = [
      node(1), node(0),
      node(2), node(1),
      node(3), node(1),
      node(4), node(3),
      node(5), node(3),
      node(6), node(4),
      node(7), node(4),
      node(8), node(7),
      node(9), node(8),
      node(10), node(8),
      node(11), node(9),
      node(12), node(9),
      node(13), node(10),
      node(14), node(10),
      node(15), node(5),
      node(16), node(5),
      node(17), node(15),
      node(18), node(15),
      node(19), node(16),
      node(20), node(16),
  ];

  arbor.addEdges(nodes);

  // Test Strahler analysis
  var strahler = arbor.strahlerAnalysis();

  var expected_result = {
      0: 4,
      1: 4,
      2: 1,
      3: 4,
      4: 3,
      5: 3,
      6: 1,
      7: 3,
      8: 3,
      9: 2,
      10: 2,
      11: 1,
      12: 1,
      13: 1,
      14: 1,
      15: 2,
      16: 2,
      17: 1,
      18: 1,
      19: 1,
      20: 1,
  }

  assert.propEqual(strahler, expected_result, "The returned Strahler indexes are correct.");
});
