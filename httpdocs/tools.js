/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var UNIQUE_ID;

function parseIndex(str) {
  var pattern = /(\d+)$/;
  if (pattern.test(str)) return parseInt(RegExp.$1);
  else
  return false;
}

function setAlpha(element, alpha) {
  try {
    if (element.filters) {
      element.style.filter = "Alpha(opacity=" + Math.max(0, Math.min(100, alpha)) + ")";
    } else {
      //statusBar.println("setting Alpha to " + alpha);
      element.style.MozOpacity = Math.max(0, Math.min(1, alpha / 100));
    }
  } catch (exception) {}
  if (alpha > 0) element.style.visibility = "visible";
  else element.style.visibility = "hidden";
  return;
}

function getCssRules(styleSheet) {
  if (
  document.styleSheets && document.styleSheets[styleSheet]) {
    if (document.styleSheets[styleSheet].cssRules) return document.styleSheets[styleSheet].cssRules;
    else if (document.styleSheets[styleSheet].rules) return document.styleSheets[styleSheet].rules
  } else
  return undefined;
}
/*
 * get a CSS-Property
 * platform wrapper for incompatibilities between Moz, IE and KHTML
 */

function getPropertyFromCssRules(
styleSheet, //!< int number of the stylesheet
rule, //!< int number of the cssRule
property //!< string the property
) {
  var sheet = getCssRules(styleSheet);
  if (sheet && sheet[rule]) {
    if (sheet[rule].style[property]) return sheet[rule].style[property];
    else if (sheet[rule].style.getPropertyValue[property]) return sheet[rule].style.getPropertyValue[property];
  } else
  return undefined;
}

/**
 * parse the fragment part of the current URL
 */

function parseFragment() {
  if (location.hash) {
    var r;
    fragment = /#(.*?)$/i;
    if (r = fragment.exec(location.hash)) {
      var p;
      o = new Object();
      value = /([^&=]+)=([^&=]+)/gi
      while (p = value.exec(r[1])) {
        o[p[1]] = p[2];
      }
      return o;
    } else
    return undefined;
  } else
  return undefined;
}

/**
 * parse the query part of the current URL
 */

function parseQuery() {
  if (location.search) {
    var r;
    query = /\?(.*?)$/i;
    if (r = query.exec(location.search)) {
      var p;
      o = new Object();
      value = /([^&=]+)=([^&=]+)/gi
      while (p = value.exec(r[1])) {
        o[p[1]] = p[2];
      }
      return o;
    } else
    return undefined;
  } else
  return undefined;
}

/**
 * get the width of an element from the offsetWidth of all of its children
 * use this as width-expression for boxes to be floated completely
 */

function ieCSSWidth(o) {
  var c = o.firstChild;
  var w = c.offsetWidth;
  while (c = c.nextSibling) {
    w += c.offsetWidth;
  }
  return w;
}

/**
 * get a "unique" id for a new element in the DOM
 */

function uniqueId() {
  if (!UNIQUE_ID) UNIQUE_ID = Math.floor(1073741824 * Math.random());
  return ++UNIQUE_ID;
}

/**
 * Simplify more robust prototype inheritance. From:
 * http://michaux.ca/articles/class-based-inheritance-in-javascript
 */
function extend(subclass, superclass) {
   function Dummy() {}
   Dummy.prototype = superclass.prototype;
   subclass.prototype = new Dummy();
   subclass.prototype.constructor = subclass;
   subclass.superclass = superclass;
   subclass.superproto = superclass.prototype;
}

/**
 * encodes and decodes strings to/from Base64. Taken from:
 * http://stackoverflow.com/questions/246801/how-can-you-encode-to-base64-using-javascript
 */
var Base64 = {
  // private property
  _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  
  // public method for encoding
  encode : function (input) {
      var output = "";
      var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
      var i = 0;
  
      input = Base64._utf8_encode(input);
  
      while (i < input.length) {
  
          chr1 = input.charCodeAt(i++);
          chr2 = input.charCodeAt(i++);
          chr3 = input.charCodeAt(i++);
  
          enc1 = chr1 >> 2;
          enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
          enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
          enc4 = chr3 & 63;
  
          if (isNaN(chr2)) {
              enc3 = enc4 = 64;
          } else if (isNaN(chr3)) {
              enc4 = 64;
          }
  
          output = output +
          Base64._keyStr.charAt(enc1) + Base64._keyStr.charAt(enc2) +
          Base64._keyStr.charAt(enc3) + Base64._keyStr.charAt(enc4);
  
      }
  
      return output;
  },
  
  // public method for decoding
  decode : function (input) {
      var output = "";
      var chr1, chr2, chr3;
      var enc1, enc2, enc3, enc4;
      var i = 0;
  
      input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
  
      while (i < input.length) {
  
          enc1 = Base64._keyStr.indexOf(input.charAt(i++));
          enc2 = Base64._keyStr.indexOf(input.charAt(i++));
          enc3 = Base64._keyStr.indexOf(input.charAt(i++));
          enc4 = Base64._keyStr.indexOf(input.charAt(i++));
  
          chr1 = (enc1 << 2) | (enc2 >> 4);
          chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          chr3 = ((enc3 & 3) << 6) | enc4;
  
          output = output + String.fromCharCode(chr1);
  
          if (enc3 != 64) {
              output = output + String.fromCharCode(chr2);
          }
          if (enc4 != 64) {
              output = output + String.fromCharCode(chr3);
          }
  
      }
  
      output = Base64._utf8_decode(output);
  
      return output;
  
  },
  
  // private method for UTF-8 encoding
  _utf8_encode : function (string) {
      string = string.replace(/\r\n/g,"\n");
      var utftext = "";
  
      for (var n = 0; n < string.length; n++) {
  
          var c = string.charCodeAt(n);
  
          if (c < 128) {
              utftext += String.fromCharCode(c);
          }
          else if((c > 127) && (c < 2048)) {
              utftext += String.fromCharCode((c >> 6) | 192);
              utftext += String.fromCharCode((c & 63) | 128);
          }
          else {
              utftext += String.fromCharCode((c >> 12) | 224);
              utftext += String.fromCharCode(((c >> 6) & 63) | 128);
              utftext += String.fromCharCode((c & 63) | 128);
          }
  
      }
  
      return utftext;
  },
  
  // private method for UTF-8 decoding
  _utf8_decode : function (utftext) {
      var string = "";
      var i = 0;
      var c = c1 = c2 = 0;
  
      while ( i < utftext.length ) {
  
          c = utftext.charCodeAt(i);
  
          if (c < 128) {
              string += String.fromCharCode(c);
              i++;
          }
          else if((c > 191) && (c < 224)) {
              c2 = utftext.charCodeAt(i+1);
              string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
              i += 2;
          }
          else {
              c2 = utftext.charCodeAt(i+1);
              c3 = utftext.charCodeAt(i+2);
              string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
              i += 3;
          }
  
      }
      return string;
  }
}

