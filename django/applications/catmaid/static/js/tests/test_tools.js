/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Utilities test', function( assert ) {

  // Test CATMAID.tools.compareStrings
  var stringList = ['Test', 'Value', '4', 'test-90', 'test-87', '5010'];
  stringList.sort(CATMAID.tools.compareStrings);
  // Unfortunately, localeCompare() is implemented differently in PhantomJS <
  // 2.0 from  how all major browsers do it.
  if (CATMAID.tests.runByPhantomJS()) {
    assert.deepEqual(stringList,
        ['4', '5010', 'Test', 'Value', 'test-87', 'test-90'],
        "CATMAID.tools.compareStrings sorts a list as expected");
  } else {
    assert.deepEqual(stringList,
        ['4', '5010', 'Test', 'test-87', 'test-90', 'Value'],
        "CATMAID.tools.compareStrings sorts a list as expected");
  }


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
    var i1 = CATMAID.tools.intersectLineWithZPlane(-1, 1, 1, 1, 2, 3, 0);
    assert.deepEqual(i1, [-2, 0.5],
        "CATMAID.tools.intersectLineWithZPlane finds intersection with " +
        "proper values");

    var i2 = CATMAID.tools.intersectLineWithZPlane(0, 0, 0, 0, 0, 0, 0);
    assert.deepEqual(i2, [NaN, NaN],
        "CATMAID.tools.intersectLineWithZPlane fails to find intersection " +
        "if all values are the same");
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
});
