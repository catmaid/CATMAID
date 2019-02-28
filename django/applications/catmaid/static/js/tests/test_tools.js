/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Utilities test', function( assert ) {

  // Test CATMAID.tools.compareStrings
  var stringList = ['Test', 'Value', '4', 'test-90', 'test-87', '5010'];
  stringList.sort(CATMAID.tools.compareStrings);
  assert.deepEqual(stringList,
      ['4', '5010', 'Test', 'test-87', 'test-90', 'Value'],
      "CATMAID.tools.compareStrings sorts a list as expected");


  // Test CATMAID.tools.getIndex
  assert.strictEqual(CATMAID.tools.parseIndex("123"), 123,
      "CATMAID.tools.parseIndex parses \"123\" to 123");
  assert.strictEqual(CATMAID.tools.parseIndex("-123"), 123,
      "CATMAID.tools.parseIndex parses \"-123\" as 123");
  assert.strictEqual(CATMAID.tools.parseIndex(null), false,
      "CATMAID.tools.parseIndex can't parse \"null\"");
  assert.strictEqual(CATMAID.tools.parseIndex("abc"), false,
      "CATMAID.tools.parseIndex can't parse \"abc\"");


  // Test CATMAID.tools.parseQuery
  var url = "?pid=2&zp=5115&yp=3835&xp=0&tool=tracingtool&sid0=5&s0=1";
  var o = {
    pid: "2",
    xp: "0",
    zp: "5115",
    yp: "3835",
    tool: "tracingtool",
    sid0: "5",
    s0: "1"
  };
  var urlObject = CATMAID.tools.parseQuery(url);
  assert.deepEqual(urlObject, o,
      "CATMAID.tools.parseQuery() correctly extracts parameters from URL");


  // Test CATMAID.tools.uniqueId
  var uniqueId1 = CATMAID.tools.uniqueId();
  var uniqueId2 = CATMAID.tools.uniqueId();
  assert.ok(uniqueId1 != uniqueId2,
      "CATMAID.tools.uniqueId retuens different IDs with two calls");


  // Test CATMAID.tools.deepCopy
  var o1 = {
    o2: {
      f3: null,
    },
    f1: 1,
    f2: "test",
  };
  assert.deepEqual(CATMAID.tools.deepCopy(o1), o1,
      "CATMAID.tools.deepEqual can copy nested objects");


  // Test CATMAID.tools.setXYZ
  var o_setXYZ = {x: 2, y: 2, z: 2};
  assert.deepEqual(CATMAID.tools.setXYZ({x: 1, y: 1, z: 1}, 2), o_setXYZ,
      "CATMAID.tools.setXYZ sets all fields as expexted");
  assert.deepEqual(CATMAID.tools.setXYZ({}, 2), o_setXYZ,
      "CATMAID.tools.setXYZ sets all fields of an empty object as expexted");


  // Test CATMAID.tools.isFn
  (function() {
    assert.ok(!CATMAID.tools.isFn(null),
        "CATMAID.tools.isFn says 'null' is no function.");
    assert.ok(!CATMAID.tools.isFn(undefined),
        "CATMAID.tools.isFn says 'undefined' is no function.");
    assert.ok(!CATMAID.tools.isFn({}),
        "CATMAID.tools.isFn says an empty object is no function.");
    assert.ok(CATMAID.tools.isFn(function() {}),
        "CATMAID.tools.isFn says a function is a function.");
  })();


  // Test CATMAID.tools.callIfFn
  (function() {
    var called = false;
    CATMAID.tools.callIfFn(function() { called = true; });
    assert.ok(called, "CATMAID.tools.callIfFn properly calls a function.");
    var o = { called: false };
    CATMAID.tools.callIfFn(function(obj) { obj.called = true; }, o);
    assert.ok(o.called, "CATMAID.tools.callIfFn properly passes arguments to called function.");
  })();


  // Test Z plane intersection function
  (function() {
    var i1 = CATMAID.tools.intersectLineWithPlane(-3, 0, -1, 1, 2, 3,
        new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), new THREE.Vector3());
    assert.deepEqual(i1, new THREE.Vector3(-2, 0.5, 0),
        "CATMAID.tools.intersectLineWithPlane finds intersection with " +
        "proper values");

    var i2 = CATMAID.tools.intersectLineWithPlane(0, 0, 0, 0, 0, 0,
        new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), new THREE.Vector3());
    assert.deepEqual(i2, new THREE.Vector3(0, 0, 0),
        "CATMAID.tools.intersectLineWithPlane returns the line segment " +
        "origin if all values are the same");

    var i3 = CATMAID.tools.intersectLineWithPlane(-1, 1, 1, 1, 2, 3,
        new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), new THREE.Vector3());
    assert.deepEqual(i3, undefined,
        "CATMAID.tools.intersectLineWithPlane returns undefined if the " +
        "line segment does not intersect the plane");
  })();


  // Test same sign test
  (function() {
    assert.ok(CATMAID.tools.sameSign(1,0),
        "CATMAID.tools.sameSign correctly says 1 and 0 have same sign");
    assert.ok(CATMAID.tools.sameSign(-100,-42),
        "CATMAID.tools.sameSign correctly says -100 and -42 have same sign");
    assert.ok(!CATMAID.tools.sameSign(0,-1),
        "CATMAID.tools.sameSign correctly says 0 and -1 don't have same sign");
    assert.ok(!CATMAID.tools.sameSign(100,-42),
        "CATMAID.tools.sameSign correctly says 100 and -42 don't have same sign");
  })();

  // Test getDefined
  (function() {
    assert.strictEqual(CATMAID.tools.getDefined(0, 1), 0, "CATMAID.tools.getDefined returns defined integer value");
    assert.strictEqual(CATMAID.tools.getDefined("a", 1), "a", "CATMAID.tools.getDefined returns defined string value");
    assert.strictEqual(CATMAID.tools.getDefined(undefined, 0), 0, "CATMAID.tools.getDefined returns fallback string value");
    var obj = {};
    assert.strictEqual(CATMAID.tools.getDefined(undefined, obj), obj, "CATMAID.tools.getDefined returns fallback object value");
  })();

  // Test humanReadableTimeInterval
  (function() {
    assert.strictEqual(CATMAID.tools.humanReadableTimeInterval(10, new Set(['sec'])), '< 1sec',
        'CATMAID.tools.humanReadableTimeInterval returns expected result');
    assert.strictEqual(CATMAID.tools.humanReadableTimeInterval(119000, new Set(['sec', 'min'])), '1min 59sec',
        'CATMAID.tools.humanReadableTimeInterval returns expected result');
    assert.strictEqual(CATMAID.tools.humanReadableTimeInterval(3396724, new Set(['sec', 'min', 'hours', 'days'])), '56min 36sec',
        'CATMAID.tools.humanReadableTimeInterval returns expected result');
    assert.strictEqual(CATMAID.tools.humanReadableTimeInterval(4496724, new Set(['sec', 'min', 'hours', 'days'])), '1h 14min 56sec',
        'CATMAID.tools.humanReadableTimeInterval returns expected result');
  })();

  // Test arraysEqual
  (function() {
    assert.ok(CATMAID.tools.arraysEqual([], []),
        "CATMAID.tools.arraysEqual correctly finds arrays are equal");
    assert.ok(CATMAID.tools.arraysEqual([1,2], [1,2]),
        "CATMAID.tools.arraysEqual correctly finds arrays are equal");
    assert.notOk(CATMAID.tools.arraysEqual(null, [1,2]),
        "CATMAID.tools.arraysEqual correctly finds arrays are not equal");
    assert.notOk(CATMAID.tools.arraysEqual([1,2], null),
        "CATMAID.tools.arraysEqual correctly finds arrays are not equal");
    assert.notOk(CATMAID.tools.arraysEqual([1,2], [2,1]),
        "CATMAID.tools.arraysEqual correctly finds arrays are not equal");
    assert.notOk(CATMAID.tools.arraysEqual([1,2], [1,2,3]),
        "CATMAID.tools.arraysEqual correctly finds arrays are not equal");
  })();

  // Test isoStringToDate
  (function() {
    // Note, the Date constructor's month argument is 0-based.
    assert.deepEqual(CATMAID.tools.isoStringToDate('2017-11-06T03:58:32.835595Z'),
        new Date(Date.UTC(2017, 10, 6, 3, 58, 32, 835595 / 1000)), 'Test date is parsed correctly');
    assert.deepEqual(CATMAID.tools.isoStringToDate('2017-11-06T03:58:32Z'),
        new Date(Date.UTC(2017, 10, 6, 3, 58, 32)), 'Test date is parsed correctly');
    assert.deepEqual(CATMAID.tools.isoStringToDate('2017-11-06T03:58:32.835595+00:00'),
        new Date(Date.UTC(2017, 10, 6, 3, 58, 32, 835595 / 1000)), 'Test date is parsed correctly');
    assert.deepEqual(CATMAID.tools.isoStringToDate('2017-11-06T03:58:32-00:00'),
        new Date(Date.UTC(2017, 10, 6, 3, 58, 32)), 'Test date is parsed correctly');
  })();

  // Test Color construction util
  (function() {
    assert.deepEqual(CATMAID.tools.getColor(0), new THREE.Color(0, 0, 0),
        "Colors can be created from numbers");
    assert.deepEqual(CATMAID.tools.getColor(16711680), new THREE.Color(1, 0, 0),
        "Colors can be created from numbers");
    assert.deepEqual(CATMAID.tools.getColor({r: 0, g: 1, b: 0.2}), new THREE.Color(0, 1, 0.2),
        "Colors can be created from objects");
    assert.deepEqual(CATMAID.tools.getColor("rgb(255,0,0)"), new THREE.Color(1,0,0),
        "Colors can be created from strings");
    assert.deepEqual(CATMAID.tools.getColor(0xff0000), new THREE.Color(1,0,0),
        "Colors can be created from hex values");
  })();

  // Test extractFileName
  (function() {
    assert.strictEqual(CATMAID.tools.extractFileNameNoExt('/a/b/c.d'), 'c',
        'CATMAID.tools.extractFileName() works');
    assert.strictEqual(CATMAID.tools.extractFileNameNoExt('/abc.txt'), 'abc',
        'CATMAID.tools.extractFileName() works');
    assert.strictEqual(CATMAID.tools.extractFileNameNoExt('abc.txt'), 'abc',
        'CATMAID.tools.extractFileName() works');
    assert.strictEqual(CATMAID.tools.extractFileNameNoExt('/a/b/c.d.e'), 'c.d',
        'CATMAID.tools.extractFileName() works');
    assert.strictEqual(CATMAID.tools.extractFileNameNoExt('/abc.d.txt'), 'abc.d',
        'CATMAID.tools.extractFileName() works');
    assert.strictEqual(CATMAID.tools.extractFileNameNoExt('abc.d.txt'), 'abc.d',
        'CATMAID.tools.extractFileName() works');
  })();

  // Test mod
  (function() {
    assert.strictEqual(CATMAID.tools.mod(3, 5), 3, 'CATMAID.tools.mod() works');
    assert.strictEqual(CATMAID.tools.mod(8, 5), 3, 'CATMAID.tools.mod() works');
    assert.strictEqual(CATMAID.tools.mod(-2, 5), 3, 'CATMAID.tools.mod() works');
    assert.strictEqual(CATMAID.tools.mod(-8, 5), 2, 'CATMAID.tools.mod() works');
  })();

  // Test urlJoin
  (function() {
    assert.strictEqual(CATMAID.tools.urlJoin(null, null), undefined, 'CATMAID.tools.urlJoin() works');
    assert.strictEqual(CATMAID.tools.urlJoin('a', null), 'a', 'CATMAID.tools.urlJoin() works');
    assert.strictEqual(CATMAID.tools.urlJoin(null, 'b'), 'b', 'CATMAID.tools.urlJoin() works');
    assert.strictEqual(CATMAID.tools.urlJoin('a', 'b'), 'a/b', 'CATMAID.tools.urlJoin() works');
    assert.strictEqual(CATMAID.tools.urlJoin('a/', 'b'), 'a/b', 'CATMAID.tools.urlJoin() works');
    assert.strictEqual(CATMAID.tools.urlJoin('a', '/b'), 'a/b', 'CATMAID.tools.urlJoin() works');
    assert.strictEqual(CATMAID.tools.urlJoin('a/', '/b'), 'a/b', 'CATMAID.tools.urlJoin() works');
  })();
});
