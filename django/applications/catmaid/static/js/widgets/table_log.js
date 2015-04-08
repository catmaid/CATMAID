/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

function updateLogTable() {
    LogTable.logTable.fnClearTable( 0 );
    LogTable.logTable.fnDraw();
}

var LogTable = new function()
{
    /** Pointer to the existing instance of table. */
    this.logTable = null;

    var self = this;
    var asInitValsSyn = [];

    var possibleLengths = [25, 100, 500, 2000, -1];
    var possibleLengthsLabels = possibleLengths.map(
        function (n) { return (n === -1) ? "All" : n.toString(); });

    this.init = function (pid) {
        var tableid = '#logtable';

        self.logTable = $(tableid).dataTable(
            {
                // http://www.datatables.net/usage/options
                "bDestroy": true,
                "sDom": '<"H"lr>t<"F"ip>',
                // default: <"H"lfr>t<"F"ip>
                "bProcessing": true,
                "bServerSide": true,
                "bAutoWidth": false,
                "iDisplayLength": possibleLengths[0],
                "sAjaxSource": django_url + project.id + '/logs/list',
                "fnServerData": function (sSource, aoData, fnCallback) {
                    aoData.push({
                        "name": "user_id",
                        "value" : $('#logtable_username').val()
                    });
                    aoData.push({
                        "name" : "pid",
                        "value" : pid
                    });
                    aoData.push({
                        "name": "operation_type",
                        "value" : $('#logtable_operationtype').val()
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
                    possibleLengths,
                    possibleLengthsLabels
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
                        "bSortable": true
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

        $(tableid + " tbody").on('dblclick', 'tr', function () {
            var aData = self.logTable.fnGetData(this);
            // retrieve coordinates and moveTo
            var x = parseFloat(aData[3]);
            var y = parseFloat(aData[4]);
            var z = parseFloat(aData[5]);
            project.moveTo(z, y, x);
        });

    };

}();
