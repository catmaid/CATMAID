/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
  * Contains some methods for dealing with time series.
  */
  var TimeSeries = {};

  function sumBoutLengths(sum, bout) {
    // Count at least one second per bout
    return sum + Math.max(1000, bout.maxDate - bout.minDate);
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
  TimeSeries.Event = function(date, timeIndex, userIndex, data) {
    this.date = date;
    this.timeIndex = timeIndex;
    this.userIndex = userIndex;
    this.data = data;
  };

  /**
   * Compare two dates in millisecond precision using date objects.
   */
  var compareEventsFast = function(a, b) {
    // The time stamp is added as first element
    var ta = a.date;
    var tb = b.date;
    if (ta > tb) {
      return -1;
    }
    if (ta < tb) {
      return 1;
    }
    return 0;
  };

  var compareEventsAscFast = function(a, b) {
   return -1 * compareEventsFast(a, b);
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

  TimeSeries.EventSource = function(data, timeIndex, userIndex) {
    if (Array.isArray(data)) {
      this.data = data;
    } else {
      var unmappedData = Object.keys(data);
      for (var i=0, max=unmappedData.length; i<max; ++i) {
        unmappedData[i] = data[unmappedData[i]];
      }
      this.data = unmappedData;
    }
    this.timeIndex = timeIndex;
    this.userIndex = userIndex;
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
   *
   * @param {Bool} sortExact Whether sorting needs to be microsecond precise or
   *                         millisecond sorting is okay.
   * @param {Set}  onlyUsers Optional, set of user IDs that are allowed in the
   *                         result. If empty or undefined, all users are
   *                         allowed.
   * @param {Date} timeWindowStart Optional, only changes after this date are
   *                               allowed. If undefined, no lower limit is set.
   * @param {Date} timeWindowEnd   Optional, only changes before this date are
   *                               allowed. If undefined, no upper limit is set.
   */
  TimeSeries.mergeEventSources = function(eventSources, selectedSources, sort,
      sortExact, onlyUsers, timeWindowStart, timeWindowEnd) {
    var nEvents = selectedSources.reduce(sumEventSourceLengths.bind(eventSources), 0);
    var mergedEvents = new Array(nEvents);
    var addedEvents = 0;
    var Event = TimeSeries.Event;
    let hasUserFilter = onlyUsers && onlyUsers.size > 0;
    let hasLowerDateFilter = !!timeWindowStart;
    let hasUpperDateFilter = !!timeWindowEnd;
    for (var i=0; i<selectedSources.length; ++i) {
      var sourceId = selectedSources[i];
      var source = eventSources[sourceId];
      var events = source.data;
      var timeIndex = source.timeIndex;
      var userIndex = source.userIndex;
      for (var j=0, jmax=events.length; j<jmax; ++j) {
        var e = events[j];

        // Skip event if its user isn't allowed
        if (hasUserFilter && !onlyUsers.has(e[userIndex])) {
          continue;
        }

        // Skip event if it doesn't match date filter
        var time = new Date(e[timeIndex]);
        if (hasLowerDateFilter && time < timeWindowStart) {
          continue;
        }
        if (hasUpperDateFilter && time > timeWindowEnd) {
          continue;
        }

        // Store each event source with normalized data:
        // [lowerBount, upperBound, [lowerBoundStr, upperBoundStr, data]]
        mergedEvents[addedEvents] = new Event(time, timeIndex, userIndex, e);
        ++addedEvents;
      }
    }

    if (sort) {
      if (sort === "asc") {
        mergedEvents.sort(sortExact ? compareEventsAsc : compareEventsAscFast);
      } else if (sort === "desc") {
        mergedEvents.sort(sortExact ? compareEvents : compareEventsFast);
      } else {
        throw new CATMAID.ValueError("The sort parameter can only be 'asc' or 'desc'");
      }
    }

    return mergedEvents;
  };

  /**
   * Group all input events into bouts which only contain events that are a
   * maximum of <maxInactivity> seconds apart from each other. To count parallel
   * events of different users correctly, <mergeUsers> has to be set to false.
   * If this is the case, all events within one bout will be from the same user.
   * This also means, bouts can overlap. The optional <onlyUsers> options can
   * provide a set with user IDs that should explicitely be included, all other
   * users will be excluded.
   */
  TimeSeries.getActiveBouts = function(events, maxInactivity, mergeUsers, onlyUsers) {
    // Convert minutes to milliseconds
    maxInactivity = maxInactivity * 60 * 1000;
    if (mergeUsers) {
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
    } else {
      var boutCollection = events.reduce(function(o, e) {
        var activeBouts = o.activeBouts;
        var userId = e.data[e.userIndex];
        var bout = o.lastUserBouts[userId];

        // Add this event to the last bout, if it doesn't exceed the max
        // inactivity interval.
        if (!bout || (e.date - bout.maxDate > maxInactivity)) {
          bout = new TimeSeries.Bout();
          o.lastUserBouts[userId] = bout;
          activeBouts.push(bout);
        }
        bout.addEvent(e);

        return o;
      }, {
        activeBouts: [],
        lastUserBouts: {}
      });

      return boutCollection.activeBouts;
    }
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
      // first (youngest) entry, which is the live table entry unless its upper
      // bound is larger than the lower bound.
      if (entries.length === 0 && (
          upperBound <= lowerBound ||
          upperBound.getTime() === lowerBound.getTime())) {
        upperBound = null;
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
   *
   * @param {Object} options Maps entry name to a {data: [], timeIndex: n}
   *                          array.
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

  /* Test each <data> element if the value at index <idx> is available as key in
   * the passted in <historyIndex> (see makeHistoryIndex()). If not, the value
   * at index <idx> will become null.
   *
   * @param {EventSource}  eventSource  The list of data elements to check.
   * @param {HistoryIndex} historyIndex A history index created with
   *                                    makeHistoryIndex().
   * @param {idx}          idx          The index in a data element to test and
   *                                    update.
   */
  TimeSeries.setUnavailableReferencesNull = function(eventSource, historyIndex, idx) {
    var data = eventSource.data;
    for (var i=0, max=data.length; i<max; ++i) {
      var element = data[i];
      var key = element[idx];
      if (historyIndex[key] === undefined) {
        element[idx] = null;
      }
    }
  };

  /**
   * Get all nodes valid to a passed in time stamp (inclusive) as well as the
   * next time stamp a change happens. Returned is a list of the following form:
   * [nodes, nextChangeDate].
   */
  TimeSeries.getDataInWindow = function(elements, timeWindowStart, timeWindowEnd) {
    timeWindowStart = timeWindowStart ? timeWindowStart : new Date(0);
    timeWindowEnd = timeWindowEnd ? timeWindowEnd : new Date();
    return Object.keys(elements).reduce(function(o, n) {
      var versions = elements[n];
      var match = null;
      // Individual versions are sorted newest first
      for (var i=0; i<versions.length; ++i) {
        var validFrom = versions[i][0];
        var validTo = versions[i][1];
        if (validTo === null || validTo > timeWindowEnd) {
          if (validFrom <= timeWindowEnd && validFrom >= timeWindowStart) {
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

  /**
   * Get a new arbor parser instance valid at the given point in time.
   */
  TimeSeries.getArborBeforePointInTime = function(nodeHistory, connectorHistory,
      timeWindowStart, timeWindowEnd) {
    var nodes = TimeSeries.getDataInWindow(nodeHistory, timeWindowStart,
        timeWindowEnd)[0];
    var parser = new CATMAID.ArborParser();
    var parser =  parser.tree(nodes);
    if (connectorHistory) {
      var connectors = TimeSeries.getDataInWindow(connectorHistory,
          timeWindowStart, timeWindowEnd)[0];
      parser.connectors(connectors);
    }
    return parser;
  };


  // Export module
  CATMAID.TimeSeries = TimeSeries;

})(CATMAID);
