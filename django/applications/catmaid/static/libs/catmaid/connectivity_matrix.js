/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

(function(CATMAID) {

  "use strict";

  // Skeleton IDs used in rows of connectivity matrix
  var rowSkeletonIDs = [];
  // Skeleton IDs used in colums of connectivity matrix
  var colSkeletonIDs = [];
  // The actual connectivity matrix organized rows first in a three dimensional
  // array. Each [row][col] entry contains two values: outgoing from rows to
  // columns, incoming from columns to rows.
  var connectivityMatrix = [];

  /**
   * Constructor for a connectivity matrix.
   */
  var ConnectivityMatrix = function() {};

  /**
   * Recreate internal connectivity representation. Returns a promise that is
   * fulfilled once the conenctivity matrix is ready.
   */
  ConnectivityMatrix.prototype.refresh = function() {
    // Create a combined list of source skeleton IDs and filter out duplicates
    var skeletonIDs = rowSkeletonIDs.concat(colSkeletonIDs).sort()
      .reduce(function(a, b) {
        // Check if the current element is already contained in the result array.
        // Add it to the result array, if not.
        if (a.slice(-1)[0] !== b) {
          a.push(b);
        }
        return a;
      }, []);

    // Return a promise that is fullfilled, if the table is ready
    var self = this;
    return new Promise(function(resolve, reject) {
      requestQueue.register(
          CATMAID.makeURL(project.id + '/skeleton/connectivity'),
          'POST',
          {
            'source': skeletonIDs,
            'boolean_op': 'logic-OR'
          },
          CATMAID.jsonResponseHandler(function(json) {
            connectivityMatrix = self.createConnectivityMatrix(json);
            resolve();
          }), reject);
    });
  };

  /**
   * Rebuild the connectivity matrix based on data returned from the back-end.
   */
  ConnectivityMatrix.prototype.createConnectivityMatrix = function(data) {
    // Initialize result matrix with zero connections
    var m = new Array(rowSkeletonIDs.length);
    for (var i=0; i<rowSkeletonIDs.length; ++i) {
      m[i] = new Array(colSkeletonIDs.length);
      for (var j=0; j<colSkeletonIDs.length; ++j) {
        m[i][j] = [0, 0];
      }
    }

    // Build an index cache to not be required to look up
    var rowIndexCache = rowSkeletonIDs.reduce(function(c, e, i) {
      c[e] = i;
      return c;
    }, {});
    var colIndexCache = colSkeletonIDs.reduce(function(c, e, i) {
      c[e] = i;
      return c;
    }, {});

    // Add connectivity counts for connections from and to row skeletons. Since
    // we asked for row and column skeletons combined as source, we only need to
    // parse the incoming data set.
    for (var partnerSkid in data.incoming) {
      var i = data.incoming[partnerSkid];
      for (var sourceSkid in i.skids) {
        // Get incoming and outgoing information for current source and partner
        var nIncoming = i.skids[sourceSkid];
        var nOutgoing = data.outgoing[sourceSkid] ? data.outgoing[sourceSkid].skids[partnerSkid] : undefined;

        // Store incoming information for rows
        var rowSourceIndex = rowIndexCache[sourceSkid];
        var colPartnerIndex = colIndexCache[partnerSkid];
        if (rowSourceIndex !== undefined && colPartnerIndex !== undefined) {
          m[rowSourceIndex][colPartnerIndex][0] = nIncoming;
        }

        // Store outgoing information for columns
        var colSourceIndex = colIndexCache[sourceSkid];
        var rowPartnerIndex = rowIndexCache[partnerSkid];
        if (colSourceIndex !== undefined && rowPartnerIndex !== undefined) {
          m[rowPartnerIndex][colSourceIndex][1] = nOutgoing;
        }
      }
    }

    return m;
  };

  /**
   * Set the skeleton IDs that are used as rows in the connectivity matrix.
   */
  ConnectivityMatrix.prototype.setRowSkeletonIDs = function(skeletonIDs) {
    // Make sure all elements are numbers
    rowSkeletonIDs = skeletonIDs.map(function(skid) {
        return parseInt(skid, 10);
    });
  };

  /**
   * Set the skeleton IDs that are used as columns in the connectivity matrix.
   */
  ConnectivityMatrix.prototype.setColumnSkeletonIDs = function(skeletonIDs) {
    // Make sure all elements are numbers
    colSkeletonIDs = skeletonIDs.map(function(skid) {
        return parseInt(skid, 10);
    });
  };

  /**
   * Get the connectivity matrix.
   */
  ConnectivityMatrix.prototype.get = function() {
    return connectivityMatrix;
  };

  // Make connectivity matrix available in CATMAID namespace
  CATMAID.ConnectivityMatrix = ConnectivityMatrix;
})(CATMAID);

