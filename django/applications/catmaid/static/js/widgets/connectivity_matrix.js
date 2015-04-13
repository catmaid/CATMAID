/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var ConnectivityMatrixWidget = function() {
    this.widgetID = this.registerInstance();
    this.matrix = new CATMAID.ConnectivityMatrix();
    this.rowDimension = new CATMAID.BasicSkeletonSource(this.getName() + " Rows");
    this.colDimension = new CATMAID.BasicSkeletonSource(this.getName() + " Columns");
    // Synapse counts are only displayed if they are at least that big
    this.synapseThreshold = 1;
  };

  ConnectivityMatrixWidget.prototype = {};
  $.extend(ConnectivityMatrixWidget.prototype, new InstanceRegistry());

  // Make connectivity matrix widget available in CATMAID namespace
  CATMAID.ConnectivityMatrixWidget = ConnectivityMatrixWidget;

  /* Implement interfaces */

  ConnectivityMatrixWidget.prototype.getName = function()
  {
    return "Connectivity Matrix " + this.widgetID;
  };

  /**
   * Handle destruction of widget.
   */
  ConnectivityMatrixWidget.prototype.destroy = function() {
    NeuronNameService.getInstance().unregister(this);
    this.content = null;
    this.rowDimension.destroy();
    this.colDimension.destroy();
    this.unregisterInstance();
  };

  /* Non-interface methods */

  /**
   * Create an object with all relevant information for creating a CATMAID
   * widget. All methods can expect to be executed in the context of this
   * object.
   */
  ConnectivityMatrixWidget.prototype.getWidgetConfiguration = function() {
    return {
      class: 'connectivity_matrix',
      controlsID: 'connectivity_matrix_controls' + this.widgetID,
      contentID: 'connectivity_matrix' + this.widgetID,

      /**
       * Create widget controls.
       */
      createControls: function(controls) {
        // Create hidden select elements for row and column sources
        var rowSelect = CATMAID.skeletonListSources.createSelect(this.rowDimension);
        rowSelect.style.display = 'none';
        controls.appendChild(rowSelect);
        var colSelect = CATMAID.skeletonListSources.createSelect(this.colDimension);
        colSelect.style.display = 'none';
        controls.appendChild(colSelect);

        // This UI combines two skeleton source selects into one.
        controls.appendChild(document.createTextNode('From'));
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this,
           [this.rowDimension.getName(), this.colDimension.getName()]);
        controls.appendChild(sourceSelect);
        sourceSelect.onchange = function() {
          rowSelect.value = this.value;
          colSelect.value = this.value;
        };

        // Indicates if loaded skeletons should be part of a group
        var loadAsGroup = false;

        /**
         * Load rows and/or coulmns and refresh.
         */
        var loadWith = function(withRows, withCols) {
          if (loadAsGroup) {
            // Ask for group name
            askForGroupName((function(name) {
              return (!withRows || isValidGroupName(Object.keys(
                                   this.rowDimension.groups), name)) &&
                     (!withCols || isValidGroupName(Object.keys(
                                   this.colDimension.groups), name));
            }).bind(this), (function(groupName) {
              if (withRows) this.rowDimension.loadAsGroup(groupName);
              if (withCols) this.colDimension.loadAsGroup(groupName);
              if (withRows || withCols) this.update();
            }).bind(this));
          } else {
            if (withRows) this.rowDimension.loadSource();
            if (withCols) this.colDimension.loadSource();
            if (withRows || withCols) this.update();
          }
        };

        var asGroupCb = document.createElement('input');
        asGroupCb.setAttribute('type', 'checkbox');
        asGroupCb.checked = loadAsGroup;
        asGroupCb.onclick = function() {
          loadAsGroup = this.checked;
        };
        var asGroup = document.createElement('label');
        asGroup.appendChild(asGroupCb);
        asGroup.appendChild(document.createTextNode('As group'));
        controls.appendChild(asGroup);

        var loadRows = document.createElement('input');
        loadRows.setAttribute("type", "button");
        loadRows.setAttribute("value", "Append rows");
        loadRows.onclick = loadWith.bind(this, true, false);
        controls.appendChild(loadRows);

        var loadColumns = document.createElement('input');
        loadColumns.setAttribute("type", "button");
        loadColumns.setAttribute("value", "Append columns");
        loadColumns.onclick = loadWith.bind(this, false, true);
        controls.appendChild(loadColumns);

        var loadAll = document.createElement('input');
        loadAll.setAttribute("type", "button");
        loadAll.setAttribute("value", "Append to both");
        loadAll.onclick = loadWith.bind(this, true, true);
        controls.appendChild(loadAll);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = (function() {
          if (confirm("Do you really want to clear the current selection?")) {
            this.clear();
          }
        }).bind(this);
        controls.appendChild(clear);

        var max = 20;
        var synapseThresholdSelect = document.createElement('select');
        for (var i=1; i <= max; ++i) {
          synapseThresholdSelect.options.add(
                new Option(i, i, this.synapseThreshold === i));
        }
        synapseThresholdSelect.onchange = (function(e) {
          this.synapseThreshold = e.target.value;
          this.refresh();
        }).bind(this);
        var synapseThreshold = document.createElement('label');
        synapseThreshold.appendChild(document.createTextNode('Syn. threshold'));
        synapseThreshold.appendChild(synapseThresholdSelect);
        controls.appendChild(synapseThreshold);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = this.update.bind(this);
        controls.appendChild(update);
      },

      /**
       * Create widget content.
       */
      createContent: function(container) {
        this.content = container;
        this.update();
      }
    };
  };

  /**
   * Clear all sources.
   */
  ConnectivityMatrixWidget.prototype.clear = function() {
    this.rowDimension.clear();
    this.colDimension.clear();
    this.update();
  };

  /**
   * Update names of neurons in connectivity widget.
   */
  ConnectivityMatrixWidget.prototype.updateNeuronNames = function() {
    this.refresh();
  };

  /**
   * Refresh the UI without recreating the connectivity matrix.
   */
  ConnectivityMatrixWidget.prototype.refresh = function(container) {
    // Clrear container and add new table
    $(this.content).empty();
    this.addConnectivityMatrixTable(this.matrix, this.content, this.synapseThreshold);
  };

  /**
   * Recreate the connectivity matrix and refresh the UI.
   */
  ConnectivityMatrixWidget.prototype.update = function(container) {
    if (!this.matrix) {
      return;
    }

    // Clrear container
    var $content = $(this.content);
    $content.empty();

    var nRows = this.rowDimension.orderedSkeletonIDs.length;
    var nCols = this.colDimension.orderedSkeletonIDs.length;

    // If there are now row or column skeletons, display a message and return
    if (0 === nRows && 0 === nCols) {
      this.content.dataset.msg = "Please append row and column skeletons";
      return;
    } else if (0 === nRows) {
      this.content.dataset.msg = "Please append row skeletons, " + nCols +
          " column skeletons are already available.";
      return;
    } else if (0 === nCols) {
      this.content.dataset.msg = "Please append column skeletons, " + nRows +
          " row skeletons are already available.";
      return;
    } else {
      this.content.dataset.msg = "Please wait, connectivity information is retrieved.";
    }

    // Update connectivity matrix and make sure all currently looked at
    // skeletons are known to the neuron name service.
    var nns = NeuronNameService.getInstance();
    this.matrix.setRowSkeletonIDs(this.rowDimension.orderedSkeletonIDs);
    this.matrix.setColumnSkeletonIDs(this.colDimension.orderedSkeletonIDs);
    this.matrix.refresh()
      .then(nns.registerAll.bind(nns, this, this.rowDimension.getSelectedSkeletonModels()))
      .then(nns.registerAll.bind(nns, this, this.colDimension.getSelectedSkeletonModels()))
      .then((function() {
        // Clear any message
        if (this.content.dataset.msg) delete this.content.dataset.msg;
        // Create table
        this.addConnectivityMatrixTable(this.matrix, this.content, this.synapseThreshold);
      }).bind(this));
  };

  /**
   * Add a tabular representation of the connectivity matrix to the given DOM
   * element.
   *
   * @param matrix {ConnectivityMatrix} The connectivity matrix to add.
   * @param content {DOMElement} The element to add the table to.
   * @param synThreshold {number} Maximum number of synapses not to display
   * @returns the content element passed in.
   */
  ConnectivityMatrixWidget.prototype.addConnectivityMatrixTable = function(
      matrix, content, synThreshold) {
    // Create table representation for connectivity matrix
    var table = document.createElement('table');
    table.setAttribute('class', 'partner_table');

    // Add column header, prepend one blank cell for row headers
    var colHeader = table.appendChild(document.createElement('tr'));
    colHeader.appendChild(document.createElement('th'));

    var walked = this.walkMatrix(matrix, handleColumn.bind(window, colHeader),
        handleRow.bind(window, table), handleCell);

    if (walked) {
      // Append matrix to content
      content.appendChild(table);

      // Add a handler for openening connector selections for individual partners
      $('a[partnerIDs]', table).click(function () {
        var sourceIDs = $(this).attr('sourceIDs');
        var partnerIDs = $(this).attr('partnerIDs');
        if (sourceIDs && partnerIDs) {
          sourceIDs = JSON.parse(sourceIDs);
          partnerIDs = JSON.parse(partnerIDs);
          CATMAID.ConnectorSelection.show_shared_connectors(sourceIDs, partnerIDs,
            "postsynaptic_to");
        } else {
          CATMAID.error("Could not find partner or source IDs!");
        }

        return true;
      });
    }

    return content;

    // Create column
    function handleColumn(tableHeader, id, colGroup, name) {
      var th = document.createElement('th');
      th.appendChild(document.createTextNode(name));
      th.setAttribute('colspan', 2);
      if (colGroup) {
        th.setAttribute('title', 'This colGroup contains ' + colGroup.length +
            ' skeleton(s): ' + colGroup.join(', '));
      }
      tableHeader.appendChild(th);
    }

    // Create row
    function handleRow(table, id, rowGroup, name) {
      var row = document.createElement('tr');
      table.appendChild(row);
      var th = document.createElement('th');
      th.appendChild(document.createTextNode(name));
      if (rowGroup) {
        th.setAttribute('title', 'This rowGroup contains ' + rowGroup.length +
            ' skeleton(s): ' + rowGroup.join(', '));
      }
      row.appendChild(th);
      return row;
    }

    // Create cell
    function handleCell(row, rowSkids, colSkids, connections) {
      var tdIn = createSynapseCountCell(rowSkids, colSkids, connections[0], synThreshold);
      var tdOut = createSynapseCountCell(colSkids, rowSkids, connections[1], synThreshold);
      row.appendChild(tdIn);
      row.appendChild(tdOut);
    }
  };

  /**
   * Iterate over the current connectivity matrix and call the passed in
   * functions when a column can be created, a row can be crated and a cell can
   * be created.
   */
  ConnectivityMatrixWidget.prototype.walkMatrix = function(
      matrix, handleCol, handleRow, handleCell) {
    var nRows = matrix.getNumberOfRows();
    var nCols = matrix.getNumberOfColumns();
    if (0 === nRows || 0 === nCols) {
      return false;
    }

    var m = matrix.get();
    var nns = NeuronNameService.getInstance();

    // Get group information
    var nDisplayRows = this.rowDimension.orderedElements.length;
    var nDisplayCols = this.colDimension.orderedElements.length;

    for (var c=0; c<nDisplayCols; ++c) {
      // Get skeleton or group name
      var id = this.colDimension.orderedElements[c];
      var colGroup = this.colDimension.groups[id];
      var name = colGroup ? id : nns.getName(id);
      handleCol(id, colGroup, name);
    }
    // Add row headers and connectivity matrix rows
    var r = 0;
    for (var dr=0; dr<nDisplayRows; ++dr) {
      var c = 0;
      // Get skeleton or rowGroup name and increase row skeleton counter
      var rowId = this.rowDimension.orderedElements[dr];
      var rowGroup = this.rowDimension.groups[rowId];
      var name = rowGroup ? rowId : nns.getName(rowId);
      var row = handleRow(rowId, rowGroup, name);

      // Crete cells for each column in this row
      for (var dc=0; dc<nDisplayCols; ++dc) {
        // Aggregate group counts (if any)
        var colId = this.colDimension.orderedElements[dc];
        var colGroup = this.colDimension.groups[colId];
        var connections = aggregateMatrix(m, r, c,
            rowGroup ? rowGroup.length : 1,
            colGroup ? colGroup.length : 1);

        // Create and handle in and out cells
        var rowSkids = rowGroup ? rowGroup : [rowId];
        var colSkids = colGroup ? colGroup : [colId];
        handleCell(row, rowSkids, colSkids, connections);

        // Increase index for next iteration
        c = colGroup ? c + colGroup.length : c + 1;
      }

      // Increase index for next iteration
      r = rowGroup ? r + rowGroup.length : r + 1;
    }

    return true;
  };

  /**
   * Aggregate the values of a connectivity matrix over the specified number of
   * rows and columns, starting from the given position.
   */
  function aggregateMatrix(matrix, r, c, nRows, nCols) {
    var nr = 0, nc = 0;

    for (var i=0; i<nRows; ++i) {
      for (var j=0; j<nCols; ++j) {
        nr += matrix[r + i][c + j][0];
        nc += matrix[r + i][c + j][1];
      }
    }

    return [nr, nc];
  }

  /**
   * Create a synapse count table cell.
   */
  function createSynapseCountCell(sourceIDs, partnerIDs, count, threshold) {
    var td = document.createElement('td');
    td.setAttribute('class', 'syncount');
    if (count >= threshold) {
      // Create a links that will open a connector selection when clicked. The
      // handler to do this is created separate to only require one handler.
      var a = document.createElement('a');
      td.appendChild(a);
      a.appendChild(document.createTextNode(count));
      a.setAttribute('href', '#');
      a.setAttribute('sourceIDs', JSON.stringify(sourceIDs));
      a.setAttribute('partnerIDs', JSON.stringify(partnerIDs));
    } else {
      // Make a hidden span including the zero for semantic clarity and table exports.
      var s = document.createElement('span');
      td.appendChild(s);
      s.appendChild(document.createTextNode(count));
      s.style.display = 'none';
    }
    return td;
  }

  /**
   * Display a modal dialog to ask the user for a group name.
   */
  function askForGroupName(validGroupName, callback) {
    var options = new OptionsDialog("Group properties");
    options.appendMessage("Please choose a name for the new group.");
    var nameField = options.appendField("Name: ", "groupname-typed", "", null);
    var invalidMessage = options.appendMessage("Please choose a different name!");
    invalidMessage.style.display = "none";
    nameField.onkeyup = function(e) {
      // Show a message if this name is already taken or invalid
      var valid = validGroupName(this.value);
      invalidMessage.style.display = valid ? "none" : "block";
    };
    options.onOK = function() {
      if (!validGroupName(nameField.value)) {
        CATMAID.error("Please choose a different group name!");
        return false;
      }
      callback(nameField.value);
    };

    options.show("auto", "auto", true);
  }

  /**
   * Test if a group name is valid, based on a list of existing group names.
   */
  function isValidGroupName(existingNames, name) {
    return -1 === existingNames.indexOf(name);
  }

})(CATMAID);
