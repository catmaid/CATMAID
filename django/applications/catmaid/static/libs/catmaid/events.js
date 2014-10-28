/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * A very simple event bus. One can register to events and trigger them, both
 * work with custom arguments. A callback can also be registered along with its
 * context, so it will be executed in it. With the help of the extend method,
 * the event system can be used as mixin to other objects.
 *
 * The general design is adapted from
 * https://corcoran.io/2013/06/01/building-a-minimal-javascript-event-system/
 */
var Events = {
  Event: {
    on: function(event, callback, context) {
      this.hasOwnProperty('events') || (this.events = {});
      this.events.hasOwnProperty(event) || (this.events[event] = []);
      this.events[event].push([callback, context]);
    },
    trigger: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      var callbacks = this.events[event];
      for (var i=0, l=callbacks.length; i<l; i++) {
        var callback = callbacks[i][0];
        var context = callbacks[i][1] === undefined ? this : callbacks[i][1];
        callback.apply(context, args);
      }
    },
  },

  /**
   * Extend an existing object with the event system's functions.
   */
  extend: function(other) {
    for (var property in this.Event) {
      other[property] = this.Event[property];
    }
  },
};
