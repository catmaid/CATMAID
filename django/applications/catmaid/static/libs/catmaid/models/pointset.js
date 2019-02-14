/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var Pointset = {};

  /**
   * Get all point sets visible in the passed in project.
   *
   * @param projectId   {Number}  The project of the returned point sets
   * @param simple      {Boolean} Whether or not only id and name are returned.
   * @param order_by    {String}  (optional) Which field to order the returned
   *                              point sets by (name, id). Default: none.
   * @returns {Promise} Resolves with a list of point sets.
   */
  Pointset.listAll = function(projectId, simple, order_by) {
    return CATMAID.fetch(projectId + '/pointsets/', 'GET', {
      simple: !!simple,
      order_by: order_by,
    });
  };

  /**
   * Get detailed information on a set of point set, if they are
   * visible in the passed in project.
   *
   * @param projectId {Number}  The project of the returned point set
   * @param simple    {Boolean} Whether or not only id and name are returned.
   * @returns {Promise} Resolves with a list of point sets.
   */
  Pointset.list = function(projectId, simple, pointsetIds) {
    return CATMAID.fetch(projectId + '/pointsets/', pointsetIds ? 'POST' : 'GET', {
      simple: !!simple,
      pointset_ids: pointsetIds,
    });
  };

  /**
   * Return a particular point set.
   *
   * @param projectId  {Number}  The project to operate in.
   * @param pointsetId {Number}  The point set to return.
   * @param withPoints {Boolean} Whether or not to return point data.
   * @returns {Promise} Resolves with details on the request point set.
   */
  Pointset.get = function(projectId, pointsetId, withPoints) {
    return CATMAID.fetch(projectId + '/pointsets/' + pointsetId + '/', 'GET', {
      with_points: !!withPoints,
    });
  };

  CATMAID.Pointset = Pointset;

})(CATMAID);

