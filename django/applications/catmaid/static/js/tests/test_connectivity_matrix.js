/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Connectivity matrix test', function( assert ) {
  var rowSkeletonIDs = [1,2,3];
  var colSkeletonIDs = [4,5,6];
  // Create a reduced fake response from the back-end: skeleton/connectivity_matrix
  var data = {
    // Postsynaptic partners of rows
    '1': { '4': 3, '6': 8 },
    '2': { '5': 3, '6': 7 },
    '3': { '4': 12, '5': 5 }
  };

  // Test basic connectivity matric generation
  (function() {
    // Setup connectivity matrix object and initialize according to the data
    // above.
    var cm = new CATMAID.ConnectivityMatrix();
    cm.rowSkeletonIDs = rowSkeletonIDs;
    cm.colSkeletonIDs = colSkeletonIDs;
    // Set connectivity matrix without asking back-end
    cm.setConnectivityMatrixFromData(data);
    var m = cm.connectivityMatrix;

    // Test number of rows
    assert.strictEqual(m.length, rowSkeletonIDs.length,
        "CATMAID.ConnectivityMatrix creates a matrix with correct number of rows");
    // Test number of columns
    var correctNCols;
    rowSkeletonIDs.forEach(function(rSkid, i) {
      if (correctNCols === undefined) {
        correctNCols = true;
      }
      correctNCols = correctNCols && (m[i].length === colSkeletonIDs.length);
    });
    assert.ok(correctNCols,
        "CATMAID.ConnectivityMatrix creates a matrix with correct number of columns");
    // Test contents of matrix
    var expectedMatrix = [[3, 0, 8],
                          [0, 3, 7],
                          [12, 5, 0]];
    assert.deepEqual(cm.getFlatMatrix(), expectedMatrix,
        "CATMAID.ConnectivityMatrix creates an expected matrix");

    // Test if creating a new matrix instance preserves the result above
    var cm2 = new CATMAID.ConnectivityMatrix();
    assert.deepEqual(cm.getFlatMatrix(), expectedMatrix,
        "CATMAID.ConnectivityMatrix preserves matrix when new instances are created");

  })();

  // Make sure two separate instances won't influence each other
  (function() {
    // Setup connectivity matrix object and initialize according to the data
    // above.
    var cm1 = new CATMAID.ConnectivityMatrix();
    cm1.rowSkeletonIDs = rowSkeletonIDs;
    cm1.colSkeletonIDs = colSkeletonIDs;
    // Set connectivity matrix without asking back-end
    cm1.setConnectivityMatrixFromData(data);
    var m1 = cm1.connectivityMatrix;

    // Create a second connectivity matrix without any content
    var cm2 = new CATMAID.ConnectivityMatrix();
    assert.deepEqual(cm2.connectivityMatrix, [],
        "CATMAID.ConnectivityMatrix instances start always with an empty matrix.");

    // Assert that both matrixes are different objects
    assert.ok(cm1.connectivityMatrix !== cm2.connectivityMatrix,
        "CATMAID.ConnectivityMatrix instances have different private matrix objects");
  })();

  // Test max connection calulation
  (function() {
    var cm = new CATMAID.ConnectivityMatrix();
    cm.rowSkeletonIDs = rowSkeletonIDs;
    cm.colSkeletonIDs = colSkeletonIDs;
    // Set connectivity matrix without asking back-end
    cm.setConnectivityMatrixFromData(data);

    assert.equal(cm.getMaxConnections(), 12,
        "CATMAID.ConnectivityMatrix.getMaxConnections() computes correctly");
  })();
});
