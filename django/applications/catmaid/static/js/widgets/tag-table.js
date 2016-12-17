/* -*- mode: espresso; espresso-indent-level: 8; indent-tabs-mode: t -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var CACHE_TIMEOUT = 5*60*1000;  // cache invalidation timeout in ms

  var TagTable = function() {
    this.widgetID = this.registerInstance();
    this.selectedSkeletons = new CATMAID.BasicSkeletonSource(this.getName());
    CATMAID.skeletonListSources.updateGUI();
  };

  $.extend(TagTable.prototype, new InstanceRegistry());

  TagTable.prototype.getName = function() {
    return 'Tag Table ' + this.widgetID;
  };

  var labelSkelMappingCache = {};  // todo - button for enabling/disabling cache?

  /**
   *
   * @param labelIDs - array of label IDs
   * @param callback - function which takes a list of skelIDs
   */
  var getSkelIDsFromLabelIDs = function(labelIDs) {
    var remoteLabelIDs = [];
    var skelIDs = new Set();

    var now = Date.now();

    for (var i = 0; i < labelIDs.length; i++) {
      var labelID = labelIDs[i];
      if (labelID in labelSkelMappingCache && now - labelSkelMappingCache[labelID].timestamp <= CACHE_TIMEOUT) {
        skelIDs.addAll(
          labelSkelMappingCache[labelID].skelIDs
        );
      } else {
        remoteLabelIDs.push(labelID);
      }
    }

    if (remoteLabelIDs.length === 0) {
      return Promise.resolve(Array.from(skelIDs));
    }

    return CATMAID.fetch(project.id + '/skeletons/node-labels', 'POST', {
      'label_ids': remoteLabelIDs
    }).then(function(json) {
      now = Date.now();

      for (var i = 0; i < json.length; i++) {
        var labelSkelTuple = json[i];
        labelSkelMappingCache[labelSkelTuple[0]].skelIDs = labelSkelTuple[1];
        labelSkelMappingCache[labelSkelTuple[0]].timestamp = now;
        skelIDs.addAll(labelSkelTuple[1]);
      }

      return Array.from(skelIDs);
    });
  };

  /**
   * Set the skeleton source to reflect data in the table
   */
  TagTable.prototype.syncSkeletonSource = function() {
    var selectedLabelIDs = this.getSelectedLabelIDs();

    getSkelIDsFromLabelIDs(selectedLabelIDs).then((function() {
      var areInSource = new Set(this.selectedSkeletons.getSelectedSkeletons());
      var shouldBeInSource = this.getSelectedLabelIDs().reduce(function(shouldBeInSource, currentValue) {
        return shouldBeInSource.addAll(labelSkelMappingCache[currentValue].skelIDs);
      }, new Set());

      this.addAndSubtractFromSkeletonSource({
        add: Array.from(shouldBeInSource.difference(areInSource)),
        subtract: Array.from(areInSource.difference(shouldBeInSource))
      });

      $("#tag-table" + this.widgetID + '_processing').hide();
    }).bind(this)).catch(CATMAID.handleError);
  };

  TagTable.prototype.getSelectedLabelIDs = function () {
    var selectedLabelIDs = [];
    for (var key in labelSkelMappingCache) {
      if (labelSkelMappingCache.hasOwnProperty(key) && labelSkelMappingCache[key].selected) {
        selectedLabelIDs.push(key);
      }
    }
    return selectedLabelIDs;
  };

  TagTable.prototype.getWidgetConfiguration = function() {
    var tableSelector = "#tag-table" + this.widgetID;
    return {
      // controlsID: 'tag-tableWidgetControls' + this.widgetID,
      // createControls: function(controls) {
      //   // add buttons - see connectivity-matrix.js
      // },
      contentID: 'tag-table-widget' + this.widgetID,
      createContent: function(container) {
        container.innerHTML =
          '<table cellpadding="0" cellspacing="0" border="0" class="display" id="' + "tag-table" + this.widgetID + '">' +
          '<thead>' +
          '<tr>' +
          '<th>tag id' +
            '<input type="number" name="searchInputID" id="tag-table' +
                this.widgetID +
                'searchInputID' +
              '" value="Search"' +
            '/>' +
          '</th>' +
          '<th>tag name' +
            '<input type="text" name="searchInputLabel" id="tag-table' +
                this.widgetID +
                'searchInputLabel' +
              '" value="Search" class="search_init" ' +
            '/>' +
          '</th>' +
          '<th>skeletons</th>' +
          '<th>select skeletons' +
          '<input type="checkbox" name="selectAllSkels" id="tag-table' +
            this.widgetID +
            'selectAllSkels' +
          '" value="selectAllSkels"' +
          '/>' +
          '</th>' +
          '<th>nodes</th>' +
          '</tr>' +
          '</thead>' +
          '<tfoot>' +
          '<tr>' +
          '<th>tag id</th>' +
          '<th>tag name</th>' +
          '<th>skeletons</th>' +
          '<th>select skeletons</th>' +
          '<th>nodes</th>' +
          '</tr>' +
          '</tfoot>' +
          '<tbody>' +
          '</tbody>' +
          '</table>';

        CATMAID.fetch(project.id + '/labels/stats', 'GET')  // ~5s
          .then(function(json) {
            var rowObjs = json.map(function(arr) {
              labelSkelMappingCache[arr[0]] = {
                skelIDs: [],
                timestamp: -CACHE_TIMEOUT,
                selected: false
              };
              return {
                id: arr[0],
                tag: arr[1],
                skeletons: arr[2],
                nodes: arr[3],
                checked: false
              };
            });

            var table = $(tableSelector).DataTable();

            table.rows.add(rowObjs);
            table.draw();

            $(tableSelector + '_processing').hide();
          }
        );
      },
      init: function() {
        this.init(project.getId());
      }
    };
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
    this.selectedSkeletons.append(
      obj.add.reduce(function (mappingObj, currentID) {
        mappingObj[currentID] = new CATMAID.SkeletonModel(currentID);
        return mappingObj;
      }, {})
    );
    this.selectedSkeletons.removeSkeletons(obj.subtract);
  };

  Set.prototype.difference = function(otherSet) {  // separate function?
    var difference = new Set(this);
    otherSet.forEach(function(elem) {
      difference.delete(elem);
    });
    return difference;
  };

  Set.prototype.addAll = function(array) {  // separate function?
    for (var i = 0; i < array.length; i++) {
      this.add(array[i]);
    }
    return this;
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
    var widgetID = this.widgetID;
    var tableSelector = "#tag-table" + widgetID;

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
          "data": 'id',
          "orderable": true,
          "searchable": true,
          "className": "center"
        },
        {
          "data": 'tag',
          "orderable": true,
          "searchable": true,
          "className": "center"
        },
        {
          "data": 'skeletons',
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
          "data": 'nodes',
          "orderable": true,
          "className": "center"
        }
      ]
    });

    $(tableSelector + '_processing').show();

    $(this.oTable).on('change', '.skelSelector', (function(event) {
      var table = this.oTable.DataTable();
      var row = table.row(event.currentTarget.closest('tr'));
      var currentCheckedState = event.currentTarget.checked;
      row.data().checked = currentCheckedState;
      labelSkelMappingCache[row.data().id].selected = currentCheckedState;
      row.invalidate();
      if (currentCheckedState) {  // if checking box, just add
        getSkelIDsFromLabelIDs([row.data().id]).then((function() {
          if (row.data().checked) {
            this.addAndSubtractFromSkeletonSource({
              add: labelSkelMappingCache[row.data().id].skelIDs,
              subtract: []
            });
          }
        }).bind(this)).catch(CATMAID.handleError);
      } else {  // if unchecking box, run full sync
        this.syncSkeletonSource();
      }
    }).bind(this));

    $(tableSelector + 'selectAllSkels').change((function(event){
      // change all searched-for checkboxes to the same value as the header checkbox
      var table = this.oTable.DataTable();
      $(tableSelector + '_processing').show();  // doesn't show up immediately
      table.rows({search: 'applied'}).every(function () {
        // rows().every() may be slow, but is the only way to use search: 'applied'
        // using rows().data() hits call stack limit with large data
        var row = this;
        var currentCheckedState = event.currentTarget.checked;
        labelSkelMappingCache[row.data().id].selected = currentCheckedState;
        if (row.data().checked != currentCheckedState) {
          row.data().checked = currentCheckedState;
          row.invalidate();
        }
      });

      table.draw();
      this.syncSkeletonSource();
    }).bind(this));

    $(tableSelector + "searchInputLabel").keydown((function (event) {
      // filter table by tag text on hit enter
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        // Filter with a regular expression
        var filter_searchtag = event.currentTarget.value;
        this.oTable.DataTable()
          .column(event.currentTarget.closest('th'))
          .search(filter_searchtag, true, false)
          .draw();
      }
    }).bind(this));

    $(tableSelector + "searchInputID").keydown((function (event) {
      // filter table by tag text on hit enter
      if (event.which == 13) {
        event.stopPropagation();
        event.preventDefault();
        var filter_searchid = event.currentTarget.value;
        this.oTable.DataTable()
          .column(event.currentTarget.closest('th'))
          .search(filter_searchid, false, false)
          .draw();
      }
    }).bind(this));

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
