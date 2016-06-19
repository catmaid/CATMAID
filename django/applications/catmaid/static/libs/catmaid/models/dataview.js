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
     * Get a specific data view.
     *
     * @returns {Promise} A promise that resolves with details on the requested
     *                    data view.
     */
    get: function(dataviewId) {
      var url = 'dataviews/show/' + dataviewId;
      return CATMAID.fetch(url, 'GET', undefined, true);
    },

    /**
     * Get the default data view configuration.
     *
     * @returns {Promise} A promise that resolves with the ID and code type and
     *                    configuration of the default data view.
     */
    getDefaultConfig: function() {
      var url = 'dataviews/default';
      return CATMAID.fetch(url, 'GET', undefined);
    },

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
