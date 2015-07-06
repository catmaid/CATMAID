/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Skeleton annotations test', function( assert ) {

  // Test SkeletonAnnotations.isRealNode
  (function() {
    assert.ok(SkeletonAnnotations.isRealNode(0),
        "SkeletonAnnotations.isRealNode correctly sees 0 as a real ID");
    SkeletonAnnotations.isRealNode("0",
        "SkeletonAnnotations.isRealNode correctly sees '0' as a real ID");
    assert.ok(SkeletonAnnotations.isRealNode(123456),
        "SkeletonAnnotations.isRealNode correctly sees 123456 as a real ID");
  })();

  // Test SkeletonAnnotations.getVirtulNodeComponents
  (function() {
    assert.strictEqual(SkeletonAnnotations.getVirtualNodeComponents(123), null,
        "SkeletonAnnotations.getVirtualNodeComponents correctly returns null if asked with a real ID");
    assert.strictEqual(SkeletonAnnotations.getVirtualNodeComponents("123"), null,
        "SkeletonAnnotations.getVirtualNodeComponents correctly returns null if asked with a string real ID");
    var vnID = "vn-123-456-8";
    var components = SkeletonAnnotations.getVirtualNodeComponents(vnID);
    assert.strictEqual(components.length, 4,
        "SkeletonAnnotations.getVirtualNodeComponents correctly identifies four matches in " + vnID);
    assert.strictEqual(components[1], "123",
        "SkeletonAnnotations.getVirtualNodeComponents correctly finds 123 as second match in " + vnID);
    assert.strictEqual(components[2], "456",
        "SkeletonAnnotations.getVirtualNodeComponents correctly finds 456 as third match in " + vnID);
    assert.strictEqual(components[3], "8",
        "SkeletonAnnotations.getVirtualNodeComponents correctly finds 8 as fourth match in " + vnID);
  })();

  // Test SkeletonAnnotations.getChildOfVirtualNode
  (function() {
    var vnID = "vn-123-456-8";
    assert.strictEqual(SkeletonAnnotations.getChildOfVirtualNode(vnID), "123",
        "SkeletonAnnotations.getChildOfVirtualNode correctly identifies 123 as child of " + vnID);
    assert.strictEqual(SkeletonAnnotations.getChildOfVirtualNode(123), null,
        "SkeletonAnnotations.getChildOfVirtualNode correctly returns null for ID 123");
  })();

  // Test SkeletonAnnotations.getParentOfVirtualNode
  (function() {
    var vnID = "vn-123-456-8";
    assert.strictEqual(SkeletonAnnotations.getParentOfVirtualNode(vnID), "456",
        "SkeletonAnnotations.getParentOfVirtualNode correctly identifies 456 as parent of " + vnID);
    assert.strictEqual(SkeletonAnnotations.getParentOfVirtualNode(123), null,
        "SkeletonAnnotations.getParentOfVirtualNode correctly returns null for ID 123");
  })();

  // Test SkeletonAnnotations.getZOfVirtualNode
  (function() {
    var vnID = "vn-123-456-8";
    assert.strictEqual(SkeletonAnnotations.getZOfVirtualNode(vnID), "8",
        "SkeletonAnnotations.getZOfVirtualNode correctly identifies 8 as Z of " + vnID);
    assert.strictEqual(SkeletonAnnotations.getZOfVirtualNode(123), null,
        "SkeletonAnnotations.getZOfVirtualNode correctly returns null for ID 123");
  })();
});
