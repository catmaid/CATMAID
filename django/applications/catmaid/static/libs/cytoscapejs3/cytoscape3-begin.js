/**
 * Cytoscape.js 3.x is loaded next to the 2.x version in libs/cytoscapejs,
 * which the old Graph Widget still uses. Both versions (and their layout
 * extensions) use the same globals. Remember the 2.x globals here, so that
 * cytoscape3-end.js can restore them after all 3.x files are loaded and expose
 * Cytoscape.js 3.x as window.cytoscape3.
 */
window.CATMAID_CYTOSCAPE2_GLOBALS = {
  cytoscape: window.cytoscape,
  cola: window.cola,
};
