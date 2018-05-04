/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new connector table, optional with a set of initial skeleton
   * models.
   */
  var ConnectorList = function(data)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `connector-list${this.widgetID}-`;

    // A skeleton source to collect results in
    this.resultSkeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this
    });

    // The displayed data table
    this.connectorTable = null;

    this.data = data;

    // A set of filter rules to apply to the handled connectors
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;
  };

  /**
   * Create a new Connector Table based on an array of arrays, each one
   * representing a connector link. The expected format is:
   *
   * [connector_id, x, y, z, skeleton_id, confidence, creator_id, creation_time,
   * edition_time]
   *
   * @returns {Object} Window handle and widget instance.
   */
  ConnectorList.fromRawData = function(data) {
    return CATMAID.WindowMaker.create('connector-list', data);
  };

  $.extend(ConnectorList.prototype, new InstanceRegistry());

  ConnectorList.prototype.getName = function() {
    return "Connector list " + this.widgetID;
  };

  ConnectorList.prototype.destroy = function() {
    this.unregisterInstance();
    this.resultSkeletonSource.destroy();
  };

  ConnectorList.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var exportCSV = document.createElement('input');
        exportCSV.setAttribute("type", "button");
        exportCSV.setAttribute("value", "Export links as CSV");
        exportCSV.setAttribute("title", "Export a CSV file for the currently displayed table");
        exportCSV.onclick = this.exportCSV.bind(this);
        controls.appendChild(exportCSV);

        var exportConnectorCSV = document.createElement('input');
        exportConnectorCSV.setAttribute("type", "button");
        exportConnectorCSV.setAttribute("value", "Export connectors as CSV");
        exportConnectorCSV.setAttribute("title", "Export a CSV file including all connector IDs and locations");
        exportConnectorCSV.onclick = this.exportConnectorCSV.bind(this);
        controls.appendChild(exportConnectorCSV);
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        var container = document.createElement('div');
        content.appendChild(container);

        var table = document.createElement('table');
        table.style.width = "100%";
        content.appendChild(table);

        var self = this;
        this.connectorTable = $(table).DataTable({
          dom: "lrfphtip",
          paging: true,
          order: [],
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {

              // Locally resolve request if no skeletons are provided
            self.getData()
              .then(function(connectorData) {
                return self.filterResults(connectorData);
              })
              .then(function(connectorData) {
                callback({
                  draw: data.draw,
                  recordsTotal: connectorData.length,
                  recordsFiltered: connectorData.length,
                  data: connectorData,
                });

                // Populate result skeleton source
                var models = connectorData.reduce(function(o, link) {
                  var skid = link[4];
                  o[skid]  = new CATMAID.SkeletonModel(skid);
                  return o;
                }, {});
                self.resultSkeletonSource.clear();
                self.resultSkeletonSource.append(models);
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {data: 4, className: "cm-center", title: "Skeleton ID"},
            {data: 0, className: "cm-center", title: "Connector ID"},
            {data: 1, className: "cm-center", title: "X"},
            {data: 2, className: "cm-center", title: "Y"},
            {data: 3, className: "cm-center", title: "Z"},
            {
              data: 3,
              title: "S",
              className: "cm-center",
              render: function(data, type, row, meta) {
                return project.focusedStackViewer.primaryStack.projectToStackZ(row[3], row[2], row[1]);
              },
            }, // section index
            {data: 5, className: "cm-center", title: "Link confidence"},
            {
              data: 6,
              className: "cm-center",
              title: "User",
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(data).login;
              }
            },
            {data: 7, className: "cm-center", title: "Treenode ID"},
            {
              data: 8,
              title: "Created on",
              className: "cm-center",
              render: function(data, type, row, meta) {
                var d = new Date(data);
                return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
                    + ' ' + d.getHours() + ':' + d.getMinutes();
              }
            },
            {
              data: 9,
              title: "Last modified",
              className: "cm-center",
              render: function(data, type, row, meta) {
                var d = new Date(data);
                return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
                    + ' ' + d.getHours() + ':' + d.getMinutes();
              }
            },
          ]
        }).on('dblclick', 'tbody td', function() {
          var cell = self.connectorTable.cell( this );
          var col = cell[0][0].column;
          if (!cell || col !== 9) {
            return;
          }

          var clickedId = cell.data();
          SkeletonAnnotations.staticMoveToAndSelectNode(clickedId);

          return false;
        }).on('dblclick', 'tbody tr', function () {
          var row = self.connectorTable.row(this);
          var data = row.data();
          var connectorId = data[0];
          SkeletonAnnotations.staticMoveToAndSelectNode(connectorId);
        });
      },
      filter: {
        rules: this.filterRules,
        update: this.update.bind(this),
        type: 'node',
      },
    };
  };

  ConnectorList.prototype.getData = function() {
    return this.data ? Promise.resolve(this.data) : Promise.resolve([]);
  };

  /**
   * Update display based on current skeleton source content.
   */
  ConnectorList.prototype.update = function() {
    if (this.connectorTable) {
      this.connectorTable.ajax.reload();
    }
  };

  /**
   * Apply current filter set, if any, to the input data and return a promise
   * which resolves with the filtered data.
   */
  ConnectorList.prototype.filterResults = function(data) {
    var hasResults = data && data.length > 0;
    if (this.filterRules.length > 0 && this.applyFilterRules && hasResults) {
      // Collect connector models from input
      var connectors = data.reduce(function(o, link) {
        var connectorId = link[0];
        var x = link[1], y = link[2], z = link[3];
        o[connectorId] = new CATMAID.ConnectorModel(connectorId, x, y, z);
        return o;
      }, new Map());
      var filter = new CATMAID.NodeFilter(this.filterRules, connectors);
      return filter.execute()
        .then(function(filtered) {
          if (filtered.nodes.size === 0) {
            CATMAID.warn("No connectors left after filter application");
            data= [];
            return Promise.resolve(data);
          }
          // Filter links
          let allowedNodes = new Set(Object.keys(filtered.nodes).map(function(n) {
            return parseInt(n, 10);
          }));
          data = data.filter(function(link) {
            let connectorId = link[0];
            return allowedNodes.has(connectorId);
          });
          return Promise.resolve(data);
        });
    }
    return Promise.resolve(data);
  };

  /**
   * Export the currently displayed table as CSV.
   */
  ConnectorList.prototype.exportCSV = function() {
    if (!this.connectorTable) return;
    var header = this.connectorTable.columns().header().map(function(h) {
      return $(h).text();
    });
    // Remove "S" column
    header.splice(5, 1);

    // Use original data, but change order to match the table
    var connectorRows = this.connectorTable.rows({"order": "current"})
        .data().map(function(row) {
          return [row[4], row[0], row[1], row[2], row[3], row[5], row[6],
              row[7], row[8], row[9]];
        });
    var csv = header.join(',') + '\n' + connectorRows.map(function(row) {
      return row.join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, "catmaid-connector-link-list.csv");
  };

  /**
   * Export the currently displayed connectors as CSV.
   */
  ConnectorList.prototype.exportConnectorCSV = function() {
    if (!this.connectorTable) return;

    let header = ['Connector ID', 'X', 'Y', 'Z'];

    // Use original data, but change order to match the table
    let seenConnectors = new Set();
    var connectorRows = this.connectorTable.rows({"order": "current"})
        .data().reduce(function(target, row, i) {
          if (!seenConnectors.has(row[0])) {
            target.push([row[0], row[1], row[2], row[3]]);
          }
          return target;
        }, []);

    var csv = header.join(',') + '\n' + connectorRows.map(function(row) {
      return row.join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, "catmaid-connector-list.csv");
  };

  // Export widget
  CATMAID.ConnectorList = ConnectorList;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Connector List",
    description: "List connectors",
    key: 'connector-list',
    creator: ConnectorList,
    hidden: true,
  });

})(CATMAID);
