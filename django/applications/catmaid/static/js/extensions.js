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

/**
 * Add ascending natural sort string compare type.
 */
$.fn.dataTable.ext.oSort['text-asc']  = function(a, b) {
    return CATMAID.tools.compareStrings(a, b);
};

/**
 * Add descending natural sort string compare type.
 */
$.fn.dataTable.ext.oSort['text-desc']  = function(a, b) {
    return -1 * CATMAID.tools.compareStrings(a, b);
};

/**
 * Add ascending HSL color ordering type.
 */
$.fn.dataTable.ext.oSort['hslcolor-asc']  = function(a, b) {
  return CATMAID.tools.compareHSLColors(a, b);
};

/**
 * Add descending HSL color ordering type.
 */
$.fn.dataTable.ext.oSort['hslcolor-desc']  = function(a, b) {
  return -1 * CATMAID.tools.compareHSLColors(a, b);
};


/**
 * Three.js extensions
 */

/**
 * Override colors array access to make sure the underlying typed array has the
 * expected size.
 *
 * TODO: Remove this workaround once issue #7361 in Three.js is resolved.
 */
(function() {
  var originalGeometry = THREE.Geometry;
  THREE.Geometry = function() {
    // Call original constructor
    originalGeometry.apply(this, arguments);

    var colors = this.colors;
    Object.defineProperty(this, "colors", {
      get: function() {
        return colors;
      },
      set: function(value) {
        // Make sure the attribute has enough space
        var nVertices = this.vertices.length;
        if (this._bufferGeometry) {
          if (nVertices !== this._bufferGeometry.attributes.color.count) {
            this._bufferGeometry.addAttribute("color",
                new THREE.BufferAttribute(new Float32Array(nVertices * 3), 3));
          }
        }

        colors = value;
      }});
  };
  THREE.Geometry.prototype = originalGeometry.prototype;
  THREE.Geometry.constructor = originalGeometry.constructor;
})();
