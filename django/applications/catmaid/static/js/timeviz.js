/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

    "use strict";

    var TimeVisualization = function() {

    };

    /**
     * Get a DOM element representing this visualization.
     */
    TimeVisualization.prototype.getView = function() {
      return document.createTextNode("test");
    };

    // Export visualization
    CATMAID.TimeVisualization = TimeVisualization;

})(CATMAID);
