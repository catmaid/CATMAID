/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * input element with mousewheel-control and increase-decrease handles
 */

function Input(
name, size, onchange, defaultvalue) {
  /**
   * returns the containing span-element for insertion to the document
   */
  this.getView = function () {
    return view;
  };

  /**
   * pointer up, so clear the timer
   */
  var pointerUp = function (e) {
    if (timer) window.clearTimeout(timer);

    CATMAID.ui.releaseEvents();
    CATMAID.ui.removeEvent("onpointerup", pointerUp);

    return false;
  };

  /**
   * decreases the value and invoke timeout
   */
  var decrease = function () {
    var val = parseInt(input.value);
    if (isNaN(val)) return;
    else {
      input.value = val - 1;
      input.onchange();
      timer = window.setTimeout(decrease, 250);
    }
    return;
  };

  /**
   * pointer down on the increase button, so move up, setting a timer
   */
  var topMouseDown = function (e) {
    if (timer) window.clearTimeout(timer);

    CATMAID.ui.registerEvent("onpointerup", pointerUp);
    CATMAID.ui.setCursor("auto");
    CATMAID.ui.catchEvents();
    CATMAID.ui.onpointerdown(e);

    decrease();
    return false;
  };

  /**
   * increases the value and invoke timeout
   */
  var increase = function () {
    var val = parseInt(input.value);
    if (isNaN(val)) return;
    else {
      input.value = val + 1;
      input.onchange();
      timer = window.setTimeout(increase, 250);
    }
    return;
  };

  /**
   * pointer down on the top bar, so move up, setting a timer
   */
  var bottomMouseDown = function (e) {
    if (timer) window.clearTimeout(timer);

    CATMAID.ui.registerEvent("onpointerup", pointerUp);
    CATMAID.ui.setCursor("auto");
    CATMAID.ui.catchEvents();
    CATMAID.ui.onpointerdown(e);

    increase();
    return false;
  };

  /**
   * mouse wheel over input
   */
  var mouseWheel = function (e) {
    var val = parseInt(input.value);
    if (isNaN(val)) return;

    var w = CATMAID.ui.getMouseWheel(e);
    if (w) {
      if (w > 0) {
        input.value = val - 1;
      } else {
        input.value = val + 1;
      }
    }
    input.onchange();
    return false;
  };

  // initialise
  var self = this;
  var timer;

  var view = document.createElement("span");
  //view.style.paddingLeft = "2em";
  var input = document.createElement("input");
  input.type = "text";
  input.size = size;
  input.id = input.name = name;

  if (typeof defaultvalue != "undefined") input.value = defaultvalue;

  var map = document.createElement("map");
  map.id = map.name = "map_" + name;
  var area1 = document.createElement("area");
  area1.shape = "rect";
  area1.coords = "0,0,13,9";
  area1.alt = "+";
  var area2 = document.createElement("area");
  area2.shape = "rect";
  area2.coords = "0,10,13,18";
  area2.alt = "-";


  area1.onpointerdown = bottomMouseDown;
  area2.onpointerdown = topMouseDown;

  area1.onpointerup = pointerUp;
  area2.onpointerup = pointerUp;

  map.appendChild(area1);
  map.appendChild(area2);

  var img = document.createElement("img");
  img.src = STATIC_URL_JS + "images/input_topdown.svg";
  img.setAttribute('onerror', 'this.onerror=null;this.src="' +
    STATIC_URL_JS + 'images/input_topdown.gif";');
  img.alt = "";
  img.useMap = "#map_" + name;

  view.appendChild(map);
  view.appendChild(input);
  view.appendChild(img);

  input.onchange = onchange;
  input.addEventListener("wheel", mouseWheel, false);
}
