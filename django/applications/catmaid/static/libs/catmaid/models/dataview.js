/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with data views, CATMAID's
   * front pages.
   */
  var DataViews = {

    /**
     * Get all available data views.
     *
     * @returns {Promise} A promise that resolves with a list of all data views.
     */
    list: function() {
      var url = 'dataviews/list';
      return CATMAID.fetch(url, 'GET');
    }

  };

  // Export data views
  CATMAID.DataViews = DataViews;

})(CATMAID);
