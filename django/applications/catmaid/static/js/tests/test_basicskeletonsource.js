/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Basic skeleton source test', function( assert ) {
  var name = 'Test source';
  var skeletonIDs = [1,2,3];
  var testModels = skeletonIDs.reduce(function(o, skid) {
    o[skid] = new SelectionTable.prototype.SkeletonModel(skid, "",
        new THREE.Color());
    return o;
  }, {});

  test(testModels);
  test(testModels, 'Test group');

  /**
   * Test same functionality for grouped and ungrouped neurons.
   */ 
  function test(models, groupName) {
    function m(txt) { return txt + (groupName ? ' (with groups)' : ''); }

    // Create source and append models
    var src = new CATMAID.BasicSkeletonSource(name);

    // Test getName()
    assert.strictEqual(src.getName(), name,
        m('CATMAID.BasicSkeletonSource returns the correct name'));

    if (groupName) {
      src.appendAsGroup(models, groupName);
      // Test group test
      assert.ok(src.isGroup(groupName), m('CATMAID.BasicSkeletonSource identifies ' +
          'the test group name correctly as a valid group.'));
    } else {
      src.append(models);
    }

    // Test getNumberOfSkeletons()
    assert.strictEqual(Object.keys(models).length, src.getNumberOfSkeletons(),
        'CATMAID.BasicSkeletonSource returns the correct number of skeletons');

    // Test hasSkeleton()
    var hasAllSkeletons = skeletonIDs.reduce(function(b, s) {
      var hasSkeleton = src.hasSkeleton(s);
      if (null === b) return hasSkeleton;
      else return b && hasSkeleton;
    }, null);
    assert.ok(hasAllSkeletons,
        m('CATMAID.BasicSkeletonSource correctly responds to hasSkeleton()'));

    // Test getSelectedSkeletons()
    var selectedSkeletonIDs = src.getSelectedSkeletons();
    assert.deepEqual(selectedSkeletonIDs, skeletonIDs,
        m('CATMAID.BasicSkeletonSource correctly returns all skeletons from ' +
        'getSelectedSkeletons()'));

    // Test getSelectedSkeletonModels()
    var selectedSkeletonModels = src.getSelectedSkeletonModels();
    assert.deepEqual(selectedSkeletonModels, models,
        m('CATMAID.BasicSkeletonSource correctly returns all skeletons models ' +
        'from getSelectedSkeletonModels()'));

    // Test updateModels()
    var updatedModels = skeletonIDs.reduce(function(o, skid) {
      o[skid] = new SelectionTable.prototype.SkeletonModel(skid, "updated " + skid,
          new THREE.Color());
      return o;
    }, {});
    src.updateModels(updatedModels, {});
    var selectedSkeletonModels2 = src.getSelectedSkeletonModels();
    assert.deepEqual(selectedSkeletonModels2, updatedModels,
        m('CATMAID.BasicSkeletonSource correctly updates its models on ' +
        'updateModels()'));

    // Test removeSkeletons()
    src.removeSkeletons([1,2]);
    assert.deepEqual(src.getSelectedSkeletons(), [3],
        m('CATMAID.BasicSkeletonSource correctly returns all skeletons from ' +
        'getSelectedSkeletons() after removeSkeletons() was called.'));
    var testModel = {'3': updatedModels[3]};
    assert.deepEqual(src.getSelectedSkeletonModels(), testModel,
        m('CATMAID.BasicSkeletonSource correctly returns all models from ' +
        'getSelectedSkeletonModels() after removeSkeletons() was called.'));

    // Test clear()
    src.clear();
    assert.deepEqual(src.getSelectedSkeletons(), [],
        m('CATMAID.BasicSkeletonSource correctly returns no skeletons from ' +
        'getSelectedSkeletons() after clear() was called.'));
    assert.deepEqual(src.getSelectedSkeletonModels(), {},
        m('CATMAID.BasicSkeletonSource correctly returns no models from ' +
        'getSelectedSkeletonModels() after clear() was called.'));

    // If grouped, test additional things
    if (groupName) {

    }
  }
});
