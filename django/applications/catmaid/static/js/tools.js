/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

// Namespace declaration
CATMAID.tools = CATMAID.tools || {};

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
   * Compare two objects that represent HSL colors. Sorting is done by hue, then
   * saturation then luminance.
   */
  tools.compareHSLColors = function(hsl1, hsl2)
  {
    if (hsl1.h === hsl2.h) {
      if (hsl1.s === hsl2.s) {
        if (hsl1.l === hsl2.l) {
          return 0;
        } else {
          return hsl1.l < hsl2.l ? -1 : 1;
        }
      } else {
        return hsl1.s < hsl2.s ? -1 : 1;
      }
    } else {
      return hsl1.h < hsl2.h ? -1 : 1;
    }
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
   * Parse the query part of a URL and return an object containing all the GET
   * properties.
   */
  tools.parseQuery = function(url) {
    if (url) {
      var r, query;
      query = /\?(.*?)$/i;
      var r = query.exec(url);
      if (r) {
        var o, p, value;
        o = {};
        value = /([^&=]+)=([^&=]+)/gi;
        while ((p = value.exec(r[1])) !== null) {
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

  /**
   * Read the pixels of the given size from the given GL context and return them
   * as an image. If a texture is passed in, the returned image will contain the
   * texture data.
   *
   * @param gl The WebGL context to use.
   * @param width The width of the image to read out.
   * @param height The height of the image to read out.
   * @param texture An optional texture object that will be read out if passed.
   * @return An image object of either the context or the texture (if passed).
   */
  tools.createImageFromGlContext = function(gl, width, height, texture) {
      var framebuffer;
      if (texture) {
        // Create a framebuffer backed by the texture
        var framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      }

      // Read the contents of the framebuffer
      var data = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

      if (framebuffer) {
        gl.deleteFramebuffer(framebuffer);
      }

      // Create a 2D canvas to store the result
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d');

      // Copy the pixels to a 2D canvas
      var imageData = context.createImageData(width, height);
      imageData.data.set(data);
      context.putImageData(imageData, 0, 0);

      var img = new Image();
      img.src = canvas.toDataURL();
      return img;
  };

  /**
   * Set the x, y and z propery of the given object to the given value.
   *
   * @param obj The object to set the x, y and z property of.
   * @param value The value x, y and z should be set to.
   * @return The passed in object obj.
   */
  tools.setXYZ = function(obj, value) {
      obj.x = obj.y = obj.z = value;
      return obj;
  };

  /**
   * Check if an entity is a function.
   *
   * @param fn The entitiy to test.
   * @return True if fn is a function, false otherwise.
   */
  tools.isFn = function(fn) {
    return typeof(fn) === 'function';
  };

  /**
   * Call the given entity if it is a function. If extra arguments are passed
   * in, they are passed along to fn, when called.
   *
   * @param fn the entity to call
   */
  tools.callIfFn = function(fn) {
    if (CATMAID.tools.isFn(fn)) {
      if (arguments.length > 1) {
        fn.apply(window, Array.prototype.slice.call(arguments, 1));
      } else {
        fn();
      }
    }
  };

  /**
   * Convert a hex color string to an RGB object.
   */
  tools.hexToRGB = function(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    // See http://stackoverflow.com/questions/5623838
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
  };

  /**
   * Convert any CSS color definition to RGB.
   */
  tools.cssColorToRGB = function(cssColor) {
    var c = new THREE.Color(cssColor);
    return {
      r: c.r,
      g: c.g,
      b: c.b
    };
  };

  /**
   * Convert RGB values between 0 and 255 to a hex representation.
   */
  tools.rgbToHex = function(r, g, b) {
    // See http://stackoverflow.com/questions/5623838
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  /**
   * Calculate an approximate lumance value from RGB values.
   */
  tools.rgbToLuminance = function(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  /**
   * Return either 'black' or 'white', whichever is better readable o a
   * background of the given hex color. The heuristic is to use black if the
   * approximate luminance is above 50%.
   */
  tools.getContrastColor = function(hex) {
    var rgb = CATMAID.tools.hexToRGB(hex);
    var lum = CATMAID.tools.rgbToLuminance(rgb.r, rgb.g, rgb.b);
    return lum <= 128 ? "white" : "black";
  };

  /**
   * Return the intersection of the line given by the two points with the XY plane
   * through the given Z.
   */
  tools.intersectLineWithZPlane = function(x1, y1, z1, x2, y2, z2, zPlane)
  {
    // General point equation would be P1 + (P2 - P1) * t, calculate d = P2 - P1
    var dx = x2 - x1;
    var dy = y2 - y1;
    var dz = z2 - z1;

    // Now the correct t needs to be found that intersects the given z plane.
    // Using the general point equation we can determine z = z1 + dz * t, which
    // translates to t = (z - z1) / dz. With z being our z plane we get the
    // correct t where the intersection happens.
    var t = (zPlane - z1) / dz;

    // Return the intersection X and Y by using the general point equation. Z
    // was already given as a parameter.

    return [x1 + t * dx, y1 + t * dy];
  };

  /**
   * Test if two number have the same sign.
   *
   * @param a First number to compare
   * @param b Second number to compare
   * @return true if a and b have the same sign, false otherwise.
   */
  tools.sameSign = function(a, b)
  {
    return (a < 0) === (b < 0);
  };

  /**
   * Return a contextual description of a date based on the current time:
   *
   * - For dates less than a minute ago: "x seconds ago"
   * - For dates less than an hour ago: "x minutes ago"
   * - For dates less than a day ago: "at YYYY-MM-DD HH:MM:SS"
   * - For dates more than a day ago: "on YYYY-MM-DD"
   *
   * @param  {string} isodate   An ISO 8601 date string.
   * @return {string}           A description of the date (see comment above).
   */
  tools.contextualDateString = (function () {
    var MINUTE = 60000;
    var HOUR = 60 * MINUTE;
    var DAY = 24 * HOUR;

    var formattedDate = function (date) {
      return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
    };

    return function (isodate) {
      var date = new Date(isodate);
      // ES5 interprets all ISO 8601 times without time zone as UTC, while
      // CATMAID uses local time. Adjust the time accordingly. This is not
      // robust for users in different time zones, but is the least surprising
      // behavior possible so long as CATMAID does not account for time zones.
      date.setTime(date.getTime() + date.getTimezoneOffset() * MINUTE);
      var ago = Date.now() - date;

      if (ago < MINUTE) {
        return Math.round(ago / 1000) + ' seconds ago';
      } else if (ago < HOUR) {
        return Math.round(ago / MINUTE) + ' minutes ago';
      } else if (ago < DAY) {
        return 'at ' + formattedDate(date) + ' ' + date.toLocaleTimeString();
      } else {
        return 'on ' + formattedDate(date);
      }
    };
  })();

  /**
   * Escape a string so it can be used in a regular expression without
   * triggering any regular expression patern (e.g. to search for slashes).
   * From: http://stackoverflow.com/questions/3115150
   *
   * @param  {string} text   The string to escape.
   * @return {string}        A new escaped string.
   */
  tools.escapeRegEx = (function() {
    // All characters that should be replaced
    var pattern = /[-[\]{}()*+?.,\\^$|#\s]/g;
    return function(text) {
      return text.replace(pattern, "\\$&");
    };
  })();

  /**
   * Returns a new object having a field named after the parameter object's id
   * field and referencing it.
   */
  tools.idMap = function(obj) {
    var o = {};
    o[obj.id] = obj;
    return o;
  };

  /**
   * Returns a new object having a field named after the id field of all objects
   * in the list parameter.
   */
  tools.listToIdMap = (function() {

    var build = function(o, e) {
      o[e.id] = e;
      return o;
    };

    return function(list) {
      return list.reduce(build, {});
    };
  })();

  // Speed up calls to hasOwnProperty
  var hasOwnProperty = Object.prototype.hasOwnProperty;

  /**
   * Returns true if the given object has any fields and false otherwise.
   * See also: http://stackoverflow.com/questions/4994201
   */
  tools.isEmpty = function(obj) {
    // Null and undefined are "empty"
    if (obj == null) return true; // jshint ignore:line

    for (var key in obj) {
      if (hasOwnProperty.call(obj, key)) return false;
    }

    return true;
  };

})(CATMAID.tools);
