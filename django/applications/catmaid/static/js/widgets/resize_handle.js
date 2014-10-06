/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * simple resize handles
 */

/**
 * a vertical or horizontal resize handle
 *
 */
ResizeHandle = function (type, node) {
  /**
   * returns the html-element
   */
  this.getView = function () {
    return view;
  };

  var onmousemove = {
    h: function (e) {
      ode.changeWidth( ui.diffX );
      return false;
    },
    v: function (e) {
      node.changeHeight( ui.diffY );
      return false;
    }
  };

  var onmouseup = {
    h: function (e) {
      ui.releaseEvents();
      ui.removeEvent("onmousemove", onmousemove.h);
      ui.removeEvent("onmouseup", onmouseup.h);
      return false;
    },
    v: function (e) {
      ui.releaseEvents();
      ui.removeEvent("onmousemove", onmousemove.v);
      ui.removeEvent("onmouseup", onmouseup.v);
      return false;
    }
  };

  var onmousedown = {
    h: function (e) {
      ui.registerEvent("onmousemove", onmousemove.h);
      ui.registerEvent("onmouseup", onmouseup.h);
      ui.catchEvents("e-resize");
      ui.onmousedown(e);
      ui.catchFocus();

      return false;
    },
    v: function (e) {
      ui.registerEvent("onmousemove", onmousemove.v);
      ui.registerEvent("onmouseup", onmouseup.v);
      ui.catchEvents("s-resize");
      ui.catchFocus();

      return false;
    }
  };


  // initialise
  if (typeof ui === "undefined") ui = new UI();

  var self = this;

  if (type != "v") type = "h";
  var view = document.createElement("div");
  view.className = "resize_handle_" + type;
  view.onmousedown = onmousedown[type];
  view.onmouseup = onmouseup[type];
};
