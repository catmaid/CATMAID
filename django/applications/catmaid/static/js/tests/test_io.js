QUnit.test('Utilities test', function (assert) {

  const io = CATMAID.io;

  // Test createTSVString
  (function () {
    const simple = [[1, 2], [3, 4]];
    assert.ok(io.createTSVString(simple) == "1\t2\n3\t4", "createTSVString handles simple cases");
    assert.ok(io.createTSVString(simple, null, ",", "|") == "1,2|3,4", "createTSVString can use custom separators");
    const fn = (unit, rowIdx, colIdx) => [unit, rowIdx, colIdx].join("");
    assert.ok(io.createTSVString(simple, fn) == "100\t201\n310\t411", "createTSVString can use a transformer function");
    const bad = [["12\t34", "56\n78"], ["9101", "1121"]];
    assert.throws(function () {
      io.createTSVString(bad);
    }, "createTSVString errors when separators are present in the units");
    assert.ok(io.createTSVString(bad, null, null, true), "createTSVString can skip separator-in-unit checks");
  })();

});
