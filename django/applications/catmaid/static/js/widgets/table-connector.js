/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new connector table, optional with a set of initial skeleton
   * models.
   */
  var ConnectorTable = function(skeletonModels)
  {
    this.widgetID = this.registerInstance();

    // This skeleton source takes care of internal skeleton management. It is
    // not registered. It is the input skeleton sink, but the output is handled
    // with a second soucre
    var update = this.update.bind(this);
    this.skeletonSource = new CATMAID.BasicSkeletonSource(this.getName() + " (input)", {
      register: false,
      handleAddedModels: update,
      handleChangedModels: update,
      handleRemovedModels: update
    });
    // A skeleton source to collect results in
    this.resultSkeletonSource = new CATMAID.BasicSkeletonSource(this.getName());

    // The displayed data table
    this.connectorTable = null;

    if (skeletonModels) {
      this.skeletonSource.append(skeletonModels);
    }
  };

  ConnectorTable.prototype = {};
  $.extend(ConnectorTable.prototype, new InstanceRegistry());

  ConnectorTable.prototype.getName = function() {
    return "Connector table " + this.widgetID;
  };

  ConnectorTable.prototype.destroy = function() {
    this.unregisterInstance();
  };

  ConnectorTable.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'connector-table-controls',
      createControls: function(controls) {
        var self = this;
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this.skeletonSource);
        controls.appendChild(sourceSelect);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Add");
        add.onclick = this.skeletonSource.loadSource.bind(this.skeletonSource);
        controls.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = function() {
          self.skeletonSource.clear();
          self.update();
        };
        controls.appendChild(clear);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "refresh_connectortable_current_skeleton" + this.widgetID);
        add.setAttribute("value", "Refresh");
        add.onclick = this.update.bind(this);
        controls.appendChild(add);

        var relation = CATMAID.DOM.createSelect(
          "connector_relation_type" + this.widgetID, [
          {title: 'Incoming connectors', value: "postsynaptic_to"},
          {title: 'Outgoing connectors', value: "presynaptic_to"},
          {title: 'Gap junction connectors', value: "gapjunction_with"},
          {title: 'Abutting connectors', value: "abutting"}],
          "presynaptic_to");
        relation.onchange = this.update.bind(this);
        var relationLabel = document.createElement('label');
        relationLabel.appendChild(document.createTextNode('Type'));
        relationLabel.appendChild(relation);
        controls.appendChild(relationLabel);

        var exportCSV = document.createElement('input');
        exportCSV.setAttribute("type", "button");
        exportCSV.setAttribute("value", "Export CSV");
        exportCSV.setAttribute("title", "Export a CSV file for the currently displayed table");
        exportCSV.onclick = this.exportCSV.bind(this);
        controls.appendChild(exportCSV);
      },
      contentID: ' connector-table-content',
      createContent: function(content) {
        var self = this;
        var possibleLengths = CATMAID.pageLengthOptions;
        var possibleLengthsLabels = CATMAID.pageLengthLabels;
        var widgetID = this.widgetID;
        var tableid = '#connectortable' + widgetID;

        var container = document.createElement('div');
        content.appendChild(container);

        var table = document.createElement('table');
        table.style.width = "100%";
        content.appendChild(table);

        this.connectorTable = $(table).DataTable({
          dom: "lrphtip",
          paging: true,
          order: [],
          serverSide: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            var relationType = $('#connector_relation_type' + widgetID + ' :selected').val();
            var params = {
              skeleton_ids: self.skeletonSource.getSelectedSkeletons(),
              relation_type: relationType
            };

            // Locally resolve request if no skeletons are provided
            if (0 === params.skeleton_ids.length) {
              callback({
                draw: data.draw,
                recordsTotal: 0,
                recordsFiltered: 0,
                data: []
              });
              return;
            }
              
            if (undefined !== data.length) {
              params.range_start = data.start;
              params.range_length = data.length;
            }

            if (data.order && data.order.length > 0) {
              params.sort_column = data.order[0].column;
              params.sort_dir = data.order[0].dir;

              // Correct for artificial stack section column
              if (params.sort_column > 4) {
                params.sort_column = params.sort_column - 1;
              }
            }

            CATMAID.fetch(project.id +  "/connectors/", "GET", params)
              .then(function(result) {
                // Populate table
                callback({
                  draw: data.draw,
                  recordsTotal: result.total_count,
                  recordsFiltered: result.total_count,
                  data: result.links
                });
                // Populate result skeleton source
                var models = result.links.reduce(function(o, link) {
                  var skid = link[1];
                  // TODO Color according to relation type for this link
                  o[skid]  = new CATMAID.SkeletonModel(skid);
                  return o;
                }, {});
                self.resultSkeletonSource.clear();
                self.resultSkeletonSource.append(models);
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {data: 0, className: "cm-center", title: "Connector"},
            {data: 1, className: "cm-center", title: "Skeleton ID"},
            {data: 2, className: "cm-center", title: "X"},
            {data: 3, className: "cm-center", title: "Y"},
            {data: 4, className: "cm-center", title: "Z"},
            {
              data: 4,
              title: "S",
              className: "cm-center",
              render: function(data, type, row, meta) {
                return project.focusedStackViewer.primaryStack.projectToStackZ(row[4], row[3], row[2]);
              },
            }, // section index
            {data: 5, className: "cm-center", title: "Source confidence"},
            {data: 6, className: "cm-center", title: "Partner confidence"},
            {data: 7, className: "cm-center", title: "Tags"},
            {data: 8, className: "cm-center", title: "# Skeleton nodes"},
            {data: 9, className: "cm-center", title: "User"},
            {data: 10, className: "cm-center", title: "Treenode ID"},
            {
              data: 11,
              title: "Last modified",
              className: "catmaid.center",
              render: function(data, type, row, meta) {
                var d = new Date(data);
                return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
                    + ' ' + d.getHours() + ':' + d.getMinutes();
              }
            },
          ]
        }).on('dblclick', 'tbody td', function() {
          var cell = self.connectorTable.cell( this );
          if (!cell || cell[0][0].column !== 0) {
            return;
          }

          var clickedId = cell.data();
          SkeletonAnnotations.staticMoveToAndSelectNode(clickedId);

          return false;
        }).on('dblclick', 'tbody tr', function () {
          var row = self.connectorTable.row(this);
          var data = row.data();
          // retrieve coordinates and moveTo
          var x = parseFloat(data[2]);
          var y = parseFloat(data[3]);
          var z = parseFloat(data[4]);

          // If there is a partner treenode, activate that - otherwise
          // activate the connector itself:
          var idToActivate, skeletonID;
          if (data[10]) {
            idToActivate = parseInt(data[10], 10);
            skeletonID = parseInt(data[1], 10);
          } else {
            idToActivate = parseInt(data[0], 10);
            skeletonID = null;
          }

          SkeletonAnnotations.staticMoveTo(z, y, x, function() {
            SkeletonAnnotations.staticSelectNode(idToActivate, skeletonID);
          });
        });
      }
    };
  };

  /**
   * Export the currently displayed table as CSV.
   */
  ConnectorTable.prototype.exportCSV = function() {
    if (!this.connectorTable) return;
    var relation = $('#connector_relation_type' + this.widgetID + ' :selected').val();
    var header = this.connectorTable.columns().header().map(function(h) {
      return $(h).text();
    });
    var connectorRows = this.connectorTable.rows({"order": "current"}).data();
    var csv = header.join(',') + '\n' + connectorRows.map(function(row) {
      return row.join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    var skeletonIds = this.skeletonSource.getSelectedSkeletons().join('-');
    saveAs(blob, "catmaid-connectors-" + relation + "-skeleton-" +
        skeletonIds + ".csv");
  };

  /**
   * Update display based on current skeleton source content.
   */
  ConnectorTable.prototype.update = function() {
    if (this.connectorTable) {
      this.connectorTable.ajax.reload();
    }
  };

  // Export widget
  CATMAID.ConnectorTable = ConnectorTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'connector-table',
    creator: ConnectorTable
  });

})(CATMAID);
