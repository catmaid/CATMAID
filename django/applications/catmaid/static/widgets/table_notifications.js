/** Namespace NotificationsTable */
var NotificationsTable = new function()
{
  var ns = this; // reference to the namespace
  ns.oTable = null;
  var asInitVals = [];

  /** Update the table to list the notifications. */
  this.update = function() {
      ns.oTable.fnClearTable( 0 );
      ns.oTable.fnDraw();
  };

  /** Update the table to list the notifications. */
  refresh_notifications = function() {
    if (ns.oTable) {
      ns.oTable.fnClearTable( 0 );
      ns.oTable.fnDraw();
    }
  };
  
  this.approve = function(changeRequestID) {
    requestQueue.register(django_url + project.id + '/changerequest/approve', "POST", {
      "id": changeRequestID
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            refresh_notifications();
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
  
  this.reject = function(changeRequestID) {
    requestQueue.register(django_url + project.id + '/changerequest/reject', "POST", {
      "id": changeRequestID
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            refresh_notifications();
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
  
  this.init = function (pid)
  {
    ns.pid = pid;
    ns.oTable = $('#notificationstable').dataTable({
      // http://www.datatables.net/usage/options
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
      "iDisplayLength": -1,
      "aLengthMenu": [
        [-1, 10, 100, 200],
        ["All", 10, 100, 200]
      ],
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
        "sWidth": "50px"
      }, // type
      {
        "bSearchable": false,
        "bSortable": false,
        "sWidth": "100px"
      }, // description
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true,
        "sWidth": "150px"
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
      	"sClass": "center",
      	"bSearchable": false,
        "bSortable": false,
      	"fnRender" : function(obj) {
			var crID = obj.aData[0]
			var x = obj.aData[4]
			var y = obj.aData[5]
			var z = obj.aData[6]
      		var nodeID = obj.aData[7]
      		var skeletonID = obj.aData[8]
      		var disabled = (obj.aData[3] == 'Open' ? '' : ' disabled');
			return '<button onclick="project.moveTo(' + z + ', ' + y + ', ' + x + ', undefined, function () {SkeletonAnnotations.staticSelectNode(' + nodeID + ', ' + skeletonID + ');})">Show</button>' + 
				'<button onclick="NotificationsTable.approve(' + crID + ');"' + disabled + '>Approve</button>' + 
				'<button onclick="NotificationsTable.reject(' + crID + ');"' + disabled + '>Reject</button>'
		}
      }, // Action buttons (node_id)
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
        "bSortable": true
      } // date
      ]
    });

    // filter table
    $.each(asInitVals, function(index, value) {
      if(value==="Search")
        return;
      if(value) {
        ns.oTable.fnFilter(value, index);
      }
    });

    $("#notificationstable thead input").keyup(function () { /* Filter on the column (the index) of this element */
      var i = $("thead input").index(this) + 2;
      asInitVals[i] = this.value;
      ns.oTable.fnFilter(this.value, i);
    });

    $("#notificationstable thead input").each(function (i) {
      asInitVals[i+2] = this.value;
    });

    $("#notificationstable thead input").focus(function () {
      if (this.className === "search_init") {
        this.className = "";
        this.value = "";
      }
    });

    $("#notificationstable thead input").blur(function (event) {
      if (this.value === "") {
        this.className = "search_init";
        this.value = asInitVals[$("thead input").index(this)+2];
      }
    });

    $('select#search_type').change( function() {
      ns.oTable.fnFilter( $(this).val(), 1 );
      asInitVals[1] = $(this).val();
    });
  };
}
