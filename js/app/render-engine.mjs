export const RENDER_PROFILES = Object.freeze({
  preview: Object.freeze({
    maxPixels: 1280 * 720,
    detectorInterval: 33,
    detectorIntervalMs: 33,
    quality: 'fast',
  }),
  mobile: Object.freeze({
    maxPixels: 960 * 540,
    detectorInterval: 66,
    detectorIntervalMs: 66,
    quality: 'low',
  }),
  recording: Object.freeze({
    maxPixels: Number.POSITIVE_INFINITY,
    detectorInterval: 33,
    detectorIntervalMs: 33,
    quality: 'best',
  }),
  export: Object.freeze({
    maxPixels: Number.POSITIVE_INFINITY,
    detectorInterval: 0,
    detectorIntervalMs: 0,
    quality: 'best',
  }),
});

export class RenderEngine {
  constructor({ createCanvas = () => document.createElement('canvas') } = {}) {
    this.createCanvas = createCanvas;
    this.recordingCanvas = null;
    this.recordingCtx = null;
    this.recordingEnhancerCanvas = null;
    this.recordingEnhancerCtx = null;
    this.postFxCanvas = null;
    this.postFxCtx = null;
    this.captureFxCanvas = null;
    this.captureFxCtx = null;
    this.recordingFxCanvas = null;
    this.recordingFxCtx = null;
  }

  attachLegacyAccessors(target) {
    [
      'recordingCanvas',
      'recordingCtx',
      'recordingEnhancerCanvas',
      'recordingEnhancerCtx',
      'postFxCanvas',
      'postFxCtx',
      'captureFxCanvas',
      'captureFxCtx',
      'recordingFxCanvas',
      'recordingFxCtx',
    ].forEach((key) => {
      Object.defineProperty(target, key, {
        configurable: true,
        get: () => this[key],
        set: (value) => {
          this[key] = value;
        },
      });
    });
  }

  getProfile(mode = 'preview') {
    return RENDER_PROFILES[mode] || RENDER_PROFILES.preview;
  }

  ensureCanvas(prefix, { willReadFrequently = false } = {}) {
    const canvasKey = `${prefix}Canvas`;
    const ctxKey = `${prefix}Ctx`;
    if (!this[canvasKey]) {
      this[canvasKey] = this.createCanvas();
      this[ctxKey] = this[canvasKey].getContext('2d', { willReadFrequently });
    }
    return { canvas: this[canvasKey], ctx: this[ctxKey] };
  }

  resizeCanvas(canvas, width, height) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    if (canvas.width !== safeWidth || canvas.height !== safeHeight) {
      canvas.width = safeWidth;
      canvas.height = safeHeight;
    }
    return canvas;
  }

  ensureRecordingCanvas(width, height) {
    const { canvas } = this.ensureCanvas('recording');
    return this.resizeCanvas(canvas, width, height);
  }

  ensureRecordingEnhancerBuffer(width, height) {
    const { canvas } = this.ensureCanvas('recordingEnhancer');
    return this.resizeCanvas(canvas, width, height);
  }

  ensurePostFxBuffer(mode, width, height, scale) {
    const prefix =
      mode === 'recording' || mode === 'export'
        ? 'recordingFx'
        : mode === 'capture'
          ? 'captureFx'
          : 'postFx';
    const { canvas, ctx } = this.ensureCanvas(prefix, {
      willReadFrequently: true,
    });
    const nextWidth = Math.max(320, Math.round(width * scale));
    const nextHeight = Math.max(180, Math.round(height * scale));
    this.resizeCanvas(canvas, nextWidth, nextHeight);
    return {
      pw: canvas.width,
      ph: canvas.height,
      fxCanvas: canvas,
      fxCtx: ctx,
    };
  }

  renderFrame({ mode = 'preview', enhancer = false, app } = {}) {
    if (!app) return;
    if (mode === 'preview') {
      app.renderProcessedFrame(app.canvas, app.ctx, mode);
      return;
    }
    app.renderSourceFrameBuffer(enhancer, mode);
  }
}
