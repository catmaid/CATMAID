/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Volume test', function( assert ) {

  // Test volume intersector on box
  (function() {
    var geometry = new THREE.BoxBufferGeometry(1, 1, 1);
    var mesh = new THREE.Mesh(geometry);
    var intersector = CATMAID.Volumes.makeIntersector(mesh);
    var point = new THREE.Vector3();

    point.set(0, 0, 0);
    assert.ok(intersector.contains(point), "Box mesh contains point within");
    point.set(0, 0.5, 0);
    assert.ok(!intersector.contains(point), "Box mesh does not contain point on surface");
    point.set(0, 0.5, 0.5);
    assert.ok(!intersector.contains(point), "Box mesh does not contains point on corner");
    point.set(1.5, 0.5, 0.5);
    assert.ok(!intersector.contains(point), "Box mesh does not contain point");
  })();

  // Test volume intersector on sphere
  (function() {
    var geometry = new THREE.SphereBufferGeometry(0.5, 16, 16);
    var mesh = new THREE.Mesh(geometry);
    var intersector = CATMAID.Volumes.makeIntersector(mesh);
    var point = new THREE.Vector3();

    point.set(0, 0, 0);
    assert.ok(intersector.contains(point), "Sphere mesh contains point within");
//    point.set(0, 0.5, 0);
//    assert.ok(!intersector.contains(point), "Sphere mesh does not contain point on surface");
//    point.set(0, 0.5, 0.5);
//    assert.ok(!intersector.contains(point), "Sphere mesh does not contains point on corner");
//    point.set(1.5, 0.5, 0.5);
//    assert.ok(!intersector.contains(point), "Sphere mesh does not contain point");
  })();

  // Test volume intersector on torus
  (function() {
    var geometry = new THREE.TorusBufferGeometry(100, 40, 32, 32);
    var mesh = new THREE.Mesh(geometry);
    var intersector = CATMAID.Volumes.makeIntersector(mesh);
    var point = new THREE.Vector3();

    point.set(100, 0, 0);
    assert.ok(intersector.contains(point), "Torus mesh contains point within");
    point.set(0, 0, 0);
    assert.ok(!intersector.contains(point), "Torus mesh does not contain point");
  })();

});

