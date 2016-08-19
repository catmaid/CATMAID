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
   * @param {THREE.MeshLambertMaterial} meshLambertMaterial
   *        A material to use for color and line property initialization.
   */
  var ShaderLambertMaterial = function (meshLambertMaterial) {
    THREE.ShaderMaterial.call(this);

    this.uniforms = jQuery.extend(true, {}, THREE.ShaderLib.lambert.uniforms);
    this.vertexShader = THREE.ShaderLib.lambert.vertexShader;
    this.fragmentShader = THREE.ShaderLib.lambert.fragmentShader;

    // Copy properties from LambertMaterial
    if (meshLambertMaterial) {
      this.color = meshLambertMaterial.color.clone();
      this.fog = meshLambertMaterial.fog;
      this.lights = meshLambertMaterial.lights;
      this.side = meshLambertMaterial.side;
    } else {
      this.color = new THREE.Color();
      this.fog = true;
      this.lights = true;
      this.side = THREE.FrontSide;
    }
  };

  ShaderLambertMaterial.prototype =
    Object.create(THREE.ShaderMaterial.prototype);
  ShaderLambertMaterial.prototype.constructor =
    ShaderLambertMaterial;

  ShaderLambertMaterial.INSERTION_LOCATIONS = {
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
  ShaderLambertMaterial.prototype.addUniforms = function (uniforms) {
    $.extend(this.uniforms, uniforms);
  };

  /**
   * Insert a GLSL snippet into a vertex or fragment shader at a known location.
   * @param  {string} insertionName Name of a insertion location defined in
   *                                INSERTION_LOCATIONS.
   * @param  {string} glsl          GLSL code to insert into the shader.
   * @param  {bool}   after         Optional, if true the glsl code iserted
   *                                after the match.
   */
  ShaderLambertMaterial.prototype.insertSnippet = function (insertionName, glsl, after) {
    var insertionPoint = ShaderLambertMaterial.INSERTION_LOCATIONS[insertionName];
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


  // Exports
  CATMAID.ShaderLineBasicMaterial = ShaderLineBasicMaterial;
  CATMAID.ShaderLambertMaterial = ShaderLambertMaterial;

})(CATMAID);
