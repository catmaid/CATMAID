QUnit.test('Slider zoom sync regression (#1578)', function (assert) {
  // The zoom slider keeps its own value/index, synced from the stack viewer's
  // scale. If the slider is left stale (e.g. after synchronized navigation
  // between orthoviews), a subsequent move() starts from the stale value and
  // makes the scale jump. The fix syncs the slider from the viewer's scale
  // before each zoom; this guards the primitive that fix relies on:
  // setByValue(v, true) must update the index without firing onchange.
  var changes = [];
  var onchange = function (val, step) { changes.push([val, step]); };

  var slider = new CATMAID.Slider(
      CATMAID.Slider.HORIZONTAL, false, 0, 10, 11, 0, onchange);

  // Simulate a stale slider: the viewer's scale advanced to 8 externally,
  // while the slider still holds 5.
  slider.setByValue(5, true);
  assert.strictEqual(slider.val, 5, 'slider holds a stale value');
  assert.strictEqual(changes.length, 0,
      'setByValue with cancelOnchange=true does not fire onchange');

  // Sync to the current scale (what the navigator fix does), then move.
  slider.setByValue(8, true);
  assert.strictEqual(slider.val, 8, 'slider synced to the viewer scale');
  assert.strictEqual(changes.length, 0, 'sync does not fire onchange');

  slider.move(1);
  assert.strictEqual(slider.val, 9,
      'move() is relative to the synced value, not the stale one');
});
