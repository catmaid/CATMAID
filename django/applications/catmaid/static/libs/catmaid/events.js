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
  var Event = {

    /**
     * Register with the event bus for a specific event. If this event is
     * triggered, the callback is executed. If a context is provided, this
     * context is used for the callback (i.e. what 'this' is referring to
     * in the callback), otherwise the event object is used as context.
     */
    on: function(event, callback, context) {
      // Reject falsy callbacks and events
      if (!event) {
        throw new CATMAID.ValueError("Event not valid");
      }
      if (!callback) {
        throw new CATMAID.ValueError("Callback not valid");
      }
      // Initialize event map on first use
      if (!this.hasOwnProperty('events')) {
        this.events = new Map();
      }
      // Initialize listener array for event, if not already present
      if (!this.events.has(event)) {
        this.events.set(event, []);
      }
      // Add new listener with context to event
      this.events.get(event).push([callback, context]);
    },

    /**
     * Unregister a callback from an event. If a context is given, the callback
     * is only unregistered, if the context matches the context of the stored
     * callback. Note if a prototype method is used for a callback, a context
     * should be supplied to only remove the handler use in question.
     */
    off: function(event, callback, context) {
      // Reject falsy callbacks and events
      if (!event) {
        throw new CATMAID.ValueError("Event not valid");
      }
      if (!callback) {
        throw new CATMAID.ValueError("Callback not valid");
      }
      if (this.hasOwnProperty('events') && this.events.has(event)) {
        var indexes = [];
        var listeners = this.events.get(event);
        for (var i=0, l=listeners.length; i<l; i++) {
          var cbMatches = (callback === listeners[i][0]);
          if (cbMatches) {
            if (context) {
              var ctxMatches = (context === listeners[i][1]);
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
          listeners.splice(indexes[i] - i, 1);
        }
      }
    },

    /**
     * Remove all listeners from the given event.
     */
    clear: function(event) {
      if (this.hasOwnProperty('events') && this.events.has(event)) {
        return this.events.delete(event);
      }
      return false;
    },

    /**
     * Remove all listeners from all events available for the current context.
     */
    clearAllEvents: function() {
      var result = false;
      if (this.hasOwnProperty('events')) {
        this.events.clear();
      }
      return result;
    },


    /**
     * Triggers the given event and calls all its listeners.
     */
    trigger: function(event) {
      if (!(this.hasOwnProperty('events') && this.events.has(event))) {
        return;
      }
      var args = Array.prototype.slice.call(arguments, 1);
      var callbacks = this.events.get(event);
      for (var i=0, l=callbacks.length; i<l; i++) {
        var callback = callbacks[i][0];
        var context = callbacks[i][1] === undefined ? this : callbacks[i][1];
        callback.apply(context, args);
      }
    },

    /**
     * Returns whether this event source has listeners to any event.
     */
    hasListeners: function() {
      if (!(this.hasOwnProperty('events'))) {
        return false;
      }
      for (var callbacks of this.events.values()) {
        if (callbacks.length > 0) {
          return true;
        }
      }
      return false;
    }
  };

  /**
   * A mixin that adds event source functionality to the current context. The
   * actual function implementations are cached and the same for all instances.
   */
  var EventSource = function() {
    this.on = Event.on;
    this.off = Event.off;
    this.clear = Event.clear;
    this.clearAllEvents = Event.clearAllEvents;
    this.trigger = Event.trigger;
    this.hasListeners = Event.hasListeners;

    return this;
  };

  // Make event source available in CATMAID namespace and add a mixin version of
  // it.
  CATMAID.EventSource = EventSource;
  CATMAID.asEventSource = function(obj) {
    return CATMAID.EventSource.call(obj);
  };

})(CATMAID);
