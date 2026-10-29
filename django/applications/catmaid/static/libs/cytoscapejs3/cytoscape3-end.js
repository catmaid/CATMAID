/**
 * All Cytoscape.js 3.x files are loaded and the layout extensions registered
 * themselves with the global cytoscape object, which is the 3.x version at
 * this point. Expose it as window.cytoscape3 and restore the 2.x globals
 * remembered in cytoscape3-begin.js.
 */
(function() {
  "use strict";

  let cy2Globals = window.CATMAID_CYTOSCAPE2_GLOBALS;
  window.cytoscape3 = window.cytoscape;
  window.cytoscape = cy2Globals.cytoscape;
  window.cola = cy2Globals.cola;
  delete window.webcola;
  delete window.CATMAID_CYTOSCAPE2_GLOBALS;
})();
