/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

    "use strict";

    var TimeVisualization = function(project, stack) {
    };

    /**
     * Initialize the visualization in a given DOM container.
     */
    TimeVisualization.prototype.init = function(parent, width, height) {
      var viewerId = '3dviewer';

      var container = document.createElement('div');
      container.setAttribute('id', viewerId);
      // 3D viewer needs an already existing DOM element
      parent.appendChild(container);

      var viewer = new CATMAID.WebGLApplication();
      viewer.init(width, height, viewerId);

      return this;
    };

    // Export visualization
    CATMAID.TimeVisualization = TimeVisualization;

})(CATMAID);
