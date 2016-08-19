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
  var BufferObjectFactory = function(buffer, templateGeometry) {
    this.buffer = buffer;
    var length = templateGeometry.vertices.length;
    var nCreatedObjects = 0;

    this.BufferObject = function(id, position, scale, material) {
      this.start = this.length * nCreatedObjects;
      this.id = id;
      this.position = position;
      this.material = material;
      this._isVisible = true;
      this._scale = scale;
      this._color = material.color;
      this._alpha = material.opacity;
      ++nCreatedObjects;
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
   */
  BufferObjectFactory.prototype.create = function(id, position, scale, material) {
    return new this.BufferObject(id, position, scale, material);
  };

  // Needed as a noop-filter below
  var returnTrue = function() { return true; };

  /**
   * Create buffer objects for all passed in object/material combinations. This
   * is more performant for larger numbers of nodes.
   */
  BufferObjectFactory.prototype.createAll = function(objects, scaling, filter, handler) {
    filter = filter || returnTrue;
    handler = handler || CATMAID.noop;

    var templateGeometry = this.buffer.templateGeometry;
    if (!templateGeometry) {
      throw new CATMAID.Error('Can only create buffer objects if buffer has template assigned');
    }

    var faces = templateGeometry.faces;
    var nFacesPerObject = faces.length;
    var vertices = templateGeometry.vertices;
    var nVerticesPerObject = templateGeometry.vertices.length;

    var matrix = new THREE.Matrix4();
    var vertex = new THREE.Vector3();
    var normal = new THREE.Vector3();

    var indexAttr = this.buffer.index;
    var positionsAttr = this.buffer.attributes.position;
    var normalsAttr = this.buffer.attributes.normal;
    var colorsAttr = this.buffer.attributes.colorNew;
    var visibleAttr = this.buffer.attributes.visibleNew;
    var alphasAttr = this.buffer.attributes.alphaNew;

    var indices = indexAttr.array;
    var positions = positionsAttr.array;
    var normals = normalsAttr.array;
    var colors = colorsAttr.array;
    var visible = visibleAttr.array;
    var alphas = alphasAttr.array;

    for (var i=0, max=objects.length; i<max; ++i) {
      var object = objects[i];
      var v = object[0];
      var m = object[1];
      if (!filter(v, m)) {
        continue;
      }

      var color = m.color;
      var alpha = m.opacity;

      // Reset matrix to scale points and set position
      matrix.makeScale(scaling, scaling, scaling);
      matrix.setPosition(v);

      var objectStart = i * nVerticesPerObject;
      var vertexStart = objectStart * 3;
      for (var j=0; j<nVerticesPerObject; ++j) {
        vertex.copy(vertices[j]);
        vertex.applyMatrix4(matrix);

        var vIndex =  vertexStart + j * 3;
        positions[vIndex + 0] = vertex.x;
        positions[vIndex + 1] = vertex.y;
        positions[vIndex + 2] = vertex.z;

        colors[vIndex + 0] = color.r;
        colors[vIndex + 1] = color.g;
        colors[vIndex + 2] = color.b;

        visible[objectStart + j] = 1.0;
        alphas[objectStart + j] = alpha;
      }

      var faceStart = i * nFacesPerObject * 3;
      for (var j=0; j<nFacesPerObject; ++j) {
        var face = faces[j];
        var offset = faceStart + j * 3;
        var a, b, c;
        indices[offset + 0] = a = objectStart + face.a;
        indices[offset + 1] = b = objectStart + face.b;
        indices[offset + 2] = c = objectStart + face.c;

        var vertexNormals = face.vertexNormals;
        a *= 3;
        normals[a + 0] = vertexNormals[0].x;
        normals[a + 1] = vertexNormals[0].y;
        normals[a + 2] = vertexNormals[0].z;
        b *= 3;
        normals[b + 0] = vertexNormals[1].x;
        normals[b + 1] = vertexNormals[1].y;
        normals[b + 2] = vertexNormals[1].z;
        c *= 3;
        normals[c + 0] = vertexNormals[2].x;
        normals[c + 1] = vertexNormals[2].y;
        normals[c + 2] = vertexNormals[2].z;
      }

      var bufferObject = this.create(v.node_id, v, scaling, m);
      handler(v, m, bufferObject);
    }

    indices.needsUpdate = true;
    positionsAttr.needsUpdate = true;
    normalsAttr.needsUpdate = true;
    colorsAttr.needsUpdate = true;
    visibleAttr.needsUpdate = true;
    alphasAttr.needsUpdate = true;

    this.buffer.computeBoundingSphere();
  };


  /**
   * A wrapper around THREE's BufferGeometry that initilizes common attributes
   * based on the passed in parameters.
   */
  var MultiObjectBufferGeometry = function(options) {
    if (!options) throw new CATMAID.ValueError('Initialization options needed');

    var nObjects = options.nObjects;
    if (!nObjects) throw new CATMAID.ValueError('Need number of objects');
    this.nObjects = nObjects;

    THREE.BufferGeometry.call(this);

    this.templateGeometry = options.templateGeometry;
    if (this.templateGeometry) {
      var nPointsPerObject = this.templateGeometry.vertices.length;
      var facesOfObject = this.templateGeometry.faces;
      var nFacesPerObject = facesOfObject.length;

      var indexCount     = nObjects * nFacesPerObject * 3;
      var IndexType      = indexCount > 65535 ? Uint32Array : Uint16Array;
      var indices        = new IndexType(indexCount);

      var positions = new Float32Array(nObjects * nPointsPerObject * 3);
      var normals   = new Float32Array(nObjects * nPointsPerObject * 3);
      var colors    = new Float32Array(nObjects * nPointsPerObject * 3);
      var visible   = new Float32Array(nObjects * nPointsPerObject);
      var alphas    = new Float32Array(nObjects * nPointsPerObject);


      // Create buffer geometry, add 'New' suffix to custom attributes to not
      // conflict with THREE.js internal arguments.
      this.setIndex(new THREE.BufferAttribute(indices, 1));
      this.addAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
      this.addAttribute('colorNew', new THREE.BufferAttribute(colors, 3));
      this.addAttribute('visibleNew', new THREE.BufferAttribute(visible, 1));
      this.addAttribute('alphaNew', new THREE.BufferAttribute(alphas, 1));

      // Mark position, visible and alpha attributes as dynamic so that they can
      // be changed during runtime.
      this.index.setDynamic(true);
      this.attributes.position.setDynamic(true);
      this.attributes.normal.setDynamic(true);
      this.attributes.visibleNew.setDynamic(true);
      this.attributes.alphaNew.setDynamic(true);
      this.attributes.colorNew.setDynamic(true);

      this.nVerticesPerObject = nPointsPerObject;
    } else {
      this.nVerticesPerObject = 0;
    }
  };

  MultiObjectBufferGeometry.prototype = Object.create(THREE.BufferGeometry.prototype);
  MultiObjectBufferGeometry.prototype.constructor = MultiObjectBufferGeometry;

  MultiObjectBufferGeometry.prototype.createObjectFactory = function() {
    return new CATMAID.BufferObjectFactory(this, this.templateGeometry);
  };

  /**
   * This creates a shader material that is based on THREE's built-in
   * MeshLambertMaterial. It injects shader code to control color, alpha and
   * visibility with varying shader parameters. Since for a buffer geometry the
   * material is tightly coupled to the geometry, this is defined as a member
   * function.
   *
   * @param {THREE.MeshLambertMaterial} meshLambertMaterial
   *        An optional material to use for color and line property initialization.
   */
  MultiObjectBufferGeometry.prototype.createLambertMaterial = function(meshLambertMaterial) {
    var material = new CATMAID.ShaderLambertMaterial(meshLambertMaterial);

    // Needed for buffer geometry shader modifications
    material.transparent = true;
    material.depthTest = true;
    material.depthWrite = false;

    // Install snippets
    material.insertSnippet('vertexDeclarations',
        ['attribute float alphaNew;',
         'attribute float visibleNew;',
         'attribute vec3 colorNew;',
         'varying float vAlphaNew;',
         'varying float vVisibleNew;',
         'varying vec3 vColorNew;', ''].join('\n'));
    material.insertSnippet('vertexPosition',
        ['vColorNew = colorNew;',
         'vVisibleNew = visibleNew;',
         'vAlphaNew = alphaNew;',''].join('\n'));

    material.insertSnippet('fragmentDeclarations',
      ['varying float vAlphaNew;',
       'varying float vVisibleNew;',
       'varying vec3 vColorNew;', ''].join('\n'));
    material.insertSnippet('fragmentColor',
      ['if (vVisibleNew == 0.0) {',
       '  discard;',
       '}',
       'vec4 diffuseColor = vec4(vColorNew, vAlphaNew);', ''].join('\n'));

    return material;
  };


  // Export
  CATMAID.BufferObjectFactory = BufferObjectFactory;
  CATMAID.MultiObjectBufferGeometry = MultiObjectBufferGeometry;

})(CATMAID);
