/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  THREE
*/

(function(CATMAID) {

  "use strict";

  /**
   * Wrap a group of vertices in a buffer geometry as an individual 3D object
   */
  var BufferObjectFactory = function(buffer, length) {
    this.buffer = buffer;
    this.length = length;
    var nObjects = 0;

    this.BufferObject = function(start, id, position, scale, material, r) {
      this.start = start;
      this.id = id;
      this.position = position;
      this.material = material;
      this.radius = r;
      this._isVisible = true;
      this._scale = scale;
      this._color = material.color;
      this._alpha = material.opacity;
      ++nObjects;
    };

    this.BufferObject.prototype.buffer = buffer;
    this.BufferObject.prototype.length = length;

    Object.defineProperty(this.BufferObject.prototype, 'scale', {
      get: function() {
        return this._scale;
      },
      set: function(value) {
        var scaleRatio = value / this._scale;
        this._scale = value;

        var cx = this.position.x;
        var cy = this.position.y;
        var cz = this.position.z;

        var attribute = this.buffer.attributes.position;
        var pos = attribute.array;
        var offset = this.start * 3;
        for (var i=0; i<this.length; ++i) {
          var start = offset + i * 3;
          pos[start    ] = (pos[start    ] - cx) * scaleRatio + cx;
          pos[start + 1] = (pos[start + 1] - cy) * scaleRatio + cy;
          pos[start + 2] = (pos[start + 2] - cz) * scaleRatio + cz;
        }
        attribute.needsUpdate = true;
      }
    });

    Object.defineProperty(this.BufferObject.prototype, 'visible', {
      get: function() {
        return this.buffer.visible;
      },
      set: function(value) {
        this._isVisible = value;
        // Update 'visible' aray of the buffer
        var visibility = this.buffer.getAttribute('visibleNew');
        for (var i=0; i<this.length; ++i) {
          visibility.array[this.start + i] = value ? 1.0 : 0;
        }
        visibility.needsUpdate = true;
      }
    });

    Object.defineProperty(this.BufferObject.prototype, 'color', {
      get: function() {
        return this._color;
      },
      set: function(value) {
        var attribute = this.buffer.attributes.colorNew;
        var col = attribute.array;
        var r = value.r;
        var g = value.g;
        var b = value.b;
        var offset = this.start * 3;
        for (var i=0, max=this.length; i<max; ++i) {
          var start = offset + i*3;
          col[start    ] = r;
          col[start + 1] = g;
          col[start + 2] = b;
        }
        this._color = value;
        attribute.needsUpdate = true;
      }
    });

    Object.defineProperty(this.BufferObject.prototype, 'alpha', {
      get: function() {
        return this._alpha;
      },
      set: function(value) {
        this._alpha = value;
        // Update 'alpha' aray of the buffer
        var attribute = this.buffer.attributes.alphaNew;
        var alpha = attribute.array;
        for (var i=0; i<this.length; ++i) {
          alpha[this.start + i] = value;
        }
        attribute.needsUpdate = true;
      }
    });
  };

  /**
   * Mark a new part of a buffer as a separate object.
   *
   * @param {integer} start The start index of in the buffer, expecting each
   *                        element only of size 1, i.e. to index positions this
   *                        number has to be multiplied by 3.
   */
  BufferObjectFactory.prototype.create = function(start, id,
      position, scale, material, r) {
    return new this.BufferObject(start, id, position, scale, material, r);
  };


  // Export
  CATMAID.BufferObjectFactory = BufferObjectFactory;

})(CATMAID);
