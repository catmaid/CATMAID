/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Utilities test', function( assert ) {
  // Test CATMAID.tools.compareStrings
  var stringList = ['Test', 'Value', '4', 'test-90', 'test-87', '5010'];
  stringList.sort(CATMAID.tools.compareStrings);
  assert.deepEqual(stringList,
      ['4', '5010', 'Test', 'test-87', 'test-90', 'Value'],
      "CATMAID.tools.compareStrings sorts a list as expected");
});
