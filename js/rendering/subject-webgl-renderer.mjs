import { getStrongestMotionRegion } from '../subject/subject-local-motion.mjs';
import { drawSubjectMask } from '../subject/subject-frame-map.mjs';

const VERT = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const FRAG = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_current;
uniform sampler2D u_feedback;
uniform vec2 u_displacement;
uniform float u_mix;
uniform float u_decay;
void main() {
  vec2 displaced = v_texCoord + u_displacement;
  vec4 current = texture2D(u_current, v_texCoord);
  vec4 feedback = texture2D(u_feedback, displaced);
  feedback.a *= u_decay;
  gl_FragColor = mix(current, feedback, u_mix);
}`;

export class SubjectWebGLRenderer {
  constructor() {
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.feedbackCanvas = null;
    this.feedbackTexture = null;
    this.currentTexture = null;
    this.ready = false;
    this.locations = {};
    this._maskCanvas = null;
    this._maskCtx = null;
  }

  ensure(width, height) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      const gl =
        this.canvas.getContext('webgl', {
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
        }) ||
        this.canvas.getContext('experimental-webgl', {
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
        });
      if (!gl) return false;
      this.gl = gl;
      this.#initProgram(gl);
      this.feedbackCanvas = document.createElement('canvas');
      this._maskCanvas = document.createElement('canvas');
      this._maskCtx = this._maskCanvas.getContext('2d');
      this.ready = true;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.feedbackCanvas.width = width;
      this.feedbackCanvas.height = height;
      this._maskCanvas.width = width;
      this._maskCanvas.height = height;
      this.#initTextures(width, height);
    }
    return this.ready;
  }

  #initProgram(gl) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW,
    );
    const pos = gl.getAttribLocation(program, 'a_position');
    const tex = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(pos);
    gl.enableVertexAttribArray(tex);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(tex, 2, gl.FLOAT, false, 16, 8);
    this.program = program;
    this.locations = {
      current: gl.getUniformLocation(program, 'u_current'),
      feedback: gl.getUniformLocation(program, 'u_feedback'),
      displacement: gl.getUniformLocation(program, 'u_displacement'),
      mix: gl.getUniformLocation(program, 'u_mix'),
      decay: gl.getUniformLocation(program, 'u_decay'),
    };
  }

  #initTextures(width, height) {
    const gl = this.gl;
    this.feedbackTexture = this.#createTexture();
    this.currentTexture = this.#createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.feedbackTexture);
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
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
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
  }

  #createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  #uploadTexture(texture, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  reset() {
    if (!this.ready || !this.feedbackCanvas) return;
    const ctx = this.feedbackCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.feedbackCanvas.width, this.feedbackCanvas.height);
    this.#uploadTexture(this.feedbackTexture, this.feedbackCanvas);
  }

  applySmear(sourceCanvas, options = {}) {
    if (!this.ensure(sourceCanvas.width, sourceCanvas.height)) {
      return sourceCanvas;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    this.#uploadTexture(this.currentTexture, sourceCanvas);
    this.#uploadTexture(this.feedbackTexture, this.feedbackCanvas);

    const dx = options.dx ?? 0;
    const dy = options.dy ?? 0;

    gl.uniform1i(this.locations.current, 0);
    gl.uniform1i(this.locations.feedback, 1);
    gl.uniform2f(this.locations.displacement, dx, dy);
    gl.uniform1f(this.locations.mix, options.mix ?? 0.55);
    gl.uniform1f(this.locations.decay, options.decay ?? 0.82);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.feedbackTexture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const ctx = this.feedbackCanvas.getContext('2d');
    ctx.drawImage(this.canvas, 0, 0);
    return this.canvas;
  }

  dispose() {
    if (this.gl) {
      [this.feedbackTexture, this.currentTexture, this.program].forEach(
        (resource) => {
          if (!resource) return;
          if (resource === this.program) this.gl.deleteProgram(resource);
          else this.gl.deleteTexture(resource);
        },
      );
    }
    this.canvas = null;
    this.gl = null;
    this.feedbackCanvas = null;
    this._maskCanvas = null;
    this._maskCtx = null;
    this.ready = false;
  }
}

export class SmearEngine {
  constructor() {
    this.renderer = new SubjectWebGLRenderer();
    this._compositeCanvas = null;
    this._compositeCtx = null;
  }

  reset() {
    this.renderer.reset();
  }

  dispose() {
    this.renderer.dispose();
  }

  apply(ctx, canvas, frame, config, intensity, sourceCanvas, drawMetrics) {
    if (!config?.enabled || !frame || !sourceCanvas) return false;

    const strongest = getStrongestMotionRegion(frame.regions || {});
    const localSpeed = strongest?.speed || frame.motionEnergy || 0;
    const quiet = localSpeed < config.threshold;

    const dir = strongest?.direction ?? frame.movementDirection ?? 0;
    const mag = quiet
      ? 0
      : config.spread * intensity * (0.15 + localSpeed * 0.85);
    const dx = Math.cos(dir) * mag * 0.018;
    const dy = Math.sin(dir) * mag * 0.018;

    // Always advance/decay feedback so quiet motion never freezes an old frame.
    const output = this.renderer.applySmear(sourceCanvas, {
      dx,
      dy,
      decay: quiet
        ? Math.min(0.92, (config.decay || 0.82) * 0.94)
        : config.decay,
      mix: quiet
        ? Math.min(0.2, 0.06 + intensity * 0.08)
        : Math.min(0.78, 0.18 + intensity * 0.48),
    });

    if (quiet && config.subjectOnly) {
      // Feedback updated; skip visible composite when motion is below threshold.
      return false;
    }

    if (config.subjectOnly !== false && frame.mask && !frame.simplified) {
      const masked = this.#ensureComposite(canvas.width, canvas.height);
      const mctx = this._compositeCtx;
      mctx.clearRect(0, 0, canvas.width, canvas.height);
      mctx.drawImage(output, 0, 0, canvas.width, canvas.height);
      mctx.globalCompositeOperation = 'destination-in';
      drawSubjectMask(mctx, frame.mask, drawMetrics);
      mctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(masked, 0, 0);
      return true;
    }

    ctx.drawImage(output, 0, 0, canvas.width, canvas.height);
    return true;
  }

  #ensureComposite(width, height) {
    if (!this._compositeCanvas) {
      this._compositeCanvas = document.createElement('canvas');
      this._compositeCtx = this._compositeCanvas.getContext('2d');
    }
    if (
      this._compositeCanvas.width !== width ||
      this._compositeCanvas.height !== height
    ) {
      this._compositeCanvas.width = width;
      this._compositeCanvas.height = height;
    }
    return this._compositeCanvas;
  }
}
