/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var SkeletonMeasurementsTable = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();
  this.table = null;
  this.models = {};
  this.sigma = 200;
};

SkeletonMeasurementsTable.prototype = {};
$.extend(SkeletonMeasurementsTable.prototype, new InstanceRegistry());
$.extend(SkeletonMeasurementsTable.prototype, new SkeletonSource());

SkeletonMeasurementsTable.prototype.labels = ['Neuron', 'Skeleton', 'Raw cable (nm)', 'Smooth cable (nm)', 'Lower-bound cable (nm)', 'N inputs', 'N outputs', 'N presynaptic sites', 'N nodes', 'N branch nodes', 'N end nodes'];

SkeletonMeasurementsTable.prototype.getName = function() {
  return "Measurements " + this.widgetID;
};

SkeletonMeasurementsTable.prototype.destroy = function() {
  this.clear();
  this.table = null;
  this.unregisterInstance();
  this.unregisterSource();
  NeuronNameService.getInstance().unregister(this);
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

  NeuronNameService.getInstance().registerAll(this, new_models,
      (function() {
        this.load(new_models, this.sigma, this.table.fnAddData.bind(this.table));
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
        var ap = new ArborParser().init('compact-arbor', json),
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
        rows.push([SkeletonMeasurementsTable.prototype._makeStringLink(models[skid].baseName, skid), skid,
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
  return '<a href="#" onclick="TracingTool.goToNearestInNeuronOrSkeleton(\'skeleton\',' + skid + ');">' + name + '</a>';
};

SkeletonMeasurementsTable.prototype.clear = function() {
    if (!this.table) return;
    this.models = {};
    this.table.fnClearTable();
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

    this.table.fnClearTable();
    this.table.fnAddData(rows);
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
    return new THREE.Color().setRGB(1, 0, 1);
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

SkeletonMeasurementsTable.prototype.highlight = function(skid) {
    // TODO
};

SkeletonMeasurementsTable.prototype.init = function() {
  if (this.table) this.table.remove();

  var n_labels = this.labels.length;

  this.table = $('#skeleton_measurements_table' + this.widgetID).dataTable({
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lr>t<"F"ip>',
      // default: <"H"lfr>t<"F"ip>
      "bProcessing": true,
      "bServerSide": false, // Enable sorting locally, and prevent sorting from calling the fnServerData to reload the table -- an expensive and undesirable operation.
      "bAutoWidth": false,
      "iDisplayLength": -1,
      "aLengthMenu": [
      [-1, 10, 100, 200],
      ["All", 10, 100, 200]
      ],
      //"aLengthChange": false,
      "bJQueryUI": true,
      "aoColumns": this.labels.map((function() { return this; }).bind({bSearchable: true, bSortable: true}))
  });

  // Remove default dummy row
  this.table.fnClearTable();
};

SkeletonMeasurementsTable.prototype.updateNeuronNames = function() {
    this.table.fnGetData().forEach(function(row, i) {
        this.table.fnUpdate(this._makeStringLink(NeuronNameService.getInstance().getName(row[1]), row[1]), i, 0);
    }, this);
};

SkeletonMeasurementsTable.prototype.adjustOptions = function() {
  var od = new OptionsDialog("Parameters");
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
  var csv = this.labels.join(',') + '\n' + this.table.fnGetData().map(function(row) {
    return $(row[0]).text() + ',' + row.slice(1).join(',');
  }).join('\n'),
      blob = new Blob([csv], {type: 'text/plain'});
  saveAs(blob, "skeleton_measurements.csv");
};
