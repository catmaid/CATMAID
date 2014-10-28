/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * A very simple event bus. One can register to events and trigger them, both
 * work with custom arguments.
 */
var Events = {
  Event: {
    on: function(event, callback) {
      this.hasOwnProperty('events') || (this.events = {});
      this.events.hasOwnProperty(event) || (this.events[event] = []);
      this.events[event].push(callback);
    },
    trigger: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      var callbacks = this.events[event];
      for (var i=0, l=callbacks.length; i<l; i++) {
        callbacks[i].apply(this, args);
      }
    },
  }
};
