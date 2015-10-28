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
        var titles = document.createElement('ul');
        controls.appendChild(titles);
        var tabs = ['Main', 'Display'].reduce((function(o, name) {
          var id = name.replace(/ /, '') + this.widgetID;
          titles.appendChild($('<li><a href="#' + id + '">' + name + '</a></li>')[0]);
          var div = document.createElement('div');
          div.setAttribute('id', id);
          controls.appendChild(div);
          o[name] = div;
          return o;
        }).bind(this), {});

        // Create hidden select elements for row and column sources
        var rowSelect = CATMAID.skeletonListSources.createSelect(this.rowDimension);
        rowSelect.style.display = 'none';
        tabs['Main'].appendChild(rowSelect);
        var colSelect = CATMAID.skeletonListSources.createSelect(this.colDimension);
        colSelect.style.display = 'none';
        tabs['Main'].appendChild(colSelect);

        // This UI combines two skeleton source selects into one.
        tabs['Main'].appendChild(document.createTextNode('From'));
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this,
           [this.rowDimension.getName(), this.colDimension.getName()]);
        tabs['Main'].appendChild(sourceSelect);
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
        tabs['Main'].appendChild(synapseThreshold);

        var exportCSV = document.createElement('input');
        exportCSV.setAttribute("type", "button");
        exportCSV.setAttribute("value", "Export CSV");
        exportCSV.onclick = this.exportCSV.bind(this);
        tabs['Main'].appendChild(exportCSV);

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

        $(controls).tabs();
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
   * Clear all selected sources.
   */
  ConnectivityMatrixWidget.prototype.clear = function(clearRows, clearCols) {
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

    WindowMaker.create('connectivity-matrix', widget);
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
            this.matrix, this.rowDimension, true));
    } else if (undefined === rowSort.sort) {
      // Explicitly allow null as no-op
      CATMAID.error('Could not find row sorting function with name ' +
          this.rowSorting);
    }

    // Sort coumn dimensions
    var colSort = sortOptions[this.colSorting];
    if (colSort && CATMAID.tools.isFn(colSort.sort)) {
      this.colDimension.sort(colSort.sort.bind(this, this.colSortingDesc,
            this.matrix, this.colDimension, false));
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
    if (!this.matrix) {
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
    var nns = NeuronNameService.getInstance();
    this.matrix.rowSkeletonIDs = this.rowDimension.getSelectedSkeletons();
    this.matrix.colSkeletonIDs = this.colDimension.getSelectedSkeletons();
    this.matrix.refresh()
      .then(nns.registerAll.bind(nns, this, this.rowDimension.getSelectedSkeletonModels()))
      .then(nns.registerAll.bind(nns, this, this.colDimension.getSelectedSkeletonModels()))
      .then((function() {
        // Clear any message
        if (this.content.dataset.msg) delete this.content.dataset.msg;
        // Create table
        this.refresh();
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
      matrix, content, synThreshold, rotateColumns) {
    // Create table representation for connectivity matrix
    var table = document.createElement('table');
    table.setAttribute('class', 'partner_table');

    // Add column header, prepend one blank cell for row headers
    var colHeader = table.appendChild(document.createElement('tr'));
    colHeader.appendChild(document.createElement('th'));

    // Find maximum connection number in matrix
    var maxConnections = matrix.getMaxConnections();

    // Collect row as well as column names and skeleton IDs
    var rowNames = [], rowSkids = [], colNames = [], colSkids = [];

    var walked = this.walkMatrix(matrix,
        handleColumn.bind(this, colHeader, colNames, colSkids),
        handleRow.bind(window, table, rowNames, rowSkids),
        handleCell.bind(this),
        handleCompletion.bind(this, table, rowNames, rowSkids, colNames, colSkids));

    if (walked) {
      // Add general information paragraph
      var infoBox = document.createElement('div');
      infoBox.appendChild(document.createTextNode('The table below shows the ' +
            'number of post-synaptic connections from row to column skeletons. ' +
            'If there are no connections, no number is shown.'));
      content.appendChild(infoBox);

      // Append matrix to content
      content.appendChild(table);

      // Fix table header height for rotated cells
      var headerHeight = 0;
      $('th.vertical-table-header div').each(function() {
        var height = $(this).outerWidth();
        if (height > headerHeight) headerHeight = height;
      });

      $('th.vertical-table-header').height(headerHeight + 'px');

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
      var th = createHeaderCell(name, colGroup, skeletonIDs, false);
      /* jshint validthis: true */
      if (this.rotateColumnHeaders) {
        th.setAttribute('class', 'vertical-table-header');
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
    function createHeaderCell(name, group, skeletonIDs, isRow) {
      // Make sure we have either a group or a single skeleton ID
      if (!group && skeletonIDs.length > 1) {
        throw new CATMAID.ValueError('Expected either a group or a single skeleton ID');
      }

      // Create element
      var a = document.createElement('a');
      a.href = '#';
      a.setAttribute('data-skeleton-ids', JSON.stringify(skeletonIDs));
      a.setAttribute('data-is-row', isRow);
      a.appendChild(document.createTextNode(name));
      var div = document.createElement('div');
      div.appendChild(a);
      var th = document.createElement('th');
      th.appendChild(div);
      if (group) {
        a.setAttribute('data-group', group);
        th.setAttribute('title', 'This group contains ' + group.length +
            ' skeleton(s): ' + group.join(', '));
      }
      return th;
    }

    // Create cell
    function handleCell(row, rowName, rowSkids, colName, colSkids, connections) {
      /* jshint validthis: true */ // `this` is bound to the connectivity matrix
      var td = createSynapseCountCell("pre", rowName, rowSkids, colName, colSkids,
          connections, synThreshold);
      colorize(td, colorOptions[this.color], connections, synThreshold, maxConnections);
      row.appendChild(td);
    }

    // Create aggretate rows and columns
    function handleCompletion(table, rowNames, rowSkids, colNames, colSkids,
        rowSums, colSums) {
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
            allRowSkids, colNames[c], colSkids[c], colSums[c], synThreshold);
        aggRow.appendChild(td);
      }
      $(table).find("tr:last").after(aggRow);

      // Create aggregate column
      var rotate = this.rotateColumnHeaders;
      $(table).find("tr").each(function(i, e) {
        if (0 === i) {
          var th = document.createElement('th');
          th.appendChild(document.createTextNode('Sum'));
          /* jshint validthis: true */
          if (rotate) {
            th.setAttribute('class', 'vertical-table-header');
          }
          e.appendChild(th);
        } else if (i <= rowSums.length) {
          // Substract one for the header row to get the correct sum index
          var td = createSynapseCountCell("pre", rowNames[i - 1], rowSkids[i - 1],
              "All postsynaptic neurons", allColSkids, rowSums[i - 1], synThreshold);
          e.appendChild(td);
        } else {
          // This has to be the lower right cell of the table. It doesn't matter
          // if we add up rows or columns, it yields the same number.
          var sum = rowSums.reduce(function(s, r) { return s + r; }, 0);
          var td = createSynapseCountCell("pre", "All presynaptic neurons",
              allRowSkids, "All postsynaptic neurons", allColSkids, sum,
              synThreshold);
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
  ConnectivityMatrixWidget.prototype.walkMatrix = function(
      matrix, handleCol, handleRow, handleCell, handleCompletion) {
    var nRows = matrix.getNumberOfRows();
    var nCols = matrix.getNumberOfColumns();
    if (0 === nRows || 0 === nCols) {
      return false;
    }

    var m = matrix.connectivityMatrix;
    var nns = NeuronNameService.getInstance();
    var rowSums = [];
    var colSums = [];

    // Get group information
    var nDisplayRows = this.rowDimension.orderedElements.length;
    var nDisplayCols = this.colDimension.orderedElements.length;

    for (var c=0; c<nDisplayCols; ++c) {
      // Get skeleton or group name
      var id = this.colDimension.orderedElements[c];
      var colGroup = this.colDimension.groups[id];
      var name = colGroup ? id : nns.getName(id);
      var skeletonIDs = colGroup ? colGroup : [id];
      handleCol(id, colGroup, name, skeletonIDs);
    }
    // Add row headers and connectivity matrix rows
    var r = 0;
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
            colGroup ? colGroup.length : 1);

        // Create and handle in and out cells
        var rowSkids = rowGroup ? rowGroup : [rowId];
        var colSkids = colGroup ? colGroup : [colId];
        handleCell(row, rowName, rowSkids, colName, colSkids, connections);

        // Add to row and column sums
        rowSums[dr] = (rowSums[dr] || 0) + connections;
        colSums[dc] = (colSums[dc] || 0) + connections;

        // Increase index for next iteration
        c = colGroup ? c + colGroup.length : c + 1;
      }

      // Increase index for next iteration
      r = rowGroup ? r + rowGroup.length : r + 1;
    }

    if (CATMAID.tools.isFn(handleCompletion)) handleCompletion(rowSums, colSums);

    return true;
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

    var walked = this.walkMatrix(this.matrix, handleColumn.bind(window, lines[0]),
        handleRow.bind(window, lines), handleCell);

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
    function handleCell(line, rowName, rowSkids, colName, colSkids, connections) {
      line.push(connections);
    }
  };

  /**
   * Aggregate the values of a connectivity matrix over the specified number of
   * rows and columns, starting from the given position.
   */
  function aggregateMatrix(matrix, r, c, nRows, nCols) {
    var n = 0;

    for (var i=0; i<nRows; ++i) {
      for (var j=0; j<nCols; ++j) {
        n += matrix[r + i][c + j];
      }
    }

    return n;
  }

  /**
   * Create a synapse count table cell.
   */
  function createSynapseCountCell(sourceType, sourceName, sourceIDs, targetName, partnerIDs,
      count, threshold) {
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
      a.appendChild(document.createTextNode(count));
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
      sort: function(desc, matrix, src, isRow, a, b) {
        var c = CATMAID.tools.compareStrings('' + a, '' + b);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Name',
      sort: function(desc, matrix, src, isRow, a, b) {
        // Compare against the group name, if a or b is a group,
        // otherwise use the name of the neuron name service.
        var nns = NeuronNameService.getInstance();
        a = src.isGroup(a) ? a : nns.getName(a);
        b = src.isGroup(b) ? b : nns.getName(b);
        var c = CATMAID.tools.compareStrings('' + a, '' + b);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Order of other',
      sort: function(desc, matrix, src, isRow, a, b) {
        var ia, ib;
        // Get index of a and b in other dimensions
        if (isRow) {
          ia = matrix.colSkeletonIDs.indexOf(a);
          ib = matrix.colSkeletonIDs.indexOf(b);
        } else {
          ia = matrix.rowSkeletonIDs.indexOf(a);
          ib = matrix.rowSkeletonIDs.indexOf(b);
        }
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
      name: 'Synapse count',
      sort: function(desc, matrix, src, isRow, a, b) {
        var c = compareDescendingSynapseCount(matrix, src, isRow, a, b);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Output synapse count',
      sort: function(desc, matrix, src, isRow, a, b) {
        var c = compareDescendingSynapseCount(matrix, src, isRow, a, b, true);
        return desc ? -1 * c : c;
      }
    },
    {
      name: 'Total synapse count',
      sort: function(desc, matrix, src, isRow, a, b) {
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
        if (m[i][ia] > maxa) maxa = m[i][ia];
        if (m[i][ib] > maxb) maxb = m[i][ib];
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
        aAll += m[ia][j];
        bAll += m[ib][j];
      }
    } else {
      var ia = matrix.colSkeletonIDs.indexOf(a);
      var ib = matrix.colSkeletonIDs.indexOf(b);
      var nRows = matrix.getNumberOfRows();
      for (var j=0; j<nRows; ++j) {
        aAll += m[j][ia];
        bAll += m[j][ib];
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
      if (a[i] > maxa) maxa = a[i];
    }
    var maxb = 0;
    for (var i=0; i<b.length; ++i) {
      if (b[i] > maxb) maxb = b[i];
    }
    return maxa === maxb ? 0 : (maxa > maxb ? 1 : -1);
  };

  /**
   * Set background color of a DOM element according to the given color scheme.
   */
  var colorize = function(element, scheme, value, minValue, maxValue) {
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

    // Set background
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
      var ST = new CATMAID.SelectionTable();
      var models = skeletonIDs.reduce(function(o, skid) {
        o[skid] = new CATMAID.SkeletonModel(skid, "",
            new THREE.Color().setRGB(1, 1, 0));
        return o;
      }, {});
      WindowMaker.create('neuron-staging-area', ST);
      ST.append(models);
    }
  }

})(CATMAID);
