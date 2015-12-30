/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

    "use strict";

    var TimeVisualization = function() {
      this.smoothSkeletons = true;
      this.source = new CATMAID.BasicSkeletonSource("Time Visualization");
      this.startTime = 0;
      this.endTime = 0;
    };

    TimeVisualization.prototype.load = function(projectId) {
      var self = this;
      return new Promise(function(resolve, reject) {
        // Get a list of all skeletons created in the time frame of interest and
        // add them to the skeleton source.
        CATMAID.fetch(projectId + '/skeletons/', 'GET', {
          project_id: projectId
        }).then(function(json) {
          var models = json.reduce(function(o, skid) {
            var m = new CATMAID.SkeletonModel(skid);
            m.selected = false;
            o[skid] = m;
            return o;
          }, {});
          self.source.append(models);
          resolve();
        }).catch(reject);
      });
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

      // Activate smoothing
      viewer.options.smooth_skeletons = this.smoothSkeletons;

      viewer.append(this.source.getSkeletonModels());

      this.animation = viewer.createAnimation();
      viewer.startAnimation(this.animation);

      return this;
    };

    // Export visualization
    CATMAID.TimeVisualization = TimeVisualization;

})(CATMAID);
