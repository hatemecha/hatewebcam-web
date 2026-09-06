import { createGLContext } from './gl.mjs';
import { VisualFxPipeline } from './pipeline.mjs';
import { visualConfigTopologyKey } from './config.mjs';
import { processCompatiblePixels } from './fallback.mjs';

// Public renderer: owns the GPU pipeline's lifetime and decides when a
// running simulation must restart. Two independent things can force a
// restart and both are deliberately narrow:
//   - `key` changes (clip/mode/output-dimensions) - handled here, same as
//     before: a genuinely different render target.
//   - the config's *topology* changes (system, or a topology-flagged
//     tuning value such as internal resolution) - also handled here, by
//     comparing `visualConfigTopologyKey`, never by comparing the whole
//     config. A macro or a non-topology tuning value can change every
//     frame without ever tripping this.
// Playback pause/seek/source-change call `reset()` explicitly; that is the
// only other way state disappears.
export class VisualRenderer {
  constructor() {
    this.lastTime = null;
    this.key = '';
    this.topologyKey = '';
    this.failed = false;
  }

  reset() {
    this.lastTime = null;
    this.key = '';
    this.lastConfigFingerprint = '';
    this.pipeline?.resetState();
    if (this.fallbackHistory) this.fallbackHistory.width = 0;
  }

  initialize() {
    this.output = document.createElement('canvas');
    this.previous = document.createElement('canvas');
    const context = createGLContext(this.output);
    if (!context) {
      this.failed = true;
      return;
    }
    this.gl = context.gl;
    this.pipeline = new VisualFxPipeline(this.gl, context.isWebGL2);
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
    // A paused preview re-renders the *same* media time whenever a macro or
    // tuning value is committed - that must repaint with the new value, not
    // return a stale cached frame just because time did not advance.
    const configFingerprint = JSON.stringify(config);
    const unchanged =
      this.lastTime === time &&
      identity === this.key &&
      configFingerprint === this.lastConfigFingerprint;
    if (unchanged) return this.failed ? this.previous : this.output;
    const delta =
      this.lastTime === null ? 1 : Math.max(0.01, (time - this.lastTime) * 30);
    const hasHistory = this.lastTime !== null;
    this.key = identity;
    this.lastConfigFingerprint = configFingerprint;

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

    const topologyKey = visualConfigTopologyKey(config);
    if (topologyKey !== this.topologyKey) {
      this.topologyKey = topologyKey;
      this.pipeline.ensureTopology(config.system, config.tuning, width, height);
    }
    this.pipeline.uploadSource(source, width, height);
    this.pipeline.render({
      config,
      time,
      delta,
      hasHistory,
      canvasWidth: width,
      canvasHeight: height,
    });
    this.lastTime = time;
    return this.output;
  }

  fallback(source, config, time, delta, hasHistory) {
    const { width, height } = source;
    this.scratch ||= document.createElement('canvas');
    this.pixelWork ||= document.createElement('canvas');
    this.fallbackHistory ||= document.createElement('canvas');
    this.scratch.width = width;
    this.scratch.height = height;
    // `fallbackHistory` stays at working resolution (the reduced canvas the
    // CPU path actually composites at); `this.previous`/`this.output`
    // remain the full-resolution public contract callers rely on.
    const processed = processCompatiblePixels(
      source,
      config,
      time,
      delta,
      hasHistory,
      this.pixelWork,
      this.fallbackHistory,
    );
    const scratchCtx = this.scratch.getContext('2d');
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.clearRect(0, 0, width, height);
    scratchCtx.drawImage(processed, 0, 0, width, height);

    this.fallbackHistory.width = processed.width;
    this.fallbackHistory.height = processed.height;
    this.fallbackHistory.getContext('2d').drawImage(processed, 0, 0);

    this.previous.width = width;
    this.previous.height = height;
    const target = this.previous.getContext('2d');
    target.clearRect(0, 0, width, height);
    target.drawImage(this.scratch, 0, 0);
    this.lastTime = time;
    return this.previous;
  }

  // Dev FX Lab only: intermediate GPU buffers as small canvases.
  getDebugBuffers() {
    if (this.failed || !this.pipeline) return null;
    return this.pipeline.readDebugBuffers();
  }

  dispose() {
    this.pipeline?.dispose();
    this.pipeline = null;
    this.output = null;
    this.previous = null;
    this.gl = null;
    this.reset();
  }
}
