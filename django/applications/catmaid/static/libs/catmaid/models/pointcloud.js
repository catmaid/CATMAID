/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var Pointcloud = {};

  /**
   * Get all point clouds visible in the passed in project.
   *
   * @param projectId   {Number}  The project of the returned point clouds
   * @param simple      {Boolean} Whether or not only id and name are returned.
   * @param with_images {Boolean} (optional) Whether image meta data should be
   *                              included in the response. Default is false.
   * @param order_by    {String}  (optional) Which field to order the returned
   *                              point clouds by (name, id). Default: none.
   * @returns {Promise} Resolves with a list of point clouds.
   */
  Pointcloud.listAll = function(projectId, simple, with_images, order_by) {
    return CATMAID.fetch(projectId + '/pointclouds/', 'GET', {
      simple: !!simple,
      with_images: !!with_images,
      order_by: order_by,
    });
  };

  /**
   * Get detailed information on a set of query point clouds, if they are
   * visible in the passed in project.
   *
   * @param projectId {Number}  The project of the returned point clouds
   * @param simple    {Boolean} Whether or not only id and name are returned.
   * @param with_images {Boolean} (optional) Whether image meta data should be
   *                              included in the response. Default is false.
   * @returns {Promise} Resolves with a list of point clouds.
   */
  Pointcloud.list = function(projectId, simple, with_images, pointcloudIds) {
    return CATMAID.fetch(projectId + '/pointclouds/', pointcloudIds ? 'POST' : 'GET', {
      simple: !!simple,
      with_images: !!with_images,
      pointcloud_ids: pointcloudIds,
    });
  };

  /**
   * Add a new point cloud to a project. The passed in points are expected to by
   * a list of three-element lists that represent X, Y and Z of a single point.
   *
   * @param projectId {Number}     The project to add the point cloud to.
   * @param name      {String}     Name of the new point cloud.
   * @param points    {Number[][]} An array of XYZ arrays representing the
   *                               points of the point clouod.
   * @param description {String}   (optional) Description of the point cloud.
   * @param sourcePath  {String}   (optional) A reference to the source file.
   * @param groupId   {Number}     (optional) A group which users need to be
   *                               members of to see this point cloud.
   */
  Pointcloud.add = function(projectId, name, points, description, images,
      sourcePath, groupId) {
    var data = new FormData();
    data.append('name', name);
    data.append('description', description);
    data.append('points', JSON.stringify(points));
    if (sourcePath) data.append('source_path', sourcePath);
    if (groupId) data.append('group_id', groupId);
    if (images) {
     images.forEach(function(image, i){
       data.append('images[' + i + ']', image.file, image.name);
       data.append('image_descriptions[' + i + ']', image.description);
       data.append('image_names[' + i + ']', image.name);
     });
    }

    return CATMAID.fetch(projectId + '/pointclouds/', 'PUT', data, undefined,
        undefined, undefined, undefined, {"Content-type" : null})
      .then(function(result) {
        CATMAID.Pointcloud.trigger(CATMAID.Pointcloud.EVENT_POINTCLOUD_ADDED, result.id);
        return result;
      });
  };

  /**
   * Return a particular point cloud.
   *
   * @param projectId    {Number}  The project to operate in.
   * @param pointcloudId {Number}  The point cloud to return.
   * @param withPoints   {Boolean} Whether or not to return point data.
   * @param withImages   {Boolean} Whether or not to return image info.
   * @param sampleRatio  {Number}  Number in range [0,1] that reflects the
   *                               percentage of point cloud that should be loaded.
   * @returns {Promise} Resolves with details on the request point cloud.
   */
  Pointcloud.get = function(projectId, pointcloudId, withPoints, withImages, sampleRatio) {
    return CATMAID.fetch(projectId + '/pointclouds/' + pointcloudId + '/', 'GET', {
      with_points: !!withPoints,
      with_images: !!withImages,
      sample_ratio: sampleRatio,
    });
  };

  /**
   * Delte a particular point cloud.
   *
   * @param projectId    {Number} The project to operate in.
   * @param pointcloudId {Number} The point cloud to delete.
   * @returns {Promise} Resolves when the deletion was successful.
   */
  Pointcloud.delete = function(projectId, pointcloudId) {
    return CATMAID.fetch(projectId + '/pointclouds/' + pointcloudId + '/', 'DELETE')
      .then(function(result) {
        CATMAID.Pointcloud.trigger(CATMAID.Pointcloud.EVENT_POINTCLOUD_DELETED, result.id);
        return result;
      });
  };

  /**
   * Return the path to a particular image.
   */
  Pointcloud.getImagePath = function(projectId, pointcloudId, imageId) {
    return CATMAID.makeURL(project.id + '/pointclouds/' + pointcloudId +
        '/images/' + imageId + '/');
  };

  /**
   * Return a bounding box for a passed in point cloud.
   */
  Pointcloud.getBoundingBox = function(pointCloud) {
    return Pointcloud.getBoundingBoxOfPoints(pointCloud.points);
  };

  Pointcloud.getBoundingBoxOfPoints = function(points) {
    // Find bounding box around locations
    let min = { x: Infinity, y: Infinity, z: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (var i=0, imax=points.length; i<imax; ++i) {
      let loc = points[i];
      if (loc[1] < min.x) min.x = loc[1];
      if (loc[2] < min.y) min.y = loc[2];
      if (loc[3] < min.z) min.z = loc[3];
      if (loc[1] > max.x) max.x = loc[1];
      if (loc[2] > max.y) max.y = loc[2];
      if (loc[3] > max.z) max.z = loc[3];
    }
    return {
      min: min,
      max: max
    };
  };

  // Add events
  CATMAID.asEventSource(Pointcloud);
  Pointcloud.EVENT_POINTCLOUD_ADDED = 'pointcloud_added';
  Pointcloud.EVENT_POINTCLOUD_DELETED = 'pointcloud_deleted';

  CATMAID.Pointcloud = Pointcloud;

})(CATMAID);

