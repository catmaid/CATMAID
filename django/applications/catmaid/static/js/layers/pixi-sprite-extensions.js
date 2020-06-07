(function(CATMAID) {

'use strict';

CATMAID.Pixi = CATMAID.Pixi || {};

// See the comment on TypedSpriteRenderer.flush.
let oldFlush = PIXI.SpriteRenderer.prototype.flush;
PIXI.SpriteRenderer.prototype.flush = function () {
  const gl = this.renderer.gl;
  let btex = this.renderer.boundTextures;
  for (let i = 0; i < btex.length; ++i) {
    let glTex = btex[i]._glTextures[this.renderer.CONTEXT_UID];
    if (glTex && (glTex.format != gl.RGBA || glTex.type != gl.UNSIGNED_BYTE)) {
      this.renderer.unbindTexture(btex[i]);
    }
  }
  return oldFlush.call(this);
};

CATMAID.Pixi.TypedSpriteRenderer = class TypedSpriteRenderer extends PIXI.SpriteRenderer {
  constructor(dataType, renderer) {
    super(renderer);

    this.dataType = dataType;
    // Array of empty textures for texture units. This is necessary because
    // SpriteRenderer may otherwise bind renderer's emptyTextures, which may
    // be of imcompatible format to these.
    this.emptyTextures = [];
  }

  createEmptyTextures() {
    const gl = this.renderer.gl;
    const params = CATMAID.PixiImageBlockLayer.dataTypeWebGLParams(gl, this.dataType);
    const glTex = new PIXI.glCore.GLTexture(gl, 1, 1, params.internalFormat, params.type);
    glTex.bind();
    gl.texImage2D(gl.TEXTURE_2D, 0, glTex.format, 1, 1, 0, params.format, glTex.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    this.emptyTextures = this.renderer.emptyTextures.map(_i => {
      const baseTex = new PIXI.BaseTexture();
      baseTex._glTextures[this.renderer.CONTEXT_UID] = glTex;
      return baseTex;
    });
  }

  flush() {
    // Because all SpriteRenderers and their shaders use the same bound texture
    // units, it is necessary to unbind any textures of different formats or
    // the entire object will fail to render due to bound textures being
    // incompatible with shaders' sampler types.
    let btex = this.renderer.boundTextures;
    const params = CATMAID.PixiImageBlockLayer.dataTypeWebGLParams(this.renderer.gl, this.dataType);
    for (let i = 0; i < btex.length; ++i) {
      let glTex = btex[i]._glTextures[this.renderer.CONTEXT_UID];
      if (glTex && (glTex.format != params.format || glTex.type != params.type)) {
        this.renderer.bindTexture(this.emptyTextures[i], i, true);
      }
    }
    return oldFlush.call(this);
  }

  // This is mostly a direct copy of PIXI.SpriteRenderer
  onContextChange()
  {
      const gl = this.renderer.gl;

      // CHANGED LINES ////////////////////////////////////////////////////////
      // Bail out on older WebGL versions.
      if (gl instanceof WebGLRenderingContext) {
        return;
      }
      this.createEmptyTextures();
      /////////////////////////////////////////////////////////////////////////

      if (this.renderer.legacy)
      {
          this.MAX_TEXTURES = 1;
      }
      else
      {
          // step 1: first check max textures the GPU can handle.
          this.MAX_TEXTURES = Math.min(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), PIXI.settings.SPRITE_MAX_TEXTURES);

          // step 2: check the maximum number of if statements the shader can have too..
          this.MAX_TEXTURES = checkMaxIfStatmentsInShader(this.MAX_TEXTURES, gl);
      }

      // CHANGED LINE /////////////////////////////////////////////////////////
      this.shader = generateMultiTextureShader(gl, this.MAX_TEXTURES, this.dataType);
      /////////////////////////////////////////////////////////////////////////

      // create a couple of buffers
      this.indexBuffer = PIXI.glCore.GLBuffer.createIndexBuffer(gl, this.indices, gl.STATIC_DRAW);

      // we use the second shader as the first one depending on your browser may omit aTextureId
      // as it is not used by the shader so is optimized out.

      this.renderer.bindVao(null);

      const attrs = this.shader.attributes;

      for (let i = 0; i < this.vaoMax; i++)
      {
          /* eslint-disable max-len */
          const vertexBuffer = this.vertexBuffers[i] = PIXI.glCore.GLBuffer.createVertexBuffer(gl, null, gl.STREAM_DRAW);
          /* eslint-enable max-len */

          // build the vao object that will render..
          const vao = this.renderer.createVao()
              .addIndex(this.indexBuffer)
              .addAttribute(vertexBuffer, attrs.aVertexPosition, gl.FLOAT, false, this.vertByteSize, 0)
              .addAttribute(vertexBuffer, attrs.aTextureCoord, gl.UNSIGNED_SHORT, true, this.vertByteSize, 2 * 4)
              .addAttribute(vertexBuffer, attrs.aColor, gl.UNSIGNED_BYTE, true, this.vertByteSize, 3 * 4);

          if (attrs.aTextureId)
          {
              vao.addAttribute(vertexBuffer, attrs.aTextureId, gl.FLOAT, false, this.vertByteSize, 4 * 4);
          }

          this.vaos[i] = vao;
      }

      this.vao = this.vaos[0];
      this.currentBlendMode = 99999;

      this.boundTextures = new Array(this.MAX_TEXTURES);
  }
};


/**
 * Version of `PIXI.Shader` that does not insert `precision` statements that
 * break the requirement of `#version` being first in WebGL2/GLSL 3.0 shaders.
 */
class NonMutatingShader extends PIXI.glCore.GLShader
{
    constructor(gl, vertexSrc, fragmentSrc, attributeLocations, precision)
    {
      super(gl, vertexSrc, fragmentSrc, undefined, attributeLocations);
    }
}

// From `pixi.js/src/core/sprites/webgl/`
// Modified to change shaders to GLSL 3 and vary types according to input data
// type.

const vertTemplate = `#version 300 es
precision highp float;
precision highp int;
in vec2 aVertexPosition;
in vec2 aTextureCoord;
in vec4 aColor;
in float aTextureId;

uniform mat3 projectionMatrix;

out vec2 vTextureCoord;
out vec4 vColor;
out float vTextureId;

void main(void){
    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);

    vTextureCoord = aTextureCoord;
    vTextureId = aTextureId;
    vColor = aColor;
}`;

const fragTemplate = `#version 300 es
precision highp float;
precision highp int;
precision highp %sampler_type%;

in vec2 vTextureCoord;
in vec4 vColor;
in float vTextureId;
uniform %sampler_type% uSamplers[%count%];
%steps_uniforms%
out vec4 myOutputColor;

void main(void){
%color_type% color;
%forloop%
%color_type% step0 = color;
%steps%
myOutputColor = %steps_output%;
}`;

function generateMultiTextureShader(gl, maxTextures, dataType) {
  let steps = [new CATMAID.Pixi.SimpleMinMaxShaderStep()];
  return generateMultiTextureShaderFromSteps(gl, maxTextures, dataType, vertTemplate, fragTemplate, steps);
}

function generateMultiTextureShaderFromSteps(gl, maxTextures, dataType, vertexSrc, fragmentSrc, fragSteps)
{
  fragmentSrc = fragmentSrc.replace(/%count%/gi, maxTextures);
  fragmentSrc = fragmentSrc.replace(/%forloop%/gi, generateSampleSrc(maxTextures));

  const baseDataType = new CATMAID.Pixi.SimpleShaderStep.BaseType(dataType);
  fragmentSrc = fragmentSrc.replace(/%sampler_type%/gi, baseDataType.glslSamplerType());
  fragmentSrc = fragmentSrc.replace(/%color_type%/gi, baseDataType.glslColorType());

  const stepUniforms = fragSteps.map(step => step.glslHeaders(baseDataType)).join('\n');
  fragmentSrc = fragmentSrc.replace(/%steps_uniforms%/gi, stepUniforms);

  const steps = fragSteps.map((step, i) => step.glsl(baseDataType, i)).join('\n');
  fragmentSrc = fragmentSrc.replace(/%steps%/gi, steps);
  fragmentSrc = fragmentSrc.replace(/%steps_output%/gi, 'step' + fragSteps.length);

  const shader = new NonMutatingShader(gl, vertexSrc, fragmentSrc);

  const sampleValues = [];

  for (let i = 0; i < maxTextures; i++)
  {
      sampleValues[i] = i;
  }

  shader.bind();
  shader.uniforms.uSamplers = sampleValues;
  fragSteps.forEach(step => step.setAttrs(shader.uniforms, baseDataType));

  return shader;
}

function generateSampleSrc(maxTextures)
{
  let src = '';

  src += '\n';
  src += '\n';

  for (let i = 0; i < maxTextures; i++)
  {
      if (i > 0)
      {
          src += '\nelse ';
      }

      if (i < maxTextures - 1)
      {
          src += `if(vTextureId < ${i}.5)`;
      }

      src += '\n{';
      src += `\n\tcolor = texture(uSamplers[${i}], vTextureCoord);`;
      src += '\n}';
  }

  src += '\n';
  src += '\n';

  return src;
}


// From pixi.js/src/core/renderers/webgl/utils/checkMaxIfStatmentsInShader.js

const maxFragTemplate = [
  'precision mediump float;',
  'void main(void){',
  'float test = 0.1;',
  '%forloop%',
  'gl_FragColor = vec4(0.0);',
  '}',
].join('\n');

function checkMaxIfStatmentsInShader(maxIfs, gl)
{
  const createTempContext = !gl;

  if (createTempContext)
  {
      const tinyCanvas = document.createElement('canvas');

      tinyCanvas.width = 1;
      tinyCanvas.height = 1;

      gl = PIXI.glCore.createContext(tinyCanvas);
  }

  const shader = gl.createShader(gl.FRAGMENT_SHADER);

  while (true) // eslint-disable-line no-constant-condition
  {
      const fragmentSrc = maxFragTemplate.replace(/%forloop%/gi, generateIfTestSrc(maxIfs));

      gl.shaderSource(shader, fragmentSrc);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      {
          maxIfs = (maxIfs / 2) | 0;
      }
      else
      {
          // valid!
          break;
      }
  }

  if (createTempContext)
  {
      // get rid of context
      if (gl.getExtension('WEBGL_lose_context'))
      {
          gl.getExtension('WEBGL_lose_context').loseContext();
      }
  }

  return maxIfs;
}

function generateIfTestSrc(maxIfs)
{
  let src = '';

  for (let i = 0; i < maxIfs; ++i)
  {
      if (i > 0)
      {
          src += '\nelse ';
      }

      if (i < maxIfs - 1)
      {
          src += `if(test == ${i}.0){}`;
      }
  }

  return src;
}



CATMAID.Pixi.TypedSprite = class TypedSprite extends PIXI.Sprite {
  constructor(dataType, ...args) {
    super(...args);

    this.pluginName = 'typedSprite_' + dataType;
  }
};

let supportedDataTypes = [
  'int8', 'int16', 'int32', 'int64',
  'uint16', 'uint32', 'uint64',
];
for (let dataType of supportedDataTypes) {
  let renderer = CATMAID.Pixi.TypedSpriteRenderer.bind({}, dataType);

  PIXI.WebGLRenderer.registerPlugin('typedSprite_' + dataType, renderer);
}


let OWNED_RENDER_NEXT_ID_SUFFIX = 0;
CATMAID.Pixi.OwnedRendererTypedSprite = class OwnedRendererTypedSprite extends CATMAID.Pixi.TypedSprite {
  constructor(datatype, idSuffix, ...args) {
    super(datatype, ...args);

    this.pluginName += '_' + idSuffix;
  }
};

CATMAID.Pixi.OwnedRendererTypedSprites = class OwnedRendererTypedSprites {
  constructor(dataType, pixiRenderer) {
    this.dataType = dataType;
    this.renderer = CATMAID.Pixi.TypedSpriteRenderer.bind({}, dataType);
    this.idSuffix = OWNED_RENDER_NEXT_ID_SUFFIX;
    OWNED_RENDER_NEXT_ID_SUFFIX += 1;
    PIXI.WebGLRenderer.registerPlugin(this.pluginName(), this.renderer);
    // If the Pixi renderer has already initialized plugins, we must manually
    // do so.
    if (pixiRenderer.plugins) {
      let plugin = new this.renderer(pixiRenderer);
      pixiRenderer.plugins[this.pluginName()] = plugin;
      plugin.onContextChange();
    }
    this.spriteConstructor = CATMAID.Pixi.OwnedRendererTypedSprite.bind({}, dataType, this.idSuffix);
  }

  pluginName() {
    return 'typedSprite_' + this.dataType + '_' + this.idSuffix;
  }

  destroy(pixiRenderer) {
    const name = this.pluginName();
    pixiRenderer.plugins[name].destroy();
    delete pixiRenderer.plugins[name];
    delete PIXI.WebGLRenderer.__plugins[name];
  }
};

CATMAID.Pixi.SimpleShaderStep = class SimpleShaderStep {
  constructor(uniforms, inputType, srcTemplate, outputType) {
    this.uniforms = uniforms;
    this.inputType = inputType;
    this.srcTemplate = srcTemplate;
    this.outputType = outputType;
  }

  setAttrs(attrs, baseDataType) {
    this.uniforms.forEach(u => u.setAttr(attrs, baseDataType));
  }

  glslHeaders(baseDataType) {
    return this.uniforms.map(u => u.glsl(baseDataType)).join('\n');
  }

  glsl(baseDataType, stepN) {
    let src = this.srcTemplate.replace(/%output_type%/gi, this.outputType.glsl(baseDataType));
    src = src.replace(/%input%/gi, 'step' + stepN);
    src = src.replace(/%output%/gi, 'step' + (stepN + 1));
    return src;
  }
};

CATMAID.Pixi.SimpleShaderStep.BaseType = class BaseType {
  constructor(dataType) {
    let prefix;
    if (dataType.startsWith('int')) {
      prefix = 'i';
    } else if (dataType.startsWith('uint')) {
      prefix = 'u';
    }

    let depth = dataType.substr(-2);
    if (depth.endsWith("8")) depth = "8";
    depth = parseInt(depth, 10);

    // TODO: Since this is not channel/mode aware yet, manually set that 64-bit
    // data is RGBA16 so should be normalized by 16 bits instead.
    if (depth === 64) {
      depth = 16;
    }

    this.prefix = prefix;
    this.depth = depth;
    this.dataType = dataType;
  }

  glslColorType() {
    return (new CATMAID.Pixi.SimpleShaderStep.Type.Dependent('vec4')).glsl(this);
  }

  glslSamplerType() {
    return (new CATMAID.Pixi.SimpleShaderStep.Type.Dependent('sampler2D')).glsl(this);
  }

  glslScalar() {
    if (this.dataType.startsWith('int')) {
      return 'int';
    } else if (this.dataType.startsWith('uint')) {
      return 'uint';
    } else if (this.dataType.startsWith('float')) {
      return 'float';
    }
  }

  minValue() {
    // TODO: should handle type and sign.
    return 0;
  }

  maxValue() {
    // TODO: should handle type and sign.
    return Math.pow(2, this.depth);
  }
};

CATMAID.Pixi.SimpleShaderStep.Type = class Type {
  constructor() {
  }

  glsl(baseDataType) {
    throw new CATMAID.NotImplementedError();
  }
};

CATMAID.Pixi.SimpleShaderStep.Type.Independent = class Independent extends CATMAID.Pixi.SimpleShaderStep.Type {
  constructor(concrete) {
    super();
    this.concrete = concrete;
  }

  glsl(baseDataType) {
    return this.concrete;
  }
};

CATMAID.Pixi.SimpleShaderStep.Type.Dependent = class Dependent extends CATMAID.Pixi.SimpleShaderStep.Type {
  constructor(suffix) {
    super();
    this.suffix = suffix;
  }

  glsl(baseDataType) {
    return baseDataType.prefix + this.suffix;
  }
};

CATMAID.Pixi.SimpleShaderStep.Type.DependentScalar = class DependentScalar extends CATMAID.Pixi.SimpleShaderStep.Type {
  constructor() {
    super();
  }

  glsl(baseDataType) {
    return baseDataType.glslScalar();
  }
};

CATMAID.Pixi.SimpleShaderStep.Uniform = class Uniform {
  constructor(name, type, defaultGen, value) {
    this.name = name;
    this.type = type;
    this.defaultGen = defaultGen;
    this.value = value;
  }

  setAttr(attr, baseDataType) {
    this.value = this.value || CATMAID.tools.callIfFn(this.defaultGen, baseDataType);
    attr[this.name] = this.value;
  }

  glsl(baseDataType) {
    return `uniform ${this.type.glsl(baseDataType)} ${this.name};`;
  }
};

CATMAID.Pixi.SimpleMinMaxShaderStep = class SimpleMinMaxShaderStep extends CATMAID.Pixi.SimpleShaderStep {
  constructor() {
    super(
      [
        new CATMAID.Pixi.SimpleShaderStep.Uniform('minValue', new CATMAID.Pixi.SimpleShaderStep.Type.DependentScalar(), b => b.minValue()),
        new CATMAID.Pixi.SimpleShaderStep.Uniform('maxValue', new CATMAID.Pixi.SimpleShaderStep.Type.DependentScalar(), b => b.maxValue()),
      ],
      new CATMAID.Pixi.SimpleShaderStep.Type.Dependent('vec4'),
      // TODO: This is `vec4(float())` to implicitly assign a single channel value to all channels for grayscale.
      // Otherwise the result is a red channel image. This is correct, but should be more explicit or controllable.
`%output_type% %output% = vec4(float(clamp(%input%, minValue, maxValue) - minValue) / float(maxValue - minValue));`,
      new CATMAID.Pixi.SimpleShaderStep.Type.Independent('vec4'));
  }
};

})(CATMAID);
