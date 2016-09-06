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
   * @param {string} backendURL     The URL pointing to CATMAID's back-end.
   * @param {string} staticURL      The URL pointing to CATMAID's static files.
   * @param {string} staticExtURL   Optional, the relative URL pointing to
   *                                CATMAID's static extension files.
   * @param {string} csrfCookieName The name of the cookie containing the
   *                                CSRF token to be sent to the backend with XHRs.
   * @param {Object} permissions    (Optional) Instead of getting permission from
   *                                the back-end, use these instead.
   * @param {bool}   history        (Optional) Indicate if history tracking is
   *                                enabled in the back-end, default is true.
   */
  CATMAID.configure = function(backendURL, staticURL, staticExtURL, csrfCookieName, permissions, history) {
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

    Object.defineProperty(CATMAID, "historyTracking", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: history === 'undefined' ? true : !!history
    });

    CATMAID.setupCsrfProtection();
    CATMAID.updatePermissions(permissions);
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

  // Disable session permission by default
  var projectPermissions = null;
  var groups = [];

  /**
   * Set permissions on a per-project basis. They can be checked by calls to
   * CATMAID.requirePermission(). If set to null, permission checks are disabled
   * and CATMAID.requirePermission() calls will be a no-op.
   *
   * @param {Object} permissions Optional, the new permission object, mapping
   *                             permission names to project IDs. If not
   *                             provided the back-end is asked for a permission
   *                             summary.
   *
   * @returns Promise that is resolved after permissions have been updated.
   */
  CATMAID.updatePermissions = function(permissions) {
    if (permissions) {
      projectPermissions = permissions;
      return Promise.resolve();
    } else {
      return CATMAID.fetch('permissions', 'GET').then(function(json) {
        projectPermissions = json[0];
        groups = json[1];
      }).catch(alert);
    }
  };

  /**
   * Check if the user of the current session has permission on another user. If
   * a CATMAID user is part of a group that has the name like another user, the
   * first user is given permission the second one.
   *
   * @param {String} username The username of the user in question.
   */
  CATMAID.hasPermissionOnUser = function(username) {
    return groups.indexOf(username) != -1;
  };

  /**
   * Check if the passed in response information seems valid and without errors.
   */
  CATMAID.validateResponse = function(status, text, xml) {
    if (status >= 200 && status <= 204 &&
        (typeof text === 'string' || text instanceof String)) {
      return text;
    } else {
      throw new CATMAID.Error("The server returned an unexpected status: " + status);
    }
  };

  /**
   * Check if the passed in response information seems valid and without
   * errors and expect the text to be JSON.
   *
   * @returns {Object} parsed resonse text
   */
  CATMAID.validateJsonResponse = function(status, text, xml) {
    var response = CATMAID.validateResponse(status, text, xml);
    // `text` may be empty for no content responses.
    var json = text.length ? JSON.parse(text) : {};
    if (json.error) {
      if ('ValueError' === json.type) {
        throw new CATMAID.ValueError(json.error, json.detail);
      } else if ('StateMatchingError' === json.type) {
        throw new CATMAID.StateMatchingError(json.error, json.detail);
      } else if ('LocationLookupError' === json.type) {
        throw new CATMAID.LocationLookupError(json.error, json.detail);
      } else {
        throw new CATMAID.Error("Unsuccessful request: " + json.error,
            json.detail, json.type);
      }
    } else {
      return json;
    }
  };

  /**
   * Queue a request for the given back-end method along with the given data. It
   * expects a JSON response. A promise is returned. The URL passed in needs to
   * be relative to the back-end URL.
   *
   * @param {Boolean} raw (Optional) If truty, no JSON validation and parsing is
   *                                 performed.
   */
  CATMAID.fetch = function(relativeURL, method, data, raw, id) {
    return new Promise(function(resolve, reject) {
      var url = CATMAID.makeURL(relativeURL);
      requestQueue.register(url, method, data, function(status, text, xml) {
        // Validation throws an error for bad requests and wrong JSON data,
        // which would causes the promise to become rejected automatically if
        // this wasn't an asynchronously called function. But since this is the
        // case, we have to call reject() explicitly.
        try {
          if (raw) {
            resolve(text);
          } else {
            var json = CATMAID.validateJsonResponse(status, text, xml);
            resolve(json);
          }
        } catch (e) {
          reject(e);
        }
      }, id);
    });
  };

  /**
   * Add an extra header field to all future requests or until it is removed
   * again.
   *
   * @param {String} name  The name of the new header field
   * @param {String} value The value of the new header field
   */
  CATMAID.addHeaderToRequests = function(name, value) {
    requestQueue.addHeader(name, value);
  };

  /**
   * Remove a previously added extra header field from all future requests or
   * until it is added again.
   *
   * @param {String} name  The name of the header field to remove
   */
  CATMAID.removeHeaderFromRequests = function(name) {
    requestQueue.removeHeader(name);
  };

  /**
   * If front-end permission checks are enabled, it can be checked if the
   * current session allows a certain permission on a paticular project. Returns
   * true if permission checks are disabled.
   *
   * @param {String} permission The permission to test
   *
   * @returns True if the permission is given for the passed in project or if
   *          permission checks are disabled. False otherwise.
   */
  CATMAID.hasPermission = function(projectId, permission) {
    if (null === projectPermissions) {
      return false;
    }
    return projectPermissions && projectPermissions[permission] &&
      projectPermissions[permission][projectId];
  };

  // A set of error messages for the lack of particular permissions
  var permissionErrorMessages = {
    'can_browse': 'You don\'t have permission to browse this project.',
    'can_annotate': 'You don\'t have permission to make changes to this project'
  };

  /**
   * If front-end permission checks are enabled, throw a CATMAID.PermissionError
   * if a given permission isn't available for the passed in project ID. This
   * test can be disabled if permissions are set to null. If front-end end
   * permission checks are disabled, this is a no-op.
   *
   * @param {Id}     projectId  The ID of the project to check permissions for
   * @param {String} permission The permission to test
   * @param {String} msg        (Optional) Error message in case of lack of
   *                            permission
   *
   * @returns True, if a permission check was performed. False otherwise (e.g.
   *          when permission checks are disabled)
   */
  CATMAID.requirePermission = function(projectId, permission, msg) {
    if (!CATMAID.hasPermission) {
      msg = msg || permissionErrorMessages[permission] || ('Permission "' +
          permission + '" is not given for project "' + projectId + '"');
      throw new CATMAID.PermissionError(msg);
    }
  };

  /**
   * A general noop function.
   */
  CATMAID.noop = function() {};

})(CATMAID);
