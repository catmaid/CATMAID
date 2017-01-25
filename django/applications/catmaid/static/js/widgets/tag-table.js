/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var TagTable = function() {
    this.widgetID = this.registerInstance();
    this.selectedSkeletons = new CATMAID.BasicSkeletonSource(this.getName());
    CATMAID.skeletonListSources.updateGUI();
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
   *      'nodeIDs': Set([nodeID1, nodeID2, ...]),
   *      'checked': isChecked
   *    },
   *    labelName2: ...
   *  }
   *
   * @type {{}}
   */
  var responseCache = {};

  /**
   * Set the skeleton source to reflect data in the table
   */
  TagTable.prototype.syncSkeletonSource = function() {
    var areInSource = new Set(this.selectedSkeletons.getSelectedSkeletons());

    var shouldBeInSource = new Set();
    for (var skelName of Object.keys(responseCache)) {
      if (responseCache[skelName].checked) {
        shouldBeInSource.addAll(responseCache[skelName].skelIDs);
      }
    }

    this.addAndSubtractFromSkeletonSource({
      add: Array.from(shouldBeInSource.difference(areInSource)),
      subtract: Array.from(areInSource.difference(shouldBeInSource))
    });

    $("#tag-table" + this.widgetID + '_processing').hide();
  };

  var escapeRegexStr = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
  };

  var stringListToRegexStr = function(arr) {
    var escapedStrings = arr.map(function(item) {
      return '(((\\,\\s)|^)' + escapeRegexStr(item) + '((\\,\\s)|$))';
    });
    return escapedStrings.join('|');
  };

  TagTable.prototype.getSelectedLabelNames = function() {
    return Object.keys(responseCache).filter(function(item) {
      return responseCache[item].checked;
    });
  };

  TagTable.prototype.getWidgetConfiguration = function() {
    var tableSelector = "#tag-table" + this.widgetID;
    return {
      controlsID: 'tag-tableWidgetControls' + this.widgetID,
      createControls: function(controls) {
        var self = this;

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = function() {
          $(tableSelector).DataTable().clear();
          self.selectedSkeletons.clear();
          for (var key of Object.keys(responseCache)) {
            delete responseCache[key];
          }
          self.init();
        };
        controls.appendChild(refresh);

        var openTable = document.createElement('input');
        openTable.setAttribute('type', 'button');
        openTable.setAttribute('value', 'Open Node Table');
        openTable.setAttribute('title', 'Open a Treenode Table focused on the selected nodes');
        openTable.onclick = function() {
          var selectedModels = self.selectedSkeletons.getSelectedSkeletonModels();
          var nodeTable = WindowMaker.create('node-table').widget;

          // add skeletons which have the nodes in question
          nodeTable.append(selectedModels);

          // do not filter on treenode type
          document.getElementById(nodeTable.idPrefix + 'search-type').value = '';

          // add selected tags as a search string using alternation in regex, and trigger it
          var searchLabel = document.getElementById(nodeTable.idPrefix + 'search-labels');
          var regex = stringListToRegexStr(self.getSelectedLabelNames());
          nodeTable.oTable.DataTable()
            .column(searchLabel.closest('th'))
            .search(regex, true, false, false);  // treat as regex, disable smart search, case sensitive
        };
        controls.appendChild(openTable);
      },
      contentID: 'tag-table-widget' + this.widgetID,
      createContent: function(container) {
        var self = this;

        container.innerHTML =
          '<table cellpadding="0" cellspacing="0" border="0" class="display" id="' + "tag-table" + self.widgetID + '">' +
          '<thead>' +
          '<tr>' +
          '<th>tag' +
            '<input type="text" name="searchInputLabel" id="tag-table' +
                self.widgetID +
                'searchInputLabel' +
              '" value="Search" class="search_init" ' +
            '/>' +
          '</th>' +
          '<th>skeletons</th>' +
          '<th>select skeletons' +
          '<input type="checkbox" name="selectAllSkels" id="tag-table' +
            self.widgetID +
            'selectAllSkels' +
          '" value="selectAllSkels"' +
          '/>' +
          '</th>' +
          '<th>nodes</th>' +
          '</tr>' +
          '</thead>' +
          '<tfoot>' +
          '<tr>' +
          '<th>tag</th>' +
          '<th>skeletons</th>' +
          '<th>select skeletons</th>' +
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
  TagTable.prototype.addAndSubtractFromSkeletonSource = function(obj) {
    // Update the skeleton source run by the widget
    this.selectedSkeletons.append(skelIDsToModels(obj.add));
    this.selectedSkeletons.removeSkeletons(obj.subtract);
  };

  var createCheckbox = function(checked, type, row) {
    if (type ==='display') {
      var checkbox = $('<input />', {
        type:'checkbox',
        class:'skelSelector',
        id: 'skelSelector' + row.id,
        value: row.id,
        checked: checked
      });

      return checkbox.prop('outerHTML');
    } else {
      return checked ? 1 : 0;
    }
  };

  TagTable.prototype.init = function() {
    var self = this;
    var widgetID = this.widgetID;
    var tableSelector = "#tag-table" + widgetID;

    CATMAID.fetch(project.id + '/labels/stats', 'GET')
      .then(function(json) {
        var responseObj = json.reduce(function(obj, arr) {
          var labelID = arr[0];
          var labelName = arr[1];
          var skelID = arr[2];
          var nodeID = arr[3];

          if (!(labelName in obj)) {
            obj[labelName] = {
              'labelIDs': new Set(),
              'skelIDs': new Set(),
              'nodeIDs': new Set(),
              'checked': false
            };
          }

          obj[labelName].labelIDs.add(labelID);
          obj[labelName].skelIDs.add(skelID);
          obj[labelName].nodeIDs.add(nodeID);

          return obj;
        }, {});

        responseCache = responseObj;

        var rowObjs = [];
        for (var key of Object.keys(responseObj)) {
          if (responseObj[key].nodeIDs.size) {  // only labels applied to nodes
            rowObjs.push({
              'labelName': key,
              'skelCount': responseObj[key].skelIDs.size,
              'nodeCount': responseObj[key].nodeIDs.size,
              'checked': false
            });
          }
        }

        var table = $(tableSelector).DataTable();

        table.rows.add(rowObjs);
        table.draw();

        $(tableSelector + '_processing').hide();
      }
    );

    this.oTable = $(tableSelector).dataTable({  // use ajax data source directly?
      // http://www.datatables.net/usage/options
      "bDestroy": true,
      "sDom": '<"H"lrp>t<"F"ip>',
      "bServerSide": false,
      "paging": true,
      "bLengthChange": true,
      "bAutoWidth": false,
      "iDisplayLength": CATMAID.pageLengthOptions[0],
      "aLengthMenu": [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      "bJQueryUI": true,
      "processing": true,
      "deferRender": true,
      "columns": [
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
          "data": 'checked',
          "render": function(data, type, full) { return createCheckbox(data, type, full); },
          "orderable": true,
          "className": "center",
          "width": "5%"
        },
        {
          "data": 'nodeCount',
          "orderable": true,
          "className": "center"
        }
      ]
    });

    $(tableSelector + '_processing').show();

    $(this.oTable).on('change', '.skelSelector', function(event) {
      var table = self.oTable.DataTable();
      var row = table.row(event.currentTarget.closest('tr'));
      var currentCheckedState = event.currentTarget.checked;

      row.data().checked = currentCheckedState;
      responseCache[row.data().labelName].checked = currentCheckedState;

      row.invalidate();

      if (currentCheckedState) {  // if checking box, just add
        self.addAndSubtractFromSkeletonSource({
          add: Array.from(responseCache[row.data().labelName].skelIDs),
          subtract: []
        });
      } else {  // if unchecking box, run full sync
        self.syncSkeletonSource();
      }
    });

    $(tableSelector + 'selectAllSkels').change(function(event){
      // change all searched-for checkboxes to the same value as the header checkbox
      var table = self.oTable.DataTable();

      $(tableSelector + '_processing').show();  // doesn't show up immediately
      table.rows({search: 'applied'}).every(function () {
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

      table.draw();
      self.syncSkeletonSource();
    });

    $(tableSelector + "searchInputLabel").keydown(function (event) {
      // filter table by tag text on hit enter
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        var filter_searchtag = event.currentTarget.value;
        self.oTable.DataTable()
          .column(event.currentTarget.closest('th'))
          .search(filter_searchtag, true, false)
          .draw();
      }
    });

    // prevent sorting the column when focusing on the search field
    $(tableSelector + " thead input").click(function (event) {
      event.stopPropagation();
    });

    // remove the 'Search' string when first focusing the search box
    $(tableSelector + " thead input").focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });
  };

  TagTable.prototype.destroy = function() {
    this.selectedSkeletons.destroy();
    this.unregisterInstance();
  };

  CATMAID.registerWidget({key: 'tag-table', creator: TagTable});

})(CATMAID);
