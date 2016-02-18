/** First install the convex-hull node package:
*
* $ npm install convex-hull
*
* Then convert this tiny script into a browser-ready file
* than makes the convex hull function reachable from CATMAID:
*
* $ browserify geometry-wrapper.js -o geometry.js
*
* The resulting geometry.js file is committed to CATMAID's git repository.
*/
window.GeometryTools = {
	convexHull: require("convex-hull")
};
