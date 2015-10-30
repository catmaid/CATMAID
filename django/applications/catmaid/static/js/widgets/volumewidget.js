/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  // Register DOM elements for different views
  var VolumeList = document.registerElement('volume-list');
  var VolumeProperties = document.registerElement('volume-properties');

  /**
   * Manage spatial volumes with this wiefet.
   */
  var VolumeManagerWidget = function(options) {
    options = options || {};

    // Access to the displayed DataTable
    this.datatable = null;
    this.entriesPerPage = options.entriesPerPage || 25;
    // Default volume type
    this.defaultVolumeType = options.defaultVolumeType || "box";
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

        var add = document.createElement('button');
        add.appendChild(document.createTextNode('Add new volume'));
        add.onclick = this.addVolume.bind(this);
        controls.appendChild(add);
      },

      contentID: 'volume_manger_content',

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

        var tableContainer = document.createElement('volume-list');
        tableContainer.appendChild(table);
        container.appendChild(tableContainer);
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

  /**
   * Add a new  volume. Edit it its properties directly in the widget.
   */
  VolumeManagerWidget.prototype.addVolume = function() {
    var $content = $('#volume_manger_content');
    // Hide table
    $("volume-list", $content).hide();

    // Display inline editor for properties of new volume
    var $addContent =$(document.createElement('volume-properties'));
    $addContent.addClass('settings-container');

    var vid = this.datatable ? this.datatable.length + 1 : 1;
    var volumeType = volumeTypes[this.defaultVolumeType];
    if (!volumeType) {
      throw CATMAID.ValueError("Couldn't find volume type: " +
          this.defaultVolumeType);
    }
    var volume = volumeType.createVolume({});

    var title = function(e) { volume.title = this.value; };
    var comment = function(e) { volume.comment = this.value; };
    $addContent.append(CATMAID.DOM.createSelectSetting("Type",
        { "box": "Box" }, "The geometry type of this volume."));

    $addContent.append(CATMAID.DOM.createInputSetting("Name", volume.title,
        "This name will be used whereever CATMAID refers to this volume in " +
        "its user interface.", title));

    $addContent.append(CATMAID.DOM.createInputSetting("Comment", volume.comment,
        "Additional information regarding this volume.", comment));

    $addContent.append(volumeType.createSettings(volume));

    var self = this;
    $addContent.append($('<div class="clear" />'));
    $addContent.append($('<div />')
        .append($('<button>Cancel</Cancel>')
          .on('click', function(e) {
            // Show table
            $("volume-list", $content).show();
            $("volume-properties", $content).remove();
          }))
        .append($('<button>Save</Cancel>')
          .on('click', function(e) {
            volume.save();
            // Show table, remove volume settings
            $("volume-list", $content).show();
            $("volume-properties", $content).remove();
            self.redraw()
          })))

    $content.append($addContent);
  };

  function close() {

  };

  var volumeTypes = {
    "box": {
      name: "Box",
      createSettings: function(volume) {
        var minX = function(e) { volume.minX = this.value; };
        var minY = function(e) { volume.minY = this.value; };
        var minZ = function(e) { volume.minZ = this.value; };
        var maxX = function(e) { volume.maxX = this.value; };
        var maxY = function(e) { volume.maxY = this.value; };
        var maxZ = function(e) { volume.maxZ = this.value; };
        var $settings = $('<div />');
        var $content = CATMAID.DOM.addSettingsContainer($settings,
            "Box settings", false);
        $content.append(CATMAID.DOM.createInputSetting("Min X", volume.minX,
              "X coordinate of the boxes minimum corner.", minX));
        $content.append(CATMAID.DOM.createInputSetting("Min Y", volume.minY,
              "Y coordinate of the boxes minimum corner.", minY));
        $content.append(CATMAID.DOM.createInputSetting("Min Z", volume.minZ,
              "Z coordinate of the boxes minimum corner.", minZ));
        $content.append(CATMAID.DOM.createInputSetting("Max X", volume.maxX,
              "X coordinate of the boxes maximum corner.", maxX));
        $content.append(CATMAID.DOM.createInputSetting("Max Y", volume.maxY,
              "Y coordinate of the boxes maximum corner.", maxY));
        $content.append(CATMAID.DOM.createInputSetting("Max Z", volume.maxZ,
              "Z coordinate of the boxes maximum corner.", maxZ));

        return $settings;
      },
      createVolume: function(options) {
        return new CATMAID.BoxVolume(options);
      }
    }
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
