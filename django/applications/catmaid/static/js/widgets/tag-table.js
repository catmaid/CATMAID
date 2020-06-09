(function(CATMAID) {

  "use strict";

  var TagTable = function() {
    this.widgetID = this.registerInstance();
    this.idPrefix = `tag-table${this.widgetID}-`;

    /**
     * Skeleton source which is registered and other widgets can use
     */
    this.resultSkeletons = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this
    });

    var constrainSkelsAndRedraw = this.constrainSkelsAndRedraw.bind(this);

    /**
     * Internal skeleton source used for filtering
     */
    this.constraintSkeletons = new CATMAID.BasicSkeletonSource(this.getName() + ' Input', {
      register: false,
      handleAddedModels: constrainSkelsAndRedraw,
      handleChangedModels: constrainSkelsAndRedraw,
      handleRemovedModels: constrainSkelsAndRedraw
    });

    this.oTable = null;  // Initialise DataTables API instance
  };

  $.extend(TagTable.prototype, new InstanceRegistry());

  TagTable.prototype.getName = function() {
    return 'Tag Table ' + this.widgetID;
  };

  /**
   *  {
   *    labelName1: {
   *      'labelIDs': Set([labelID1, labelID2, ...]),
   *      'labelName': labelName1,
   *      'skelIDs': Set([skelID1, skelID2, ...]),
   *      'nodeIDs': Map([[nodeID1, skelIDX], [nodeID2, skelIDY], ...]),
   *      'checked': isChecked
   *    },
   *    labelName2: ...
   *  }
   *
   * @type {{}}
   */
  var responseCache = {};

  TagTable.prototype.setConstrainText = function() {
    var count = this.constraintSkeletons.getNumberOfSkeletons();
    var element = document.getElementById(this.idPrefix + 'source-controls');
    element.title = `${count} skeleton${count === 1 ? '' : 's'} selected`;
  };

  /**
   * Clear the table and repopulate it using only data relating to the selected skeletons. If no skeletons are
   * selected, show the data for the whole project.
   *
   * Sorting and selection status should be conserved, but any labels not associated with the selected skeletons
   * will be deselected.
   */
  TagTable.prototype.constrainSkelsAndRedraw = function() {
    this.oTable.clear();

    var constraintSkels = this.constraintSkeletons.getSelectedSkeletons();
    var rowObjs = [];
    for (var key of Object.keys(responseCache).sort(function(a, b) {return a.localeCompare(b);} )) {
      // look at rows in lexicographic order

      var skelIntersection = constraintSkels.length ?  // if there are no selected skeletons, show everything in the project
        responseCache[key].skelIDs.intersection(constraintSkels) : responseCache[key].skelIDs;

      if (skelIntersection.size) {  // only labels applied to nodes in filtered skels
        var nodeCount = 0;
        for (var skelID of responseCache[key].nodeIDs.values()) {
          nodeCount += skelIntersection.has(skelID);
        }

        rowObjs.push({
          'labelName': key,
          'skelCount': skelIntersection.size,
          'nodeCount': nodeCount,
          'checked': responseCache[key].checked
        });
      } else {
        responseCache[key].checked = false;  // if the row isn't going to be displayed, uncheck it
      }
    }

    this.oTable.rows.add(rowObjs);
    this.oTable.draw();

    this.syncResultSkeletonSource();
  };

  /**
   * Set the skeleton source to reflect data in the table
   */
  TagTable.prototype.syncResultSkeletonSource = function() {
    var areInSource = new Set(this.resultSkeletons.getSelectedSkeletons());

    var shouldBeInSource = new Set();
    for (var labelName of Object.keys(responseCache)) {
      if (responseCache[labelName].checked) {
        shouldBeInSource.addAll(responseCache[labelName].skelIDs);
      }
    }

    var constraintSkeletons = this.constraintSkeletons.getSelectedSkeletons();

    if (constraintSkeletons.length) {
      shouldBeInSource = shouldBeInSource.intersection(constraintSkeletons);
    }

    this.addAndSubtractFromResultSkeletonSource({
      add: Array.from(shouldBeInSource.difference(areInSource)),
      subtract: Array.from(areInSource.difference(shouldBeInSource))
    });

    $(`#${this.idPrefix}datatable_processing`).hide();
  };

  /**
   * Escape any characters which would usually be treated specially as a regex
   *
   * @param text
   * @returns String
   */
  var escapeRegexStr = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
  };

  /**
   * Create a regex which will match any of the strings in an array.
   *
   * EDGE CASES: If any item of the array includes a comma followed by a space, substrings of it may be matched.
   *
   * @param arr
   * @returns {string|*|A}
   */
  var stringListToRegexStr = function(arr) {
    var escapedStrings = arr.map(function(item) {
      // match only if the string is preceded by comma-space or the start of the string
      // AND is followed by comma-space or the end of the string
      return '(((\\,\\s)|^)' + escapeRegexStr(item) + '((\\,\\s)|$))';
    });
    return escapedStrings.join('|');  // use alternation so any will be matched
  };

  TagTable.prototype.getSelectedLabelNames = function() {
    return Object.keys(responseCache).filter(function(item) {
      return responseCache[item].checked;
    });
  };

  TagTable.prototype.getWidgetConfiguration = function() {
    var self = this;
    var tableID = this.idPrefix + 'datatable';
    return {
      helpText: 'Tag Table widget: See an overview of the tag usage in the project or within a set of skeletons',
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var sourceControls = document.createElement('label');
        sourceControls.appendChild(document.createTextNode('Constrain by: '));
        sourceControls.title = '0 skeletons selected';
        sourceControls.id = self.idPrefix + 'source-controls';
        controls.append(sourceControls);

        var sourceSelect = CATMAID.skeletonListSources.createSelect(this.constraintSkeletons,
          [this.resultSkeletons.getName()]);
        sourceControls.appendChild(sourceSelect);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Add");
        add.onclick = function() {
          self.constraintSkeletons.loadSource.bind(self.constraintSkeletons)();
          self.setConstrainText();
        };
        sourceControls.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = function() {
          self.constraintSkeletons.clear();
          self.setConstrainText();
        };
        sourceControls.appendChild(clear);

        // var constrainText = document.createElement('p');
        // constrainText.setAttribute('id', self.idPrefix + 'constrain-text');
        // constrainText.innerText = 'Constraining by 0 skeletons';
        //
        // controls.appendChild(constrainText);

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = self.refreshDataAndRedraw.bind(self);
        controls.appendChild(refresh);

        var openTable = document.createElement('input');
        openTable.setAttribute('type', 'button');
        openTable.setAttribute('value', 'Open Node Table');
        openTable.setAttribute('title', 'Open a Treenode Table focused on the selected nodes');
        openTable.onclick = function() {
          var selectedModels = self.resultSkeletons.getSelectedSkeletonModels();
          var nodeTable = WindowMaker.create('treenode-table').widget;

          // add skeletons which have the nodes in question
          nodeTable.append(selectedModels);

          // do not filter on treenode type
          document.getElementById(nodeTable.idPrefix + 'search-type').value = '';

          // add selected tags as a search string using alternation in regex, and trigger it
          var searchLabel = document.getElementById(nodeTable.idPrefix + 'search-labels');
          var regex = stringListToRegexStr(self.getSelectedLabelNames());
          nodeTable.oTable
            .column(searchLabel.closest('th'))
            .search(regex, true, false, false);  // treat as regex, disable smart search, case sensitive
        };
        controls.appendChild(openTable);

        controls.append(document.createElement('br'));
        var showingText = document.createElement('p');
        showingText.setAttribute('id', self.idPrefix + 'selected-text');

        controls.append(showingText);
      },
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        var self = this;

        container.innerHTML =
          `<table cellpadding="0" cellspacing="0" border="0" class="display" id="${tableID}">` +
          '<thead>' +
          '<tr>' +
          '<th>select' +
          `<input type="checkbox" name="selectAll" id="${self.idPrefix + 'select-all'}"/>` +
          '</th>' +
          '<th>tag' +
            `<input type="text" name="searchInputLabel" id="${self.idPrefix + 'search-input-label'}" ` +
              'value="Search" class="search_init"/>' +
          '</th>' +
          '<th>skeletons</th>' +
          '<th>nodes</th>' +
          '</tr>' +
          '</thead>' +
          '<tfoot>' +
          '<tr>' +
          '<th>select</th>' +
          '<th>tag</th>' +
          '<th>skeletons</th>' +
          '<th>nodes</th>' +
          '</tr>' +
          '</tfoot>' +
          '<tbody>' +
          '</tbody>' +
          '</table>';
      },
      init: function() {
        this.init(project.getId());
      }
    };
  };

  TagTable.prototype.setSelectedText = function() {
    var selectedLabels = new Set();
    var selectedSkels = new Set();
    var selectedNodes = new Set();

    var constrainSkels = new Set(this.constraintSkeletons.getSelectedSkeletons());
    var emptyConstrainSkels = !constrainSkels.size;

    for (var labelID of Object.keys(responseCache)) {
      if (responseCache[labelID].checked) {
        selectedLabels.add(labelID);

        if (emptyConstrainSkels) {
          selectedSkels.addAll(responseCache[labelID].skelIDs);
        } else {
          selectedSkels.addAll(responseCache[labelID].skelIDs.intersection(constrainSkels));
        }

        for (var [nodeID, skelID] of responseCache[labelID].nodeIDs.entries()) {
          if (emptyConstrainSkels || constrainSkels.has(skelID)) {
            selectedNodes.add(nodeID);
          }
        }
      }
    }

    document.getElementById(this.idPrefix + 'selected-text').innerText = '' +
      `Selected ${selectedLabels.size} tag${selectedLabels.size === 1 ? '' : 's'}, ` +
      `${selectedSkels.size} skeleton${selectedSkels.size === 1 ? '' : 's'}, ` +
      `${selectedNodes.size} node${selectedNodes.size === 1 ? '' : 's'}`;
  };

  var skelIDsToModels = function (skelIDs) {
    return skelIDs.reduce(function (mappingObj, currentID) {
      mappingObj[currentID] = new CATMAID.SkeletonModel(currentID);
      return mappingObj;
    }, {});
  };

  /**
   * Update the skeleton source the widget uses to export skeletons
   *
   * @param {Object} obj - skeleton IDs to add or subtract from skeleton source
   * @param {number[]} obj.add - array of skeleton IDs to add to skeleton source
   * @param {number[]} obj.subtract - array of skeleton IDs to subtract from skeleton source
   */
  TagTable.prototype.addAndSubtractFromResultSkeletonSource = function(obj) {
    // Update the skeleton source run by the widget
    this.resultSkeletons.append(skelIDsToModels(obj.add));
    this.resultSkeletons.removeSkeletons(obj.subtract);

    this.setSelectedText();
  };

  TagTable.prototype.createCheckbox = function(checked, type, row) {
    if (type ==='display') {
      var $checkbox = $('<input />', {
        type:'checkbox',
        class:'skelSelector',
        id: this.idPrefix + 'skelselector' + row.id,
        value: row.id,
        checked: checked
      });

      return $checkbox.prop('outerHTML');
    } else {
      return checked ? 1 : 0;
    }
  };

  TagTable.prototype.init = function() {
    var self = this;
    var tableID = this.idPrefix + 'datatable';

    var $table = $('#' + tableID);

    this.oTable = $table.DataTable({
      // http://www.datatables.net/usage/options
      "destroy": true,
      "dom": '<"H"lrp>t<"F"ip>',
      "serverSide": false,
      "paging": true,
      "lengthChange": true,
      "autoWidth": false,
      "pageLength": CATMAID.pageLengthOptions[0],
      "lengthMenu": [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      "jQueryUI": true,
      "processing": true,
      "deferRender": true,
      "columns": [
        {
          "data": 'checked',
          "render": self.createCheckbox.bind(self),  // binding may not be necessary
          "orderable": true,
          "className": "center",
          "width": "5%"
        },
        {
          "data": 'labelName',
          "orderable": true,
          "searchable": true,
          "className": "center"
        },
        {
          "data": 'skelCount',
          "orderable": true,
          "className": "center"
        },
        {
          "data": 'nodeCount',
          "orderable": true,
          "className": "center"
        }
      ]
    });

    this.refreshDataAndRedraw();

    $table.on('change', '.skelSelector', function(event) {
      var row = self.oTable.row(event.currentTarget.closest('tr'));
      var currentCheckedState = event.currentTarget.checked;

      row.data().checked = currentCheckedState;
      responseCache[row.data().labelName].checked = currentCheckedState;

      row.invalidate();

      self.syncResultSkeletonSource();
    });

    $(`#${self.idPrefix}select-all`).change(function(event){
      // change all searched-for checkboxes to the same value as the header checkbox

      $(`#${tableID}_processing`).show();  // doesn't show up immediately
      self.oTable.rows({search: 'applied'}).every(function () {
        // rows().every() may be slow, but is the only way to use search: 'applied'
        // using rows().data() hits call stack limit with large data
        var row = this;
        var currentCheckedState = event.currentTarget.checked;

        responseCache[row.data().labelName].checked = currentCheckedState;

        if (row.data().checked != currentCheckedState) {
          row.data().checked = currentCheckedState;
          row.invalidate();
        }
      });

      self.oTable.draw();
      self.syncResultSkeletonSource();
    });

    $(`#${self.idPrefix}search-input-label`).keydown(function (event) {
      // filter table by tag text on hit enter
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        var filter_searchtag = event.currentTarget.value;
        self.oTable
          .column(event.currentTarget.closest('th'))
          .search(filter_searchtag, true, false)
          .draw();
      }
    });

    var $headerInput = $table.find('thead input');

    // prevent sorting the column when focusing on the search field
    $headerInput.click(function (event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $headerInput.focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });
  };

  TagTable.prototype.refreshDataAndRedraw = function() {
    var $processing = $(`#${this.idPrefix}datatable_processing`);

    $processing.show();

    for (var key of Object.keys(responseCache)) {
      delete responseCache[key];
    }
    this.resultSkeletons.clear();

    var self = this;

    CATMAID.fetch(project.id + '/labels/stats', 'GET')
      .then(function(json) {
        responseCache = json.reduce(function(obj, arr) {
          var labelID = arr[0];
          var labelName = arr[1];
          var skelID = arr[2];
          var nodeID = arr[3];

          if (!(labelName in obj)) {
            obj[labelName] = {
              'labelIDs': new Set(),
              'skelIDs': new Set(),
              'nodeIDs': new Map(),
              'checked': false
            };
          }

          obj[labelName].labelIDs.add(labelID);
          obj[labelName].skelIDs.add(skelID);
          obj[labelName].nodeIDs.set(nodeID, skelID);

          return obj;
        }, {});

        self.constrainSkelsAndRedraw();

        $processing.hide();
      }
    )
    .catch(function(error) {
      $processing.hide();
      CATMAID.handleError(error);
    });
  };

  TagTable.prototype.destroy = function() {
    this.resultSkeletons.destroy();
    this.unregisterInstance();
  };

  CATMAID.registerWidget({
    name: "Tag Table",
    description: "List all tagged nodes of a skeleton",
    key: 'tag-table',
    creator: TagTable
  });

})(CATMAID);
