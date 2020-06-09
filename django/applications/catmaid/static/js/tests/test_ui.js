QUnit.test('UI test', function( assert ) {

  // Test CATMAID.UI.getKeyValue
  assert.ok(CATMAID.UI.normalizeKeyCombo('Shift + a'), 'Shift + A');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Shift + Shift + z'), 'Shift + Z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Shift + Z'), 'Shift + Z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Shift + Shift + A'), 'Shift + A');

  assert.ok(CATMAID.UI.normalizeKeyCombo('Alt + a'), 'Alt + a');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Alt + Alt + z'), 'Alt + z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Alt + Z'), 'Alt + Z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Alt + Alt + A'), 'Alt + A');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Alt + z'), 'Alt + z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Alt + Alt + a'), 'Alt + a');

  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + a'), 'Ctrl + a');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + Ctrl + z'), 'Ctrl + z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + Z'), 'Ctrl + Z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + Ctrl + A'), 'Ctrl + A');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + z'), 'Ctrl + z');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + Ctrl + a'), 'Ctrl + a');

  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + Alt + a'), 'Alt + Ctrl + a');
  assert.ok(CATMAID.UI.normalizeKeyCombo('Ctrl + Alt + Shift + a'), 'Alt + Ctrl + Shift + A');
});
