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
  // See: https://github.com/mikolalysenko/convex-hull
  convexHull: require("convex-hull"),

  // See: https://github.com/mikolalysenko/circumcenter
  delaunayTriangulate: require('delaunay-triangulate'),

  // See: https://github.com/mikolalysenko/alpha-complex
  alphaShape: require("alpha-shape"),

  // See: https://github.com/mikolalysenko/simplicial-complex
  simplicialComplex: require('simplicial-complex'),

  // See: https://github.com/mikolalysenko/simplicial-complex-boundary
  simplicialComplexBoundary: require('simplicial-complex-boundary'),

  // See: https://github.com/mikolalysenko/circumradius
  circumradius: require('circumradius'),

  // See: https://github.com/mikolalysenko/circumcenter
  circumcenter: require('circumcenter'),
};
