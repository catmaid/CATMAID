/* Compute whether a point in space is inside a mesh.
 * Returns a function that can do the test,
 * and which uses the center of the mesh
 * to establish the direction of the ray. */
GeometryTools.intersectsFn = function(mesh) {
    // target: centroid of the mesh
    // source: the point to test
    return (function(target, source) {
        var mms = mesh.material.side;
        var restore = false;
        if (THREE.DoubleSide !== mms) {
          mesh.material.side = THREE.DoubleSide;
          restore = true;
        }
        var direction = target.clone().sub(source).normalize();
        var intersections = new THREE.Raycaster(source, direction).intersectObject(mesh);
        if (restore) {
          mesh.material.side = mms;
        }
        // Observe how many times the ray crosses faces of the mesh.
        // When odd, the object is inside.
        return 1 === intersections.length % 2;
    }).bind(null, (function() {
        // Compute centroid of the mesh
        var vs = mesh.geometry.vertices;
        var center = vs[0].clone();
        for (var i=1; i<vs.length; ++i) { center.add(vs[i]); }
        center.multiplyScalar(1.0 / vs.length);
        center.add(mesh.position);
        return center;
    })());
};
