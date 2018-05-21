/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  project
*/

(function(CATMAID) {

  "use strict";

  /**
   * Constructor for a connectivity matrix that contains the number of synapses
   * between each row skeleton and each column skeleton.
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

    // A set of filter rules to apply to the handled connectors
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;
  };

  /**
   * Recreate internal connectivity representation. Returns a promise that is
   * fulfilled once the conenctivity matrix is ready.
   */
  ConnectivityMatrix.prototype.refresh = function() {
    // Return a promise that is fullfilled, if the table is ready
    var self = this;
    var with_locations = self.filterRules && self.applyFilterRules;

    return CATMAID.fetch(project.id + '/skeleton/connectivity_matrix', 'POST', {
          'rows': self.rowSkeletonIDs,
          'columns': self.colSkeletonIDs,
          'with_locations': with_locations
        })
      .then(function(json) {
        return self.filterResults(json);
      })
      .then(function(json) {
        self.setConnectivityMatrixFromData(json);
      });
  };

  ConnectivityMatrix.prototype.filterResults = function(data) {
    var hasResults = data && !CATMAID.tools.isEmpty(data);
    if (this.filterRules.length > 0 && this.applyFilterRules && hasResults) {
      // Collect connector models from input
      var connectors = new Map();
      for (var sourceSkeletonId in data) {
        var targets = data[sourceSkeletonId];
        for (var targetSkeletonId in targets) {
          var links = targets[targetSkeletonId];
          if (!links.locations) {
            throw new CATMAID.ValueError("Could not find location information in connectivity matrix");
          }
          for (var connectorId in links.locations) {
            var connector  = links.locations[connectorId];
            connectorId = parseInt(connectorId, 10);
            if (!connectors.has(connectorId)) {
              var x = connector.pos[0];
              var y = connector.pos[1];
              var z = connector.pos[2];
              connectors.set(connectorId,
                  new CATMAID.ConnectorModel(connectorId, x, y, z));
            }
          }
        }
      }
      // Filter connectors
      var filter = new CATMAID.NodeFilter(this.filterRules, connectors);
      return filter.execute()
        .then(function(filtered) {
          if (filtered.nodes.size === 0) {
            CATMAID.warn("No connectors left after filter application");
            return Promise.resolve([]);
          }
          // Filter links
          let allowedNodes = new Set(Object.keys(filtered.nodes).map(function(n) {
            return parseInt(n, 10);
          }));
          for (var sourceSkeletonId in data) {
            var targets = data[sourceSkeletonId];
            for (var targetSkeletonId in targets) {
              var links = targets[targetSkeletonId];
              if (!links.locations) {
                throw new CATMAID.ValueError("Could not find location information in connectivity matrix");
              }
              for (var connectorId in links.locations) {
                connectorId = parseInt(connectorId, 10);
                if (!allowedNodes.has(connectorId)) {
                  var loc = links.locations[connectorId];
                  links.count = links.count - loc.count;
                  delete links.locations[connectorId];
                }
              }

              if (links.count === 0) {
                delete targets[targetSkeletonId];
              }
            }

            if (CATMAID.tools.isEmpty(targets)) {
              delete data[sourceSkeletonId];
            }
          }

          return Promise.resolve(data);
        });
    }
    return Promise.resolve(data);
  };

  /**
   * Rebuild the connectivity matrix based on data (which was e.g. returned
   * from the back-end).
   */
  ConnectivityMatrix.prototype.setConnectivityMatrixFromData = function(data) {
    this.rawData = data;
    this.connectivityMatrix = this.createConnectivityMatrix(data);
  };

  /**
   * Rebuild the connectivity matrix based on data (which was e.g. returned
   * from the back-end).
   */
  ConnectivityMatrix.prototype.rebuild = function() {
    this.setConnectivityMatrixFromData(this.rawData);
  };

  /**
   * Rebuild and return the connectivity matrix based on data returned from the
   * back-end. This data is expected to be a mapping from source skeleton IDs
   * to a set of post synaptic partner skelton IDs. Each partner is mapped to
   * the individual synapse count.
   */
  ConnectivityMatrix.prototype.createConnectivityMatrix = function(data) {
    // Initialize result matrix with zero connections
    var m = new Array(this.rowSkeletonIDs.length);
    for (var i=0; i<this.rowSkeletonIDs.length; ++i) {
      m[i] = new Array(this.colSkeletonIDs.length);
      for (var j=0; j<this.colSkeletonIDs.length; ++j) {
        m[i][j] = { 'count': 0, 'data': {} };
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

    // Add connectivity counts for connections from and to row skeletons. The
    // result is organized by outgoing connections.
    for (var sourceSkid in data) {
      var partners = data[sourceSkid];
      for (var partnerSkid in partners) {
        // Store number of connections from current source to current target
        // (i.e. row to column).
        var rowSourceIndex = rowIndexCache[sourceSkid];
        var colPartnerIndex = colIndexCache[partnerSkid];
        if (rowSourceIndex !== undefined && colPartnerIndex !== undefined) {
          var count = partners[partnerSkid];
          if (typeof(count) === 'number') {
            m[rowSourceIndex][colPartnerIndex] = {
              'count': count,
              'data': {}
            };
          } else {
            m[rowSourceIndex][colPartnerIndex] = {
              'count': count.count,
              'data': count.locations
            };
          }
        }
      }
    }

    return m;
  };

  /**
   * Get a flat array of arrays containing connectivity counts.
   */
  ConnectivityMatrix.prototype.getFlatMatrix = function() {
    var m = new Array(this.rowSkeletonIDs.length);
    for (var i=0; i<this.rowSkeletonIDs.length; ++i) {
      m[i] = new Array(this.colSkeletonIDs.length);
      for (var j=0; j<this.colSkeletonIDs.length; ++j) {
        m[i][j] = this.connectivityMatrix[i][j].count;
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
        if (c.count > max) max = c.count;
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

