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
   *
   * @param {integer} templateLength Number of vertices in template geometry.
   * @param {boolean} isInstanced    If objcets for an instance geometry will be
   *                                 created.
   */
  var BufferObjectFactory = function(buffer, templateGeometry, isInstance) {
    this.buffer = buffer;
    var nCreatedObjects = 0;
    var templateLength = templateGeometry.vertices.length;
    var objectLength = isInstance ? 1 : templateLength;

    if (!templateGeometry.boundingSphere) {
      templateGeometry.computeBoundingSphere();
    }

    this.BufferObject = function(id, position, scale, material) {
      this.start = this.objectLength * nCreatedObjects;
      this.id = id;
      this.position = position;
      this.material = material;
      this._isVisible = true;
      this._scale = scale;
      this._color = material.color;
      this._alpha = material.opacity;
      this.boundingSphere = this.templateGeometry.boundingSphere.clone();
      this.boundingSphere.radius *= scale;
      ++nCreatedObjects;
    };

    this.BufferObject.prototype.buffer = buffer;
    this.BufferObject.prototype.templateGeometry = templateGeometry;
    this.BufferObject.prototype.templateLength = templateLength;
    this.BufferObject.prototype.objectLength = objectLength;

    /**
     * Set color and opacity from passed in material.
     */
    this.BufferObject.prototype.setFromMaterial = function(material) {
      this.color = material.color;
      this.alpha = material.transparent ? material.opacity : 1.0;
    };

    Object.defineProperty(this.BufferObject.prototype, 'scale', {
      get: function() {
        return this._scale;
      },
      set: isInstance ? function(value) {
        throw new CATMAID.Error('Not implemented for instance geometry');
      } : function(value) {
        var scaleRatio = value / this._scale;
        this._scale = value;

        var cx = this.position.x;
        var cy = this.position.y;
        var cz = this.position.z;

        var attribute = this.buffer.attributes.position;
        var pos = attribute.array;
        var offset = this.start * 3;

        // Scale vertices that match template
        for (var i=0; i<this.templateLength; ++i) {
          var start = offset + i * 3;
          pos[start    ] = (pos[start    ] - cx) * scaleRatio + cx;
          pos[start + 1] = (pos[start + 1] - cy) * scaleRatio + cy;
          pos[start + 2] = (pos[start + 2] - cz) * scaleRatio + cz;
        }
        attribute.needsUpdate = true;

        // Update bounding sphere
        this.boundingSphere.radius *= scaleRatio;
      }
    });

    Object.defineProperty(this.BufferObject.prototype, 'visible', {
      get: function() {
        return this._isVisible;
      },
      set: function(value) {
        this._isVisible = value;
        // Update 'visible' array of the buffer
        var visibility = this.buffer.getAttribute('visibleNew');
        for (var i=0; i<this.objectLength; ++i) {
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
        for (var i=0, max=this.objectLength; i<max; ++i) {
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
        // Update 'alpha' array of the buffer
        var attribute = this.buffer.attributes.alphaNew;
        var alpha = attribute.array;
        for (var i=0; i<this.objectLength; ++i) {
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
    return new CATMAID.BufferObjectFactory(this, this.templateGeometry, false);
  };

  /**
   * This creates a shader material that is based on either THREE's built-in
   * MeshLambertMaterial (type: 'lambert') or MeshBasicMaterial (type: 'basic').
   * It injects shader code to control color, alpha and visibility with varying
   * shader parameters. Since for a buffer geometry the material is tightly
   * coupled to the geometry, this is defined as a member function.
   *
   * @param {String}         type     Optional, either 'basic' (default) or
   *                                  'lambert'. Defines shading type used with
   *                                   this geometry.
   * @param {THREE.Material} material An optional material to use for color and
   *                                  line property initialization.
   */
  MultiObjectBufferGeometry.prototype.createMaterial = function(type, templateMaterial) {
    type = type || 'lambert';
    var material;
    if ('lambert' === type) {
      material = new CATMAID.ShaderLambertMaterial(templateMaterial);
    } else if ('basic' === type) {
      material = new CATMAID.ShaderMeshBasicMaterial(templateMaterial);
    }

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

  /**
   * Create buffer objects for all passed in object/material combinations. This
   * is more performant for larger numbers of nodes.
   */
  MultiObjectBufferGeometry.prototype.createAll = function(objects, scaling, visibility, filter, handler) {
    visibility = visibility === undefined ? 1.0 : (visibility ? 1.0 : 0);
    filter = filter || returnTrue;
    handler = handler || CATMAID.noop;

    var templateGeometry = this.templateGeometry;
    if (!templateGeometry) {
      throw new CATMAID.Error('Can only create buffer objects if buffer has template assigned');
    }

    var factory = this.createObjectFactory();

    var faces = templateGeometry.faces;
    var nFacesPerObject = faces.length;
    var vertices = templateGeometry.vertices;
    var nVerticesPerObject = templateGeometry.vertices.length;

    var matrix = new THREE.Matrix4();
    var vertex = new THREE.Vector3();
    var normal = new THREE.Vector3();

    var indexAttr = this.index;
    var positionsAttr = this.attributes.position;
    var normalsAttr = this.attributes.normal;
    var colorsAttr = this.attributes.colorNew;
    var visibleAttr = this.attributes.visibleNew;
    var alphasAttr = this.attributes.alphaNew;

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
      if (!filter(v, m, object)) {
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

        visible[objectStart + j] = visibility;
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

      var bufferObject = factory.create(v.node_id, v, scaling, m);
      handler(v, m, object, bufferObject);
    }

    indices.needsUpdate = true;
    positionsAttr.needsUpdate = true;
    normalsAttr.needsUpdate = true;
    colorsAttr.needsUpdate = true;
    visibleAttr.needsUpdate = true;
    alphasAttr.needsUpdate = true;

    this.computeBoundingSphere();
  };


  /**
   * A wrapper around THREE's InstancedBufferGeometry that initializes common
   * attributes based on the passed in parameters.
   */
  var MultiObjectInstancedBufferGeometry = function(options) {
    if (!options) throw new CATMAID.ValueError('Initialization options needed');

    var scaling = options.scaling || 1.0;

    var nObjects = options.nObjects;
    if (!nObjects) throw new CATMAID.ValueError('Need number of objects');

    this.templateGeometry = options.templateGeometry;
    if (!this.templateGeometry) throw new CATMAID.ValueError('Need template geometry');

    THREE.InstancedBufferGeometry.call(this);

    this.maxInstancedCount = nObjects;

    // Per mesh data
    var templateVertices = this.templateGeometry.vertices;
    var nVerticesPerObject = templateVertices.length;
    var templateFaces = this.templateGeometry.faces;
    var nFacesPerObject = templateFaces.length;

    var vertices = new Float32Array(nVerticesPerObject * 3);
    var normals  = new Float32Array(nVerticesPerObject * 3);

    var indexCount     = nFacesPerObject * 3;
    var IndexType      = indexCount > 65535 ? Uint32Array : Uint16Array;
    var indices        = new IndexType(indexCount);

    for (var i=0; i<nVerticesPerObject; ++i) {
      var v = templateVertices[i];
      var offset = i * 3;
      vertices[offset + 0] = v.x;
      vertices[offset + 1] = v.y;
      vertices[offset + 2] = v.z;
    }

    for (var i=0; i<nFacesPerObject; ++i) {
      var face = templateFaces[i];
      var offset = i * 3;
      var a, b, c;
      indices[offset + 0] = a = face.a;
      indices[offset + 1] = b = face.b;
      indices[offset + 2] = c = face.c;

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

    this.scale = scaling;
    var scaleMatrix = new THREE.Matrix4();
    scaleMatrix.makeScale(scaling, scaling, scaling);
    applyMatrix4ToVector3Array(scaleMatrix, vertices);

    this.setIndex(new THREE.BufferAttribute(indices, 1));
    this.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.addAttribute('position', new THREE.BufferAttribute(vertices, 3));

    this.computeBoundingBox();
    this.computeBoundingSphere();

    // Per instance data
    var offsets   = new Float32Array(nObjects * 3);
    var colors    = new Float32Array(nObjects * 3);
    var visible   = new Float32Array(nObjects);
    var alphas    = new Float32Array(nObjects);

    // Create buffer geometry, add 'New' suffix to custom attributes to not
    // conflict with THREE.js internal arguments.
    this.addAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    this.addAttribute('colorNew', new THREE.InstancedBufferAttribute(colors, 3));
    this.addAttribute('visibleNew', new THREE.InstancedBufferAttribute(visible, 1));
    this.addAttribute('alphaNew', new THREE.InstancedBufferAttribute(alphas, 1));

    // Mark position, visible and alpha attributes as dynamic so that they can
    // be changed during runtime.
    this.attributes.offset.setDynamic(true);
    this.attributes.colorNew.setDynamic(true);
    this.attributes.visibleNew.setDynamic(true);
    this.attributes.alphaNew.setDynamic(true);

    this.nVerticesPerObject = nVerticesPerObject;
  };

  MultiObjectInstancedBufferGeometry.prototype = Object.create(THREE.InstancedBufferGeometry.prototype);
  MultiObjectInstancedBufferGeometry.prototype.constructor = MultiObjectInstancedBufferGeometry;

  MultiObjectInstancedBufferGeometry.prototype.createObjectFactory = function() {
    return new CATMAID.BufferObjectFactory(this, this.templateGeometry, true);
  };

  /**
   * This creates a shader material that is based on either THREE's built-in
   * MeshLambertMaterial (type: 'lambert') or MeshBasicMaterial (type: 'basic').
   * It injects shader code to control color, alpha and visibility with varying
   * shader parameters. Since for a buffer geometry the material is tightly
   * coupled to the geometry, this is defined as a member function.
   *
   * @param {String}         type     Optional, either 'basic' (default) or
   *                                  'lambert'. Defines shading type used with
   *                                   this geometry.
   * @param {THREE.Material} material An optional material to use for color and
   *                                  line property initialization.
   */
  MultiObjectInstancedBufferGeometry.prototype.createMaterial = function(
      type, templateMaterial, extraOptions = {}) {
    type = type || 'lambert';
    var material;
    if ('lambert' === type) {
      material = new CATMAID.ShaderLambertMaterial(templateMaterial);
    } else if ('basic' === type) {
      material = new CATMAID.ShaderMeshBasicMaterial(templateMaterial);
    }

    // The defaults are needed for buffer geometry shader modifications
    material.transparent = extraOptions.transparent || true;
    material.depthTest = extraOptions.depthTest || true;
    material.depthWrite = extraOptions.depthWrite || false;
    material.side = extraOptions.side || THREE.FrontSide;

    // Install snippets
    // Warning: morphing doesn't work with current THREE.js version, because
    // the GLSL position attribute is used in places that aren't easy to replace
    // in morphing code.
    material.insertSnippet('vertexDeclarations',
        ['attribute vec3 offset;',
         'attribute float alphaNew;',
         'attribute float visibleNew;',
         'attribute vec3 colorNew;',
         'varying float vAlphaNew;',
         'varying float vVisibleNew;',
         'varying vec3 vColorNew;', ''].join('\n'));
    material.insertSnippet('vertexBegin',
        '\ntransformed = offset + transformed;\n', true);
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

  /**
   * Create buffer objects for all passed in object/material combinations. This
   * is more performant for larger numbers of nodes.
   */
  MultiObjectInstancedBufferGeometry.prototype.createAll = function(objects, scaling, visibility, filter, handler) {
    visibility = visibility === undefined ? 1.0 : (visibility ? 1.0 : 0);
    filter = filter || returnTrue;
    handler = handler || CATMAID.noop;

    var templateGeometry = this.templateGeometry;
    if (!templateGeometry) {
      throw new CATMAID.Error('Can only create buffer objects if buffer has template assigned');
    }

    var factory = this.createObjectFactory();

    var offsetAttr = this.attributes.offset;
    var colorsAttr = this.attributes.colorNew;
    var visibleAttr = this.attributes.visibleNew;
    var alphasAttr = this.attributes.alphaNew;

    var offsets = offsetAttr.array;
    var colors = colorsAttr.array;
    var visible = visibleAttr.array;
    var alphas = alphasAttr.array;

    var addedObjects = 0;
    for (var i=0, max=objects.length; i<max; ++i) {
      var object = objects[i];
      var v = object[0];
      var m = object[1];
      if (!filter(v, m, object)) {
        continue;
      }

      var color = m.color;
      var alpha = m.opacity;

      var oIndex =  addedObjects * 3;
      offsets[oIndex + 0] = v.x;
      offsets[oIndex + 1] = v.y;
      offsets[oIndex + 2] = v.z;

      colors[oIndex + 0] = color.r;
      colors[oIndex + 1] = color.g;
      colors[oIndex + 2] = color.b;

      visible[addedObjects] = visibility;
      alphas[addedObjects] = alpha;

      ++addedObjects;

      var bufferObject = factory.create(v.node_id, v, scaling, m);
      handler(v, m, object, bufferObject);
    }

    offsetAttr.needsUpdate = true;
    colorsAttr.needsUpdate = true;
    visibleAttr.needsUpdate = true;
    alphasAttr.needsUpdate = true;

    // Calculate bounding box and bounding sphere based on offsets. A direct
    // call of computeBoundingBox() or computeBoundingSphere() won't be enough,
    // because the actual vertex positions are only calculated on the GPU.
    this.boundingBox.setFromArray(offsets);
    this.boundingSphere.copy(this.boundingBox.getBoundingSphere(new THREE.Sphere()));
  };

  /**
   * Scale template geometry buffer with respect to the original scale.
   */
  MultiObjectInstancedBufferGeometry.prototype.scaleTemplate = function(scale) {
    var scaleRatio = scale / this.scale;
    this.scale = scale;
    var attribute = this.attributes.position;
    var vertices = attribute.array;

    var scaleMatrix = new THREE.Matrix4();
    scaleMatrix.makeScale(scaleRatio, scaleRatio, scaleRatio);
    applyMatrix4ToVector3Array(scaleMatrix, vertices);

    attribute.needsUpdate = true;

    // Update bounding sphere
    this.boundingSphere.radius *= scaleRatio;
  };

  var applyMatrix4ToVector3Array = function() {
    var v1;
    return function (matrix4, array, offset, length ) {
      if ( v1 === undefined ) v1 = new THREE.Vector3();
      if ( offset === undefined ) offset = 0;
      if ( length === undefined ) length = array.length;

      for ( var i = 0, j = offset; i < length; i += 3, j += 3 ) {
        v1.fromArray( array, j );
        v1.applyMatrix4( matrix4 );
        v1.toArray( array, j );
      }
      return array;
    };
  }();


  // Export
  CATMAID.BufferObjectFactory = BufferObjectFactory;
  CATMAID.MultiObjectBufferGeometry = MultiObjectBufferGeometry;
  CATMAID.MultiObjectInstancedBufferGeometry = MultiObjectInstancedBufferGeometry;

})(CATMAID);
