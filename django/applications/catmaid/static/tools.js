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
    var r, fragment;
    fragment = /#(.*?)$/i;
    if (r = fragment.exec(location.hash)) {
      var o, p, value;
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
    var r, query;
    query = /\?(.*?)$/i;
    if (r = query.exec(location.search)) {
      var o, p, value;
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
 * Makes a synchronous jQuery AJAX call and return the result.
 */
function sync_request(url, type, data) {
  // check parameters
  if (!type)
    type = "GET";
  // init return variable
  var result = "";
  // make the call
  jQuery.ajax({
    type: type,
    url: url,
    data: data,
    success: function(response) {
      result = response;
    },
    async:false
  });

  return result;
}

/**
 * Stops default behaviour of an event. Found here:
 * http://stackoverflow.com/questions/891581
 */
function stopDefault(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
    }
    else {
        window.event.returnValue = false;
    }
    return false;
}

/**
 * Creates a deep copy of an object. Based on:
 * http://stackoverflow.com/questions/122102
 */
function deepCopy(obj) {
    if(obj == null || typeof(obj) !== 'object'){
        return obj;
    }
    //make sure the returned object has the same prototype as the original
    var ret = Object.create(Object.getPrototypeOf(obj));
    for(var key in obj){
        ret[key] = deepCopy(obj[key]);
    }
    return ret;
}

/**
 * Creates a jQuery UI based error dialog. If detail is passed, it is hidden by
 * default. The dialog allows to expand it, however.
 */
window.ErrorDialog = function(text, detail) {
  this.dialog = document.createElement('div');
  this.dialog.setAttribute("id", "dialog-confirm");
  this.dialog.setAttribute("title", "An error occured");
  // Create error message tags
  var msg = document.createElement('p');
  msg.appendChild(document.createTextNode(text));
  this.dialog.appendChild(msg);
  // Create detail field, if detail available
  if (detail) {
    var detail_head = document.createElement('p');
    var detail_head_em = document.createElement('em')
    detail_head_em.appendChild(document.createTextNode('Show/hide detail'));
    detail_head.appendChild(detail_head_em);
    this.dialog.appendChild(detail_head);
    var detail_text = document.createElement('p');
    detail_text.appendChild(document.createTextNode(detail));
    this.dialog.appendChild(detail_text);
    // Hide detail by default and toggle display by click on header
    $(detail_text).hide();
    $(detail_head).click(function() {
      $(detail_text).toggle();
    });
    $(detail_head_em).css('cursor', 'pointer');
  }
};

window.ErrorDialog.prototype = {};

/**
 * Displays the error dialog.
 */
window.ErrorDialog.prototype.show = function() {
  $(this.dialog).dialog({
    width: '400px',
    height: 'auto',
    modal: true,
    buttons: {
      "OK": function() {
        $(this).dialog("close");
      }
    }
  });
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
        new ErrorDialog(json.error, json.detail).show();
        if (typeof(error) == 'function') {
          error();
        }
      } else {
        if (typeof(success) == 'function') {
          success(json);
        }
      }
    } else {
      new ErrorDialog("An error occured",
          "The server returned an unexpected status: " + status).show();
      if (typeof(error) == 'function') {
        error();
      }
    }
  };
};
