QUnit.test('Tile layer test', function (assert) {
  /**
   * Helper to create a new test stack.
   */
  function create_stack(name, orientation) {
    var dim = {'x': 1000, 'y': 100, 'z': 100};
    var res = {'x': 0.1, 'y': 0.5, 'z': 2.0};
    var trs = {'x': 0, 'y': 0, 'z': 0};
    return new Stack(1, 1, name, dim, res, trs,
        [], false, 3, 4, 1, "", "", false, orientation);
  }

  var stack = create_stack("Test Stack", Stack.ORIENTATION_XY);
  var tileSource = getTileSource(1, 'fake', 'png');
  var tileWidth = 10;
  var tileHeight = 12;
  var tilelayer = new CATMAID.TileLayer("Test TileLayer", stack,
      tileWidth, tileHeight, tileSource,
      true, 1.0, false);

  var expCols = 5, expRows = 3;
  stack.viewWidth = tileWidth * expCols - 1; // 49
  stack.viewHeight = tileHeight * expRows - 1; // 35
  var tileInd = tilelayer.tilesForLocation(0, 0, 1, 0);
  var expected = {
    first_row: 0,
    first_col: 0,
    last_row:  expRows - 1,
    last_col:  expCols - 1,
    z:         1,
    zoom:      0,
    mag:       1
  };
  assert.deepEqual(tileInd, expected, 'Generates correct tile indices for ' +
      'simple, tile-aligned view at 0 scale');

  tileInd = tilelayer.tilesForLocation(0, 0, 1, 2);
  expected = {
    first_row: 0,
    first_col: 0,
    last_row:  expRows - 1,
    last_col:  expCols - 1,
    z:         1,
    zoom:      2,
    mag:       1
  };
  assert.deepEqual(tileInd, expected, 'Generates correct tile indices for ' +
      'simple, tile-aligned view at 2 scale');

  tileInd = tilelayer.tilesForLocation(0, 60, 1, 1);
  expected = {
    first_row: 5,
    first_col: 0,
    last_row:  4,
    last_col:  expCols - 1,
    z:         1,
    zoom:      1,
    mag:       1
  };
  assert.deepEqual(tileInd, expected, 'Truncates tile indices for y stack ' +
      'boundaries');

  tileInd = tilelayer.tilesForLocation(480, 0, 1, 1);
  expected = {
    first_row: 0,
    first_col: 48,
    last_row:  expRows - 1,
    last_col:  49,
    z:         1,
    zoom:      1,
    mag:       1
  };
  assert.deepEqual(tileInd, expected, 'Truncates tile indices for x stack ' +
      'boundaries');

  tileInd = tilelayer.tilesForLocation(0, 0, 1, -1);
  expected = {
    first_row: 0,
    first_col: 0,
    last_row:  Math.ceil(expRows/2 - 1),
    last_col:  Math.ceil(expCols/2 - 1),
    z:         1,
    zoom:      0,
    mag:       2
  };
  assert.deepEqual(tileInd, expected, 'Truncates tile indices for view ' +
      'boundaries for fractional zoom');
});
