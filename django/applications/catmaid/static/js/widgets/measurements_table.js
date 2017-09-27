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
  };

  SkeletonMeasurementsTable.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  SkeletonMeasurementsTable.prototype.constructor = SkeletonMeasurementsTable;

  $.extend(SkeletonMeasurementsTable.prototype, new InstanceRegistry());

  SkeletonMeasurementsTable.prototype.labels = ['Neuron', 'Skeleton', 'Raw cable (nm)', 'Smooth cable (nm)', 'Lower-bound cable (nm)', 'N inputs', 'N outputs', 'N presynaptic sites', 'N nodes', 'N branch nodes', 'N end nodes'];

  SkeletonMeasurementsTable.prototype.getName = function() {
    return "Measurements " + this.widgetID;
  };

  SkeletonMeasurementsTable.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "skeleton_measurements_table_controls" + this.widgetID,
      contentID: "skeleton_measurements_table" + this.widgetID,
      createControls: function(controls) {
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
      },
      createContent: function(content) {
        var headings = '<tr>' + this.labels.map(function(label) { return '<th>' + label + '</th>'; }).join('') + '</tr>';

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
      }
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
    var rows = [],
        failed = [];

    fetchSkeletons(
        Object.keys(models).map(Number),
        function(skid) {
          return django_url + project.id + '/' + skid + '/1/1/0/compact-arbor';
        },
        function(skid) { return {}; },
        function(skid, json) {
          var ap = new CATMAID.ArborParser().init('compact-arbor', json),
              arbor = ap.arbor,
              positions = ap.positions,
              raw_cable = Math.round(arbor.cableLength(positions)) | 0,
              smooth_cable = Math.round(arbor.smoothCableLength(positions, sigma)) | 0,
              lower_bound_cable = Math.round(arbor.topologicalCopy().cableLength(positions)) | 0,
              n_presynaptic_sites = ap.n_output_connectors,
              n_outputs = ap.n_outputs,
              n_inputs = ap.n_inputs,
              n_nodes = arbor.countNodes(),
              be = arbor.findBranchAndEndNodes(),
              n_branching = be.n_branches,
              n_ends = be.ends.length;
          var name = CATMAID.NeuronNameService.getInstance().getName(skid);
          rows.push([SkeletonMeasurementsTable.prototype._makeStringLink(name, skid), skid,
                     raw_cable, smooth_cable, lower_bound_cable,
                     n_inputs, n_outputs, n_presynaptic_sites,
                     n_nodes, n_branching, n_ends]);
        },
        function(skid) {
          failed.push(skid);
        },
        function() {
          fnDone(rows);
          if (failed.length > 0) {
              alert("Skeletons that failed to load: " + failed);
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

      var rows = this.table.fnGetData().filter(function(row) {
        return !to_remove.hasOwnProperty(row[1]);
      });

      this.table.clear();
      if (rows.length > 0) {
        this.table.rows.add(rows);
      }
      this.table.draw();
  };

  SkeletonMeasurementsTable.prototype.update = function() {
      var models = this.models;
      this.clear();
      this.append(models);
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

  SkeletonMeasurementsTable.prototype.init = function() {
    if (this.table) this.table.destroy();

    var n_labels = this.labels.length;

    this.table = $('table#skeleton_measurements_table' + this.widgetID).DataTable({
        destroy: true,
        dom: '<"H"lr>t<"F"ip>',
        processing: true,
        // Enable sorting locally, and prevent sorting from calling the
        // fnServerData to reload the table -- an expensive and undesirable
        // operation.
        serverSide: false,
        autoWidth: false,
        pageLength: -1,
        lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
        jQueryUI: true,
        columns: this.labels.map((function() {
          return this;
        }).bind({
          searchable: true,
          sortable: true
        })),
        createdRow: function(row, data, index) {
          row.dataset.skeletonId = data[1];
        }
    }).on('draw.dt', (function() {
      this.highlightActiveSkeleton();
    }).bind(this));
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
    var skeletonRows = this.table.rows({search: 'applied'}).data();
    var csv = this.labels.join(',') + '\n' + skeletonRows.map(function(row) {
      return '"' + $(row[0]).text() + '",' + row.slice(1).join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, "skeleton_measurements.csv");
  };

  /**
   * Export the currently displayed measurmenent table as XLSX file using jQuery DataTables.
   */
  SkeletonMeasurementsTable.prototype.exportXLSX = function() {
    var data = this.table ? this.table.rows({search: 'applied'}).data().toArray() : [];
    if (0 === data.length) {
      CATMAIR.error("Please load some data first.");
      return;
    }
    // Create a new array that contains entries for each line. Pre-pulate with
    // first element (empty upper left cell). Unfortunately, an empty string
    // doesn't work correctly, and some content has to be provided.
    var lines = [];

    // Add header
    lines.push(this.labels.slice(0));

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
