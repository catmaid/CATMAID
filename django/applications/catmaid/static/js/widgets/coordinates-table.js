/* global
  CATMAID,
  InstanceRegistry,
  project,
  WindowMaker,
*/

(function(CATMAID) {

  "use strict";

  var CoordinatesTable = function() {
    this.widgetID = this.registerInstance();
    this.rows = [];
    this.titleRow = undefined;
    this.xField = 0;
    this.yField = 1;
    this.zField = 2;
    this.gui = new this.GUI(this);
  };

  $.extend(CoordinatesTable.prototype, new InstanceRegistry());

  CoordinatesTable.prototype.getName = function() {
    return "Coordinates " + this.widgetID;
  };

  CoordinatesTable.prototype.getWidgetConfiguration = function() {
    return {
      class: "coordinates-table",
      subscriptionSource: [this],
      createControls: function(buttons) {
        var self = this;

        var fileButton = buttons.appendChild(CATMAID.DOM.createFileButton(
            'ct-file-dialog-' + this.widgetID, false, function(evt) {
              self.loadFromCSVFile(evt.target.files);
            }));
        var open = document.createElement('input');
        open.setAttribute("type", "button");
        open.setAttribute("value", "Open CSV");
        open.onclick = function() { fileButton.click(); };
        buttons.appendChild(open);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        buttons.appendChild(clear);
      },
      createContent: function(content) {
        var self = this;
        var tab = document.createElement('table');
        tab.setAttribute("id", "coordinates-table" + this.widgetID);
        tab.setAttribute("class", "coordinates-table");
        tab.innerHTML =
            '<thead>' +
              '<tr>' +
                '<th></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
            '</tbody>';
        content.appendChild(tab);
      },
      init: function(win, options) {},
      helpPath: 'coordinates-table.html',
    };
  };

  CoordinatesTable.prototype.destroy = function() {
    this.clear();
    this.unregisterInstance();
  };

  CoordinatesTable.prototype.clear = function(source_chain) {
    this.gui.clear();
  };

  CoordinatesTable.prototype.loadFromCSVFile = function(files) {
    if (!CATMAID.containsSingleValidFile(files, 'csv')) {
      return Promise.reject();
    }
    let csvFile = files[0];
    let nLinesToSkip = 0;
    var self = this;

    return CATMAID.parseCSVFile(csvFile, ',', nLinesToSkip)
      .then(function(csvLines) {
        if (csvLines.length === 0) {
          CATMAD.warn('CSV file does not contain any usable lines');
          return;
        }

        // Show dialog with first three lines
        let dialog = new CATMAID.OptionsDialog("Import CSV");
        dialog.appendMessage("The first two lines of the file you are going to " +
            "import are shown below. Please select the appropriate import options.");
        let tableContainer = document.createElement('div');
        tableContainer.classList.add('help');
        let table = document.createElement('table');
        table.style.width = "100%";
        let nPreviewRows = csvLines.length > 1 ? 2 : 1;
        for (var i=0; i<nPreviewRows; ++i) {
          let tr = document.createElement('tr');
          let data = csvLines[i];
          for (var j=0; j<data.length; ++j) {
            let td = document.createElement('td');
            td.appendChild(document.createTextNode(data[j]));
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        tableContainer.appendChild(table);
        dialog.appendChild(tableContainer);

        // Get maximum column number from first row
        var nColumns = csvLines[0].length;

        var titleRowField = dialog.appendNumericField(
          'Title row index (if any; 1 indexed)', 'csv-import-title-line',
          1, 1, csvLines.length -1, 1);

        // Add option to change line skipping
        var lineSkipField = dialog.appendNumericField(
            'Skip first n lines', 'csv-import-line-skip',
            1, 0, csvLines.length - 1, 1);

        var xField = dialog.appendNumericField(
            'X coordinate column (1 indexed)', 'csv-import-x-col',
            1, 1, nColumns, 1);
        var yField = dialog.appendNumericField(
            'Y coordinate column (1 indexed)', 'csv-import-y-col',
            2, 1, nColumns, 1);
        var zField = dialog.appendNumericField(
            'Z coordinate column (1 indexed)', 'csv-import-z-col',
            3, 1, nColumns, 1);

        dialog.onOK = function() {
          let titleRowIndex = parseInt(titleRowField.value, 10);
          let lineSkip = parseInt(lineSkipField.value, 10);
          if ((csvLines.length - lineSkip) <= 0) {
            CATMAD.warn('CSV file does not contain any usable lines');
            return;
          }

          var titleRow = undefined;
					var ix = xField.value -1,
						  iy = yField.value -1,
						  iz = zField.value -1;

          // Make sure all rows have at least 3 coordinates with valid numeric values
          var validRows = csvLines.filter(function(row, i) {
            if (i === titleRowIndex -1) {
              titleRow = row;
            }
            if (i < lineSkip) {
              return false;
            }
						console.log(row);
						console.log(ix, iy, iz);
            let x = parseFloat(row[ix]), // 1-based
                y = parseFloat(row[iy]),
                z = parseFloat(row[iz]);
						console.log("x, y, z: ", x, y, z);
            if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
              console.log("Skipping line with non-numeric coordinates: row index " + i + " with columns:\n" + row.join(", "));
              return false;
            }
            row[ix] = x;
            row[iy] = y;
            row[iz] = z;
            return true;
          });

          if (validRows.length === 0) {
            CATMAID.warn('CSV file does not contain any usable lines');
            return;
          }

          self.setData(titleRow, validRows, ix, iy, iz);
        };

        dialog.show('800', 'auto');
      })
      .catch(CATMAID.handleError);
  };

  CoordinatesTable.prototype.setData = function(titleRow, rows, xField, yField, zField) {
    if (this.rows && this.rows.length > 0) {
      if (!confirm("Remove all rows and replace with new ones?")) {
        return;
      }
    }

    this.titleRow = titleRow;
		this.rows = rows;
    this.xField = xField;
    this.yField = yField;
    this.zField = zField;

    // Refresh the datatable
    this.gui.clear();
    this.gui.init();
  };

  CoordinatesTable.prototype.GUI = function(table) {
    this.table = table;
    this.datatable = null;
    this.page = 0;
    this.order = [[0, 'asc']];
    this.entriesPerPage = 25;
  };

  CoordinatesTable.prototype.GUI.prototype = {};

  CoordinatesTable.prototype.GUI.prototype.clear = function() {
    if (this.datatable) {
      // Reset pagination
      this.datatable.page(0);
    }
    this.update();
  };

  CoordinatesTable.prototype.GUI.prototype.update = function() {
    this.init();
  };

  CoordinatesTable.prototype.GUI.prototype.getTableInfo = function() {
    // Could show amount when filtered, etc.
    return "Number of rows: " + this.table.rows.length;
  };

  /**
   * Remove all and initialize a new datatable that gets its content from the
   * widget.
   */
  CoordinatesTable.prototype.GUI.prototype.init = function() {
    // Update GUI state
    var widgetID = this.table.widgetID;

    // Remember number of entries on page and destroy table, if it exists.
    var tableSelector = "table#coordinates-table" + widgetID;
    if ($.fn.DataTable.isDataTable(tableSelector)) {
      var datatable = $(tableSelector).DataTable();
      if (datatable) {
        this.page = datatable.page();
        this.entriesPerPage = datatable.page.len();
        this.order = datatable.order(); // TODO this is in CoordinatesTable, not in GUI. Error is in SelectionTable as well
        datatable.destroy();
      }
    }
    this.datatable = null;

    // Prepare titles for columns
    // First column is the index
    var columnProps = [{"title": ""}];
    if (this.table.titleRow) {
      columnProps = columnProps.concat(this.table.titleRow.map(function(name) {
				return {"title": name};
			}));
    } else {
      let names = new Array(this.table.rows[0].length).fill({"title": "", "type": "text"});
      let e = names[this.table.xField];
      e.title = "X";
      t.type = "numeric";
      e = names[this.table.yField];
      e.title = "Y";
      t.type = "numeric";
      e = names[this.table.yField];
      e.title = "Y";
      t.type = "numeric";
      columProps = columnProps.concat(names);
    }

    // Prepare row data for display in the table: prepend the index
    var rowData = this.table.rows.map(function(row, i) {
      return [i+1].concat(row);
    });

    this.datatable = $("table#coordinates-table" + widgetID ).DataTable({
      destroy: true,
      dom: "lrptip",
      paging: true,
      //infoCallback: this.getTableInfo.bind(this),
      displayStart: this.entriesPerPage * this.page,
      pageLength: this.entriesPerPage,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      autoWidth: false,
      order: this.order,
      orderCellsTop: true,
      columns: columnProps,
      data: rowData
		});

    var self = this;

    // Click on a row to go to the coordinate
    this.datatable.on('click', 'tbody tr', function() {
      let row = self.datatable.row(this).data();
      project.moveTo(row[self.table.zField + 1], row[self.table.yField + 1], row[self.table.zField + 1]);
    })
  };

  // Export coordinates table
  CATMAID.CoordinatesTable = CoordinatesTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Coordinates Table",
    description: "Manage lists of coordinates",
    key: 'coordinates-table',
    creator: CoordinatesTable
  });

})(CATMAID);
