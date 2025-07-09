/* global
  CATMAID,
  InstanceRegistry,
  project
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
    this.notes = []; // Store notes per row
    this.gui = new this.GUI(this);
  };

  var style = document.createElement('style');
  style.textContent = ".ct-row-touched { background: #ffeeba !important; }";
  document.head.appendChild(style);


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

        // Save CSV button
        var saveBtn = document.createElement("button");
        saveBtn.textContent = "Save as CSV";
        saveBtn.id = "ct-save-csv-btn-" + this.widgetID;
        saveBtn.style.margin = "8px";
        saveBtn.onclick = function() {
          self.exportCSV();
        };
        content.insertBefore(saveBtn, tab);
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
    this.notes = [];
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

          var titleRow;
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
            let x = parseFloat(row[ix]), // 1-based
                y = parseFloat(row[iy]),
                z = parseFloat(row[iz]);
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
    this.notes = new Array(rows.length).fill(""); // Reset notes

    // Refresh the datatable
    this.gui.clear();
    this.gui.init();
  };

  CoordinatesTable.prototype.exportCSV = function() {
    var widgetID = this.widgetID;
    var tableSel = "#coordinates-table" + widgetID;

    // Get table headers
    var headers = [];
    $(tableSel + " thead tr th").each(function() {
      headers.push($(this).text());
    });
    headers.push("Notes");

    // Collect data for export
    var csvRows = [headers.join(",")];

    var self = this;
    $(tableSel + " tbody tr").each(function(i) {
      var row = [];
      $(this).find("td").each(function(idx) {
        var $cell = $(this);
        // If it's the last column, add notes
        if (idx === $(this).parent().find('td').length - 1) {
          var note = $cell.find("input.ct-note").val() || "";
          row.push('"' + note.replace(/"/g, '""') + '"');
        } else {
          row.push('"' + ($cell.text().trim().replace(/"/g, '""')) + '"');
        }
      });
      csvRows.push(row.join(","));
    });

    // Download CSV
    var csvString = csvRows.join("\n");
    var blob = new Blob([csvString], { type: "text/csv" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'coordinates_with_notes.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 50);
  };

  // === GUI modifications to add the Notes column ===

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
      this.datatable.page(0);
    }
    this.update();
  };

  CoordinatesTable.prototype.GUI.prototype.update = function() {
    this.init();
  };

  CoordinatesTable.prototype.GUI.prototype.getTableInfo = function() {
    return "Number of rows: " + this.table.rows.length;
  };

CoordinatesTable.prototype.GUI.prototype.init = function() {
  var widgetID = this.table.widgetID;
  var tableSelector = "table#coordinates-table" + widgetID;
  if ($.fn.DataTable.isDataTable(tableSelector)) {
    var datatable = $(tableSelector).DataTable();
    if (datatable) {
      this.page = datatable.page();
      this.entriesPerPage = datatable.page.len();
      this.order = datatable.order();
      datatable.destroy();
    }
  }
  this.datatable = null;

  // Prepare titles for columns
  var columnProps = [{"title": ""}];
  if (this.table.titleRow) {
    columnProps = columnProps.concat(this.table.titleRow.map(function(name) {
      return {"title": name};
    }));
  } else {
    let names = new Array(this.table.rows[0].length).fill({"title": "", "type": "text"});
    let e = names[this.table.xField];
    e.title = "X";
    e.type = "numeric";
    e = names[this.table.yField];
    e.title = "Y";
    e.type = "numeric";
    e = names[this.table.yField];
    e.title = "Y";
    e.type = "numeric";
    columnProps = columnProps.concat(names);
  }
  // Add notes column
  columnProps.push({title: "Notes"});

  // Prepare row data for display: prepend index, add notes
  var self = this;
  var rowData = this.table.rows.map(function(row, i) {
    return [i+1].concat(row, [self.table.notes[i] || ""]);
  });

  this.datatable = $("table#coordinates-table" + widgetID ).DataTable({
    destroy: true,
    dom: "lrptip",
    paging: true,
    displayStart: this.entriesPerPage * this.page,
    pageLength: this.entriesPerPage,
    lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
    autoWidth: false,
    order: this.order,
    orderCellsTop: true,
    columns: columnProps,
    data: rowData
  });

  // Render input boxes in the Notes column and apply highlight if edited
  $("table#coordinates-table" + widgetID + " tbody tr").each(function(i) {
    var $notesCell = $(this).find("td").last();
    var noteVal = self.table.notes[i] || "";
    $notesCell.html('<input type="text" class="ct-note" style="width:90%" value="' + noteVal.replace(/"/g,'&quot;') + '">');
    var $row = $(this);

    // Highlight if there's a note
    if (noteVal && noteVal.trim() !== "") {
      $row.addClass('ct-row-touched');
    }

    $notesCell.find("input.ct-note").on("input", function() {
      self.table.notes[i] = $(this).val();
      if ($(this).val().trim() !== "") {
        $row.addClass('ct-row-touched');
      } else {
        $row.removeClass('ct-row-touched');
      }
    });
  });

  // Highlight row on click and move to the coordinate
  $("table#coordinates-table" + widgetID + " tbody").on("click", "tr", function() {
    $(this).addClass('ct-row-touched');
    let row = self.datatable.row(this).data();
    project.moveTo(row[self.table.zField + 1], row[self.table.yField + 1], row[self.table.xField + 1]);
  });
  };

  // Export coordinates table
  CATMAID.CoordinatesTable = CoordinatesTable;

  CATMAID.registerWidget({
    name: "Coordinates Table",
    description: "Manage lists of coordinates",
    key: 'coordinates-table',
    creator: CoordinatesTable
  });

})(CATMAID);
