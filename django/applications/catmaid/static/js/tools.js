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

})(CATMAID.tools);
