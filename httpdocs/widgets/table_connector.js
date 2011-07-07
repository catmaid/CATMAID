/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var connectorTable;
var asInitValsSyn = new Array();


initConnectorTable = function (pid)
{
  var prestr = '1';
  var tableid = '#connectortable';
  var stype = 'presynaptic';

  connectorTable = $(tableid).dataTable(
  {
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lr>t<"F"ip>',
    // default: <"H"lfr>t<"F"ip>
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "sAjaxSource": 'model/connector.list.php',
    "fnServerData": function (sSource, aoData, fnCallback) {
        aoData.push({
          "pid": pid,
          "relation_type": prestr
        });
        $.ajax({
          "dataType": 'json',
          "type": "POST",
          "url": sSource,
          "data": aoData,
          "success": fnCallback
        });
    },
    "aLengthMenu": [
      [10, 25, 50, -1],
      [10, 25, 50, "All"]
    ],
    "bJQueryUI": true,
    "fnRowCallback": function (nRow, aData, iDisplayIndex)
    {
      if (parseInt(aData[5]) in selectedObjects)
      {
        $(nRow).addClass('row_selected');
      }
      return nRow;
    },
    "aoColumns": [
    {
      "bSearchable": false,
      "bSortable": true
    }, // subject
    {
      "bSearchable": false,
      "bSortable": true,
      "sClass": "center"
    }, // predicated
    {
      "bSearchable": false
    }, // object
    {
      "bSearchable": false,
      "bSortable": true
    }, // username
    {
      "bVisible": true,
      "bSortable": true
    } // last modified
    ]

  });

  $(tableid + " tfoot input").keyup(function ()
  { /* Filter on the column (the index) of this element */
    connectorTable.fnFilter(this.value, $("tfoot input").index(this));
  });

/*
	 * Support functions to provide a little bit of 'user friendlyness' to the textboxes in
	 * the footer
	 */
  $(tableid + " tfoot input").each(function (i)
  {
    asInitValsSyn[i] = this.value;
  });

  $(tableid + " tfoot input").focus(function ()
  {
    if (this.className == "search_init")
    {
      this.className = "";
      this.value = "";
    }
  });

  $(tableid + " tfoot input").blur(function (i)
  {
    if (this.value == "")
    {
      this.className = "search_init";
      this.value = asInitValsSyn[$("tfoot input").index(this)];
    }
  });

  $(tableid + " tbody tr").live('click', function ()
  {

  });

}
