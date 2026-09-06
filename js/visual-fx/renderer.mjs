import { vertex, fragment } from './shaders.mjs';
import { processCompatiblePixels } from './fallback.mjs';

export class VisualRenderer {
  constructor() {
    this.lastTime = null;
    this.key = '';
    this.failed = false;
  }
  reset() {
    this.lastTime = null;
    this.key = '';
  }
  initialize() {
    this.output = document.createElement('canvas');
    this.previous = document.createElement('canvas');
    this.gl = this.output.getContext('webgl', {
      alpha: true,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!this.gl) {
      this.failed = true;
      return;
    }
    const gl = this.gl;
    const compile = (type, code) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex),
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    this.textures = [0, 1].map(() => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    this.uniforms = new Map();
  }
  render(source, config, time, key = '') {
    if (!this.output) {
      try {
        this.initialize();
      } catch {
        this.failed = true;
      }
    }
    const { width, height } = source;
    const identity = `${key}:${width}:${height}`;
    if (
      identity !== this.key ||
      time < this.lastTime ||
      time - this.lastTime > 0.25
    )
      this.reset();
    if (this.lastTime === time && identity === this.key)
      return this.failed ? this.previous : this.output;
    const delta =
      this.lastTime === null ? 1 : Math.max(0.01, (time - this.lastTime) * 30);
    const hasHistory = this.lastTime !== null;
    this.key = identity;
    if (this.previous.width !== width || this.previous.height !== height) {
      this.previous.width = width;
      this.previous.height = height;
      this.output.width = width;
      this.output.height = height;
    }
    if (!this.failed && this.gl?.isContextLost()) {
      this.failed = true;
      this.reset();
    }
    if (this.failed)
      return this.fallback(source, config, time, delta, hasHistory);
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    const uniform = (name) => {
      if (!this.uniforms.has(name))
        this.uniforms.set(name, gl.getUniformLocation(this.program, name));
      return this.uniforms.get(name);
    };
    [source, this.previous].forEach((image, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (index === 0)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
      else if (!hasHistory)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      gl.uniform1i(uniform(index ? 'history' : 'source'), index);
    });
    gl.uniform2f(uniform('resolution'), width, height);
    const values = {
      ...config.modules,
      amount: config.amount,
      movement: config.movement,
      persistence: config.persistence,
      scale: config.scale,
      seed: config.seed,
      time,
      delta,
      hasHistory: Number(hasHistory),
    };
    Object.entries(values).forEach(([name, value]) =>
      gl.uniform1f(uniform(name), value),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // GPU-to-GPU copy; feedback never makes a pixel readback through JavaScript.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, width, height, 0);
    this.lastTime = time;
    return this.output;
  }
  fallback(source, config, time, delta, hasHistory) {
    // Portable reduced mode: real recursive accumulation plus block/color processing.
    this.scratch ||= document.createElement('canvas');
    this.scratch.width = source.width;
    this.scratch.height = source.height;
    const ctx = this.scratch.getContext('2d'),
      { width, height } = source;
    ctx.drawImage(source, 0, 0);
    this.pixelWork ||= document.createElement('canvas');
    const processed = processCompatiblePixels(
      source,
      config,
      time,
      this.pixelWork,
    );
    ctx.save();
    ctx.globalAlpha = config.amount;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(processed, 0, 0, width, height);
    ctx.restore();
    if (hasHistory && config.modules.feedback > 0) {
      ctx.save();
      ctx.globalAlpha =
        Math.pow(
          Math.min(
            0.985,
            config.modules.feedback * (0.92 + config.persistence * 0.075),
          ),
          delta,
        ) * config.amount;
      ctx.translate(width / 2, height / 2);
      ctx.rotate(config.modules.recursion * 0.018 * delta);
      const zoom = 1 + config.modules.recursion * 0.055 * delta;
      ctx.scale(zoom, zoom);
      ctx.drawImage(this.previous, -width / 2, -height / 2);
      ctx.restore();
    }
    const target = this.previous.getContext('2d');
    target.clearRect(0, 0, width, height);
    target.drawImage(this.scratch, 0, 0);
    this.lastTime = time;
    return this.previous;
  }
  dispose() {
    const gl = this.gl;
    if (gl) {
      this.textures?.forEach((t) => gl.deleteTexture(t));
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(this.program);
    }
    this.output = null;
    this.previous = null;
    this.gl = null;
    this.reset();
  }
}
