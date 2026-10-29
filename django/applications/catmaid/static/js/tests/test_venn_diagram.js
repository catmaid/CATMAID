QUnit.test('Venn disjoint sets stay disjoint with weighted loss (#1203)', function (assert) {
  var DISJOINT_WEIGHT = 1e6;

  function overlapAB(areas) {
    var circles = venn.venn(areas);
    var a = circles['A'], b = circles['B'];
    var dx = a.x - b.x, dy = a.y - b.y;
    return venn.circleOverlap(a.radius, b.radius, Math.sqrt(dx * dx + dy * dy));
  }

  assert.ok(overlapAB([
    {sets: ['A'], size: 10}, {sets: ['B'], size: 10}, {sets: ['C'], size: 10},
    {sets: ['A', 'B'], size: 0, weight: DISJOINT_WEIGHT},
    {sets: ['A', 'C'], size: 3},
    {sets: ['B', 'C'], size: 3}
  ]) < 0.01, 'disjoint pair stays disjoint with a third overlapping class');

  assert.ok(overlapAB([
    {sets: ['A'], size: 10}, {sets: ['B'], size: 10}, {sets: ['C'], size: 10},
    {sets: ['A', 'B'], size: 0, weight: DISJOINT_WEIGHT},
    {sets: ['A', 'C'], size: 0, weight: DISJOINT_WEIGHT},
    {sets: ['B', 'C'], size: 0, weight: DISJOINT_WEIGHT}
  ]) < 0.01, 'all pairwise disjoint');

  // Unequal sizes where the unweighted layout overlaps the disjoint pair.
  assert.ok(overlapAB([
    {sets: ['A'], size: 100}, {sets: ['B'], size: 100}, {sets: ['C'], size: 20},
    {sets: ['A', 'B'], size: 0, weight: DISJOINT_WEIGHT},
    {sets: ['A', 'C'], size: 10},
    {sets: ['B', 'C'], size: 10}
  ]) < 0.01, 'unequal sizes: disjoint pair stays disjoint');
});
