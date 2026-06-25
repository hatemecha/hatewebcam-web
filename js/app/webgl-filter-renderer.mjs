const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_grayscale;
varying vec2 v_texCoord;
void main() {
  vec4 color = texture2D(u_image, v_texCoord);
  vec3 rgb = color.rgb * u_brightness;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(luma), rgb, u_saturation);
  rgb = mix(rgb, vec3(luma), u_grayscale);
  gl_FragColor = vec4(min(max(rgb, 0.0), 1.0), color.a);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(error || 'webgl_shader_compile_failed');
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(error || 'webgl_program_link_failed');
  }
  return program;
}

export class WebGLFilterRenderer {
  constructor({ createCanvas = () => document.createElement('canvas') } = {}) {
    this.canvas = createCanvas();
    this.gl =
      this.canvas.getContext('webgl', { premultipliedAlpha: false }) ||
      this.canvas.getContext('experimental-webgl', {
        premultipliedAlpha: false,
      });
    if (!this.gl) throw new Error('webgl_unavailable');

    const gl = this.gl;
    this.program = createProgram(gl);
    this.locations = {
      position: gl.getAttribLocation(this.program, 'a_position'),
      texCoord: gl.getAttribLocation(this.program, 'a_texCoord'),
      brightness: gl.getUniformLocation(this.program, 'u_brightness'),
      contrast: gl.getUniformLocation(this.program, 'u_contrast'),
      saturation: gl.getUniformLocation(this.program, 'u_saturation'),
      grayscale: gl.getUniformLocation(this.program, 'u_grayscale'),
    };

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW,
    );

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  render(source, width, height, values) {
    const gl = this.gl;
    const safeWidth = Math.max(1, Math.round(width || 1));
    const safeHeight = Math.max(1, Math.round(height || 1));
    if (this.canvas.width !== safeWidth) this.canvas.width = safeWidth;
    if (this.canvas.height !== safeHeight) this.canvas.height = safeHeight;

    gl.viewport(0, 0, safeWidth, safeHeight);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.locations.texCoord);
    gl.vertexAttribPointer(this.locations.texCoord, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(this.locations.brightness, values.brightness);
    gl.uniform1f(this.locations.contrast, values.contrast);
    gl.uniform1f(this.locations.saturation, values.saturation);
    gl.uniform1f(this.locations.grayscale, values.grayscale);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
}
