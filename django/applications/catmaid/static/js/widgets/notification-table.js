/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var NotificationsTable = function() {
    this.widgetID = this.registerInstance();
    this.datatable = null;
  };

  NotificationsTable.prototype = {};
  $.extend(NotificationsTable.prototype, new InstanceRegistry());

  NotificationsTable.prototype.getName = function() {
    return "Notification Table " + this.widgetID;
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
                  '<select name="search_type" class="search_init">' +
                    '<option value="">Any</option>' +
                    '<option value="open">Open</option>' +
                    '<option value="approved">Approved</option>' +
                    '<option value="rejected">Rejected</option>' +
                    '<option value="invalid">Invalid</option>' +
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
          "bProcessing": true,
          "bServerSide": false,
          "bAutoWidth": false,
          "sAjaxSource": CATMAID.makeURL(project.id + '/notifications/list'),
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
               return '<select name="action">' +
                      '  <option value="">Action:</option>' +
                      '  <option value="show">Show</option>' +
                      '  <option value="approve" ' + disabled + '>Approve</option>' +
                      '  <option value="reject" ' + disabled + '>Reject</option>' +
                      '</select>';
            },
            "sWidth": "100px"
          } // actions
          ]
        });

        $("thead select[name=search_type]", table).focus(function () {
          if (this.className === "search_init") {
            this.className = "";
            this.value = "";
          }
        });

        $('thead select[name=search_type]', table).change(function() {
          self.datatable.fnFilter(this.value, 3);
        });

        $(table).on('change', "tbody select[name=action]", function() {
          var tr = $(this).closest('tr');
          var row_data = self.datatable.fnGetData(tr[0]);

          var action = this.options[this.selectedIndex].value;
          if (action === 'show') {
            SkeletonAnnotations.staticMoveTo(row_data[6], row_data[5], row_data[4])
                .then(function () {
                  return SkeletonAnnotations.staticSelectNode(row_data[7]);
                })
                .catch(CATMAID.handleError);
          }
          else if (action === 'approve') {
            self.approve(row_data[0]);
          }
          else if (action === 'reject') {
            self.reject(row_data[0]);
          }
          this.selectedIndex = 0;
        });
      }
    };
  };

  NotificationsTable.prototype.approve = function(changeRequestID) {
    var self = this;
    return CATMAID.fetch(project.id + '/changerequest/approve', "POST", {
      "id": changeRequestID
    })
    .then(this.refresh.bind(this))
    .catch(CATMAID.handleError);
  };

  NotificationsTable.prototype.reject = function(changeRequestID) {
    var self = this;
    return CATMAID.fetch(project.id + '/changerequest/reject', "POST", {
      "id": changeRequestID
    })
    .then(this.refresh.bind(this))
    .catch(CATMAID.handleError);
  };

  /** Update the table to list the notifications. */
  NotificationsTable.prototype.update = function() {
      this.datatable.fnClearTable( 0 );
      this.datatable.fnDraw();
  };

  /** Update the table to list the notifications. */
  NotificationsTable.prototype.refresh = function() {
    if (this.datatable) {
      this.datatable.fnClearTable( 0 );
      this.datatable.fnDraw();
    }
  };


  // Export
  CATMAID.NotificationsTable = NotificationsTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Notification Table",
    description: "List your notificiations",
    key: 'notifications',
    creator: NotificationsTable
  });

})(CATMAID);
