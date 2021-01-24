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
  var SkeletonModel = function( id, name, color, api = undefined, projectId = undefined) {
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
      this.projectId = projectId;
  };

  SkeletonModel.prototype = {};

  /**
   * A skeleton is a remote skeleton if it has an API associated with it.
   */
  Object.defineProperty(SkeletonModel.prototype, 'isRemote', {
    get() { return !!this.api; },
    enumerable: true,
  });

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
    m.projectId = this.projectId;
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

  SkeletonModel.prototype.serialize = function() {
    let m = this;
    return `{ "id": ${m.id}, "color": "${m.color.getStyle()}", "selected": ${m.selected}, "pre": ${m.pre_visible}, "post": ${m.post_visible}, "text": ${m.text_visible}, 'meta': ${m.meta_visible}, 'opacity': ${m.opacity}}`;
  };

  SkeletonModel.deserialize = function(obj) {
    let objType = typeof(obj);
    if (objType === 'string') {
      return SkeletonModel.deserialize(JSON.parse(obj));
    } else if (objType === 'object') {
      let m = new CATMAID.SkeletonModel(obj.id, "",
          obj.color ? new THREE.Color(obj.color) : undefined);
      if (obj.pre !== undefined) m.pre_visible = !!obj.pre;
      if (obj.post !== undefined) m.post_visible = !!obj.post;
      if (obj.text !== undefined) m.text_visible = !!obj.text;
      if (obj.meta !== undefined) m.meta_visible = !!obj.meta;
      if (obj.selected !== undefined) m.selected = !!obj.selected;
      if (obj.opacity !== undefined) m.opacity = obj.opacity;
      return m;
    } else {
      throw new CATMAID.ValueError(`Don't know how to deserialize object of type ${objType}: ${obj}`);
    }
  };

  // Export skeleton model
  CATMAID.SkeletonModel = SkeletonModel;

})(CATMAID);
