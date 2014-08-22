/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  function IlastikTools() {
    this.widgetID = this.registerInstance();
    this.positions = [];
    this.$data_container = null;
  }

  IlastikTools.prototype = {};
  $.extend(IlastikTools.prototype, new InstanceRegistry());

  IlastikTools.prototype.getWidgetConfiguration = function() {
    return {
      createContent: function(content) {
        var $container = $(content);

        // Check for the various File API support.
        if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
          $container.text('The File APIs are not fully supported in this browser.');
          return;
        }

        // Add form elements for user input
        var fileInput = $('<input />').attr('type', 'file');
        $container.append(fileInput);

        fileInput.on('change', (function(evt) {
          var files = evt.target.files;
          for (var i=0; i<files.length; ++i) {
            this.addFile(files[i]);
          }
        }).bind(this));

        this.$data_container = $('<div />');
        $container.append(this.$data_container);
      }
    };
  };

  IlastikTools.prototype.getName = function() {
    return "Ilastik tools " + this.widgetID;
  };

  /**
   * Remove all Ilastik layers, when destroyed.
   */
  IlastikTools.prototype.destroy = function() {
    project.getStackViewers().forEach((function(s) {
      s.removeLayer("ilastik" + this.widgetID);
    }).bind(this));
  };

  /**
   * Reads a file from a file object and tries to parse it as CSV file generated
   * by Ilastik.
   */
  IlastikTools.prototype.addFile = function(file) {
    if (!file) {
      return;
    }

    // Only process text files
    if (!file.type.match('text.*')) {
      CATMAID.warn('Please provide a valid text file!');
      return;
    }

    // Helper to check if an array (CSV line) has 17 elements
    function not_17_elements(line) {
      return 17 !== line.length;
    }

    var reader = new FileReader();

    reader.onload = (function(e) {
      // Try to parse content as CSV
      var csv = $.csv.toArrays(e.target.result, {separator: '\t'});
      if (csv && csv.length > 0) {
        this.positions = [];
        if (csv.some(not_17_elements)) {
          alert('Not all lines of the CSV file have 17 elements!');
        } else {
          this.positions = csv;
          this.recreateLayers();
        }
      } else {
        alert('No data to import!');
      }
      this.update_ui();
    }).bind(this);

    reader.readAsText(file);
  };

  /**
   * Recreates layers for the currently loaded data in all open stacks.
   */
  IlastikTools.prototype.recreateLayers = function() {
    // Remove existing layers
    project.getStackViewers().forEach((function(s) {
      s.removeLayer("ilastik" + this.widgetID);
    }).bind(this));

    // Create and  new layers
    project.getStackViewers().forEach((function(s) {
      s.addLayer("ilastik" + this.widgetID, new CATMAID.IlastikDataLayer(s, this.positions));
      s.redraw();
    }).bind(this));
  };

  /**
   * Recreates the user interface.
   */
  IlastikTools.prototype.update_ui = function() {
    this.$data_container.empty();

    // Add resolution input fields
    var xRes = $('<input />').attr('type', 'text').val('4.0');
    var yRes = $('<input />').attr('type', 'text').val('4.0');
    var zRes = $('<input />').attr('type', 'text').val('45.0');
    this.$data_container.append($('<p />')
        .append($('<label />').text('X resolution:').append(xRes))
        .append($('<label />').text('Y resolution:').append(yRes))
        .append($('<label />').text('Z resolution:').append(zRes)));

    // Add some explanative text
    this.$data_container.append($('<p />')
        .text('S: Synapse, N: Node, NC: Nearest connector'));

    // Add result table
    this.$data_container.append('<table cellpadding="0" cellspacing="0" ' +
        'border="0" class="display" id="ilastik_result' + this.widgetID +
        '"></table>' );

    var table = $('#ilastik_result' + this.widgetID).dataTable({
      "aaData": this.positions,
      "aoColumns": [
        { "sTitle": "S ID" },
        { "sTitle": "S X" },
        { "sTitle": "S Y" },
        { "sTitle": "S Z" },
        { "sTitle": "Size" },
        { "sTitle": "Distance" },
        { "sTitle": "Uncertainity" },
        { "sTitle": "N ID" },
        { "sTitle": "N X" },
        { "sTitle": "N Y" },
        { "sTitle": "N Z" },
        { "sTitle": "N Count" },
        { "sTitle": "NC ID" },
        { "sTitle": "NC Distance [nm]" },
        { "sTitle": "NC X [nm]" },
        { "sTitle": "NC Y [nm]" },
        { "sTitle": "NC Z [nm]" },
      ]
    });


    // Double-clicking on a row jumps to position
    $('#ilastik_result' + this.widgetID).on('dblclick', 'td', function() {
      var $tr = $(this).parent();
      // Highlight column
      $(table).find('tr').removeClass('gradeA');
      $tr.addClass('gradeA');
      // Get data
      var data = [];
      $tr.find('td').each(function() {
        data.push($(this).html());
      });
      // Expect coordinates in 2., 3. and 4. column. These coordinates are in
      // stack coordinats (of the stack where synapses where searched for in) and
      // have to be converted to project space.
      var x = parseFloat(data[1]) * parseFloat(xRes.val());
      var y = parseFloat(data[2]) * parseFloat(yRes.val());
      var z = parseFloat(data[3]) * parseFloat(zRes.val());
      project.moveTo(z, y, x);
    });
  };

  // Export widget
  CATMAID.IlastikTools = IlastikTools;

  CATMAID.registerWidget({
    key: "ilastik-tools",
    creator: IlastikTools
  });

})(CATMAID);
