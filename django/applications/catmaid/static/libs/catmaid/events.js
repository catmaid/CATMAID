/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

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
    /**
     * The object implementing the event system.
     */
    Event: {
      /**
       * Register with the event bus for a specific event. If this event is
       * triggered, the callback is executed. If a context is provided, this
       * context is used for the callback (i.e. what 'this' is referring to
       * in the callback), otherwise the event object is used as context.
       */
      on: function(event, callback, context) {
        /* jshint expr:true */
        this.hasOwnProperty('events') || (this.events = {});
        this.events.hasOwnProperty(event) || (this.events[event] = []);
        this.events[event].push([callback, context]);
      },
      /**
       * Unregister a callback from an event. If a context is given, the callback
       * is only unregistered, if the context matches the context of the stored
       * callback.
       */
      off: function(event, callback, context) {
        if (this.hasOwnProperty('events') && this.events.hasOwnProperty(event)) {
          var indexes = [];
          for (var i=0, l=this.events[event].length; i<l; i++) {
            var cbMatches = (callback === this.events[event][i][0]);
            if (cbMatches) {
              if (context) {
                var ctxMatches = (context === this.events[event][i][1]);
                if (cbMatches && ctxMatches) {
                  indexes.push(i);
                }
              } else {
                indexes.push(i);
              }
            }
          }
          for (var i=0, l=indexes.length; i<l; i++) {
            // Remove the event and keep offset due to removed elements in mind
            this.events[event].splice(indexes[i] - i, 1);
          }
        }
      },
      /**
       * Remove all listeners from the given event.
       */
      clear: function(event) {
        if (this.hasOwnProperty('events') && this.events.hasOwnProperty(event)) {
          return delete this.events[event];
        }
        return false;
      },
      /**
       * Triggers the given event and calls all its listeners.
       */
      trigger: function(event) {
        if (undefined === this.events || undefined === this.events[event]) {
          return;
        }
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
      return other;
    },
  };

  // Make Events available in CATMAID namespace
  CATMAID.Events = Events;

})(CATMAID);
