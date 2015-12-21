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

  var getCookie = function(name) {
      var cookieValue = null;
      if (document.cookie && document.cookie !== '') {
          var cookies = document.cookie.split(';');
          for (var i = 0; i < cookies.length; i++) {
              var cookie = jQuery.trim(cookies[i]);
              // Does this cookie string begin with the name we want?
              if (cookie.substring(0, name.length + 1) == (name + '=')) {
                  cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                  break;
              }
          }
      }
      return cookieValue;
  };

  /**
   * Set up the front-end environment. Both URLs are stored so that they contain
   * a trailing slash.
   *
   * @param {string} backendURL - The URL pointing to CATMAID's back-end.
   * @param {string} staticURL - The URL pointing to CATMAID's static files.
   * @param {string} staticExtURL - Optional, the relative URL pointing to
   *    CATMAID's static extension files.
   * @param {string} csrfCookieName - The name of the cookie containing the
   *    CSRF token to be sent to the backend with XHRs.
   */
  CATMAID.configure = function(backendURL, staticURL, staticExtURL, csrfCookieName) {
    validateString(backendURL, "back-end URL");
    validateString(staticURL, "static URL");
    if (typeof staticExtURL === 'undefined') staticExtURL = '';

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

    Object.defineProperty(CATMAID, "staticExtensionURL", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: endsWith(staticExtURL, "/") ? staticExtURL : staticExtURL + "/"
    });

    Object.defineProperty(CATMAID, "csrfCookieName", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: csrfCookieName
    });

    CATMAID.setupCsrfProtection();
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

  /**
   * Build a CATMAID static extension URL. This URL refers to a location were
   * extensions to CATMAID live that are not part of the main source tree.
   *
   * @param {string} path - The relative path, without backend URL. A leading
   *                        slash is not required.
   * @returns {string}    - The complete URL.
   */
  CATMAID.makeStaticExtensionURL = function(path) {
    validateString(path, "relative path for URL creation");
    return CATMAID.staticExtensionURL +
      (startsWith(path, "/") ? path.substr(1) : path);
  };

  /**
   * Create a documentation URL for www.catmaid.org.
   *
   * @param {string} path - The relative path, without domain URL. A leading
   *                        slash is not required.
   * @returns {string}    - The complete URL.
   */
  CATMAID.makeDocURL = function(path) {
    validateString(path, "relative path for URL creation");
    var version = CATMAID.getVersionRelease();
    return "http://catmaid.readthedocs.org/en/" + version + "/" +
      (startsWith(path, "/") ? path.substr(1) : path);
  };

  /**
   * Create a release changelog URL for the GitHub repo.
   *
   * @returns {string}    - The complete URL.
   */
  CATMAID.makeChangelogURL = function() {
    var version = CATMAID.getVersionRelease();
    if ('stable' === version) {
      return "https://github.com/catmaid/CATMAID/releases/latest";
    } else {
      return "https://github.com/catmaid/CATMAID/releases/tag/" + version;
    }
  };

  /**
   * Infer the CATMAID release from the client version.
   *
   * @return {string} The release version, or "stable" if none could be guessed.
   */
  CATMAID.getVersionRelease = function () {
    var version = CATMAID.CLIENT_VERSION.split('-')[0];
    if (version.length === 0 || version.split('.').length !== 3)
      version = "stable";
    return version;
  };

  /**
   * Setup CSRF protection on AJAX requests made through requestQueue or
   * jQuery's ajax method.
   */
  CATMAID.setupCsrfProtection = function () {
    var csrfCookie = CATMAID.csrfCookieName ?
        getCookie(CATMAID.csrfCookieName) :
        undefined;

    window.requestQueue = new RequestQueue(CATMAID.backendURL, csrfCookie);
    $.ajaxPrefilter(function (options, origOptions, jqXHR) {
      if (0 === options.url.indexOf(CATMAID.backendURL) &&
          !RequestQueue.csrfSafe(options.type)) {
        jqXHR.setRequestHeader('X-CSRFToken', csrfCookie);
      }
    });
  };

  /**
   * A general noop function.
   */
  CATMAID.noop = function() {};

})(CATMAID);
