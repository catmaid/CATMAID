/**
 * This file is a place for small global extensions of libraries used by CATMAID.
 */

/**
 * Set prototype extensions
 */

/**
 * Return a new set of those items which exist in this set, but not in the given 'of'-able iterable.
 *
 * @param iterable
 * @returns {Set}
 */
Set.prototype.difference = function(iterable) {
  var difference = new Set(this);
  for (var item of iterable) {
    difference.delete(item);
  }
  return difference;
};

/**
 * Add all of the items in a given 'of'-able iterable to this set in-place, and return this set (for chaining purposes).
 *
 * @param iterable
 * @returns {Set}
 */
Set.prototype.addAll = function(iterable) {
  for (var item of iterable) {
    this.add(item);
  }
  return this;
};

/**
 * Return a new set of those items which exist in both this set and the given 'of'-able iterable.
 *
 * @param iterable
 * @returns {Set}
 */
Set.prototype.intersection = function(iterable) {
  var intersection = new Set();
  for (var item of iterable) {
    if (this.has(item)) {
      intersection.add(item);
    }
  }
  return intersection;
};

/**
 * Return a new set of those items which exist in either this set or the given 'of'-able iterable.
 *
 * @param iterable
 * @returns {Set}
 */
Set.prototype.union = function(iterable) {
  var union = new Set(this);
  union.addAll(iterable);
  return union;
};

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

let compareHierarchicalName = function(a, b, reverse=false) {
  let [aPath, aNamePath] = a;
  let [bPath, bNamePath] = b;

  // Find the first unequal path element and compare only it.
  let minPathLength = Math.min(aPath.length, bPath.length);
  let firstDifferentIndex = -1;
  for (let i=0; i<minPathLength; ++i) {
    if (aPath[i] !== bPath[i]) {
      firstDifferentIndex = i;
      break;
    }
  }

  if (firstDifferentIndex === -1) {
    if (aPath.length > bPath.length) return 1;
    if (aPath.length < bPath.length) return -1;
    return 0;
  }
  return reverse ?
      CATMAID.tools.compareStrings(bNamePath[firstDifferentIndex], aNamePath[firstDifferentIndex]) :
      CATMAID.tools.compareStrings(aNamePath[firstDifferentIndex], bNamePath[firstDifferentIndex]);
};

/**
 * We assume we sort search entities.
 */
$.fn.dataTable.ext.oSort['hierarchical-search-name-asc'] = function(a, b) {
  return compareHierarchicalName(a, b);
};

/**
 * We assume we sort search entities.
 */
$.fn.dataTable.ext.oSort['hierarchical-search-name-desc']  = function(a, b) {
  return compareHierarchicalName(a, b, true);
};

let compareHierarchicalType = function(a, b, reverse=false) {
  let [aPath, aTypePath] = a;
  let [bPath, bTypePath] = b;

  // Find the first unequal path element and compare only it.
  let minPathLength = Math.min(aPath.length, bPath.length);
  let firstDifferentIndex = -1;
  for (let i=0; i<minPathLength; ++i) {
    if (aPath[i] !== bPath[i]) {
      firstDifferentIndex = i;
      break;
    }
  }

  if (firstDifferentIndex === -1) {
    if (aPath.length > bPath.length) return 1;
    if (aPath.length < bPath.length) return -1;
    return 0;
  }
  return reverse ?
      CATMAID.tools.compareStrings(bTypePath[firstDifferentIndex], aTypePath[firstDifferentIndex]) :
      CATMAID.tools.compareStrings(aTypePath[firstDifferentIndex], bTypePath[firstDifferentIndex]);
};

/**
 * We assume we sort search entities.
 */
$.fn.dataTable.ext.oSort['hierarchical-search-type-asc'] = function(a, b) {
  return compareHierarchicalType(a, b);
};

/**
 * We assume we sort search entities.
 */
$.fn.dataTable.ext.oSort['hierarchical-search-type-desc']  = function(a, b) {
  return compareHierarchicalType(a, b, true);
};

/**
 * Add case insensitive :contains content filter.
 * Based on: https://stackoverflow.com/questions/187537
 */
jQuery.expr[":"].icontains = jQuery.expr.createPseudo(function(arg) {
    return function( elem ) {
        return jQuery(elem).text().toUpperCase().indexOf(arg.toUpperCase()) >= 0;
    };
});

/**
 * A case insenstive "not" :contains.
 */
jQuery.expr[":"].icontainsnot = jQuery.expr.createPseudo(function(arg) {
    return function( elem ) {
        return jQuery(elem).text().toUpperCase().indexOf(arg.toUpperCase()) === -1;
    };
});


/**
 * jQuery UI extensions
 */
(function(CATMAID) {

  /**
   * This creates a helper function that can be used as the "source" function of
   * the jQuery autocompletion. It expects a maxResults parameter to limit the
   * number of displated items:
   *
   * $(input).autocomplete({
   *   maxResults: 10,
   *   source: CATMAID.makeMaxResultsAutoCompleteSourceFn(items),
   * });
   */
  CATMAID.makeMaxResultsAutoCompleteSourceFn = function(items, multiple=false) {
    return function(request, response) {
      let results = $.ui.autocomplete.filter(items,
          multiple ? CATMAID.AnnotationCache.extractLast(request.term) : request.term);
      let limitedResults = results.slice(0, CATMAID.tools.getDefined(this.options.maxResults, 20));
      if (limitedResults.length !== results.length) {
        limitedResults.push('…');
      }
      response(limitedResults);
    };
  };

  CATMAID.makeSimpleAutoCompleteSourceFn = function(items) {
    return function(request, response) {
      let results = $.ui.autocomplete.filter(items, request.term);
      response(results);
    };
  };

})(CATMAID);


/**
 * Three.js extensions
 */

/**
 * Override colors array access to make sure the underlying typed array has the
 * expected size.
 *
 * TODO: Remove this workaround once issue #7361 in Three.js is resolved.
 */
(function(CATMAID) {
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
            this._bufferGeometry.setAttribute("color",
                new THREE.BufferAttribute(new Float32Array(nVertices * 3), 3));
          }
        }

        colors = value;
      }});
  };
  THREE.Geometry.prototype = originalGeometry.prototype;
  THREE.Geometry.prototype.constructor = originalGeometry.constructor;

  CATMAID.THREE = {};
  CATMAID.THREE.LineSegments2 = function() {

  };

  THREE.Lut.prototype.addColorMap("greenred",
    [[0.0, 0x6fff5c], [0.1, 0x00FFFF], [0.4, 0x85ADFF],
     [0.8, 0xFF99FF], [1.0, 0xFF4F4F]]);

})(CATMAID);


/**
 * Streamsaver.js configuration
 */
(function(CATMAID) {

  // We don't want to load these WebWorkers from the StreamSaver.js repo on
  // GitHub and provide our own copy of these files.
  streamSaver.mitm = CATMAID.tools.urlJoin(window.origin, CATMAID.makeStaticURL('libs/streamsaver/worker/mitm.html'));
  streamSaver.ping = CATMAID.tools.urlJoin(window.origin, CATMAID.makeStaticURL('libs/streamsaver/worker/ping.html'));

})(CATMAID);


/**
 * Pixi.js extensions
 */
(function(CATMAID) {

  if (PIXI.VERSION !== "4.8.8") {
    console.warn(`CATMAID patches Pixi.js to work more robustly on some ` +
      `platforms. The Pixi.js version in use (${PIXI.VERSION}) needs to ` +
      `be verified to work with this patch.`);
  }

  /**
   * The original version of this WebGL support test, sets the context option
   * "failIfMajorPerformanceCaveat" to true. This means that no WebGL context
   * will be provided if the browser decides the existing hardware or driver
   * might cause problems. The only thing this patch changes from the original
   * version is to set this parameter to false. Future versions of PIXI.js allow
   * external configuration of this setting and make this patch obsolete.
   *
   * This change is consistent with the behavior of THREE.js, which sets this
   * option to false as well.
   *
   * The original version of this code can be found here (0fce893):
   *
   * https://github.com/pixijs/pixi.js/blob/v4.x/src/core/utils/index.js
   */
  PIXI.utils.isWebGLSupported = function(failIfMajorPerformanceCaveat = false) {
    const contextOptions = { stencil: true, failIfMajorPerformanceCaveat: failIfMajorPerformanceCaveat };

    try
    {
        if (!window.WebGLRenderingContext)
        {
            return false;
        }

        const canvas = document.createElement('canvas');
        let gl = canvas.getContext('webgl', contextOptions) || canvas.getContext('experimental-webgl', contextOptions);

        const success = !!(gl && gl.getContextAttributes().stencil);

        if (gl)
        {
            const loseContext = gl.getExtension('WEBGL_lose_context');

            if (loseContext)
            {
                loseContext.loseContext();
            }
        }

        gl = null;

        return success;
    }
    catch (e)
    {
        return false;
    }
  };

})(CATMAID);
