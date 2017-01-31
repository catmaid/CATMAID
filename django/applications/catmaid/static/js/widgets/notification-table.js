/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var NotificationsTable = function() {
    this.widgetID = this.registerInstance();
    this.datatable = null;
  };

  NotificationsTable.initValues = [];

  NotificationsTable.prototype = {};
  $.extend(NotificationsTable.prototype, new InstanceRegistry());

  NotificationsTable.prototype.getName = function() {
    return "Notificationo Table " + this.widgetID;
  };

  NotificationsTable.prototype.destroy = function() {
    this.unregisterInstance();
  };

  NotificationsTable.prototype.getWidgetConfiguration = function() {
    return {
      createContent: function(content) {
        var self = this;
        content.innerHTML = '<table cellpadding="0" cellspacing="0" border="0" class="display">' +
            '<thead>' +
              '<tr>' +
                '<th>id</th>' +
                '<th>type</th>' +
                '<th>description</th>' +
                '<th>status' +
                  '<select name="search_type" id="search_type" class="search_init">' +
                    '<option value="">Any</option>' +
                    '<option value="0">Open</option>' +
                    '<option value="1">Approved</option>' +
                    '<option value="2">Rejected</option>' +
                    '<option value="3">Invalid</option>' +
                  '</select>' +
                '</th>' +
                '<th>x</th>' +
                '<th>y</th>' +
                '<th>z</th>' +
                '<th>node id</th>' +
                '<th>skeleton id</th>' +
                '<th>from</th>' +
                '<th>date</th>' +
                '<th>actions</th>' +
              '</tr>' +
            '</thead>' +
            '<tfoot>' +
              '<tr>' +
                '<th>id</th>' +
                '<th>type</th>' +
                '<th>description</th>' +
                '<th>status</th>' +
                '<th>x</th>' +
                '<th>y</th>' +
                '<th>z</th>' +
                '<th>node id</th>' +
                '<th>skeleton id</th>' +
                '<th>from</th>' +
                '<th>date</th>' +
                '<th>actions</th>' +
              '</tr>' +
            '</tfoot>' +
            '<tbody>' +
              '<tr><td colspan="8"></td></tr>' +
            '</tbody>' +
          '</table>';

        var table = $('table', content);

        this.datatable = table.dataTable({
          "bDestroy": true,
          "sDom": '<"H"lr>t<"F"ip>',
          // default: <"H"lfr>t<"F"ip>
          "bProcessing": true,
          "bServerSide": true,
          "bAutoWidth": false,
          "sAjaxSource": django_url + project.id + '/notifications/list',
          "fnServerData": function (sSource, aoData, fnCallback) {
            $.ajax({
              "dataType": 'json',
              "type": "POST",
              "cache": false,
              "url": sSource,
              "data": aoData,
              "success": fnCallback
            });
          },
          "fnRowCallback": function ( nRow, aaData, iDisplayIndex ) {
            // Color each row based on its status.
            if (aaData[3] === 'Open') {
              nRow.style.backgroundColor = '#ffffdd';
            } else if (aaData[3] === 'Approved') {
              nRow.style.backgroundColor = '#ddffdd';
            } else if (aaData[3] === 'Rejected') {
              nRow.style.backgroundColor = '#ffdddd';
            } else if (aaData[3] === 'Invalid') {
              nRow.style.backgroundColor = '#dddddd';
            }
            return nRow;
          },
          "iDisplayLength": 50,
          "aLengthMenu": [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          "bJQueryUI": true,
          "aoColumns": [{
            "bSearchable": false,
            "bSortable": true,
            "bVisible": false
          }, // id
          {
            "sClass": "center",
            "bSearchable": true,
            "bSortable": false,
          }, // type
          {
            "bSearchable": false,
            "bSortable": false,
          }, // description
          {
            "sClass": "center",
            "bSearchable": true,
            "bSortable": true,
            "sWidth": "120px"
          }, // status
          {
            "bSearchable": false,
            "bVisible": false
          }, // x
          {
            "bSearchable": false,
            "bVisible": false
          }, // y
          {
              "bSearchable": false,
            "bVisible": false
          }, // z
          {
            "bSearchable": false,
            "bVisible": false
          }, // node_id
          {
              "bSearchable": false,
            "bVisible": false
          }, // skeleton_id
          {
            "bSearchable": true,
            "bSortable": true
          }, // from
          {
            "bSearchable": false,
            "bSortable": true,
            "sWidth": "100px"
          }, // date
          {
            "sClass": "center",
            "bSearchable": false,
            "bSortable": false,
            "mData": null,
            "mRender" : function(obj, type, full) {
               var id = full[0];
               var disabled = (full[3] == 'Open' ? '' : ' disabled');
               return '<select id="action_select_' + id + '_' + self.widgetID + '" onchange="NotificationsTable.perform_action(' + id + ')">' +
                      '  <option>Action:</option>' +
                      '  <option>Show</option>' +
                      '  <option' + disabled + '>Approve</option>' +
                      '  <option' + disabled + '>Reject</option>' +
                      '</select>';
            },
            "sWidth": "100px"
          } // actions
          ]
        });

        // filter table
        $.each(NotificationsTable.initValues, function(index, value) {
          if(value==="Search")
            return;
          if(value) {
            self.datatable.fnFilter(value, index);
          }
        });

        $("thead input", table).keyup(function () { /* Filter on the column (the index) of this element */
          var i = $("thead input", table).index(this) + 2;
          CATMAID.NotificationsTable.initValues[i] = this.value;
          self.datatable.fnFilter(this.value, i);
        });

        $("thead input", table).each(function (i) {
          CATMAID.NotificationsTable.initValues[i+2] = this.value;
        });

        $("thead input", table).focus(function () {
          if (this.className === "search_init") {
            this.className = "";
            this.value = "";
          }
        });

        $("thead input", table).blur(function (event) {
          if (this.value === "") {
            this.className = "search_init";
            this.value = CATMAID.NotificationsTable.initValues[$("thead input", table).index(this)+2];
          }
        });

        $('select#search_type').change( function() {
          this.datatable.fnFilter( $(this).val(), 1 );
          CATMAID.NotificationsTable.initValues[1] = $(this).val();
        });
      }
    };
  };

  NotificationsTable.prototype.approve = function(changeRequestID) {
    var self = this;
    requestQueue.register(django_url + project.id + '/changerequest/approve', "POST", {
      "id": changeRequestID
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = JSON.parse(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            self.refresh_notifications();
          }
        }
      }
      else if (status == 500) {
        win = window.open('', '', 'width=1100,height=620');
        win.document.write(text);
        win.focus();
      }
      return true;
    });
  };

  NotificationsTable.prototype.reject = function(changeRequestID) {
    requestQueue.register(django_url + project.id + '/changerequest/reject', "POST", {
      "id": changeRequestID
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = JSON.parse(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            self.refresh_notifications();
          }
        }
      }
      else if (status == 500) {
        win = window.open('', '', 'width=1100,height=620');
        win.document.write(text);
        win.focus();
      }
      return true;
    });
  };

  NotificationsTable.prototype.perform_action = function(row_id) {
    var node = document.getElementById('action_select_' + row_id + '_' + this.widgetID);

    if (node && node.tagName == "SELECT") {
      var row = $(node).closest('tr');
      if (1 !== row.length) {
        CATMAID.error("Couldn't find table row for notification");
        return;
      }
      var row_data = this.datatable.fnGetData(row[0]);

      var action = node.options[node.selectedIndex].value;
      if (action == 'Show') {
        SkeletonAnnotations.staticMoveTo(row_data[6], row_data[5], row_data[4])
            .then(function () {
              SkeletonAnnotations.staticSelectNode(row_data[7]);
            });
      }
      else if (action == 'Approve') {
        NotificationsTable.approve(row_data[0]);
        CATMAID.client.get_messages();  // Refresh the notifications icon badge
      }
      else if (action == 'Reject') {
        NotificationsTable.reject(row_data[0]);
        CATMAID.client.get_messages();  // Refresh the notifications icon badge
      }
      node.selectedIndex = 0;
    }
  };

  /** Update the table to list the notifications. */
  NotificationsTable.prototype.update = function() {
      this.datatable.fnClearTable( 0 );
      this.datatable.fnDraw();
  };

  /** Update the table to list the notifications. */
  NotificationsTable.prototype.refresh_notifications = function() {
    if (this.datatable) {
      this.datatable.fnClearTable( 0 );
      this.datatable.fnDraw();
    }
  };


  // Export
  CATMAID.NotificationsTable = NotificationsTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'notifications',
    creator: NotificationsTable
  });

})(CATMAID);
