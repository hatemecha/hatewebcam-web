// The multipass GPU pipeline: a small TOP-network-equivalent graph that
// runs entirely at a low internal "pixel space" resolution, with one
// full-resolution upscale/blend at the very end.
//
//   SOURCE -> INGEST (downsample)
//          -> CONTROL FIELD (luma / edges / frame diff / motion memory)
//          -> DRIFT FIELD (curl-noise field with inertia, energized by the
//             control field - this is the system's evolving "state", not
//             a function of time alone)
//          -> STATE PASS (per-system: displace + erode + inject + feed back
//             into its own history - this is the actual feedback loop)
//          -> PALETTE (quantize/tone-map, display-only, never fed back)
//          -> BLIT (nearest upscale, blended against the full-res source)
//
// Every buffer above is a ping-pong pair except the palette output, so the
// "history" that six of these passes touch is always last frame's *own*
// processed result, sampled and transformed - genuine feedback, not
// mix(currentFrame, previousFrame).
import {
  createProgram,
  createQuad,
  bindQuad,
  createTarget,
  destroyTarget,
  detectFloatRenderTarget,
  PingPong,
  renderToTarget,
} from './gl.mjs';
import { VERTEX_SHADER } from './glsl.mjs';
import {
  INGEST_FRAGMENT,
  CONTROL_FIELD_FRAGMENT,
  FIELD_FRAGMENT,
  PALETTE_FRAGMENT,
  BLIT_FRAGMENT,
} from './passes.mjs';
import {
  SYSTEM_RENDER,
  getWorkingResolution,
  computeSharedUniforms,
  computeFieldUniforms,
  computePaletteUniforms,
} from './systems.mjs';

export class VisualFxPipeline {
  constructor(gl, isWebGL2) {
    this.gl = gl;
    this.isWebGL2 = isWebGL2;
    this.quad = createQuad(gl);
    this.float = detectFloatRenderTarget(gl, isWebGL2);
    this.programs = {
      ingest: createProgram(gl, VERTEX_SHADER, INGEST_FRAGMENT),
      control: createProgram(gl, VERTEX_SHADER, CONTROL_FIELD_FRAGMENT),
      field: createProgram(gl, VERTEX_SHADER, FIELD_FRAGMENT),
      palette: createProgram(gl, VERTEX_SHADER, PALETTE_FRAGMENT),
      blit: createProgram(gl, VERTEX_SHADER, BLIT_FRAGMENT),
    };
    this.statePrograms = new Map();
    this.rawSource = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.rawSource);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.topologyKey = '';
    this.buffers = null;
  }

  getStateProgram(system) {
    if (!this.statePrograms.has(system)) {
      const src = SYSTEM_RENDER[system].fragment;
      this.statePrograms.set(
        system,
        createProgram(this.gl, VERTEX_SHADER, src),
      );
    }
    return this.statePrograms.get(system);
  }

  // (Re)allocate every working-resolution buffer. Called only when the
  // topology key changes (system or a topology-flagged tuning value) or on
  // an explicit reset - never on a plain macro/slider change.
  allocate(system, workWidth, workHeight) {
    const gl = this.gl;
    this.disposeBuffers();
    const historyFilter =
      SYSTEM_RENDER[system].historyFilter === 'NEAREST'
        ? gl.NEAREST
        : gl.LINEAR;
    const signalOptions = {
      filter: gl.NEAREST,
      type: this.float.type,
      internalFormat: this.float.internalFormat,
    };
    this.currentSystem = system;
    this.buffers = {
      width: workWidth,
      height: workHeight,
      ingest: new PingPong(gl, this.isWebGL2, workWidth, workHeight, {
        filter: gl.LINEAR,
      }),
      control: new PingPong(
        gl,
        this.isWebGL2,
        workWidth,
        workHeight,
        signalOptions,
      ),
      field: new PingPong(
        gl,
        this.isWebGL2,
        workWidth,
        workHeight,
        signalOptions,
      ),
      history: new PingPong(gl, this.isWebGL2, workWidth, workHeight, {
        filter: historyFilter,
      }),
      palette: createTarget(gl, this.isWebGL2, workWidth, workHeight, {
        filter: gl.NEAREST,
      }),
    };
    this.hasHistory = false;
  }

  disposeBuffers() {
    if (!this.buffers) return;
    const gl = this.gl;
    this.buffers.ingest.dispose();
    this.buffers.control.dispose();
    this.buffers.field.dispose();
    this.buffers.history.dispose();
    destroyTarget(gl, this.buffers.palette);
    this.buffers = null;
  }

  // Ensures buffers match the requested topology; returns true if a fresh
  // (empty) simulation was allocated, false if the existing one was kept.
  ensureTopology(system, tuning, sourceWidth, sourceHeight) {
    const { width, height } = getWorkingResolution(
      system,
      tuning,
      sourceWidth,
      sourceHeight,
    );
    const key = `${system}:${width}x${height}`;
    if (key === this.topologyKey && this.buffers) return false;
    this.topologyKey = key;
    this.allocate(system, width, height);
    return true;
  }

  // Manual reset ("Reiniciar" button, seek, source change): clears state
  // without touching the topology key, so an identical config after reset
  // does not force a spurious reallocation on the next frame.
  resetState() {
    if (this.buffers)
      this.allocate(
        this.currentSystem,
        this.buffers.width,
        this.buffers.height,
      );
    this.hasHistory = false;
  }

  uploadSource(sourceImage, sourceWidth, sourceHeight) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.rawSource);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceImage,
    );
    this.sourceWidth = sourceWidth;
    this.sourceHeight = sourceHeight;
  }

  render({ config, time, delta, hasHistory, canvasWidth, canvasHeight }) {
    const gl = this.gl;
    const { system, macros, tuning } = config;
    const buf = this.buffers;
    const texel = [1 / buf.width, 1 / buf.height];
    const shared = computeSharedUniforms(system, macros);
    const fieldU = computeFieldUniforms(system, macros);
    const paletteU = computePaletteUniforms(system, macros, tuning);
    const renderInfo = SYSTEM_RENDER[system];
    const has = hasHistory && this.hasHistory ? 1 : 0;

    bindQuad(gl, this.quad);

    // 1. Ingest: downsample the full-resolution source into working space.
    renderToTarget(gl, buf.ingest.other(), () => {
      gl.useProgram(this.programs.ingest.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.rawSource);
      gl.uniform1i(this.programs.ingest.uniform('uSource'), 0);
      gl.uniform2f(
        this.programs.ingest.uniform('uSourceTexel'),
        1 / Math.max(1, this.sourceWidth),
        1 / Math.max(1, this.sourceHeight),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    // 2. Control field: luma / edges / frame difference / motion memory.
    renderToTarget(gl, buf.control.other(), () => {
      gl.useProgram(this.programs.control.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, buf.ingest.other().texture);
      gl.uniform1i(this.programs.control.uniform('uIngestNow'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, buf.ingest.current().texture);
      gl.uniform1i(this.programs.control.uniform('uIngestPrev'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, buf.control.current().texture);
      gl.uniform1i(this.programs.control.uniform('uControlPrev'), 2);
      gl.uniform2f(this.programs.control.uniform('uTexel'), texel[0], texel[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
    buf.ingest.advance();
    buf.control.advance();

    // 3. Drift field: curl-noise target eased in with inertia, energized by
    //    the control field. The field itself is the persistent "state".
    renderToTarget(gl, buf.field.other(), () => {
      gl.useProgram(this.programs.field.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, buf.field.current().texture);
      gl.uniform1i(this.programs.field.uniform('uFieldPrev'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, buf.control.current().texture);
      gl.uniform1i(this.programs.field.uniform('uControl'), 1);
      gl.uniform1f(this.programs.field.uniform('uTime'), time);
      gl.uniform1f(this.programs.field.uniform('uSeed'), config.seed % 97);
      gl.uniform1f(this.programs.field.uniform('uSpeed'), fieldU.uSpeed);
      gl.uniform1f(
        this.programs.field.uniform('uReactivity'),
        fieldU.uReactivity,
      );
      gl.uniform1f(
        this.programs.field.uniform('uAdaptRate'),
        fieldU.uAdaptRate,
      );
      gl.uniform1f(
        this.programs.field.uniform('uScaleFreq'),
        fieldU.uScaleFreq,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
    buf.field.advance();

    // 4. State pass: the system-specific feedback loop. Reads its own
    //    history, displaces/erodes/injects, writes the new history.
    const stateProgram = this.getStateProgram(system);
    renderToTarget(gl, buf.history.other(), () => {
      gl.useProgram(stateProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, buf.ingest.current().texture);
      gl.uniform1i(stateProgram.uniform('uIngestNow'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, buf.history.current().texture);
      gl.uniform1i(stateProgram.uniform('uHistoryPrev'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, buf.field.current().texture);
      gl.uniform1i(stateProgram.uniform('uField'), 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, buf.control.current().texture);
      gl.uniform1i(stateProgram.uniform('uControl'), 3);
      gl.uniform2f(stateProgram.uniform('uTexel'), texel[0], texel[1]);
      gl.uniform1f(stateProgram.uniform('uTime'), time);
      gl.uniform1f(stateProgram.uniform('uDelta'), delta);
      gl.uniform1f(stateProgram.uniform('uHasHistory'), has);
      gl.uniform1f(stateProgram.uniform('uSeed'), config.seed % 97);
      gl.uniform1f(stateProgram.uniform('uInjection'), shared.uInjection);
      gl.uniform1f(stateProgram.uniform('uMemory'), shared.uMemory);
      gl.uniform1f(stateProgram.uniform('uErosion'), shared.uErosion);
      gl.uniform1f(stateProgram.uniform('uDisplace'), shared.uDisplace);
      gl.uniform1f(stateProgram.uniform('uStructure'), macros.structure);
      const extra = renderInfo.tuningToUniforms(macros, tuning);
      for (const [name, value] of Object.entries(extra))
        gl.uniform1f(stateProgram.uniform(name), value);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
    buf.history.advance();
    this.hasHistory = true;

    // 5. Palette: quantize/tone-map for display only (never fed back).
    renderToTarget(gl, buf.palette, () => {
      gl.useProgram(this.programs.palette.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, buf.history.current().texture);
      gl.uniform1i(this.programs.palette.uniform('uHistory'), 0);
      gl.uniform1f(this.programs.palette.uniform('uLevels'), paletteU.uLevels);
      gl.uniform1f(this.programs.palette.uniform('uDither'), paletteU.uDither);
      gl.uniform1f(
        this.programs.palette.uniform('uPaletteMode'),
        paletteU.uPaletteMode,
      );
      gl.uniform1f(this.programs.palette.uniform('uCurve'), paletteU.uCurve);
      gl.uniform3f(this.programs.palette.uniform('uToneA'), ...paletteU.uToneA);
      gl.uniform3f(this.programs.palette.uniform('uToneB'), ...paletteU.uToneB);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    // 6. Blit: nearest upscale to the full-resolution canvas, blended
    //    against the untouched source by the intensity macro.
    renderToTarget(
      gl,
      { width: canvasWidth, height: canvasHeight, framebuffer: null },
      () => {
        gl.useProgram(this.programs.blit.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, buf.palette.texture);
        gl.uniform1i(this.programs.blit.uniform('uPalette'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.rawSource);
        gl.uniform1i(this.programs.blit.uniform('uSourceFull'), 1);
        gl.uniform1f(this.programs.blit.uniform('uAmount'), macros.intensity);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
    );
  }

  // Debug-only: read each intermediate buffer back into a small canvas.
  // Never called during normal preview/export - only from the dev FX Lab.
  readDebugBuffers() {
    if (!this.buffers) return null;
    const gl = this.gl;
    const readFramebuffer = (framebuffer, width, height) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);
      // WebGL reads bottom-up; flip rows so the debug view matches the
      // preview orientation. Alpha is forced opaque - several buffers use
      // that channel as a data slot (motion energy, drift memory), not
      // transparency.
      const rowBytes = width * 4;
      for (let y = 0; y < height; y++) {
        const src = pixels.subarray(
          (height - 1 - y) * rowBytes,
          (height - y) * rowBytes,
        );
        imageData.data.set(src, y * rowBytes);
      }
      for (let i = 3; i < imageData.data.length; i += 4)
        imageData.data[i] = 255;
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    };
    const read = (target) =>
      target
        ? readFramebuffer(target.framebuffer, target.width, target.height)
        : null;
    let source = null;
    if (this.sourceWidth) {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.rawSource,
        0,
      );
      source = readFramebuffer(fbo, this.sourceWidth, this.sourceHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
    }
    return {
      source,
      motion: read(this.buffers.control.current()),
      field: read(this.buffers.field.current()),
      history: read(this.buffers.history.current()),
      output: read(this.buffers.palette),
    };
  }

  dispose() {
    const gl = this.gl;
    this.disposeBuffers();
    gl.deleteTexture(this.rawSource);
    gl.deleteBuffer(this.quad);
    Object.values(this.programs).forEach((p) => gl.deleteProgram(p.program));
    this.statePrograms.forEach((p) => gl.deleteProgram(p.program));
    this.statePrograms.clear();
  }
}
