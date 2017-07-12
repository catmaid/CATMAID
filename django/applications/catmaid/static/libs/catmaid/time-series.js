/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
  * Contains some methods for dealing with time series.
  */
  var TimeSeries = {};

  function sumBoutLengths(sum, bout) {
    // Count at least one millisecond per bout
    return sum + Math.max(1, bout.maxDate - bout.minDate);
  }

  function returnMinTime(currentMin, newMin) {
    return currentMin === null ? newMin : Math.min(currentMin, newMin);
  }

  function returnMaxTime(currentMax, newMax) {
    return currentMax === null ? newMax : Math.max(currentMax, newMax);
  }

  /**
   * A single time series event.
   */
  TimeSeries.Event = function(date, timeIndex, data) {
    this.date = date;
    this.timeIndex = timeIndex;
    this.data = data;
  };

  // Sort functions for sorting history data newest first. Since JavaScript
  // Date objects only support Microsecond precision, we need to compare
  // Postgres strings if two timestamps are equal up to the microsecond.
  var compareEvents = function(a, b) {
    // The time stamp is added as first element
    var ta = a.date;
    var tb = b.date;
    if (ta > tb) {
      return -1;
    }
    if (ta < tb) {
      return 1;
    }
    if (ta.getTime() === tb.getTime()) {
      // Compare microseconds in string representation, which is a hack,
      // but works
      var taS = a.data[a.timeIndex];
      var tbS = b.date[b.timeIndex];
      return -1 * CATMAID.tools.compareStrings(taS, tbS);
    }
  };

  var compareEventsAsc = function(a, b) {
   return -1 * compareEvents(a, b);
  };

  /**
   * A set of events that form one bout.
   */
  TimeSeries.Bout = function() {
    this.events = [];
    this.minDate = null;
    this.maxDate = null;
  };

  /**
   * Add a new event to this bout and adjust the min and max date.
   */
  TimeSeries.Bout.prototype.addEvent = function(e) {
    if (this.events.length === 0) {
      this.minDate = e.date;
      this.maxDate = e.date;
    } else {
      if (this.minDate > e.date) {
        this.minDate = e.date;
      }
      if (this.maxDate < e.date) {
        this.maxDate = e.date;
      }
    }
    this.events.push(e);
  };

  TimeSeries.EventSource = function(data, timeIndex) {
    this.data = data;
    this.timeIndex = timeIndex;
  };

  function sumEventSourceLengths(sum, sourceId) {
    /*jshint validthis:true */
    var source = this[sourceId];
    if (!(source && source.data)) {
      throw new CATMAID.ValueError("Event source '" + sourceId  + "' unavailable");
    }
    sum += source.data.length;
    return sum;
  }

  /**
   * Combine multiple event sources from a passed in pool into a list of events,
   * which can optionally be sorted.
   */
  TimeSeries.mergeEventSources = function(eventSources, selectedSources, sort) {
    var nEvents = selectedSources.reduce(sumEventSourceLengths.bind(eventSources), 0);
    var mergedEvents = new Array(nEvents);
    var addedEvents = 0;
    var Event = TimeSeries.Event;
    for (var i=0; i<selectedSources.length; ++i) {
      var sourceId = selectedSources[i];
      var source = eventSources[sourceId];
      var events = source.data;
      var timeIndex = source.timeIndex;
      for (var j=0, jmax=events.length; j<jmax; ++j) {
        var e = events[j];
        // Store each event source with normalized data:
        // [lowerBount, upperBound, [lowerBoundStr, upperBoundStr, data]]
        mergedEvents[addedEvents] = new Event(new Date(e[timeIndex]), timeIndex, e);
        ++addedEvents;
      }
    }

    if (sort) {
      if (sort === "asc") {
        mergedEvents.sort(compareEventsAsc);
      } else if (sort === "desc") {
        mergedEvents.sort(compareEvents);
      } else {
        throw new CATMAID.ValueError("The sort parameter can only be 'asc' or 'desc'");
      }
    }

    return mergedEvents;
  };

  TimeSeries.getActiveBouts = function(events, maxInactivity) {
    // Convert minutes to milliseconds
    maxInactivity = maxInactivity * 60 * 1000;
    return events.reduce(function(activeBouts, e) {
      var bout;
      if (activeBouts.length === 0) {
        bout = new TimeSeries.Bout();
        activeBouts.push(bout);
      } else {
        // Add this event to the last bout, if it doesn't exceed the max
        // inactivity interval.
        var lastBout = activeBouts[activeBouts.length - 1];
        if (e.date - lastBout.maxDate > maxInactivity) {
          bout = new TimeSeries.Bout();
          activeBouts.push(bout);
        } else {
          bout = lastBout;
        }
      }
      bout.addEvent(e);
      return activeBouts;
    }, []);
  };

  /**
   * Sum up the length of all bouts in milliseconds. If a bout consists of only
   * one event it counts as 1ms.
   */
  TimeSeries.getTotalTime = function(bouts) {
    return bouts.reduce(sumBoutLengths, 0);
  };

  /**
   * Get smallest timestamp in bouts.
   */
  TimeSeries.getMinTime = function(bouts) {
    return bouts.reduce(returnMinTime, null);
  };

  /**
   * Make a function that can be used together with Array.reduce to create an
   * object that maps time stamps to data entries.
   *
   * @param {Number} timestampIndex The data array index that represents the
   *                                relevant timestamp.
   */
  TimeSeries.makeHistoryAppender = function(timestampIndex) {
   return function(o, n) {
      var entries = o[n[0]];
      if (!entries) {
        entries = [];
        o[n[0]] = entries;
      }
      var lowerBound = new Date(n[timestampIndex]);
      var upperBound = new Date(n[timestampIndex + 1]);

      // Make sure the entry which encodes the creation time (live entry),
      // has its upper bound set to null (to represent infinity). All
      // entries are sorted already, we therefore only need to check the
      // first (youngest) entry.
      if (upperBound <= lowerBound ||
          upperBound.getTime() === lowerBound.getTime()) {
        lowerBound = upperBound;
        upperBound = null;
        n[timestampIndex] = n[timestampIndex + 1];
        n[timestampIndex + 1] = null;
      }

      entries.push([lowerBound, upperBound, n]);
      return o;
    };
  };

  // Sort functions for sorting history data newest first. Since JavaScript
  // Date objects only support Microsecond precision, we need to compare
  // Postgres strings if two timestamps are equal up to the microsecond.
  var compareTimestampEntry = function(timeIndexA, timeIndexB, a, b) {
    // The time stamp is added as first element
    var ta = a[0];
    var tb = b[0];
    if (ta > tb) {
      return -1;
    }
    if (ta < tb) {
      return 1;
    }
    if (ta.getTime() === tb.getTime()) {
      // Compare microseconds in string representation, which is a hack,
      // but works
      var taS = a[2][timeIndexA];
      var tbS = b[2][timeIndexB];
      return -1 * CATMAID.tools.compareStrings(taS, tbS);
    }
  };

  TimeSeries.sortArrays = function(timeIndex, n) {
    var elements = this[n];
    elements.sort(compareTimestampEntry.bind(window, timeIndex, timeIndex));
  };

  /**
   * Create history data structure to make timestamp based look-up easier. Each
   * data type has its own map of IDs to historic and present data, with each
   * datum represented by an actual date, which in turn maps to element data.
   */
  TimeSeries.makeHistoryIndex = function(options) {
    var history = {};
    for (var field in options) {
      var config = options[field];
      var input = config.data;
      history[field] = !input ? {} : input.reduce(
          CATMAID.TimeSeries.makeHistoryAppender(config.timeIndex), {});

      var ids = Object.keys(history[field]);
      ids.forEach(CATMAID.TimeSeries.sortArrays.bind(history[field], config.timeIndex));
    }
    return history;
  };

  /**
   * Get all nodes valid to a passed in time stamp (inclusive) as well as the
   * next time stamp a change happens. Returned is a list of the following form:
   * [nodes, nextChangeDate].
   */
  TimeSeries.getDataUntil = function(elements, timestamp) {
    return Object.keys(elements).reduce(function(o, n) {
      var versions = elements[n];
      var match = null;
      // Individual versions are sorted newest first
      for (var i=0; i<versions.length; ++i) {
        var validFrom = versions[i][0];
        var validTo = versions[i][1];
        if (validTo === null || validTo > timestamp) {
          if (validFrom <= timestamp) {
            match = i;
            break;
          } else {
            // Record time of next version of this node, if larger than
            // previous recording.
            if (null === o[1]) {
              o[1] = new Date(validFrom.getTime());
            } else if (validFrom < o[1]) {
              o[1].setTime(validFrom.getTime());
            }
          }
        }
      }
      if (null !== match) {
        var version = versions[match];
        o[0].push(version[2]);
      }
      return o;
    }, [[], null]);
  };


  // Export module
  CATMAID.TimeSeries = TimeSeries;

})(CATMAID);
