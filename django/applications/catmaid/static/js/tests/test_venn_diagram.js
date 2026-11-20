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

QUnit.test('Venn intersection selects skeletons in every group (#1203)', function (assert) {
  var widget = Object.create(CATMAID.VennDiagram.prototype);
  widget.groups = [
    {models: {1: {id: 1}, 2: {id: 2}, 3: {id: 3}}},
    {models: {1: {id: 1}, 2: {id: 2}}},
    {models: {1: {id: 1}}},
    {models: {4: {id: 4}}}
  ];

  assert.deepEqual(Object.keys(widget.intersectGroupModels([0, 1, 2])), ['1'],
      'triple intersection returns skeletons in all three groups');
  assert.deepEqual(Object.keys(widget.intersectGroupModels([0, 1])), ['1', '2'],
      'pairwise intersection returns skeletons in both groups');
  assert.deepEqual(Object.keys(widget.intersectGroupModels([0, 2])), ['1'],
      'intersection of groups 0 and 2');
  assert.deepEqual(Object.keys(widget.intersectGroupModels([0, 3])), [],
      'disjoint groups return an empty intersection');
});
