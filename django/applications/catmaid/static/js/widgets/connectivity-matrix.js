/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var ConnectivityMatrixWidget = function() {
    this.widgetID = this.registerInstance();
    this.matrix = new CATMAID.ConnectivityMatrix();
    var update = this.update.bind(this);
    this.rowDimension = new CATMAID.BasicSkeletonSource(this.getName() + " Rows", {
      owner: this,
      handleAddedModels: update,
      handleChangedModels: update,
      handleRemovedModels: update
    });
    this.colDimension = new CATMAID.BasicSkeletonSource(this.getName() + " Columns", {
      owner: this,
      handleAddedModels: update,
      handleChangedModels: update,
      handleRemovedModels: update
    });
    // Synapse counts are only displayed if they are at least that big
    this.synapseThreshold = 1;
    // Color index for table cell coloring option, default to Greens
    var defaultIndex = colorOptions.indexOf('Greens');
    this.color = defaultIndex < 0 ? 0 : defaultIndex;
    // Sorting indices for row and columns, default to name
    this.rowSorting = 2;
    this.colSorting = 2;
    // Default to ascending sorting
    this.rowSortingDesc = false;
    this.colSortingDesc = false;
    // Rotate column headers by 90 degree
    this.rotateColumnHeaders = false;
    // Display manual order edit controls
    this.displayOrderFields = false;
    // How groups should be aggregated (sum, min, max,avg)
    this.groupAggregate = 'sum';
    // Whether or not to display connectivity counts as percentage to total
    // connectivity.
    this.relativeDisplay = false;
    // Total skeleton connectivity information for each skeleton, if enabled
    this.connectivityData = null;
    // A map of relation names to IDs, used with relativeDisplay
    this.relationMap = null;

    // A set of filter rules to apply to the handled connectors
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;
  };

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
    CATMAID.NeuronNameService.getInstance().unregister(this);
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
      subscriptionSource: [
          [this.colDimension, 'Show and hide controls for post-subscriptions'],
          [this.rowDimension, 'Show and hide controls for pre-subscriptions']
      ],

      /**
       * Create widget controls.
       */
      createControls: function(controls) {
        var self = this;
        var titles = document.createElement('ul');
        controls.appendChild(titles);
        var tabs = ['Main', 'Groups', 'Display'].reduce((function(o, name) {
          var id = name.replace(/ /, '') + this.widgetID;
          titles.appendChild($('<li><a href="#' + id + '">' + name + '</a></li>')[0]);
          var div = document.createElement('div');
          div.setAttribute('id', id);
          controls.appendChild(div);
          o[name] = div;
          return o;
        }).bind(this), {});

        // This UI combines two skeleton source selects into one.
        tabs['Main'].appendChild(document.createTextNode('From'));
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this,
           [this.rowDimension.getName(), this.colDimension.getName()]);
        tabs['Main'].appendChild(sourceSelect);
        sourceSelect.onchange = function() {
          rowSelect.value = this.value;
          colSelect.value = this.value;
        };

        // Create hidden select elements for row and column sources
        var rowSelect = CATMAID.skeletonListSources.createSelect(this.rowDimension);
        rowSelect.value = sourceSelect.value;
        rowSelect.style.display = 'none';
        tabs['Main'].appendChild(rowSelect);
        var colSelect = CATMAID.skeletonListSources.createSelect(this.colDimension);
        colSelect.value = sourceSelect.value;
        colSelect.style.display = 'none';
        tabs['Main'].appendChild(colSelect);

        // Indicates if loaded skeletons should be part of a group
        var loadAsGroup = false;

        // Do own loading confirmation
        var silent = true;
        var loadConfirm = function(widget, withRows, withCols) {
            var nSkeletonsToLoad = 0;
            if (withRows) {
              nSkeletonsToLoad += widget.rowDimension.getSourceSkeletons(silent).length;
            }
            if (withCols) {
              nSkeletonsToLoad += widget.colDimension.getSourceSkeletons(silent).length;
            }

            if (0 === nSkeletonsToLoad) {
              CATMAID.warn('No skeletons available from selected source(s)');
              return false;
            }

            // Use the row source append limit, it is expected to be the same
            // for both sources.
            var limit = widget.rowDimension.APPEND_WARNING_THRESHOLD;
            if (nSkeletonsToLoad > limit) {
              return window.confirm('This will load a large number of skeletons (' +
                  nSkeletonsToLoad + '). Are you sure you want to continue?');
            }

            return true;
        };

        /**
         * Load rows and/or coulmns and refresh.
         */
        var loadWith = function(withRows, withCols) {
          this.connectivityData = null;
          this.relationMap = null;
          if (loadAsGroup) {
            // Ask for group name
            askForGroupName((function(name) {
              return (!withRows || isValidGroupName(Object.keys(
                                   this.rowDimension.groups), name)) &&
                     (!withCols || isValidGroupName(Object.keys(
                                   this.colDimension.groups), name));
            }).bind(this), (function(groupName) {
              if (loadConfirm(this, withRows, withCols)) {
                if (withRows) this.rowDimension.loadAsGroup(groupName, silent);
                if (withCols) this.colDimension.loadAsGroup(groupName, silent);
                if (withRows || withCols) this.update();
              }
            }).bind(this));
          } else {
            if (loadConfirm(this, withRows, withCols)) {
              if (withRows) this.rowDimension.loadSource(silent);
              if (withCols) this.colDimension.loadSource(silent);
              if (withRows || withCols) this.update();
            }
          }
        };


        // Main tab

        var asGroupCb = document.createElement('input');
        asGroupCb.setAttribute('type', 'checkbox');
        asGroupCb.checked = loadAsGroup;
        asGroupCb.onclick = function() {
          loadAsGroup = this.checked;
        };
        var asGroup = document.createElement('label');
        asGroup.appendChild(asGroupCb);
        asGroup.appendChild(document.createTextNode('As group'));
        tabs['Main'].appendChild(asGroup);

        var loadRows = document.createElement('input');
        loadRows.setAttribute("type", "button");
        loadRows.setAttribute("value", "Append pre");
        loadRows.setAttribute("title", "Append presynaptic neurons");
        loadRows.onclick = loadWith.bind(this, true, false);
        tabs['Main'].appendChild(loadRows);

        var loadColumns = document.createElement('input');
        loadColumns.setAttribute("type", "button");
        loadColumns.setAttribute("value", "Append post");
        loadColumns.setAttribute("title", "Append postsynaptic neurons");
        loadColumns.onclick = loadWith.bind(this, false, true);
        tabs['Main'].appendChild(loadColumns);

        var loadAll = document.createElement('input');
        loadAll.setAttribute("type", "button");
        loadAll.setAttribute("value", "Append to both");
        loadColumns.setAttribute("title", "Append both as presynaptic and postsynaptic neurons");
        loadAll.onclick = loadWith.bind(this, true, true);
        tabs['Main'].appendChild(loadAll);

        var clearPre = document.createElement('input');
        clearPre.setAttribute("type", "button");
        clearPre.setAttribute("value", "Clear pre");
        clearPre.onclick = (function() {
          if (confirm("Do you really want to clear all row neurons?")) {
            this.clear(true, false);
          }
        }).bind(this);
        tabs['Main'].appendChild(clearPre);

        var clearPost = document.createElement('input');
        clearPost.setAttribute("type", "button");
        clearPost.setAttribute("value", "Clear post");
        clearPost.onclick = (function() {
          if (confirm("Do you really want to clear all column neurons?")) {
            this.clear(false, true);
          }
        }).bind(this);
        tabs['Main'].appendChild(clearPost);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear both");
        clear.onclick = (function() {
          if (confirm("Do you really want to clear the current selection?")) {
            this.clear(true, true);
          }
        }).bind(this);
        tabs['Main'].appendChild(clear);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = this.update.bind(this);
        tabs['Main'].appendChild(update);

        var openSwapped = document.createElement('input');
        openSwapped.setAttribute("type", "button");
        openSwapped.setAttribute("value", "Clone swapped");
        openSwapped.setAttribute("title", "Open a copy of this matrix with rows and columns swapped");
        openSwapped.onclick = this.cloneWidget.bind(this, true);
        tabs['Main'].appendChild(openSwapped);

        var max = 20;
        var synapseThresholdSelect = document.createElement('select');
        for (var i=1; i <= max; ++i) {
          let selected = this.synapseThreshold === i;
          synapseThresholdSelect.options.add(
                new Option(i, i, selected, selected));
        }
        synapseThresholdSelect.onchange = (function(e) {
          this.synapseThreshold = parseInt(e.target.value, 10);
          this.refresh();
        }).bind(this);
        var synapseThreshold = document.createElement('label');
        synapseThreshold.appendChild(document.createTextNode('Syn. threshold'));
        synapseThreshold.appendChild(synapseThresholdSelect);
        tabs['Main'].appendChild(synapseThreshold);

        var relativeDisplayCb = document.createElement('input');
        relativeDisplayCb.setAttribute('type', 'checkbox');
        relativeDisplayCb.checked = this.relativeDisplay;
        relativeDisplayCb.onclick = e => {
          this.relativeDisplay = e.target.checked;
          if (this.matrix.getNumberOfRows() === 0 || this.matrix.getNumberOfColumns() === 0) {
            return;
          }
          var prepare = this.connectivityData ? Promise.resolve() :
            this.updateConnectivityCounts();
          prepare.then(this.refresh.bind(this));
        };
        var relativeDisplay = document.createElement('label');
        relativeDisplay.appendChild(relativeDisplayCb);
        relativeDisplay.appendChild(document.createTextNode('Fractions'));
        relativeDisplay.setAttribute('title', 'Display the number of connections ' +
            'as percetage of the total number of postsynaptic links to the target ' +
            'skeleton.');
        tabs['Main'].appendChild(relativeDisplay);

        var applyFiltersCb = document.createElement('input');
        applyFiltersCb.setAttribute('type', 'checkbox');
        applyFiltersCb.checked = this.applyFilterRules;
        applyFiltersCb.onclick = function() {
          self.applyFilterRules= this.checked;
          self.update();
        };
        var applyFilters = document.createElement('label');
        applyFilters.appendChild(applyFiltersCb);
        applyFilters.appendChild(document.createTextNode('Apply connector filters'));
        tabs['Main'].appendChild(applyFilters);

        var exportCSV = document.createElement('input');
        exportCSV.setAttribute("type", "button");
        exportCSV.setAttribute("value", "Export CSV");
        exportCSV.onclick = this.exportCSV.bind(this);
        tabs['Main'].appendChild(exportCSV);

        var exportPDF = document.createElement('input');
        exportPDF.setAttribute("type", "button");
        exportPDF.setAttribute("value", "Export PDF");
        exportPDF.onclick = this.exportPDF.bind(this);
        tabs['Main'].appendChild(exportPDF);

        var exportXLSX = document.createElement('input');
        exportXLSX.setAttribute("type", "button");
        exportXLSX.setAttribute("value", "Export XLSX");
        exportXLSX.setAttribute("title", "Export a spreadsheet file compatible to Microsoft Excel and Libre Office, colors are preserved");
        exportXLSX.onclick = this.exportXLSX.bind(this);
        tabs['Main'].appendChild(exportXLSX);

        var exportCsvNoDisplay = document.createElement('input');
        exportCsvNoDisplay.setAttribute("type", "button");
        exportCsvNoDisplay.setAttribute("value", "Auto-connectivity CSV");
        exportCsvNoDisplay.setAttribute('title', "Generate the auto-connectivity matrix for the selected source and download it as CSV file without displaying it.");
        exportCsvNoDisplay.onclick = function() {
          var source = CATMAID.skeletonListSources.getSource(sourceSelect.value);
          self.exportCsvNoDisplay(source.getSelectedSkeletons());
        };
        tabs['Main'].appendChild(exportCsvNoDisplay);


        // Groups tab
        var groupEquallyNamedRows = document.createElement('input');
        groupEquallyNamedRows.setAttribute("type", "button");
        groupEquallyNamedRows.setAttribute("value", "Group equally named rows");
        groupEquallyNamedRows.setAttribute("title", "Group equally named row skeletons");
        groupEquallyNamedRows.onclick = this.groupEquallyNamed.bind(this, true, false);
        tabs['Groups'].appendChild(groupEquallyNamedRows);

        var groupEquallyNamedCols = document.createElement('input');
        groupEquallyNamedCols.setAttribute("type", "button");
        groupEquallyNamedCols.setAttribute("value", "Group equally named columns");
        groupEquallyNamedCols.setAttribute("title", "Group equally named column skeletons");
        groupEquallyNamedCols.onclick = this.groupEquallyNamed.bind(this, false, true);
        tabs['Groups'].appendChild(groupEquallyNamedCols);

        var groupEquallyNamedBoth = document.createElement('input');
        groupEquallyNamedBoth.setAttribute("type", "button");
        groupEquallyNamedBoth.setAttribute("value", "Group equally named both");
        groupEquallyNamedBoth.setAttribute("title", "Group equally named column skeletons and row skeletons");
        groupEquallyNamedBoth.onclick = this.groupEquallyNamed.bind(this, true, true);
        tabs['Groups'].appendChild(groupEquallyNamedBoth);

        var ungroupRows = document.createElement('input');
        ungroupRows.setAttribute("type", "button");
        ungroupRows.setAttribute("value", "Ungroup rows");
        ungroupRows.setAttribute("title", "Ungroup all grouped rows");
        ungroupRows.onclick = this.ungroup.bind(this, true, false);
        tabs['Groups'].appendChild(ungroupRows);

        var ungroupCols = document.createElement('input');
        ungroupCols.setAttribute("type", "button");
        ungroupCols.setAttribute("value", "Ungroup columns");
        ungroupCols.setAttribute("title", "Ungroup all grouped columns");
        ungroupCols.onclick = this.ungroup.bind(this, false, true);
        tabs['Groups'].appendChild(ungroupCols);

        var ungroupBoth = document.createElement('input');
        ungroupBoth.setAttribute("type", "button");
        ungroupBoth.setAttribute("value", "Ungroup both");
        ungroupBoth.setAttribute("title", "Ungroup all rows and columns");
        ungroupBoth.onclick = this.ungroup.bind(this, true, true);
        tabs['Groups'].appendChild(ungroupBoth);

        CATMAID.DOM.appendElement(tabs['Groups'], {
          type: 'select',
          label: 'Aggregate',
          title: 'Select how group member connectivity counts should be aggregated.',
          value: this.groupAggregate,
          entries: [{
            title: 'Sum',
            value: 'sum'
          }, {
            title: 'Min',
            value: 'min'
          }, {
            title: 'Max',
            value: 'max'
          }, {
            title: 'Average',
            value: 'avg'
          }],
          onchange: function() {
            self.groupAggregate = this.value;
            self.refresh();
          }
        });

        // Display tab
        var sortOptionNames = sortOptions.map(function(o) {
          return o.name;
        });
        var sortRowsSelect = document.createElement('select');
        for (var i=0; i < sortOptionNames.length; ++i) {
          var selected = (this.rowSorting === i);
          sortRowsSelect.options.add(
                new Option(sortOptionNames[i], i, selected, selected));
        }
        sortRowsSelect.onchange = (function(e) {
          this.rowSorting = e.target.value;
          this.refresh();
        }).bind(this);
        var sortRows = document.createElement('label');
        sortRows.appendChild(document.createTextNode('Sort rows by'));
        sortRows.appendChild(sortRowsSelect);
        tabs['Display'].appendChild(sortRows);

        var sortRowsDescCb = document.createElement('input');
        sortRowsDescCb.setAttribute('type', 'checkbox');
        sortRowsDescCb.checked = this.rowSortingDesc;
        sortRowsDescCb.onclick = (function(e) {
          this.rowSortingDesc = e.target.checked;
          this.refresh();
        }).bind(this);
        var sortRowsDesc = document.createElement('label');
        sortRowsDesc.appendChild(sortRowsDescCb);
        sortRowsDesc.appendChild(document.createTextNode('Desc.'));
        tabs['Display'].appendChild(sortRowsDesc);

        var sortColsSelect = document.createElement('select');
        for (var i=0; i < sortOptionNames.length; ++i) {
          var selected = (this.colSorting === i);
          sortColsSelect.options.add(
                new Option(sortOptionNames[i], i, selected, selected));
        }
        sortColsSelect.onchange = (function(e) {
          this.colSorting = e.target.value;
          this.refresh();
        }).bind(this);
        var sortCols = document.createElement('label');
        sortCols.appendChild(document.createTextNode('Sort columns by'));
        sortCols.appendChild(sortColsSelect);
        tabs['Display'].appendChild(sortCols);

        var sortColsDescCb = document.createElement('input');
        sortColsDescCb.setAttribute('type', 'checkbox');
        sortColsDescCb.checked = this.colSortingDesc;
        sortColsDescCb.onclick = (function(e) {
          this.colSortingDesc = e.target.checked;
          this.refresh();
        }).bind(this);
        var sortColsDesc = document.createElement('label');
        sortColsDesc.appendChild(sortColsDescCb);
        sortColsDesc.appendChild(document.createTextNode('Desc.'));
        tabs['Display'].appendChild(sortColsDesc);

        var colorSelect = document.createElement('select');
        for (var i=0; i < colorOptions.length; ++i) {
          var selected = (this.color === i);
          colorSelect.options.add(
                new Option(colorOptions[i], i, selected, selected));
        }
        colorSelect.onchange = (function(e) {
          this.color = parseInt(e.target.value, 10);
          this.refresh();
        }).bind(this);
        var color = document.createElement('label');
        color.appendChild(document.createTextNode('Color'));
        color.appendChild(colorSelect);
        tabs['Display'].appendChild(color);

        var rotateColsCb = document.createElement('input');
        rotateColsCb.setAttribute('type', 'checkbox');
        rotateColsCb.checked = this.rotateColumnHeaders;
        rotateColsCb.onclick = (function(e) {
          this.rotateColumnHeaders = e.target.checked;
          this.refresh();
        }).bind(this);
        var rotateCols = document.createElement('label');
        rotateCols.appendChild(rotateColsCb);
        rotateCols.appendChild(document.createTextNode('Column header 90°'));
        tabs['Display'].appendChild(rotateCols);

        var displayOrderFieldsCb = document.createElement('input');
        displayOrderFieldsCb.setAttribute('type', 'checkbox');
        displayOrderFieldsCb.checked = this.displayOrderFields;
        displayOrderFieldsCb.onclick = (function(e) {
          this.displayOrderFields = e.target.checked;
          this.refresh();
        }).bind(this);
        var displayOrderFields = document.createElement('label');
        displayOrderFields.appendChild(displayOrderFieldsCb);
        displayOrderFields.appendChild(document.createTextNode('Manually edit order'));
        tabs['Display'].appendChild(displayOrderFields);

        $(controls).tabs();
      },

      /**
       * Create widget content.
       */
      createContent: function(container) {
        this.content = container;
        this.update();
      },

      filter: {
        rules: this.filterRules,
        update: this.update.bind(this),
        type: 'node',
      },
    };
  };

  var addSkeletonModel = function(target, skeletonId) {
    target[skeletonId] = new CATMAID.SkeletonModel(skeletonId);
    return target;
  };

  var groupEquallyNamedInSource = function(targetSource) {
    var names = new Map();
    var sourceSkeletonIds = targetSource.getSelectedSkeletons();
    var orderedNames = [];
    var groups = sourceSkeletonIds.reduce(function(map, skeletonId) {
      // Get name
      var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
      names.set(skeletonId, name);
      // Find existing group for name or create new one
      if (name in map) {
        map[name].push(skeletonId);
      } else {
        map[name] = [skeletonId];
        orderedNames.push(name);
      }
      return map;
    }, {});

    // Clear existing rows
    targetSource.clear();

    // Add new rows and groups
    orderedNames.forEach(function(name) {
      var skeletons = groups[name];
      if (!skeletons || skeletons.length === 0) {
        throw new CATMAID.ValueError("Expected at least one skeleton for this row");
      }

      // Build and append models
      var models = skeletons.reduce(addSkeletonModel, {});
      if (skeletons.length === 1) {
        targetSource.append(models);
      } else {
        targetSource.appendAsGroup(models, name);
      }
    });
  };

  var ungroupSource = function(targetSource) {
    // If there are groups in this source, re-add all
    if (targetSource.hasGroups()) {
      var skeletonModels = targetSource.getSkeletonModels();
      targetSource.clear();
      targetSource.append(skeletonModels);
    }
  };

  /**
   * Group all rows and/or columns that have equal names.
   *
   * @params {Boolean} rows    Whether or not rows should be looked at
   * @params {Boolean} columns Whether or not columns should be looked at
   */
  ConnectivityMatrixWidget.prototype.groupEquallyNamed = function(rows, columns) {
    if (rows) {
      groupEquallyNamedInSource(this.rowDimension);
    }
    if (columns) {
      groupEquallyNamedInSource(this.colDimension);
    }
  };

  /**
   * Ungroup all rows and/or columns that are currently grouped.
   *
   * @params {Boolean} rows    Whether or not rows should be looked at
   * @params {Boolean} columns Whether or not columns should be looked at
   */
  ConnectivityMatrixWidget.prototype.ungroup = function(rows, columns) {
    if (rows) {
      ungroupSource(this.rowDimension);
    }
    if (columns) {
      ungroupSource(this.colDimension);
    }
  };

  /**
   * Clear all selected sources.
   */
  ConnectivityMatrixWidget.prototype.clear = function(clearRows, clearCols) {
    this.connectivityData = null;
    this.relationMap = null;
    if (clearRows) this.rowDimension.clear();
    if (clearCols) this.colDimension.clear();
    if (clearRows || clearCols) this.update();
  };

  /**
   * Update names of neurons in connectivity widget.
   */
  ConnectivityMatrixWidget.prototype.updateNeuronNames = function() {
    this.refresh();
  };

  /**
   * Open a new connectivity matrix, optionally with rows and columns swapped.
   */
  ConnectivityMatrixWidget.prototype.cloneWidget = function(swap) {
    var widget = new CATMAID.ConnectivityMatrixWidget();
    // Set options
    widget.synapseThreshold = this.synapseThreshold;
    widget.color = this.color;
    widget.rowSorting = this.rowSorting;
    widget.colSorting = this.colSorting;
    widget.rotateColumnHeaders = this.rotateColumnHeaders;
    // Set data sources
    var rowSource = swap ? this.colDimension : this.rowDimension;
    var colSource = swap ? this.rowDimension : this.colDimension;
    widget.rowDimension.append(rowSource.getSelectedSkeletonModels());
    widget.colDimension.append(colSource.getSelectedSkeletonModels());

    WindowMaker.create('connectivity-matrix', widget, true);
  };

  /**
   * Refresh the UI without recreating the connectivity matrix.
   */
  ConnectivityMatrixWidget.prototype.refresh = function(container) {
    // Clrear container and add new table
    $(this.content).empty();

    // Sort row dimensions
    var rowSort = sortOptions[this.rowSorting];
    if (rowSort && CATMAID.tools.isFn(rowSort.sort)) {
      this.rowDimension.sort(rowSort.sort.bind(this, this.rowSortingDesc,
            this.matrix, this.rowDimension, this.colDimension, true));
    } else if (undefined === rowSort.sort) {
      // Explicitly allow null as no-op
      CATMAID.error('Could not find row sorting function with name ' +
          this.rowSorting);
    }

    // Sort coumn dimensions
    var colSort = sortOptions[this.colSorting];
    if (colSort && CATMAID.tools.isFn(colSort.sort)) {
      this.colDimension.sort(colSort.sort.bind(this, this.colSortingDesc,
            this.matrix, this.colDimension, this.rowDimension, false));
    } else if (undefined === colSort.sort) {
      // Explicitly allow null as no-op
      CATMAID.error('Could not find column sorting function with name ' +
          this.colSorting);
    }

    // Rebuild matrix with sorted skeletons (no back-end query)
    this.matrix.rowSkeletonIDs = this.rowDimension.getSelectedSkeletons();
    this.matrix.colSkeletonIDs = this.colDimension.getSelectedSkeletons();
    this.matrix.rebuild();

    // Create table
    this.addConnectivityMatrixTable(this.matrix, this.content, this.synapseThreshold,
        this.rotateColumnHeaders);
  };

  /**
   * Recreate the connectivity matrix and refresh the UI.
   */
  ConnectivityMatrixWidget.prototype.update = function(container) {
    if (!(this.matrix && this.content)) {
      return;
    }

    // Clrear container
    var $content = $(this.content);
    $content.empty();

    var nRows = this.rowDimension.getNumberOfSkeletons();
    var nCols = this.colDimension.getNumberOfSkeletons();

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
    var nns = CATMAID.NeuronNameService.getInstance();
    this.matrix.rowSkeletonIDs = this.rowDimension.getSelectedSkeletons();
    this.matrix.colSkeletonIDs = this.colDimension.getSelectedSkeletons();

    var skeletonIds = new Set(this.matrix.rowSkeletonIDs);
    for (var i=0; i<this.matrix.colSkeletonIDs.length; ++i) {
      skeletonIds.add(this.matrix.colSkeletonIDs[i]);
    }

    this.matrix.filterRules.length = 0;
    this.matrix.filterRules.push.apply(this.matrix.filterRules, this.filterRules);
    this.matrix.applyFilterRules = this.applyFilterRules;
    var self = this;
    this.matrix.refresh()
      .then(nns.registerAll.bind(nns, this, this.rowDimension.getSelectedSkeletonModels()))
      .then(nns.registerAll.bind(nns, this, this.colDimension.getSelectedSkeletonModels()))
      .then(function() {
        if (self.relativeDisplay && !self.connectivityData) {
          return self.updateConnectivityCounts(Array.from(skeletonIds));
        }
      })
      .then((function() {
        // Clear any message
        if (this.content.dataset.msg) delete this.content.dataset.msg;
        // Create table
        this.refresh();
      }).bind(this));
  };

  ConnectivityMatrixWidget.prototype.updateConnectivityCounts = function(skeletonIds) {
    if (!skeletonIds) {
      var rowSkeletonIDs = this.rowDimension.getSelectedSkeletons();
      var colSkeletonIDs = this.colDimension.getSelectedSkeletons();
      skeletonIds = new Set(this.matrix.rowSkeletonIDs);
      for (var i=0; i<this.matrix.colSkeletonIDs.length; ++i) {
        skeletonIds.add(this.matrix.colSkeletonIDs[i]);
      }
      skeletonIds = Array.from(skeletonIds);
    }

    var self = this;
    return CATMAID.fetch(project.id + '/skeletons/connectivity-counts', 'POST', {
      skeleton_ids: skeletonIds,
      source_relations: ['postsynaptic_to'],
      target_relations: ['presynaptic_to']
    })
    .then(function(connCount) {
      self.connectivityData = connCount.connectivity;
      self.relationMap = Object.keys(connCount.relations).reduce(function(map, rId) {
        map[connCount.relations[rId]] = rId;
        return map;
      }, {});
    });
  };

  function sortDimension(map, a, b) {
    // A mapped values is expected to be a list of two elements: a new
    // index and an old one. If the new index is the same, the old is used
    // for comparison. This maintains local order when moving sets.
    var aIndices = map.get(a), bIndices = map.get(b);
    var ia = aIndices[0], ib = bIndices[0];
    if (ia === ib) {
      ia = aIndices[1];
      ib = bIndices[1];
    }
    return ia === ib ? 0 : (ia < ib ? -1 : 1);
  }

  function mapOrder(table, source, isRow, map, e, i) {
    var headerCell = source.isGroup(e) ?
      $(table).find('a[data-is-row="' + isRow + '"][data-group="' + e + '"]') :
      $(table).find('a[data-is-row="' + isRow + '"][data-skeleton-ids="[' + e + ']"]');
    var position;
    if (1 !== headerCell.length) {
      CATMAID.warn('Did not find exactly one connectivity matrix row for pre-element ' + e);
      position = -1;
    } else  {
      var inputCell = isRow ? headerCell.closest('th').prev() :
          $($(table).find('tr:first').find('th')[i + 2]);
      if (inputCell) {
        position = Number(inputCell.find('input').val());
      }
    }
    map.set(e, [position, i]);
    return map;
  }

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
      matrix, content, synThreshold, rotateColumns) {
    // Don't try to create a table if there are no neurons added.
    if (this.matrix.getNumberOfRows() === 0 || this.matrix.getNumberOfColumns() === 0) {
      return;
    }
    // Create table representation for connectivity matrix
    var table = document.createElement('table');
    table.setAttribute('class', 'partner_table');

    // Add column header, prepend one blank cell for row headers
    var colHeader = table.appendChild(document.createElement('tr'));
    colHeader.appendChild(document.createElement('th'));

    // Find maximum connection number in matrix and maximum percent (if relative
    // display is enabled).
    var maxConnections = matrix.getMaxConnections();
    var maxPercent = 0;
    if (this.relativeDisplay) {
      var postToId = this.relationMap['postsynaptic_to'];
      for (var i=0; i<this.matrix.rowSkeletonIDs.length; ++i) {
        for (var j=0; j<this.matrix.colSkeletonIDs.length; ++j) {
          var c = this.matrix.connectivityMatrix[i][j];
          let skeletonData = this.connectivityData[this.matrix.colSkeletonIDs[j]];
          if (!skeletonData) continue;
          let targetTotal = skeletonData[postToId];
          if (!targetTotal) continue;
          let percent = 100 * c.count / targetTotal;
          if (percent > maxPercent) maxPercent = percent;
        }
      }
    }

    // Collect row as well as column names and skeleton IDs
    var rowNames = [], rowSkids = [], colNames = [], colSkids = [];

    var walked = this.walkMatrix(matrix,
        handleColumn.bind(this, colHeader, colNames, colSkids),
        handleRow.bind(window, table, rowNames, rowSkids),
        handleCell.bind(this),
        handleCompletion.bind(this, table, rowNames, rowSkids, colNames, colSkids),
          this.makeVisitorOptions());

    if (walked) {
      // Add optional order fields
      if (this.displayOrderFields) {
        // Row
        var orderFieldRow = document.createElement('tr');
        var orderFieldApply = document.createElement('input');
        orderFieldApply.setAttribute('type', 'button');
        orderFieldApply.setAttribute('value', 'Re-order');
        var orderFieldTh = document.createElement('th');
        orderFieldTh.appendChild(orderFieldApply);
        orderFieldRow.appendChild(orderFieldTh);
        // One empty column is required here, compensating for the pre-column
        orderFieldRow.appendChild(document.createElement('th'));

        colNames.forEach(function(col, i) {
          var orderTh = document.createElement('th');
          var orderInput = document.createElement('input');
          orderInput.setAttribute('type', 'number');
          orderInput.setAttribute('class', 'order-input');
          orderInput.setAttribute('value', i + 1);
          orderTh.appendChild(orderInput);
          this.appendChild(orderTh);
        }, orderFieldRow);

        // For symmetry with the first column
        orderFieldRow.appendChild(document.createElement('th'));

        table.insertBefore(orderFieldRow, colHeader);
        // If order inputs are displayed, one more empty cell is needed, due to
        // the extra order input column.
        $(colHeader).find("th:first").before(document.createElement('th'));

        $(table).find("tr").each(function(i, e) {
          // The first row is the top order row and the second one the regular
          // header. No need to modify both of them
          if (i > 1) {
            if (i < rowNames.length + 2) {
              var orderTh = document.createElement('th');
              var orderInput = document.createElement('input');
              orderInput.setAttribute('type', 'number');
              orderInput.setAttribute('class', 'order-input');
              orderInput.setAttribute('value', i - 1);
              orderTh.appendChild(orderInput);
              $(this).find('th:first').before(orderTh);
            } else {
              $(this).find('th:first').before(document.createElement('th'));
            }
          }
        });

        orderFieldApply.onclick = (function(widget) {
          return function() {
            var cmTable = $(this).closest('table');
            // Read new order
            var rowOrder = widget.rowDimension.orderedElements.reduce(
                mapOrder.bind(window, cmTable, widget.rowDimension, true), new Map());
            var colOrder = widget.colDimension.orderedElements.reduce(
                mapOrder.bind(window, cmTable, widget.colDimension, false), new Map());
            // Sort dimensions
            widget.rowDimension.sort(sortDimension.bind(widget, rowOrder));
            widget.colDimension.sort(sortDimension.bind(widget, colOrder));
            // Set no-op sort and refresh view
            widget.rowSorting = 0;
            widget.colSorting = 0;
            widget.refresh();
          };
        })(this);
      }

      // Add general information paragraph
      var infoBox = document.createElement('div');
      infoBox.appendChild(document.createTextNode('The table below shows the ' +
            'number of post-synaptic connections from row to column skeletons. ' +
            'If there are no connections, no number is shown.'));
      content.appendChild(infoBox);

      // Append matrix to content
      content.appendChild(table);

      // Add a handler for openening connector selections for individual partners
      $('a[partnerIDs]', table).click(function () {
        var sourceIDs = $(this).attr('sourceIDs');
        var partnerIDs = $(this).attr('partnerIDs');
        var type = $(this).attr('type');
        if (sourceIDs && partnerIDs) {
          sourceIDs = JSON.parse(sourceIDs);
          partnerIDs = JSON.parse(partnerIDs);
          CATMAID.ConnectorSelection.show_shared_connectors(sourceIDs, partnerIDs,
            type + "synaptic_to");
        } else {
          CATMAID.error("Could not find partner or source IDs!");
        }

        return true;
      });

      // Add a handler for selecting skeletons when their names are clicked
      $(table).on('click', 'a[data-skeleton-ids]', function(e) {
        var skeletonIDs = JSON.parse(this.dataset.skeletonIds);
        followSkeletonList(skeletonIDs);
      });

      // A container for all the buttons
      var buttons = document.createElement('div');
      buttons.style.display = 'none';
      buttons.style.position = 'absolute';

      // Create a removal button
      var removalButton = appendHoverButton(buttons, 'close',
          'remove-skeleton', 'Remove this neuron vom list');

      // Create a move up and a move down button
      var moveUpButton = appendHoverButton(buttons, 'triangle-1-n',
          'move-up', 'Move this row up');
      var moveDownButton = appendHoverButton(buttons, 'triangle-1-s',
          'move-down', 'Move this row down');

      // Create a move left and a right button
      var moveLeftButton = appendHoverButton(buttons, 'triangle-1-w',
          'move-left', 'Move this column to the left');
      var moveRightButton = appendHoverButton(buttons, 'triangle-1-e',
          'move-right', 'Move this column to the right');

      // Create selection/link button
      var selectionButton = appendHoverButton(buttons, 'extlink',
          'select', 'Select this neuron and move view to it');

      content.appendChild(buttons);

      var moveButtons = [moveUpButton, moveDownButton, moveLeftButton,
          moveRightButton];

      // Keep track of button hiding time out and last position
      var hideTimeout, lastButtonLeft, lastButtonTop;

      $(table).on('mouseenter', 'td, th', function () {
        var colnum = parseInt($(this).index()) + 1;
        $('td:nth-child(' + colnum + '), th:nth-child(' + colnum + ')', $(this).closest('table'))
            .addClass('highlight');
      }).on('mouseleave', 'td, th', function () {
        var colnum = parseInt($(this).index()) + 1;
        $('td:nth-child(' + colnum + '), th:nth-child(' + colnum + ')', $(this).closest('table'))
            .removeClass('highlight');
      });

      // Add a handler for hovering over table headers
      $(table).on('mouseenter', 'th', content, function(e) {
        // Determine if this event comes from either a focus change within the
        // cell or the button pane, respectively.
        var inCell = $.contains(this, e.relatedTarget) || $.contains(buttons, e.relatedTarget);
        // Determine visibility by checking if the mouse cursor is still in the
        // table cell and is just hoving the buttons. If they are not visible,
        // set them up and show them.
        if ($(buttons).is(':visible')) {

          var offset = $(this).offset();
          var hidden = false;
          if (rotateColumns && !isRow) {
            // This is required, because offset() is apparently not correct
            // after rotating the cell.
            var top = offset.top + $(this).width() - $(this).height();
            hidden = (e.pageX < offset.left) ||
                     (e.pageX > (offset.left + $(this).width())) ||
                     (e.pageY < top) ||
                     (e.pageY > top + $(this).height());
          } else {
            hidden = (e.pageX < offset.left) ||
                     (e.pageX > (offset.left + $(this).width())) ||
                     (e.pageY < offset.top) ||
                     (e.pageY > (offset.top + $(this).height()));
          }
          if (hidden) $(buttons).hide();
        }

        var links = $(this).find('a[data-skeleton-ids]');
        if (0 === links.length) return false;
        var skeletonIdsJSON = links[0].dataset.skeletonIds;
        var skeletonIds = JSON.parse(skeletonIdsJSON);
        if (0 === skeletonIds.length) return false;
        var isRow = ("true" === links[0].dataset.isRow);
        var group = links[0].dataset.group;

        // Let removal button know if it is in a row and assign skeleton ids
        removalButton.dataset.isRow = isRow;
        removalButton.dataset.skeletonIds = skeletonIdsJSON;
        // Assign group and key information to move buttons
        moveButtons.forEach(function(b) {
          if (group) b.dataset.group = group;
          else b.dataset.key = skeletonIds[0];
        });
        // Attach skeleton ID(s) to selcet button
        selectionButton.dataset.skeletonIds = skeletonIdsJSON;

        // For rows show up and down, for columns left and right
        if (isRow) {
          $(moveUpButton).add(moveDownButton).show();
          $(moveLeftButton).add(moveRightButton).hide();
        } else {
          $(moveUpButton).add(moveDownButton).hide();
          $(moveLeftButton).add(moveRightButton).show();
        }
        // Move removal button to current cell and toggle its visiblity. Move it
        // one pixel into the cell from left and top.
        var pos = $(this).position();
        var left = ($(content).scrollLeft() + pos.left) + 1;
        var top;
        if (rotateColumns && !isRow) {
          // This is required, because the removal button div is not rotated
          // with the table cell (it is no part of it).
          top = ($(content).scrollTop() + pos.top +
            $(this).width() - $(this).height()) + 1;
        } else {
          top = ($(content).scrollTop() + pos.top) + 1;
        }

        buttons.style.left = left + 'px';
        buttons.style.top = top + 'px';

        // Disable old hiding timeout
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = undefined;
        }

        // Store and check button location to not show buttons twice
        if ((lastButtonLeft !== left || lastButtonTop !== top ) || !inCell) {
          lastButtonLeft = left;
          lastButtonTop = top;
          $(buttons).show();

          // Hide the button after three seconds of visibility at this positon
          hideTimeout = setTimeout(function() {
            $(buttons).hide();
          }, 3000);
        }

        return true;
      });

      // Add a handler to hide the remove button if left with the pointer on all
      // sides but its right side.
      $(buttons).on('mouseout', function(e) {
        // This event is also triggered for child elements. Make sure we only
        // look at the button container.
        var t = e.relatedTarget;
        while (t && t.parentNode && t.parentNode != window) {
          if (t.parentNode === this || t === this) return false;
          t = t.parentNode;
        }
        // Get the current position (or zero coordinates if invisible)
        var offset = $(this).offset();
        if (e.pageX <= (offset.left + $(this).width())) {
          // Disable old hiding timeout, if there was one and hide buttons
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = undefined;
          }
          $(this).hide();
        }
      });

      // Add a click handler to the remove button that triggers the removal
      $(removalButton).on('click', this, function(e) {
        if (!this.dataset.skeletonIds) return false;
        var skeletonIds = JSON.parse(this.dataset.skeletonIds);
        if (0 === skeletonIds.length) {
          CATMAID.warn('Could not find expected skeleton ID');
          return false;
        }
        if ('true' === this.dataset.isRow) {
          e.data.rowDimension.removeSkeletons(skeletonIds);
          e.data.refresh();
        } else if ('false' === this.dataset.isRow) {
          e.data.colDimension.removeSkeletons(skeletonIds);
          e.data.refresh();
        } else {
          CATMAID.error("Could not find expected pre/post information");
        }
        return true;
      });

      // Add a click handler to move buttons
      $(moveUpButton).on('click', {widget: this, up: true}, handleMove);
      $(moveDownButton).on('click', {widget: this, down: true}, handleMove);
      $(moveLeftButton).on('click', {widget: this, left: true}, handleMove);
      $(moveRightButton).on('click', {widget: this, right: true}, handleMove);
      $(selectionButton).on('click', {widget: this, right: true}, function(e) {
        if (!this.dataset.skeletonIds) return false;
        var skeletonIDs = JSON.parse(this.dataset.skeletonIds);
        followSkeletonList(skeletonIDs);
      });
    }

    return content;

    // Create column
    function handleColumn(tableHeader, colNames, colSkids, id, colGroup, name,
        skeletonIDs) {
      colNames.push(name);
      colSkids.push(skeletonIDs);
      /* jshint validthis: true */
      var th = createHeaderCell(name, colGroup, skeletonIDs, false,
          this.rotateColumnHeaders);
      /* jshint validthis: true */
      if (this.rotateColumnHeaders) {
        th.setAttribute('class', 'vertical-table-header-outer');
      }
      tableHeader.appendChild(th);
    }

    // Create row
    function handleRow(table, rowNames, rowSkids, id, rowGroup, name,
        skeletonIDs) {
      rowNames.push(name);
      rowSkids.push(skeletonIDs);
      var row = document.createElement('tr');
      table.appendChild(row);
      var th = createHeaderCell(name, rowGroup, skeletonIDs, true);
      row.appendChild(th);
      return row;
    }

    // Chreate a cell with skeleton link
    function createHeaderCell(name, group, skeletonIDs, isRow, rotate) {
      // Make sure we have either a group or a single skeleton ID
      if (!group && skeletonIDs.length > 1) {
        throw new CATMAID.ValueError('Expected either a group or a single skeleton ID');
      }

      // Display dots instead of null/undefined if name unavailable
      name = name ? name : '...';

      // Create element
      var a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-skeleton-ids', JSON.stringify(skeletonIDs));
      a.setAttribute('data-is-row', isRow);
      a.appendChild(document.createTextNode(name));
      var div = document.createElement('div');
      div.appendChild(a);
      if (rotate) {
        div.classList.add('vertical-table-header-inner');
      }
      var th = document.createElement('th');
      th.appendChild(div);
      if (group) {
        a.setAttribute('data-group', name);
        th.setAttribute('title', 'This group contains ' + group.length +
            ' skeleton(s): ' + group.join(', '));
      }
      return th;
    }

    // Create cell
    function handleCell(row, rowName, rowSkids, colName, colSkids, connections,
        totalConnections, relative) {
      /* jshint validthis: true */ // `this` is bound to the connectivity matrix
      var td = createSynapseCountCell("pre", rowName, rowSkids, colName, colSkids,
          connections, synThreshold, totalConnections, relative);
      if (relative) {
        var percent = 100.0 * connections / totalConnections;
        colorize(td, colorOptions[this.color], percent, 0, maxPercent);
      } else {
        colorize(td, colorOptions[this.color], connections, synThreshold, maxConnections);
      }
      row.appendChild(td);
    }

    function sumElements(acc, val) {
      return acc + val;
    }

    // Create aggretate rows and columns
    function handleCompletion(table, rowNames, rowSkids, colNames, colSkids,
        rowSums, colSums, colTotals, relative) {
      /* jshint validthis: true */ // `this` is bound to the connectivity matrix
      var allRowSkids = this.rowDimension.getSelectedSkeletons();
      var allColSkids = this.colDimension.getSelectedSkeletons();
      // Create aggretate row
      var aggRow = document.createElement('tr');
      var aggRowHead = document.createElement('th');
      aggRowHead.appendChild(document.createTextNode('Sum'));
      aggRow.appendChild(aggRowHead);
      for (var c=0; c<colSums.length; ++c) {
        var td = createSynapseCountCell("pre", "All presynaptic neurons",
            allRowSkids, colNames[c], colSkids[c], colSums[c], synThreshold,
            colTotals[c], relative);
        aggRow.appendChild(td);
      }
      $(table).find("tr:last").after(aggRow);

      let allTargetSum = colSums.reduce(sumElements, 0);

      // Create aggregate column
      var rotate = this.rotateColumnHeaders;
      $(table).find("tr").each(function(i, e) {
        if (0 === i) {
          var th = document.createElement('th');
          th.appendChild(document.createTextNode('Sum'));
          /* jshint validthis: true */
          if (rotate) {
            th.setAttribute('class', 'vertical-table-header-outer');
          }
          e.appendChild(th);
        } else if (i <= rowSums.length) {
          // Substract one for the header row to get the correct sum index
          var td = createSynapseCountCell("pre", rowNames[i - 1], rowSkids[i - 1],
              "All postsynaptic neurons", allColSkids, rowSums[i - 1],
              synThreshold, allTargetSum, relative);
          e.appendChild(td);
        } else {
          // This has to be the lower right cell of the table. It doesn't matter
          // if we add up rows or columns, it yields the same number.
          var sum = rowSums.reduce(sumElements, 0);
          var td = createSynapseCountCell("pre", "All presynaptic neurons",
              allRowSkids, "All postsynaptic neurons", allColSkids, sum,
              synThreshold, allTargetSum, relative);
          e.appendChild(td);
        }
      });
    }

    /**
     * Append a hover button with the given properties to a target element.
     */
    function appendHoverButton(target, label, cls, title) {
      var buttonIcon = document.createElement('span');
      buttonIcon.setAttribute('title', title);
      buttonIcon.setAttribute('class', 'ui-icon ui-icon-' + label);
      var button = document.createElement('div');
      button.setAttribute('class', 'hover-button ' + cls);
      button.appendChild(buttonIcon);
      target.appendChild(button);
      return button;
    }

    /**
     * Swap two elements in either the row or column skeleton source and
     * refresh. This event handler expects the widget to be available as
     * e.data.widget and either e.up, e.down, e.left or e.right to be true
     * and to indicate the moving direction.
     */
    function handleMove(e) {
      /* jshint validthis: true */
      var group = this.dataset.group;
      var key = this.dataset.key;
      // If this is not a group cell, try to parse the key as a integer to
      // refer to a skeleton ID.
      if (group) key = group;
      else key = parseInt(key, 10);
      // Find element list to work on
      var widget = e.data.widget;
      var isRow = (e.data.up || e.data.down);
      var keys = isRow ? widget.rowDimension.orderedElements :
          widget.colDimension.orderedElements;
      // Swap elements
      var currentIndex = keys.indexOf(key);
      if (-1 === currentIndex) return true;
      if (e.data.up || e.data.left) {
        if (0 === currentIndex) return true;
        var prevKey = keys[currentIndex - 1];
        keys[currentIndex - 1] = key;
        keys[currentIndex] = prevKey;
      } else {
        if (keys.length - 1 === currentIndex) return true;
        var nextKey = keys[currentIndex + 1];
        keys[currentIndex + 1] = key;
        keys[currentIndex] = nextKey;
      }
      // Disable soting and refresh
      if (isRow) widget.rowSorting = 0;
      else widget.colSorting = 0;
      widget.refresh();
    }
  };

  /**
   * Iterate over the current connectivity matrix and call the passed in
   * functions when a column can be created, a row can be crated and a cell can
   * be created.
   */
  ConnectivityMatrixWidget.prototype.walkMatrix = function( matrix, handleCol,
      handleRow, handleCell, handleCompletion, options) {
    var nRows = matrix.getNumberOfRows();
    var nCols = matrix.getNumberOfColumns();
    if (0 === nRows || 0 === nCols) {
      return false;
    }

    var m = matrix.connectivityMatrix;
    var nns = CATMAID.NeuronNameService.getInstance();
    var rowSums = [];
    var colSums = [];
    var colTotals = [];

    // Get group information
    var nDisplayRows = this.rowDimension.orderedElements.length;
    var nDisplayCols = this.colDimension.orderedElements.length;

    for (var c=0; c<nDisplayCols; ++c) {
      // Get skeleton or group name
      var id = this.colDimension.orderedElements[c];
      var colGroup = this.colDimension.groups[id];
      var name = colGroup ? id : nns.getName(id);
      var skeletonIDs = colGroup ? colGroup : [id];
      let totalConnections = options.relative ?
          getTotalConections(options.totalConnectivity,
              options.relationMap, skeletonIDs) :
           null;
      colTotals.push(totalConnections);
      handleCol(id, colGroup, name, skeletonIDs);
    }
    // Add row headers and connectivity matrix rows
    var r = 0;
    var colTotalSum = 0;
    for (var dr=0; dr<nDisplayRows; ++dr) {
      var c = 0;
      // Get skeleton or rowGroup name and increase row skeleton counter
      var rowId = this.rowDimension.orderedElements[dr];
      var rowGroup = this.rowDimension.groups[rowId];
      var rowName = rowGroup ? rowId : nns.getName(rowId);
      var skeletonIDs = rowGroup ? rowGroup : [rowId];
      var row = handleRow(rowId, rowGroup, rowName, skeletonIDs);

      // Crete cells for each column in this row
      for (var dc=0; dc<nDisplayCols; ++dc) {
        // Aggregate group counts (if any)
        var colId = this.colDimension.orderedElements[dc];
        var colGroup = this.colDimension.groups[colId];
        var colName = colGroup ? colId : nns.getName(colId);
        var connections = aggregateMatrix(m, r, c,
            rowGroup ? rowGroup.length : 1,
            colGroup ? colGroup.length : 1,
            options.groupAggregate);

        // Create and handle in and out cells
        var rowSkids = rowGroup ? rowGroup : [rowId];
        var colSkids = colGroup ? colGroup : [colId];
        handleCell(row, rowName, rowSkids, colName, colSkids, connections,
            colTotals[dc], options.relative);

        // Add to row and column sums
        rowSums[dr] = (rowSums[dr] || 0) + connections;
        colSums[dc] = (colSums[dc] || 0) + connections;

        // Increase index for next iteration
        c = colGroup ? c + colGroup.length : c + 1;
      }

      // Increase index for next iteration
      r = rowGroup ? r + rowGroup.length : r + 1;
    }

    if (CATMAID.tools.isFn(handleCompletion)) handleCompletion(rowSums, colSums,
        colTotals, options.relative);

    return true;
  };

  function sumPost(context, skeletonId) {
    var skeletonCounts = context.data[skeletonId];
    if (skeletonCounts) {
      var count = skeletonCounts[context.relationId];
      if (count) {
        context.sum += count;
      }
    }
    return context;
  }

  function getTotalConections(data, relationMap, colSkeletonIds) {
    return colSkeletonIds.reduce(sumPost, {
      sum: 0,
      relationId: relationMap['postsynaptic_to'],
      data: data,
    }).sum;
  }

  /**
   * Open the print dialog for an empty page containing only the connectivity
   * matrix table.
   */
  ConnectivityMatrixWidget.prototype.exportPDF = function() {
    var table = $("table.partner_table", this.content);
    if (1 !== table.length) {
      CATMAID.warn("Couldn't find table to print");
      return;
    }
    // Show an options dialog that explains a PDF export is only possible
    // through printing at the moment
    var dialog = new CATMAID.OptionsDialog("Connecticity matrix export", {
      "Cancel": null,
      "Print": function() {
        CATMAID.tools.printElement(table[0]);
      }
    });
    dialog.appendMessage("Exporting the connectivity matrix as a PDF file " +
        "currently only works by printing to a PDF file. Clicking the \"Print\" " +
        "button below will create a new window with only the connectivity " +
        "matrix in it. The browser's print dialog is automatically shown. Colors " +
        "will only be visible if the \"Background graphics\" setting in the " +
        "print dialog is active.");
    dialog.show(450, 200, true);
  };

  /**
   * Let back-end export a CSV for the auto-connectivity (self-connectivity) of
   * the selected source.
   */
  ConnectivityMatrixWidget.prototype.exportCsvNoDisplay = function(skeletonIds) {
    let nns = CATMAID.NeuronNameService.getInstance();
    nns.registerAllFromList(this, skeletonIds)
      .then(function() {
        let names = skeletonIds.map((skid) => [skid, nns.getName(skid)]);
        return CATMAID.fetch(project.id + '/skeletons/connectivity_matrix/csv', 'POST', {
            rows: skeletonIds,
            columns: skeletonIds,
            names: names,
          }, true);
      })
      .then(function(response) {
        CATMAID.msg("Success", "Auto-connectivity matrix of " + skeletonIds.length +
            " skeletons finished");
        saveAs(new Blob([response], {type: 'text/csv'}), 'catmaid-connectivity-matrix.csv');
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Export the currently displayed matrix as CSV file.
   */
  ConnectivityMatrixWidget.prototype.exportCSV = function() {
    if (!this.matrix) {
      CATMAIR.error("Please load some data first.");
      return;
    }

    // Create a new array that contains entries for each line. Pre-pulate with
    // first element (empty upper left cell).
    var lines = [['""']];

    let options = this.makeVisitorOptions();
    var walked = this.walkMatrix(this.matrix, handleColumn.bind(window, lines[0]),
        handleRow.bind(window, lines), handleCell, undefined, options);

    // Export concatenation of all lines, delimited buy new-line characters
    if (walked) {
      var text = lines.map(function(l) { return l.join(', '); }).join('\n');
      saveAs(new Blob([text], {type: 'text/plain'}), 'connectivity-matrix.csv');
    }

    // Create header
    function handleColumn(line, id, colGroup, name, skeletonIDs) {
      line.push('"' + name + '"');
    }

    // Create row
    function handleRow(lines, id, rowGroup, name, skeletonIDs) {
      var line = ['"' + name + '"'];
      lines.push(line);
      return line;
    }

    // Create cell
    function handleCell(line, rowName, rowSkids, colName, colSkids, connections,
        totalConnections, relative) {
      line.push(relative ? (connections / totalConnections) : connections);
    }
  };

  ConnectivityMatrixWidget.prototype.makeVisitorOptions = function() {
    return {
      relative: this.relativeDisplay,
      totalConnectivity: this.connectivityData,
      relationMap: this.relationMap,
      groupAggregate: this.groupAggregate,
    };
  };

  /**
   * Export the currently displayed matrix as XLSX file using jQuery DataTables.
   */
  ConnectivityMatrixWidget.prototype.exportXLSX = function() {
    if (!this.matrix) {
      CATMAIR.error("Please load some data first.");
      return;
    }

    // Create a new array that contains entries for each line. Pre-pulate with
    // first element (empty upper left cell). Unfortunately, an empty string
    // doesn't work correctly, and some content has to be provided.
    var lines = [[' ']];

    let options = this.makeVisitorOptions();

    // Create header
    function handleColumn(line, id, colGroup, name, skeletonIDs) {
      var n = (name && name.length) ? name : '""';
      line.push(n);
    }

    // Create row
    function handleRow(lines, id, rowGroup, name, skeletonIDs) {
      var n = (name && name.length) ? name : '""';
      var line = [n];
      lines.push(line);
      return line;
    }

    // Create cell
    function handleCell(line, rowName, rowSkids, colName, colSkids, connections,
        totalConnections, relative) {
      line.push(relative ? (connections / totalConnections) : connections);
    }

    var walked = this.walkMatrix(this.matrix, handleColumn.bind(window, lines[0]),
        handleRow.bind(window, lines), handleCell, undefined, options);

    // Export concatenation of all lines, delimited buy new-line characters
    if (!walked) {
      CATMAID.warn("Couldn't export XLSX file");
      return;
    }

    // Create color index
    var colorScheme = colorOptions[this.color];
    var maxConnections = this.matrix.getMaxConnections();
    var colorIndex = {};
    for (var r=0, maxr=lines.length; r<maxr; ++r) {
      var row = lines[r];
      for (var c=0, maxc=row.length; c<maxc; ++c) {
        var value = parseInt(row[c], 10);
        if (Number.isNaN(value)) {
          continue;
        }
        var color = getColor(colorScheme, value,
            this.synapseThreshold, maxConnections);
        if (color) {
          colorIndex[value] = color;
        }
      }
    }

    CATMAID.exportXLSX(lines, {
      boldFirstRow: true,
      boldFirstCol: true,
      colorIndex: colorIndex,
      filename: 'catmaid-connectivity-matrix'
    });
  };

  let knownAggregates = {
    'sum': function sum(a, b, n) {
      return a + b;
    },
    'min': function min(a, b, n) {
      return b > a ? a : b;
    },
    'max': function max(a, b, n) {
      return b > a ? b : a;
    },
    'avg': function avg(a, b, n) {
      return a + ((b - a) / (n+1));
    },
  };

  /**
   * Aggregate the values of a connectivity matrix over the specified number of
   * rows and columns, starting from the given position.
   */
  function aggregateMatrix(matrix, r, c, nRows, nCols, aggregateName) {
    aggregateName = aggregateName || 'sum';

    let agg = knownAggregates[aggregateName];
    if (!agg) {
      throw new CATMAID.ValueError("Unknown aggregate function: " + aggregateName);
    }

    var n = 0;

    for (var i=0; i<nRows; ++i) {
      for (var j=0; j<nCols; ++j) {
        let count = matrix[r + i][c + j].count;
        let loops = i * nCols + j;
        // No need for arregation in first iteration
        n = loops === 0 ? count : agg(n, count, loops);
      }
    }

    return n;
  }

  /**
   * Create a synapse count table cell.
   */
  function createSynapseCountCell(sourceType, sourceName, sourceIDs, targetName, partnerIDs,
      count, threshold, totalConnections, relative) {
    var td = document.createElement('td');
    td.setAttribute('class', 'syncount');

    if ("pre" === sourceType) {
      td.setAttribute('title', 'From "' + sourceName + '" to "' + targetName +
          '": ' + count + ' connection(s)');
    } else {
      td.setAttribute('title', 'From "' + targetName + '" to "' + sourceName +
          '": ' + count + ' connection(s)');
    }
    if (count >= threshold) {
      // Create a links that will open a connector selection when clicked. The
      // handler to do this is created separate to only require one handler.
      var a = document.createElement('a');
      td.appendChild(a);

      if (relative) {
        var percent = (100.0 * count / totalConnections).toFixed(2);
        a.appendChild(document.createTextNode(percent + '%'));
      } else {
        // If the number contains any digits, limit them to two
        a.appendChild(document.createTextNode(count % 1 ? count.toFixed(2) : count));
      }
      a.setAttribute('href', '#');
      a.setAttribute('sourceIDs', JSON.stringify(sourceIDs));
      a.setAttribute('partnerIDs', JSON.stringify(partnerIDs));
      a.setAttribute('type', sourceType);
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
    var options = new CATMAID.OptionsDialog("Group properties");
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

  // The available color options for
  var colorOptions = ["None"].concat(Object.keys(colorbrewer));

  // The available sort options for rows and columns
  var sortOptions = [
    {
      name: 'No Sorting',
      sort: null /* No-op */
    },
    {
      name: 'ID',
      sort: function(desc, matrix, src, otherSrc, isRow, a, b) {
        var c = CATMAID.tools.compareStrings('' + a, '' + b);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Name',
      sort: function(desc, matrix, src, otherSrc, isRow, a, b) {
        // Compare against the group name, if a or b is a group,
        // otherwise use the name of the neuron name service.
        var nns = CATMAID.NeuronNameService.getInstance();
        a = src.isGroup(a) ? a : nns.getName(a);
        b = src.isGroup(b) ? b : nns.getName(b);
        var c = CATMAID.tools.compareStrings('' + a, '' + b);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Order of other',
      sort: function(desc, matrix, src, otherSrc, isRow, a, b) {
        // Get index of a and b in other dimensions
        var ia = otherSrc.orderedElements.indexOf(a);
        var ib = otherSrc.orderedElements.indexOf(b);
        // If either a or b is -1, meaning they were not found in the other
        // dimension, the columns not found will be pushed to the end.
        if (-1 === ia || -1 === ib) {
          return -1;
        } else {
          return ia === ib ? 0 : (ia < ib ? -1 : 1);
        }
      }
    },
    {
      name: 'Max synapse count',
      sort: function(desc, matrix, src, otherSrc, isRow, a, b) {
        var c = compareDescendingSynapseCount(matrix, src, isRow, a, b);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Output synapse count',
      sort: function(desc, matrix, src, otherSrc, isRow, a, b) {
        var c = compareDescendingSynapseCount(matrix, src, isRow, a, b, true);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Total synapse count',
      sort: function(desc, matrix, src, otherSrc, isRow, a, b) {
        var c =  compareDescendingTotalSynapseCount(matrix, src, isRow, a, b);
        return desc ? -1 * c : c;
      }
    }
  ];

  /**
   * Compare by the maximum synapse count in rows or columns a and b. If the
   * preToPost parameter is truthy, only columns will also be ordered by synapse
   * count from row-to-column (pre to post).
   */
  var compareDescendingSynapseCount = function(matrix, src, isRow, a, b, preToPost) {
    var m = matrix.connectivityMatrix;
    if (isRow || preToPost) {
      // Find maximum synapse counts in the given rows
      var ia = matrix.rowSkeletonIDs.indexOf(a);
      var ib = matrix.rowSkeletonIDs.indexOf(b);
      var ca = m[ia];
      var cb = m[ib];
      // If only pre-to-post (row-to-column) connections should be taken into
      // account and a column doesn't exist as row, it is pushed to the end.
      if (!ca) {
        if (preToPost) return -1;
        else throw new CATMAID.ValueError("Invalid column: " + ia);
      }
      if (!cb) {
        if (preToPost) return -1;
        throw new CATMAID.ValueError("Invalid column: " + ib);
      }
      return compareMaxInArray(ca, cb);
    } else {
      var ia = matrix.colSkeletonIDs.indexOf(a);
      var ib = matrix.colSkeletonIDs.indexOf(b);
      var maxa = 0, maxb = 0;
      for (var i=0; i<matrix.getNumberOfRows(); ++i) {
        if (m[i][ia].count > maxa) maxa = m[i][ia].count;
        if (m[i][ib].count > maxb) maxb = m[i][ib].count;
      }
      return maxa === maxb ? 0 : (maxa > maxb ? 1 : -1);
    }
  };

  /**
   * Compare by the accumulated synapse count in rows or columns a and b.
   */
  var compareDescendingTotalSynapseCount = function(matrix, src, isRow, a, b) {
    // Aggregate synapses over all rows respective columns
    var aAll = 0, bAll = 0;
    var m = matrix.connectivityMatrix;
    if (isRow) {
      var ia = matrix.rowSkeletonIDs.indexOf(a);
      var ib = matrix.rowSkeletonIDs.indexOf(b);
      var nCols = matrix.getNumberOfColumns();
      for (var j=0; j<nCols; ++j) {
        aAll += m[ia][j].count;
        bAll += m[ib][j].count;
      }
    } else {
      var ia = matrix.colSkeletonIDs.indexOf(a);
      var ib = matrix.colSkeletonIDs.indexOf(b);
      var nRows = matrix.getNumberOfRows();
      for (var j=0; j<nRows; ++j) {
        aAll += m[j][ia].count;
        bAll += m[j][ib].count;
      }
    }
    // Compare aggregated synapses
    return aAll === bAll ? 0 : (aAll > bAll ? 1 : -1);
  };

  /**
   * Return 1 if array contains a higher value than any other value in array b.
   * -1 if array b contains a higher value than array a. If their maximum value
   *  is the same, return 0.
   */
  var compareMaxInArray = function(a, b) {
    var maxa = 0;
    for (var i=0; i<a.length; ++i) {
      if (a[i].count > maxa) maxa = a[i].count;
    }
    var maxb = 0;
    for (var i=0; i<b.length; ++i) {
      if (b[i].count > maxb) maxb = b[i].count;
    }
    return maxa === maxb ? 0 : (maxa > maxb ? 1 : -1);
  };

  /**
   * Get color for a particular cell value, optionally bounded with a minimum
   * and maximum value.
   */
  var getColor = function(scheme, value, minValue, maxValue) {
    var bg = null;
    if (!scheme || "None" === scheme) return;
    else if (value < minValue) return;
    else if (colorbrewer.hasOwnProperty(scheme)) {
      var sets = colorbrewer[scheme];
      var range = maxValue - minValue + 1;
      var relValue = value - minValue;
      if (sets.hasOwnProperty(range)) {
        // Perfect, one available scale fits our range
        bg = sets[range][relValue];
      } else {
        // Scale range to fit value
        var maxLength = Object.keys(sets).reduce(function(mv, v) {
          v = parseInt(v, 10);
          return v > mv ? v : mv;
        }, 0);
        var index = Math.min(maxLength - 1, Math.round(relValue * maxLength / range));
        bg = sets[maxLength][index];
      }
    }

    return bg;
  };

  /**
   * Set background color of a DOM element according to the given color scheme.
   */
  var colorize = function(element, scheme, value, minValue, maxValue) {
    // Set background or return if there was no color found for this value
    var bg = getColor(scheme, value, minValue, maxValue);
    if (!bg) {
      return;
    }
    element.style.backgroundColor = bg;

    // Heuristic to find foreground color for children
    var fg = CATMAID.tools.getContrastColor(bg);
    for (var i=0; i<element.childNodes.length; ++i) {
      element.childNodes[i].style.color = fg;
    }
  };

  /**
   * If the skeleton list has only one entry, this skeleton is selected and
   * the view is moved to its closest node of it. Otherwise, a selection
   * table, with all skeletons of the list appended, will be opened.
   */
  function followSkeletonList(skeletonIDs) {
    if (!skeletonIDs || !skeletonIDs.length) {
      CATMAID.warn('Could not find expected list of skleton IDs');
      return;
    }
    if (1 === skeletonIDs.length) {
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonIDs[0]);
    } else {
      var models = skeletonIDs.reduce(function(o, skid) {
        o[skid] = new CATMAID.SkeletonModel(skid, "",
            new THREE.Color(1, 1, 0));
        return o;
      }, {});
      WindowMaker.create('selection-table').widget.append(models);
    }
  }

  // Register widget
  CATMAID.registerWidget({
    name: 'Connectivity Matrix',
    key: "connectivity-matrix",
    description: 'Aggregate partner connections and display them in a matrix',
    creator: ConnectivityMatrixWidget,
    state: {
      getState: function(widget) {
        return {
          synapseThreshold: widget.synapseThreshold,
          color: widget.color,
          rowSorting: widget.rowSorting,
          colSorting: widget.colSorting,
          rowSortingDesc: widget.rowSortingDesc,
          colSortingDesc: widget.colSortingDesc,
          rotateColumnHeaders: widget.rotateColumnHeaders,
          displayOrderFields: widget.displayOrderFields
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, 'synapseThreshold');
        CATMAID.tools.copyIfDefined(state, widget, 'color');
        CATMAID.tools.copyIfDefined(state, widget, 'rowSorting');
        CATMAID.tools.copyIfDefined(state, widget, 'colSorting');
        CATMAID.tools.copyIfDefined(state, widget, 'rowSortingDesc');
        CATMAID.tools.copyIfDefined(state, widget, 'colSortingDesc');
        CATMAID.tools.copyIfDefined(state, widget, 'rotateColumnHeaders');
        CATMAID.tools.copyIfDefined(state, widget, 'displayOrderFields');
      }
    }
  });

})(CATMAID);
