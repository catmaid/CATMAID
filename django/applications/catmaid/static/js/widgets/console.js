/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a container to which one can push messages and coordinates. Both are
   * displayed separately from each other.
   */
  CATMAID.Console = function() {
    // No new message can be printed while blocked
    this.blocked = false;

    var view = document.createElement("div");
    view.className = "console";

    let toolbarsHidden = false;
    let maxSpace = document.createElement('div');
    maxSpace.id = "toggle-max-space";
    let maxSpaceText = maxSpace.appendChild(document.createElement('i'));
    maxSpaceText.classList.add('fa', 'fa-eye-slash');
    maxSpaceText.setAttribute('title', 'Toggle visibility of top toolbars');
    view.appendChild(maxSpace);
    maxSpaceText.onclick = () => {
      let toolbar = document.getElementById('toolbar_container');
      if (!toolbar) {
        CATMAID.warn("Could not find toolbar!");
        return;
      }
      toolbarsHidden = !toolbarsHidden;
      if (toolbarsHidden) {
        maxSpaceText.classList.replace('fa-eye-slash', 'fa-eye');
        toolbar.style.display = 'none';
      } else {
        maxSpaceText.classList.replace('fa-eye', 'fa-eye-slash');
        toolbar.style.display = 'block';
      }
      window.onresize();
    };

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

    this.print = function (obj, color) {
      if (this.blocked) {
        return;
      }
      var line;
      if (typeof obj == "string") {
        line = document.createTextNode(obj);
      } else {
        line = document.createTextNode(toStr(obj));
      }
      if (color) {
        line.style.color = color;
      }
      view.lastChild.appendChild(line);
      return;
    };

    this.println = function (obj, color) {
      if (this.blocked) {
        return;
      }
      var sp = document.createElement("pre");
      if (typeof obj == "string") {
        sp.appendChild(document.createTextNode(obj));
      } else {
        sp.appendChild(document.createTextNode(toStr(obj)));
      }
      if (color) {
        sp.style.color = color;
      }
      view.appendChild(sp);
      return;
    };

    this.replaceLast = function (obj, color) {
      if (this.blocked) {
        return;
      }
      var sp = document.createElement("pre");
      if (typeof obj == "string") {
        sp.appendChild(document.createTextNode(obj));
      } else {
        sp.appendChild(document.createTextNode(toStr(obj)));
      }
      if (color) {
        sp.style.color = color;
      }
      view.replaceChild(sp, view.lastChild);
      return;
    };

    this.replaceLastHTML = function (html) {
      if (this.blocked) {
        return;
      }
      var e = document.createElement("pre");
      e.innerHTML = html;
      view.replaceChild(e, view.lastChild);
    };

    this.getView = function () {
      return view;
    };

    this.setWarning = function(text) {
      this.replaceLast(text);
      this.blocked = true;
      view.classList.add('warning');
    };

    this.unsetWarning = function() {
      this.unblock();
      view.classList.remove('warning');
    };

    this.replaceLastSticky = function(obj, color, time) {
      this.replaceLast(obj, color);
      this.blocked = true;
      setTimeout((function() {
        this.blocked = false;
      }).bind(this), time || 3000);
    };

    this.unblock = function() {
      this.blocked = false;
    };
  };

})(CATMAID);
