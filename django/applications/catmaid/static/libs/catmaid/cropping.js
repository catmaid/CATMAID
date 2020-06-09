(function(CATMAID) {

  "use strict";

  /**
   * Request the asynchronous creation of a cropped sub-volume.
   *
   * @param projectId Target project ID
   * @param stackIds  Array of IDs of stacks to be cropped
   * @param minX      Minimum X project coordinate of cropping bounding box
   * @param minY      Minimum Y project coordinate of cropping bounding box
   * @param minZ      Minimum Z project coordinate of cropping bounding box
   * @param maxX      Maximum X project coordinate of cropping bounding box
   * @param maxY      Maximum Y project coordinate of cropping bounding box
   * @param maxZ      Maximum Z project coordinate of cropping bounding box
   * @param zoomLevel Zoom level of final cropped volume
   * @param rotationZ Optional clockwise Z rotation of cropped stack in degree
   * @param rgbStacks Optional assignment of multi-stack crop to RGB channels
   *
   * @return Promise which will resolve and reject with a response objcet
   */
  CATMAID.crop = function(projectId, stackIds, minX, minY, minZ, maxX, maxY,
      maxZ, zoomLevel, rotationZ, rgbStacks) {
    return CATMAID.fetch(projectId + '/crop', 'POST', {
      stack_ids: stackIds,
      min_x: minX,
      min_y: minY,
      min_z: minZ,
      max_x: maxX,
      max_y: maxY,
      max_z: maxZ,
      zoom_level: zoomLevel,
      single_channel: !rgbStacks,
      rotationcw: rotationZ ? rotationZ : 0
    });
  };

})(CATMAID);
