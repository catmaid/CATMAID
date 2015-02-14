/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// Namespace declaration
var CATMAID = CATMAID || {};
CATMAID.tools = CATMAID.tools || {};

/**
 * Convenience function to show an error dialog.
 */
window.error = function(msg, detail)
{
  new CATMAID.ErrorDialog(msg, detail).show();
};

/**
 * Creates a generic JSON response handler that complains when the response
 * status is different from 200 or a JSON error is set.
 */
window.jsonResponseHandler = function(success, error)
{
  return function(status, text, xml) {
    if (status === 200 && text) {
      var json = $.parseJSON(text);
      if (json.error) {
        new CATMAID.ErrorDialog(json.error, json.detail).show();
        if (typeof(error) == 'function') {
          error();
        }
      } else {
        if (typeof(success) == 'function') {
          success(json);
        }
      }
    } else {
      new CATMAID.ErrorDialog("An error occured",
          "The server returned an unexpected status: " + status).show();
      if (typeof(error) == 'function') {
        error();
      }
    }
  };
};

/**
 * Creates a simple login dialog.
 */
window.LoginDialog = function(text, callback) {
  this.dialog = new OptionsDialog("Permission required");
  if (text) {
    this.dialog.appendMessage(text);
  }
  // Add short login text
  var login_text = "Please enter the credentials for a user with the " +
      "necessary credentials to continue to the requested information";
  this.dialog.appendMessage(login_text);
  // Add input fields
  var user_field = this.dialog.appendField('Username', 'username', '', true);
  var pass_field = this.dialog.appendField('Password', 'password', '', true);
  pass_field.setAttribute('type', 'password');
  // Align input fields better
  $(this.dialog.dialog).find('label').css('width', '25%');
  $(this.dialog.dialog).find('label').css('display', 'inline-block');

  // If OK is pressed, the dialog should cause a (re-)login
  this.dialog.onOK = function() {
    login($(user_field).val(), $(pass_field).val(), callback);
  };
};

window.LoginDialog.prototype = {};

/**
 * Displays the login dialog.
 */
window.LoginDialog.prototype.show = function() {
  this.dialog.show('400', 'auto', true);
};

/**
 * Definition of methods in CATMAID.tools namespace.
 */
(function(tools) {

  "use strict";

  /**
   * Does a simple user agent test and returns one of 'MAC', 'WIN', 'LINUX' or
   * 'UNKNOWN'.
   */
  tools.getOS = function()
  {
    var ua = navigator.userAgent.toUpperCase();
    if (-1 !== ua.indexOf('MAC')) {
      return 'MAC';
    } else if (-1 !== ua.indexOf('WIN')) {
      return 'WIN';
    } else if (-1 !== ua.indexOf('LINUX')) {
      return 'LINUX';
    } else {
      return 'UNKNOWN';
    }
  };

  /**
   * Compare two strings while respecting locales and numbers. This is
   * essentially a wrapper around String.localeCompare() to have one
   * place where it is parameterized.
   */
  tools.compareStrings = function(str1, str2)
  {
    return str1.localeCompare(str2, undefined, {numeric: true});
  };

  /**
   * Parse a string as integer or return false if this is not possible or the
   * integer is negative.
   */
  tools.parseIndex = function(str) {
    var pattern = /(\d+)$/;
    if (pattern.test(str)) return parseInt(RegExp.$1);
    else
    return false;
  };

  /**
   * Get a "unique" id for a new element in the DOM.
   */
  var UNIQUE_ID;
  tools.uniqueId = function() {
    if (!UNIQUE_ID) {
      UNIQUE_ID = Math.floor(1073741824 * Math.random());
    }
    return ++UNIQUE_ID;
  };

  /**
   * Parse the query part of the current URL
   */

  tools.parseQuery = function() {
    if (location.search) {
      var r, query;
      query = /\?(.*?)$/i;
      var r = query.exec(location.search);
      if (r) {
        var o, p, value;
        o = {};
        value = /([^&=]+)=([^&=]+)/gi;
        var p = value.exec(r[1]);
        while (p ) {
          o[p[1]] = p[2];
        }
        return o;
      } else
      return undefined;
    } else
    return undefined;
  };

  /**
   * Simplify more robust prototype inheritance. From:
   * http://michaux.ca/articles/class-based-inheritance-in-javascript
   */
  tools.extend = function(subclass, superclass) {
     function Dummy() {}
     Dummy.prototype = superclass.prototype;
     subclass.prototype = new Dummy();
     subclass.prototype.constructor = subclass;
     subclass.superclass = superclass;
     subclass.superproto = superclass.prototype;
  };

  /**
   * Creates a deep copy of an object. Based on:
   * http://stackoverflow.com/questions/122102
   */
  tools.deepCopy = function(obj) {
      if(obj === null || typeof(obj) !== 'object'){
          return obj;
      }
      //make sure the returned object has the same prototype as the original
      var ret = Object.create(Object.getPrototypeOf(obj));
      for(var key in obj){
          ret[key] = tools.deepCopy(obj[key]);
      }
      return ret;
  };

  /**
   * Convert a (usually base64 encorded) dataURI image to a binary blob.
   * From: http://stackoverflow.com/questions/4998908
   */
  tools.dataURItoBlob = function(dataURI) {
      // convert base64/URLEncoded data component to raw binary data held in a string
      var byteString;
      if (dataURI.split(',')[0].indexOf('base64') >= 0)
          byteString = atob(dataURI.split(',')[1]);
      else
          byteString = unescape(dataURI.split(',')[1]);

      // separate out the mime component
      var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

      // write the bytes of the string to a typed array
      var ia = new Uint8Array(byteString.length);
      for (var i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
      }

      return new Blob([ia], {type:mimeString});
  };

})(CATMAID.tools);
