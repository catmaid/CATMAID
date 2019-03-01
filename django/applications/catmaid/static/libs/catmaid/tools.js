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
   * Compare two numbers, can be used with sort().
   */
  tools.compareNumbers = function(a, b) {
    return a - b;
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
   * Join two strings <a> and <b> so that no slash character is doubled should
   * <a> end with one and <b> starts with one.
   */
  tools.urlJoin = function(a, b) {
    if (a) {
      if (b) {
        if (a[a.length - 1] === '/') {
          if (b[0] === '/') {
              return a + b.slice(1);
          }
          return a + b;
        } else {
          if (b[0] === '/') {
            return a + b;
          }
          return a + '/' + b;
        }
      }
      return a;
    } else if (b) {
      return b;
    }
    return undefined;
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
    // Handle the 3 simple types, and null or undefined
    if (null === obj || "object" !== typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        var copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        var copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
            copy[i] = tools.deepCopy(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        var copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = tools.deepCopy(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
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
   * Copy from source[sourceField] to target[targetField] if and only if both
   * are defined.
   */
  tools.copyIfDefined = function(source, target, sourceField, targetField, mapFn) {
    targetField = targetField || sourceField;
    if (source && source.hasOwnProperty(sourceField) &&
        target && target.hasOwnProperty(targetField)) {
      if (CATMAID.tools.isFn(mapFn)) {
        target[targetField] = mapFn(source[sourceField]);
      } else {
        target[targetField] = source[sourceField];
      }
    }
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
        return fn.apply(window, Array.prototype.slice.call(arguments, 1));
      } else {
        return fn();
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
  tools.getContrastColor = function(hex, getHex) {
    var rgb = CATMAID.tools.hexToRGB(hex);
    var lum = CATMAID.tools.rgbToLuminance(rgb.r, rgb.g, rgb.b);
    if (getHex) {
      return lum <= 128 ? "#ffffff" : "#000000";
    } else {
      return lum <= 128 ? "white" : "black";
    }
  };

  let _intersectLineWithPlaneTmpLine = new THREE.Line3(
      new THREE.Vector3(), new THREE.Vector3());

  /**
   * Return the intersection of the line given by the two points with
   * a THREE.js plane.
   */
  tools.intersectLineWithPlane = function(x1, y1, z1, x2, y2, z2, plane, target) {
    _intersectLineWithPlaneTmpLine.start.set(x1, y1, z1);
    _intersectLineWithPlaneTmpLine.end.set(x2, y2, z2);
    return plane.intersectLine(_intersectLineWithPlaneTmpLine, target);
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
      // ES5 interprets all ISO 8601 times without time zone as UTC, so should
      // adjust to local time automatically as long as the backend returns UTC.
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
   * Return a string representation of a Date instance with the format
   * YYYY-MM-DD hh:mm:ss.
   */
  tools.dateToString = function(d) {
    var day = d.getDate();
    if (day < 10) day = '0' + day;
    var month = d.getUTCMonth() + 1; // 0-based
    if (month < 10) month = '0' + month;
    var hour = d.getHours();
    if (hour < 10) hour = '0' + hour;
    var min = d.getMinutes();
    if (min < 10) min = '0' + min;
    var sec = d.getSeconds();
    if (sec < 10) sec = '0' + sec;
    return d.getUTCFullYear() + '-' + month + '-' + day + ' ' +
        hour + ":" + min + ":" + sec;
  };

  /**
   * Parse an ISO date/time string representation to a new Date instance. Input
   * strings are of the form: 2017-11-06T03:58:32.835595Z and are expected to be
   * UTC timestamps. The fraction of seconds is optional, but if it has six
   * characters, microseconds are assumed. If it has three, millisconds are
   * assumed.
   */
  tools.isoStringToDate = (function() {
    var isoRegEx = /^(\d{4})-0?(\d+)-0?(\d+)[T ]0?(\d+):0?(\d+):0?(\d+)(\.\d+)?(Z|([\+-]00:00))$/;
    return function(isoDate) {
      var match = isoDate.match(isoRegEx);
      if (match) {
        let ms = 0;
        if (match[7] !== undefined) {
          ms = Math.min(999, Math.floor(Number("0" + match[7]) * 1000));
        }
        return new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1,
            parseInt(match[3], 10), parseInt(match[4], 10),
            parseInt(match[5], 10), parseInt(match[6], 10), ms));
      } else {
        // Unable to parse date
        return null;
      }
    };
  })();

  tools.numberSuffix = function(n) {
    return n > 1 ? 's' : '';
  };

  /**
   * Return a human readable form of an amount of milliseconds.
   */
  tools.humanReadableTimeInterval = (function() {

    var defaultTimeComponents = new Set(["sec", "min", "hours", "days"]);
    var msPerSecond = 1000;
    var msPerMinute = 60 * msPerSecond;
    var msPerHour   = 60 * msPerMinute;
    var msPerDay    = 24 * msPerHour;

    return function(ms, components) {
      components = components || defaultTimeComponents;

      var units = [];
      var values = [];
      if (components.has("days")) {
        units.push("d");
        values.push(ms / msPerDay); ms %= msPerDay;
      }
      if (components.has("hours")) {
        units.push("h");
        values.push(ms / msPerHour); ms %= msPerHour;
      }
      if (components.has("min")) {
        units.push("min");
        values.push(ms / msPerMinute); ms %= msPerMinute;
      }
      if (components.has("sec")) {
        units.push("sec");
        values.push(ms / msPerSecond); ms %= msPerSecond;
      }

      var pretty = "";
      var addedComponents = 0;
      for (var i=0; i<values.length; ++i) {
        var val = Math.floor(values[i]);
        if(val <= 0) continue;
        if (addedComponents > 0) {
          pretty += " ";
        }

        pretty += val + units[i];
        ++addedComponents;
      }

      // If there is no valid time representation found, state the passed in
      // value is smaller than the smallest available time unit.
      if (!pretty) {
        pretty = "< "+ (values.length === 0 ? "infinity" : ("1" + units[units.length - 1]));
      }

      return pretty;
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

  /**
   * Returns the passed in value if it is not undefined. Otherwise returns
   * passed in default.
   */
  tools.getDefined = function(value, fallback) {
    return undefined === value ? fallback : value;
  };

  /**
   * Make all letters except the first of the second parameter lower case. Used
   * by cloneNode() function.
   */
  var camelize = function(a,b){
      return b.toUpperCase();
  };

  /**
   * Clone a DOM node and apply the currently computed style. All child nodes
   * are copied as well.
   */
  tools.cloneNode = function(element, copyStyle) {
    var copy = element.cloneNode(false);
    // Add style information
    if (copyStyle && Node.ELEMENT_NODE === element.nodeType) {
      var computedStyle = window.getComputedStyle(element, null);
      var target = copy.style;
      for (var i = 0, l = computedStyle.length; i < l; i++) {
          var prop = computedStyle[i];
          var camel = prop.replace(/\-([a-z])/g, camelize);
          var val = computedStyle.getPropertyValue(prop);
          target[camel] = val;
      }
    }

    for (var i=0, length=element.childNodes.length; i<length; ++i) {
      var child = element.childNodes[i];
      var childClone = CATMAID.tools.cloneNode(child, copyStyle);
      copy.appendChild(childClone);
    }

    return copy;
  };

  /**
   * Print a HTML element.
   */
  tools.printElement = function(element) {
    // Add table to new window
    var printWindow = window.open("");
    if (!printWindow) {
      CATMAID.warn("Couldn't open new window for printing");
      return;
    }
    var clone = CATMAID.tools.cloneNode(element, true);
    var printHTML = "<html><body></body></html>";
    printWindow.document.write("<html><body></body></html>");
    printWindow.document.body.appendChild(clone);

    printWindow.print();
    printWindow.close();
  };

  /**
   * Apply thr trim() function to a string. Makes is possible to be used in
   * map/etc.
   */
  tools.trimString = function(str) {
    return str.trim();
  };

  /**
   * Predicate for whether two ES6 Sets have equal elements. O(n log n),
   * because of the bizarre and incomplete spec.
   */
  tools.areSetsEqual = function (a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.size !== b.size) return false;

    for (var member of a) {
      if (!b.has(member)) return false;
    }

    return true;
  };

  /**
   * Copy all fields from a default object to a target that are undefined in the
   * target.
   */
  tools.updateFromDefaults = function(target, defaults) {
    for (var key in defaults) {
      var value = target[key];
      if (undefined === value) {
        target[key] = defaults[key];
      }
    }

    return target;
  };

  tools.getDateSuffix = function() {
    var now = new Date();
    return now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay() + '-' + now.getHours() + '-' + now.getMinutes();
  };

  /**
   * Cast the passed in value to a number. If this is not possible, show a
   * warning and return null. Optionally, a bounds check with min and max values
   * can be performed. If not provided, min is set to negative infinity and max
   * to positive infinity. If the value is out of bounds, null is returned as
   * well.
   */
  tools.validateNumber = function(number, errorMessage, min, max) {
    if (!number) return null;
    var min = typeof(min) === "number" ? min : -Infinity;
    var max = typeof(max) === "number" ? max : Infinity;
    var value = +number; // cast
    if (Number.isNaN(value) || value < min || value > max) {
      if (errorMessage) {
        CATMAID.warn(errorMessage);
      }
      return null;
    }
    return value;
  };

  /**
   * Predicate to check if a value is a valid number.
   */
  tools.isNumber = function(value) {
    return typeof(value) === "number" && !Number.isNaN(value);
  };

  /**
   * Test if two arrays are exactly the same, i.e. they are defined and have the
   * same elements in the same order.
   */
  tools.arraysEqual = function(a, b) {
    if (!a || !b) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (var i=0, imax=a.length; i<imax; ++i) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  };

  /**
   * Permute one array by indices given in another.
   */
  tools.permute = function(arr, perm) {
    return Array.from(perm, p => arr[p]);
  };

  /**
   * Permute an xyz coordinate object by xyz order indices given in another.
   */
  tools.permuteCoord = function(obj, perm) {
    let arr = [obj.x, obj.y, obj.z];
    arr = CATMAID.tools.permute(arr, perm);
    return {x: arr[0], y: arr[1], z: arr[2]};
  };

  /**
   * Create a UUIDv4 based on Math.random. From:
   * https://stackoverflow.com/questions/105034
   */
  tools.uuidv4 = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  /**
   * Quote the passed in string;
   */
  tools.quote = function(text) {
    return '"' + text + '"';
  };

  /**
   * Return a THREE.js Color object for the passed in value. Numbers are
   * interpred as a hex representation, objects are expected to have the fields
   * r, g, and b. Everything else is just passed to the THREE.Color()
   * constructor.
   */
  tools.getColor = function(value) {
    var type = typeof(value);
    if (type === "object") {
      return new THREE.Color(value.r, value.g, value.b);
    } else if (type === "number") {
      // This is done not through the constructor, because a passed in number
      // isn't treated as hex value.
      var color = new THREE.Color();
      color.setHex(value);
      return color;

    }
    return new THREE.Color(value);
  };

  /**
   * Copy the passed in text to the clipboard.
   */
  tools.copyToClipBoard = function(text) {
    var input = document.createElement('input');
    input.setAttribute('value', text);
    document.body.appendChild(input);
    input.select();
    var result = document.execCommand('copy');
    document.body.removeChild(input);
    return result;
  };

  /**
   * Get the bounding box of an array of points, which are represented as a
   * three element array: [x, y, z].
   */
  tools.getPointBoundingBox = function(points) {
    // Find bounding box around locations
    let min = { x: Infinity, y: Infinity, z: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (var i=0, imax=points.length; i<imax; ++i) {
      let loc = points[i];
      if (loc[0] < min.x) min.x = loc[0];
      if (loc[1] < min.y) min.y = loc[1];
      if (loc[2] < min.z) min.z = loc[2];
      if (loc[0] > max.x) max.x = loc[0];
      if (loc[1] > max.y) max.y = loc[1];
      if (loc[2] > max.z) max.z = loc[2];
    }
    return {
      min: min,
      max: max
    };
  };

  /**
   * Extract the filename of a path without the file extension.
   */
  tools.extractFileNameNoExt = function(path) {
    let sep = CATMAID.tools.getOS() === 'WIN' ? '\\' : '/';
    let start = path.lastIndexOf(sep) + 1;
    let lastDotIdx = path.lastIndexOf('.');
    let end = (lastDotIdx === -1 || lastDotIdx < start) ? undefined : lastDotIdx;
    return path.substring(start, end);
  };

  /**
   * Create an object from matched arrays of keys and values.
   */
  tools.buildObject = function (keys, values) {
    return keys.reduce(function (obj, k, i) {
      obj[k] = values[i];
      return obj;
    }, {});
  };

  /**
   * A modulo function that can deal with negative numbers.
   */
  tools.mod = function(a, b) {
    return ((a % b) + b) % b;
  };

  /**
   * Return "id" field of the value stored under the passed in key in the
   * current context. This is useful for map() or filter() functions.
   */
  tools.getId = function(key) {
    let value = this[key];
    return value ? value.id : undefined;
  };

  /**
   * Captialize the first letter of a string.
   */
  tools.capitalize = function(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

})(CATMAID.tools);
