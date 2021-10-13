QUnit.test('Utilities test', function (assert) {

  // Test createTSVString
  (function () {
    const simple = [[1, 2], [3, 4]];
    assert.ok(CATMAID.createTSVString(simple) == "1\t2\n3\t4", "createTSVString handles simple cases");
    assert.ok(CATMAID.createTSVString(simple, null, ",", "|") == "1,2|3,4", "createTSVString can use custom separators");
    const fn = (unit, rowIdx, colIdx) => [unit, rowIdx, colIdx].join("");
    assert.ok(CATMAID.createTSVString(simple, fn) == "100\t201\n310\t411", "createTSVString can use a transformer function");
    const bad = [["12\t34", "56\n78"], ["9101", "1121"]];
    assert.throws(function () {
      CATMAID.createTSVString(bad);
    }, "createTSVString errors when separators are present in the units");
    assert.ok(CATMAID.createTSVString(bad, null, null, true), "createTSVString can skip separator-in-unit checks");
  })();

});
