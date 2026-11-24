import { createGLContext, type VisualGL } from './gl.ts';
import { VisualFxPipeline } from './pipeline.ts';
import { visualConfigTopologyKey, type VisualConfig } from './config.ts';
import { processCompatiblePixels } from './fallback.ts';

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
  private lastTime: number | null = null;
  private key = '';
  private topologyKey = '';
  failed = false;
  private lastConfigFingerprint = '';
  private output: HTMLCanvasElement | null = null;
  private previous: HTMLCanvasElement | null = null;
  private gl: VisualGL | null = null;
  private pipeline: VisualFxPipeline | null = null;
  private scratch: HTMLCanvasElement | null = null;
  private pixelWork: HTMLCanvasElement | null = null;
  private fallbackHistory: HTMLCanvasElement | null = null;

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
    this.pipeline = new VisualFxPipeline(context.gl, context.isWebGL2);
  }

  render(
    source: HTMLCanvasElement,
    config: VisualConfig,
    time: number,
    key = '',
  ): HTMLCanvasElement {
    if (!this.output) {
      try {
        this.initialize();
      } catch {
        this.failed = true;
      }
    }
    const output = this.output;
    const previous = this.previous;
    if (!output || !previous) return source;
    const { width, height } = source;
    const identity = `${key}:${width}:${height}`;
    if (
      identity !== this.key ||
      (this.lastTime !== null &&
        (time < this.lastTime || time - this.lastTime > 0.25))
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
    if (unchanged) return this.failed ? previous : output;
    const delta =
      this.lastTime === null ? 1 : Math.max(0.01, (time - this.lastTime) * 30);
    const hasHistory = this.lastTime !== null;
    this.key = identity;
    this.lastConfigFingerprint = configFingerprint;

    if (previous.width !== width || previous.height !== height) {
      previous.width = width;
      previous.height = height;
      output.width = width;
      output.height = height;
    }
    if (!this.failed && this.gl?.isContextLost()) {
      this.failed = true;
      this.reset();
    }
    const pipeline = this.pipeline;
    if (this.failed || !pipeline)
      return this.fallback(source, config, time, delta, hasHistory, previous);

    const topologyKey = visualConfigTopologyKey(config);
    if (topologyKey !== this.topologyKey) {
      this.topologyKey = topologyKey;
      pipeline.ensureTopology(config.system, config.tuning, width, height);
    }
    pipeline.uploadSource(source, width, height);
    pipeline.render({
      config,
      time,
      delta,
      hasHistory,
      canvasWidth: width,
      canvasHeight: height,
    });
    this.lastTime = time;
    return output;
  }

  private fallback(
    source: HTMLCanvasElement,
    config: VisualConfig,
    time: number,
    delta: number,
    hasHistory: boolean,
    previous: HTMLCanvasElement,
  ) {
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
    if (!scratchCtx) return source;
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.clearRect(0, 0, width, height);
    scratchCtx.drawImage(processed, 0, 0, width, height);

    this.fallbackHistory.width = processed.width;
    this.fallbackHistory.height = processed.height;
    this.fallbackHistory.getContext('2d')?.drawImage(processed, 0, 0);

    previous.width = width;
    previous.height = height;
    const target = previous.getContext('2d');
    if (!target) return source;
    target.clearRect(0, 0, width, height);
    target.drawImage(this.scratch, 0, 0);
    this.lastTime = time;
    return previous;
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
    this.topologyKey = '';
    this.failed = false;
    this.reset();
  }
}
