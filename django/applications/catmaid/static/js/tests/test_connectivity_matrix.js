/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

QUnit.test('Connectivity matrix test', function( assert ) {

  // Test basic connectivity matric generation
  (function() {
    var rowSkeletonIDs = [1,2,3];
    var colSkeletonIDs = [4,5,6];
    // Create a reduced fake response from the back-end: skeleton/connectivity
    var data = {
      // Partners that are presynaptic to request skeletons
      incoming: {
        // Presynaptic partners in rows
        '1': { skids: { '4': 7, '5': 3 } },
        '2': { skids: { '5': 1, '6': 8 } },
        '3': { skids: { '4': 1, '6': 9 } },
        // Presynaptic partners in columns
        '4': { skids: { '1': 3, '3': 12 } },
        '5': { skids: { '2': 3, '3': 5 } },
        '6': { skids: { '1': 8, '2': 7 } },
        // Connections that irrelevant to this connectivity matrix
        '8': { skids: { '1': 17, '3': 3 } },
        '42': { skids: { '2': 19 } }
      },
      // Partners that are postsynaptic to request skeletons
      outgoing: {
        // Postsynaptic partners in rows
        '1': { skids: { '4': 3, '6': 8, '8': 17 } },
        '2': { skids: { '5': 3, '6': 7, '42': 19 } },
        '3': { skids: { '4': 12, '5': 5, '8': 3 } },
        // Postsynaptic partners in columns
        '4': { skids: { '1': 7, '3': 1 } },
        '5': { skids: { '1': 3, '2': 1 } },
        '6': { skids: { '2': 8, '3': 9 } },
      }
    };
    // Setup connectivity matrix object and initialize according to the data
    // above.
    var cm = new CATMAID.ConnectivityMatrix();
    cm.setRowSkeletonIDs(rowSkeletonIDs);
    cm.setColumnSkeletonIDs(colSkeletonIDs);
    // Get connectivity matrix
    var m = cm.createConnectivityMatrix(data);

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
    var expectedMatrix = [[[3,7], [0,3], [8,0]],
                          [[0,0], [3,1], [7,8]],
                          [[12,1], [5,0], [0,9]]];
    assert.deepEqual(m, expectedMatrix,
        "CATMAID.ConnectivityMatrix creates an expected matrix");
  })();
});
