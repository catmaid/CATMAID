/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {


  var LogTable = function() {
    /** Pointer to the existing instance of table. */
    this.logTable = null;
    this.mode = "log";
    this.highlightLocation = true;
  };

  LogTable.prototype.getName = function() {
    return "Log and history";
  };

  LogTable.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: "log_table_controls",
      createControls: function(controls) {
        // Create tabs
        var tabs = CATMAID.DOM.addTabGroup(controls,
            'log_table_controls', ['Log', 'History']);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("id", "update_logtable");
        add.setAttribute("value", "Update table");
        add.onclick = this.update.bind(this);
        tabs['Log'].appendChild(add);
        tabs['Log'].dataset.mode = 'log';

        /* users */
        var sync = document.createElement('select');
        sync.setAttribute("id", "logtable_username");
        var option = document.createElement("option");
        option.text = "All";
        option.value = "All";
        sync.appendChild(option);
        option = document.createElement("option");
        option.text = "Team";
        option.value = "Team";
        sync.appendChild(option);
        var users = CATMAID.User.all();
        for (var userId in users) {
          var user = users[userId];
          var option = document.createElement("option");
          option.text = user.login + " (" + user.fullName + ")";
          option.value = user.id;
          sync.appendChild(option);
        }
        tabs['Log'].appendChild(sync);

        var opType = document.createElement('select');
        opType.setAttribute("id", "logtable_operationtype");
        var option = document.createElement("option");
        option.text = "All";
        option.value = -1;
        option.selected = option.defaultSelected = true;

        opType.appendChild(option);
        var operation_type_array = [
          "rename_root",
          "create_neuron",
          "rename_neuron",
          "remove_neuron",
          "move_neuron",

          "create_skeleton",
          "rename_skeleton",
          "remove_skeleton",
          "move_skeleton",

          "split_skeleton",
          "join_skeleton",
          "reroot_skeleton",

          "change_confidence",

          "reset_reviews"
        ];
        for( var i = 0; i < operation_type_array.length; i++ ) {
          var option = document.createElement("option");
            option.text = operation_type_array[i];
            option.value = operation_type_array[i];
            opType.appendChild(option);
        }
        tabs['Log'].appendChild(opType);

        // History table
        tabs['History'].dataset.mode = 'history';

        var updateHistory = document.createElement('input');
        updateHistory.setAttribute("type", "button");
        updateHistory.setAttribute("value", "Update history table");
        updateHistory.onclick = this.update.bind(this);
        tabs['History'].appendChild(updateHistory);

        var highlightLocLabel = document.createElement('label');
        var highlightLocCb = document.createElement('input');
        highlightLocCb.setAttribute('type', 'checkbox');
        highlightLocCb.checked = this.highlightLocation;
        highlightLocCb.onclick = function() {
          self.highlightLocation = this.checked;
        };
        highlightLocLabel.appendChild(highlightLocCb);
        highlightLocLabel.appendChild(document.createTextNode(
            "Highlight location change"));
        tabs['History'].appendChild(highlightLocLabel);

        var self = this;
        $(controls).tabs({
          activate: function(event, ui) {
            var mode = ui.newPanel.attr('data-mode');
            if (mode === 'log' || mode === 'history') {
              self.mode = mode;
              self.redraw();
            } else {
              CATMAID.warn('Unknown log table mode: ' + mode);
            }
          }
        });
      },
      class: "log-table table-widget",
      contentID: "log_table_content",
      createContent: function(container) {
        var self = this;

        // Log table content
        this.logContainer = document.createElement('div');
        var logTable = document.createElement('table');
        logTable.setAttribute('id', 'logtable');

        logTable.innerHTML =
            '<thead>' +
            '<tr>' +
                '<th>user</th>' +
                '<th>operation</th>' +
                '<th>time (local)</th>' +
                '<th>x</th>' +
                '<th>y</th>' +
                '<th>z</th>' +
                '<th>freetext<input type="text" name="search_freetext" id="search_freetext" value="" class="search_init" /></th>' +
            '</tr>' +
            '</thead>' +
            '<tfoot>' +
            '<tr>' +
                '<th>user</th>' +
                '<th>operation</th>' +
                '<th>time (local)</th>' +
                '<th>x</th>' +
                '<th>y</th>' +
                '<th>z</th>' +
                '<th>freetext</th>' +
            '</tr>' +
            '</tfoot>';

        this.logContainer.appendChild(logTable);
        container.appendChild(this.logContainer);

        this.logTable = $(logTable).dataTable({
          // http://www.datatables.net/usage/options
          "bDestroy": true,
          "sDom": '<"H"lr>t<"F"ip>',
          // default: <"H"lfr>t<"F"ip>
          "bProcessing": true,
          "bServerSide": true,
          "bAutoWidth": false,
          "iDisplayLength": CATMAID.pageLengthOptions[0],
          "sAjaxSource": CATMAID.makeURL(project.id + '/logs/list'),
          "fnServerData": function (sSource, aoData, fnCallback) {
              var user_id = $('#logtable_username').val();
              if (!isNaN(user_id)) {
                  aoData.push({
                      name: "user_id",
                      value: user_id
                  });
              } else if (user_id === 'Team') {
                  aoData.push({
                      name: "whitelist",
                      value: true
                  });
              }
              aoData.push({
                  "name" : "pid",
                  "value" : project.id
              });
              aoData.push({
                  "name": "operation_type",
                  "value" : $('#logtable_operationtype').val() || -1
              });
              aoData.push({
                  "name": "search_freetext",
                  "value" : $('#search_freetext').val()
              });
              $.ajax({
                  "dataType": 'json',
                  "cache": false,
                  "type": "POST",
                  "url": sSource,
                  "data": aoData,
                  "success": fnCallback
              });
          },
          "aLengthMenu": [
            CATMAID.pageLengthOptions,
            CATMAID.pageLengthLabels
          ],
          "bJQueryUI": true,
          "aaSorting": [[ 2, "desc" ]],
          "aoColumns": [
              { // user
                  "bSearchable": false,
                  "bSortable": true
              },
              { // operation
                  "sClass": "center",
                  "bSearchable": false,
                  "bSortable": true
              },
              { // timestamp
                  "sClass": "center",
                  "bSearchable": false,
                  "bSortable": true,
                  render: function(data, type, row, meta) {
                    var d = new Date(data);
                    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
                        + ' ' + d.toLocaleTimeString();
                  }
              },
              { // x
                  "sClass": "center",
                  "bSearchable": false,
                  "bSortable": false
              },
              { // y
                  "sClass": "center",
                  "bSearchable": false,
                  "bSortable": false
              },
              { // z
                  "sClass": "center",
                  "bSearchable": false,
                  "bSortable": false
              },
              { // freetext
                  "bSearchable": false,
                  "bSortable": false
              }
          ]
        });

        $(logTable).on('dblclick', 'tr', function () {
            var aData = self.logTable.fnGetData(this);
            // retrieve coordinates and moveTo
            var x = parseFloat(aData[3]);
            var y = parseFloat(aData[4]);
            var z = parseFloat(aData[5]);
            project.moveTo(z, y, x);
        });

        // History content
        this.historyContainer = document.createElement('div');
        var historyTable = document.createElement('table');
        this.historyContainer.appendChild(historyTable);
        container.appendChild(this.historyContainer);

        // A handler for location change
        var locationChange = function(x, y, z) {
          // Biefly flash new location, if requested
          if (self.highlightLocation) {
            var nFlashes = 3;
            var delay = 100;
            project.getStackViewers().forEach(function(s) {
              s.pulseateReferenceLines(nFlashes, delay);
            });
          }
        };

        this.historyTable = $(historyTable).DataTable({
          dom: "lrphtip",
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          serverSide: true,
          ajax: function(data, callback, settings) {
            var params = -1 === data.length ? undefined : {
              range_start: data.start,
              range_length: data.length
            };
            CATMAID.fetch(project.id +  "/transactions/", "GET", params)
              .then(function(result) {
                callback({
                  draw: data.draw,
                  recordsTotal: result.total_count,
                  recordsFiltered: result.total_count,
                  data: result.transactions
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [
            {
              data: "user_id",
              title: "User",
              orderable: false,
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
            },
            {
              data: "label",
              title: "Operation",
              searchable: true,
              orderable: false,
              render: function(data, type, row, meta) {
                return transactionOperations[data] || ("Unknown (" + data + ")");
              }
            },
            {
              data: "execution_time",
              title: "Time",
              orderable: false,
              render: function(data, type, row, meta) {
                return new Date(row.execution_time);
              }
            },
            {data: "transaction_id", title: "Transaction", orderable: false},
            {data: "change_type", title: "Type", orderable: false}
          ],
        }).on('dblclick', 'tr', function() {
          var data = self.historyTable.row( this ).data();
          if (data) {
            var params = {
              'transaction_id': data.transaction_id,
              'execution_time': data.execution_time
            };
            CATMAID.fetch(project.id + '/transactions/location', 'GET', params)
              .then(function(result) {
                  var x = parseFloat(result.x);
                  var y = parseFloat(result.y);
                  var z = parseFloat(result.z);
                  project.moveTo(z, y, x, undefined,
                      locationChange.bind(window, x, y, z));
              })
              .catch(function(error) {
                if (error instanceof CATMAID.LocationLookupError) {
                  CATMAID.warn(error.message);
                } else {
                  // Re-throw exception
                  throw error;
                }
              })
              .catch(CATMAID.handleError);
          }
        });

        this.redraw();
      }
    };
  };

  /**
   * Redraw the complete log table.
   */
  LogTable.prototype.redraw = function() {
    if (this.mode === 'log') {
      this.logContainer.style.display = 'block';
      this.historyContainer.style.display = 'none';
    } else if (this.mode === 'history') {
      this.logContainer.style.display = 'none';
      this.historyContainer.style.display = 'block';
    }
  };

  /**
   * Update and redraw the complete log table.
   */
  LogTable.prototype.update = function() {
    if (this.mode === 'log') {
      this.logTable.fnClearTable( 0 );
      this.logTable.fnDraw();
    } else if (this.mode === 'history') {
      this.historyTable.ajax.reload();
    }
  };

  LogTable.prototype.init = function (pid) {
  };

  // Export log table as singleton instance
  CATMAID.LogTable = new LogTable();

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Log and History",
    description: "List all user actions and data changes",
    key: "log-table",
    creator: LogTable
  });


  // Map transaction operations to more userfriendly labels
  var transactionOperations = {
    "annotations.add": "Add annotation",
    "annotations.remove": "Remove annotations",
    "textlabels.create": "Create text label",
    "textlabels.remove": "Remove text label",
    "textlabels.update": "Update text label",
    "labels.update": "Add or update tags",
    "labels.remove": "Remove tag",
    "labels.remove_unused": "Remove unused labels",
    "links.create": "Create connector link",
    "links.remove": "Remove connector link",
    "connectors.create": "Create connector",
    "connectors.remove": "Remove connector",
    "neurons.give_to_user": "Give neuron to user",
    "neurons.remove": "Remove neuron",
    "neurons.rename": "Rename neuron",
    "nodes.add_or_update_review": "Review node",
    "nodes.update_location": "Update node location",
    "treenodes.create": "Create treenode",
    "treenodes.insert": "Insert treenode",
    "treenodes.remove": "Remove treenode",
    "treenodes.update_confidence": "Update treenode confidence",
    "treenodes.update_parent": "Update treenode parent",
    "treenodes.update_radius": "Update treenode radius",
    "treenodes.suppress_virtual_node": "Suppress virtual node",
    "treenodes.unsuppress_virtual_node": "Unsuppress virtual node",
    "skeletons.reset_own_reviews": "Reset own reviews in skeleton",
    "skeletons.split": "Split skeleton",
    "skeletons.merge": "Merge skeletons",
    "skeletons.reroot": "Reroot skeleton",
    "skeletons.import": "Import skeleton",
    "projects.clear_tags": "Clear tags on project",
    "projects.update_tags": "Update tags on project",
    "stacks.clear_tags": "Clear tags on stack",
    "stacks.update_tags": "Update tags on stacks",
    "ontologies.add_relation": "Add ontology relation",
    "ontologies.rename_relation": "Rename ontology relation",
    "ontologies.remove_relation": "Remove ontology relation",
    "ontologies.remove_all_relations": "Remove all ontology relations",
    "ontologies.add_class": "Add ontology class",
    "ontologies.rename_class": "Rename ontology class",
    "ontologies.remove_class": "Remove ontology class",
    "ontologies.remove_all_classes": "Remove all ontology classes",
    "ontologies.add_link": "Add ontology link",
    "ontologies.remove_link": "Add ontology link",
    "ontologies.remove_all_links": "Remove all ontology links",
    "ontologies.add_restriction": "Add ontology restriction",
    "ontologies.remove_restriction": "Remove ontology restriction",
    "classifications.rebuild_env": "Rebuild classification environment for project",
    "classifications.add_graph": "Add classification graph",
    "classifications.remove_graph": "Remove classification graph",
    "classifications.update_graph": "Update classification graph",
    "classifications.autofill_graph": "Auto-fill classification graph",
    "classifications.link_graph": "Link classification graph",
    "classifications.link_roi": "Link ROI into classification graph",
    "change_requests.approve": "Approve change request",
    "change_requests.reject": "Reject change request",
    "rois.create_link": "Link ROI",
    "rois.remove_link": "Remove link to ROI",
    "rois.create": "Add ROI",
    "clusterings.setup_env": "Rebuild clustering environment for project",
    "volumes.create": "Create volume"
  };

})(CATMAID);
