/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a container to which one can push messages and coordinates. Both are
   * displayed separately from each other.
   */
  CATMAID.Console = function() {
    var view = document.createElement("div");
    view.className = "console";

    var coords = document.createElement("div");
    coords.id = "coordinates";
    var coordsText = document.createTextNode("");
    coords.appendChild(coordsText);
    view.appendChild(coords);
    view.appendChild(document.createElement("pre"));

    this.printCoords = function (obj) {
      coordsText.textContent = obj;
    };

    var toStr = function (obj, ins) {
      if (typeof ins == "undefined") ins = "";

      var type = typeof(obj);
      var str = "[" + type + "] ";

      switch (type) {
      case "function":
      case "object":
        if (ins.length <= 6) {
          str += "\r\n";
          for (var key in obj) {
            str += ins + "\"" + key + "\" => " + toStr(obj[key], ins + "  ") + "\r\n";
          }
        } else str += "...";
        break;
      case "undefined":
        break;
      default:
        str += obj;
        break;
      }
      return str;
    };

    this.setBottom = function() {
      view.style.bottom = "0px";
    };

    this.print = function (obj) {
      if (typeof obj == "string") view.lastChild.appendChild(document.createTextNode(obj));
      else
      view.lastChild.appendChild(document.createTextNode(toStr(obj)));
      return;
    };

    this.println = function (obj) {
      var sp = document.createElement("pre");
      if (typeof obj == "string") sp.appendChild(document.createTextNode(obj));
      else
      sp.appendChild(document.createTextNode(toStr(obj)));
      view.appendChild(sp);
      return;
    };

    this.replaceLast = function (obj) {
      var sp = document.createElement("pre");
      if (typeof obj == "string")
        sp.appendChild(document.createTextNode(obj));
      else
        sp.appendChild(document.createTextNode(toStr(obj)));
      view.replaceChild(sp, view.lastChild);
      return;
    };

    this.replaceLastHTML = function (html) {
      var e = document.createElement("pre");
      e.innerHTML = html;
      view.replaceChild(e, view.lastChild);
    };

    this.getView = function () {
      return view;
    };
  };

})(CATMAID);
