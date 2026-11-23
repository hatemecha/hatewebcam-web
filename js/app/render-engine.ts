export type RenderMode = 'preview' | 'mobile' | 'recording' | 'export';
export type BufferMode = 'preview' | 'recording' | 'export' | 'capture';

export interface RenderProfile {
  maxPixels: number;
  detectorInterval: number;
  detectorIntervalMs: number;
  faceAnalysisMaxEdge: number;
  overlayOnly?: boolean;
  quality: 'fast' | 'low' | 'best';
}

export const RENDER_PROFILES: Readonly<Record<RenderMode, RenderProfile>> =
  Object.freeze({
    preview: Object.freeze({
      maxPixels: 1280 * 720,
      detectorInterval: 33,
      detectorIntervalMs: 33,
      faceAnalysisMaxEdge: 640,
      quality: 'fast',
    }),
    mobile: Object.freeze({
      maxPixels: 960 * 540,
      detectorInterval: 66,
      detectorIntervalMs: 66,
      faceAnalysisMaxEdge: 480,
      quality: 'low',
    }),
    recording: Object.freeze({
      maxPixels: Number.POSITIVE_INFINITY,
      // Keep overlays alive, but do not run FaceMesh every camera frame.
      detectorInterval: 100,
      detectorIntervalMs: 100,
      faceAnalysisMaxEdge: 480,
      quality: 'fast',
    }),
    export: Object.freeze({
      maxPixels: Number.POSITIVE_INFINITY,
      detectorInterval: 0,
      detectorIntervalMs: 0,
      faceAnalysisMaxEdge: 960,
      quality: 'best',
    }),
  });

type CanvasKey =
  | 'recordingCanvas'
  | 'recordingEnhancerCanvas'
  | 'postFxCanvas'
  | 'captureFxCanvas'
  | 'recordingFxCanvas';
type CtxKey =
  | 'recordingCtx'
  | 'recordingEnhancerCtx'
  | 'postFxCtx'
  | 'captureFxCtx'
  | 'recordingFxCtx';

export interface RenderFrameHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  renderProcessedFrame(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    mode: string,
  ): void;
  renderSourceFrameBuffer(enhancer: boolean, mode: BufferMode): void;
}

export interface RenderEngineOptions {
  createCanvas?: () => HTMLCanvasElement;
}

export class RenderEngine {
  createCanvas: () => HTMLCanvasElement;
  recordingCanvas: HTMLCanvasElement | null = null;
  recordingCtx: CanvasRenderingContext2D | null = null;
  recordingEnhancerCanvas: HTMLCanvasElement | null = null;
  recordingEnhancerCtx: CanvasRenderingContext2D | null = null;
  postFxCanvas: HTMLCanvasElement | null = null;
  postFxCtx: CanvasRenderingContext2D | null = null;
  captureFxCanvas: HTMLCanvasElement | null = null;
  captureFxCtx: CanvasRenderingContext2D | null = null;
  recordingFxCanvas: HTMLCanvasElement | null = null;
  recordingFxCtx: CanvasRenderingContext2D | null = null;

  constructor({
    createCanvas = () => document.createElement('canvas'),
  }: RenderEngineOptions = {}) {
    this.createCanvas = createCanvas;
  }

  getProfile(mode: string = 'preview'): RenderProfile {
    return (
      RENDER_PROFILES[mode as RenderMode] ||
      (RENDER_PROFILES.preview as RenderProfile)
    );
  }

  private bufferKeys(prefix: string): { canvasKey: CanvasKey; ctxKey: CtxKey } {
    const map: Record<string, { canvasKey: CanvasKey; ctxKey: CtxKey }> = {
      recording: { canvasKey: 'recordingCanvas', ctxKey: 'recordingCtx' },
      recordingEnhancer: {
        canvasKey: 'recordingEnhancerCanvas',
        ctxKey: 'recordingEnhancerCtx',
      },
      postFx: { canvasKey: 'postFxCanvas', ctxKey: 'postFxCtx' },
      captureFx: { canvasKey: 'captureFxCanvas', ctxKey: 'captureFxCtx' },
      recordingFx: { canvasKey: 'recordingFxCanvas', ctxKey: 'recordingFxCtx' },
    };
    const keys = map[prefix];
    if (!keys) throw new Error(`Unknown render buffer: ${prefix}`);
    return keys;
  }

  ensureCanvas(
    prefix: string,
    { willReadFrequently = false }: { willReadFrequently?: boolean } = {},
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const { canvasKey, ctxKey } = this.bufferKeys(prefix);
    let canvas = this[canvasKey];
    if (!canvas) {
      canvas = this.createCanvas();
      this[canvasKey] = canvas;
    }
    let ctx = this[ctxKey];
    if (!ctx) {
      ctx = canvas.getContext('2d', { willReadFrequently });
      this[ctxKey] = ctx;
    }
    if (!ctx) throw new Error(`2D context unavailable for ${prefix}`);
    return { canvas, ctx };
  }

  resizeCanvas(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    if (canvas.width !== safeWidth || canvas.height !== safeHeight) {
      canvas.width = safeWidth;
      canvas.height = safeHeight;
    }
    return canvas;
  }

  ensureRecordingCanvas(width: number, height: number): HTMLCanvasElement {
    const { canvas } = this.ensureCanvas('recording');
    return this.resizeCanvas(canvas, width, height);
  }

  ensureRecordingEnhancerBuffer(
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const { canvas } = this.ensureCanvas('recordingEnhancer');
    return this.resizeCanvas(canvas, width, height);
  }

  ensurePostFxBuffer(
    mode: BufferMode,
    width: number,
    height: number,
    scale: number,
  ): {
    pw: number;
    ph: number;
    fxCanvas: HTMLCanvasElement;
    fxCtx: CanvasRenderingContext2D;
  } {
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

  renderFrame({
    mode = 'preview',
    enhancer = false,
    app,
  }: {
    mode?: BufferMode;
    enhancer?: boolean;
    app?: RenderFrameHost;
  } = {}): void {
    if (!app) return;
    if (mode === 'preview') {
      app.renderProcessedFrame(app.canvas, app.ctx, mode);
      return;
    }
    app.renderSourceFrameBuffer(enhancer, mode);
  }
}
