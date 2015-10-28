/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Represent a skeleton and some properties of it.
   */
  var SkeletonModel = function( id, neuronname, color ) {
      this.id = parseInt(id);
      this.baseName = neuronname;
      this.selected = true;
      this.pre_visible = true;
      this.post_visible = true;
      this.text_visible = false;
      this.meta_visible = true;
      this.color = color;
      this.opacity = 1; // from 0 to 1
  };

  SkeletonModel.prototype = {};

  SkeletonModel.prototype.setVisible = function(v) {
      this.selected = v;
      this.pre_visible = v;
      this.post_visible = v;
      if (!v) this.text_visible = v;
      this.meta_visible = v;
  };

  SkeletonModel.prototype.clone = function() {
    var m = new CATMAID.SkeletonModel(this.id, this.baseName, this.color.clone());
    m.selected = this.selected;
    m.pre_visible = this.pre_visible;
    m.post_visible = this.post_visible;
    m.text_visible = this.text_visible;
    m.meta_visible = this.meta_visible;
    m.opacity = this.opacity;
    return m;
  };

  // Export skeleton model
  CATMAID.SkeletonModel = SkeletonModel;

})(CATMAID);
