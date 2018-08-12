QUnit.test('Tile layer test', function (assert) {
  var tileWidth = 10;
  var tileHeight = 12;

  // Set global project to custom mocking object
  window.project = {
    id: 1,
    getId: function() { return 1; }
  };

  /**
   * Helper to create a new test stack.
   */
  function create_stack(name, orientation) {
    var dim = {'x': 1000, 'y': 100, 'z': 100};
    var res = {'x': 0.1, 'y': 0.1, 'z': 2.0};
    var trs = {'x': 0, 'y': 0, 'z': 0};
    return new CATMAID.Stack(1, name, dim, res, trs,
        [],
        [{x: 1, y: 1, z: 1}, {x: 2, y: 2, z: 1}, {x: 4, y: 4, z: 1}, {x: 8, y: 8, z: 1},],
        4, undefined, "", null, orientation,
        {x: 0, y: 0, z: 0},
        {r: 0, g: 0, b: 0, a: 1},
        [{
          tile_width: tileWidth,
          tile_height: tileHeight,
          file_extension: 'png',
          tile_source_type: 1,
          image_base: 'fake',
          position: 0
        }]);
  }

  var stack = create_stack("Test Stack", CATMAID.Stack.ORIENTATION_XY);
  var stackViewer = new CATMAID.StackViewer(null, stack, false);
  var tilelayer = new CATMAID.TileLayer(stackViewer, "Test TileLayer", stack,
      0, true, 1.0, false);

  var expCols = 5, expRows = 3;
  stackViewer.viewWidth = tileWidth * expCols - 1; // 49
  stackViewer.viewHeight = tileHeight * expRows - 1; // 35
  var tileInd = tilelayer.tilesForLocation(0, 0, 1, 0);
  var expected = {
    firstRow: 0,
    firstCol: 0,
    lastRow:  expRows - 1,
    lastCol:  expCols - 1,
    top:      0,
    left:     0,
    z:         1,
    zoom:      0,
    mag:       1,
    anisotropy: {x: 1, y: 1},
  };
  assert.deepEqual(tileInd, expected, 'Generates correct tile indices for ' +
      'simple, tile-aligned view at 0 scale');

  tileInd = tilelayer.tilesForLocation(0, 0, 1, 2);
  expected = {
    firstRow: 0,
    firstCol: 0,
    lastRow:  expRows - 1,
    lastCol:  expCols - 1,
    top:      0,
    left:     0,
    z:         1,
    zoom:      2,
    mag:       1,
    anisotropy: {x: 1, y: 1},
  };
  assert.deepEqual(tileInd, expected, 'Generates correct tile indices for ' +
      'simple, tile-aligned view at 2 scale');

  tileInd = tilelayer.tilesForLocation(0, 60, 1, 1);
  expected = {
    firstRow: 5,
    firstCol: 0,
    lastRow:  4,
    lastCol:  expCols - 1,
    top:      0,
    left:     0,
    z:         1,
    zoom:      1,
    mag:       1,
    anisotropy: {x: 1, y: 1},
  };
  assert.deepEqual(tileInd, expected, 'Truncates tile indices for y stack ' +
      'boundaries');

  tileInd = tilelayer.tilesForLocation(480, 0, 1, 1);
  expected = {
    firstRow: 0,
    firstCol: 48,
    lastRow:  expRows - 1,
    lastCol:  49,
    top:      0,
    left:     0,
    z:         1,
    zoom:      1,
    mag:       1,
    anisotropy: {x: 1, y: 1},
  };
  assert.deepEqual(tileInd, expected, 'Truncates tile indices for x stack ' +
      'boundaries');

  tileInd = tilelayer.tilesForLocation(0, 0, 1, -1);
  expected = {
    firstRow: 0,
    firstCol: 0,
    lastRow:  Math.ceil(expRows/2 - 1),
    lastCol:  Math.ceil(expCols/2 - 1),
    top:      0,
    left:     0,
    z:         1,
    zoom:      0,
    mag:       2,
    anisotropy: {x: 1, y: 1},
  };
  assert.deepEqual(tileInd, expected, 'Truncates tile indices for view ' +
      'boundaries for fractional zoom');
});
