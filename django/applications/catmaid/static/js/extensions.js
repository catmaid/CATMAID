/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * This file is a place for small global extensions of libraries used by CATMAID.
 */


/**
 * jQuery DataTables extensions
 */

/*
 * Sorting function for checkbox column which creates an array of all check box
 * values in a column. Plug-in from:
 * http://datatables.net/plug-ins/sorting/custom-data-source/dom-checkbox
 */
$.fn.dataTable.ext.order['dom-checkbox'] = function (settings, col) {
  return this.api().column(col, {order:'index'}).nodes().map(function (td, i) {
    return $('input', td).prop('checked') ? '1' : '0';
  });
};

