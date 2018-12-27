/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  fetchSkeletons,
  InstanceRegistry,
  project,
*/

(function(CATMAID) {

  "use strict";

  var SkeletonMeasurementsTable = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);
    this.table = null;
    this.models = {};
    this.sigma = 200;

    // A set of filter rules to apply to the handled skeletons
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;
    // A set of nodes allowed by node filters
    this.allowedNodes = new Set();
    // Whether or not skeletons show be listed that don't have any match in an
    // active node filter.
    this.showFilterUnmatchedSkeletons = false;
    // Whether or not fragments of each skeleton should be aggregated into a
    // single row.
    this.aggregateFragments = false;
  };

  SkeletonMeasurementsTable.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  SkeletonMeasurementsTable.prototype.constructor = SkeletonMeasurementsTable;

  $.extend(SkeletonMeasurementsTable.prototype, new InstanceRegistry());

  SkeletonMeasurementsTable.prototype.getLabels = function(forceAll) {
    let labels = ['Neuron', 'Skeleton',
      'Raw cable (nm)', 'Smooth cable (nm)', 'Lower-bound cable (nm)',
      'N inputs', 'N outputs', 'N presynaptic sites', 'N nodes',
      'N branch nodes', 'N end nodes'];

    if (forceAll || (this.applyFilterRules && this.filterRules.length > 0)) {
      labels.splice(2, 0, 'Fragment start', 'Fragment');
    }

    return labels;
  };

  SkeletonMeasurementsTable.prototype.getName = function() {
    return "Measurements " + this.widgetID;
  };

  SkeletonMeasurementsTable.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "skeleton_measurements_table_controls" + this.widgetID,
      contentID: "skeleton_measurements_table" + this.widgetID,
      createControls: function(controls) {
        let self = this;
        controls.appendChild(document.createTextNode('From'));
        controls.appendChild(CATMAID.skeletonListSources.createSelect(this));

        var load = document.createElement('input');
        load.setAttribute("type", "button");
        load.setAttribute("value", "Append");
        load.onclick = this.loadSource.bind(this);
        controls.appendChild(load);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        controls.appendChild(clear);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = this.update.bind(this);
        controls.appendChild(update);

        var options = document.createElement('input');
        options.setAttribute("type", "button");
        options.setAttribute("value", "Options");
        options.onclick = this.adjustOptions.bind(this);
        controls.appendChild(options);

        var csv = document.createElement('input');
        csv.setAttribute("type", "button");
        csv.setAttribute("value", "Export CSV");
        csv.onclick = this.exportCSV.bind(this);
        controls.appendChild(csv);

        var exportXLSX = document.createElement('input');
        exportXLSX.setAttribute("type", "button");
        exportXLSX.setAttribute("value", "Export XLSX");
        exportXLSX.setAttribute("title", "Export a spreadsheet file compatible to Microsoft Excel and Libre Office, colors are preserved");
        exportXLSX.onclick = this.exportXLSX.bind(this);
        controls.appendChild(exportXLSX);

        var filterRulesToggle = document.createElement('input');
        filterRulesToggle.setAttribute('id', 'connectivity-filterrules-toggle-' + this.widgetID);
        filterRulesToggle.setAttribute('type', 'checkbox');
        if (this.applyFilterRules) {
          filterRulesToggle.setAttribute('checked', 'checked');
        }
        filterRulesToggle.onchange = function() {
          self.applyFilterRules = this.checked;
          if (self.filterRules.length > 0) {
            if (this.checked) {
              self.updateFilter();
            } else {
              self.update();
            }
          }
        };
        var filterRulesLabel = document.createElement('label');
        filterRulesLabel.appendChild(filterRulesToggle);
        filterRulesLabel.appendChild(document.createTextNode('Apply node filter rules'));
        controls.appendChild(filterRulesLabel);

        var aggFragmentsToggle = document.createElement('input');
        aggFragmentsToggle.setAttribute('id', 'connectivity-filterrules-toggle-' + this.widgetID);
        aggFragmentsToggle.setAttribute('type', 'checkbox');
        if (this.aggregateFragments) {
          aggFragmentsToggle.setAttribute('checked', 'checked');
        }
        aggFragmentsToggle.onchange = function() {
          self.aggregateFragments = this.checked;
          self.update();
        };
        var aggFragmentsLabel = document.createElement('label');
        aggFragmentsLabel.appendChild(aggFragmentsToggle);
        aggFragmentsLabel.appendChild(document.createTextNode('Sum fragments'));
        aggFragmentsLabel.setAttribute('title', 'If a skeleton is split into disconnected fragments (e.g. due to a node filter), all fragments of a skeleton can be displayed as aggregated values (sums) or as individual rows.');
        controls.appendChild(aggFragmentsLabel);
      },
      createContent: function(content) {
        var headings = '<tr>' + this.getLabels(true).map(function(label) {
            return '<th>' + label + '</th>';
        }).join('') + '</tr>';

        content.innerHTML =
          '<table cellpadding="0" cellspacing="0" border="0" class="display" id="skeleton_measurements_table' + this.widgetID + '">' +
            '<thead>' + headings + '</thead>' +
            '<tfoot>' + headings + '</tfoot>' +
            '<tbody>' +
            '</tbody>' +
          '</table>';
        // ABOVE, notice the table needs one dummy row
      },
      init: function() {
        this.init();
      },
      filter: {
        rules: this.filterRules,
        update: this.updateFilter.bind(this),
      },
    };
  };

  SkeletonMeasurementsTable.prototype.destroy = function() {
    this.clear();
    this.table = null;
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
  };

  SkeletonMeasurementsTable.prototype.append = function(models) {
    // Update models and find out which ones are missing
    var new_models = {};
    Object.keys(models).forEach(function(skid) {
        var model = models[skid];
        if (this.models.hasOwnProperty(skid)) this.models[skid] = model;
        else {
            new_models[skid] = model;
            this.models[skid] = model;
        }
    }, this);

    if (0 === Object.keys(new_models).length) return;

    CATMAID.NeuronNameService.getInstance().registerAll(this, new_models,
      (function() {
        this.load(new_models, this.sigma, (function(rows) {
          this.table.rows.add(rows).draw();
        }).bind(this));
      }).bind(this));
  };

  SkeletonMeasurementsTable.prototype.load = function(models, sigma, fnDone) {
    let self = this;
    var rows = [],
        failed = [],
        unmatched = [];

    fetchSkeletons(
        Object.keys(models).map(Number),
        function(skid) {
          return CATMAID.makeURL(project.id + '/' + skid + '/1/1/0/compact-arbor');
        },
        function(skid) { return {}; },
        function(skid, json) {
          let ap = new CATMAID.ArborParser().init('compact-arbor', json),
              arbor = ap.arbor,
              positions = ap.positions,
              name = CATMAID.NeuronNameService.getInstance().getName(skid);

          // If node filtering should be performed, create required information
          // for each fragment.
          let fractionsAdded = false;
          let filterActive = self.applyFilterRules && self.filterRules.length > 0;
          if (filterActive) {
            let fractions = arbor.connectedFractions(Array.from(self.allowedNodes));
            let aggRow;
            for (let i=0; i<fractions.length; ++i) {
              let fractionArbor = fractions[i];
              let fractionArborParser = new CATMAID.ArborParser();
              fractionArborParser.arbor = fractionArbor;
              fractionArborParser.positions = positions;
              fractionArborParser.synapses(json[1], true);

              let raw_cable = Math.round(fractionArbor.cableLength(positions)) | 0,
                  smooth_cable = Math.round(fractionArbor.smoothCableLength(positions, sigma)) | 0,
                  lower_bound_cable = Math.round(fractionArbor.topologicalCopy().cableLength(positions)) | 0,
                  n_presynaptic_sites = fractionArborParser.n_output_connectors,
                  n_outputs = fractionArborParser.n_outputs,
                  n_inputs = fractionArborParser.n_inputs,
                  n_nodes = fractionArbor.countNodes(),
                  be = fractionArbor.findBranchAndEndNodes(),
                  n_branching = be.n_branches,
                  n_ends = be.ends.length;

              let fragmentRow = [SkeletonMeasurementsTable.prototype._makeStringLink(name, skid),
                  skid, fractionArbor.root, `${i+1}/${fractions.length}`,
                  raw_cable, smooth_cable, lower_bound_cable, n_inputs, n_outputs,
                  n_presynaptic_sites, n_nodes, n_branching, n_ends];
              if (self.aggregateFragments) {
                  if (aggRow) {
                    aggRow[2].push(fragmentRow[2]);
                    aggRow[3] = fragmentRow[3];
                    for (let j=4; j<fragmentRow.length; ++j) {
                      aggRow[j] += fragmentRow[j];
                    }
                  } else {
                    aggRow = fragmentRow;
                    aggRow[2] = [aggRow[2]];

                  }
              } else {
                rows.push(fragmentRow);
              }
            }

            fractionsAdded = fractions.length > 0;

            // If an aggregate row was created, add it to the result set.
            if (aggRow) {
              rows.push(aggRow);
            }
          }

          // If no fractions were added, full measurements will be added.
          if (!fractionsAdded) {
            if (filterActive) {
              unmatched.push(skid);
            }
            if (!filterActive || self.showFilterUnmatchedSkeletons) {
              let raw_cable = Math.round(arbor.cableLength(positions)) | 0,
                  smooth_cable = Math.round(arbor.smoothCableLength(positions, sigma)) | 0,
                  lower_bound_cable = Math.round(arbor.topologicalCopy().cableLength(positions)) | 0,
                  n_presynaptic_sites = ap.n_output_connectors,
                  n_outputs = ap.n_outputs,
                  n_inputs = ap.n_inputs,
                  n_nodes = arbor.countNodes(),
                  be = arbor.findBranchAndEndNodes(),
                  n_branching = be.n_branches,
                  n_ends = be.ends.length;

              rows.push([SkeletonMeasurementsTable.prototype._makeStringLink(name, skid),
                    skid, arbor.root, '1/1', raw_cable, smooth_cable, lower_bound_cable,
                    n_inputs, n_outputs, n_presynaptic_sites, n_nodes, n_branching, n_ends]);
            }
          }
        },
        function(skid) {
          failed.push(skid);
        },
        function() {
          fnDone(rows);
          if (failed.length > 0) {
              alert("Skeletons that failed to load: " + failed);
          }
          if (unmatched.length > 0) {
            CATMAID.warn(`${unmatched.length} skeleton(s) are unmatched entirely by the active node filters`);
          }
        });
  };

  SkeletonMeasurementsTable.prototype._makeStringLink = function(name, skid) {
    return '<a href="#" onclick="CATMAID.TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\',' + skid + ');">' + name + '</a>';
  };

  SkeletonMeasurementsTable.prototype.clear = function() {
      if (!this.table) return;
      this.models = {};
      this.table.clear().draw();
  };

  SkeletonMeasurementsTable.prototype.removeSkeletons = function(skids) {
      var to_remove = skids.reduce((function(o, skid) {
          if (this.models.hasOwnProperty(skid)) {
              o[skid] = true;
              delete this.models[skid];
          }
          return o;
      }).bind(this), {});

      if (0 === Object.keys(to_remove).length) return;

      var rows = this.table.data().filter(function(row) {
        return !to_remove.hasOwnProperty(row[1]);
      });

      this.table.clear();
      if (rows.length > 0) {
        this.table.rows.add(rows);
      }
      this.table.draw();
  };

  SkeletonMeasurementsTable.prototype.update = function(skipNodeFilter) {
    let nodeFiltersInUse = this.applyFilterRules && this.filterRules.length > 0;
    if (this.table) {
      this.table.column(2).visible(nodeFiltersInUse);
      this.table.column(3).visible(nodeFiltersInUse);
    }
    if (!skipNodeFilter && nodeFiltersInUse) {
      return this.updateFilter();
    } else {
      var models = this.models;
      this.clear();
      this.append(models);
    }
  };

  SkeletonMeasurementsTable.prototype.updateModels = function(models) {
      Object.keys(models).forEach(function(skid) {
          if (this.models.hasOwnProperty(skid)) this.models[skid] = models[skid];
      }, this);
  };

  SkeletonMeasurementsTable.prototype.getSkeletonColor = function(skid) {
      var model = this.models[skid];
      if (model) return model.color;
      return new THREE.Color(1, 0, 1);
  };

  SkeletonMeasurementsTable.prototype.hasSkeleton = function(skid) {
      return this.models.hasOwnProperty(skid);
  };

  SkeletonMeasurementsTable.prototype.getSelectedSkeletonModels = function() {
      return Object.keys(this.models).reduce((function(o, skid) {
          o[skid] = this.models[skid].clone();
          return o;
      }).bind(this), {});
  };

  SkeletonMeasurementsTable.prototype.getSkeletonModels = SkeletonMeasurementsTable.prototype.getSelectedSkeletonModels;

  SkeletonMeasurementsTable.prototype.getSkeletonModel = function( id ) {
    if (id in this.models) {
      return this.models[id].clone();
    }
  };

  /**
   * Will highlight the active node, if its skeleton is part of this table.
   * Otherwise, all existing highlighting will be removed.
   */
  SkeletonMeasurementsTable.prototype.highlight = function(skeletonId) {
    var table = $("table#skeleton_measurements_table" + this.widgetID);
    // Reset highlighting
    $('tbody tr', table).removeClass('highlight');
    // Add new highlighting
    if (skeletonId) {
      $('tbody tr[data-skeleton-id=' + skeletonId + ']', table).addClass('highlight');
    }
  };

  /**
   * Highlight active skeleton (if it is displayed in this widget).
   */
  SkeletonMeasurementsTable.prototype.highlightActiveSkeleton = function() {
    this.highlight(SkeletonAnnotations.getActiveSkeletonId());
  };

  let toNodelink = function(nodeId) {
    return `<a href="#" data-role="select-node" data-node-id="${nodeId}">${nodeId}</a>`;
  };

  SkeletonMeasurementsTable.prototype.init = function() {
    if (this.table) this.table.destroy();

    let nodeFiltersInUse = this.applyFilterRules && this.filterRules.length > 0;
    let labels = this.getLabels(true);
    var n_labels = labels.length;

    this.table = $('table#skeleton_measurements_table' + this.widgetID).DataTable({
        destroy: true,
        dom: '<"H"lr>t<"F"ip>',
        processing: true,
        serverSide: false,
        autoWidth: false,
        pageLength: -1,
        lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
        jQueryUI: true,
        columns: labels.map(function(title) {
          return {
            title: title,
            class: "cm-center",
            searchable: true,
            sortable: true,
          };
        }),
        columnDefs: [{
          targets: 1,
          render: function(data, type, row, meta) {
            return `<a href="#" data-role="select-skeleton">${data}</a>`;
          },
        }, {
          targets: 2,
          render: function(data, type, row, meta) {
            if (data instanceof Array) {
              return data.map(toNodelink).join(', ');
            } else {
              return `<a href="#" data-role="select-node" data-node-id="${data}">${data}</a>`;
            }
          },
        }],
        createdRow: function(row, data, index) {
          row.dataset.skeletonId = data[1];
        }
    })
    .on('draw.dt', (function() {
      this.highlightActiveSkeleton();
    }).bind(this))
    .on('click', 'a[data-role=select-node]', function() {
      let nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    })
    .on('click', 'a[data-role=select-skeleton]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', data[1]);
    });

    this.table.column(2).visible(nodeFiltersInUse);
    this.table.column(3).visible(nodeFiltersInUse);
  };

  SkeletonMeasurementsTable.prototype.updateNeuronNames = function() {
    var nns = CATMAID.NeuronNameService.getInstance();
    var self = this;
    this.table.rows().every(function(i) {
      var row = this.data();
      row[0] = self._makeStringLink(nns.getName(row[1]), row[1]);
      this.invalidate();
    });
    this.table.draw();
  };

  SkeletonMeasurementsTable.prototype.adjustOptions = function() {
    var od = new CATMAID.OptionsDialog("Parameters");
    od.appendField("Smooth skeletons by Gaussian convolution with sigma (nm): ", "SMT-sigma-" + this.widgetID, this.sigma);
    od.onOK = (function() {
      var field = $('#SMT-sigma-' + this.widgetID);
      try {
        var sigma = parseInt(field.val()) | 0;
        if (sigma < 0) return alert("Sigma must be larger than zero.");
        this.sigma = sigma;
        this.update();
      } catch (e) {
        alert("Invalid value for sigma: " + field.val());
      }
    }).bind(this);
    od.show();
  };

  SkeletonMeasurementsTable.prototype.exportCSV = function() {
    if (!this.table) return;

    var skeletonRows = [];
    let table = this.table;
    let nns = CATMAID.NeuronNameService.getInstance();
    this.table.rows({search: 'applied'}).every(function (rowIdx) {
      skeletonRows.push(table.cells(this.node(), ':visible').data().toArray());
    });

    var header = this.getLabels().map(CATMAID.tools.quote).join(',');
    var csv = header + '\n' + skeletonRows.map(function(row) {
      return '"' + $(row[0]).text() + '",' + row.slice(1).join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, "skeleton_measurements.csv");
  };

  /**
   * Export the currently displayed measurmenent table as XLSX file using jQuery DataTables.
   */
  SkeletonMeasurementsTable.prototype.exportXLSX = function() {
    var data = [];
    let table = this.table;
    let nns = CATMAID.NeuronNameService.getInstance();
    this.table.rows({search: 'applied'}).every(function (rowIdx) {
      data.push(table.cells(this.node(), ':visible').data().toArray());
    });
    if (0 === data.length) {
      CATMAIR.error("Please load some data first.");
      return;
    }
    // Create a new array that contains entries for each line. Pre-pulate with
    // first element (empty upper left cell). Unfortunately, an empty string
    // doesn't work correctly, and some content has to be provided.
    var lines = [];

    // Add header
    lines.push(this.getLabels().slice(0));

    // Add data
    data.forEach(function(row) {
      // Add a copy of the row
      var line = row.slice(0);
      line[0] = $(line[0]).text();
      this.push(line);
    }, lines);

    var now = new Date();
    var date = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay();

    CATMAID.exportXLSX(lines, {
      boldFirstRow: true,
      filename: 'catmaid-skeleton-metrics-' + date,
    });
  };

  /**
   * Reevaluate the current set of node filter rules to update the set of
   * allowed nodes.
   */
  SkeletonMeasurementsTable.prototype.updateFilter = function(options) {
    var skeletonIds = Object.keys(this.models).map(CATMAID.tools.getId, this.models);
    if (skeletonIds.length === 0 || this.filterRules.length === 0) {
      this.update(true);
      return Promise.resolve();
    }

    var self = this;
    var filter = new CATMAID.SkeletonFilter(this.filterRules, this.models);
    filter.execute()
      .then(function(filteredNodes) {
        self.allowedNodes = new Set(Object.keys(filteredNodes.nodes).map(function(n) {
          return parseInt(n, 10);
        }));
        if (0 === self.allowedNodes.length) {
          CATMAID.warn("No points left after filter application");
        }
        self.update(true);
      })
      .catch(CATMAID.handleError);
  };

  // Make measurement table available in CATMAID namespace
  CATMAID.SkeletonMeasurementsTable = SkeletonMeasurementsTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Measurements Table",
    description: "List various metrics for a set of neurons",
    key: "skeleton-measurements-table",
    creator: SkeletonMeasurementsTable
  });

})(CATMAID);
