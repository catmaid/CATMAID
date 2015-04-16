/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Constructor for a connectivity matrix.
   */
  var ConnectivityMatrix = function() {
    // Define row skeleton field, not writable, enumerable or configurable
    var _rowSkeletonIDs = [];
    Object.defineProperty(this, 'rowSkeletonIDs', {
      get: function() { return _rowSkeletonIDs; },
      set: function(l) { _rowSkeletonIDs = parseList(l); }
    });

    // Define column skeleton field, not writable, enumerable or
    // configurable
    var _colSkeletonIDs = [];
    Object.defineProperty(this, 'colSkeletonIDs', {
      get: function() { return _colSkeletonIDs; },
      set: function(l) { _colSkeletonIDs = parseList(l); }
    });

    // The actual connectivity matrix organized rows first in a three
    // dimensional array. Each [row][col] entry contains two values:
    // outgoing from rows to columns, incoming from columns to rows.
    this.connectivityMatrix = [];
  };

  /**
   * Recreate internal connectivity representation. Returns a promise that is
   * fulfilled once the conenctivity matrix is ready.
   */
  ConnectivityMatrix.prototype.refresh = function() {
    // Create a combined list of source skeleton IDs and filter out duplicates
    var skeletonIDs = this.rowSkeletonIDs.concat(this.colSkeletonIDs).sort()
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
            self.setConnectivityMatrixFromData(json);
            resolve();
          }, reject));
    });
  };

  /**
   * Rebuild the connectivity matrix based on data (which was e.g. returned
   * from the back-end).
   */
  ConnectivityMatrix.prototype.setConnectivityMatrixFromData = function(data) {
    this.connectivityMatrix = this.createConnectivityMatrix(data);
  };

  /**
   * Rebuild and return the connectivity matrix based on data returned from the
   * back-end
   */
  ConnectivityMatrix.prototype.createConnectivityMatrix = function(data) {
    // Initialize result matrix with zero connections
    var m = new Array(this.rowSkeletonIDs.length);
    for (var i=0; i<this.rowSkeletonIDs.length; ++i) {
      m[i] = new Array(this.colSkeletonIDs.length);
      for (var j=0; j<this.colSkeletonIDs.length; ++j) {
        m[i][j] = [0, 0];
      }
    }

    // Build an index cache to not be required to look up
    var rowIndexCache = this.rowSkeletonIDs.reduce(function(c, e, i) {
      c[e] = i;
      return c;
    }, {});
    var colIndexCache = this.colSkeletonIDs.reduce(function(c, e, i) {
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
   * Get the number of rows.
   */
  ConnectivityMatrix.prototype.getNumberOfRows = function() {
    return this.rowSkeletonIDs === undefined ? 0 : this.rowSkeletonIDs.length;
  };

  /**
   * Get the number of columns.
   */
  ConnectivityMatrix.prototype.getNumberOfColumns = function() {
    return this.colSkeletonIDs === undefined ? 0 : this.colSkeletonIDs.length;
  };

  /**
   * Get maximum number of connections in matrix.
   */
  ConnectivityMatrix.prototype.getMaxConnections = function() {
    var max = 0;
    for (var i=0; i<this.rowSkeletonIDs.length; ++i) {
      for (var j=0; j<this.colSkeletonIDs.length; ++j) {
        var c = this.connectivityMatrix[i][j];
        if (c[0] > max) max = c[0];
        if (c[1] > max) max = c[1];
      }
    }
    return max;
  };

  /**
   * Return a list of integer numbers, parsed from the input list.
   */
  function parseList(l) {
    return l.map(function(e) { return parseInt(e, 10); });
  }

  // Make connectivity matrix available in CATMAID namespace
  CATMAID.ConnectivityMatrix = ConnectivityMatrix;

})(CATMAID);

