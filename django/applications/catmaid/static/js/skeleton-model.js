/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var defaultColor = "#ffff00";

  /**
   * Represent a skeleton and some properties of it.
   *
   * @param {number}      id    Unique identifier of skeleton
   * @param {string}      name  (Optional) Name of skeleton, default is empty
   * @param {THREE.Color} color (Optional) Color of skeleton, default is yellow
   * @param {API}         api   (Optional) api of where to find this skeleton
   */
  var SkeletonModel = function( id, name, color, api = undefined) {
      this.id = parseInt(id);
      this.baseName = name || "";
      this.selected = true;
      this.pre_visible = true;
      this.post_visible = true;
      this.text_visible = false;
      this.meta_visible = true;
      this.color = color || new THREE.Color(defaultColor);
      this.opacity = 1; // from 0 to 1
      this.api = api;
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
    m.api = this.api;
    return m;
  };

  /**
   * Copy fields from other model.
   *
   * @param other skeleton model to copy fields from
   *
   * @return this skeleton model
   */
  SkeletonModel.prototype.set = function(other) {
    this.id = other.id;
    this.baseName = other.baseName;
    this.color.copy(other.color);
    this.selected = other.selected;
    this.pre_visible = other.pre_visible;
    this.post_visible = other.post_visible;
    this.text_visible = other.text_visible;
    this.meta_visible = other.meta_visible;
    this.opacity = other.opacity;
    return this;
  };

  // Export skeleton model
  CATMAID.SkeletonModel = SkeletonModel;

})(CATMAID);
