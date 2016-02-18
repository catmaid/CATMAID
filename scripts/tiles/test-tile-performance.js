/**
 * Some helper functions to test tile loading performance from a browser
 * console.
 */

/**
 * Get a random number integer in a range.
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Store performance information for a particular URL (if available) in the
 * current context.
 */
function pushTimings(url) {
  var pt = window.performance.getEntriesByName(url);
  console.log(url + ": " + pt);
  if (pt && pt[0]) {
    this.push(pt[0]);
  }
}

/**
 * Get tile timing information for a query option set. A query options set looks
 * like the following object. Min and max values are in tile index space:
 *
 * var query = {
 *   xMin: 7,
 *   xMax: 48,
 *   yMin: 10,
 *   yMax: 44,
 *   zMin: 700,
 *   zMax: 1400,
 *   s: 0,
 *   server: "https://example.com/ssd-tiles-no-cache/test/",
 *   makeURL: function(server, x, y, z, s) {
 *     return server + z + "/" + s + "/" + x + '_' + y + ".jpg";
 *   }
 * }
 *
 * @params {Object}  options Query option set, see above.
 * @params {Number}  n       The number of requests to make
 * @params {Boolean} init    Initialize performance cache iff true
 *
 * @returns {Object[]} A dynamically filled array of performance timing objects
 */
function getTileTimings(options, n, init) {
  options = options || {};
  var xMin = options.xMin;
  var xMax = options.xMax;
  var yMin = options.yMin;
  var yMax = options.yMax;
  var zMin = options.zMin;
  var zMax = options.zMax;
  var s = options.s;
  var server = options.server;

  var timings = [];

  if (init) {
    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(n);
  }
  for (var i=0; i<n; ++i) {
    var x = getRandomInt(xMin, xMax);
    var y = getRandomInt(yMin, yMax);
    var z = getRandomInt(zMin, zMax);
    var url = options.makeURL(server, x, y, z, s);

    // Without using the URL, it won't show up in the performance results
    var testImage = new Image();
    testImage.src = url;
    testImage.onload = pushTimings.bind(timings, url);
  }

  return timings;
}

/**
 * Do batches of requests per a wait time.
 *
 * @params {Object} options   Query option set, see above.
 * @params {Number} n         The number of requests to make
 * @params {Number} reqPerSec The number of requests per wait time
 * @params {Number} wait      Milliseconds to wait between request batches
 *
 * @returns {Object[]} A dynamically filled array of performance timing objects
 *                     for each iteration.
 */
function rateLimitingTest(options, n, reqPerWait, wait) {
  var iterations = n / reqPerWait;
  performance.clearResourceTimings();
  performance.setResourceTimingBufferSize(n);

  var timings = [];
  function test() {
    timings.push(getTileTimings(options, reqPerWait));
    --iterations;
    if (iterations > 0) {
      setTimeout(test, wait);
    }
  }

  test();

  return timings;
}

/**
 * Map all timings to the time between the start of request and the end of the
 * response.
 */
function toLoadingTimes(timings) {
 return timings.map(function(iter) {
   return iter.map(function(t) {
     return t.responseEnd - t.requestStart;
   });
 });
}

/**
 * Return an average of all loading timings in an array.
 */
function getAverageLoadingTime(timings) {
  var sum = timings.reduce(function(o, t) {
    return o + t.responseEnd - t.requestStart;
  }, 0);
  return sum / timings.length;
}
