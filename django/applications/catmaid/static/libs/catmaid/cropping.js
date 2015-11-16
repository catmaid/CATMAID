/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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

    var stacks = stackIds.join(',');
    var singleChannel = rgbStacks ? 0 : 1;

    var url = django_url + projectId + '/stack/' + stacks + '/crop/' +
        minX + "," + maxX + "/" + minY + "," + maxY + "/" +
        minZ + "," + maxZ + '/' + zoomLevel + '/' + singleChannel + '/';

    var data = {'rotationcw': rotationZ ? rotationZ : 0};

    return new Promise(function(resolve, reject) {
      requestQueue.register(url, 'GET', data,
          CATMAID.jsonResponseHandler(resolve, reject));
    });
  };

})(CATMAID);
