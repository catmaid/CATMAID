(function(CATMAID) {

'use strict';

CATMAID.Pixi = CATMAID.Pixi || {};

CATMAID.Pixi.TypedSpriteRenderer = class TypedSpriteRenderer extends PIXI.SpriteRenderer {
  constructor(dataType, renderer) {
    super(renderer);

    this.dataType = dataType;
  }

  flush() {
    // Because all SpriteRenderers and their shaders use the same bound texture
    // units, it is necessary to unbind any textures of different formats or
    // the entire object will fail to render due to bound textures being
    // incompatible with shaders' sampler types.
    let btex = this.renderer.boundTextures;
    for (let i = 0; i < btex.length; ++i) {
      // TODO: this could be done more efficiently than a string property and
      // comparison by checking properties of the GL texture.
      if (btex[i].dataType !== this.dataType) {
        this.renderer.unbindTexture(btex[i]);
      }
    }
    super.flush();
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
out vec4 myOutputColor;

void main(void){
%color_type% color;
%forloop%
myOutputColor = %color_conversion%;
}`;

function generateMultiTextureShader(gl, maxTextures, dataType)
{
  const vertexSrc = vertTemplate;
  let fragmentSrc = fragTemplate;

  fragmentSrc = fragmentSrc.replace(/%count%/gi, maxTextures);
  fragmentSrc = fragmentSrc.replace(/%forloop%/gi, generateSampleSrc(maxTextures));

  const params = dataTypeParameters(dataType);
  fragmentSrc = fragmentSrc.replace(/%sampler_type%/gi, params.samplerType);
  fragmentSrc = fragmentSrc.replace(/%color_type%/gi, params.colorType);
  fragmentSrc = fragmentSrc.replace(/%color_conversion%/gi, params.colorConversion);

  const shader = new NonMutatingShader(gl, vertexSrc, fragmentSrc);

  const sampleValues = [];

  for (let i = 0; i < maxTextures; i++)
  {
      sampleValues[i] = i;
  }

  shader.bind();
  shader.uniforms.uSamplers = sampleValues;

  return shader;
}

function dataTypeParameters(dataType) {
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

  let typeMax = Math.pow(2, depth);

  return {
    colorType: prefix + 'vec4',
    colorConversion: 'float(color) * vColor / ' + typeMax.toFixed(1),
    samplerType: prefix + 'sampler2D',
  };
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

// See the comment on TypedSpriteRenderer.flush above.
let oldFlush = PIXI.SpriteRenderer.prototype.flush;
PIXI.SpriteRenderer.prototype.flush = function () {
  let btex = this.renderer.boundTextures;
  for (let i = 0; i < btex.length; ++i) {
    if (btex[i].dataType) {
      this.renderer.unbindTexture(btex[i]);
    }
  }
  return oldFlush.call(this);
};

})(CATMAID);
