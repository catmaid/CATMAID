QUnit.test('Multi-view stack test', function( assert ) {
  /**
   * Helper to create a new test stack.
   */
  function create_stack(name, orientation) {
    var dim = {'x': 100, 'y': 100, 'z': 100};
    var res = {'x': 0.1, 'y': 0.5, 'z': 2.0};
    var trs = {'x': 1, 'y': 2, 'z': 3};
    return new CATMAID.Stack(1, name, dim, res, trs,
        [], 3, 4, undefined, "", null, orientation,
        {x: 0, y: 0, z: 0},
        {r: 0, g: 0, b: 0, a: 1},
        [{
          tile_width: 10,
          tile_height: 12,
          file_extension: 'png',
          tile_source_type: 1,
          image_base: 'fake'
        }]);
  }

  // Create test stacks for each orientation
  var xy_stack = create_stack("XY Stack", CATMAID.Stack.ORIENTATION_XY);
  var xz_stack = create_stack("XZ Stack", CATMAID.Stack.ORIENTATION_XZ);
  var zy_stack = create_stack("ZY Stack", CATMAID.Stack.ORIENTATION_ZY);

  // Test stack to project transformation for X coordinate
  assert.strictEqual(xy_stack.stackToProjectX(0, 0, 0), 1,
      'transforms XY stack origin (X) correctly to project space');
  assert.strictEqual(xz_stack.stackToProjectX(0, 0, 0), 1,
      'transforms XZ stack origin (X) correctly to project space');
  assert.strictEqual(zy_stack.stackToProjectX(0, 0, 0), 1,
      'transforms ZY stack origin (X) correctly to project space');

  assert.strictEqual(xy_stack.stackToProjectX(6, 5, 4), 1.4,
      'transforms XY stack X coordinate correctly to project space');
  assert.strictEqual(xz_stack.stackToProjectX(6, 5, 4), 1.4,
      'transforms XZ stack X coordinate correctly to project space');
  assert.strictEqual(zy_stack.stackToProjectX(6, 5, 4), 13,
      'transforms ZY stack X coordinate correctly to project space');

  // Test stack to project transformation for Y coordinate
  assert.strictEqual(xy_stack.stackToProjectY(0, 0, 0), 2,
      'transforms XY stack origin (Y) correctly to project space');
  assert.strictEqual(xz_stack.stackToProjectY(0, 0, 0), 2,
      'transforms XZ stack origin (Y) correctly to project space');
  assert.strictEqual(zy_stack.stackToProjectY(0, 0, 0), 2,
      'transforms ZY stack origin (Y) correctly to project space');

  assert.strictEqual(xy_stack.stackToProjectY(6, 5, 4), 4.5,
      'transforms XY stack Y coordinate correctly to project space');
  assert.strictEqual(xz_stack.stackToProjectY(6, 5, 4), 14,
      'transforms XZ stack Y coordinate correctly to project space');
  assert.strictEqual(zy_stack.stackToProjectY(6, 5, 4), 4.5,
      'transforms ZY stack Y coordinate correctly to project space');

  // Test stack to project transformation for Z coordinate
  assert.strictEqual(xy_stack.stackToProjectZ(0, 0, 0), 3,
      'transforms XY stack origin (Z) correctly to project space');
  assert.strictEqual(xz_stack.stackToProjectZ(0, 0, 0), 3,
      'transforms XZ stack origin (Z) correctly to project space');
  assert.strictEqual(zy_stack.stackToProjectZ(0, 0, 0), 3,
      'transforms ZY stack origin (Z) correctly to project space');

  assert.strictEqual(xy_stack.stackToProjectZ(6, 5, 4), 15,
      'transforms XY stack Z coordinate correctly to project space');
  assert.strictEqual(xz_stack.stackToProjectZ(6, 5, 4), 5.5,
      'transforms XZ stack Z coordinate correctly to project space');
  assert.strictEqual(zy_stack.stackToProjectZ(6, 5, 4), 3.4,
      'transforms ZY stack Z coordinate correctly to project space');

  // Test project to stack transformation for X coordinate
  assert.strictEqual(xy_stack.projectToStackX(0, 0, 0), 0,
      'transforms project origin (X) correctly to XY stack space');
  assert.strictEqual(xz_stack.projectToStackX(0, 0, 0), 0,
      'transforms project origin (X) correctly to XZ stack space');
  assert.strictEqual(zy_stack.projectToStackX(0, 0, 0), 0,
      'transforms project origin (X) correctly to ZY stack space');

  assert.strictEqual(xy_stack.projectToStackX(6, 5, 4), 30,
      'transforms project origin (X) correctly to XY stack space');
  assert.strictEqual(xz_stack.projectToStackX(6, 5, 4), 30,
      'transforms project origin (X) correctly to XZ stack space');
  assert.strictEqual(zy_stack.projectToStackX(6, 4, 3), 30,
      'transforms project origin (X) correctly to ZY stack space');

  // Test project to stack transformation for Y coordinate
  assert.strictEqual(xy_stack.projectToStackY(0, 0, 0), 0,
      'transforms project origin (Y) correctly to XY stack space');
  assert.strictEqual(xz_stack.projectToStackY(0, 0, 0), 0,
      'transforms project origin (Y) correctly to XZ stack space');
  assert.strictEqual(zy_stack.projectToStackY(0, 0, 0), 0,
      'transforms project origin (Y) correctly to ZY stack space');

  assert.strictEqual(xy_stack.projectToStackY(6, 5, 4), 6,
      'transforms project origin (Y) correctly to XY stack space');
  assert.strictEqual(xz_stack.projectToStackY(6, 5, 4), 6,
      'transforms project origin (Y) correctly to XZ stack space');
  assert.strictEqual(zy_stack.projectToStackY(6, 5, 4), 6,
      'transforms project origin (Y) correctly to ZY stack space');

  // Test project to stack transformation for Z coordinate
  assert.strictEqual(xy_stack.projectToStackZ(0, 0, 0), 0,
      'transforms project origin (Z) correctly to XY stack space');
  assert.strictEqual(xz_stack.projectToStackZ(0, 0, 0), 0,
      'transforms project origin (Z) correctly to XZ stack space');
  assert.strictEqual(zy_stack.projectToStackZ(0, 0, 0), 0,
      'transforms project origin (Z) correctly to ZY stack space');

  assert.strictEqual(xy_stack.projectToStackZ(6, 5, 4), 1,
      'transforms project origin (Z) correctly to XY stack space');
  assert.strictEqual(xz_stack.projectToStackZ(6, 5, 4), 1,
      'transforms project origin (Z) correctly to XZ stack space');
  assert.strictEqual(zy_stack.projectToStackZ(6, 5, 4), 1,
      'transforms project origin (Z) correctly to ZY stack space');
});
