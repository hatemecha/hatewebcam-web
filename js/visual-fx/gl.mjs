// Minimal WebGL2/WebGL1 toolkit shared by the Visual FX multipass pipeline.
// Every helper here is deliberately dumb: no framework, no caching magic that
// could hide a context-loss or a compile error. Shaders are written in plain
// GLSL ES 1.00 so the exact same source compiles under both WebGL1 and
// WebGL2 (WebGL2 keeps ES 1.00 shader compatibility as long as no ES3-only
// feature is used), which lets the whole pipeline share one shader set.

export function createGLContext(canvas) {
  const attrs = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
  };
  const gl2 = canvas.getContext('webgl2', attrs);
  if (gl2) return { gl: gl2, isWebGL2: true };
  const gl1 = canvas.getContext('webgl', attrs);
  if (gl1) return { gl: gl1, isWebGL2: false };
  return null;
}

export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Visual FX shader compile error: ${log}`);
  }
  return shader;
}

export function createProgram(gl, vertexSource, fragmentSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'position');
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Visual FX program link error: ${log}`);
  }
  const uniforms = new Map();
  return {
    program,
    uniform(name) {
      if (!uniforms.has(name))
        uniforms.set(name, gl.getUniformLocation(program, name));
      return uniforms.get(name);
    },
  };
}

// Fullscreen triangle-pair, shared by every pass. `position` is attribute 0.
export function createQuad(gl) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  return buffer;
}

export function bindQuad(gl, buffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

// Probe whether the context can render into a half-float color attachment.
// Only used for signal buffers (control field / drift field) where 8-bit
// leaky integration visibly bands. Color buffers keep UNSIGNED_BYTE, which
// is universally renderable and already good enough for a final image.
export function detectFloatRenderTarget(gl, isWebGL2) {
  let type = gl.UNSIGNED_BYTE;
  let internalFormat = gl.RGBA;
  try {
    if (isWebGL2) {
      const ext = gl.getExtension('EXT_color_buffer_float');
      if (ext) {
        type = gl.HALF_FLOAT;
        internalFormat = gl.RGBA16F;
      }
    } else {
      const ext = gl.getExtension('OES_texture_half_float');
      if (ext) type = ext.HALF_FLOAT_OES;
    }
    if (type === gl.UNSIGNED_BYTE) return { type, internalFormat: gl.RGBA };
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (isWebGL2)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        4,
        4,
        0,
        gl.RGBA,
        type,
        null,
      );
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    if (!complete) return { type: gl.UNSIGNED_BYTE, internalFormat: gl.RGBA };
    return { type, internalFormat };
  } catch {
    return { type: gl.UNSIGNED_BYTE, internalFormat: gl.RGBA };
  }
}

// A single render target: texture + framebuffer, fixed size.
export function createTarget(gl, isWebGL2, width, height, options = {}) {
  const {
    filter = gl.LINEAR,
    type = gl.UNSIGNED_BYTE,
    internalFormat,
  } = options;
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (isWebGL2)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat || gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      type,
      null,
    );
  else
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      type,
      null,
    );
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
}

export function destroyTarget(gl, target) {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
}

// Two identical targets, alternated every frame. `current()` is the target
// that finished rendering most recently (safe to sample); `other()` is the
// target about to be written this frame. Call `advance()` once the write
// completes so next frame's `current()` returns the fresh content.
export class PingPong {
  constructor(gl, isWebGL2, width, height, options = {}) {
    this.gl = gl;
    this.a = createTarget(gl, isWebGL2, width, height, options);
    this.b = createTarget(gl, isWebGL2, width, height, options);
    this.flag = false;
  }
  current() {
    return this.flag ? this.b : this.a;
  }
  other() {
    return this.flag ? this.a : this.b;
  }
  advance() {
    this.flag = !this.flag;
  }
  dispose() {
    destroyTarget(this.gl, this.a);
    destroyTarget(this.gl, this.b);
  }
}

export function renderToTarget(gl, target, draw) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
  gl.viewport(
    0,
    0,
    target ? target.width : gl.drawingBufferWidth,
    target ? target.height : gl.drawingBufferHeight,
  );
  draw();
}
