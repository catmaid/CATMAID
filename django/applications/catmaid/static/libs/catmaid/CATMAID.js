/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// Declare the CATMAID namespace
var CATMAID = {};

// Global request queue
// TODO: Move into CATMAID namespace
var requestQueue = new RequestQueue();

// Add some basic functionality
(function(CATMAID) {

  "use strict";

  /**
   * Throws an error if the provided object is no string of at least length 1.
   */
  var validateString = function(str, name) {
    if (!str || !str.length || str.length === 0) {
      throw Error("No proper " + name + " provided!");
    }
  };

  /**
   * Test if a string ends with a certain suffix.
   */
  var startsWith = function(str, prefix) {
    return str.indexOf(prefix) === 0;
  };

  /**
   * Test if a string ends with a certain suffix.
   */
  var endsWith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  };

  /**
   * Set up the front-end environment. Both URLs are stored so that they contain
   * a trailing slash.
   *
   * @param {string} backendURL - The URL pointing to CATMAID's back-end.
   * @param {string} staticURL - The URL pointing to CATMAID's static files.
   */
  CATMAID.configure = function(backendURL, staticURL) {
    validateString(backendURL, "back-end URL");
    validateString(staticURL, "static URL");

    Object.defineProperty(CATMAID, "backendURL", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: endsWith(backendURL, "/") ? backendURL : backendURL + "/"
    });

    Object.defineProperty(CATMAID, "staticURL", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: endsWith(staticURL, "/") ? staticURL : staticURL + "/"
    });
  };

  /**
   * Build a CATMAID back-end URL.
   *
   * @param {string} path - The relative path, without backend URL. A leading
   *                        slash is not required.
   * @returns {string} The complete CATMAID URL.
   */
  CATMAID.makeURL = function(path) {
    validateString(path, "relative path for URL creation");
    return CATMAID.backendURL + (startsWith(path, "/") ? path.substr(1) : path);
  };

  /**
   * Build a CATMAID static URL.
   *
   * @param {string} path - The relative path, without backend URL. A leading
   *                        slash is not required.
   * @returns {string} The complete CATMAID URL.
   */
  CATMAID.makeStaticURL = function(path) {
    validateString(path, "relative path for URL creation");
    return CATMAID.staticURL + (startsWith(path, "/") ? path.substr(1) : path);
  };

})(CATMAID);
