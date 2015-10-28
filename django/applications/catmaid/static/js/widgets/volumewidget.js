/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Manage spatial volumes with this wiefet.
   */
  var VolumeManagerWidget = function(options) {
    options = options || {};

    // Access to the displayed DataTable
    this.datatable = null;
    this.entriesPerPage = 25;
  };

  VolumeManagerWidget.prototype.getName = function() {
    return "Volume Manger";
  };

  VolumeManagerWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'volume_manager_controls',

      /**
       * Create controls to refresh volumes.
       */
      createControls: function(controls) {
        var refresh = document.createElement('button');
        refresh.appendChild(document.createTextNode('Refresh'));
        refresh.onclick = this.redraw.bind(this);
        controls.appendChild(refresh);
      },

      /**
       * Create content, which is basically a DataTable instance, getting Data
       * from the back-end.
       */
      createContent: function(container) {
        var table = document.createElement('table');
        table.style.width = "100%";
        var header = table.createTHead();
        var hrow = header.insertRow(0);
        var columns = ['Name', 'Comment', 'User', 'Creation time',
            'Editor', 'Edition time'];
        columns.forEach(function(c) {
          hrow.insertCell().appendChild(document.createTextNode(c));
        });

        container.appendChild(table);
        this.datatable = $(table).DataTable({
          lengthMenu: [[10, 25, 100, -1], [10, 25, 100, "All"]],
          ajax: {
            url: CATMAID.makeURL(project.id +  "/volumes/"),
            dataSrc: ""
          },
          columns: [
            {data: "name"},
            {data: "comment"},
            {data: "user"},
            {data: "creation_time"},
            {data: "editor"},
            {data: "edition_time"}
          ]
        });
      }

    };
  };

  /**
   * Update volume listing.
   */
  VolumeManagerWidget.prototype.redraw = function(container) {
    if (!this.datatable) {
      return;
    }
    // Get list of available volumes
    this.datatable.ajax.reload();
  };

  // A key that references this widget in CATMAID
  var widgetKey = "volume-manager-widget";

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: widgetKey,
    creator: VolumeManagerWidget
  });

  // Add an action to the tracing tool that will open this widget
  CATMAID.TracingTool.actions.push(new CATMAID.Action({
    helpText: "Manage spatial volumes",
    buttonID: "data_button_volume_manager",
    buttonName: 'volume_manager',
    iconURL: STATIC_URL_JS + 'images/volume-manager.svg',
    run: function (e) {
        WindowMaker.show(widgetKey);
        return true;
    }
  }));

})(CATMAID);
