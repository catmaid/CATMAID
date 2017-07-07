/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Show reconstruction progress of individual neuron over time, making use of
   * history information if available.
   */
  var NeuronHistoryWidget = function() {
    this.widgetID = this.registerInstance();
    var refresh = this.refresh.bind(this);
    this.skeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      handleAddedModels: refresh,
      handleChangedModels: refresh,
      handleRemovedModels: refresh
    });
    // The maximum allowed inacitivty time (minutes)
    this.maxInactivityTime = 3;
    // Will store a datatable instance
    this.table = null;

    CATMAID.skeletonListSources.updateGUI();
  };

  NeuronHistoryWidget.prototype = new InstanceRegistry();
  NeuronHistoryWidget.prototype.constructor = NeuronHistoryWidget;

  NeuronHistoryWidget.prototype.getName = function() {
    return "Neuron History " + this.widgetID;
  };

  NeuronHistoryWidget.prototype.destroy = function() {
    this.unregisterInstance();
    this.skeletonSource.destroy();
  };

  NeuronHistoryWidget.prototype.getWidgetConfiguration = function() {
    return {
      createControls: function(controls) {
        var self = this;
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this.skeletonSource);
        controls.appendChild(sourceSelect);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Append");
        add.onclick = this.skeletonSource.loadSource.bind(this.skeletonSource);
        controls.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        controls.appendChild(clear);

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = this.refresh.bind(this);
        controls.appendChild(refresh);
      },
      createContent: function(content) {
        var self = this;
        var container = document.createElement('div');
        content.appendChild(container);

        var message = document.createElement('p');
        message.appendChild(document.createTextNode("This widget shows " +
          "information on the reconstruction progress of individual neurons " +
          "over time. Some information (splits and merges) is only available " +
          "if history tracking was enabled during reconstruction."));

        var table = document.createElement('table');
        table.style.width = "100%";
        content.appendChild(table);

        this.table = $(table).DataTable({
          dom: "lrphtip",
          paging: true,
          order: [],
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            // Compile skeleton statistics and call datatables with results.
            self.getNeuronStatistics()
              .then(function(data) {
                callback({
                  draw: data.draw,
                  recordsTotal: data.length,
                  recordsFiltered: data.length,
                  data: data
                });
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {className: "cm-center", title: "Skeleton ID", data: "skeletonId"},
            {title: "Tracing time", data: "tracingTime"},
            {title: "Review time", data: "reviewTime"},
            {title: "Cable before review", data: "cableBeforeReview"},
            {title: "Cable after review", data: "cableAfterReview"},
            {title: "Connectors before review", data: "connBeforeReview"},
            {title: "Connectors after review", data: "connAfterReview"},
            {title: "Splits during review", data: "splitsDuringReview"},
            {title: "Merges during review", data: "mergesDuringReview"},
          ]
        });
      }
    };
  };

  /**
   * Return a promise that resolves with a list of objects, where each
   * represents a set of statistics for a neuron. These statistics are:
   *
   * Tracing time:  sum of all active bouts of create/edit events by all users
   * Review time:   sum of all active bouts of review events by all users
   * Cable before:  cable length before first review event
   * Cable after:   cable length after last review event
   * Conn. before:  number of connectors before first review event
   * Conn. after:   number of connectors after last review event
   * Review splits: Number of splits between first and last review event
   * Review merges: Number of merges between first and last review event
   *
   * @returns Promise instance resolving in above statistics for each skeleton
   *          in this widget's skeleton source.
   */
  NeuronHistoryWidget.prototype.getNeuronStatistics = function() {
    return Promise.resolve([]);
  };

  NeuronHistoryWidget.prototype.clear = function() {
    this.skeletonSource.clear();
    this.refresh();
  };

  NeuronHistoryWidget.prototype.refresh = function() {
    if (this.table) {
      this.table.ajax.reload();
    }
  };

  // Export widget
  CATMAID.NeuronHistoryWidget = NeuronHistoryWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'neuron-history',
    creator: NeuronHistoryWidget
  });

})(CATMAID);
