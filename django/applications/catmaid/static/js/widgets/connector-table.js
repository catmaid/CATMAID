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
    this.idPrefix = `connector-table${this.widgetID}-`;

    // This skeleton source takes care of internal skeleton management. It is
    // not registered. It is the input skeleton sink, but the output is handled
    // with a second soucre
    var update = this.update.bind(this);
    this.skeletonSource = new CATMAID.BasicSkeletonSource(this.getName() + " Input", {
      register: false,
      handleAddedModels: update,
      handleChangedModels: update,
      handleRemovedModels: update
    });
    // A skeleton source to collect results in
    this.resultSkeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this
    });

    // The displayed data table
    this.connectorTable = null;

    // Wi1l keep an up-to-date mapping of connector tags
    this.connectorTags = null;

    // A set of filter rules to apply to the handled connectors
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;

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
    this.skeletonSource.destroy();
    this.resultSkeletonSource.destroy();
  };

  ConnectorTable.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
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

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("id", self.idPrefix + "refresh-current-skeleton");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = this.update.bind(this);
        controls.appendChild(refresh);

        var relation = CATMAID.DOM.createSelect(
          self.idPrefix + "relation-type", [
          {title: 'Incoming connectors', value: "postsynaptic_to"},
          {title: 'Outgoing connectors', value: "presynaptic_to"},
          {title: 'Gap junction connectors', value: "gapjunction_with"},
          {title: 'Tight junction connectors', value: "tightjunction_with"},
          {title: 'Desmosome connectors', value: "desmosome_with"},
          {title: 'Abutting connectors', value: "abutting"},
          {title: 'Attachment connectors', value: "attached_to"}],
          "presynaptic_to");
        relation.onchange = this.update.bind(this);
        var relationLabel = document.createElement('label');
        relationLabel.appendChild(document.createTextNode('Type'));
        relationLabel.appendChild(relation);
        controls.appendChild(relationLabel);

        var openViewer = document.createElement('input');
        openViewer.setAttribute('type', 'button');
        openViewer.title = 'N.B.: Filters and sorting are ignored';
        openViewer.setAttribute('value', 'Open Viewer');
        openViewer.onclick = function() {
          var connectorViewer = WindowMaker.create('connector-viewer').widget;
          connectorViewer.cache.currentConnectorType = {
            presynaptic_to: 'synaptic',
            postsynaptic_to: 'synaptic',
            gapjunction_with: 'gapjunction',
            abutting: 'other'
          }[relation.value];

          var selectedModels = self.resultSkeletonSource.getSelectedSkeletonModels();

          if (relation.value === 'postsynaptic_to') {
            connectorViewer.skelSources[1].append(selectedModels);
          } else {
            connectorViewer.skelSources[0].append(selectedModels);
          }
        };
        controls.appendChild(openViewer);

        var exportCSV = document.createElement('input');
        exportCSV.setAttribute("type", "button");
        exportCSV.setAttribute("value", "Export CSV");
        exportCSV.setAttribute("title", "Export a CSV file for the currently displayed table");
        exportCSV.onclick = this.exportCSV.bind(this);
        controls.appendChild(exportCSV);

        var applyFiltersLabel = document.createElement('label');
        var applyFilters = document.createElement('input');
        applyFilters.setAttribute("type", "checkbox");
        applyFilters.checked = true;
        applyFilters.onchange = (function(e) {
          this.applyFilterRules = e.target.checked;
          this.update();
        }).bind(this);
        applyFiltersLabel.appendChild(applyFilters);
        applyFiltersLabel.appendChild(document.createTextNode("Apply node filters"));
        applyFiltersLabel.setAttribute("title", "Whether or not to appply filters to partner nodes");
        controls.appendChild(applyFiltersLabel);
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        var self = this;

        var container = document.createElement('div');
        content.appendChild(container);

        var table = document.createElement('table');
        table.style.width = "100%";
        content.appendChild(table);

        this.connectorTable = $(table).DataTable({
          dom: "lrphtip",
          paging: true,
          order: [],
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            var relationType = $(`#${self.idPrefix}relation-type`).find(':selected').val();
            var params = {
              skeleton_ids: self.skeletonSource.getSelectedSkeletons(),
              relation_type: relationType,
              with_tags: true
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

            CATMAID.fetch(project.id +  "/connectors/links/", "POST", params)
              .then(function(result) {
                return self.filterResults(result);
              })
              .then(function(result) {
                // Store connector tags
                self.connectorTags = result.tags || {};
                // Populate table
                callback({
                  draw: data.draw,
                  recordsTotal: result.total_count,
                  recordsFiltered: result.total_count,
                  data: result.links
                });
                // Populate result skeleton source
                var models = result.links.reduce(function(o, link) {
                  var skid = link[0];
                  o[skid]  = new CATMAID.SkeletonModel(skid);
                  return o;
                }, {});
                self.resultSkeletonSource.clear();
                self.resultSkeletonSource.append(models);
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {data: 0, className: "cm-center", title: "Skeleton ID"},
            {data: 1, className: "cm-center", title: "Connector ID"},
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
            {data: 5, className: "cm-center", title: "Link confidence"},
            {
              data: 1,
              className: "cm-center",
              title: "Tags",
              render: function(data, type, row, meta) {
                var tags = self.connectorTags[data];
                return tags || '';
              },
            },
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
          var connectorId = data[1];
          SkeletonAnnotations.staticMoveToAndSelectNode(connectorId);
        }).on('init.dt', function() {
          // Add column filter inputs
          var head = $('th', this);
          if (head.length >= 8) {
            var input = document.createElement('input');
            input.setAttribute('type', 'text');
            input.setAttribute('placeholder', 'Filter tags');
            $(input).on('keyup change', function() {
              if (self.connectorTable.search() !== this.value) {
                self.connectorTable.search(this.value).draw();
              }
            });
            var tagHead = head[7];
            tagHead.appendChild(input);
          }
        });
      },
      filter: {
        rules: this.filterRules,
        update: this.update.bind(this)
      },
    };
  };

  /**
   * Apply current filter set, if any, to the input data and return a promise
   * which resolves with the filtered data.
   */
  ConnectorTable.prototype.filterResults = function(data) {
    var hasResults = data.links.length > 0;
    if (this.filterRules.length > 0 && this.applyFilterRules && hasResults) {
      // Collect skeleton models from input
      var skeletons = data.links.reduce(function(o, link) {
        var skeletonId = link[0];
        o[skeletonId] = new CATMAID.SkeletonModel(skeletonId);
        return o;
      }, {});
      var filter = new CATMAID.SkeletonFilter(this.filterRules, skeletons);
      return filter.execute()
        .then(function(filtered) {
          if (filtered.skeletons.size === 0) {
            CATMAID.warn("No skeletons left after filter application");
            data.links = [];
            return Promise.resolve(data);
          }
          // Filter links
          let links = data.links;
          let allowedNodes = new Set(Object.keys(filtered.nodes).map(function(n) {
            return parseInt(n, 10);
          }));
          data.links = links.filter(function(link) {
            let treenodeId = link[7];
            return allowedNodes.has(treenodeId);
          });
          return Promise.resolve(data);
        });
    }
    return Promise.resolve(data);
  };

  /**
   * Export the currently displayed table as CSV.
   */
  ConnectorTable.prototype.exportCSV = function() {
    if (!this.connectorTable) return;
    var relation = $(`#${this.idPrefix}relation-type`).find(':selected').val();
    var header = this.connectorTable.columns().header().map(function(h) {
      return $(h).text();
    });
    let nCols = header.length;
    let connectorRows = this.connectorTable.cells({"order": "current"})
        .render('display')
        .toArray()
        .reduce((o, c, i) => {
          if (i % nCols === 0) {
            o.push([c]);
          } else {
            o[o.length - 1].push(c);
          }
          return o;
        }, []);
    var csv = header.join(',') + '\n' + connectorRows.map(function(row) {
      return row.join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    var skeletonIds = this.skeletonSource.getSelectedSkeletons();
    saveAs(blob, `catmaid-connectors-${relation}-${skeletonIds.length}-skeletons.csv`);
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
    name: "Connector Table",
    description: "List connectors of neurons",
    key: 'connector-table',
    creator: ConnectorTable
  });

})(CATMAID);
