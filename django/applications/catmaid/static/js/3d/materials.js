/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  THREE
*/

(function(CATMAID) {

  "use strict";

  /**
   * This is a wrapper that allows insertion of snippets of vertex and fragment
   * shaders at critical sections while otherwise behaving like the shaders for
   * THREE's built-in BasicLineMaterial.
   *
   * Note that this class may need to be updated whenever THREE.js is upgraded.
   *
   * @class
   * @param {THREE.LineBasicMaterial} lineBasicMaterial
   *        A material to use for color and line property initialization.
   */
  var ShaderLineBasicMaterial = function (lineBasicMaterial) {
    THREE.ShaderMaterial.call(this);

    this.uniforms = jQuery.extend(true, {}, THREE.ShaderLib.basic.uniforms);
    this.vertexShader = THREE.ShaderLib.basic.vertexShader;
    this.fragmentShader = THREE.ShaderLib.basic.fragmentShader;

    // Copy properties from LineBasicMaterial.
    this.color = lineBasicMaterial.color.clone();
    this.fog = lineBasicMaterial.fog;
    this.linewidth = lineBasicMaterial.linewidth;
    this.linecap = lineBasicMaterial.linecap;
    this.linejoin = lineBasicMaterial.linejoin;
    this.vertexColors = lineBasicMaterial.vertexColors;
  };

  ShaderLineBasicMaterial.prototype = Object.create(THREE.ShaderMaterial.prototype);
  ShaderLineBasicMaterial.prototype.constructor = ShaderLineBasicMaterial;

  ShaderLineBasicMaterial.INSERTION_LOCATIONS = {
    vertexDeclarations: {
      shader: 'vertex',
      regex: /void\s+main\(\s*\)\s+\{/,
      replacement: 'void main() {'},
    vertexPosition: {
      shader: 'vertex',
      regex: /#include\s+<project_vertex>/,
      replacement: '#include <project_vertex>;'},
    fragmentDeclarations: {
      shader: 'fragment',
      regex: /void\s+main\(\s*\)\s+\{/,
      replacement: 'void main() {'},
    fragmentColor: {
      shader: 'fragment',
      regex: /gl_FragColor\s*=\s*vec4\(\s*outgoingLight,\s*diffuseColor\.a\s*\);/,
      replacement: ''}
  };

  /**
   * Add uniforms to the vertex and fragment shaders.
   * @param {object} uniforms THREE.js uniform definitions.
   */
  ShaderLineBasicMaterial.prototype.addUniforms = function (uniforms) {
    $.extend(this.uniforms, uniforms);
  };

  /**
   * Insert a GLSL snippet into a vertex or fragment shader at a known location.
   * @param  {string} insertionName Name of a insertion location defined in
   *                                INSERTION_LOCATIONS.
   * @param  {string} glsl          GLSL code to insert into the shader.
   */
  ShaderLineBasicMaterial.prototype.insertSnippet = function (insertionName, glsl) {
    var insertionPoint = ShaderLineBasicMaterial.INSERTION_LOCATIONS[insertionName];
    var shaderSource = insertionPoint.shader === 'vertex' ? this.vertexShader : this.fragmentShader;
    shaderSource = shaderSource.replace(insertionPoint.regex, glsl + insertionPoint.replacement);
    if (insertionPoint.shader === 'vertex') {
      this.vertexShader = shaderSource;
    } else {
      this.fragmentShader = shaderSource;
    }
    this.needsUpdate = true;
  };

  /**
   * Refresh built-in THREE.js material uniform values from this material's
   * properties. Necessary because THREE.js performs this in WebGLRenderer's
   * setProgram only for its built-in materials.
   */
  ShaderLineBasicMaterial.prototype.refresh = function () {
    this.uniforms.diffuse.value = this.color;
    this.uniforms.opacity.value = this.opacity;
  };

  /**
   * This is a wrapper that allows insertion of snippets of vertex and fragment
   * shaders at critical sections while otherwise behaving like the shaders for
   * THREE's built-in MeshLambertMaterial.
   *
   * Note that this class may need to be updated whenever THREE.js is upgraded.
   *
   * @class
   * @param {THREE.Material} material
   *        A material to use for color and line property initialization.
   * @param {String}         sourceShaderName
   *        Optional, THREE.js ShaderLib identifier for a particular shader to
   *        base this one on (e.g. 'lambert'), defaults to 'basic').
   */
  var ShaderMeshBasicMaterial = function (material, sourceShaderName) {
    sourceShaderName = sourceShaderName || 'basic';
    var shaderTemplate = THREE.ShaderLib[sourceShaderName];
    if (!shaderTemplate) {
      throw new CATMAID.ValueError('Couldn\'t find a source shader with ' +
          'identifier "' + sourceShaderName + '"');
    }

    THREE.ShaderMaterial.call(this);

    this.uniforms = jQuery.extend(true, {}, shaderTemplate.uniforms);
    this.vertexShader = shaderTemplate.vertexShader;
    this.fragmentShader = shaderTemplate.fragmentShader;

    // Copy properties from LambertMaterial
    if (material) {
      this.color = material.color.clone();
      this.fog = material.fog;
      this.side = material.side;
    } else {
      this.color = new THREE.Color();
      this.fog = true;
      this.side = THREE.FrontSide;
    }
  };

  ShaderMeshBasicMaterial.prototype =
    Object.create(THREE.ShaderMaterial.prototype);
  ShaderMeshBasicMaterial.prototype.constructor =
    ShaderMeshBasicMaterial;

  ShaderMeshBasicMaterial.prototype.INSERTION_LOCATIONS = {
    vertexDeclarations: {
      shader: 'vertex',
      regex: /void\s+main\(\s*\)\s+\{/,
      replacement: 'void main() {'},
    vertexBegin: {
      shader: 'vertex',
      regex: /#include\s+<begin_vertex>/,
      replacement: '#include <begin_vertex>;'},
    vertexPosition: {
      shader: 'vertex',
      regex: /#include\s+<project_vertex>/,
      replacement: '#include <project_vertex>;'},
    fragmentDeclarations: {
      shader: 'fragment',
      regex: /void\s+main\(\s*\)\s+\{/,
      replacement: 'void main() {'},
    fragmentColor: {
      shader: 'fragment',
      regex: /vec4\s+diffuseColor\s*=\s*vec4\(\s*diffuse,\s*opacity\s*\);/,
      replacement: ''}
  };

  /**
   * Add uniforms to the vertex and fragment shaders.
   * @param {object} uniforms THREE.js uniform definitions.
   */
  ShaderMeshBasicMaterial.prototype.addUniforms = function (uniforms) {
    $.extend(this.uniforms, uniforms);
  };

  /**
   * Insert a GLSL snippet into a vertex or fragment shader at a known location.
   * @param  {string} insertionName Name of a insertion location defined in
   *                                INSERTION_LOCATIONS.
   * @param  {string} glsl          GLSL code to insert into the shader.
   * @param  {bool}   after         Optional, if true the GLSL code inserted
   *                                after the match.
   */
  ShaderMeshBasicMaterial.prototype.insertSnippet = function (insertionName, glsl, after) {
    var insertionPoint = this.INSERTION_LOCATIONS[insertionName];
    var shaderSource = insertionPoint.shader === 'vertex' ? this.vertexShader : this.fragmentShader;
    var replacement = after ? (insertionPoint.replacement + glsl) :
        (glsl + insertionPoint.replacement);
    shaderSource = shaderSource.replace(insertionPoint.regex, replacement);
    if (insertionPoint.shader === 'vertex') {
      this.vertexShader = shaderSource;
    } else {
      this.fragmentShader = shaderSource;
    }
    this.needsUpdate = true;
  };

  /**
   * This is a wrapper that allows insertion of snippets of vertex and fragment
   * shaders at critical sections while otherwise behaving like the shaders for
   * THREE's built-in MeshLambertMaterial.
   *
   * Note that this class may need to be updated whenever THREE.js is upgraded.
   *
   * @class
   * @param {THREE.MeshLambertMaterial} meshLambertMaterial
   *        A material to use for color and line property initialization.
   */
  var ShaderLambertMaterial = function (material) {
    ShaderMeshBasicMaterial.call(this, material, 'lambert');
    this.lights = material ? material.lights : true;
  };

  ShaderLambertMaterial.prototype =
    Object.create(ShaderMeshBasicMaterial.prototype);
  ShaderLambertMaterial.prototype.constructor =
    ShaderLambertMaterial;


  var SimplePickingMaterial = function(options) {

    THREE.ShaderMaterial.call(this);

    this.vertexShader = SimplePickingMaterial.posVertexShader;
    this.fragmentShader = SimplePickingMaterial.makePositionShader(options.direction);
    this.uniforms = {
      cameraNear: { value: options.cameraNear },
      cameraFar:  { value: options.cameraFar },
      // TODO: Has no effect on windows systems, due to ANGLE limitations, see:
      // https://threejs.org/docs/api/materials/ShaderMaterial.html
      linewidth: options.linewidth,
    };
  };

  SimplePickingMaterial.prototype = Object.create(THREE.ShaderMaterial.prototype);
  SimplePickingMaterial.prototype.constructor = SimplePickingMaterial;

  SimplePickingMaterial.makePositionShader = function(field) {
    if (!("x" === field || "y" === field || "z" === field)) {
      throw new CATMAID.Error("Unknown field: " + field);
    }

    return [
      "#include <common>",
      "#include <uv_pars_fragment>",
      "#include <map_pars_fragment>",
      "#include <alphamap_pars_fragment>",
      "#include <logdepthbuf_pars_fragment>",
      "#include <clipping_planes_pars_fragment>",
      "#include <clipping_planes_fragment>",
      "varying vec4 worldPosition;",
      CATMAID.ShaderLib.encodeFloat,

      "void main() {",
      "  #include <logdepthbuf_fragment>",
      "  #include <map_fragment>",
      "  #include <alphamap_fragment>",
      "  #include <alphatest_fragment>",

      "  gl_FragColor = encode_float(worldPosition." + field + ");",
      "}",
    ].join("\n");
  };

  SimplePickingMaterial.posVertexShader = [
    "#include <common>",
    "#include <uv_pars_vertex>",
    "#include <morphtarget_pars_vertex>",
    "#include <skinning_pars_vertex>",
    "#include <logdepthbuf_pars_vertex>",
    "#include <clipping_planes_pars_vertex>",
    "varying vec4 worldPosition;",

    "void main() {",
    "  worldPosition = modelMatrix * vec4(position, 1.0);",
    "  #include <uv_vertex>",
    "  #include <skinbase_vertex>",
    "  #include <begin_vertex>",
    "  #include <morphtarget_vertex>",
    "  #include <skinning_vertex>",
    "  #include <project_vertex>",
    "  #include <logdepthbuf_vertex>",
    "  #include <clipping_planes_vertex>",
    "}"
  ].join("\n");

  CATMAID.PickingLineMaterial = {
    INSERTION_LOCATIONS: {
      vertexDeclarations: {
        shader: 'vertex',
        regex: /void\s+main\(\s*\)\s+\{/,
        replacement: 'void main() {'},
      vertexBegin: {
        shader: 'vertex',
        regex: /#include\s+<begin_vertex>/,
        replacement: '#include <begin_vertex>;'},
      vertexEnd: {
        shader: 'vertex',
        regex: /\}(?=[^\}]*$)/,
        replacement: '}'},
      fragmentDeclarations: {
        shader: 'fragment',
        regex: /void\s+main\(\s*\)\s+\{/,
        replacement: 'void main() {'},
      fragmentColor: {
        shader: 'fragment',
        regex: /gl_FragColor\s*=\s*vec4\(\s*diffuseColor.rgb,\s*diffuseColor\.a\s*\);/,
        replacement: ''},
      fragmentEnd: {
        shader: 'fragment',
        regex: /\}(?=[^\}]*$)/,
        replacement: '}'}
    }
  };

  // Exports
  CATMAID.ShaderLineBasicMaterial = ShaderLineBasicMaterial;
  CATMAID.ShaderMeshBasicMaterial = ShaderMeshBasicMaterial;
  CATMAID.ShaderLambertMaterial = ShaderLambertMaterial;
  CATMAID.SimplePickingMaterial = SimplePickingMaterial;

})(CATMAID);
